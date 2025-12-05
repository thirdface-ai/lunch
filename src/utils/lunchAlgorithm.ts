import { HungerVibe, PricePoint, GooglePlace } from '../types';

/**
 * Cuisine intent detection result
 */
export interface CuisineIntent {
  isCuisineSpecific: boolean;
  cuisineType?: string;
  searchQueries: string[];
}

/**
 * Cuisine keywords mapping - maps cuisine types to search queries
 * The first keyword in each array is used for detection
 */
const CUISINE_KEYWORDS: Record<string, string[]> = {
  ramen: ['ramen', 'ramen shop', 'japanese ramen', 'ramen restaurant'],
  sushi: ['sushi', 'sushi restaurant', 'japanese sushi', 'sushi bar'],
  pizza: ['pizza', 'pizzeria', 'italian pizza', 'pizza restaurant'],
  burger: ['burger', 'burger joint', 'hamburger', 'burger restaurant'],
  tacos: ['tacos', 'taco shop', 'mexican tacos', 'taqueria'],
  pho: ['pho', 'pho restaurant', 'vietnamese pho', 'pho noodles'],
  curry: ['curry', 'curry house', 'indian curry', 'thai curry'],
  pasta: ['pasta', 'italian pasta', 'pasta restaurant', 'italian restaurant'],
  korean: ['korean', 'korean restaurant', 'korean bbq', 'korean food'],
  thai: ['thai', 'thai restaurant', 'thai food', 'thai cuisine'],
  indian: ['indian', 'indian restaurant', 'indian food', 'indian cuisine'],
  chinese: ['chinese', 'chinese restaurant', 'chinese food', 'dim sum'],
  vietnamese: ['vietnamese', 'vietnamese restaurant', 'vietnamese food', 'banh mi'],
  mexican: ['mexican', 'mexican restaurant', 'mexican food', 'burrito'],
  mediterranean: ['mediterranean', 'mediterranean restaurant', 'greek food', 'falafel'],
  kebab: ['kebab', 'doner', 'kebab shop', 'shawarma'],
  sashimi: ['sashimi', 'sashimi restaurant', 'japanese sashimi', 'raw fish'],
  udon: ['udon', 'udon noodles', 'japanese udon', 'udon restaurant'],
  dumpling: ['dumpling', 'dumplings', 'dumpling house', 'gyoza'],
  noodles: ['noodles', 'noodle shop', 'noodle restaurant', 'asian noodles'],
  bbq: ['bbq', 'barbecue', 'bbq restaurant', 'grill'],
  seafood: ['seafood', 'seafood restaurant', 'fish restaurant', 'oyster bar'],
  steak: ['steak', 'steakhouse', 'steak restaurant', 'grill house'],
  brunch: ['brunch', 'brunch spot', 'brunch restaurant', 'breakfast'],
  vegan: ['vegan', 'vegan restaurant', 'plant-based', 'vegan food'],
  vegetarian: ['vegetarian', 'vegetarian restaurant', 'veggie', 'vegetarian food'],
};

/**
 * Detect if the user's query is asking for a specific cuisine type
 * Returns cuisine-specific search queries if detected, otherwise general queries
 */
export const detectCuisineIntent = (query: string): CuisineIntent => {
  if (!query || query.trim().length === 0) {
    return { isCuisineSpecific: false, searchQueries: ['restaurant', 'lunch'] };
  }

  const lower = query.toLowerCase().trim();
  
  // Check each cuisine type
  for (const [cuisineType, keywords] of Object.entries(CUISINE_KEYWORDS)) {
    // Check if query contains the primary keyword (first in array)
    const primaryKeyword = keywords[0];
    if (lower.includes(primaryKeyword)) {
      return {
        isCuisineSpecific: true,
        cuisineType,
        searchQueries: keywords,
      };
    }
  }
  
  // Not a specific cuisine - return the original query with fallbacks
  return {
    isCuisineSpecific: false,
    searchQueries: [query, 'restaurant', 'cafe'],
  };
};

/**
 * Parse time string like "11:00 AM", "2:30 PM", "14:00" into minutes since midnight
 */
