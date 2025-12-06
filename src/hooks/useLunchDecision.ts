import { useState, useCallback } from 'react';
import { useGooglePlaces } from './useGooglePlaces';
import { useDistanceMatrix } from './useDistanceMatrix';
import { useTerminalLogs } from './useTerminalLogs';
import { decideLunch } from '../services/aiService';
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

    // Start generating dynamic contextual messages in background (non-blocking)
    startDynamicMessages(preferences.vibe, preferences.address, preferences.freestylePrompt);

    // Initial log - short and punchy
    const searchTarget = preferences.freestylePrompt || preferences.vibe || 'lunch spots';
    addLog(`SEARCHING FOR ${String(searchTarget).toUpperCase()}...`);

    try {
      const { radius, maxDurationSeconds } = getWalkConfig(preferences.walkLimit);
      setProgress(10);

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

      addLog(`FOUND ${places.length} RESTAURANTS NEARBY...`);
      setProgress(25);

      if (places.length === 0) {
        throw new Error('NO FOOD ESTABLISHMENTS FOUND. TRY A DIFFERENT LOCATION OR VIBE.');
      }

      // Calculate walking distances
      const candidatePool = shuffleArray([...places]).slice(0, 50);
      setProgress(35);

      const { durations } = await calculateDistances({
        origin: { lat: preferences.lat, lng: preferences.lng },
        places: candidatePool,
      });

      addLog('CALCULATING WALKING DISTANCES...');
      setProgress(45);

      // Filter and score candidates
      const allMeasuredCandidates = candidatePool.filter(p => p.geometry?.location);
      if (allMeasuredCandidates.length === 0) {
        throw new Error('NO VIABLE CANDIDATES FOUND AFTER PROXIMITY ANALYSIS.');
      }

      // Adaptive filtering logic - filter by distance only, not by open status
      let candidatesWithinRange = filterByDuration(allMeasuredCandidates, durations, maxDurationSeconds);
      
      // Analyze open status silently (but don't filter)
      let openCount = 0;
      candidatesWithinRange.forEach(place => {
        const duration = durations.get(place.place_id);
        const status = getOpenStatusScore(place, duration?.value).status;
        if (status === 'open' || status === 'opens_soon') openCount++;
      });
      
      addLog(`${candidatesWithinRange.length} PLACES WITHIN ${preferences.walkLimit} WALK...`);
      setProgress(55);

      if (candidatesWithinRange.length === 0) {
        Logger.warn('SYSTEM', 'Expanding Proximity Search', { originalLimit: maxDurationSeconds });
        candidatesWithinRange = filterByDuration(allMeasuredCandidates, durations, maxDurationSeconds * 1.5);
      }

      if (candidatesWithinRange.length === 0) {
        Logger.warn('SYSTEM', 'Emergency Fallback Triggered', { count: 5 });
        const sortedByDistance = sortByDuration(allMeasuredCandidates, durations);
        candidatesWithinRange = sortedByDistance.slice(0, 5);
      }

      setProgress(60);

      // Rank candidates silently

      const sortedCandidates = candidatesWithinRange.sort((a, b) => {
        const durationA = durations.get(a.place_id)?.value;
        const durationB = durations.get(b.place_id)?.value;
        const scoreA = calculateCandidateScore(a, preferences.price, durationA, maxDurationSeconds);
        const scoreB = calculateCandidateScore(b, preferences.price, durationB, maxDurationSeconds);
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

      // Get AI recommendations - this is where the magic happens
      setProgress(65);
      addLog('ANALYZING REVIEWS AND RATINGS...');

      const recommendations = await decideLunch(
        candidatesForGemini,
        durations,
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
      addLog('DONE.');
      Logger.info('SYSTEM', 'Analysis Complete', {
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

