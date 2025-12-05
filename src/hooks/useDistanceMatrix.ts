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

        try {
          service.getDistanceMatrix(
            {
              origins: [{ lat: origin.lat, lng: origin.lng }],
              destinations: batch
                .map(p => p.geometry?.location)
                .filter(Boolean) as google.maps.LatLng[],
              travelMode,
            },
            (response, status) => {
              clearTimeout(timeoutId);

              if (status === 'OK' && response?.rows[0]) {
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

  return {
    calculateDistances,
    filterByDuration,
    sortByDuration,
  };
};

export default useDistanceMatrix;

