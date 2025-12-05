
import React, { useState, useCallback, useEffect } from 'react';
import ControlPanel from './components/ControlPanel';
import TerminalLog from './components/TerminalLog';
import ResultsView from './components/ResultsView';
import ErrorBoundary from './components/ErrorBoundary';
import { decideLunch, generateLoadingLogs } from './services/geminiService';
import { calculateCandidateScore, getSearchQueriesForVibe } from './utils/lunchAlgorithm';
import Logger from './utils/logger';
import { 
  AppState, 
  TransportMode, 
  HungerVibe, 
  UserPreferences, 
  TerminalLog as LogType, 
  GooglePlace,
  GeminiRecommendation,
  FinalResult,
  WalkLimit,
  ThemeMode
} from './types';


const AppContent: React.FC = () => {
  const [appState, setAppState] = useState<AppState>(AppState.INPUT);
  const [logs, setLogs] = useState<LogType[]>([]);
  const [progress, setProgress] = useState(0); 
  const [preferences, setPreferences] = useState<UserPreferences>({
    address: '',
    lat: null,
    lng: null,
    mode: TransportMode.WALK,
    vibe: HungerVibe.GRAB_AND_GO,
    price: null, // Default to no budget constraint
    walkLimit: WalkLimit.FIFTEEN_MIN,
    noCash: false,
    theme: ThemeMode.LIGHT,
    dietaryRestrictions: [],
    freestylePrompt: '',
  });
  const [results, setResults] = useState<FinalResult[]>([]);
  
  useEffect(() => {
    if (preferences.theme === ThemeMode.DARK) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [preferences.theme]);
  
  useEffect(() => {
    let interval: any;
    if (appState === AppState.PROCESSING) {
        interval = setInterval(() => {
            setProgress(prev => {
                if (prev < 30) return Math.min(prev + 0.5, 29);
                if (prev < 50) return Math.min(prev + 0.5, 49);
                if (prev < 99) return Math.min(prev + 0.1, 99);
                return prev;
            });
        }, 200);
    }
    return () => clearInterval(interval);
  }, [appState]);

  const addLog = (text: string) => {
    setLogs(prev => [...prev, { id: Date.now(), text, timestamp: Date.now() }]);
  };

  const shuffleArray = (array: any[]) => {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  };

  const handleCalculate = useCallback(async () => {
    if (!preferences.lat || !preferences.lng || !(window as any).google) return;

    setAppState(AppState.PROCESSING);
    setLogs([]);
    setProgress(5);
    Logger.info('USER', 'Search Initiated', { preferences });
    
    addLog(`ACQUIRING SATELLITE LOCK [${preferences.lat.toFixed(4)}, ${preferences.lng.toFixed(4)}]...`);

    const loadingWitPromise = generateLoadingLogs(preferences.vibe, preferences.address);
    
    try {
      const { Place } = await (window as any).google.maps.importLibrary("places");
      
      // Increased radius to cast a wider net before filtering
      let radius = 2000; 
      let maxDurationSeconds = 900; // 15 min default

      if (preferences.walkLimit === WalkLimit.FIVE_MIN) {
          radius = 1000; // was 500, increased to ensure we get candidates
          maxDurationSeconds = 300; 
      } else if (preferences.walkLimit === WalkLimit.FIFTEEN_MIN) {
          radius = 2500; // was 1200, increased
          maxDurationSeconds = 900;
      } else if (preferences.walkLimit === WalkLimit.DOESNT_MATTER) {
          radius = 5000;
          maxDurationSeconds = 2400; // 40 min
      }

      addLog(`CALIBRATING SCANNER RADIUS: ${radius}m...`);

      const location = new (window as any).google.maps.LatLng(preferences.lat, preferences.lng);
      
      // Determine search queries
      let searchQueries = getSearchQueriesForVibe(preferences.vibe);
      
      if (preferences.freestylePrompt && preferences.freestylePrompt.trim().length > 0) {
          addLog(`INJECTING CUSTOM PROTOCOL: "${preferences.freestylePrompt.toUpperCase()}"...`);
          if (!preferences.vibe) {
             searchQueries = [preferences.freestylePrompt];
          } else {
             searchQueries = [preferences.freestylePrompt, ...searchQueries];
          }
      }

      const vibeLog = preferences.vibe ? preferences.vibe.toUpperCase() : "CUSTOM DIRECTIVE";
      addLog(`EXECUTING MULTI-VECTOR SEARCH FOR [${vibeLog}]...`);
      
      const searchIdPromises = searchQueries.map(query => {
        const request = {
            textQuery: query,
            locationBias: { center: location, radius: radius },
            maxResultCount: 20,
            fields: ['id']
        };
        return Place.searchByText(request);
      });

      const searchIdResults = await Promise.all(searchIdPromises);
      const allPlaceIds = searchIdResults.flatMap(result => result.places.map((p: any) => p.id));
      const uniquePlaceIds = [...new Set(allPlaceIds)];

      if (uniquePlaceIds.length === 0) {
          Logger.warn('SYSTEM', 'Zero Candidates Found Initial Search');
          throw new Error("ZERO ENTITIES FOUND IN SECTOR.");
      }
      addLog(`DETECTED ${uniquePlaceIds.length} UNIQUE ENTITIES...`);
      
      setProgress(30);

      const comprehensiveFields = [
        'id', 'displayName', 'location', 'rating', 'userRatingCount',
        'priceLevel', 'types', 'editorialSummary', 'websiteURI',
        'regularOpeningHours', 'reviews', 'servesVegetarianFood',
        'servesBeer', 'servesWine', 'paymentOptions'
      ];
      
      const detailPromises = uniquePlaceIds.map(id => {
          const place = new Place({ id });
          return place.fetchFields({ fields: comprehensiveFields });
      });
      
      const detailResults = await Promise.allSettled(detailPromises);
      const places = detailResults
        .filter(res => res.status === 'fulfilled' && res.value?.place)
        .map((res: any) => res.value.place);

      if (places.length === 0) throw new Error("FAILED TO FETCH DETAILS FOR ANY CANDIDATE.");

      setProgress(40);

      loadingWitPromise.then(witLogs => {
          witLogs.forEach((log, idx) => {
              setTimeout(() => addLog(log), idx * 1500); 
          });
      });

      const mappedPlaces: GooglePlace[] = places.map((p: any) => ({
          place_id: p.id,
          name: p.displayName,
          rating: p.rating,
          user_ratings_total: p.userRatingCount,
          geometry: { location: p.location },
          types: p.types,
          price_level: p.priceLevel,
          editorial_summary: p.editorialSummary ? { overview: p.editorialSummary.text } : undefined,
          website: p.websiteURI,
          opening_hours: p.regularOpeningHours ? { 
            open_now: p.regularOpeningHours.openNow,
            weekday_text: p.regularOpeningHours.weekdayText,
          } : undefined,
          reviews: p.reviews,
          serves_vegetarian_food: p.servesVegetarianFood,
          serves_beer: p.servesBeer,
          serves_wine: p.servesWine,
          payment_options: p.paymentOptions ? {
              accepts_credit_cards: p.paymentOptions.acceptsCreditCards,
              accepts_cash_only: p.paymentOptions.acceptsCashOnly,
              accepts_nfc: p.paymentOptions.acceptsNfc
          } : undefined
      }));

      // BATCH DISTANCE MATRIX REQUESTS
      const BATCH_SIZE = 25;
      const candidatePool = shuffleArray([...mappedPlaces]).slice(0, 50);
      const batches = [];
      for (let i = 0; i < candidatePool.length; i += BATCH_SIZE) {
          batches.push(candidatePool.slice(i, i + BATCH_SIZE));
      }
      
      addLog(`CALIBRATING WALKING VECTORS...`);
      const matrixService = new (window as any).google.maps.DistanceMatrixService();
      const placeDurations = new Map<string, {text: string, value: number}>();
      
      const matrixPromises = batches.map(batch => 
        new Promise<void>((resolve) => {
            matrixService.getDistanceMatrix({
                origins: [{ lat: preferences.lat!, lng: preferences.lng! }],
                destinations: batch.map(p => p.geometry?.location).filter(Boolean),
                travelMode: (window as any).google.maps.TravelMode.WALKING,
            }, (response: any, status: any) => {
                if (status === 'OK' && response && response.rows[0]) {
                    batch.forEach((p, idx) => {
                        const element = response.rows[0].elements[idx];
                        if (element && element.status === 'OK') {
                            placeDurations.set(p.place_id, { text: element.duration.text, value: element.duration.value });
                        }
                    });
                }
                resolve();
            });
        })
      );
      
      await Promise.all(matrixPromises);
      setProgress(60);
      
      const allMeasuredCandidates = candidatePool.filter(p => p.geometry?.location);
      if (allMeasuredCandidates.length === 0) throw new Error("NO VIABLE CANDIDATES FOUND AFTER PROXIMITY ANALYSIS.");

      addLog(`APPLYING STRICT PROXIMITY FILTER: <= ${preferences.walkLimit} WALK...`);
      
      // Adaptive Filtering Logic
      // 1. Strict Filter
      let candidatesWithinRange = allMeasuredCandidates.filter(p => {
          const duration = placeDurations.get(p.place_id)?.value;
          if (duration === undefined) return false; 
          return duration <= maxDurationSeconds;
      });

      // 2. Relaxed Filter (1.5x) if Strict failed
      if (candidatesWithinRange.length === 0) {
          addLog("WARNING: STRICT FILTER YIELDED 0 RESULTS. EXPANDING HORIZON...");
          Logger.warn('SYSTEM', 'Expanding Proximity Search', { originalLimit: maxDurationSeconds });
          candidatesWithinRange = allMeasuredCandidates.filter(p => {
              const duration = placeDurations.get(p.place_id)?.value;
              if (duration === undefined) return false; 
              return duration <= (maxDurationSeconds * 1.5);
          });
      }

      // 3. Emergency Filter (Closest 5) if Relaxed failed
      if (candidatesWithinRange.length === 0) {
          addLog("WARNING: NO RESULTS IN RANGE. RETRIEVING CLOSEST ENTITIES...");
          Logger.warn('SYSTEM', 'Emergency Fallback Triggered', { count: 5 });
          const sortedByDistance = [...allMeasuredCandidates].sort((a, b) => {
               const durA = placeDurations.get(a.place_id)?.value || 99999;
               const durB = placeDurations.get(b.place_id)?.value || 99999;
               return durA - durB;
          });
          candidatesWithinRange = sortedByDistance.slice(0, 5);
      }

      addLog(`PROXIMITY FILTER COMPLETE. ${candidatesWithinRange.length} CANDIDATES SELECTED.`);
      
      if (candidatesWithinRange.length < 5 && candidatesWithinRange.length > 0) {
        addLog(`WARNING: LIMITED CANDIDATE POOL.`);
      }

      addLog(`RANKING CANDIDATES...`);
      await new Promise(res => setTimeout(res, 1000));

      const sortedCandidates = candidatesWithinRange.sort((a, b) => {
          const durationA = placeDurations.get(a.place_id)?.value;
          const durationB = placeDurations.get(b.place_id)?.value;
          const scoreA = calculateCandidateScore(a, preferences.price, durationA, maxDurationSeconds);
          const scoreB = calculateCandidateScore(b, preferences.price, durationB, maxDurationSeconds);
          return scoreB - scoreA;
      });

      const candidatesForGemini = sortedCandidates.slice(0, 40);

      if (candidatesForGemini.length === 0) {
        throw new Error(`SYSTEM UNABLE TO LOCATE VIABLE TARGETS.`);
      }
      
      addLog(`ENGAGING NEURAL CORE (GEMINI-3-PRO-PREVIEW)...`);
      
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

      if (!recommendations || recommendations.length < 3) {
        addLog(`SUPPLEMENTING RESULTS WITH ALGORITHMIC BACKFILL...`);
        const needed = 3 - (recommendations?.length || 0);
        
        const recommendedPlaceIds = new Set(recommendations.map(r => r.place_id));
        const fallbackPool = candidatesForGemini
          .filter(p => !recommendedPlaceIds.has(p.place_id))
          .sort((a, b) => (b.rating || 0) - (a.rating || 0));

        const fallbackRecs: GeminiRecommendation[] = fallbackPool.slice(0, needed).map(p => ({
            place_id: p.place_id,
            ai_reason: p.editorial_summary?.overview || `A highly-rated alternative (${p.rating || 'N/A'}/5 from ${p.user_ratings_total || 0} reviews).`,
            recommended_dish: "Signature dishes or daily specials.",
            is_cash_only: p.payment_options?.accepts_cash_only || false,
            cash_warning_msg: p.payment_options?.accepts_cash_only ? "Note: This location may be cash-only." : null,
            is_new_opening: (p.user_ratings_total || 0) < 50
        }));
        
        finalRecommendations = [...finalRecommendations, ...fallbackRecs];
      }

      if (finalRecommendations.length === 0) {
        throw new Error("POST-PROCESSING FAILED TO YIELD RESULTS.");
      }

      addLog(`PERMUTATING OPTIONS...`);
      const finalSelection = shuffleArray(finalRecommendations).slice(0, 3);
      
      setProgress(100);
      addLog("OPTIMAL SOLUTION CALCULATED.");
      Logger.info('SYSTEM', 'Calculation Complete', { 
        resultCount: finalSelection.length,
        results: finalSelection.map(r => r.place_id) // Log IDs for reference
      });
      
      const finalResults: FinalResult[] = [];
      finalSelection.forEach((rec) => {
          const original = candidatesForGemini.find(p => p.place_id === rec.place_id);
          if (original) {
              const duration = placeDurations.get(rec.place_id) || { text: 'N/A', value: 0 };
              finalResults.push({
                  ...original,
                  ...rec,
                  walking_time_text: duration.text,
                  walking_time_value: duration.value
              });
          }
      });
      
      setTimeout(() => {
        setResults(finalResults);
        setAppState(AppState.RESULTS);
      }, 500);

    } catch (error) {
      console.error(error);
      Logger.error('SYSTEM', 'App Calculation Loop Failed', error);
      addLog(`CRITICAL ERROR: ${error instanceof Error ? error.message : 'Unknown'}`);
      addLog("SYSTEM FAILURE. RESETTING...");
      setTimeout(() => setAppState(AppState.INPUT), 5000);
      setProgress(0);
    }

  }, [preferences]);

  return (
    <div className={`font-sans transition-colors duration-300 ${preferences.theme === ThemeMode.DARK ? 'text-dark-text bg-dark-bg' : 'text-braun-dark bg-braun-bg'}`}>
      
      <ControlPanel 
        appState={appState} 
        preferences={preferences} 
        setPreferences={setPreferences}
        onCalculate={handleCalculate}
      />

      <TerminalLog 
        appState={appState} 
        logs={logs} 
        progress={progress}
        theme={preferences.theme}
      />

      <ResultsView 
        appState={appState} 
        results={results}
        userLat={preferences.lat}
        userLng={preferences.lng}
        onReset={() => {
            setAppState(AppState.INPUT);
            setLogs([]);
            setProgress(0);
        }}
        theme={preferences.theme}
      />
    </div>
  );
};

const App: React.FC = () => {
    return (
        <ErrorBoundary>
            <AppContent />
        </ErrorBoundary>
    );
};

export default App;
