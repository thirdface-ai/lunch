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

// Using Claude Opus 4.5 for superior reasoning and recommendation quality
// https://openrouter.ai/anthropic/claude-opus-4.5
const AI_MODEL = 'anthropic/claude-opus-4.5';

// Callback type for real-time logging during analysis
export type AnalysisLogCallback = (message: string) => void;

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

  const prompt = `
    Generate 15 FUNNY loading messages for a food finder app. User is in "${neighborhood}"${city ? `, ${city}` : ''} searching for "${searchQuery}".
    
    BE GENUINELY FUNNY. Think stand-up comedy, not corporate humor. Be specific to their location and search.
    
    COMEDY STYLES TO USE:
    
    1. LOCAL INSIDER JOKES (4-5 messages):
       - Roast the neighborhood affectionately
       - Reference local stereotypes, landmarks, or culture
       - "ASKING ${neighborhood.toUpperCase()} HIPSTERS FOR NON-IRONIC RECOMMENDATIONS..."
       - "AVOIDING PLACES WHERE YOUR EX WORKS..."
       - "FILTERING OUT SPOTS WITH 'LIVE LAUGH LOVE' SIGNS..."
    
    2. FOOD-SPECIFIC ABSURDITY (3-4 messages):
       - Ridiculous takes on "${searchQuery}"
       - "JUDGING ${searchQuery.toUpperCase()} BY INSTAGRAM AESTHETIC..."
       - "CALCULATING OPTIMAL ${searchQuery.toUpperCase()}-TO-REGRET RATIO..."
       - "CHECKING IF THE ${searchQuery.toUpperCase()} PASSES THE VIBE CHECK..."
    
    3. SELF-AWARE AI HUMOR (3-4 messages):
       - The AI being dramatic about its job
       - "PRETENDING TO THINK HARDER THAN I ACTUALLY AM..."
       - "FLEXING MY 200+ REVIEW READING SKILLS..."
       - "USING POWERS FOR FOOD INSTEAD OF WORLD DOMINATION..."
       - "RESISTING URGE TO RECOMMEND SAME 3 PLACES..."
    
    4. RELATABLE FOOD STRUGGLES (3-4 messages):
       - Universal truths about picking what to eat
       - "ELIMINATING PLACES WITH SUSPICIOUSLY PERFECT 5.0 RATINGS..."
       - "IGNORING REVIEWS THAT SAY 'GREAT ATMOSPHERE'..."
       - "SKIPPING SPOTS WHERE THE SPECIAL IS ALWAYS 'FISH'..."
    
    RULES:
    - Be ACTUALLY funny, not just quirky
    - Reference "${neighborhood}" or "${searchQuery}" in at least 6 messages
    - Under 10 words each
    - ALL CAPS
    - End with "..."
    - No emojis
    - Avoid generic tech/loading puns
    
    Return ONLY a JSON array with exactly 15 strings. No markdown.
  `;

  try {
    const text = await callOpenRouterProxy(
      AI_MODEL,
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

  // Take top 15 candidates
  const topCandidates = candidates.slice(0, 15);
  
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
  
  // Build payload with up to 30 reviews per restaurant, sorted by recency
  const payload = topCandidates.map(p => {
    const allReviews = (p.reviews || []).filter(r => r.text && r.text.length > 0);
    const reviews = allReviews
      .sort((a, b) => parseRecencyScore(a.relativeTime) - parseRecencyScore(b.relativeTime))
      .slice(0, 30)
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

  // Fresh drops context
  const freshDropsText = newlyOpenedOnly
    ? `FRESH DROPS MODE ENABLED: User wants to discover NEWLY OPENED restaurants!
- PRIORITIZE places where is_fresh_drop=true (under 80 reviews AND oldest review < 6 months)
- The oldest_review_months field tells you how long the place has existed
- Places with is_fresh_drop=true are MUST PICKS
- This is the user's PRIMARY requirement - all 3 recommendations should be fresh drops if available!`
    : '';

  // Trending context
  const trendingText = popularOnly
    ? `TRENDING MODE ENABLED: User wants TRENDING restaurants with recent buzz!
- PRIORITIZE places where is_trending=true (10%+ of reviews from last month)
- The recent_review_percent field shows what % of reviews are from last month
- Higher recent_review_percent = more currently popular/buzzing
- Places people are actively talking about RIGHT NOW
- This is the user's PRIMARY requirement - recommend places with high recent activity!`
    : '';

  // Detailed system instruction for quality recommendations
  const systemInstruction = `You are an expert food recommendation AI. Your task is to analyze restaurant data and select EXACTLY 3 best matches.

LOCATION: ${address}
USER VIBE: ${vibe || 'Good quality food'}
SPECIFIC REQUEST: ${freestylePrompt || 'None'}
${budgetText}
${dietaryText}
${freshDropsText}
${trendingText}
${noCash ? 'USER REQUIRES CARD PAYMENT - exclude cash-only places' : ''}

=== TIME & MEAL CONTEXT ===
Current time: ${currentHour}:00 on ${dayOfWeek}
Meal type: ${currentHour >= 6 && currentHour < 11 ? 'BREAKFAST/BRUNCH' : currentHour >= 11 && currentHour < 15 ? 'LUNCH' : currentHour >= 15 && currentHour < 17 ? 'LATE LUNCH/SNACK' : currentHour >= 17 && currentHour < 22 ? 'DINNER' : 'LATE NIGHT'}

MEAL-SPECIFIC GUIDANCE:
${currentHour >= 6 && currentHour < 11 ? `- BREAKFAST TIME: Prioritize cafés, bakeries, brunch spots
- Look for: coffee quality, pastries, eggs, avocado toast mentions
- Reviews mentioning "great for breakfast" or "morning coffee" are gold` : ''}
${currentHour >= 11 && currentHour < 15 ? `- LUNCH TIME: Quick but satisfying options work well
- Consider: lunch specials, quick service for work crowd
- If 12-13, note places that get busy at lunch rush` : ''}
${currentHour >= 15 && currentHour < 17 ? `- LATE LUNCH/SNACK: Lighter options, coffee breaks
- Many places may be between lunch and dinner service
- Cafés and all-day spots are reliable picks` : ''}
${currentHour >= 17 && currentHour < 22 ? `- DINNER TIME: Full meals, more elaborate options appropriate
- Consider ambiance for dinner context
- If 18-20, note places that get crowded at dinner rush` : ''}
${currentHour >= 22 || currentHour < 6 ? `- LATE NIGHT: Limited options, prioritize places confirmed open late
- Bars with food, late-night eateries, 24h spots
- open_status is CRITICAL at this hour` : ''}

- Prioritize places with open_status='open'
- Weekends may have different vibes and hours than weekdays

=== DISH EXTRACTION (Multilingual - Critical) ===
Reviews may be in German, English, or other languages. Extract dish names in ANY language:
- German: "Das Schnitzel war fantastisch", "Die Currywurst ist legendär"
- English: "The ramen was incredible", "Must try the tacos"
- Look for: "the [dish] is amazing", "must try the [dish]", "best [dish] in town"
- Extract the SPECIFIC dish name as written (e.g., "Wiener Schnitzel", not "schnitzel")
- NOT generic terms like "food", "meal", "dish"

=== REVIEW ANALYSIS ===
Each review has: text, stars (1-5), recent (true if within weeks/months)
- 5-star reviews with specific dish mentions = strongest signal
- 1-2 star reviews = red flags to consider mentioning in caveats
- Reviews marked recent=true indicate CURRENT quality - weight these higher
- Older reviews may reflect outdated experience

=== QUALITY SIGNALS ===
- High ratings (4.3+) with many reviews = reliable
- Phrases like "hidden gem", "locals' favorite", "always consistent"
- open_status='open' is preferred over 'opens_soon' or 'closed'

=== RED FLAGS ===
- "went downhill", "not what it used to be"
- "overpriced", "slow service", "rude staff"
- Skip places with multiple red flags, or mention in caveat

=== VIBE-SPECIFIC PRIORITIES ===

GRAB_AND_GO / "Grab & Go":
- HEAVILY favor walking_minutes < 5
- Look for "quick", "fast", "efficient service" in reviews
- Prioritize takeout=true places

LIGHT_AND_CLEAN / "Light & Clean":
- Favor mentions of "fresh", "healthy", "light portions"
- vegetarian=true is a plus

VIEW_AND_VIBE / "View & Vibe":
- Quality and ambiance trump distance
- has_wine=true, has_beer=true are strong signals
- Look for "ambiance", "atmosphere", "beautiful", "view" mentions

HEARTY_AND_RICH / "Hearty & Rich":
- Look for "filling", "generous portions", "comfort food", "rich"
- dine_in=true preferred

SPICY_AND_BOLD / "Spicy & Bold":
- Look for "spicy", "flavorful", "authentic heat", "bold flavors"

AUTHENTIC_AND_CLASSIC / "Authentic & Classic":
- Look for "traditional", "authentic", "classic", "old-school"

=== CASH-ONLY DETECTION ===
- Check cash_only field
- Scan reviews for "cash only", "no cards", "bring cash"
- German: "nur Barzahlung", "nur bar"

=== OUTPUT REQUIREMENTS ===

Return EXACTLY 3 recommendations as a JSON array. For each:

- place_id: The restaurant's ID from the data
- recommended_dish: A SPECIFIC dish name found in reviews (never generic)
- backup_dish: An alternative dish recommendation (optional, if found)
- ai_reason: 2 concise sentences explaining why this place is great (see rules below)
- vibe_match_score: 1-10 how well it matches the user's vibe/request
- caveat: Brief warning if relevant (e.g., "Can get busy at peak hours", "Service can be slow")
- is_cash_only: Boolean
- is_new_opening: True if is_fresh_drop=true in the data (under 80 reviews AND oldest review < 6 months) OR mentions of "just opened", "new spot" in reviews

=== AI_REASON RULES (MUST FOLLOW) ===

NEVER include (shown separately in UI):
- Star ratings, review counts, or walking times

FORMAT OPTIONS:
- OPTION A (preferred): 1-2 sentences with review quotes explaining why this place is great. No comparison needed.
- OPTION B (only for #1 result): Can optionally add a comparison to a rejected restaurant IF it adds value.

COMPARISON RULES (if using Option B):
- Only the #1 result may include a comparison
- Compare ONLY against restaurants NOT in your top 3
- Each rejected restaurant can only be mentioned ONCE across all results
- If you can't find a unique restaurant to compare against, just use Option A

=== AI_REASON EXAMPLES ===

BAD: "4.6★ with 340 reviews, 4 min away." (includes stats shown in UI)
BAD: Multiple results comparing to the same rejected restaurant ← NO DUPLICATES

GOOD (Option A): "Reviewers call this their 'absolute favorite Vietnamese place' with 'insanely delicious' fresh dishes made with love."
GOOD (Option A): "Known for 'the best sourdough bread' in Berlin with 'flavoursome, fresh and filling' healthy bowls."
GOOD (Option B for #1 only): "Praised as 'the BEST meals of my life' with 'super flavorful' dishes. Beat out Corner Bakery which had stale pastry complaints."

=== CRITICAL: NO DUPLICATES ===
- NEVER recommend the same restaurant twice
- Each place_id in your response MUST be unique
- If you can't find 3 different quality options, return fewer (1 or 2) rather than duplicating

=== SELECTION STRATEGY ===
Pick the 3 restaurants that BEST match the user's request.

CRITICAL - SPECIFIC REQUEST PRIORITY:
If the user asked for something specific (like "schnitzel", "ramen", "pizza", "tacos", "pho", etc.):
- This is their PRIMARY requirement - ALL 3 recommendations should serve this item
- Search reviews for mentions of the specific dish/cuisine they requested
- Do NOT recommend restaurants that don't serve what the user asked for
- Better to return fewer high-quality matches than dilute with unrelated options

If the user gave a general vibe (like "quick bite", "something filling"):
- Offer variety - pick from different cuisine types when possible
- Show them interesting options they might not have considered`;

  const prompt = `Analyze these ${payload.length} restaurants and select exactly 3 best matches:

${JSON.stringify(payload, null, 2)}

Return a JSON array with exactly 3 recommendations.`;

  try {
    onLog?.(`RANKING TOP CANDIDATES...`);
    
    const text = await callOpenRouterProxy(
      AI_MODEL,
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
