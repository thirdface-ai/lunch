import { GooglePlace, HungerVibe, GeminiRecommendation, PricePoint, DietaryRestriction, PlaceReview } from '../types';
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
  
  // 3. Remove common AI prefixes that break JSON parsing
  // AI sometimes returns "null{...}" or "None{...}" before valid JSON
  cleaned = cleaned.replace(/^(null|None|undefined)\s*(?=[{\[])/i, '');
  
  return cleaned;
};

/**
 * Extract JSON from AI response that may contain extra text before/after.
 * AI sometimes adds commentary around the JSON we need.
 * 
 * Common problematic patterns:
 * - "null{"matches":[]}" - AI returns null + JSON
 * - "Here is the result: {...}" - commentary before JSON
 * - "{...}\n\nLet me know if..." - commentary after JSON
 */
const extractJsonFromResponse = (text: string): string => {
  // Find the first occurrence of [ or {
  const firstBracket = text.indexOf('[');
  const firstBrace = text.indexOf('{');
  
  // If neither found, return original (will fail on parse, handled by caller)
  if (firstBracket === -1 && firstBrace === -1) {
    return text;
  }
  
  // Determine start position - whichever JSON structure comes first
  let startPos: number;
  if (firstBracket === -1) {
    startPos = firstBrace;
  } else if (firstBrace === -1) {
    startPos = firstBracket;
  } else {
    startPos = Math.min(firstBracket, firstBrace);
  }
  
  // IMPORTANT: Slice off any prefix before the JSON starts
  // This handles cases like "null{...}" or "Here: {...}"
  const jsonPart = text.slice(startPos);
  
  // Now extract the complete JSON structure using regex
  if (jsonPart.startsWith('[')) {
    // Extract array - match from [ to the last ]
    const arrayMatch = jsonPart.match(/^\[[\s\S]*\]/);
    if (arrayMatch) {
      return arrayMatch[0];
    }
  } else if (jsonPart.startsWith('{')) {
    // Extract object - match from { to the last }
    const objectMatch = jsonPart.match(/^\{[\s\S]*\}/);
    if (objectMatch) {
      return objectMatch[0];
    }
  }
  
  // Fallback: return from the JSON start position
  return jsonPart;
};

/**
 * AI-powered translation of freestyle prompts into Google Places search queries
 * 
 * Handles vague requests like "newest hottest places" by understanding intent
 * and generates city-appropriate search queries based on local food culture.
 */
export const translateSearchIntent = async (
  freestylePrompt: string,
  vibe: HungerVibe | null,
  address?: string
): Promise<TranslatedSearchIntent> => {
  const query = freestylePrompt.trim();
  
  if (!query) {
    return { searchQueries: [], originalPrompt: query };
  }

  // Extract location context
  const location = address || 'Unknown location';
  const vibeText = vibe || 'none';

  Logger.info('AI', 'Translating search intent', { query, vibe: vibeText, location });

  const prompt = `You are a local food expert. Generate Google Places search queries for: "${query}"

ADDRESS: ${location}
VIBE: ${vibeText}

YOUR TASK:
1. Think about the SPECIFIC NEIGHBORHOOD in "${location}" - what's the vibe there? What do locals eat?
2. Consider: Is this a business district? Residential? Trendy? Tourist area? Multicultural?
3. What cuisines and food styles are popular in THIS specific area (not just the city)?
4. If a vibe is set, interpret it for THIS neighborhood (e.g., "Grab & Go" near an office = different than "Grab & Go" in a hip neighborhood)

GENERATE 3 search queries using:
- Local dish names popular in this neighborhood
- Cuisine types common in this area
- Food styles that fit the neighborhood character

RULES:
- Use specific terms, not generic words like "restaurant", "food", "near me"
- Each query = different angle: specific dish, cuisine type, local food style
- Think like someone who lives/works at "${location}"

OUTPUT (JSON only):
{"searchQueries":["query1","query2","query3"],"newlyOpenedOnly":boolean|null,"popularOnly":boolean|null,"cuisineType":"detected_cuisine|null"}`;

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
        searchQueries: [query, 'restaurant'],
        originalPrompt: query,
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
      original: query,
      queries: result.searchQueries,
      newlyOpenedOnly: result.newlyOpenedOnly,
      popularOnly: result.popularOnly,
      cuisineType: result.cuisineType
    });

    return {
      searchQueries: result.searchQueries || [query, 'restaurant'],
      newlyOpenedOnly: result.newlyOpenedOnly || undefined,
      popularOnly: result.popularOnly || undefined,
      cuisineType: result.cuisineType || undefined,
      originalPrompt: query,
    };

  } catch (error) {
    Logger.error('AI', 'Intent translation failed', error);
    // Fallback: use original prompt with restaurant suffix
    return {
      searchQueries: [query, `${query} restaurant`, 'restaurant'],
      originalPrompt: query,
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

  // CRITICAL: This prompt must be SHORT and STRICT about JSON output
  // The AI was returning verbose analysis text instead of JSON, causing 58% parse failures
  const prompt = `OUTPUT ONLY JSON. No text before or after. No explanations.

TASK: Return indices of restaurants that serve "${trimmedQuery}"

${placeSummaries.map(p => `${p.idx}: ${p.name} (${p.types})`).join('\n')}

RULES:
- Match cuisine/dish type: "${trimmedQuery}"
- Include related cuisines (e.g., schnitzel→german/austrian, ramen→japanese, kebab→turkish)
- EXCLUDE completely unrelated cuisines

FORMAT: {"matches":[0,2,5]}
EMPTY: {"matches":[]}`;


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
      // CRITICAL: Only return keyword matches, NEVER generic results
      // Generic fallback caused wrong-cuisine results (schnitzel→currywurst)
      if (quickMatches.length > 0) {
        Logger.info('AI', `Empty response fallback to ${quickMatches.length} keyword matches`);
        return quickMatches;
      }
      return [];
    }

    // Parse JSON response - handle markdown blocks and extra text
    let jsonText = text.trim();
    
    // Store original for debugging
    const originalResponse = jsonText.substring(0, 200);
    
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

    let result;
    try {
      result = JSON.parse(jsonText);
    } catch (parseError) {
      // Log the problematic response for debugging
      Logger.warn('AI', 'JSON parse failed in place filter', {
        originalResponse,
        cleanedJson: jsonText.substring(0, 200),
        parseError: String(parseError)
      });
      // CRITICAL: Only return keyword matches, NEVER generic results
      // Returning candidatesForAI.slice(0, 10) caused schnitzel→currywurst bugs
      if (quickMatches.length > 0) {
        Logger.info('AI', `Fallback to ${quickMatches.length} keyword matches for "${trimmedQuery}"`);
        return quickMatches;
      }
      // No keyword matches = return empty, let caller handle with proper messaging
      Logger.warn('AI', `No cuisine matches found for "${trimmedQuery}" - returning empty`);
      return [];
    }
    
    // Handle null/undefined result (AI sometimes returns just "null")
    if (!result || typeof result !== 'object') {
      Logger.warn('AI', 'Invalid result from place filter (not an object)', { result });
      // Same logic: only keyword matches, never generic results
      if (quickMatches.length > 0) {
        return quickMatches;
      }
      return [];
    }
    
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
    // CRITICAL: Only return keyword matches, NEVER generic results
    // Generic fallback caused wrong-cuisine results (schnitzel→currywurst)
    if (quickMatches.length > 0) {
      Logger.info('AI', `Error fallback to ${quickMatches.length} keyword matches`);
      return quickMatches;
    }
    // Return empty and let caller handle - better than wrong cuisines
    return [];
  }
};

