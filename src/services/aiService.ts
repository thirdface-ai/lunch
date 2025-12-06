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

TRANSLATION MAP:
- "newest/hottest" → newlyOpenedOnly:true, popularOnly:true, queries: ["new restaurant", "popular restaurant", "trending restaurant"]
- "fancy/date night" → queries: ["fine dining", "upscale restaurant", "romantic restaurant"]
- "cheap eats" → queries: ["budget restaurant", "casual dining", "cheap eats"]
- "hidden gems" → queries: ["local favorite", "highly rated", "underrated restaurant"]
- Specific cuisine (pizza/ramen/etc) → include cuisine name in all queries

OUTPUT JSON:
{"searchQueries":["query1","query2","query3"],"newlyOpenedOnly":bool|null,"popularOnly":bool|null,"cuisineType":"cuisine|null"}

Generate 3-5 CONCRETE search terms Google Places understands. Never use user's vague words directly.`;

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

    // Parse JSON response
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

Return JSON array of 15 strings only.`;

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
    
    // Extract JSON from response (handle markdown code blocks)
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

    // Try to extract JSON from the response (it might be wrapped in markdown code blocks)
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
