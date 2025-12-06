import { GooglePlace } from '../types';
import SupabaseService from '../services/supabaseService';
import Logger from '../utils/logger';

/**
 * Two-tier cache for Places API data to reduce API costs
 * 
 * L1: In-memory (per session) - instant access
 * L2: Supabase (shared across all users) - 7-day TTL
 * 
 * Flow: Check L1 → Check L2 → Fetch from Google API → Save to L1 + L2
 * 
 * Cost tracking (Essentials plan):
 * - Place Details API: ~€0.017 per call
 * - Distance Matrix API: ~€0.005 per element
 */

const PLACE_TTL_MS = 60 * 60 * 1000; // 1 hour for L1 (L2 has 7-day TTL)

// Cost estimates in EUR (Essentials plan pricing)
const COST_PER_PLACE_DETAIL = 0.017;
const COST_PER_DISTANCE_ELEMENT = 0.005;

interface CachedPlace {
  data: GooglePlace;
  timestamp: number;
}

interface CachedDistance {
  text: string;
  value: number; // seconds
}

// Session stats for cost tracking
interface CacheStats {
  placeHits: number;
  placeMisses: number;
  distanceHits: number;
  distanceMisses: number;
  estimatedSavingsEur: number;
}

const stats: CacheStats = {
  placeHits: 0,
  placeMisses: 0,
  distanceHits: 0,
  distanceMisses: 0,
  estimatedSavingsEur: 0,
};

// In-memory caches (cleared on page refresh)
const placeCache = new Map<string, CachedPlace>();
const distanceCache = new Map<string, CachedDistance>();

/**
 * Generate cache key for distance lookups
 * Rounds lat/lng to 4 decimal places (~11m precision) for cache hits on nearby origins
 */
const getDistanceKey = (originLat: number, originLng: number, placeId: string): string => {
  const lat = originLat.toFixed(4);
  const lng = originLng.toFixed(4);
  return `${lat},${lng}:${placeId}`;
};

/**
 * Places Cache
 */
