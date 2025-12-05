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

// Types for deep analysis pipeline
interface TriageResult {
  place_id: string;
  relevance_score: number;
  is_food_establishment: boolean;
  cuisine_category: string;
  quick_assessment: string;
}

interface DeepAnalysisResult {
  place_id: string;
  dish_mentions: Array<{
    dish_name: string;
    mention_count: number;
    sentiment: 'positive' | 'neutral' | 'negative';
    sample_quote: string;
  }>;
  top_dish: string;
  quality_signals: string[];
  red_flags: string[];
  service_speed: 'fast' | 'moderate' | 'slow' | 'unknown';
  atmosphere: string;
  value_assessment: string;
  is_cash_only: boolean;
  is_new_opening: boolean;
  overall_score: number;
}

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

// Note: Website scraping removed for performance - reviews contain sufficient dish data

export const generateLoadingLogs = async (vibe: HungerVibe | null, address: string): Promise<string[]> => {
  const vibeText = vibe || 'Custom/User Defined';
  Logger.info('AI', 'Generating Loading Logs', { vibe: vibeText, address });

  const prompt = `
    You are a system AI for a culinary logistics engine. Your task is to generate 6 short, concrete, technical-sounding log messages that narrate the process of finding lunch with DEEP analysis. The messages should feel specific to the user's request.

    User's Location Context: "${address}"
    User's Desired Vibe: "${vibeText}"

    Generate logs that reflect a quick but thorough AI analysis:
    1. Initial scan
    2. Data gathering
    3. Review analysis
    4. Dish extraction from reviews
    5. Sentiment analysis
    6. Final ranking

    Use the location and vibe to make them specific. Be cool, efficient, and technical.

    Example for Vibe 'Grab & Go' and Address 'Kreuzberg, Berlin, Germany':
    1. "PARSING KREUZBERG SECTOR GRID..."
    2. "SCANNING 25 CANDIDATE ESTABLISHMENTS..."
    3. "MINING REVIEW DATA FOR DISH MENTIONS..."
    4. "ANALYZING DÖNER SENTIMENT PATTERNS..."
    5. "CROSS-REFERENCING QUALITY SIGNALS..."
    6. "CALCULATING OPTIMAL LUNCH VECTORS..."

    Return ONLY a valid JSON string array, with exactly 6 strings.
  `;

  try {
    const text = await callGeminiProxy(
      GEMINI_MODEL,
      prompt,
      {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.ARRAY,
          items: { type: Type.STRING }
        }
      }
    );
    
    if (!text) return ['PROCESSING...'];
    return JSON.parse(text) as string[];
  } catch (e) {
    Logger.warn('AI', 'Log generation failed, using fallbacks.', { error: e });
    return [
      'INITIATING ANALYSIS...',
      'MINING REVIEW DATA...',
      'EXTRACTING DISH MENTIONS...',
      'ANALYZING SENTIMENT...',
      'RANKING CANDIDATES...',
      'FINALIZING RECOMMENDATIONS...'
    ];
  }
};

/**
 * STAGE 1: TRIAGE
 * Quick assessment to filter out irrelevant candidates and identify top prospects
 */
