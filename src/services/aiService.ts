import { GooglePlace, HungerVibe, GeminiRecommendation, PricePoint, DietaryRestriction, CuratedReviewData, PlaceReview } from '../types';
import Logger from '../utils/logger';
import { supabase } from '../lib/supabase';

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

// Fast, cheap model for pre-processing (multilingual review curation)
const HAIKU_MODEL = 'anthropic/claude-haiku-4.5';

// Duration map type for walking times
export type DurationMap = Map<string, { text: string; value: number }>;

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

export const generateLoadingLogs = async (vibe: HungerVibe | null, address: string): Promise<string[]> => {
  const vibeText = vibe || 'good food';
  Logger.info('AI', 'Generating Loading Logs', { vibe: vibeText, address });

  // Extract neighborhood/city from address for localized humor
  const locationPart = address ? address.split(',')[0] : 'the area';

  const prompt = `
    Generate 12 unique, funny loading messages for a lunch finder app searching in "${locationPart}" for "${vibeText}" vibes.
    
    REQUIREMENTS:
    - Each message MUST be different and creative (no repetition of concepts)
    - Keep each under 10 words
    - ALL CAPS
    - End each with "..."
    - Be witty, playful, and slightly absurd
    - Reference the location or vibe when possible
    - Mix of: tech humor, food puns, self-aware AI jokes, local references
    
    STYLE EXAMPLES (don't copy these, make new ones):
    - "BRIBING ${locationPart.toUpperCase()} PIGEONS FOR INTEL..."
    - "CALCULATING IF THIS IS WORTH WEARING PANTS..."
    - "ARGUING WITH THE AI ABOUT 'AUTHENTIC'..."
    - "FILTERING OUT YOUR EX'S FAVORITE SPOTS..."
    - "READING REVIEWS WRITTEN AT 3AM..."
    - "DETERMINING OPTIMAL FOOD COMA TIMING..."
    - "CROSS-CHECKING WITH FUTURE REGRETS..."
    - "ASKING LOCAL CATS FOR OPINIONS..."

    PROGRESSION:
    - Messages 1-4: Active searching/analyzing (fun, energetic)
    - Messages 5-8: Mid-process humor (self-aware, slightly apologetic)
    - Messages 9-12: Reassuring finish (almost done, worth the wait)

    Return ONLY a valid JSON array with exactly 12 unique strings.
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
    
    if (!text) return getDefaultLoadingMessages();
    const messages = JSON.parse(text) as string[];
    // Ensure we have enough messages
    return messages.length >= 8 ? messages : getDefaultLoadingMessages();
  } catch (e) {
    Logger.warn('AI', 'Log generation failed, using fallbacks.', { error: e });
    return getDefaultLoadingMessages();
  }
};

// Fallback messages if AI generation fails
const getDefaultLoadingMessages = (): string[] => [
  'SNIFFING OUT THE GOOD STUFF...',
  'JUDGING RESTAURANTS BY THEIR FONTS...',
  'BRIBING LOCAL FOOD CRITICS...',
  'READING SUSPICIOUSLY GLOWING REVIEWS...',
  'CALCULATING FOOD COMA PROBABILITY...',
  'FILTERING OUT TOURIST TRAPS...',
  'ASKING THE ALGORITHM NICELY...',
  'STILL HERE, STILL HUNGRY...',
  'GOOD THINGS TAKE TIME, ALLEGEDLY...',
  'AI IS THINKING REALLY HARD...',
  'ALMOST THERE, DON\'T ORDER PIZZA...',
  'WORTH THE WAIT, PROBABLY...'
];

/**
 * Haiku pre-processor result with timing
 */
export interface HaikuCurationResult {
  curatedData: Map<string, CuratedReviewData>;
  durationMs: number;
  success: boolean;
}

/**
 * HAIKU PRE-PROCESSOR - Curates reviews for ALL candidates
 * 
 * Uses Claude Haiku 4.5 to:
 * - Select the most informative reviews per restaurant
 * - Extract dish mentions across any language (German, English, etc.)
 * - Identify quality signals and red flags
 * - Score vibe match for ranking
 */
export const curateAllCandidates = async (
  candidates: GooglePlace[],
  vibe: HungerVibe | null,
  freestylePrompt?: string,
  onLog?: AnalysisLogCallback
): Promise<HaikuCurationResult> => {
  const startTime = performance.now();
  
  Logger.info('AI', '=== HAIKU PRE-PROCESSING ===', { 
    candidateCount: candidates.length,
    vibe,
    freestylePrompt
  });

  if (candidates.length === 0) {
    return { curatedData: new Map(), durationMs: 0, success: true };
  }

  onLog?.(`HAIKU ANALYZING ${candidates.length} RESTAURANTS...`);

  // Build compact payload for Haiku - all reviews from all candidates
  const payload = candidates.map(p => ({
    id: p.place_id,
    name: p.name,
    types: p.types?.slice(0, 5) || [],
    rating: p.rating,
    reviews: (p.reviews || []).map((r: PlaceReview) => ({
      text: r.text,
      rating: r.rating,
    })).filter((r: { text: string }) => r.text && r.text.length > 0),
  }));

  const totalReviews = payload.reduce((sum, p) => sum + p.reviews.length, 0);
  onLog?.(`SCANNING ${totalReviews} MULTILINGUAL REVIEWS...`);

  const systemInstruction = `You are a fast, efficient review analyzer. Your task is to process restaurant data and extract key insights.

USER REQUEST: ${freestylePrompt || vibe || 'Good lunch spot'}

For EACH restaurant, analyze its reviews and output:
1. vibe_score (0-10): How well does this restaurant match the user's request?
2. top_reviews: Select up to 5 most informative reviews, classify each as positive/negative/neutral
3. extracted_dishes: Specific dish names mentioned (in ANY language - German, English, etc.)
4. quality_signals: Positive patterns like "hidden gem", "consistent", "locals love it"
5. red_flags: Issues like "went downhill", "overpriced", "rude staff", "slow service"

CRITICAL for vibe_score:
- If user asked for specific food (e.g., "schnitzel", "ramen"), score HIGH only if reviews mention that food
- If user asked for a vibe (e.g., "quick lunch"), score based on service speed mentions
- Score 0 for restaurants that clearly don't match the request

Return a JSON array with one object per restaurant, matching input order.`;

  const prompt = `Analyze these ${payload.length} restaurants:

${JSON.stringify(payload, null, 1)}

Return JSON array with structure:
[{ "place_id": "...", "vibe_score": 0-10, "top_reviews": [...], "extracted_dishes": [...], "quality_signals": [...], "red_flags": [...] }, ...]`;

  try {
    const text = await callOpenRouterProxy(
      HAIKU_MODEL,
      prompt,
      {
        systemInstruction,
        temperature: 0.3, // Lower temp for consistent analysis
        responseMimeType: 'application/json',
      }
    );

    const durationMs = Math.round(performance.now() - startTime);

    if (!text || text.trim() === '') {
      throw new Error('Empty response from Haiku');
    }

    // Parse response
    let jsonText = text.trim();
    if (jsonText.startsWith('```json')) jsonText = jsonText.slice(7);
    else if (jsonText.startsWith('```')) jsonText = jsonText.slice(3);
    if (jsonText.endsWith('```')) jsonText = jsonText.slice(0, -3);
    jsonText = jsonText.trim();

    const results: CuratedReviewData[] = JSON.parse(jsonText);
    
    // Build map for easy lookup
    const curatedMap = new Map<string, CuratedReviewData>();
    results.forEach(r => {
      curatedMap.set(r.place_id, r);
    });

    Logger.info('AI', `Haiku curation complete`, { 
      durationMs, 
      processedCount: results.length 
    });
    onLog?.(`HAIKU COMPLETE: ${results.length} RESTAURANTS CURATED (${(durationMs / 1000).toFixed(1)}s)`);

    return { curatedData: curatedMap, durationMs, success: true };

  } catch (error) {
    const durationMs = Math.round(performance.now() - startTime);
    Logger.error('AI', 'Haiku curation failed, falling back to uncurated', error);
    onLog?.(`HAIKU FALLBACK: PROCEEDING WITHOUT PRE-CURATION`);
    
    return { curatedData: new Map(), durationMs, success: false };
  }
};

