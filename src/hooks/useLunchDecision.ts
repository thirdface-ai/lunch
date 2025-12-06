import { useState, useCallback } from 'react';
import { useGooglePlaces } from './useGooglePlaces';
import { useDistanceMatrix } from './useDistanceMatrix';
import { useTerminalLogs } from './useTerminalLogs';
import { decideLunch, curateAllCandidates, HaikuCurationResult } from '../services/aiService';
import SupabaseService from '../services/supabaseService';
import Logger from '../utils/logger';
import {
  calculateCandidateScore,
  shuffleArray,
  getWalkConfig,
  getOpenStatusScore,
} from '../utils/lunchAlgorithm';
import {
  AppState,
  UserPreferences,
  FinalResult,
  CuratedReviewData,
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
  const { logs, progress, addLog, clearLogs, setProgress, resetProgress, startDynamicMessages } = useTerminalLogs(appState);

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

    // Start generating dynamic funny messages in background (non-blocking)
    startDynamicMessages(preferences.vibe, preferences.address);

    addLog(`ACQUIRING SATELLITE LOCK [${preferences.lat.toFixed(4)}, ${preferences.lng.toFixed(4)}]...`);

    // Track total pipeline time
    const pipelineStartTime = performance.now();
    
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

      // Prepare candidate pool
      const candidatePool = shuffleArray([...places]).slice(0, 50);
      
      // Track timing for analytics
      const placesSearchDuration = Math.round(performance.now() - pipelineStartTime);

      // === PARALLEL EXECUTION: Haiku + Distance Matrix ===
      addLog('INITIATING PARALLEL ANALYSIS...');
      
      const parallelStartTime = performance.now();
      
      // Run Haiku curation and distance matrix in parallel
      const [haikuResult, distanceResult] = await Promise.all([
        // Haiku pre-processes ALL candidates for vibe scoring and dish extraction
        curateAllCandidates(
          candidatePool,
          preferences.vibe,
          preferences.freestylePrompt,
          addLog
        ),
        // Distance matrix calculates walking times
        calculateDistances({
          origin: { lat: preferences.lat, lng: preferences.lng },
          places: candidatePool,
        })
      ]);

      const { durations } = distanceResult;
      const curatedData: Map<string, CuratedReviewData> = haikuResult.curatedData;
      const haikuSuccess = haikuResult.success;
      const haikuDuration = haikuResult.durationMs;
      const distanceMatrixDuration = Math.round(performance.now() - parallelStartTime);

      Logger.info('SYSTEM', 'Parallel analysis complete', {
        haikuSuccess,
        haikuDuration,
        curatedCount: curatedData.size,
        durationsCount: durations.size
      });

      setProgress(60);

      // Filter and score candidates
      const allMeasuredCandidates = candidatePool.filter(p => p.geometry?.location);
      if (allMeasuredCandidates.length === 0) {
        throw new Error('NO VIABLE CANDIDATES FOUND AFTER PROXIMITY ANALYSIS.');
      }

      addLog(`APPLYING STRICT PROXIMITY FILTER: <= ${preferences.walkLimit} WALK...`);

      // Adaptive filtering logic - filter by distance only, not by open status
      let candidatesWithinRange = filterByDuration(allMeasuredCandidates, durations, maxDurationSeconds);
      
      // Analyze open status for logging (but don't filter)
      addLog('ANALYZING OPERATIONAL STATUS...');
      let openCount = 0;
      let closedCount = 0;
      let unknownCount = 0;
      candidatesWithinRange.forEach(place => {
        const duration = durations.get(place.place_id);
        const status = getOpenStatusScore(place, duration?.value).status;
        if (status === 'open' || status === 'opens_soon') openCount++;
        else if (status === 'closed') closedCount++;
        else unknownCount++;
      });
      
      const dayName = new Date().toLocaleDateString('en-US', { weekday: 'long' });
      addLog(`STATUS CHECK (${dayName.toUpperCase()}): ${openCount} OPEN, ${closedCount} CLOSED, ${unknownCount} UNKNOWN`);
      addLog('NOTE: CLOSED ESTABLISHMENTS DEPRIORITIZED BUT INCLUDED.');

      if (candidatesWithinRange.length === 0) {
        addLog('WARNING: STRICT FILTER YIELDED 0 RESULTS. EXPANDING HORIZON...');
        Logger.warn('SYSTEM', 'Expanding Proximity Search', { originalLimit: maxDurationSeconds });
        candidatesWithinRange = filterByDuration(allMeasuredCandidates, durations, maxDurationSeconds * 1.5);
      }

      if (candidatesWithinRange.length === 0) {
        addLog('WARNING: NO RESULTS IN RANGE. RETRIEVING CLOSEST ENTITIES...');
        Logger.warn('SYSTEM', 'Emergency Fallback Triggered', { count: 5 });
        const sortedByDistance = sortByDuration(allMeasuredCandidates, durations);
        candidatesWithinRange = sortedByDistance.slice(0, 5);
      }

      addLog(`PROXIMITY FILTER COMPLETE. ${candidatesWithinRange.length} CANDIDATES SELECTED.`);

      if (candidatesWithinRange.length < 5 && candidatesWithinRange.length > 0) {
        addLog('WARNING: LIMITED CANDIDATE POOL.');
      }

      // Rank candidates using Haiku curation data
      addLog(haikuSuccess ? 'RANKING WITH HAIKU INSIGHTS...' : 'RANKING CANDIDATES...');

      const sortedCandidates = candidatesWithinRange.sort((a, b) => {
        const durationA = durations.get(a.place_id)?.value;
        const durationB = durations.get(b.place_id)?.value;
        const curationA = curatedData.get(a.place_id);
        const curationB = curatedData.get(b.place_id);
        const scoreA = calculateCandidateScore(a, preferences.price, durationA, maxDurationSeconds, curationA);
        const scoreB = calculateCandidateScore(b, preferences.price, durationB, maxDurationSeconds, curationB);
        return scoreB - scoreA;
      });

      // Fetch recently recommended places to add variety
      const recentlyRecommended = await SupabaseService.getRecentlyRecommendedIds(15);
      
      // Filter out recently shown restaurants for variety (but keep minimum pool)
      const MIN_CANDIDATES_FOR_VARIETY = 8;
      let candidatesForGemini = sortedCandidates.slice(0, 40);
      
      if (recentlyRecommended.size > 0) {
        const freshCandidates = candidatesForGemini.filter(
          c => !recentlyRecommended.has(c.place_id)
        );
        
        // Only apply filter if we still have enough candidates
        if (freshCandidates.length >= MIN_CANDIDATES_FOR_VARIETY) {
          const filteredCount = candidatesForGemini.length - freshCandidates.length;
          if (filteredCount > 0) {
            addLog(`VARIETY FILTER: EXCLUDING ${filteredCount} RECENTLY SHOWN...`);
          }
          candidatesForGemini = freshCandidates;
        } else {
          Logger.info('SYSTEM', 'Skipping variety filter - limited candidate pool', {
            freshCount: freshCandidates.length,
            recentCount: recentlyRecommended.size
          });
        }
      }

      if (candidatesForGemini.length === 0) {
        throw new Error('SYSTEM UNABLE TO LOCATE VIABLE TARGETS.');
      }

      // Get AI recommendations via enhanced pipeline with Haiku pre-curation
      addLog('ENGAGING NEURAL ANALYSIS CORE...');

      const decisionResult = await decideLunch(
        candidatesForGemini,
        preferences.vibe,
        preferences.price,
        preferences.noCash,
        preferences.address,
        preferences.dietaryRestrictions,
        durations,           // Pass walking times
        curatedData,         // Pass Haiku curated data
        preferences.freestylePrompt,
        addLog
      );

      const { recommendations, durationMs: mainModelDuration } = decisionResult;

      // NO GENERIC FALLBACKS - Quality over quantity
      if (!recommendations || recommendations.length === 0) {
        throw new Error('DEEP ANALYSIS PIPELINE YIELDED NO VIABLE RECOMMENDATIONS.');
      }

      // Take up to 5 results (quality over quantity - no padding with generic fallbacks)
      const finalSelection = recommendations.slice(0, 5);
      
      // Calculate total pipeline time
      const totalDuration = Math.round(performance.now() - pipelineStartTime);

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
      
      // Save recommended places for variety tracking (non-blocking)
      SupabaseService.saveRecommendedPlaces(finalResults);
      
      // Log pipeline timing to Supabase (non-blocking)
      SupabaseService.logPipelineTiming({
        total_duration_ms: totalDuration,
        haiku_duration_ms: haikuDuration,
        main_model_duration_ms: mainModelDuration,
        places_search_duration_ms: placesSearchDuration,
        distance_matrix_duration_ms: distanceMatrixDuration,
        haiku_model: 'anthropic/claude-haiku-4.5',
        main_model: 'openrouter/auto',
        candidate_count: candidatesForGemini.length,
        result_count: finalResults.length,
        haiku_success: haikuSuccess,
        // User context for debugging
        user_vibe: preferences.vibe || null,
        user_freestyle_prompt: preferences.freestylePrompt || null,
        // Note: Full prompts are generated in aiService - these track user inputs
        haiku_prompt: null, // Could be added if needed for deeper debugging
        main_model_prompt: null,
      });
      
      Logger.info('SYSTEM', 'Pipeline Timing', {
        totalMs: totalDuration,
        haikuMs: haikuDuration,
        mainModelMs: mainModelDuration,
        haikuSuccess
      });

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
    startDynamicMessages,
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

