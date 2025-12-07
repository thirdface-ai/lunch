/**
 * Vercel Analytics Custom Events
 * 
 * Track key user interactions to understand usage patterns
 * and improve the lunch decision experience.
 */
import { track } from '@vercel/analytics';
import { HungerVibe, TransportMode, PricePoint, DietaryRestriction } from '../types';

/**
 * Extract city from address string for analytics
 * e.g., "123 Main St, Berlin, Germany" -> "Berlin"
 */
const extractCity = (address: string): string => {
  if (!address) return 'unknown';
  const parts = address.split(',').map(p => p.trim());
  // Usually city is second-to-last or third-to-last part
  if (parts.length >= 2) {
    // Skip postal codes (numbers) and country names
    for (let i = parts.length - 2; i >= 0; i--) {
      const part = parts[i];
      if (part && !/^\d+$/.test(part) && part.length > 2) {
        return part;
      }
    }
  }
  return parts[0] || 'unknown';
};

/**
 * Track when user initiates a food search
 */
export const trackSearchInitiated = (params: {
  vibe: HungerVibe | null;
  freestylePrompt: string;
  transportMode: TransportMode;
  pricePoint: PricePoint | null;
  address: string;
  dietaryRestrictions: DietaryRestriction[];
}) => {
  track('search_initiated', {
    vibe: params.vibe || 'none',
    has_freestyle: params.freestylePrompt.trim().length > 0,
    freestyle_length: params.freestylePrompt.trim().length,
    transport_mode: params.transportMode,
    price_point: params.pricePoint || 'any',
    city: extractCity(params.address),
    dietary_count: params.dietaryRestrictions.length,
    has_dietary: params.dietaryRestrictions.length > 0,
  });
};

/**
 * Track when search completes successfully
 */
export const trackSearchCompleted = (params: {
  resultCount: number;
  durationMs: number;
  vibe: HungerVibe | null;
  city: string;
}) => {
  track('search_completed', {
    result_count: params.resultCount,
    duration_seconds: Math.round(params.durationMs / 1000),
    vibe: params.vibe || 'none',
    city: extractCity(params.city),
  });
};

/**
 * Track when user selects a vibe
 */
export const trackVibeSelected = (vibe: HungerVibe | null, previousVibe: HungerVibe | null) => {
  track('vibe_selected', {
    vibe: vibe || 'cleared',
    previous_vibe: previousVibe || 'none',
    is_toggle_off: vibe === null && previousVibe !== null,
  });
};

/**
 * Track transport mode changes
 */
export const trackTransportModeChanged = (mode: TransportMode) => {
  track('transport_mode_changed', {
    mode: mode,
  });
};

/**
 * Track price point selection
 */
export const trackPricePointSelected = (price: PricePoint | null) => {
  track('price_point_selected', {
    price: price || 'any',
  });
};

/**
 * Track dietary restriction toggle
 */
export const trackDietaryToggled = (restriction: DietaryRestriction, isAdding: boolean) => {
  track('dietary_toggled', {
    restriction: restriction,
    action: isAdding ? 'added' : 'removed',
  });
};

/**
 * Track when user clicks to open a restaurant
 */
export const trackRestaurantClicked = (params: {
  placeName: string;
  placeId: string;
  rating: number | undefined;
  rank: number; // 1, 2, or 3
  city: string;
}) => {
  track('restaurant_clicked', {
    place_name: params.placeName,
    rating: params.rating || 0,
    rank: params.rank,
    city: extractCity(params.city),
  });
};

/**
 * Track when user resets to start over
 */
export const trackSearchReset = (fromState: 'results' | 'processing' | 'error') => {
  track('search_reset', {
    from_state: fromState,
  });
};

/**
 * Track geolocation usage
 */
export const trackLocationDetected = (success: boolean, city?: string) => {
  track('location_detected', {
    success: success,
    city: city ? extractCity(city) : 'failed',
  });
};

/**
 * Track theme toggle
 */
export const trackThemeToggled = (newTheme: 'light' | 'dark') => {
  track('theme_toggled', {
    theme: newTheme,
  });
};

/**
 * Track search errors
 */
export const trackSearchError = (errorType: string, errorMessage: string) => {
  track('search_error', {
    error_type: errorType,
    error_message: errorMessage.substring(0, 100), // Truncate long messages
  });
};

/**
 * Track freestyle prompt usage (what people are searching for)
 */
export const trackFreestylePromptUsed = (prompt: string, city: string) => {
  // Extract key food terms for analytics (privacy-conscious)
  const foodKeywords = ['pizza', 'sushi', 'burger', 'ramen', 'thai', 'indian', 'mexican', 
    'chinese', 'korean', 'vietnamese', 'italian', 'french', 'japanese', 'greek', 
    'turkish', 'kebab', 'curry', 'noodles', 'salad', 'vegan', 'vegetarian', 
    'healthy', 'cheap', 'fancy', 'quick', 'best', 'bagel', 'coffee', 'breakfast',
    'brunch', 'lunch', 'dinner', 'steak', 'seafood', 'pasta', 'tacos'];
  
  const promptLower = prompt.toLowerCase();
  const matchedKeywords = foodKeywords.filter(kw => promptLower.includes(kw));
  
  track('freestyle_prompt_used', {
    prompt_length: prompt.length,
    keyword_count: matchedKeywords.length,
    keywords: matchedKeywords.slice(0, 5).join(','), // Top 5 keywords
    city: extractCity(city),
  });
};

/**
 * Track walk limit selection
 */
export const trackWalkLimitChanged = (limit: string) => {
  track('walk_limit_changed', {
    limit: limit,
  });
};
