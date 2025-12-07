import { useCallback } from 'react';
import { GooglePlace } from '../types';
import { DistanceCache } from '../lib/placesCache';
import Logger from '../utils/logger';

const BATCH_SIZE = 25;
const MATRIX_TIMEOUT_MS = 10000; // 10 second timeout per batch

export interface PlaceDuration {
  text: string;
  value: number; // seconds
}

interface CalculateDistancesParams {
  origin: { lat: number; lng: number };
  places: GooglePlace[];
  travelMode?: google.maps.TravelMode;
}

interface CalculateDistancesResult {
  durations: Map<string, PlaceDuration>;
  failedCount: number;
}

/**
 * Format seconds into a human-readable duration string
 * e.g., 720 -> "12 mins", 3600 -> "1 hour", 5400 -> "1 hour 30 mins"
 */
const formatDuration = (seconds: number): string => {
  const hours = Math.floor(seconds / 3600);
  const mins = Math.round((seconds % 3600) / 60);
  
  if (hours === 0) {
    return `${mins} min${mins !== 1 ? 's' : ''}`;
  } else if (mins === 0) {
    return `${hours} hour${hours !== 1 ? 's' : ''}`;
  } else {
    return `${hours} hour${hours !== 1 ? 's' : ''} ${mins} min${mins !== 1 ? 's' : ''}`;
  }
};

/**
 * Custom hook for Google Routes API interactions (Route Matrix)
 * Migrated from legacy Distance Matrix API to the modern Routes API
 * for better performance and future-proofing (legacy API deprecated March 2025)
 */
