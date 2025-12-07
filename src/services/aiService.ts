import { GooglePlace, HungerVibe, GeminiRecommendation, PricePoint, DietaryRestriction } from '../types';
import Logger from '../utils/logger';
import { supabase } from '../lib/supabase';
import { getOpenStatusScore } from '../utils/lunchAlgorithm';

// Replicating Type definition locally to avoid importing the full SDK on client
export enum Type {
  TYPE_UNSPECIFIED = 'TYPE_UNSPECIFIED',
  STRING = 'STRING',
  NUMBER = 'NUMBER',
  INTEGER = 'INTEGER',
  BOOLEAN = 'BOOLEAN',
  ARRAY = 'ARRAY',
  OBJECT = 'OBJECT',
  NULL = 'NULL',
}

// Model tiers for different complexity tasks
// https://openrouter.ai/anthropic/claude-opus-4.5
// Heavy lifting: Complex analysis requiring deep reasoning (restaurant ranking, review analysis)
// Claude Opus 4.5 - $5/M input, $25/M output - frontier reasoning model
const AI_MODEL_HEAVY = 'anthropic/claude-opus-4.5';

// https://openrouter.ai/anthropic/claude-sonnet-4.5
// Light tasks: Simple classification, translation, generation (query translation, loading logs)
// Claude Sonnet 4.5 - $3/M input, $15/M output - optimized for agents and coding
const AI_MODEL_LIGHT = 'anthropic/claude-sonnet-4.5';

// Callback type for real-time logging during analysis
export type AnalysisLogCallback = (message: string) => void;

// Result from AI query translation
export interface TranslatedSearchIntent {
  searchQueries: string[];      // Queries for Google Places API
  newlyOpenedOnly?: boolean;    // User wants new restaurants
  popularOnly?: boolean;        // User wants trending/popular spots
  cuisineType?: string;         // Detected cuisine preference
  originalPrompt: string;       // Original user input
}

/**
 * Clean common JSON issues from AI responses.
 * AI models occasionally produce malformed JSON that needs cleanup before parsing.
 */
const cleanJsonResponse = (jsonText: string): string => {
  // 1. Remove trailing commas before ] or } (e.g., ["item",] → ["item"])
  //    This is a common AI mistake: generating ["a", "b",] instead of ["a", "b"]
  let cleaned = jsonText.replace(/,(\s*[\]}])/g, '$1');
  
  // 2. Remove any control characters that might slip through (except newlines/tabs)
  cleaned = cleaned.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, ' ');
  
  return cleaned;
};

/**
 * Extract JSON from AI response that may contain extra text before/after.
 * AI sometimes adds commentary around the JSON we need.
 */
const extractJsonFromResponse = (text: string): string => {
  // Find the first occurrence of [ or {
  const firstBracket = text.indexOf('[');
  const firstBrace = text.indexOf('{');
  
  // Determine if we're looking for an array or object based on what comes first
  const isArray = firstBracket !== -1 && (firstBrace === -1 || firstBracket < firstBrace);
  
  if (isArray) {
    // Extract array [...] (prioritize array if it comes first)
    const arrayMatch = text.match(/\[[\s\S]*\]/);
    if (arrayMatch) {
      return arrayMatch[0];
    }
  } else if (firstBrace !== -1) {
    // Extract object {...}
    const objectMatch = text.match(/\{[\s\S]*\}/);
    if (objectMatch) {
      return objectMatch[0];
    }
  }
  
  // No JSON found, return original
  return text;
};

/**
 * AI-powered translation of freestyle prompts into Google Places search queries
 * 
 * Handles vague requests like "newest hottest places" by understanding intent
 * and generating appropriate search queries that Google Places can understand.
 */
