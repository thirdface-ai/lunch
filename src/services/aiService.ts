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

// Using OpenRouter's auto model selection for optimal results
const AI_MODEL = 'openrouter/auto';

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
    Generate 15 FUNNY loading messages for a lunch finder app. User is in "${neighborhood}"${city ? `, ${city}` : ''} searching for "${searchQuery}".
    
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
       - "USING POWERS FOR LUNCH INSTEAD OF WORLD DOMINATION..."
       - "RESISTING URGE TO RECOMMEND SAME 3 PLACES..."
    
    4. RELATABLE LUNCH STRUGGLES (3-4 messages):
       - Universal truths about picking lunch
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
  'USING POWERS FOR LUNCH NOT EVIL...',
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
 * STREAMLINED LUNCH DECISION - Single API Call
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
  onLog?: AnalysisLogCallback
): Promise<GeminiRecommendation[]> => {
  Logger.info('AI', '=== LUNCH DECISION (SINGLE CALL) ===', { 
    candidateCount: candidates.length, 
    vibe, 
    price, 
    freestylePrompt
  });

  if (candidates.length === 0) {
    Logger.warn('AI', 'No candidates provided');
    return [];
  }

  onLog?.(`ANALYZING ${candidates.length} RESTAURANTS...`);

  // Take top 15 candidates
  const topCandidates = candidates.slice(0, 15);
  
  // Helper to parse recency from relativeTime string (e.g., "2 weeks ago", "3 months ago")
  const parseRecencyScore = (relativeTime?: string): number => {
    if (!relativeTime) return 999; // Unknown = sort last
    const lower = relativeTime.toLowerCase();
    if (lower.includes('day') || lower.includes('hour')) return 1;
    if (lower.includes('week')) return 2;
    if (lower.includes('month')) {
      const match = lower.match(/(\d+)/);
      const months = match ? parseInt(match[1]) : 1;
      return 2 + months; // 1 month = 3, 2 months = 4, etc.
    }
    if (lower.includes('year')) return 20;
    return 10; // Unknown format
  };
  
  // Build payload with up to 30 reviews per restaurant, sorted by recency
  const payload = topCandidates.map(p => {
    const reviews = (p.reviews || [])
      .filter(r => r.text && r.text.length > 0)
      .sort((a, b) => parseRecencyScore(a.relativeTime) - parseRecencyScore(b.relativeTime))
      .slice(0, 30)
      .map(r => ({
        text: r.text,
        stars: r.rating,
        recent: r.relativeTime?.toLowerCase().includes('week') || 
                r.relativeTime?.toLowerCase().includes('month') ||
                r.relativeTime?.toLowerCase().includes('day'),
      }));
    
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

  // Detailed system instruction for quality recommendations
  const systemInstruction = `You are an expert lunch recommendation AI. Your task is to analyze restaurant data and select EXACTLY 3 best matches.

LOCATION: ${address}
USER VIBE: ${vibe || 'Good quality food'}
SPECIFIC REQUEST: ${freestylePrompt || 'None'}
${budgetText}
${dietaryText}
${noCash ? 'USER REQUIRES CARD PAYMENT - exclude cash-only places' : ''}

=== TIME CONTEXT ===
Current time: ${currentHour}:00 on ${dayOfWeek}
- If lunch rush (12-13), mention if reviews note "busy at lunch"
- If late lunch (14-15), prioritize places with open_status='open'
- Weekends may have different vibes than weekdays

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
- ai_reason: 2 concise sentences: (1) Why this place stands out + quote from reviews, (2) Why chosen over a specific alternative from the list
- vibe_match_score: 1-10 how well it matches the user's vibe/request
- caveat: Brief warning if relevant (e.g., "Can get busy at lunch", "Service can be slow")
- is_cash_only: Boolean
- is_new_opening: True if <50 reviews and "just opened" mentions

=== AI_REASON RULES ===

NEVER include in ai_reason (these are shown separately in UI):
- Star ratings (e.g., "4.6★", "4.5 stars")
- Review counts (e.g., "340 reviews", "highly reviewed")
- Walking time (e.g., "4 min away", "just around the corner")

ALWAYS include:
- A specific quote or detail from reviews
- Name of ONE alternative restaurant and why this one beats it

=== AI_REASON EXAMPLES ===

BAD: "Great restaurant with good food. 4.6★ with 340 reviews, 4 min away."
BAD: "Highly rated spot with quick service."

GOOD: "Reviewers call the Duck Confit 'perfectly crispy with incredible sauce'. Chosen over Café Michel which has slower service during lunch rush."
GOOD: "Known for 'generous portions' of authentic Schnitzel that locals swear by. Picked over Gasthaus Weber which recent reviews say 'went downhill'."

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

If the user gave a general vibe (like "quick lunch", "something filling"):
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
