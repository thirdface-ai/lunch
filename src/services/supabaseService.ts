import { supabase, getSessionId } from '../lib/supabase';
import type { Json } from '../lib/database.types';
import { 
  FinalResult, 
  UserPreferences,
  SearchHistoryRecord,
  FavoriteRecord
} from '../types';

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
   * Add a place to favorites
   */
  async addFavorite(result: FinalResult): Promise<boolean> {
    try {
      const record = {
        session_id: getSessionId(),
        place_id: result.place_id,
        place_name: result.name,
        place_rating: result.rating || null,
        place_address: result.vicinity || null,
        ai_reason: result.ai_reason || null,
        recommended_dish: result.recommended_dish || null,
        walking_time_text: result.walking_time_text || null,
        metadata: {
          types: result.types,
          price_level: result.price_level,
          is_new_opening: result.is_new_opening,
        } as Json,
      };

      const { error } = await supabase
        .from('favorites')
        .upsert([record], { onConflict: 'place_id' });

      if (error) {
        console.warn('Failed to add favorite:', error.message);
        return false;
      }

      return true;
    } catch (e) {
      console.warn('Add favorite exception:', e);
      return false;
    }
  },

  /**
   * Remove a place from favorites
   */
  async removeFavorite(placeId: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('favorites')
        .delete()
        .eq('place_id', placeId)
        .eq('session_id', getSessionId());

      if (error) {
        console.warn('Failed to remove favorite:', error.message);
        return false;
      }

      return true;
    } catch (e) {
      console.warn('Remove favorite exception:', e);
      return false;
    }
  },

  /**
   * Get all favorites for current session
   */
  async getFavorites(): Promise<FavoriteRecord[]> {
    try {
      const { data, error } = await supabase
        .from('favorites')
        .select('*')
        .eq('session_id', getSessionId())
        .order('created_at', { ascending: false });

      if (error) {
        console.warn('Failed to fetch favorites:', error.message);
        return [];
      }

      // Cast metadata from Json to Record<string, unknown> | null
      return (data || []).map(row => ({
        ...row,
        metadata: row.metadata as Record<string, unknown> | null,
      }));
    } catch (e) {
      console.warn('Fetch favorites exception:', e);
      return [];
    }
  },

  /**
   * Check if a place is favorited
   */
  async isFavorite(placeId: string): Promise<boolean> {
    try {
      const { data, error } = await supabase
        .from('favorites')
        .select('id')
        .eq('place_id', placeId)
        .eq('session_id', getSessionId())
        .single();

      if (error && error.code !== 'PGRST116') {
        // PGRST116 is "no rows returned"
        console.warn('Failed to check favorite:', error.message);
      }

      return !!data;
    } catch (e) {
      return false;
    }
  },

  /**
   * Get favorited place IDs for quick lookup
   */
  async getFavoriteIds(): Promise<Set<string>> {
    try {
      const { data, error } = await supabase
        .from('favorites')
        .select('place_id')
        .eq('session_id', getSessionId());

      if (error) {
        console.warn('Failed to fetch favorite IDs:', error.message);
        return new Set();
      }

      return new Set((data || []).map(f => f.place_id));
    } catch (e) {
      return new Set();
    }
  },
};

export default SupabaseService;

