import { useState, useCallback } from 'react';
import { useGooglePlaces } from './useGooglePlaces';
import { useDistanceMatrix, PlaceDuration } from './useDistanceMatrix';
import { useTerminalLogs } from './useTerminalLogs';
import { decideLunch, generateLoadingLogs } from '../services/geminiService';
import SupabaseService from '../services/supabaseService';
import Logger from '../utils/logger';
import {
  calculateCandidateScore,
  shuffleArray,
  getWalkConfig,
} from '../utils/lunchAlgorithm';
import {
  AppState,
  UserPreferences,
  GooglePlace,
  GeminiRecommendation,
  FinalResult,
} from '../types';

interface UseLunchDecisionReturn {
  appState: AppState;
  results: FinalResult[];
  logs: ReturnType<typeof useTerminalLogs>['logs'];
  progress: number;
  calculate: (preferences: UserPreferences) => Promise<void>;
  reset: () => void;
}

/**
 * Main orchestration hook for the lunch decision process
 * Combines place search, distance calculation, and AI recommendations
 */
export const useLunchDecision = (): UseLunchDecisionReturn => {
  const [appState, setAppState] = useState<AppState>(AppState.INPUT);
  const [results, setResults] = useState<FinalResult[]>([]);

  const { searchPlaces } = useGooglePlaces();
  const { calculateDistances, filterByDuration, sortByDuration } = useDistanceMatrix();
  const { logs, progress, addLog, clearLogs, setProgress, resetProgress } = useTerminalLogs(appState);

  /**
   * Main calculation function that orchestrates the entire process
   */
  const calculate = useCallback(async (preferences: UserPreferences) => {
    if (!preferences.lat || !preferences.lng || !window.google) {
      return;
    }

    setAppState(AppState.PROCESSING);
    clearLogs();
    setProgress(5);
    Logger.userAction('Search Initiated', { preferences });

    addLog(`ACQUIRING SATELLITE LOCK [${preferences.lat.toFixed(4)}, ${preferences.lng.toFixed(4)}]...`);

    // Start loading wit generation in background
    const loadingWitPromise = generateLoadingLogs(preferences.vibe, preferences.address);

    try {
      const { radius, maxDurationSeconds } = getWalkConfig(preferences.walkLimit);
      addLog(`CALIBRATING SCANNER RADIUS: ${radius}m...`);

      // Search for places
      const vibeLog = preferences.vibe ? preferences.vibe.toUpperCase() : 'CUSTOM DIRECTIVE';
      addLog(`EXECUTING MULTI-VECTOR SEARCH FOR [${vibeLog}]...`);

      const { places, uniqueCount } = await searchPlaces({
        lat: preferences.lat,
        lng: preferences.lng,
        radius,
        vibe: preferences.vibe,
        freestylePrompt: preferences.freestylePrompt,
      });

      if (uniqueCount === 0) {
        Logger.warn('SYSTEM', 'Zero Candidates Found Initial Search');
        throw new Error('ZERO ENTITIES FOUND IN SECTOR.');
      }

      addLog(`DETECTED ${uniqueCount} UNIQUE ENTITIES...`);
      setProgress(30);

      if (places.length === 0) {
        throw new Error('FAILED TO FETCH DETAILS FOR ANY CANDIDATE.');
      }

      // Start showing loading wit
      loadingWitPromise.then(witLogs => {
        witLogs.forEach((log, idx) => {
          setTimeout(() => addLog(log), idx * 1500);
        });
      });

      // Calculate walking distances
      addLog('CALIBRATING WALKING VECTORS...');
      const candidatePool = shuffleArray([...places]).slice(0, 50);

      const { durations } = await calculateDistances({
        origin: { lat: preferences.lat, lng: preferences.lng },
        places: candidatePool,
      });

      setProgress(60);

      // Filter and score candidates
      const allMeasuredCandidates = candidatePool.filter(p => p.geometry?.location);
      if (allMeasuredCandidates.length === 0) {
        throw new Error('NO VIABLE CANDIDATES FOUND AFTER PROXIMITY ANALYSIS.');
      }

      addLog(`APPLYING STRICT PROXIMITY FILTER: <= ${preferences.walkLimit} WALK...`);

      // Adaptive filtering logic
      let candidatesWithinRange = filterByDuration(allMeasuredCandidates, durations, maxDurationSeconds);

      if (candidatesWithinRange.length === 0) {
        addLog('WARNING: STRICT FILTER YIELDED 0 RESULTS. EXPANDING HORIZON...');
        Logger.warn('SYSTEM', 'Expanding Proximity Search', { originalLimit: maxDurationSeconds });
        candidatesWithinRange = filterByDuration(allMeasuredCandidates, durations, maxDurationSeconds * 1.5);
      }

      if (candidatesWithinRange.length === 0) {
        addLog('WARNING: NO RESULTS IN RANGE. RETRIEVING CLOSEST ENTITIES...');
        Logger.warn('SYSTEM', 'Emergency Fallback Triggered', { count: 5 });
        candidatesWithinRange = sortByDuration(allMeasuredCandidates, durations).slice(0, 5);
      }

      addLog(`PROXIMITY FILTER COMPLETE. ${candidatesWithinRange.length} CANDIDATES SELECTED.`);

      if (candidatesWithinRange.length < 5 && candidatesWithinRange.length > 0) {
        addLog('WARNING: LIMITED CANDIDATE POOL.');
      }

      // Rank candidates
      addLog('RANKING CANDIDATES...');
      await new Promise(res => setTimeout(res, 1000));

      const sortedCandidates = candidatesWithinRange.sort((a, b) => {
        const durationA = durations.get(a.place_id)?.value;
        const durationB = durations.get(b.place_id)?.value;
        const scoreA = calculateCandidateScore(a, preferences.price, durationA, maxDurationSeconds);
        const scoreB = calculateCandidateScore(b, preferences.price, durationB, maxDurationSeconds);
        return scoreB - scoreA;
      });

      const candidatesForGemini = sortedCandidates.slice(0, 40);

      if (candidatesForGemini.length === 0) {
        throw new Error('SYSTEM UNABLE TO LOCATE VIABLE TARGETS.');
      }

      // Get AI recommendations
      addLog('ENGAGING NEURAL CORE (GEMINI-3.0-PREVIEW)...');

      const recommendations = await decideLunch(
        candidatesForGemini,
        preferences.vibe,
        preferences.price,
        preferences.noCash,
        preferences.address,
        preferences.dietaryRestrictions,
        preferences.freestylePrompt
      );

      let finalRecommendations: GeminiRecommendation[] = recommendations;

      // Backfill if needed
      if (!recommendations || recommendations.length < 3) {
        addLog('SUPPLEMENTING RESULTS WITH ALGORITHMIC BACKFILL...');
        const needed = 3 - (recommendations?.length || 0);
        const recommendedPlaceIds = new Set(recommendations.map(r => r.place_id));
        const fallbackPool = candidatesForGemini
          .filter(p => !recommendedPlaceIds.has(p.place_id))
          .sort((a, b) => (b.rating || 0) - (a.rating || 0));

        const fallbackRecs: GeminiRecommendation[] = fallbackPool.slice(0, needed).map(p => {
          // Try to extract a specific dish from reviews if available
          const reviewText = p.reviews?.find(r => r.text && r.text.length > 30)?.text || '';
          const dishMatch = reviewText.match(/(?:the |their |try the |order the |loved the |best |amazing )([A-Z][a-z]+(?:\s+[A-Z]?[a-z]+){0,3})/i);
          const extractedDish = dishMatch?.[1];
          
          return {
            place_id: p.place_id,
            ai_reason: p.editorial_summary?.overview ||
              `A highly-rated alternative (${p.rating || 'N/A'}/5 from ${p.user_ratings_total || 0} reviews).`,
            recommended_dish: extractedDish || 'Chef\'s recommendation (ask staff)',
            is_cash_only: p.payment_options?.accepts_cash_only || false,
            cash_warning_msg: p.payment_options?.accepts_cash_only
              ? 'Note: This location may be cash-only.'
              : null,
            is_new_opening: (p.user_ratings_total || 0) < 50
          };
        });

        finalRecommendations = [...finalRecommendations, ...fallbackRecs];
      }

      if (finalRecommendations.length === 0) {
        throw new Error('POST-PROCESSING FAILED TO YIELD RESULTS.');
      }

      // Finalize results
      addLog('PERMUTATING OPTIONS...');
      const finalSelection = shuffleArray(finalRecommendations).slice(0, 3);

      setProgress(100);
      addLog('OPTIMAL SOLUTION CALCULATED.');
      Logger.info('SYSTEM', 'Calculation Complete', {
        resultCount: finalSelection.length,
        results: finalSelection.map(r => r.place_id)
      });

      // Build final results with walking times
      const finalResults: FinalResult[] = [];
      finalSelection.forEach((rec) => {
        const original = candidatesForGemini.find(p => p.place_id === rec.place_id);
        if (original) {
          const duration = durations.get(rec.place_id) || { text: 'N/A', value: 0 };
          finalResults.push({
            ...original,
            ...rec,
            walking_time_text: duration.text,
            walking_time_value: duration.value
          });
        }
      });

      // Save search to history
      await SupabaseService.saveSearch(preferences, finalResults.length);

      setTimeout(() => {
        setResults(finalResults);
        setAppState(AppState.RESULTS);
      }, 500);

    } catch (error) {
      console.error(error);
      Logger.error('SYSTEM', 'App Calculation Loop Failed', error);
      addLog(`CRITICAL ERROR: ${error instanceof Error ? error.message : 'Unknown'}`);
      addLog('SYSTEM FAILURE. RESETTING...');
      setTimeout(() => setAppState(AppState.INPUT), 5000);
      setProgress(0);
    }
  }, [
    searchPlaces,
    calculateDistances,
    filterByDuration,
    sortByDuration,
    addLog,
    clearLogs,
    setProgress,
  ]);

  /**
   * Reset the state to start fresh
   */
  const reset = useCallback(() => {
    setAppState(AppState.INPUT);
    setResults([]);
    clearLogs();
    resetProgress();
    Logger.userAction('System Reset');
  }, [clearLogs, resetProgress]);

  return {
    appState,
    results,
    logs,
    progress,
    calculate,
    reset,
  };
};

export default useLunchDecision;