export const translateSearchIntent = async (
  freestylePrompt: string,
  vibe: HungerVibe | null
): Promise<TranslatedSearchIntent> => {
  const trimmedPrompt = freestylePrompt.trim();
  
  // Skip AI for empty prompts
  if (!trimmedPrompt) {
    return {
      searchQueries: [],
      originalPrompt: trimmedPrompt,
    };
  }

  Logger.info('AI', 'Translating search intent', { prompt: trimmedPrompt, vibe });

  const prompt = `Translate user food request into Google Places search queries.

INPUT: "${trimmedPrompt}"${vibe ? ` | VIBE: ${vibe}` : ''}

CRITICAL RULES:
1. Generate exactly 3 DIVERSE search queries
2. NEVER include generic words: "restaurant", "food", "near", "nearby", "me", "delivery", "takeout"
3. Focus on CUISINE TYPE and DISH NAMES that distinguish places

STRATEGY - Create 3 distinct angles:
1. SPECIFIC DISH: The exact food item (e.g., "schnitzel", "ramen", "kebab")
2. CUISINE TYPE: The cuisine category (e.g., "german", "japanese", "turkish") 
3. RELATED STYLE: Related cuisine or cooking style (e.g., "austrian", "noodle bar", "mediterranean grill")

EXAMPLES:
- "turkish food" → ["turkish", "kebab", "mediterranean grill"]
- "steak" → ["steak", "steakhouse", "american grill"]
- "pizza" → ["pizza", "pizzeria", "italian"]
- "sushi" → ["sushi", "sushi bar", "japanese"]
- "healthy food" → ["salad bar", "poke bowl", "mediterranean"]
- "schnitzel" → ["schnitzel", "german", "austrian"]

BAD: ["turkish restaurant near me", "turkish food delivery"] ❌ (generic words)
GOOD: ["turkish", "kebab", "mediterranean grill"] ✅ (specific & diverse)

OUTPUT JSON:
{"searchQueries":["dish","cuisine","style"],"newlyOpenedOnly":bool|null,"popularOnly":bool|null,"cuisineType":"cuisine|null"}

Generate exactly 3 SPECIFIC queries. No generic words.`;

  try {
    const text = await callOpenRouterProxy(
      AI_MODEL_LIGHT, // Simple translation task - use lighter model
      prompt,
      {
        temperature: 0.3, // Low temp for consistent, reliable translation
        responseMimeType: 'application/json',
      }
    );

    if (!text || text.trim() === '') {
      Logger.warn('AI', 'Empty response from intent translation');
      return {
        searchQueries: [trimmedPrompt, 'restaurant'],
        originalPrompt: trimmedPrompt,
      };
    }

    // Parse JSON response - handle markdown blocks and extra text
    let jsonText = text.trim();
    if (jsonText.startsWith('```json')) {
      jsonText = jsonText.slice(7);
    } else if (jsonText.startsWith('```')) {
      jsonText = jsonText.slice(3);
    }
    if (jsonText.endsWith('```')) {
      jsonText = jsonText.slice(0, -3);
    }
    jsonText = jsonText.trim();
    
    // Extract JSON from potentially messy response and fix common issues
    jsonText = extractJsonFromResponse(jsonText);
    jsonText = cleanJsonResponse(jsonText);

    const result = JSON.parse(jsonText);
    
    Logger.info('AI', 'Search intent translated', { 
      original: trimmedPrompt,
      queries: result.searchQueries,
      newlyOpenedOnly: result.newlyOpenedOnly,
      popularOnly: result.popularOnly,
      cuisineType: result.cuisineType
    });

    return {
      searchQueries: result.searchQueries || [trimmedPrompt, 'restaurant'],
      newlyOpenedOnly: result.newlyOpenedOnly || undefined,
      popularOnly: result.popularOnly || undefined,
      cuisineType: result.cuisineType || undefined,
      originalPrompt: trimmedPrompt,
    };

  } catch (error) {
    Logger.error('AI', 'Intent translation failed', error);
    // Fallback: use original prompt with restaurant suffix
    return {
      searchQueries: [trimmedPrompt, `${trimmedPrompt} restaurant`, 'restaurant'],
      originalPrompt: trimmedPrompt,
    };
  }
};

/**
 * Filter cached places by user query using AI
 * 
 * This function analyzes cached restaurant data and filters places that match
 * the user's search intent. It uses the place's name, types, and editorial summary
 * to determine relevance.
 * 
 * @param places Array of cached GooglePlace objects
 * @param query User's search query (freestyle prompt or vibe)
 * @param vibe Optional HungerVibe for additional context
 * @returns Filtered array of places that match the query
 */