const triageCandidates = async (
  candidates: GooglePlace[],
  vibe: HungerVibe | null,
  freestylePrompt: string | undefined,
  address: string,
  onLog?: AnalysisLogCallback
): Promise<TriageResult[]> => {
  Logger.info('AI', `[STAGE 1] Triage - Analyzing ${candidates.length} candidates`);
  
  // Personalized logging
  const sampleNames = candidates.slice(0, 3).map(c => c.name).join(', ');
  onLog?.(`SCANNING ${candidates.length} CANDIDATES: ${sampleNames}...`);
  
  const cuisineTypes = [...new Set(candidates.flatMap(c => c.types || []).filter(t => t.includes('restaurant')))];
  if (cuisineTypes.length > 0) {
    onLog?.(`DETECTED CUISINE VECTORS: ${cuisineTypes.slice(0, 4).join(', ').toUpperCase()}...`);
  }

  const candidateSummaries = candidates.map(p => ({
    id: p.place_id,
    name: p.name,
    types: p.types,
    rating: p.rating,
    review_count: p.user_ratings_total,
    price_level: p.price_level,
    summary: p.editorial_summary?.overview || '',
  }));

  const prompt = `
ROLE: You are a restaurant relevance analyzer. Your job is to quickly assess candidates and filter out non-relevant results.

LOCATION: ${address}
USER VIBE: ${vibe || 'Any'}
SPECIFIC REQUEST: ${freestylePrompt || 'None'}

CANDIDATES:
${JSON.stringify(candidateSummaries, null, 2)}

TASK:
For each candidate, assess:
1. Is this actually a food establishment? (relevance_score 0-10, 0 = not food)
2. What cuisine category does it fall into?
3. How well does it match the user's vibe/request?

CRITICAL: Set is_food_establishment to FALSE for:
- Retail stores (clothing, accessories, caps, etc.)
- Services (salons, gyms, etc.)
- Entertainment venues without food focus
- Any place where food is not the primary business

Return JSON array with assessments for ALL candidates.
`;

  try {
    const text = await callGeminiProxy(
      GEMINI_MODEL,
      prompt,
      {
        temperature: 0.3,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              place_id: { type: Type.STRING },
              relevance_score: { type: Type.NUMBER },
              is_food_establishment: { type: Type.BOOLEAN },
              cuisine_category: { type: Type.STRING },
              quick_assessment: { type: Type.STRING },
            },
            required: ['place_id', 'relevance_score', 'is_food_establishment', 'cuisine_category'],
          },
        },
      }
    );

    const results = JSON.parse(text) as TriageResult[];
    
    // Filter to only food establishments with decent relevance
    const validResults = results.filter(r => r.is_food_establishment && r.relevance_score >= 3);
    Logger.info('AI', `[STAGE 1] Triage complete: ${validResults.length}/${results.length} passed`);
    
    // Log which cuisines passed
    const passedCuisines = [...new Set(validResults.map(r => r.cuisine_category))].slice(0, 5);
    onLog?.(`TRIAGE COMPLETE: ${validResults.length} FOOD ESTABLISHMENTS VERIFIED`);
    if (passedCuisines.length > 0) {
      onLog?.(`CUISINE DIVERSITY CHECK: ${passedCuisines.join(', ').toUpperCase()}`);
    }
    
    return validResults;
  } catch (error) {
    Logger.error('AI', '[STAGE 1] Triage failed', error);
    // Fallback: return all candidates as potentially valid
    return candidates.map(c => ({
      place_id: c.place_id,
      relevance_score: 5,
      is_food_establishment: true,
      cuisine_category: 'unknown',
      quick_assessment: 'Triage skipped - fallback mode',
    }));
  }
};

/**
 * STAGE 2: DEEP ANALYSIS
 * Detailed analysis of each promising candidate using review mining
 */