const parseTimeToMinutes = (timeStr: string): number | null => {
  const cleaned = timeStr.trim().toLowerCase();
  
  // Handle 24-hour format (e.g., "14:00")
  const match24 = cleaned.match(/^(\d{1,2}):(\d{2})$/);
  if (match24) {
    const hours = parseInt(match24[1], 10);
    const minutes = parseInt(match24[2], 10);
    return hours * 60 + minutes;
  }
  
  // Handle 12-hour format (e.g., "2:30 pm", "11:00 am")
  const match12 = cleaned.match(/^(\d{1,2}):(\d{2})\s*(am|pm)$/);
  if (match12) {
    let hours = parseInt(match12[1], 10);
    const minutes = parseInt(match12[2], 10);
    const period = match12[3];
    
    if (period === 'pm' && hours !== 12) hours += 12;
    if (period === 'am' && hours === 12) hours = 0;
    
    return hours * 60 + minutes;
  }
  
  return null;
};

/**
 * Parse today's hours string like "11:00 AM – 10:00 PM" into open/close minutes
 */
const parseTodaysHours = (todaysHours: string): { openMinutes: number; closeMinutes: number } | null => {
  const cleaned = todaysHours.trim().toLowerCase();
  if (cleaned === 'closed') return null;
  if (cleaned === 'open 24 hours') return { openMinutes: 0, closeMinutes: 24 * 60 };
  
  // Split by common separators: "–", "-", "to"
  const parts = todaysHours.split(/\s*[–\-]\s*|\s+to\s+/i);
  if (parts.length !== 2) return null;
  
  const openMinutes = parseTimeToMinutes(parts[0]);
  const closeMinutes = parseTimeToMinutes(parts[1]);
  
  if (openMinutes === null || closeMinutes === null) return null;
  
  return { openMinutes, closeMinutes };
};

/**
 * Get today's hours string from weekday_text array
 */
const getTodaysHoursString = (weekdayText: string[] | undefined): string | null => {
  if (!weekdayText || weekdayText.length === 0) return null;
  
  // Get today's day name in the browser's locale (to match Google's format)
  const browserLocale = typeof navigator !== 'undefined' ? navigator.language : 'en-US';
  const todayName = new Date().toLocaleDateString(browserLocale, { weekday: 'long' });
  
  // Find today's entry
  const todayEntry = weekdayText.find(
    text => text.toLowerCase().startsWith(todayName.toLowerCase())
  );
  
  if (!todayEntry) return null;
  
  // Extract hours part (after the colon)
  const colonIndex = todayEntry.indexOf(':');
  if (colonIndex === -1) return null;
  
  return todayEntry.substring(colonIndex + 1).trim();
};

/**
 * Check if a place will be open when the user arrives (current time + walking time)
 * Returns true if:
 * - Place is currently open, OR
 * - Place will be open by the time user walks there
 */
export const willBeOpenOnArrival = (
  place: GooglePlace,
  walkingTimeSeconds: number | undefined
): boolean => {
  // If no opening hours data, assume open (don't filter out)
  if (!place.opening_hours) return true;
  
  // If currently open, good to go
  if (place.opening_hours.open_now) return true;
  
  // Get today's hours
  const todaysHoursStr = getTodaysHoursString(place.opening_hours.weekday_text);
  if (!todaysHoursStr) return true; // No data, assume open
  
  const hours = parseTodaysHours(todaysHoursStr);
  if (!hours) return true; // Can't parse, assume open
  
  // Calculate arrival time
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const walkingMinutes = walkingTimeSeconds ? Math.ceil(walkingTimeSeconds / 60) : 0;
  const arrivalMinutes = currentMinutes + walkingMinutes;
  
  // Handle overnight hours (e.g., 6pm - 2am)
  if (hours.closeMinutes < hours.openMinutes) {
    // Place closes after midnight
    // Open if arrival is after open time OR before close time (next day)
    return arrivalMinutes >= hours.openMinutes || arrivalMinutes < hours.closeMinutes;
  }
  
  // Normal hours: check if arrival time falls within open hours
  // Also allow if the place opens within the walking time window
  return arrivalMinutes >= hours.openMinutes && arrivalMinutes < hours.closeMinutes;
};

/**
 * Filter places to only those that will be open on arrival
 */