export const filterPlacesByQuery = async (
  places: GooglePlace[],
  query: string,
  vibe?: HungerVibe | null
): Promise<GooglePlace[]> => {
  if (!query || query.trim().length === 0 || places.length === 0) {
    return places;
  }

  const trimmedQuery = query.trim().toLowerCase();
  
  // Extract keywords from query for quick matching
  // This handles queries like "I want really good schnitzel with gravy" → ["schnitzel", "gravy"]
  // IMPORTANT: Generic words like "restaurant", "food", "near" must be filtered out
  // or they will match almost everything in the cache
  const stopWords = new Set([
    // Common request words
    'i', 'want', 'really', 'good', 'the', 'a', 'an', 'some', 'with', 'and', 'or', 'for', 'in', 'to', 'of', 
    'that', 'is', 'it', 'my', 'me', 'best', 'great', 'nice', 'please', 'something', 'like', 'looking', 
    'find', 'get', 'give', 'need', 'show', 'recommend', 'suggestion', 'should', 'must', 'can', 'would',
    // Location words (too generic)
    'near', 'nearby', 'around', 'close', 'here', 'local', 'area', 'place', 'places',
    // Generic food/restaurant words (match everything)
    'restaurant', 'restaurants', 'food', 'foods', 'eat', 'eating', 'meal', 'meals', 'cuisine',
    'dining', 'eatery', 'cafe', 'bistro', 'diner', 'spot', 'spots', 'joint', 'delivery', 'takeout',
    // Quality descriptors (not searchable)
    'healthy', 'tasty', 'delicious', 'fresh', 'authentic', 'traditional', 'modern', 'best', 'top',
    'quality', 'amazing', 'excellent', 'fantastic', 'wonderful', 'perfect', 'favorite', 'popular'
  ]);
  const queryWords = trimmedQuery
    .split(/\s+/)
    .filter(w => w.length >= 3 && !stopWords.has(w));
  
  // First pass: fast local filtering for obvious matches
  // This catches specific cuisine searches like "ramen", "sushi", "pizza", "schnitzel"
  const quickMatches: GooglePlace[] = [];
  const maybeMatches: GooglePlace[] = [];
  
  for (const place of places) {
    const nameLower = place.name.toLowerCase();
    const typesStr = (place.types || []).join(' ').toLowerCase();
    const summary = (place.editorial_summary?.overview || '').toLowerCase();
    const searchableText = `${nameLower} ${typesStr} ${summary}`;
    
    // Check if ANY keyword from query matches the place
    const hasKeywordMatch = queryWords.some(keyword => 
      searchableText.includes(keyword)
    );
    
    // Direct match - keyword found in name, types, or summary
    if (hasKeywordMatch) {
      quickMatches.push(place);
    }
    // For generic/vibe queries (no specific keywords found), include all for AI analysis
    else {
      maybeMatches.push(place);
    }
  }
  
  // Log quick match results
  Logger.info('AI', `Quick filter found ${quickMatches.length} keyword matches for "${trimmedQuery}"`, {
    total: places.length,
    quickMatches: quickMatches.length,
    keywords: queryWords
  });
  
  // If no meaningful keywords were extracted (all stop words), return empty
  // This prevents matching everything when query is too generic
  if (queryWords.length === 0) {
    Logger.warn('AI', 'No meaningful keywords extracted from query - using all places for AI analysis');
    // Fall through to AI analysis with limited candidates
  }
  
  // ALWAYS use AI to verify matches for cuisine-specific queries
  // The quick filter is just a pre-filter to reduce candidates, not a final answer
  // Prioritize quick matches but include some maybes for diversity
  const candidatesForAI = quickMatches.length > 0 
    ? [...quickMatches.slice(0, 40), ...maybeMatches.slice(0, 10)]  // Prioritize keyword matches
    : maybeMatches.slice(0, 50);  // No keywords? Let AI analyze all
  
  if (candidatesForAI.length === 0) {
    return [];
  }
  
  // Build compact place summaries for AI analysis
  const placeSummaries = candidatesForAI.map((p, i) => ({
    idx: i,
    name: p.name,
    types: (p.types || []).slice(0, 5).join(', '),
    summary: p.editorial_summary?.overview?.slice(0, 100) || '',
  }));

  const prompt = `Filter restaurants that ACTUALLY match the user's cuisine search. Be STRICT about cuisine type.

SEARCH: "${trimmedQuery}"${vibe ? ` | VIBE: ${vibe}` : ''}

RESTAURANTS:
${placeSummaries.map(p => `[${p.idx}] ${p.name} | ${p.types} | ${p.summary}`).join('\n')}

STRICT MATCHING RULES - Include ONLY if:
1. EXACT CUISINE: Restaurant type/name matches the searched cuisine
   - "turkish" → ONLY turkish_restaurant, kebab, döner, turkish in name
   - "japanese" → ONLY japanese_restaurant, sushi, ramen, izakaya
   - "italian" → ONLY italian_restaurant, pizzeria, trattoria
   - "german" → ONLY german_restaurant, bratwurst, schnitzel places
   
2. RELATED CUISINE (close match):
   - Turkish → Mediterranean, Middle Eastern, Lebanese (similar region)
   - Japanese → Poke (Hawaii-Japanese), Korean (East Asian)
   - Italian → Mediterranean
   - German → Austrian, Swiss, European

3. DISH-SPECIFIC: If searching for a dish, include places that serve it:
   - "kebab" → Turkish, Middle Eastern, Greek
   - "schnitzel" → German, Austrian, European
   - "ramen" → Japanese, noodle bars

DO NOT INCLUDE:
- Generic restaurants without clear cuisine match
- Thai restaurant for Turkish search (completely different cuisine!)
- Random food trucks unless they match the cuisine

OUTPUT: {"matches":[indices of MATCHING restaurants only]}
If no matches, return: {"matches":[]}`;


  try {
    const text = await callOpenRouterProxy(
      AI_MODEL_LIGHT, // Simple filtering task
      prompt,
      {
        temperature: 0.2, // Low temp for consistent filtering
        responseMimeType: 'application/json',
      }
    );

    if (!text || text.trim() === '') {
      Logger.warn('AI', 'Empty response from place filter');
      return quickMatches.length > 0 ? quickMatches : candidatesForAI.slice(0, 10);
    }

    // Parse JSON response - handle markdown blocks and extra text
    let jsonText = text.trim();
    if (jsonText.startsWith('```json')) {
      jsonText = jsonText.slice(7);
    } else if (jsonText.startsWith('```')) {
      jsonText = jsonText.slice(3);
    }
    if (jsonText.endsWith('```')) {
      jsonText = jsonText.slice(0, -3);
    }
    jsonText = jsonText.trim();
    
    // Extract JSON from potentially messy response (AI sometimes adds extra text)
    jsonText = extractJsonFromResponse(jsonText);
    jsonText = cleanJsonResponse(jsonText);

    const result = JSON.parse(jsonText);
    const matchingIndices: number[] = result.matches || [];
    
    // Map indices back to places
    const filteredPlaces = matchingIndices
      .filter(idx => idx >= 0 && idx < candidatesForAI.length)
      .map(idx => candidatesForAI[idx]);

    Logger.info('AI', `Filtered ${filteredPlaces.length} places for "${trimmedQuery}"`, {
      total: places.length,
      analyzed: candidatesForAI.length,
      matched: filteredPlaces.length
    });

    return filteredPlaces;

  } catch (error) {
    Logger.error('AI', 'Place filtering failed', error);
    // Fallback: return quick matches or first 10 candidates
    return quickMatches.length > 0 ? quickMatches : candidatesForAI.slice(0, 10);
  }
};