export const PlacesCache = {
  /**
   * Get cached place data if still fresh
   */
  getPlace(placeId: string): GooglePlace | null {
    const cached = placeCache.get(placeId);
    if (!cached) return null;
    
    // Check TTL
    if (Date.now() - cached.timestamp > PLACE_TTL_MS) {
      placeCache.delete(placeId);
      return null;
    }
    
    return cached.data;
  },

  /**
   * Cache place data
   */
  setPlace(placeId: string, data: GooglePlace): void {
    placeCache.set(placeId, {
      data,
      timestamp: Date.now()
    });
  },

  /**
   * Get multiple cached places, returns map of found places
   * Tracks cache hits/misses and cost savings
   */
  getPlaces(placeIds: string[]): Map<string, GooglePlace> {
    const found = new Map<string, GooglePlace>();
    let hits = 0;
    let misses = 0;
    
    for (const id of placeIds) {
      const cached = this.getPlace(id);
      if (cached) {
        found.set(id, cached);
        hits++;
      } else {
        misses++;
      }
    }
    
    // Update stats
    stats.placeHits += hits;
    stats.placeMisses += misses;
    stats.estimatedSavingsEur += hits * COST_PER_PLACE_DETAIL;
    
    if (hits > 0) {
      Logger.info('CACHE', `Place cache: ${hits} hits, ${misses} misses`, {
        hitRate: `${((hits / placeIds.length) * 100).toFixed(1)}%`,
        savedCalls: hits,
        estimatedSavings: `€${(hits * COST_PER_PLACE_DETAIL).toFixed(3)}`
      });
    }
    
    return found;
  },

  /**
   * Cache multiple places (L1 only - synchronous)
   */
  setPlaces(places: GooglePlace[]): void {
    for (const place of places) {
      this.setPlace(place.place_id, place);
    }
    Logger.info('CACHE', `Cached ${places.length} places to L1`, {
      totalCached: placeCache.size
    });
  },

  /**
   * Get places with L2 (Supabase) fallback
   * Checks L1 first, then L2, returns combined results
   */
  async getPlacesWithL2(placeIds: string[]): Promise<{ found: Map<string, GooglePlace>; missing: string[] }> {
    const found = new Map<string, GooglePlace>();
    let l1Hits = 0;
    let l2Hits = 0;
    
    // Check L1 (in-memory) first
    const l1Missing: string[] = [];
    for (const id of placeIds) {
      const cached = this.getPlace(id);
      if (cached) {
        found.set(id, cached);
        l1Hits++;
      } else {
        l1Missing.push(id);
      }
    }
    
    // Check L2 (Supabase) for remaining
    if (l1Missing.length > 0) {
      const l2Results = await SupabaseService.getCachedPlaces(l1Missing);
      l2Results.forEach((place, id) => {
        found.set(id, place);
        // Also save to L1 for faster subsequent access
        this.setPlace(id, place);
        l2Hits++;
      });
    }
    
    // Calculate what's still missing
    const missing = placeIds.filter(id => !found.has(id));
    
    // Update stats
    const totalHits = l1Hits + l2Hits;
    stats.placeHits += totalHits;
    stats.placeMisses += missing.length;
    stats.estimatedSavingsEur += totalHits * COST_PER_PLACE_DETAIL;
    
    if (totalHits > 0 || missing.length > 0) {
      Logger.info('CACHE', `Place cache lookup: L1=${l1Hits}, L2=${l2Hits}, miss=${missing.length}`, {
        total: placeIds.length,
        l1Hits,
        l2Hits,
        misses: missing.length,
        hitRate: `${((totalHits / placeIds.length) * 100).toFixed(1)}%`,
        estimatedSavings: `€${(totalHits * COST_PER_PLACE_DETAIL).toFixed(3)}`
      });
    }
    
    return { found, missing };
  },

  /**
   * Save places to both L1 and L2 cache
   */
  async savePlacesToBothLayers(places: GooglePlace[]): Promise<void> {
    if (places.length === 0) return;
    
    // Save to L1 (synchronous)
    this.setPlaces(places);
    
    // Save to L2 (async, non-blocking)
    SupabaseService.cachePlaces(places).catch(err => {
      Logger.warn('CACHE', 'Failed to save to L2 cache', { error: err });
    });
  },

  /**
   * Get comprehensive cache stats for debugging and cost tracking
   */
  getStats(): CacheStats & { placeCount: number; distanceCount: number } {
    return {
      ...stats,
      placeCount: placeCache.size,
      distanceCount: distanceCache.size
    };
  },

  /**
   * Clear all caches and reset stats (useful for testing)
   */
  clear(): void {
    placeCache.clear();
    distanceCache.clear();
    // Reset stats
    stats.placeHits = 0;
    stats.placeMisses = 0;
    stats.distanceHits = 0;
    stats.distanceMisses = 0;
    stats.estimatedSavingsEur = 0;
  }
};

/**
 * Distance Cache
 */
