import { supabase, getSessionId } from '../lib/supabase';
import { 
  FinalResult, 
  UserPreferences,
  SearchHistoryRecord
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
   * @param limit Number of recent recommendations to fetch (default: 15 = ~5 searches)
   */
  async getRecentlyRecommendedIds(limit = 15): Promise<Set<string>> {
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
};

export default SupabaseService;