export const filterByOpenOnArrival = (
  places: GooglePlace[],
  durations: Map<string, { text: string; value: number }>
): GooglePlace[] => {
  return places.filter(place => {
    const duration = durations.get(place.place_id);
    return willBeOpenOnArrival(place, duration?.value);
  });
};

/**
 * Generate search queries based on the user's vibe
 */
export const getSearchQueriesForVibe = (vibe: HungerVibe | null): string[] => {
  if (!vibe) return ['restaurant', 'lunch', 'food', 'new opening'];

  let queries: string[];
  switch (vibe) {
    case HungerVibe.GRAB_AND_GO:
      queries = ['quick bites', 'takeout food', 'food truck', 'bakery', 'new opening'];
      break;
    case HungerVibe.LIGHT_AND_CLEAN:
      queries = ['healthy restaurant', 'salad bar', 'sushi', 'vietnamese restaurant', 'new opening'];
      break;
    case HungerVibe.HEARTY_AND_RICH:
      queries = ['comfort food', 'ramen shop', 'burger joint', 'italian restaurant', 'new opening'];
      break;
    case HungerVibe.SPICY_AND_BOLD:
      queries = ['spicy food', 'thai restaurant', 'indian restaurant', 'sichuan cuisine', 'new opening'];
      break;
    case HungerVibe.VIEW_AND_VIBE:
      queries = ['restaurant with a view', 'rooftop restaurant', 'beautiful restaurant', 'new opening'];
      break;
    case HungerVibe.AUTHENTIC_AND_CLASSIC:
      queries = ['classic diner', 'traditional cuisine', 'historic restaurant'];
      break;
    default:
      queries = ['restaurant', 'new opening'];
  }
  return [...queries, 'restaurant'];
};

/**
 * Calculate candidate score for ranking
 */
export const calculateCandidateScore = (
  p: GooglePlace,
  price: PricePoint | null,
  durationSeconds: number | undefined,
  maxDurationSeconds: number
): number => {
  let score = 0;
  const MAX_PROXIMITY_SCORE = 15;

  // 1. Proximity Score (Weight: 15)
  if (durationSeconds !== undefined) {
    const proximityRatio = durationSeconds / maxDurationSeconds;
    const proximityScore = MAX_PROXIMITY_SCORE * (1 - proximityRatio);
    score += Math.max(0, proximityScore);
  }
  
  // 2. Price Match Score (Weight: 10)
  const priceLevel = p.price_level;
  let priceMatchScore = 0;
  if (priceLevel !== undefined && price !== null) {
    switch (price) {
      case PricePoint.PAYING_MYSELF:
        // $ and $$ (price_level 1-2)
        if (priceLevel <= 2) priceMatchScore = 10;
        else if (priceLevel === 3) priceMatchScore = 2;
        else priceMatchScore = -5;
        break;
      case PricePoint.COMPANY_CARD:
        // $$$ and $$$$ (price_level 3-4)
        if (priceLevel >= 3) priceMatchScore = 10;
        else if (priceLevel === 2) priceMatchScore = 5;
        else priceMatchScore = -3;
        break;
    }
  } else {
    // Neutral/High score if no price preference or no data
    priceMatchScore = 7; 
  }
  score += priceMatchScore;

  const rating = p.rating || 0;
  const reviews = p.user_ratings_total || 0;

  // 3. "Hidden Gem" Score (Weight: 5)
  if (rating > 4.3 && reviews >= 50 && reviews < 750) {
    score += 5;
  }

  // 4. "Fresh Drop" Score (Weight: 8)
  if (rating >= 4.0 && reviews < 50 && reviews > 0) {
    score += 8;
  }

  // 5. Raw Rating Score (Weight: 1 per star)
  score += rating;

  return score;
};

/**
 * Shuffle array using Fisher-Yates algorithm
 */
export const shuffleArray = <T>(array: T[]): T[] => {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
};

/**
 * Get walk time configuration based on limit
 */
export const getWalkConfig = (walkLimit: string): { radius: number; maxDurationSeconds: number } => {
  switch (walkLimit) {
    case '5 min':
      return { radius: 1000, maxDurationSeconds: 300 };
    case '15 min':
      return { radius: 2500, maxDurationSeconds: 900 };
    case '30 min':
    default:
      return { radius: 5000, maxDurationSeconds: 2400 };
  }
};