export const DistanceCache = {
  /**
   * Get cached distance
   */
  get(originLat: number, originLng: number, placeId: string): CachedDistance | null {
    const key = getDistanceKey(originLat, originLng, placeId);
    return distanceCache.get(key) || null;
  },

  /**
   * Cache distance
   */
  set(originLat: number, originLng: number, placeId: string, distance: CachedDistance): void {
    const key = getDistanceKey(originLat, originLng, placeId);
    distanceCache.set(key, distance);
  },

  /**
   * Get multiple cached distances
   * Tracks cache hits/misses and cost savings
   */
  getMany(originLat: number, originLng: number, placeIds: string[]): Map<string, CachedDistance> {
    const found = new Map<string, CachedDistance>();
    let hits = 0;
    let misses = 0;
    
    for (const id of placeIds) {
      const cached = this.get(originLat, originLng, id);
      if (cached) {
        found.set(id, cached);
        hits++;
      } else {
        misses++;
      }
    }
    
    // Update stats
    stats.distanceHits += hits;
    stats.distanceMisses += misses;
    stats.estimatedSavingsEur += hits * COST_PER_DISTANCE_ELEMENT;
    
    if (hits > 0) {
      Logger.info('CACHE', `Distance cache: ${hits} hits, ${misses} misses`, {
        hitRate: `${((hits / placeIds.length) * 100).toFixed(1)}%`,
        savedCalls: hits,
        estimatedSavings: `€${(hits * COST_PER_DISTANCE_ELEMENT).toFixed(3)}`
      });
    }
    
    return found;
  },

  /**
   * Cache multiple distances (L1 only - synchronous)
   */
  setMany(originLat: number, originLng: number, distances: Map<string, CachedDistance>): void {
    distances.forEach((distance, placeId) => {
      this.set(originLat, originLng, placeId, distance);
    });
    Logger.info('CACHE', `Cached ${distances.size} distances to L1`, {
      totalCached: distanceCache.size
    });
  },

  /**
   * Get distances with L2 (Supabase) fallback
   */
  async getManyWithL2(
    originLat: number, 
    originLng: number, 
    placeIds: string[]
  ): Promise<{ found: Map<string, CachedDistance>; missing: string[] }> {
    const found = new Map<string, CachedDistance>();
    let l1Hits = 0;
    let l2Hits = 0;
    
    // Check L1 first
    const l1Missing: string[] = [];
    for (const id of placeIds) {
      const cached = this.get(originLat, originLng, id);
      if (cached) {
        found.set(id, cached);
        l1Hits++;
      } else {
        l1Missing.push(id);
      }
    }
    
    // Check L2 for remaining
    if (l1Missing.length > 0) {
      const l2Results = await SupabaseService.getCachedDistances(originLat, originLng, l1Missing);
      l2Results.forEach((distance, id) => {
        found.set(id, distance);
        // Save to L1 for faster subsequent access
        this.set(originLat, originLng, id, distance);
        l2Hits++;
      });
    }
    
    const missing = placeIds.filter(id => !found.has(id));
    
    // Update stats
    const totalHits = l1Hits + l2Hits;
    stats.distanceHits += totalHits;
    stats.distanceMisses += missing.length;
    stats.estimatedSavingsEur += totalHits * COST_PER_DISTANCE_ELEMENT;
    
    if (totalHits > 0 || missing.length > 0) {
      Logger.info('CACHE', `Distance cache lookup: L1=${l1Hits}, L2=${l2Hits}, miss=${missing.length}`, {
        total: placeIds.length,
        l1Hits,
        l2Hits,
        misses: missing.length,
        hitRate: `${((totalHits / placeIds.length) * 100).toFixed(1)}%`,
        estimatedSavings: `€${(totalHits * COST_PER_DISTANCE_ELEMENT).toFixed(3)}`
      });
    }
    
    return { found, missing };
  },

  /**
   * Save distances to both L1 and L2 cache
   */
  async saveToBothLayers(
    originLat: number,
    originLng: number,
    distances: Map<string, CachedDistance>
  ): Promise<void> {
    if (distances.size === 0) return;
    
    // Save to L1 (synchronous)
    this.setMany(originLat, originLng, distances);
    
    // Save to L2 (async, non-blocking)
    SupabaseService.cacheDistances(originLat, originLng, distances).catch(err => {
      Logger.warn('CACHE', 'Failed to save distances to L2 cache', { error: err });
    });
  }
};

/**
 * Log session cache summary - call this to see total savings
 */
export const logCacheSummary = (): void => {
  const totalRequests = stats.placeHits + stats.placeMisses + stats.distanceHits + stats.distanceMisses;
  const totalHits = stats.placeHits + stats.distanceHits;
  
  Logger.info('CACHE', '=== SESSION CACHE SUMMARY ===', {
    placeCache: {
      hits: stats.placeHits,
      misses: stats.placeMisses,
      hitRate: stats.placeHits + stats.placeMisses > 0 
        ? `${((stats.placeHits / (stats.placeHits + stats.placeMisses)) * 100).toFixed(1)}%`
        : 'N/A',
      savedCost: `€${(stats.placeHits * COST_PER_PLACE_DETAIL).toFixed(3)}`
    },
    distanceCache: {
      hits: stats.distanceHits,
      misses: stats.distanceMisses,
      hitRate: stats.distanceHits + stats.distanceMisses > 0
        ? `${((stats.distanceHits / (stats.distanceHits + stats.distanceMisses)) * 100).toFixed(1)}%`
        : 'N/A',
      savedCost: `€${(stats.distanceHits * COST_PER_DISTANCE_ELEMENT).toFixed(3)}`
    },
    totalSavedApiCalls: totalHits,
    totalEstimatedSavings: `€${stats.estimatedSavingsEur.toFixed(3)}`,
    overallHitRate: totalRequests > 0 
      ? `${((totalHits / totalRequests) * 100).toFixed(1)}%`
      : 'N/A'
  });
};

export default { PlacesCache, DistanceCache, logCacheSummary };