export const useDistanceMatrix = () => {
  /**
   * Calculate distances from origin to multiple places using Routes API
   * Handles batching and timeouts automatically
   */
  const calculateDistances = useCallback(async ({
    origin,
    places,
    travelMode = google.maps.TravelMode.WALKING,
  }: CalculateDistancesParams): Promise<CalculateDistancesResult> => {
    if (!window.google) {
      throw new Error('Google Maps API not loaded');
    }

    const durations = new Map<string, PlaceDuration>();
    let failedCount = 0;

    // Filter places with valid geometry
    const validPlaces = places.filter(p => p.geometry?.location);

    // Check L1 (memory) + L2 (Supabase) cache to reduce API calls
    const placeIds = validPlaces.map(p => p.place_id);
    const { found: cachedDistances, missing: uncachedIds } = await DistanceCache.getManyWithL2(
      origin.lat, 
      origin.lng, 
      placeIds
    );
    
    // Add cached distances to results
    cachedDistances.forEach((distance, placeId) => {
      durations.set(placeId, distance);
    });

    // Filter to only uncached places
    const uncachedPlaces = validPlaces.filter(p => uncachedIds.includes(p.place_id));
    
    Logger.info('SYSTEM', 'Distance cache check (L1+L2)', {
      total: validPlaces.length,
      cached: cachedDistances.size,
      toFetch: uncachedPlaces.length
    });

    // Only make API calls for uncached places
    const newlyFetchedDistances = new Map<string, PlaceDuration>();
    
    if (uncachedPlaces.length > 0) {
      // Try to use the new Routes API, fall back to legacy Distance Matrix if unavailable
      let useRoutesApi = false;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let RouteMatrix: any = null;
      
      try {
        // Import the routes library (new Routes API)
        // Note: TypeScript types for RouteMatrix may not be available yet
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const routesLib = await google.maps.importLibrary('routes') as any;
        if (routesLib && routesLib.RouteMatrix && typeof routesLib.RouteMatrix.computeRouteMatrix === 'function') {
          RouteMatrix = routesLib.RouteMatrix;
          useRoutesApi = true;
        }
      } catch {
        // Routes library not available, will fall back to legacy API
        Logger.info('SYSTEM', 'Routes API not available, using legacy Distance Matrix API');
      }

      // Batch places to stay within API limits
      const batches: GooglePlace[][] = [];
      for (let i = 0; i < uncachedPlaces.length; i += BATCH_SIZE) {
        batches.push(uncachedPlaces.slice(i, i + BATCH_SIZE));
      }

      if (useRoutesApi && RouteMatrix) {
        // Use new Routes API (RouteMatrix.computeRouteMatrix)
        const batchPromises = batches.map(async (batch) => {
          try {
            // Build destinations array with location coordinates
            const destinations = batch.map(p => {
              const loc = p.geometry!.location!;
              const lat = typeof loc.lat === 'function' ? loc.lat() : loc.lat;
              const lng = typeof loc.lng === 'function' ? loc.lng() : loc.lng;
              return {
                location: { lat, lng }
              };
            });

            // Create the RouteMatrix request
            // fields array is required - specifies which fields to return in the response
            const request = {
              origins: [{ location: { lat: origin.lat, lng: origin.lng } }],
              destinations,
              travelMode: travelMode === google.maps.TravelMode.WALKING ? 'WALK' : 'DRIVE',
              fields: ['durationMillis', 'distanceMeters', 'condition'],
            };

            // Set up timeout
            const timeoutPromise = new Promise<null>((resolve) => {
              setTimeout(() => {
                console.warn('Route matrix request timed out for batch');
                resolve(null);
              }, MATRIX_TIMEOUT_MS);
            });

            // Make the API call with timeout
            const response = await Promise.race([
              RouteMatrix!.computeRouteMatrix(request),
              timeoutPromise
            ]);

            if (!response || !response.matrix) {
              failedCount += batch.length;
              return;
            }

            // Process response - Routes API returns matrix.rows[originIndex].items[destIndex]
            // For 1 origin x N destinations, we access matrix.rows[0].items
            const items = response.matrix.rows?.[0]?.items;
            if (!items) {
              failedCount += batch.length;
              return;
            }

            batch.forEach((place, idx) => {
              const element = items[idx];
              if (element && element.condition === 'ROUTE_EXISTS' && element.durationMillis != null) {
                // Routes API returns durationMillis in milliseconds, convert to seconds
                const durationSeconds = Math.round(element.durationMillis / 1000);
                
                const distance = {
                  text: formatDuration(durationSeconds),
                  value: durationSeconds,
                };
                durations.set(place.place_id, distance);
                newlyFetchedDistances.set(place.place_id, distance);
              } else {
                failedCount++;
              }
            });
          } catch (err) {
            console.error('Route matrix request failed:', err);
            failedCount += batch.length;
          }
        });

        await Promise.all(batchPromises);
      } else {
        // Fall back to legacy Distance Matrix API
        const service = new google.maps.DistanceMatrixService();
        
        const batchPromises = batches.map(batch =>
          new Promise<void>((resolve) => {
            const timeoutId = setTimeout(() => {
              console.warn('Distance matrix request timed out for batch');
              failedCount += batch.length;
              resolve();
            }, MATRIX_TIMEOUT_MS);

            const destinations = batch.map(p => p.geometry!.location!);

            try {
              service.getDistanceMatrix(
                {
                  origins: [{ lat: origin.lat, lng: origin.lng }],
                  destinations,
                  travelMode,
                },
                (response, status) => {
                  clearTimeout(timeoutId);

                  if (status === 'OK' && response?.rows[0]) {
                    batch.forEach((place, idx) => {
                      const element = response.rows[0].elements[idx];
                      if (element?.status === 'OK' && element.duration) {
                        const distance = {
                          text: element.duration.text,
                          value: element.duration.value,
                        };
                        durations.set(place.place_id, distance);
                        newlyFetchedDistances.set(place.place_id, distance);
                      } else {
                        failedCount++;
                      }
                    });
                  } else {
                    failedCount += batch.length;
                  }
                  resolve();
                }
              );
            } catch (err) {
              clearTimeout(timeoutId);
              console.error('Distance matrix request failed:', err);
              failedCount += batch.length;
              resolve();
            }
          })
        );

        await Promise.all(batchPromises);
      }
      
      // Save newly fetched distances to BOTH L1 and L2 cache
      if (newlyFetchedDistances.size > 0) {
        await DistanceCache.saveToBothLayers(origin.lat, origin.lng, newlyFetchedDistances);
      }
    }

    // Log API call summary for this distance calculation
    const batchCount = Math.ceil(uncachedPlaces.length / BATCH_SIZE);
    Logger.info('SYSTEM', '=== ROUTES API SUMMARY ===', {
      totalPlaces: validPlaces.length,
      cacheHits: cachedDistances.size,
      apiCalls: batchCount,
      elementsCalculated: uncachedPlaces.length,
      newlyCached: newlyFetchedDistances.size,
      estimatedCost: `€${(uncachedPlaces.length * 0.005).toFixed(3)}`
    });

    return { durations, failedCount };
  }, []);

  /**
   * Filter places by maximum walking duration
   */
  const filterByDuration = useCallback((
    places: GooglePlace[],
    durations: Map<string, PlaceDuration>,
    maxDurationSeconds: number
  ): GooglePlace[] => {
    return places.filter(place => {
      const duration = durations.get(place.place_id);
      return duration && duration.value <= maxDurationSeconds;
    });
  }, []);

  /**
   * Sort places by walking duration (closest first)
   */
  const sortByDuration = useCallback((
    places: GooglePlace[],
    durations: Map<string, PlaceDuration>
  ): GooglePlace[] => {
    return [...places].sort((a, b) => {
      const durationA = durations.get(a.place_id)?.value ?? Infinity;
      const durationB = durations.get(b.place_id)?.value ?? Infinity;
      return durationA - durationB;
    });
  }, []);

  return {
    calculateDistances,
    filterByDuration,
    sortByDuration,
  };
};

export default useDistanceMatrix;
