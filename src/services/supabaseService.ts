import { supabase, getSessionId } from '../lib/supabase';
import { 
  FinalResult, 
  UserPreferences,
  SearchHistoryRecord,
  GooglePlace
} from '../types';
import Logger from '../utils/logger';

// Duration type for distance cache
interface CachedDuration {
  text: string;
  value: number;
}

/**
 * Service for interacting with Supabase database
 */
export const SupabaseService = {
  /**
   * Save a search to history
   */
  async saveSearch(preferences: UserPreferences, resultCount: number): Promise<void> {
    try {
      const record: SearchHistoryRecord = {
        session_id: getSessionId(),
        address: preferences.address,
        lat: preferences.lat!,
        lng: preferences.lng!,
        vibe: preferences.vibe,
        price: preferences.price,
        walk_limit: preferences.walkLimit,
        no_cash: preferences.noCash,
        dietary_restrictions: preferences.dietaryRestrictions,
        freestyle_prompt: preferences.freestylePrompt || null,
        result_count: resultCount,
      };

      const { error } = await supabase
        .from('search_history')
        .insert([record]);

      if (error) {
        console.warn('Failed to save search history:', error.message);
      }
    } catch (e) {
      console.warn('Search history save exception:', e);
    }
  },

  /**
   * Get recent searches for the current session
   */
  async getRecentSearches(limit = 10): Promise<SearchHistoryRecord[]> {
    try {
      const { data, error } = await supabase
        .from('search_history')
        .select('*')
        .eq('session_id', getSessionId())
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        console.warn('Failed to fetch search history:', error.message);
        return [];
      }

      return (data || []) as SearchHistoryRecord[];
    } catch (e) {
      console.warn('Search history fetch exception:', e);
      return [];
    }
  },

  /**
   * Save recommended places to track for variety
   * Called after successful recommendations to avoid showing same restaurants
   */
  async saveRecommendedPlaces(results: FinalResult[]): Promise<void> {
    if (results.length === 0) return;

    try {
      const records = results.map(r => ({
        session_id: getSessionId(),
        place_id: r.place_id,
        place_name: r.name,
      }));

      const { error } = await supabase
        .from('recommended_places')
        .insert(records);

      if (error) {
        console.warn('Failed to save recommended places:', error.message);
      }
    } catch (e) {
      console.warn('Save recommended places exception:', e);
    }
  },

  /**
   * Get recently recommended place IDs for the current session
   * Used to filter out recently shown restaurants for variety
   * @param limit Number of recent recommendations to fetch (default: 50 = ~10 searches)
   */
  async getRecentlyRecommendedIds(limit = 50): Promise<Set<string>> {
    try {
      const { data, error } = await supabase
        .from('recommended_places')
        .select('place_id')
        .eq('session_id', getSessionId())
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        console.warn('Failed to fetch recently recommended:', error.message);
        return new Set();
      }

      return new Set((data || []).map(r => r.place_id));
    } catch (e) {
      console.warn('Fetch recently recommended exception:', e);
      return new Set();
    }
  },

  // ============================================
  // SHARED CACHE METHODS (L2 - Supabase)
  // ============================================

  /**
   * Get cached places from Supabase (shared across all users)
   * Only returns non-expired entries
   */
  async getCachedPlaces(placeIds: string[]): Promise<Map<string, GooglePlace>> {
    if (placeIds.length === 0) return new Map();

    try {
      const { data, error } = await supabase
        .from('places_cache')
        .select('place_id, data')
        .in('place_id', placeIds)
        .gt('expires_at', new Date().toISOString());

      if (error) {
        Logger.warn('CACHE', 'Supabase places cache fetch failed', { error: error.message });
        return new Map();
      }

      const result = new Map<string, GooglePlace>();
      (data || []).forEach(row => {
        result.set(row.place_id, row.data as GooglePlace);
      });

      if (result.size > 0) {
        Logger.info('CACHE', `Supabase L2 place cache: ${result.size} hits`, {
          requested: placeIds.length,
          found: result.size
        });
      }

      return result;
    } catch (e) {
      Logger.warn('CACHE', 'Supabase places cache exception', { error: e });
      return new Map();
    }
  },

  /**
   * Save places to Supabase cache (shared across all users)
   * Uses upsert to handle duplicates
   */
  async cachePlaces(places: GooglePlace[]): Promise<void> {
    if (places.length === 0) return;

    try {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7); // 7-day TTL

      const records = places.map(p => ({
        place_id: p.place_id,
        name: p.name,
        data: p,
        lat: p.geometry?.location ? 
          (typeof p.geometry.location.lat === 'function' ? p.geometry.location.lat() : p.geometry.location.lat) : null,
        lng: p.geometry?.location ? 
          (typeof p.geometry.location.lng === 'function' ? p.geometry.location.lng() : p.geometry.location.lng) : null,
        expires_at: expiresAt.toISOString(),
      }));

      const { error } = await supabase
        .from('places_cache')
        .upsert(records, { onConflict: 'place_id' });

      if (error) {
        Logger.warn('CACHE', 'Supabase places cache save failed', { error: error.message });
      } else {
        Logger.info('CACHE', `Saved ${places.length} places to Supabase L2 cache`);
      }
    } catch (e) {
      Logger.warn('CACHE', 'Supabase places cache save exception', { error: e });
    }
  },

  /**
   * Get cached distances from Supabase (shared across all users)
   * Origin coordinates are rounded to 4 decimal places (~11m precision)
   */
  async getCachedDistances(
    originLat: number, 
    originLng: number, 
    placeIds: string[]
  ): Promise<Map<string, CachedDuration>> {
    if (placeIds.length === 0) return new Map();

    try {
      // Round to 4 decimal places for cache key matching
      const roundedLat = Math.round(originLat * 10000) / 10000;
      const roundedLng = Math.round(originLng * 10000) / 10000;

      const { data, error } = await supabase
        .from('distances_cache')
        .select('place_id, duration_text, duration_value')
        .eq('origin_lat', roundedLat)
        .eq('origin_lng', roundedLng)
        .in('place_id', placeIds)
        .gt('expires_at', new Date().toISOString());

      if (error) {
        Logger.warn('CACHE', 'Supabase distances cache fetch failed', { error: error.message });
        return new Map();
      }

      const result = new Map<string, CachedDuration>();
      (data || []).forEach(row => {
        result.set(row.place_id, {
          text: row.duration_text,
          value: row.duration_value,
        });
      });

      if (result.size > 0) {
        Logger.info('CACHE', `Supabase L2 distance cache: ${result.size} hits`, {
          origin: `${roundedLat},${roundedLng}`,
          requested: placeIds.length,
          found: result.size
        });
      }

      return result;
    } catch (e) {
      Logger.warn('CACHE', 'Supabase distances cache exception', { error: e });
      return new Map();
    }
  },

  /**
   * Save distances to Supabase cache (shared across all users)
   */
  async cacheDistances(
    originLat: number,
    originLng: number,
    distances: Map<string, CachedDuration>
  ): Promise<void> {
    if (distances.size === 0) return;

    try {
      const roundedLat = Math.round(originLat * 10000) / 10000;
      const roundedLng = Math.round(originLng * 10000) / 10000;
      
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7); // 7-day TTL

      const records: Array<{
        origin_lat: number;
        origin_lng: number;
        place_id: string;
        duration_text: string;
        duration_value: number;
        expires_at: string;
      }> = [];

      distances.forEach((duration, placeId) => {
        records.push({
          origin_lat: roundedLat,
          origin_lng: roundedLng,
          place_id: placeId,
          duration_text: duration.text,
          duration_value: duration.value,
          expires_at: expiresAt.toISOString(),
        });
      });

      const { error } = await supabase
        .from('distances_cache')
        .upsert(records, { onConflict: 'origin_lat,origin_lng,place_id' });

      if (error) {
        Logger.warn('CACHE', 'Supabase distances cache save failed', { error: error.message });
      } else {
        Logger.info('CACHE', `Saved ${distances.size} distances to Supabase L2 cache`);
      }
    } catch (e) {
      Logger.warn('CACHE', 'Supabase distances cache save exception', { error: e });
    }
  },
};

export default SupabaseService;