const deepAnalyzeCandidates = async (
  candidates: GooglePlace[],
  triageResults: TriageResult[],
  address: string,
  onLog?: AnalysisLogCallback
): Promise<DeepAnalysisResult[]> => {
  Logger.info('AI', `[STAGE 2] Deep Analysis - Processing ${candidates.length} candidates`);

  // Create a map for quick lookup
  const triageMap = new Map(triageResults.map(t => [t.place_id, t]));
  
  // Log which restaurants we're deeply analyzing
  const topCandidates = candidates.slice(0, 5).map(c => c.name);
  onLog?.(`INITIATING REVIEW ANALYSIS FOR ${candidates.length} CANDIDATES...`);
  onLog?.(`PRIORITY TARGETS: ${topCandidates.join(', ').toUpperCase()}`);
  

  // Log review analysis
  const totalReviews = candidates.reduce((sum, c) => sum + (c.reviews?.length || 0), 0);
  onLog?.(`PARSING ${totalReviews} CUSTOMER REVIEWS FOR DISH MENTIONS...`);
  
  // Build analysis payload from reviews (no website scraping)
  const analysisPayload = candidates.map(p => {
    const triage = triageMap.get(p.place_id);
    
    // Include ALL reviews with full text for deep analysis
    const fullReviews = p.reviews?.map(r => ({
      text: r.text || '',
      rating: r.rating,
      time: r.relativeTime,
      author: r.authorName,
    })).filter(r => r.text.length > 0) || [];

    return {
      id: p.place_id,
      name: p.name,
      types: p.types,
      rating: p.rating,
      user_ratings_total: p.user_ratings_total,
      price_level: p.price_level,
      cuisine_category: triage?.cuisine_category || 'unknown',
      editorial_summary: p.editorial_summary?.overview || '',
      // Full reviews for deep semantic analysis
      reviews: fullReviews,
      review_count: fullReviews.length,
      // Payment info
      payment_options: p.payment_options,
      // Service attributes
      attributes: {
        vegetarian: p.serves_vegetarian_food,
        beer: p.serves_beer,
        wine: p.serves_wine,
        takeout: p.takeout,
        dine_in: p.dine_in,
      },
    };
  });

  const systemInstruction = `
ROLE: You are a DEEP REVIEW ANALYST specializing in extracting specific, actionable dining intelligence.

LOCATION CONTEXT: ${address}
Adapt analysis to include local language terms (German in Berlin, Spanish in Madrid, etc.)

YOUR MISSION: For each restaurant, perform exhaustive analysis:

============================================================
DISH EXTRACTION PROTOCOL (CRITICAL)
============================================================

1. SCAN every single review for SPECIFIC dish names
2. Count how many times each dish is mentioned
3. Note the sentiment for each mention (positive/negative)
4. Extract a sample quote for the top dish

EXAMPLES of what to extract:
- "Tonkotsu Ramen" NOT "ramen"
- "Eggs Benedict with Hollandaise" NOT "breakfast"
- "Margherita DOC" NOT "pizza"
- "Spicy Miso with Chashu" NOT "soup"

============================================================
QUALITY SIGNAL DETECTION
============================================================

Look for patterns:
- "always consistent" / "never disappoints" = POSITIVE
- "hidden gem" / "locals' favorite" = POSITIVE  
- "went downhill" / "not what it used to be" = NEGATIVE
- "overpriced" / "not worth it" = NEGATIVE
- "rude staff" / "slow service" = NEGATIVE

============================================================
CASH-ONLY DETECTION (CRITICAL)
============================================================

Scan for these signals in reviews AND payment_options:
- English: "cash only", "no cards", "bring cash", "ATM nearby"
- German: "nur Barzahlung", "keine Karten"
- If payment_options.accepts_cash_only = true, set is_cash_only = true
- If ANY review mentions cash-only, set is_cash_only = true

============================================================
OUTPUT REQUIREMENTS
============================================================

For EACH restaurant, you MUST provide:
- dish_mentions: Array of specific dishes found with counts and sentiment
- top_dish: The SINGLE most praised specific dish (NOT generic)
- quality_signals: List of positive patterns found
- red_flags: List of negative patterns found
- service_speed: Assessment based on review mentions
- is_cash_only: Boolean
- is_new_opening: True if high rating + <50 reviews + "just opened" mentions
- overall_score: 1-10 based on your analysis
`;

  const prompt = `
ANALYZE THESE ${analysisPayload.length} RESTAURANTS IN DEPTH:

${JSON.stringify(analysisPayload, null, 2)}

Return comprehensive analysis for EACH candidate. Be thorough - this data drives the final recommendation.
`;

  try {
    const text = await callGeminiProxy(
      GEMINI_MODEL,
      prompt,
      {
        systemInstruction,
        temperature: 0.4,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              place_id: { type: Type.STRING },
              dish_mentions: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    dish_name: { type: Type.STRING },
                    mention_count: { type: Type.INTEGER },
                    sentiment: { type: Type.STRING },
                    sample_quote: { type: Type.STRING },
                  },
                },
              },
              top_dish: { type: Type.STRING },
              quality_signals: { type: Type.ARRAY, items: { type: Type.STRING } },
              red_flags: { type: Type.ARRAY, items: { type: Type.STRING } },
              service_speed: { type: Type.STRING },
              atmosphere: { type: Type.STRING },
              value_assessment: { type: Type.STRING },
              is_cash_only: { type: Type.BOOLEAN },
              is_new_opening: { type: Type.BOOLEAN },
              overall_score: { type: Type.NUMBER },
            },
            required: ['place_id', 'top_dish', 'is_cash_only', 'overall_score'],
          },
        },
      }
    );

    const results = JSON.parse(text) as DeepAnalysisResult[];
    Logger.info('AI', `[STAGE 2] Deep analysis complete for ${results.length} candidates`);
    
    // Log dish extraction results from reviews
    const totalDishMentions = results.reduce((sum, r) => sum + (r.dish_mentions?.length || 0), 0);
    if (totalDishMentions > 0) {
      onLog?.(`REVIEW ANALYSIS COMPLETE: ${totalDishMentions} DISH MENTIONS EXTRACTED`);
      const sampleDishes = results
        .filter(r => r.top_dish)
        .slice(0, 3)
        .map(r => r.top_dish);
      if (sampleDishes.length > 0) {
        onLog?.(`TOP DISHES: ${sampleDishes.join(', ').toUpperCase()}`);
      }
    }
    
    // Log quality signals
    const highScorers = results.filter(r => r.overall_score >= 7);
    if (highScorers.length > 0) {
      onLog?.(`${highScorers.length} HIGH-QUALITY CANDIDATES IDENTIFIED (SCORE >= 7)`);
    }
    
    return results;
  } catch (error) {
    Logger.error('AI', '[STAGE 2] Deep analysis failed', error);
    return [];
  }
};