// Internal helper to call the Supabase Edge Function
const callOpenRouterProxy = async (model: string, contents: string, config: Record<string, unknown>): Promise<string> => {
  const startTime = performance.now();
  Logger.aiRequest(model, contents.substring(0, 500) + '...');

  try {
    const { data, error } = await supabase.functions.invoke('openrouter-proxy', {
      body: { model, contents, config },
    });

    if (error) {
      throw new Error(error.message || 'Edge Function invocation failed');
    }

    if (!data) {
      throw new Error('No data returned from OpenRouter proxy');
    }

    if (!data.text) {
      throw new Error(`Invalid response from OpenRouter proxy: ${JSON.stringify(data)}`);
    }

    const duration = Math.round(performance.now() - startTime);
    const estimatedTokens = data.text ? Math.ceil(data.text.length / 4) : 0;
    
    Logger.aiResponse(model, duration, true, estimatedTokens);

    return data.text;
  } catch (error) {
    const duration = Math.round(performance.now() - startTime);
    Logger.error('AI', `OpenRouter Proxy Call Failed (${duration}ms)`, error);
    throw error;
  }
};

export const generateLoadingLogs = async (
  vibe: HungerVibe | null, 
  address: string,
  freestylePrompt?: string
): Promise<string[]> => {
  const vibeText = vibe || 'good food';
  const searchQuery = freestylePrompt || vibeText;
  Logger.info('AI', 'Generating Loading Logs', { vibe: vibeText, address, freestylePrompt });

  // Extract neighborhood/city from address for localized references
  const locationParts = address ? address.split(',') : ['the area'];
  const neighborhood = locationParts[0]?.trim() || 'your area';
  const city = locationParts[1]?.trim() || '';

  const prompt = `Generate 15 funny loading messages. Location: "${neighborhood}"${city ? `, ${city}` : ''}. Search: "${searchQuery}".

STYLES (mix all):
- Local roasts: neighborhood stereotypes, landmarks, "ASKING ${neighborhood.toUpperCase()} HIPSTERS..."
- Food absurdity: "${searchQuery.toUpperCase()}-TO-REGRET RATIO...", "VIBE CHECK..."
- Self-aware AI: "PRETENDING TO THINK HARDER...", "RESISTING URGE TO RECOMMEND SAME 3 PLACES..."
- Relatable: "ELIMINATING SUSPICIOUSLY PERFECT 5.0 RATINGS...", "IGNORING 'GREAT ATMOSPHERE' REVIEWS..."

FORMAT: ALL CAPS, <10 words, end "...", no emojis. Reference location/search in 6+ messages.

Return ONLY a valid JSON array of 15 strings. No trailing commas. Example: ["MSG1...", "MSG2..."]`;

  try {
    const text = await callOpenRouterProxy(
      AI_MODEL_LIGHT, // Creative but simple task - use lighter model
      prompt,
      {
        temperature: 0.9, // Higher temp for more creative/varied responses
        responseMimeType: 'application/json',
      }
    );
    
    if (!text || text.trim() === '') {
      Logger.warn('AI', 'Empty response for loading logs, using fallbacks');
      return getDefaultLoadingMessages();
    }
    
    // Extract JSON from response (handle markdown code blocks and extra text)
    let jsonText = text.trim();
    if (jsonText.startsWith('```json')) {
      jsonText = jsonText.slice(7);
    } else if (jsonText.startsWith('```')) {
      jsonText = jsonText.slice(3);
    }
    if (jsonText.endsWith('```')) {
      jsonText = jsonText.slice(0, -3);
    }
    jsonText = jsonText.trim();
    
    // Extract JSON from potentially messy response and fix common issues
    jsonText = extractJsonFromResponse(jsonText);
    jsonText = cleanJsonResponse(jsonText);
    
    const messages = JSON.parse(jsonText) as string[];
    
    // Validate we got an array of strings
    if (!Array.isArray(messages) || messages.length === 0) {
      Logger.warn('AI', 'Invalid loading logs format, using fallbacks', { response: text.substring(0, 200) });
      return getDefaultLoadingMessages();
    }
    
    // Filter to only valid string messages
    const validMessages = messages.filter(m => typeof m === 'string' && m.length > 0);
    
    if (validMessages.length >= 8) {
      Logger.info('AI', 'Loading logs generated successfully', { count: validMessages.length });
      return validMessages;
    }
    
    Logger.warn('AI', 'Not enough loading logs generated', { count: validMessages.length });
    return getDefaultLoadingMessages();
  } catch (e) {
    Logger.warn('AI', 'Log generation failed, using fallbacks.', { error: e instanceof Error ? e.message : e });
    return getDefaultLoadingMessages();
  }
};