/**
 * Main model decision result with timing
 */
export interface DecisionResult {
  recommendations: GeminiRecommendation[];
  durationMs: number;
}

/**
 * LUNCH DECISION - Enhanced with Haiku pre-curation
 * 
 * Analyzes candidates and returns exactly 3 recommendations.
 * Now leverages pre-curated data from Haiku for better quality.
 */
export const decideLunch = async (
  candidates: GooglePlace[],
  vibe: HungerVibe | null,
  price: PricePoint | null,
  noCash: boolean,
  address: string,
  dietaryRestrictions: DietaryRestriction[],
  durations?: DurationMap,
  curatedData?: Map<string, CuratedReviewData>,
  freestylePrompt?: string,
  onLog?: AnalysisLogCallback
): Promise<DecisionResult> => {
  const startTime = performance.now();
  
  Logger.info('AI', '=== LUNCH DECISION ===', { 
    candidateCount: candidates.length, 
    vibe, 
    price, 
    freestylePrompt,
    hasCuratedData: curatedData && curatedData.size > 0,
    hasDurations: durations && durations.size > 0
  });

  if (candidates.length === 0) {
    Logger.warn('AI', 'No candidates provided');
    return { recommendations: [], durationMs: 0 };
  }

  onLog?.(`ANALYZING ${candidates.length} RESTAURANTS...`);

  // Take top 15 candidates
  const topCandidates = candidates.slice(0, 15);
  
  // Build enriched payload with walking time, service flags, and curated data
  const payload = topCandidates.map(p => {
    const duration = durations?.get(p.place_id);
    const curation = curatedData?.get(p.place_id);
    
    // Use curated reviews if available, otherwise fall back to raw reviews
    const reviews = curation?.top_reviews 
      ? curation.top_reviews.map(r => ({ text: r.text, rating: r.rating, signal: r.signal }))
      : (p.reviews || []).slice(0, 10).map(r => ({ text: r.text, rating: r.rating }));
    
    return {
      id: p.place_id,
      name: p.name,
      rating: p.rating,
      total_reviews: p.user_ratings_total,
      price_level: p.price_level,
      types: p.types?.slice(0, 5),
      summary: p.editorial_summary?.overview || '',
      // Enriched data
      walking_minutes: duration ? Math.round(duration.value / 60) : null,
      open_now: p.opening_hours?.open_now ?? null,
      serves_beer: p.serves_beer ?? null,
      serves_wine: p.serves_wine ?? null,
      takeout: p.takeout ?? null,
      dine_in: p.dine_in ?? null,
      cash_only: p.payment_options?.accepts_cash_only || false,
      vegetarian: p.serves_vegetarian_food,
      // Curated data from Haiku (if available)
      vibe_score: curation?.vibe_score ?? null,
      extracted_dishes: curation?.extracted_dishes ?? [],
      quality_signals: curation?.quality_signals ?? [],
      red_flags: curation?.red_flags ?? [],
      reviews: reviews,
    };
  });

  const hasCuration = curatedData && curatedData.size > 0;
  onLog?.(hasCuration 
    ? `LEVERAGING HAIKU PRE-CURATION FOR ${payload.length} CANDIDATES...`
    : `ANALYZING ${payload.length} CANDIDATES...`);

  // Budget context
  const budgetText = price ? {
    'Paying Myself': 'Budget-conscious, prefer price_level 1-2 ($ to $$)',
    'Company Card': 'Quality over cost, prefer price_level 3-4 ($$$ to $$$$)'
  }[price] || '' : '';

  // Dietary context
  const dietaryText = dietaryRestrictions.length > 0 
    ? `DIETARY REQUIREMENTS: ${dietaryRestrictions.join(', ')}. Prioritize restaurants that accommodate these.`
    : '';

  // Whether we have Haiku pre-curation
  const hasCurationData = curatedData && curatedData.size > 0;

  // Enhanced system instruction leveraging curated data
  const systemInstruction = `You are an expert lunch recommendation AI. Your task is to analyze restaurant data and select EXACTLY 3 best matches.

LOCATION: ${address}
USER VIBE: ${vibe || 'Good quality food'}
SPECIFIC REQUEST: ${freestylePrompt || 'None'}
${budgetText}
${dietaryText}
${noCash ? 'USER REQUIRES CARD PAYMENT - exclude cash-only places' : ''}

${hasCurationData ? `=== PRE-CURATED DATA AVAILABLE ===
Each restaurant includes Haiku-analyzed data:
- vibe_score: How well it matches user's request (0-10) - TRUST THIS for ranking
- extracted_dishes: Dishes already identified from reviews - USE THESE as recommended_dish
- quality_signals: Positive patterns detected ("hidden gem", "consistent")
- red_flags: Issues to mention as caveats ("slow service", "went downhill")
- walking_minutes: Time to walk there - factor into "Grab & Go" recommendations
` : ''}

=== ANALYSIS INSTRUCTIONS ===

1. DISH SELECTION
   ${hasCurationData 
     ? '- USE extracted_dishes as your PRIMARY source for recommended_dish\n   - Validate with review context if needed'
     : '- Scan reviews for specific dish names\n   - Look for: "the [dish name] is amazing", "must try the [dish]"'}
   - Extract SPECIFIC names like "Tonkotsu Ramen", "Margherita Pizza"
   - NOT generic terms like "ramen", "pizza"

2. VIBE MATCHING
   ${hasCurationData
     ? '- Prioritize restaurants with HIGH vibe_score (7+)\n   - vibe_score already factors in user\'s specific request'
     : '- Match restaurant style to user mood'}
   - For "Grab & Go": favor places with walking_minutes < 5, takeout=true
   - For "View & Vibe": favor places with serves_wine=true, higher ratings

3. QUALITY & RED FLAGS
   ${hasCurationData
     ? '- quality_signals are pre-identified - mention them in ai_reason\n   - red_flags are pre-identified - mention as honest caveats'
     : '- Look for "hidden gem", "locals favorite", "consistent"'}
   - Skip places with multiple red_flags

4. CASH-ONLY DETECTION
   - Check cash_only field
   - If user requires card, exclude cash_only=true places

=== OUTPUT REQUIREMENTS ===

Return EXACTLY 3 recommendations as a JSON array. For each:

- place_id: The restaurant's ID from the data
- recommended_dish: A SPECIFIC dish name ${hasCurationData ? 'from extracted_dishes' : 'found in reviews'}
- ai_reason: 2-3 sentences explaining:
  * Why this matches the user's vibe ${hasCurationData ? '(reference vibe_score)' : ''}
  * Evidence from reviews (quote specific praise)
  * ${hasCurationData ? 'Mention quality_signals if present' : 'Notable quality signals'}
  * ${hasCurationData ? 'Mention red_flags as honest caveats' : 'Honest caveat if relevant'}
  * Walking time if relevant for the vibe
- is_cash_only: Boolean
- is_new_opening: True if <50 reviews and "just opened" mentions

=== AI_REASON EXAMPLES ===

BAD: "Great restaurant with good food."

GOOD: "Their Duck Confit is legendary - reviewers call it 'perfectly crispy' and 'best in Mitte'. At 4.6 stars with 340 reviews, this French bistro delivers consistent quality. Just 4 minutes walk makes it perfect for your quick lunch."

=== CRITICAL RULES ===
- NEVER recommend the same restaurant twice
- Each place_id MUST be unique
- ${hasCurationData ? 'Prioritize restaurants with vibe_score >= 7' : ''}
- If user asked for specific food, ALL recommendations must serve it
- Better to return fewer high-quality matches than dilute with unrelated options`;

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
    
    // Log the picks
    const pickNames = finalResults.map(r => {
      const candidate = topCandidates.find(c => c.place_id === r.place_id);
      return candidate?.name || 'Unknown';
    });
    onLog?.(`TOP 3 PICKS: ${pickNames.join(', ').toUpperCase()}`);

    const durationMs = Math.round(performance.now() - startTime);
    
    return {
      recommendations: finalResults.map(rec => ({
        ...rec,
        cash_warning_msg: rec.is_cash_only ? 'Note: This location may be cash-only.' : null,
      })),
      durationMs
    };

  } catch (error) {
    const durationMs = Math.round(performance.now() - startTime);
    Logger.error('AI', 'Lunch decision failed', error);
    onLog?.(`ERROR: Analysis failed. Please try again.`);
    return { recommendations: [], durationMs };
  }
};