/**
 * STAGE 3: FINAL SELECTION
 * Synthesize all analysis into final recommendations with rich descriptions
 */
const finalSelection = async (
  candidates: GooglePlace[],
  deepAnalysis: DeepAnalysisResult[],
  vibe: HungerVibe | null,
  price: PricePoint | null,
  noCash: boolean,
  address: string,
  dietaryRestrictions: DietaryRestriction[],
  freestylePrompt?: string,
  onLog?: AnalysisLogCallback
): Promise<GeminiRecommendation[]> => {
  Logger.info('AI', `[STAGE 3] Final Selection from ${deepAnalysis.length} analyzed candidates`);
  
  onLog?.(`SYNTHESIZING ${deepAnalysis.length} ANALYZED CANDIDATES INTO FINAL RECOMMENDATIONS...`);

  // Filter out cash-only if user requires cashless
  let filteredAnalysis = deepAnalysis;
  if (noCash) {
    const cashOnlyCount = deepAnalysis.filter(a => a.is_cash_only).length;
    filteredAnalysis = deepAnalysis.filter(a => !a.is_cash_only);
    Logger.info('AI', `Filtered to ${filteredAnalysis.length} after cash-only removal`);
    if (cashOnlyCount > 0) {
      onLog?.(`FILTERED ${cashOnlyCount} CASH-ONLY ESTABLISHMENTS (USER REQUIRES CARD PAYMENT)`);
    }
  }

  // Sort by overall score
  filteredAnalysis.sort((a, b) => b.overall_score - a.overall_score);
  
  // Log the top candidates being considered
  const candidateMap = new Map(candidates.map(c => [c.place_id, c]));
  const topNames = filteredAnalysis.slice(0, 5).map(a => candidateMap.get(a.place_id)?.name).filter(Boolean);
  if (topNames.length > 0) {
    onLog?.(`TOP CONTENDERS: ${topNames.join(', ').toUpperCase()}`);
  }
  
  // Log vibe matching
  if (vibe) {
    onLog?.(`MATCHING CANDIDATES TO VIBE: "${vibe.toUpperCase()}"...`);
  }
  if (price) {
    onLog?.(`APPLYING BUDGET FILTER: ${price.toUpperCase()}...`);
  }
  if (dietaryRestrictions.length > 0) {
    onLog?.(`VERIFYING DIETARY REQUIREMENTS: ${dietaryRestrictions.join(', ').toUpperCase()}...`);
  }

  // Build selection payload with both candidate data and deep analysis
  
  const selectionPayload = filteredAnalysis.slice(0, 15).map(analysis => {
    const candidate = candidateMap.get(analysis.place_id);
    return {
      place_id: analysis.place_id,
      name: candidate?.name || 'Unknown',
      rating: candidate?.rating,
      review_count: candidate?.user_ratings_total,
      price_level: candidate?.price_level,
      // Deep analysis results
      top_dish: analysis.top_dish,
      dish_mentions: analysis.dish_mentions?.slice(0, 5) || [],
      quality_signals: analysis.quality_signals || [],
      red_flags: analysis.red_flags || [],
      service_speed: analysis.service_speed,
      atmosphere: analysis.atmosphere,
      value_assessment: analysis.value_assessment,
      overall_score: analysis.overall_score,
      is_cash_only: analysis.is_cash_only,
      is_new_opening: analysis.is_new_opening,
    };
  });

  const budgetContext = price ? `
USER BUDGET: ${price}
- Bootstrapped: Prioritize price_level 1-2, value-focused
- Series A: Standard business lunch, price_level 2-3
- Company Card: Quality over cost, price_level 3-4 welcome
` : 'USER BUDGET: No constraint - select based on quality';

  const dietaryContext = dietaryRestrictions.length > 0 ? `
DIETARY REQUIREMENTS (CRITICAL): ${dietaryRestrictions.join(', ')}
- Prioritize restaurants with explicit signals for these requirements
- Note in ai_reason if verification with restaurant is recommended
` : '';

  const systemInstruction = `
ROLE: You are the FINAL DECISION MAKER for lunch recommendations.
You have received DEEP ANALYSIS data for ${selectionPayload.length} pre-screened candidates.

LOCATION: ${address}
USER VIBE: ${vibe || 'Any - match based on quality'}
SPECIFIC REQUEST: ${freestylePrompt || 'None'}
${budgetContext}
${dietaryContext}

============================================================
YOUR TASK: SELECT 5-10 BEST OPTIONS AND WRITE COMPELLING REASONS
============================================================

For each selection, the ai_reason MUST include:

1. WHY THIS PLACE (specific to user's vibe/request)
   - "Perfect for ${vibe || 'your request'} because..."
   - Connect the restaurant's strengths to what the user wants

2. EVIDENCE FROM REVIEWS
   - Cite specific dish mentions: "The Tonkotsu Ramen is mentioned in X reviews"
   - Quote sentiment: "Reviewers consistently praise the 'perfectly cooked noodles'"

3. STANDOUT QUALITIES
   - What makes this place special?
   - Service speed if relevant
   - Atmosphere fit

4. HONEST CAVEATS (if any)
   - Mention red flags if present
   - Cash-only warning
   - Long wait times

============================================================
AI_REASON EXAMPLES
============================================================

BAD (generic, useless):
"Great Italian restaurant with good food and nice atmosphere."

GOOD (specific, evidence-based):
"The Cacio e Pepe is legendary here - mentioned in 8 reviews with phrases like 'best in Berlin' and 'authentic Roman recipe'. At 4.7 stars from 234 reviews, this hidden gem in Kreuzberg delivers quick service (most reviewers mention 15-20min meals) perfect for a fast but quality lunch. The only caveat: it gets crowded after 1pm."

============================================================
RECOMMENDED_DISH RULES (ABSOLUTE)
============================================================

The recommended_dish MUST be:
- A SPECIFIC dish name from the analysis (use top_dish or dish_mentions)
- NEVER generic like "pasta", "burger", "their specialty"
- If no specific dish was found, use the most specific item you can construct from context

============================================================
DIVERSITY REQUIREMENT
============================================================

Your 5-10 selections MUST span different cuisines.
DO NOT return all Italian or all Asian restaurants.

Return the final selections as a JSON array.
`;

  const prompt = `
SELECT THE BEST 5-10 LUNCH OPTIONS FROM THIS ANALYZED DATA:

${JSON.stringify(selectionPayload, null, 2)}

Remember:
- Each ai_reason must be SPECIFIC with evidence from the deep analysis
- recommended_dish must be the SPECIFIC top_dish from analysis
- Include diverse cuisines
- Respect budget and dietary requirements
`;

  try {
    const text = await callGeminiProxy(
      GEMINI_MODEL,
      prompt,
      {
        systemInstruction,
        temperature: 0.6,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              place_id: { type: Type.STRING },
              ai_reason: { type: Type.STRING },
              recommended_dish: { type: Type.STRING },
              is_cash_only: { type: Type.BOOLEAN },
              is_new_opening: { type: Type.BOOLEAN },
            },
            required: ['place_id', 'ai_reason', 'recommended_dish', 'is_cash_only'],
          },
        },
      }
    );

    const recommendations = JSON.parse(text) as Omit<GeminiRecommendation, 'cash_warning_msg'>[];
    Logger.info('AI', `[STAGE 3] Final selection complete: ${recommendations.length} recommendations`);
    
    // Log final recommendations
    const finalNames = recommendations.slice(0, 3).map(r => {
      const candidate = candidateMap.get(r.place_id);
      return candidate?.name || 'Unknown';
    });
    onLog?.(`FINAL SELECTION: ${recommendations.length} OPTIMAL MATCHES IDENTIFIED`);
    if (finalNames.length > 0) {
      onLog?.(`YOUR TOP PICKS: ${finalNames.join(', ').toUpperCase()}`);
    }

    return recommendations.map(rec => ({
      ...rec,
      cash_warning_msg: rec.is_cash_only ? 'Note: This location may be cash-only.' : null,
    }));
  } catch (error) {
    Logger.error('AI', '[STAGE 3] Final selection failed', error);
    return [];
  }
};

