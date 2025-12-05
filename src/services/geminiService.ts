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

  // Pre-process candidates with FULL review data for deep AI analysis
  const analysisPayload = candidates.map(p => {
    // Extract comprehensive review data with ratings for sentiment analysis
    const reviewsWithMetadata = p.reviews?.slice(0, 20).map(r => ({
      text: r.text?.substring(0, 500) || '',
      rating: r.rating,
      time: r.relativeTime,
    })).filter(r => r.text.length > 0) || [];

    return {
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
      // Full reviews with ratings for deep semantic analysis
      reviews: reviewsWithMetadata,
      review_count: reviewsWithMetadata.length,
    };
  });

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
    ROLE: You are an elite Culinary Intelligence Analyst operating under codename "LUNCHBOX". You specialize in deep semantic analysis of restaurant reviews to extract actionable dining intelligence.
    MODEL: gemini-3.0-preview

    CONTEXT:
    Location: "${address}". This geographic context is CRITICAL - adapt your language analysis to include local language terms (e.g., German "glutenfrei", "lecker", "Schnitzel" in Berlin).

    PRIMARY OBJECTIVE: 
    Perform DEEP REVIEW MINING to select 5-10 optimal lunch destinations. MINIMUM 3 recommendations required.

    ============================================================
    CRITICAL: DEEP REVIEW ANALYSIS PROTOCOL (MANDATORY)
    ============================================================
    
    For EACH candidate, you MUST perform multi-layer semantic analysis:

    LAYER 1 - DISH EXTRACTION (HIGHEST PRIORITY):
    - Scan ALL reviews for specific dish names (not categories like "pasta" but actual dishes like "Cacio e Pepe", "Tonkotsu Ramen", "Bánh Mì")
    - Count frequency: How many reviews mention the same dish?
    - Extract sentiment per dish: "amazing [dish]", "best [dish] in town", "disappointing [dish]"
    - Cross-reference with menu/editorial summary
    - The \`recommended_dish\` MUST be the most frequently praised specific item from reviews
    - If reviews mention "the [X] is a must-try" or "don't miss the [X]" - that's your dish

    LAYER 2 - QUALITY SIGNALS:
    - Identify recurring praise patterns: "always consistent", "never disappoints", "hidden gem"
    - Identify red flags: "went downhill", "used to be good", "overpriced", "long wait", "rude staff"
    - Weight recent reviews (check time indicators) higher than older ones
    - Look for specificity: Detailed reviews > vague "great food" reviews

    LAYER 3 - OPERATIONAL INTELLIGENCE:
    - Service speed signals: "quick lunch", "fast service", "waited 45 minutes"
    - Atmosphere: "quiet", "loud", "good for meetings", "cramped"
    - Value signals: "huge portions", "overpriced", "great value"
    
    ============================================================
    DISH RECOMMENDATION RULES (ZERO TOLERANCE FOR GENERICS)
    ============================================================
    
    The \`recommended_dish\` field is the most important output. Follow these rules:

    FORBIDDEN (instant failure):
    - "Their specialty" / "House special"
    - "Any of the [category]" / "All pastas are good"
    - "Check the menu" / "Daily specials"
    - Generic categories: "Pizza", "Burger", "Salad", "Sandwich"
    - Vague: "Everything is good"

    REQUIRED (specific extracted dishes):
    - "Margherita DOC" not "Pizza"
    - "Spicy Miso Ramen with Chashu" not "Ramen"
    - "Eggs Benedict with Hollandaise" not "Breakfast"
    - "Double Smashburger with Secret Sauce" not "Burger"

    If reviews don't mention specific dishes, look for:
    - "The [X]" pattern: "The carbonara here is insane"
    - "Order the [X]": "Order the lamb chops"
    - "Famous for [X]": "Famous for their sourdough"
    - Named items: "Big Mac" style proprietary names

    ============================================================
    SELECTION CRITERIA
    ============================================================

    1. HIDDEN GEM BIAS:
       - Sweet spot: Rating > 4.3, Reviews between 50-750
       - Favor independents over chains
       - De-prioritize tourist traps

    2. DIVERSITY MANDATE:
       - Pool must span different cuisines
       - Fail: All Italian. Success: Ramen + French Bistro + Taqueria

    3. PAYMENT PROTOCOL (STRICT & LOCALIZED):
       - Scan \`payment_options\` AND reviews for cash-only signals
       - Local language detection required (e.g., "nur Barzahlung", "solo efectivo", "contanti")
       - English signals: "cash only", "no cards", "ATM nearby", "bring cash"
       - IF \`payment_options.accepts_credit_cards: false\` OR \`payment_options.accepts_cash_only: true\`:
         - IMMEDIATELY set \`is_cash_only: true\`
       - IF reviews mention cash-only (even once): set \`is_cash_only: true\`
       - IF noCash=true in user request:
         - DISCARD any candidate with cash-only signals entirely
       - IF noCash=false (user allows cash):
         - Include cash-only places but MUST set \`is_cash_only: true\` to warn user

    ${budgetProtocol}

    4. FRESH DROP DETECTION:
       - High rating + low reviews (<50) + "just opened" mentions = \`is_new_opening: true\`

    5. FREESTYLE OVERRIDE:
       - User's specific request takes priority over vibe

    ${dietaryRestrictions.length > 0 ? dietaryProtocol : ''}

    ============================================================
    AI_REASON QUALITY STANDARD
    ============================================================
    
    Must include:
    - Specific review evidence: "Reviews cite the 'Duck Confit' 6 times with unanimous praise"
    - Data points: Rating density, review sentiment ratio
    - Why this over alternatives: "Chosen over X because reviews confirm faster service"
    
    BAD: "Great Italian food with nice atmosphere!"
    GOOD: "4.6/312 reviews with 8 mentions of 'Truffle Pasta'. Recent reviews (last 3 months) confirm consistency. Faster service than competitor 'Pasta House' based on review sentiment."

    ---
    OUTPUT: Return valid JSON array matching the schema. Your deep review analysis must be evident in specific dish recommendations and data-driven reasoning.
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
      'gemini-3.0-preview',
      prompt,
      {
        systemInstruction: systemInstruction,
        temperature: 0.5, // Lower temperature for more precise dish extraction
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

    if (!text) {
      Logger.error('AI', 'Empty response from Gemini Proxy');
      throw new Error('Empty response from Gemini Proxy');
    }

    const recommendations = JSON.parse(text) as Omit<GeminiRecommendation, 'cash_warning_msg'>[];
    Logger.info('AI', 'Decision Matrix Complete', { count: recommendations.length });
    
    return recommendations.map(rec => ({
      ...rec,
      cash_warning_msg: rec.is_cash_only ? 'Note: This location may be cash-only.' : null,
    }));

  } catch (error) {
    Logger.error('AI', 'Gemini Decision Failed', error);
    return [];
  }
};