// Fallback messages if AI generation fails
const getDefaultLoadingMessages = (): string[] => [
  'JUDGING RESTAURANTS BY THEIR FONTS...',
  'READING REVIEWS WRITTEN AT 3AM...',
  'FILTERING OUT YOUR EX\'S FAVORITES...',
  'CALCULATING FOOD COMA PROBABILITY...',
  'IGNORING PLACES WITH COMIC SANS MENUS...',
  'BRIBING LOCAL PIGEONS FOR INTEL...',
  'SKIPPING SPOTS WITH "GREAT VIBES" ONLY...',
  'CHECKING IF PORTION SIZES ARE LYING...',
  'AVOIDING PLACES THAT PEAKED IN 2019...',
  'ELIMINATING SUSPICIOUSLY EMPTY RESTAURANTS...',
  'PRETENDING TO WORK HARDER THAN I AM...',
  'USING POWERS FOR FOOD NOT EVIL...',
  'ALMOST THERE, DON\'T ORDER PIZZA YET...',
  'GOOD THINGS TAKE TIME, ALLEGEDLY...',
  'WORTH THE WAIT, PROBABLY...'
];

// Duration type for walking times
export interface PlaceDuration {
  text: string;
  value: number; // seconds
}

/**
 * STREAMLINED FOOD DECISION - Single API Call
 * 
 * Analyzes candidates and returns exactly 3 recommendations.
 * Uses detailed system prompt for quality while keeping it to ONE fast API call.
 */
