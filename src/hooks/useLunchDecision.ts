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

// Check if we're in mock mode (localhost without Google Maps loaded)
const isMockMode = () => {
  const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  const hasGoogle = !!(window as any).google?.maps;
  // Use mock mode on localhost if Google Maps isn't available, or if URL has ?mock=true
  const forceMock = new URLSearchParams(window.location.search).get('mock') === 'true';
  return forceMock || (isLocalhost && !hasGoogle);
};

// Mock restaurant data for testing
const MOCK_RESULTS: FinalResult[] = [
  {
    place_id: 'mock-1',
    name: 'Curry Mitte',
    rating: 4.8,
    user_ratings_total: 1712,
    vicinity: 'Invalidenstraße 123, Berlin',
    price_level: 2,
    geometry: { location: { lat: 52.5314, lng: 13.3845 } },
    opening_hours: { 
      open_now: true,
      weekday_text: [
        'Monday: 11:00 AM – 10:00 PM',
        'Tuesday: 11:00 AM – 10:00 PM',
        'Wednesday: 11:00 AM – 10:00 PM',
        'Thursday: 11:00 AM – 10:00 PM',
        'Friday: 11:00 AM – 11:00 PM',
        'Saturday: 12:00 PM – 11:00 PM',
        'Sunday: 12:00 PM – 9:00 PM'
      ]
    },
    ai_reason: "At 4.8 stars with 1,712 reviews, this is Berlin's legendary currywurst spot. Multiple recent reviews call it 'the best currywurst in Berlin' with 'delicious sausages' and 'the best potato salad.' Perfect hearty German comfort food, and they have gluten-free options with their vegan sausage. Just 12 minutes away.",
    recommended_dish: 'Currywurst',
    is_cash_only: false,
    cash_warning_msg: null,
    walking_time_text: '12 mins',
    walking_time_value: 720,
  },
  {
    place_id: 'mock-2',
    name: 'Aapka - Indian Restaurant Berlin',
    rating: 4.3,
    user_ratings_total: 1441,
    vicinity: 'Torstraße 89, Berlin',
    price_level: 3,
    geometry: { location: { lat: 52.5289, lng: 13.4012 } },
    opening_hours: { 
      open_now: true,
      weekday_text: [
        'Monday: 12:00 PM – 11:00 PM',
        'Tuesday: 12:00 PM – 11:00 PM',
        'Wednesday: 12:00 PM – 11:00 PM',
        'Thursday: 12:00 PM – 11:00 PM',
        'Friday: 12:00 PM – 11:30 PM',
        'Saturday: 12:00 PM – 11:30 PM',
        'Sunday: 12:00 PM – 10:00 PM'
      ]
    },
    ai_reason: "Their Butter Chicken is a standout - one regular calls it 'excellent' and 'always orders it.' At 4.3 stars with 1,441 reviews, this delivers authentic Indian flavors in a cozy setting. The naan bread gets special praise for being fresh and fluffy.",
    recommended_dish: 'Butter Chicken with Garlic Naan',
    is_cash_only: false,
    cash_warning_msg: null,
    walking_time_text: '10 mins',
    walking_time_value: 600,
  },
  {
    place_id: 'mock-3',
    name: 'Monsieur Vuong',
    rating: 4.2,
    user_ratings_total: 3892,
    vicinity: 'Alte Schönhauser Str. 46, Berlin',
    price_level: 2,
    geometry: { location: { lat: 52.5267, lng: 13.4089 } },
    opening_hours: { 
      open_now: true,
      weekday_text: [
        'Monday: 12:00 PM – 10:00 PM',
        'Tuesday: 12:00 PM – 10:00 PM',
        'Wednesday: 12:00 PM – 10:00 PM',
        'Thursday: 12:00 PM – 10:00 PM',
        'Friday: 12:00 PM – 10:30 PM',
        'Saturday: 12:00 PM – 10:30 PM',
        'Sunday: 12:00 PM – 10:00 PM'
      ]
    },
    ai_reason: "Berlin institution for Vietnamese food. The pho is legendary - 'best pho outside Vietnam' according to multiple reviews. Expect a queue at peak times, but the turnover is fast. Fresh herbs and excellent broth make this worth the wait.",
    recommended_dish: 'Pho Bo (Beef Pho)',
    is_cash_only: true,
    cash_warning_msg: 'Cash only - ATM nearby',
    walking_time_text: '8 mins',
    walking_time_value: 480,
    is_new_opening: false,
  },
  {
    place_id: 'mock-4',
    name: 'Santa Maria',
    rating: 4.5,
    user_ratings_total: 2156,
    vicinity: 'Oranienstraße 170, Berlin',
    price_level: 2,
    geometry: { location: { lat: 52.5012, lng: 13.4234 } },
    opening_hours: { 
      open_now: true,
      weekday_text: [
        'Monday: 6:00 PM – 11:00 PM',
        'Tuesday: 6:00 PM – 11:00 PM',
        'Wednesday: 6:00 PM – 11:00 PM',
        'Thursday: 6:00 PM – 11:00 PM',
        'Friday: 6:00 PM – 12:00 AM',
        'Saturday: 12:00 PM – 12:00 AM',
        'Sunday: 12:00 PM – 11:00 PM'
      ]
    },
    ai_reason: "This Kreuzberg taqueria serves some of the city's most authentic Mexican tacos. The Al Pastor is a revelation - proper spit-roasted pork with pineapple. Small, vibrant space with great energy. Multiple reviews mention 'best tacos in Berlin.'",
    recommended_dish: 'Tacos Al Pastor',
    is_cash_only: false,
    cash_warning_msg: null,
    walking_time_text: '15 mins',
    walking_time_value: 900,
    is_new_opening: true,
  },
  {
    place_id: 'mock-5',
    name: 'The Bowl',
    rating: 4.4,
    user_ratings_total: 1823,
    vicinity: 'Warschauer Str. 33, Berlin',
    price_level: 2,
    geometry: { location: { lat: 52.5078, lng: 13.4498 } },
    opening_hours: { 
      open_now: true,
      weekday_text: [
        'Monday: 11:00 AM – 9:00 PM',
        'Tuesday: 11:00 AM – 9:00 PM',
        'Wednesday: 11:00 AM – 9:00 PM',
        'Thursday: 11:00 AM – 9:00 PM',
        'Friday: 11:00 AM – 9:00 PM',
        'Saturday: 10:00 AM – 9:00 PM',
        'Sunday: 10:00 AM – 9:00 PM'
      ]
    },
    ai_reason: "Perfect for a light, healthy lunch. 100% plant-based bowls packed with flavor. The Buddha Bowl is their signature - quinoa, roasted veggies, tahini dressing. Great for vegetarians and vegans, but even meat-eaters rave about it.",
    recommended_dish: 'Buddha Bowl',
    is_cash_only: false,
    cash_warning_msg: null,
    walking_time_text: '18 mins',
    walking_time_value: 1080,
  },
];

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
   * Mock calculation for testing UI without API keys
   */
  const calculateMock = useCallback(async (preferences: UserPreferences) => {
    setAppState(AppState.PROCESSING);
    clearLogs();
    setProgress(5);

    const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
    const searchTarget = preferences.freestylePrompt || preferences.vibe || 'lunch spots';

    addLog(`[MOCK MODE] SEARCHING FOR ${String(searchTarget).toUpperCase()}...`);
    await delay(600);
    setProgress(15);

    addLog('SCANNING LOCAL RESTAURANT DATABASE...');
    await delay(800);
    setProgress(30);

    addLog('FOUND 47 RESTAURANTS NEARBY...');
    await delay(500);
    setProgress(45);

    addLog('CALCULATING WALKING DISTANCES...');
    await delay(700);
    setProgress(55);

    addLog(`23 PLACES WITHIN ${preferences.walkLimit} WALK...`);
    await delay(600);
    setProgress(65);

    addLog('ANALYZING REVIEWS AND RATINGS...');
    await delay(900);
    setProgress(75);

    addLog('CROSS-REFERENCING WITH USER PREFERENCES...');
    await delay(700);
    setProgress(85);

    addLog('RANKING TOP CANDIDATES...');
    await delay(500);
    setProgress(95);

    addLog('DONE.');
    setProgress(100);

    await delay(500);
    setResults(MOCK_RESULTS);
    setAppState(AppState.RESULTS);
  }, [addLog, clearLogs, setProgress]);

  /**
   * Main calculation function that orchestrates the entire process
   */
  const calculate = useCallback(async (preferences: UserPreferences) => {
    // Use mock mode on localhost without Google Maps or with ?mock=true
    if (isMockMode()) {
      // For mock mode, we just need some coordinates - use Berlin center if not set
      const mockPrefs = {
        ...preferences,
        lat: preferences.lat || 52.52,
        lng: preferences.lng || 13.405,
      };
      return calculateMock(mockPrefs);
    }

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

      // Fetch recently recommended places to add variety (last ~10 searches worth)
      const recentlyRecommended = await SupabaseService.getRecentlyRecommendedIds(50);
      
      // Filter out recently shown restaurants for variety
      // Always prioritize fresh results, but ensure minimum viable pool
      const MIN_CANDIDATES_FOR_AI = 5;
      let candidatesForGemini = sortedCandidates.slice(0, 40);
      
      if (recentlyRecommended.size > 0) {
        const freshCandidates = candidatesForGemini.filter(
          c => !recentlyRecommended.has(c.place_id)
        );
        
        if (freshCandidates.length >= MIN_CANDIDATES_FOR_AI) {
          // Enough fresh candidates - use only fresh ones
          candidatesForGemini = freshCandidates;
          Logger.info('SYSTEM', 'Variety filter applied', {
            freshCount: freshCandidates.length,
            filteredOut: recentlyRecommended.size
          });
        } else if (freshCandidates.length > 0) {
          // Some fresh candidates - prioritize them but pad with least-recently-shown
          const recentlyShownSorted = candidatesForGemini
            .filter(c => recentlyRecommended.has(c.place_id))
            .slice(0, MIN_CANDIDATES_FOR_AI - freshCandidates.length);
          candidatesForGemini = [...freshCandidates, ...recentlyShownSorted];
          Logger.info('SYSTEM', 'Variety filter partial - prioritizing fresh', {
            freshCount: freshCandidates.length,
            paddedWith: recentlyShownSorted.length
          });
        } else {
          Logger.info('SYSTEM', 'No fresh candidates - using best available', {
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
    calculateMock,
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

