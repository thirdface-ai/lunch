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

// Internal helper to call the Supabase Edge Function
const callGeminiProxy = async (model: string, contents: string, config: Record<string, unknown>): Promise<string> => {
  const startTime = performance.now();
  Logger.aiRequest(model, contents);

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
    
    // Rough estimation of output tokens based on char count
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
  const vibeText = vibe || 'Custom/User Defined';
  Logger.info('AI', 'Generating Loading Logs', { vibe: vibeText, address });

  const prompt = `
    You are a system AI for a culinary logistics engine. Your task is to generate 4 short, concrete, technical-sounding log messages that narrate the process of finding lunch. The messages should feel specific to the user's request.

    User's Location Context: "${address}"
    User's Desired Vibe: "${vibeText}"

    Generate logs that reflect a logical search sequence. Use the location and vibe to make them specific. Do not use generic "hacking" tropes. Be cool, efficient, and technical.

    Example for Vibe 'Grab & Go' and Address 'Kreuzberg, Berlin, Germany':
    1. "PARSING KREUZBERG SECTOR GRID..."
    2. "ISOLATING HIGH-THROUGHPUT VENDORS..."
    3. "CROSS-REFERENCING DÖNER & CURRYWURST DATASTREAMS..."
    4. "PLOTTING OPTIMAL FOOT-TRAFFIC VECTORS..."

    Return ONLY a valid JSON string array, with exactly 4 strings.
  `;

  try {
    const text = await callGeminiProxy(
      'gemini-2.0-flash',
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
    return ['OPTIMIZING SEARCH...', 'READING MENUS...', 'CALCULATING ROUTES...'];
  }
};

export const decideLunch = async (
  candidates: GooglePlace[],
  vibe: HungerVibe | null,
  price: PricePoint | null,
  noCash: boolean,
  address: string,
  dietaryRestrictions: DietaryRestriction[],
  freestylePrompt?: string
): Promise<GeminiRecommendation[]> => {

  Logger.info('AI', 'Starting Lunch Decision Matrix', { 
    candidateCount: candidates.length, 
    vibe, 
    price, 
    freestylePrompt 
  });

  // Pre-process candidates to give the AI a very clean JSON object to work with
  // Include rich review data for deep semantic analysis
  const analysisPayload = candidates.map(p => ({
    id: p.place_id,
    name: p.name,
    types: p.types,
    rating: p.rating,
    user_ratings_total: p.user_ratings_total,
    price_level: p.price_level,
    virtual_menu_source: p.editorial_summary?.overview || 'No official menu summary available.',
    website_ref: p.website || 'N/A',
    attributes: {
      is_vegetarian: p.serves_vegetarian_food,
      has_takeout: p.takeout,
      has_dine_in: p.dine_in,
      has_alcohol: p.serves_beer || p.serves_wine,
      payment_options: p.payment_options 
    },
    // Deep review analysis: 20 reviews with full context for AI analysis
    reviews_deep: p.reviews?.slice(0, 20).map(r => ({
      text: r.text?.substring(0, 500) || '',
      rating: r.rating,
      author: r.author_name,
      time_ago: r.relative_time_description,
    })).filter(r => r.text.length > 0) || [],
    review_count: p.reviews?.length || 0,
  }));

  const dietaryProtocol = `
    7. DIETARY RESTRICTION PROTOCOL (HIGH PRIORITY & LOCALIZED):
       - This is a critical filter ONLY if the user has specified any needs. If no needs are specified, this protocol should not influence your decision.
       - You MUST scan reviews, virtual menus, and attributes for strong signals that a restaurant can accommodate the specified needs, using both English and the local language.
       - EXAMPLES (Gluten-Free): "gluten-free", "glutenfrei", "celiac", "GF options".
       - EXAMPLES (Vegan): "vegan", "pflanzlich", "vegane optionen".
       - EXAMPLES (Vegetarian): "vegetarian", "vegetarisch".
       - SCORING:
         - Explicit mentions of accommodating these diets in reviews or menus should grant a candidate a SIGNIFICANT priority boost.
         - Conversely, reviews mentioning poor handling of allergies or cross-contamination for these specific needs should be a strong negative signal.
       - If no candidates strongly match the dietary needs, you must still select the best available options but note in the \`ai_reason\` that explicit dietary information was not available and the user should verify with the restaurant.
  `;

  const budgetProtocol = price ? `
    6. BUDGET MATRIX (STRICT):
       - [Bootstrapped]: Target \`price_level: 1\`. Can select \`price_level: 2\` ONLY if reviews contain strong "great value," "cheap," "affordable," or "large portions for the price" signals. ABSOLUTELY AVOID \`price_level > 2\`.
       - [Series A]: Target \`price_level: 2-3\`. This is the standard business lunch tier. Avoid \`price_level: 1\` unless it is an acclaimed "hidden gem" with exceptional reviews.
       - [Company Card]: Target \`price_level: 3-4\`. Prioritize quality, atmosphere, and experience over cost. \`price_level: 2\` is only acceptable if it's a known gastronomic hotspot that happens to be affordable.
  ` : `
    6. BUDGET MATRIX (OPEN / UNCONSTRAINED):
       - The user has NOT specified a budget constraint.
       - You are free to select candidates from ANY price range (from cheap eats to fine dining) as long as they represent the best match for the Vibe and Quality.
       - Focus purely on food quality, atmosphere, and relevance to the request.
  `;

  const systemInstruction = `
    ROLE: You are a high-precision Culinary Data Scientist & Logistics Officer, operating under the codename "LUNCHBOX".
    MODEL: gemini-2.0-flash

    CONTEXT:
    You are analyzing lunch options for a user located at: "${address}". This geographic context (city, country) is CRITICAL. You MUST adapt your language analysis to the local language. For example, if the user is in Berlin, Germany, you must search reviews for German terms (e.g., "glutenfrei" for gluten-free, "barzahlung" for cash only) in addition to English terms.

    PRIMARY OBJECTIVE: 
    From the provided JSON array of restaurant candidates, select a diverse pool of 5 to 10 optimal lunch destinations. Your final output MUST contain a MINIMUM of 3 recommendations. This is a non-negotiable requirement. If you cannot find at least 3 perfect matches for the user's vibe and budget, you are authorized and required to supplement the results with the next-best logical alternatives to meet this quota. Your selection must be a ruthlessly logical, data-driven synthesis of the user's constraints and the implicit operational reality of the candidate locations.

    CORE DIRECTIVES (NON-NEGOTIABLE):

    1. THE "HIDDEN GEM" HEURISTIC (PRIMARY SORTING BIAS):
       - Your primary goal is discovery, not confirmation. STRONGLY FAVOR high-quality, independent restaurants over famous chains or obvious tourist traps.
       - Define the "sweet spot" for a hidden gem as: Rating > 4.3 AND User Ratings Total BETWEEN 50 and 750.
       - Places with thousands of reviews are acceptable only if they are a perfect vibe/budget match and no other viable "hidden gem" candidates exist.
       - De-prioritize candidates with overly generic names (e.g., 'Italian Restaurant') if more specific, characterful options exist.

    2. DIVERSITY PROTOCOL (STRICT & MANDATORY):
       - The selected pool of restaurants MUST represent fundamentally different culinary worlds.
       - EXAMPLE (FAIL): A pool containing only Italian restaurants.
       - EXAMPLE (SUCCESS): A pool containing a Ramen Shop, a French Bistro, and a Salad Bar.
       - This protocol is absolute. If you cannot find a diverse pool of options that match the vibe, you must still provide the best candidates and note the lack of diversity in an \`ai_reason\` field.

    3. DEEP SEMANTIC REVIEW ANALYSIS (CRITICAL - SPEND TIME HERE):
       - You have access to \`reviews_deep\` containing up to 20 reviews per candidate with full text, ratings, and timestamps.
       - You MUST perform DEEP semantic analysis of ALL reviews for every candidate. This is the core of your analysis.
       - EXTRACT SPECIFIC DISH NAMES: Scan every review for mentions of specific dishes, ingredients, or menu items.
       - IDENTIFY PATTERNS: Look for dishes mentioned by MULTIPLE reviewers - these are validated recommendations.
       - EXTRACT QUOTES: Pull 2-3 short, impactful quotes from reviews that capture the essence of the place.
       - OPERATIONAL DATA: Extract mentions of "wait times," "noise level," "service speed," "good for groups," "great for lunch," etc.
       - SENTIMENT ANALYSIS: Synthesize overall sentiment. Look for recurring praise or complaints.
       - NEGATIVE SIGNALS: A single deal-breaker mentioned in multiple reviews (e.g., 'dirty', 'rude service', 'long wait') should disqualify a candidate.
       - VIBE VALIDATION: Do reviews for a "View & Vibe" candidate actually mention the view? Do "Grab & Go" candidates have reviews mentioning fast service?

    4. PERSONALIZED FIT ANALYSIS (REQUIRED FOR EACH SELECTION):
       - The \`personalized_fit\` field MUST explain specifically WHY this restaurant matches THIS user's preferences.
       - Reference the user's stated vibe, budget, and dietary needs explicitly.
       - EXAMPLE (BAD): "Great restaurant with good food."
       - EXAMPLE (GOOD): "Perfect for your 'Light & Clean' vibe: reviews mention 'fresh salads,' 'healthy options,' and 'light portions.' Multiple reviewers note it's ideal for a quick lunch. Within your 'Series A' budget at price level 2."
       - If the user has dietary restrictions, explain how the restaurant accommodates them based on review evidence.

    5. REVIEW-EXTRACTED DISH RECOMMENDATIONS (STRICT):
       - \`recommended_dish\` MUST be a specific dish name extracted DIRECTLY from \`reviews_deep\`.
       - Prioritize dishes mentioned by MULTIPLE reviewers.
       - Include the specific name as reviewers wrote it (e.g., "Spicy Miso Ramen" not just "ramen").
       - GENERIC RECOMMENDATIONS ARE A CRITICAL FAILURE. Never output:
         - "Signature dishes or daily specials"
         - "Ask the staff"
         - "Any of the pasta dishes"
         - Generic category names like "Pizza" or "Burger"
       - If no specific dish is mentioned in reviews, use the \`virtual_menu_source\` OR output "Chef's recommendation (verify with staff)" as LAST RESORT ONLY.

    6. REVIEW HIGHLIGHTS (REQUIRED):
       - \`review_highlights\` MUST contain 2-3 short, impactful direct quotes from the reviews.
       - Choose quotes that reveal: food quality, atmosphere, service, or unique selling points.
       - Keep quotes under 100 characters each. Truncate with "..." if needed.
       - Include the reviewer's rating if available (e.g., "[5★] 'Best ramen in the city!'").

    7. FUNCTIONAL REASONING & AI_REASON:
       - \`ai_reason\` should be a comprehensive analysis including:
         - Rating analysis (e.g., "4.7/5 from 342 reviews indicates consistent quality")
         - Review sentiment summary
         - Why this beats other candidates
         - Any caveats or things to be aware of
       - **Comparative Analysis is Mandatory.** State *why* this option was chosen over a strong-but-rejected candidate.

    8. PAYMENT PROTOCOL (STRICT & LOCALIZED):
       - IF 'noCash' is TRUE: DISCARD any place with signals of being CASH ONLY.
       - Scan \`payment_options\` and \`reviews_deep\` for payment method mentions.
       - Set 'is_cash_only' to true if evidence suggests cash-only.

    ${budgetProtocol}

    9. FRESH DROP / NEW OPENING PROTOCOL:
       - Give advantage to "Fresh Drops": high ratings but < 50 reviews, or reviews mentioning "just opened", "new spot".
       - Set \`is_new_opening\` to true for qualifying candidates.
    
    10. FREESTYLE PROMPT PROTOCOL (HIGHEST PRIORITY):
        - If "SPECIFIC REQUEST" is provided, it OVERRIDES generic vibe constraints.
        - The specific request is the user's direct voice.

    ${dietaryRestrictions.length > 0 ? dietaryProtocol : ''}
    
    ---
    ANALYSIS DEPTH REQUIREMENT:
    Take your time analyzing the reviews. The quality of your dish recommendations and personalized fit explanations depends on thorough review analysis. A shallow analysis that misses specific dish names or returns generic recommendations is a failure.
    
    FINAL OUTPUT:
    Return strictly valid JSON matching the provided schema. Your deep analysis must be evident in:
    - Specific dish names from reviews
    - Personalized fit explanations referencing user preferences
    - Direct quotes from reviewers
    - Data-driven reasoning
  `;

  const prompt = `
    USER LOCATION CONTEXT: ${address}
    CURRENT MENTAL STATE: ${vibe || 'CUSTOM / USER DEFINED'}
    SPECIFIC REQUEST (FREESTYLE): ${freestylePrompt ? `"${freestylePrompt}"` : 'None'}
    BUDGET TIER: ${price || 'ANY / UNCONSTRAINED'}
    USER REQUIRES CASHLESS: ${noCash}
    DIETARY NEEDS: [${dietaryRestrictions.join(', ')}]
    
    CANDIDATES:
    ${JSON.stringify(analysisPayload)}
  `;

  try {
    const text = await callGeminiProxy(
      'gemini-2.0-flash',
      prompt,
      {
        systemInstruction: systemInstruction,
        temperature: 0.7, 
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
              personalized_fit: { type: Type.STRING },
              review_highlights: { 
                type: Type.ARRAY,
                items: { type: Type.STRING }
              },
            },
            required: ['place_id', 'ai_reason', 'recommended_dish', 'is_cash_only', 'personalized_fit', 'review_highlights'],
          },
        },
      }
    );

    if (!text) {
      Logger.error('AI', 'Empty response from Gemini Proxy');
      throw new Error('Empty response from Gemini Proxy');
    }

    const recommendations = JSON.parse(text) as Omit<GeminiRecommendation, 'cash_warning_msg'>[];
    Logger.info('AI', 'Decision Matrix Complete', { count: recommendations.length });
    
    return recommendations.map(rec => ({
      ...rec,
      cash_warning_msg: rec.is_cash_only ? 'Note: This location may be cash-only.' : null,
      // Ensure review_highlights is always an array
      review_highlights: rec.review_highlights || [],
      // Ensure personalized_fit has a fallback
      personalized_fit: rec.personalized_fit || rec.ai_reason,
    }));

  } catch (error) {
    Logger.error('AI', 'Gemini Decision Failed', error);
    return [];
  }
};