export const decideLunch = async (
  candidates: GooglePlace[],
  durations: Map<string, PlaceDuration>,
  vibe: HungerVibe | null,
  price: PricePoint | null,
  noCash: boolean,
  address: string,
  dietaryRestrictions: DietaryRestriction[],
  freestylePrompt?: string,
  newlyOpenedOnly?: boolean,
  popularOnly?: boolean,
  onLog?: AnalysisLogCallback
): Promise<GeminiRecommendation[]> => {
  Logger.info('AI', '=== FOOD DECISION (SINGLE CALL) ===', { 
    candidateCount: candidates.length, 
    vibe, 
    price, 
    freestylePrompt,
    newlyOpenedOnly,
    popularOnly
  });

  if (candidates.length === 0) {
    Logger.warn('AI', 'No candidates provided');
    return [];
  }

  onLog?.(`ANALYZING ${candidates.length} RESTAURANTS...`);

  // Take top 25 candidates - Opus 4.5 has 200K context, we can analyze more
  const topCandidates = candidates.slice(0, 25);
  
  // Helper to parse recency from relativeTime string (e.g., "2 weeks ago", "3 months ago")
  // Returns months as a number (0 = less than a month, 1 = 1 month, etc.)
  const parseRecencyMonths = (relativeTime?: string): number => {
    if (!relativeTime) return 999; // Unknown = assume old
    const lower = relativeTime.toLowerCase();
    if (lower.includes('hour') || lower.includes('day')) return 0;
    if (lower.includes('week')) return 0.5;
    if (lower.includes('month')) {
      const match = lower.match(/(\d+)/);
      return match ? parseInt(match[1]) : 1;
    }
    if (lower.includes('year')) {
      const match = lower.match(/(\d+)/);
      const years = match ? parseInt(match[1]) : 1;
      return years * 12;
    }
    return 999; // Unknown format = assume old
  };
  
  // Helper for sorting (lower = more recent)
  const parseRecencyScore = (relativeTime?: string): number => {
    return parseRecencyMonths(relativeTime);
  };
  
  // Build payload with reviews per restaurant, sorted by recency
  const payload = topCandidates.map(p => {
    const allReviews = (p.reviews || []).filter(r => r.text && r.text.length > 0);
    // Google Places API returns max 5 reviews per place
    // Sorted by recency so we get the most current opinions first
    const reviews = allReviews
      .sort((a, b) => parseRecencyScore(a.relativeTime) - parseRecencyScore(b.relativeTime))
      .slice(0, 5)
      .map(r => ({
        text: r.text,
        stars: r.rating,
        recent: r.relativeTime?.toLowerCase().includes('week') || 
                r.relativeTime?.toLowerCase().includes('month') ||
                r.relativeTime?.toLowerCase().includes('day'),
      }));
    
    // Find the OLDEST review to determine if this is a new place
    const oldestReviewMonths = allReviews.length > 0
      ? Math.max(...allReviews.map(r => parseRecencyMonths(r.relativeTime)))
      : 999;
    
    // Count recent reviews (within last 1 month) for popularity/trending signal
    const recentReviewCount = allReviews.filter(r => parseRecencyMonths(r.relativeTime) <= 1).length;
    
    // A place is "freshly opened" if:
    // 1. Under 80 reviews (main signal) AND
    // 2. Oldest review is less than 6 months old (prevents old slow places from qualifying)
    const reviewCount = p.user_ratings_total || 0;
    const isFreshDrop = reviewCount < 80 && oldestReviewMonths < 6;
    
    // Calculate what % of total reviews are from the last month
    // If 10%+ of all reviews are from last month, it's trending (actively buzzing)
    // E.g., 100 total reviews with 10+ from last month = hot spot
    // E.g., 500 total reviews with 50+ from last month = very popular
    const totalReviews = p.user_ratings_total || 1;
    const reviewSampleSize = Math.max(1, Math.min(totalReviews, allReviews.length)); // Prevent division by zero
    const recentReviewPercent = (recentReviewCount / reviewSampleSize) * 100;
    const isTrending = recentReviewPercent >= 10;
    
    const duration = durations.get(p.place_id);
    const walkingMinutes = duration ? Math.ceil(duration.value / 60) : null;
    const openStatus = getOpenStatusScore(p, duration?.value);
    
    return {
      id: p.place_id,
      name: p.name,
      rating: p.rating,
      total_reviews: p.user_ratings_total,
      price_level: p.price_level,
      types: p.types?.slice(0, 5),
      summary: p.editorial_summary?.overview || '',
      reviews: reviews,
      cash_only: p.payment_options?.accepts_cash_only || false,
      vegetarian: p.serves_vegetarian_food,
      walking_minutes: walkingMinutes,
      open_status: openStatus.status,
      has_beer: p.serves_beer,
      has_wine: p.serves_wine,
      takeout: p.takeout,
      dine_in: p.dine_in,
      is_fresh_drop: isFreshDrop,
      oldest_review_months: oldestReviewMonths < 100 ? oldestReviewMonths : null,
      is_trending: isTrending,
      recent_review_percent: Math.round(recentReviewPercent),
    };
  });
  
  // Time context for the AI
  const currentHour = new Date().getHours();
  const dayOfWeek = new Date().toLocaleDateString('en', { weekday: 'long' });

  const totalReviews = payload.reduce((sum, p) => sum + p.reviews.length, 0);
  const recentReviews = payload.reduce((sum, p) => sum + p.reviews.filter(r => r.recent).length, 0);
  onLog?.(`MINING ${totalReviews} REVIEWS (${recentReviews} RECENT) FOR DISH MENTIONS...`);

  // Budget context
  const budgetText = price ? {
    'Paying Myself': 'Budget-conscious, prefer price_level 1-2 ($ to $$)',
    'Company Card': 'Quality over cost, prefer price_level 3-4 ($$$ to $$$$)'
  }[price] || '' : '';

  // Dietary context
  const dietaryText = dietaryRestrictions.length > 0 
    ? `DIETARY REQUIREMENTS: ${dietaryRestrictions.join(', ')}. Prioritize restaurants that accommodate these.`
    : '';

  // Compute meal type once
  const mealType = currentHour >= 6 && currentHour < 11 ? 'BREAKFAST' : 
                   currentHour >= 11 && currentHour < 15 ? 'LUNCH' : 
                   currentHour >= 15 && currentHour < 17 ? 'SNACK' : 
                   currentHour >= 17 && currentHour < 22 ? 'DINNER' : 'LATE_NIGHT';

  // Optimized system instruction - structured format for token efficiency
  const systemInstruction = `Select EXACTLY 3 best restaurant matches. Return JSON array.

CONTEXT:
- Location: ${address}
- Vibe: ${vibe || 'Good food'}
- Request: ${freestylePrompt || 'None'}
- Time: ${currentHour}:00 ${dayOfWeek} (${mealType})
${budgetText ? `- Budget: ${budgetText}` : ''}
${dietaryRestrictions.length > 0 ? `- Dietary: ${dietaryRestrictions.join(', ')}` : ''}
${newlyOpenedOnly ? '- MODE: FRESH DROPS - prioritize is_fresh_drop=true places' : ''}
${popularOnly ? '- MODE: TRENDING - prioritize is_trending=true, high recent_review_percent' : ''}
${noCash ? '- REQUIRE: Card payment (exclude cash_only=true)' : ''}

VIBE PRIORITIES:
- GRAB_AND_GO: walking_minutes<5, takeout=true, "quick/fast" reviews
- LIGHT_AND_CLEAN: "fresh/healthy" reviews, vegetarian=true
- VIEW_AND_VIBE: ambiance>distance, has_wine/beer, "atmosphere/view" reviews
- HEARTY_AND_RICH: "filling/generous portions", dine_in=true
- SPICY_AND_BOLD: "spicy/authentic heat" reviews
- AUTHENTIC_AND_CLASSIC: "traditional/authentic" reviews

REVIEW SIGNALS:
+: 5-star + dish mention, recent=true, "hidden gem", "locals' favorite"
-: "went downhill", "overpriced", "slow service" → mention in caveat

DISH EXTRACTION (multilingual):
Find SPECIFIC dish names in reviews (DE/EN). Pattern: "the [dish] is amazing", "best [dish]".
Use exact name ("Wiener Schnitzel" not "schnitzel"). Never generic ("food", "meal").

CASH DETECTION: cash_only field OR reviews: "cash only", "nur Barzahlung"

OUTPUT per recommendation:
{place_id, recommended_dish, backup_dish?, ai_reason, vibe_match_score:1-10, caveat?, is_cash_only, is_new_opening}

AI_REASON RULES:
- 2 sentences with review quotes. NEVER include ratings/review counts/walk time (shown in UI).
- BAD: "4.6★ with 340 reviews" | GOOD: "Reviewers call it 'absolute favorite' with 'insanely delicious' dishes"

CRITICAL:
- Specific request (schnitzel/ramen/etc) → ALL 3 must serve that item
- General vibe → offer variety across cuisines
- NEVER duplicate place_id. Return 1-2 if can't find 3 quality matches.`;

  const prompt = `Analyze these ${payload.length} restaurants and select exactly 3 best matches:

${JSON.stringify(payload, null, 2)}

Return a JSON array with exactly 3 recommendations.`;

  try {
    onLog?.(`RANKING TOP CANDIDATES...`);
    
    const text = await callOpenRouterProxy(
      AI_MODEL_HEAVY, // Complex analysis task - use heavy model
      prompt,
      {
        systemInstruction,
        temperature: 0.5,
        responseMimeType: 'application/json',
      }
    );

    if (!text || text.trim() === '') {
      throw new Error('Empty response from AI');
    }

    // Try to extract JSON from the response (it might be wrapped in markdown code blocks or have extra text)
    let jsonText = text.trim();
    
    // Remove markdown code blocks if present
    if (jsonText.startsWith('```json')) {
      jsonText = jsonText.slice(7);
    } else if (jsonText.startsWith('```')) {
      jsonText = jsonText.slice(3);
    }
    if (jsonText.endsWith('```')) {
      jsonText = jsonText.slice(0, -3);
    }
    jsonText = jsonText.trim();
    
    // Extract JSON from potentially messy response and fix common issues
    jsonText = extractJsonFromResponse(jsonText);
    jsonText = cleanJsonResponse(jsonText);

    let results: Omit<GeminiRecommendation, 'cash_warning_msg'>[];
    try {
      results = JSON.parse(jsonText);
    } catch (parseError) {
      throw new Error(`Failed to parse AI response as JSON: ${parseError}`);
    }
    
    // CRITICAL: Deduplicate by place_id - never show the same restaurant twice
    const seenPlaceIds = new Set<string>();
    const deduplicatedResults = results.filter(r => {
      if (seenPlaceIds.has(r.place_id)) {
        Logger.warn('AI', `Duplicate place_id filtered out: ${r.place_id}`);
        return false;
      }
      seenPlaceIds.add(r.place_id);
      return true;
    });
    
    // Take up to 3 unique results
    const finalResults = deduplicatedResults.slice(0, 3);
    
    Logger.info('AI', `Decision complete: ${finalResults.length} recommendations (${results.length - deduplicatedResults.length} duplicates removed)`);
    

    return finalResults.map(rec => ({
      ...rec,
      cash_warning_msg: rec.is_cash_only ? 'Note: This location may be cash-only.' : null,
    }));

  } catch (error) {
    Logger.error('AI', 'Lunch decision failed', error);
    onLog?.(`ERROR: Analysis failed. Please try again.`);
    return [];
  }
};
