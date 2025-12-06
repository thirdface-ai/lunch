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
const TEXT_SEARCH_TTL_MS = 30 * 60 * 1000; // 30 min for L1 (L2 has 24-hour TTL)

// Cost estimates in EUR (Essentials plan pricing)
const COST_PER_TEXT_SEARCH = 0.032;
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

interface CachedTextSearch {
  placeIds: string[];
  timestamp: number;
}

// Session stats for cost tracking
interface CacheStats {
  textSearchHits: number;
  textSearchMisses: number;
  placeHits: number;
  placeMisses: number;
  distanceHits: number;
  distanceMisses: number;
  estimatedSavingsEur: number;
}

const stats: CacheStats = {
  textSearchHits: 0,
  textSearchMisses: 0,
  placeHits: 0,
  placeMisses: 0,
  distanceHits: 0,
  distanceMisses: 0,
  estimatedSavingsEur: 0,
};

// In-memory caches (cleared on page refresh)
const textSearchCache = new Map<string, CachedTextSearch>();
const placeCache = new Map<string, CachedPlace>();
const distanceCache = new Map<string, CachedDistance>();

/**
 * Round coordinate to 3 decimal places (~111m precision)
 * Uses Math.round for consistency with Supabase L2 cache
 */
const roundCoord3 = (val: number): number => Math.round(val * 1000) / 1000;

/**
 * Generate cache key for text search lookups
 * Rounds lat/lng to 3 decimal places (~111m precision) for broader cache hits
 * Uses same rounding method as supabaseService.ts for L1/L2 consistency
 */
const getTextSearchKey = (lat: number, lng: number, query: string, radius: number): string => {
  const roundedLat = roundCoord3(lat);
  const roundedLng = roundCoord3(lng);
  return `${roundedLat},${roundedLng}:${radius}:${query.toLowerCase().trim()}`;
};

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
 * Text Search Cache - caches search query results (place IDs)
 */
export const TextSearchCache = {
  /**
   * Get cached text search result if still fresh (L1 only)
   */
  get(lat: number, lng: number, query: string, radius: number): string[] | null {
    const key = getTextSearchKey(lat, lng, query, radius);
    const cached = textSearchCache.get(key);
    if (!cached) return null;
    
    // Check TTL
    if (Date.now() - cached.timestamp > TEXT_SEARCH_TTL_MS) {
      textSearchCache.delete(key);
      return null;
    }
    
    return cached.placeIds;
  },

  /**
   * Cache text search result (L1 only)
   */
  set(lat: number, lng: number, query: string, radius: number, placeIds: string[]): void {
    const key = getTextSearchKey(lat, lng, query, radius);
    textSearchCache.set(key, {
      placeIds,
      timestamp: Date.now()
    });
  },

  /**
   * Get text search results with L2 (Supabase) fallback
   */
  async getWithL2(
    lat: number, 
    lng: number, 
    query: string, 
    radius: number
  ): Promise<{ placeIds: string[] | null; fromCache: 'L1' | 'L2' | null }> {
    // Check L1 first
    const l1Result = this.get(lat, lng, query, radius);
    if (l1Result) {
      stats.textSearchHits++;
      stats.estimatedSavingsEur += COST_PER_TEXT_SEARCH;
      Logger.info('CACHE', `Text search L1 hit: "${query}"`, {
        placeCount: l1Result.length,
        estimatedSavings: `€${COST_PER_TEXT_SEARCH.toFixed(3)}`
      });
      return { placeIds: l1Result, fromCache: 'L1' };
    }

    // Check L2 (Supabase)
    const l2Result = await SupabaseService.getCachedTextSearch(lat, lng, query, radius);
    if (l2Result) {
      // Save to L1 for faster subsequent access
      this.set(lat, lng, query, radius, l2Result);
      stats.textSearchHits++;
      stats.estimatedSavingsEur += COST_PER_TEXT_SEARCH;
      Logger.info('CACHE', `Text search L2 hit: "${query}"`, {
        placeCount: l2Result.length,
        estimatedSavings: `€${COST_PER_TEXT_SEARCH.toFixed(3)}`
      });
      return { placeIds: l2Result, fromCache: 'L2' };
    }

    stats.textSearchMisses++;
    return { placeIds: null, fromCache: null };
  },

  /**
   * Save text search result to both L1 and L2
   */
  async saveToBothLayers(
    lat: number,
    lng: number,
    query: string,
    radius: number,
    placeIds: string[]
  ): Promise<void> {
    if (placeIds.length === 0) return;
    
    // Save to L1 (synchronous)
    this.set(lat, lng, query, radius, placeIds);
    
    // Save to L2 (async, non-blocking)
    SupabaseService.cacheTextSearch(lat, lng, query, radius, placeIds).catch(err => {
      Logger.warn('CACHE', 'Failed to save text search to L2 cache', { error: err });
    });
    
    Logger.info('CACHE', `Cached text search: "${query}"`, {
      placeCount: placeIds.length,
      l1CacheSize: textSearchCache.size
    });
  },

  /**
   * Get multiple text search results with L2 fallback (batch)
   * Returns map of query -> placeIds for found queries
   */
  async getManyWithL2(
    lat: number,
    lng: number,
    queries: string[],
    radius: number
  ): Promise<{ found: Map<string, string[]>; missing: string[] }> {
    const found = new Map<string, string[]>();
    const missing: string[] = [];
    let l1Hits = 0;
    let l2Hits = 0;

    for (const query of queries) {
      const result = await this.getWithL2(lat, lng, query, radius);
      if (result.placeIds) {
        found.set(query, result.placeIds);
        if (result.fromCache === 'L1') l1Hits++;
        else if (result.fromCache === 'L2') l2Hits++;
      } else {
        missing.push(query);
      }
    }

    if (found.size > 0 || missing.length > 0) {
      Logger.info('CACHE', `Text search batch: L1=${l1Hits}, L2=${l2Hits}, miss=${missing.length}`, {
        total: queries.length,
        hitRate: `${((found.size / queries.length) * 100).toFixed(1)}%`,
        estimatedSavings: `€${(found.size * COST_PER_TEXT_SEARCH).toFixed(3)}`
      });
    }

    return { found, missing };
  }
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
    textSearchCache.clear();
    placeCache.clear();
    distanceCache.clear();
    // Reset stats
    stats.textSearchHits = 0;
    stats.textSearchMisses = 0;
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
  const totalRequests = stats.textSearchHits + stats.textSearchMisses + 
                        stats.placeHits + stats.placeMisses + 
                        stats.distanceHits + stats.distanceMisses;
  const totalHits = stats.textSearchHits + stats.placeHits + stats.distanceHits;
  
  Logger.info('CACHE', '=== SESSION CACHE SUMMARY ===', {
    textSearchCache: {
      hits: stats.textSearchHits,
      misses: stats.textSearchMisses,
      hitRate: stats.textSearchHits + stats.textSearchMisses > 0 
        ? `${((stats.textSearchHits / (stats.textSearchHits + stats.textSearchMisses)) * 100).toFixed(1)}%`
        : 'N/A',
      savedCost: `€${(stats.textSearchHits * COST_PER_TEXT_SEARCH).toFixed(3)}`
    },
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

export default { TextSearchCache, PlacesCache, DistanceCache, logCacheSummary };

