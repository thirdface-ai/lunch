import { useState, useCallback } from 'react';
import { useGooglePlaces } from './useGooglePlaces';
import { useDistanceMatrix } from './useDistanceMatrix';
import { useTerminalLogs } from './useTerminalLogs';
import { decideLunch } from '../services/geminiService';
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
      addLog(`FILTERED TO ${places.length} VERIFIED FOOD ESTABLISHMENTS...`);
      setProgress(30);

      if (places.length === 0) {
        throw new Error('NO FOOD ESTABLISHMENTS FOUND. TRY A DIFFERENT LOCATION OR VIBE.');
      }

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

      // Get AI recommendations via multi-stage deep analysis pipeline
      addLog('ENGAGING MULTI-STAGE NEURAL CORE (GEMINI-3-PRO-PREVIEW)...');

      const recommendations = await decideLunch(
        candidatesForGemini,
        preferences.vibe,
        preferences.price,
        preferences.noCash,
        preferences.address,
        preferences.dietaryRestrictions,
        preferences.freestylePrompt,
        addLog // Pass the log callback for real-time personalized updates
      );

      // NO GENERIC FALLBACKS - Quality over quantity
      // The multi-stage pipeline handles all analysis including fallbacks internally
      // We trust the AI to return quality results or nothing
      if (!recommendations || recommendations.length === 0) {
        throw new Error('DEEP ANALYSIS PIPELINE YIELDED NO VIABLE RECOMMENDATIONS.');
      }

      // Take up to 5 results (quality over quantity - no padding with generic fallbacks)
      const finalSelection = recommendations.slice(0, 5);

      setProgress(100);
      addLog(`DEEP ANALYSIS COMPLETE. ${finalSelection.length} OPTIMAL SOLUTIONS CALCULATED.`);
      Logger.info('SYSTEM', 'Multi-Stage Pipeline Complete', {
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