/**
 * MAIN ENTRY POINT: Multi-stage lunch decision pipeline
 * 
 * Stage 1: Triage - Quick filter to identify food establishments and relevance
 * Stage 2: Deep Analysis - Exhaustive review mining and menu extraction  
 * Stage 3: Final Selection - Synthesize analysis into compelling recommendations
 * 
 * @param onLog - Optional callback to receive real-time analysis logs for UI display
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
  Logger.info('AI', '=== MULTI-STAGE LUNCH DECISION PIPELINE ===', { 
    candidateCount: candidates.length, 
    vibe, 
    price, 
    freestylePrompt 
  });

  if (candidates.length === 0) {
    Logger.warn('AI', 'No candidates provided to decision pipeline');
    return [];
  }

  try {
    // STAGE 1: TRIAGE
    Logger.info('AI', '[PIPELINE] Starting Stage 1: Triage');
    onLog?.(`STAGE 1: TRIAGE - ANALYZING ${candidates.length} CANDIDATES...`);
    const triageResults = await triageCandidates(candidates, vibe, freestylePrompt, address, onLog);
    
    if (triageResults.length === 0) {
      Logger.warn('AI', 'Triage returned no valid food establishments');
      return [];
    }

    // Get candidates that passed triage
    const validPlaceIds = new Set(triageResults.map(t => t.place_id));
    const triagePassed = candidates.filter(c => validPlaceIds.has(c.place_id));
    
    // Sort by triage relevance and take top 20 for deep analysis
    const sortedTriage = triageResults.sort((a, b) => b.relevance_score - a.relevance_score);
    const topCandidateIds = new Set(sortedTriage.slice(0, 20).map(t => t.place_id));
    const candidatesForDeepAnalysis = triagePassed.filter(c => topCandidateIds.has(c.place_id));

    Logger.info('AI', `[PIPELINE] ${candidatesForDeepAnalysis.length} candidates passed triage for deep analysis`);

    // STAGE 2: DEEP ANALYSIS
    Logger.info('AI', '[PIPELINE] Starting Stage 2: Deep Analysis');
    onLog?.(`STAGE 2: DEEP ANALYSIS - MINING DATA FOR ${candidatesForDeepAnalysis.length} RESTAURANTS...`);
    const deepAnalysisResults = await deepAnalyzeCandidates(
      candidatesForDeepAnalysis,
      triageResults,
      address,
      onLog
    );

    if (deepAnalysisResults.length === 0) {
      Logger.warn('AI', 'Deep analysis returned no results, falling back to triage data');
      // Create minimal analysis from triage
      const fallbackAnalysis: DeepAnalysisResult[] = candidatesForDeepAnalysis.slice(0, 10).map(c => ({
        place_id: c.place_id,
        dish_mentions: [],
        top_dish: c.editorial_summary?.overview?.split('.')[0] || 'Chef\'s selection',
        quality_signals: [],
        red_flags: [],
        service_speed: 'unknown' as const,
        atmosphere: 'unknown',
        value_assessment: 'unknown',
        is_cash_only: c.payment_options?.accepts_cash_only || false,
        is_new_opening: (c.user_ratings_total || 0) < 50,
        overall_score: c.rating ?? 4,
      }));
      
      // Still proceed to stage 3 with fallback data
      Logger.info('AI', '[PIPELINE] Using fallback analysis data');
      onLog?.(`USING FALLBACK ANALYSIS DATA - PROCEEDING TO FINAL SELECTION...`);
      const recommendations = await finalSelection(
        candidatesForDeepAnalysis,
        fallbackAnalysis,
        vibe,
        price,
        noCash,
        address,
        dietaryRestrictions,
        freestylePrompt,
        onLog
      );
      return recommendations;
    }

    // STAGE 3: FINAL SELECTION
    Logger.info('AI', '[PIPELINE] Starting Stage 3: Final Selection');
    onLog?.(`STAGE 3: FINAL SELECTION - RANKING AND SELECTING BEST MATCHES...`);
    const recommendations = await finalSelection(
      candidatesForDeepAnalysis,
      deepAnalysisResults,
      vibe,
      price,
      noCash,
      address,
      dietaryRestrictions,
      freestylePrompt,
      onLog
    );

    Logger.info('AI', '=== PIPELINE COMPLETE ===', { 
      finalCount: recommendations.length,
      stages: '3/3'
    });

    return recommendations;

  } catch (error) {
    Logger.error('AI', 'Multi-stage pipeline failed', error);
    return [];
  }
};
