import { GooglePlace, HungerVibe, GeminiRecommendation, PricePoint, DietaryRestriction } from '../types';
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

// The ONLY model we use - gemini-3-pro-preview exclusively
const GEMINI_MODEL = 'gemini-3-pro-preview';

// Callback type for real-time logging during analysis
export type AnalysisLogCallback = (message: string) => void;

// Internal helper to call the Supabase Edge Function
const callGeminiProxy = async (model: string, contents: string, config: Record<string, unknown>): Promise<string> => {
  const startTime = performance.now();
  Logger.aiRequest(model, contents.substring(0, 500) + '...');

  try {
    const { data, error } = await supabase.functions.invoke('gemini-proxy', {
      body: { model, contents, config },
    });

    if (error) {
      throw new Error(error.message || 'Edge Function invocation failed');
    }

    if (!data?.text) {
      throw new Error('Invalid response from Gemini proxy');
    }

    const duration = Math.round(performance.now() - startTime);
    const estimatedTokens = data.text ? Math.ceil(data.text.length / 4) : 0;
    Logger.aiResponse(model, duration, true, estimatedTokens);

    return data.text;
  } catch (error) {
    const duration = Math.round(performance.now() - startTime);
    Logger.error('AI', `Gemini Proxy Call Failed (${duration}ms)`, error);
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
    const text = await callGeminiProxy(
      GEMINI_MODEL,
      prompt,
      {
        temperature: 0.9, // Higher temp for more creative/varied responses
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.ARRAY,
          items: { type: Type.STRING }
        }
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
 * STREAMLINED LUNCH DECISION - Single API Call
 * 
 * Analyzes candidates and returns exactly 3 recommendations.
 * Uses detailed system prompt for quality while keeping it to ONE fast API call.
 */
export const decideLunch = async (
  candidates: GooglePlace[],
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
  
  // Build payload with up to 20 reviews per restaurant
  const payload = topCandidates.map(p => {
    const reviews = (p.reviews || [])
      .slice(0, 20)
      .map(r => r.text)
      .filter(t => t && t.length > 0);
    
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
    };
  });

  const totalReviews = payload.reduce((sum, p) => sum + p.reviews.length, 0);
  onLog?.(`MINING ${totalReviews} REVIEWS FOR DISH MENTIONS...`);

  // Budget context
  const budgetText = price ? {
    'Bootstrapped': 'Budget-conscious, prefer price_level 1-2',
    'Series A': 'Mid-range, price_level 2-3 ideal',
    'Company Card': 'Quality over cost, any price_level welcome'
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

=== ANALYSIS INSTRUCTIONS ===

1. DISH EXTRACTION (Critical)
   - Scan ALL reviews for specific dish names
   - Look for: "the [dish name] is amazing", "must try the [dish]", "best [dish] in town"
   - Extract SPECIFIC names like "Tonkotsu Ramen", "Margherita Pizza", "Eggs Benedict"
   - NOT generic terms like "ramen", "pizza", "breakfast"

2. QUALITY SIGNALS
   - High ratings (4.3+) with many reviews = reliable
   - Phrases like "hidden gem", "locals' favorite", "always consistent"
   - Recent positive reviews indicate current quality

3. RED FLAGS
   - "went downhill", "not what it used to be"
   - "overpriced", "slow service", "rude staff"
   - Skip places with multiple red flags

4. CASH-ONLY DETECTION
   - Check cash_only field
   - Scan reviews for "cash only", "no cards", "bring cash"
   - German: "nur Barzahlung"

=== OUTPUT REQUIREMENTS ===

Return EXACTLY 3 recommendations. For each:

- place_id: The restaurant's ID from the data
- recommended_dish: A SPECIFIC dish name found in reviews (never generic)
- ai_reason: 2-3 sentences explaining:
  * Why this matches the user's vibe
  * Evidence from reviews (quote specific praise)
  * Any notable quality signals
  * Honest caveat if relevant
- is_cash_only: Boolean
- is_new_opening: True if <50 reviews and "just opened" mentions

=== AI_REASON EXAMPLES ===

BAD: "Great restaurant with good food."

GOOD: "Their Duck Confit is legendary - multiple reviewers call it 'perfectly crispy' and 'best in Mitte'. At 4.6 stars with 340 reviews, this French bistro delivers consistent quality. Quick service makes it ideal for a satisfying lunch."

=== CRITICAL: NO DUPLICATES ===
- NEVER recommend the same restaurant twice
- Each place_id in your response MUST be unique
- If you can't find 3 different quality options, return fewer (1 or 2) rather than duplicating

=== DIVERSITY ===
Select 3 restaurants with DIFFERENT cuisine types when possible.`;

  const prompt = `Analyze these ${payload.length} restaurants and select exactly 3 best matches:

${JSON.stringify(payload, null, 2)}

Return a JSON array with exactly 3 recommendations.`;

  try {
    onLog?.(`RANKING TOP CANDIDATES...`);
    
    const text = await callGeminiProxy(
      GEMINI_MODEL,
      prompt,
      {
        systemInstruction,
        temperature: 0.5,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              place_id: { type: Type.STRING },
              recommended_dish: { type: Type.STRING },
              ai_reason: { type: Type.STRING },
              is_cash_only: { type: Type.BOOLEAN },
              is_new_opening: { type: Type.BOOLEAN },
            },
            required: ['place_id', 'recommended_dish', 'ai_reason', 'is_cash_only'],
          },
        },
      }
    );

    const results = JSON.parse(text) as Omit<GeminiRecommendation, 'cash_warning_msg'>[];
    
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
