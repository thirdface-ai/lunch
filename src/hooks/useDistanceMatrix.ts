import { useCallback, useRef } from 'react';
import { GooglePlace } from '../types';

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
 * Custom hook for Google Distance Matrix API interactions
 */
export const useDistanceMatrix = () => {
  const serviceRef = useRef<google.maps.DistanceMatrixService | null>(null);

  /**
   * Get or create the DistanceMatrixService instance
   */
  const getService = useCallback((): google.maps.DistanceMatrixService => {
    if (!window.google) {
      throw new Error('Google Maps API not loaded');
    }
    
    if (!serviceRef.current) {
      serviceRef.current = new google.maps.DistanceMatrixService();
    }
    return serviceRef.current;
  }, []);

  /**
   * Calculate distances from origin to multiple places
   * Handles batching and timeouts automatically
   */
  const calculateDistances = useCallback(async ({
    origin,
    places,
    travelMode = google.maps.TravelMode.WALKING,
  }: CalculateDistancesParams): Promise<CalculateDistancesResult> => {
    const service = getService();
    const durations = new Map<string, PlaceDuration>();
    let failedCount = 0;

    // Filter places with valid geometry
    const validPlaces = places.filter(p => p.geometry?.location);

    // Batch places to stay within API limits
    const batches: GooglePlace[][] = [];
    for (let i = 0; i < validPlaces.length; i += BATCH_SIZE) {
      batches.push(validPlaces.slice(i, i + BATCH_SIZE));
    }

    // Process batches with timeout handling
    const batchPromises = batches.map(batch =>
      new Promise<void>((resolve) => {
        // Set timeout to prevent hanging if callback never fires
        const timeoutId = setTimeout(() => {
          console.warn('Distance matrix request timed out for batch');
          failedCount += batch.length;
          resolve();
        }, MATRIX_TIMEOUT_MS);

        // Extract destinations - batch already comes from validPlaces so all have geometry.location
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
                // Iterate using same index as destinations array
                batch.forEach((place, idx) => {
                  const element = response.rows[0].elements[idx];
                  if (element?.status === 'OK' && element.duration) {
                    durations.set(place.place_id, {
                      text: element.duration.text,
                      value: element.duration.value,
                    });
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

    return { durations, failedCount };
  }, [getService]);

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

  /**
   * Verify walking times using Directions API (more accurate than Distance Matrix)
   * Use this for final results to get precise route-based walking times
   */
  const verifyWalkingTimes = useCallback(async (
    origin: { lat: number; lng: number },
    places: Array<{ place_id: string; geometry?: { location?: google.maps.LatLng | google.maps.LatLngLiteral } }>
  ): Promise<Map<string, PlaceDuration>> => {
    if (!window.google) {
      throw new Error('Google Maps API not loaded');
    }

    const directionsService = new google.maps.DirectionsService();
    const verifiedDurations = new Map<string, PlaceDuration>();

    // Process each place in parallel
    const promises = places.map(async (place) => {
      if (!place.geometry?.location) return;

      try {
        const result = await new Promise<google.maps.DirectionsResult | null>((resolve) => {
          const timeoutId = setTimeout(() => {
            console.warn(`Directions API timeout for ${place.place_id}`);
            resolve(null);
          }, 5000);

          directionsService.route(
            {
              origin: { lat: origin.lat, lng: origin.lng },
              destination: place.geometry!.location!,
              travelMode: google.maps.TravelMode.WALKING,
            },
            (response, status) => {
              clearTimeout(timeoutId);
              if (status === 'OK' && response) {
                resolve(response);
              } else {
                resolve(null);
              }
            }
          );
        });

        if (result?.routes[0]?.legs[0]?.duration) {
          const duration = result.routes[0].legs[0].duration;
          verifiedDurations.set(place.place_id, {
            text: duration.text,
            value: duration.value,
          });
        }
      } catch (err) {
        console.error(`Failed to verify walking time for ${place.place_id}:`, err);
      }
    });

    await Promise.all(promises);
    return verifiedDurations;
  }, []);

  return {
    calculateDistances,
    filterByDuration,
    sortByDuration,
    verifyWalkingTimes,
  };
};

export default useDistanceMatrix;