// Internal helper to call the Supabase Edge Function with retry logic
const callOpenRouterProxy = async (
  model: string, 
  contents: string, 
  config: Record<string, unknown>,
  maxRetries: number = 3
): Promise<string> => {
  const startTime = performance.now();
  Logger.aiRequest(model, contents.substring(0, 500) + '...');

  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      // Add exponential backoff delay for retries (0ms, 1000ms, 2000ms)
      if (attempt > 0) {
        const delay = Math.min(1000 * attempt, 3000);
        Logger.info('AI', `Retry attempt ${attempt + 1}/${maxRetries} after ${delay}ms delay`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }

      const { data, error } = await supabase.functions.invoke('openrouter-proxy', {
        body: { model, contents, config },
      });

      if (error) {
        // Check if it's a retryable error (5xx, network errors, CORS from failed requests)
        const errorMessage = error.message || '';
        const isRetryable = 
          errorMessage.includes('502') ||
          errorMessage.includes('503') ||
          errorMessage.includes('504') ||
          errorMessage.includes('Bad Gateway') ||
          errorMessage.includes('Service Unavailable') ||
          errorMessage.includes('CORS') ||
          errorMessage.includes('Failed to fetch') ||
          errorMessage.includes('NetworkError');
        
        if (isRetryable && attempt < maxRetries - 1) {
          Logger.warn('AI', `Retryable error on attempt ${attempt + 1}: ${errorMessage}`);
          lastError = new Error(errorMessage || 'Edge Function invocation failed');
          continue;
        }
        throw new Error(errorMessage || 'Edge Function invocation failed');
      }

      if (!data) {
        throw new Error('No data returned from OpenRouter proxy');
      }

      if (!data.text) {
        throw new Error(`Invalid response from OpenRouter proxy: ${JSON.stringify(data)}`);
      }

      const duration = Math.round(performance.now() - startTime);
      const estimatedTokens = data.text ? Math.ceil(data.text.length / 4) : 0;
      
      if (attempt > 0) {
        Logger.info('AI', `Request succeeded on retry attempt ${attempt + 1}`);
      }
      Logger.aiResponse(model, duration, true, estimatedTokens);

      return data.text;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      // Check if we should retry on caught exceptions
      const errorMessage = lastError.message || '';
      const isRetryable = 
        errorMessage.includes('502') ||
        errorMessage.includes('503') ||
        errorMessage.includes('504') ||
        errorMessage.includes('Bad Gateway') ||
        errorMessage.includes('Service Unavailable') ||
        errorMessage.includes('CORS') ||
        errorMessage.includes('Failed to fetch') ||
        errorMessage.includes('NetworkError');
      
      if (isRetryable && attempt < maxRetries - 1) {
        Logger.warn('AI', `Retryable exception on attempt ${attempt + 1}: ${errorMessage}`);
        continue;
      }
      
      // Non-retryable error or final attempt
      break;
    }
  }

  const duration = Math.round(performance.now() - startTime);
  Logger.error('AI', `OpenRouter Proxy Call Failed after ${maxRetries} attempts (${duration}ms)`, lastError);
  throw lastError || new Error('OpenRouter proxy call failed');
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
  
  // Helper to check if a place is a "fresh drop" (newly opened)
  const isFreshDropCandidate = (p: GooglePlace): boolean => {
    const allReviews = (p.reviews || []).filter((r: PlaceReview) => r.text && r.text.length > 0);
    const reviewCount = p.user_ratings_total || 0;
    
    // Find the oldest review to determine if this is a new place
    const oldestReviewMonths = allReviews.length > 0
      ? Math.max(...allReviews.map((r: PlaceReview) => parseRecencyMonths(r.relativeTime)))
      : 999;
    
    // A place is "freshly opened" if:
    // 1. Under 100 reviews (main signal) AND
    // 2. Oldest review is less than 6 months old
    return reviewCount < 100 && oldestReviewMonths < 6;
  };
  
  // Helper to check if a place is "trending" (popular)
  const isTrendingCandidate = (p: GooglePlace): boolean => {
    const allReviews = (p.reviews || []).filter((r: PlaceReview) => r.text && r.text.length > 0);
    const recentReviewCount = allReviews.filter((r: PlaceReview) => parseRecencyMonths(r.relativeTime) <= 1).length;
    const reviewSampleSize = Math.max(1, allReviews.length);
    const recentReviewPercent = (recentReviewCount / reviewSampleSize) * 100;
    return recentReviewPercent >= 10;
  };
  
  // PRE-FILTER: Apply hard filters for Fresh Drops and Trending modes
  let filteredCandidates = candidates.slice(0, 40); // Start with more candidates to filter from
  let foundFreshDrops = false; // Track if we successfully filtered to fresh drops only
  let foundTrending = false; // Track if we successfully filtered to trending only
  
  if (newlyOpenedOnly) {
    const freshDrops = filteredCandidates.filter(isFreshDropCandidate);
    Logger.info('AI', `Fresh Drops filter: ${freshDrops.length}/${filteredCandidates.length} places qualify`, {
      candidates: freshDrops.map(p => ({ name: p.name, reviews: p.user_ratings_total }))
    });
    
    if (freshDrops.length > 0) {
      filteredCandidates = freshDrops;
      foundFreshDrops = true;
      onLog?.(`FOUND ${freshDrops.length} FRESH DROPS IN AREA...`);
    } else {
      // No fresh drops found - inform user and continue with all candidates
      onLog?.(`NO NEW OPENINGS DETECTED IN LISBON - SHOWING BEST MATCHES...`);
      Logger.warn('AI', 'No fresh drops found, falling back to all candidates');
    }
  }
  
  if (popularOnly) {
    const trending = filteredCandidates.filter(isTrendingCandidate);
    Logger.info('AI', `Trending filter: ${trending.length}/${filteredCandidates.length} places qualify`);
    
    if (trending.length > 0) {
      filteredCandidates = trending;
      foundTrending = true;
      onLog?.(`FOUND ${trending.length} TRENDING SPOTS...`);
    } else {
      onLog?.(`NO TRENDING SPOTS DETECTED - SHOWING BEST MATCHES...`);
      Logger.warn('AI', 'No trending places found, falling back to all candidates');
    }
  }
  
  // Take top 25 candidates for AI analysis
  const topCandidates = filteredCandidates.slice(0, 25);
  
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
  
  // === BUILD CONTEXT VARIABLES ===
  const now = new Date();
  const hour = now.getHours();
  const day = now.toLocaleDateString('en', { weekday: 'long' });
  const meal = hour >= 6 && hour < 11 ? 'breakfast' : 
               hour >= 11 && hour < 15 ? 'lunch' : 
               hour >= 15 && hour < 17 ? 'snack' : 
               hour >= 17 && hour < 22 ? 'dinner' : 'late night';
  
  const location = address;
  const mood = vibe || 'good food';
  const request = freestylePrompt || 'none';
  const budget = price === 'Paying Myself' ? 'budget-friendly ($ to $$)' : 
                 price === 'Company Card' ? 'quality over cost ($$$ to $$$$)' : 'any';
  const dietary = dietaryRestrictions.length > 0 ? dietaryRestrictions.join(', ') : 'none';
  const cardOnly = noCash;
  const wantNew = newlyOpenedOnly;
  const wantPopular = popularOnly;
  const candidateCount = payload.length;

  const reviewStats = {
    total: payload.reduce((sum, p) => sum + p.reviews.length, 0),
    recent: payload.reduce((sum, p) => sum + p.reviews.filter(r => r.recent).length, 0)
  };
  
  onLog?.(`MINING ${reviewStats.total} REVIEWS (${reviewStats.recent} RECENT) FOR DISH MENTIONS...`);

  // === SYSTEM INSTRUCTION WITH VARIABLES ===
  const systemInstruction = `You are a local food expert who knows "${location}" intimately. Select exactly 3 restaurants.

CONTEXT:
- Address: ${location}
- Vibe: ${mood}
- Request: ${request}
- Time: ${hour}:00 ${day} (${meal})
- Budget: ${budget}
- Dietary: ${dietary}
${wantNew ? '- MODE: Fresh drops only - prioritize is_fresh_drop=true' : ''}
${wantPopular ? '- MODE: Trending spots - prioritize is_trending=true' : ''}
${cardOnly ? '- REQUIRE: Card payment (exclude cash_only=true)' : ''}

THINK ABOUT THIS SPECIFIC NEIGHBORHOOD:
- What kind of area is "${location}"? (Business district? Residential? Trendy? Tourist?)
- What do people who live/work HERE actually eat for ${meal}?
- What cuisines thrive in THIS neighborhood specifically?
- What's the local food scene character here?

INTERPRET "${mood}" FOR THIS NEIGHBORHOOD:
- Grab & Go: What's the quick food culture HERE? (Office area = different than hip neighborhood)
- Light & Clean: What healthy options are popular in THIS area?
- Hearty & Rich: What's the local comfort food scene?
- Spicy & Bold: What spicy cuisines are nearby?
- View & Vibe: What scenic/atmospheric spots exist in this neighborhood?
- Authentic & Classic: What are the established local favorites HERE?

ANALYSIS RULES:
1. Extract SPECIFIC dish names from reviews (local language OK)
2. Pattern: "the [dish] is amazing", "best [dish]", "[dish] war super"
3. Use exact names, never generic ("food", "meal", "dish")
4. Look for: 5-star + dish mention, "hidden gem", "locals' favorite"
5. Flag: "went downhill", "overpriced", "slow service" in caveat

OUTPUT FORMAT (JSON array of 3):
[{
  "place_id": "id",
  "recommended_dish": "specific local dish name",
  "backup_dish": "alternative dish (optional)",
  "ai_reason": "2 sentences with review quotes, NO ratings/counts/walk time",
  "vibe_match_score": 1-10,
  "caveat": "brief warning if any (optional)",
  "is_cash_only": boolean,
  "is_new_opening": boolean
}]

CRITICAL:
- ${request !== 'none' ? `User wants "${request}" - ALL 3 must match this` : 'Offer variety across cuisines'}
- Recommend dishes that locals in ${location} actually order
- Never duplicate place_id`;

  // === USER PROMPT ===
  const prompt = `Analyze these ${candidateCount} restaurants in ${location} and select exactly 3 best matches for "${mood}":

${JSON.stringify(payload, null, 2)}

Return JSON array with exactly 3 recommendations.`;

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
      // Force is_new_opening when we successfully pre-filtered to fresh drops only
      is_new_opening: foundFreshDrops ? true : rec.is_new_opening,
    }));

  } catch (error) {
    Logger.error('AI', 'Lunch decision failed', error);
    onLog?.(`ERROR: Analysis failed. Please try again.`);
    return [];
  }
};
