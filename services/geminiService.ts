import { GooglePlace, HungerVibe, GeminiRecommendation, PricePoint, DietaryRestriction } from "../types";

// Replicating Type definition locally to avoid importing the full SDK on client
// This corresponds to the @google/genai SchemaType/Type
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

// Internal helper to call the backend proxy
const callGeminiProxy = async (model: string, contents: any, config: any) => {
  const response = await fetch('/api/gemini/generate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      contents,
      config
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `Server responded with ${response.status}`);
  }

  const data = await response.json();
  return data.text;
};

export const generateLoadingLogs = async (vibe: HungerVibe | null, address: string): Promise<string[]> => {
    const vibeText = vibe || "Custom/User Defined";

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
          "gemini-3-pro-preview",
          prompt,
          {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.ARRAY,
              items: { type: Type.STRING }
            }
          }
        );
        
        if (!text) return ["PROCESSING..."];
        return JSON.parse(text) as string[];
    } catch (e) {
        console.warn("Log generation failed, using fallbacks.", e);
        return ["OPTIMIZING SEARCH...", "READING MENUS...", "CALCULATING ROUTES..."];
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

  // Pre-process candidates to give the AI a very clean JSON object to work with
  const analysisPayload = candidates.map(p => ({
    id: p.place_id,
    name: p.name,
    types: p.types,
    rating: p.rating,
    user_ratings_total: p.user_ratings_total,
    price_level: p.price_level,
    // Editorial summary often contains the "Menu Highlights" or signature dishes
    virtual_menu_source: p.editorial_summary?.overview || "No official menu summary available.",
    website_ref: p.website || "N/A",
    attributes: {
      is_vegetarian: p.serves_vegetarian_food,
      has_takeout: p.takeout,
      has_dine_in: p.dine_in,
      has_alcohol: p.serves_beer || p.serves_wine,
      payment_options: p.payment_options 
    },
    // We pass payment info if we have it (from attributes or summary)
    reviews_sample: p.reviews?.slice(0, 15)
      .map(r => r?.text?.substring(0, 300))
      .filter((text): text is string => !!text) || [],
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
    MODEL: gemini-3-pro-preview

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

    3. DEEP SEMANTIC REVIEW ANALYSIS (REQUIRED FOR ALL CANDIDATES):
       - You MUST perform a deep semantic analysis of the \`reviews_sample\` for every single candidate before making a decision. Do not just keyword match.
       - Identify recurring dish names to validate the \`recommended_dish\`.
       - Extract operational data: mentions of "wait times," "noise level," "service speed," "good for groups," etc.
       - Synthesize sentiment to confirm the vibe (e.g., do reviews for a "View & Vibe" candidate actually mention the view?).
       - You must extract negative signals as strongly as positive ones. A single deal-breaker mentioned in multiple reviews (e.g., 'dirty', 'rude service') should disqualify a candidate.

    4. FUNCTIONAL REASONING & DISH SPECIFICITY:
       - \`ai_reason\` MUST be purely functional, data-driven, and devoid of marketing fluff.
         - BAD: "This place has delicious and mouth-watering tacos that you'll love!"
         - GOOD: "High rating density (4.7/500 reviews) points to consistent quality. Reviews frequently cite the 'al pastor' tacos, noting quick service, making it an ideal 'Grab & Go' candidate."
       - **Comparative Analysis is Mandatory.** Your \`ai_reason\` should briefly state *why* this option was chosen over another strong-but-rejected candidate. Example: "Chosen over 'Burger Palace' because reviews confirm faster service, aligning better with the 'Grab & Go' directive."
       - \`recommended_dish\` MUST be a specific item mentioned in the \`virtual_menu_source\` or frequently praised in reviews.
         - BAD: "Pasta"
         - GOOD: "Cacio e Pepe"
       - **GENERIC RECOMMENDATIONS ARE STRICTLY FORBIDDEN.** The \`recommended_dish\` field must not contain generic instructions like "Consult menu for popular dishes." or "Any sandwich." This is a critical failure condition. You must analyze the available data (\`virtual_menu_source\`, \`reviews_sample\`) to suggest a concrete item. **IF, AND ONLY IF, after thorough analysis, no specific dish can be reliably identified from the provided data, you are authorized to suggest a CATEGORY of dish the restaurant is known for (e.g., 'Artisanal Pizza', 'Fresh Seafood Platter', 'Handmade Pasta'). This is a last resort to be used only when data is sparse.**

    5. PAYMENT PROTOCOL (STRICT & LOCALIZED):
       - IF 'noCash' is TRUE:
         - You MUST DISCARD any place with strong signals of being CASH ONLY.
       - Scan \`payment_options\` and \`reviews_sample\` for both English and LOCAL LANGUAGE phrases indicating payment methods. Your analysis must be thorough.
       - EXAMPLES (ENGLISH): "cash only", "no card", "no visa".
       - EXAMPLES (GERMAN CONTEXT): "nur bargeld", "barzahlung", "keine karte".
       - A place with \`payment_options.accepts_credit_cards: false\` is an immediate discard if noCash is true.
       - IF a selected place is likely CASH ONLY (and user allows it):
         - Set 'is_cash_only' to true. Your analysis MUST be based on review contents, not just structured data.

    ${budgetProtocol}

    7. FRESH DROP / NEW OPENING PROTOCOL:
       - Give a massive advantage to "Fresh Drops".
       - DEFINITION: A place with high ratings but very low review count (e.g., < 50), or reviews that explicitly mention "just opened", "new spot", "grand opening".
       - If you identify such a candidate that matches the vibe, include it and set \`is_new_opening\` to true.
       - The \`ai_reason\` should highlight this newness (e.g., "Recently opened spot showing high potential with early positive reviews...").
    
    8. FREESTYLE PROMPT PROTOCOL (HIGHEST PRIORITY):
       - If "SPECIFIC REQUEST" is provided, it OVERRIDES generic vibe constraints where they conflict.
       - The specific request is the user's direct voice. If they ask for "Ramen" but selected "Light & Clean", you must find Ramen places, prioritizing those that seem lighter or cleaner if possible, but DO NOT ignore the specific craving.
       - If the user asks for "Quiet place to read", you must aggressively scan reviews for "quiet", "cozy", "work friendly", and penalize "loud", "crowded", "party vibe".
       - This prompt allows the user to break the standard rules. Satisfy it above all else.

    ${dietaryRestrictions.length > 0 ? dietaryProtocol : ''}
    
    ---
    CANDIDATE SCORING & DEEP ANALYSIS DIRECTIVES (PER MENTAL STATE):
    For each candidate, you will assess its viability against the user's selected Mental State using the following detailed matrices.
    ${ dietaryRestrictions.length > 0 ? `The user's dietary needs [${dietaryRestrictions.join(', ')}] should be a primary consideration in all of the following vibe analyses.` : '' }

    ['Grab & Go']
    - PHILOSOPHY: Maximize quality per unit of time. Efficiency is paramount.
    - GEOGRAPHIC CONTEXTUALIZATION: Adapt your definition to the search area. In Berlin, this could be a world-class Currywurst stand. In Tokyo, a high-speed ramen counter. In New York, a classic pizza slice shop. Do not default to just "sandwiches".
    - IDEAL CANDIDATE PROFILE: Counter service, high throughput, limited seating, menu optimized for speed. Often food trucks, market stalls, bakeries, or specialized single-item shops.
    - TARGET DATA SIGNALS: \`types\` contains "takeout_restaurant", "food_truck", "fast_food". Reviews mention "quick," "fast service," "in and out," "line moves quickly," "great for a quick bite." \`virtual_menu_source\` implies simple, portable items.
    - DEAL-BREAKERS (IMMEDIATE DISQUALIFICATION): Multiple reviews mention "long wait for food", "reservations required", "table service only", "leisurely".

    ['Light & Clean']
    - PHILOSOPHY: Energizing, not incapacitating. Freshness and quality of ingredients are primary.
    - GEOGRAPHIC CONTEXTUALIZATION: Consider local definitions of "healthy." In California, this is likely a salad or grain bowl spot. In a Mediterranean city, it could be a grilled fish vendor.
    - IDEAL CANDIDATE PROFILE: Focuses on fresh produce, lean proteins, and simple preparations. Salad bars, poke bowl counters, Vietnamese restaurants (pho, summer rolls), juice bars, modern cafes.
    - TARGET DATA SIGNALS: \`serves_vegetarian_food: true\`. \`types\` includes "health_food_restaurant", "vegetarian_restaurant". Reviews contain "fresh," "light," "healthy," "clean," "not greasy," "refreshing," "wholesome." Menu items are grilled, steamed, or raw.
    - DEAL-BREAKERS (IMMEDIATE DISQUALIFICATION): Menu is dominated by fried items or heavy cream sauces. Multiple reviews use terms like "greasy," "oily," or "heavy."

    ['Hearty & Rich']
    - PHILOSOPHY: Caloric restoration and psychological comfort. The goal is deep satisfaction.
    - GEOGRAPHIC CONTEXTUALIZATION: This is highly regional. In Germany, it's Schnitzel or Schweinshaxe. In the American South, it's barbecue or mac & cheese. In Italy, a rich pasta or pizza.
    - IDEAL CANDIDATE PROFILE: Serves food that is calorically dense and emotionally satisfying. Classic Italian, German, American BBQ, Ramen shops, quality burger joints.
    - TARGET DATA SIGNALS: Reviews use words like "hearty," "huge portions," "comfort food," "satisfying," "rich," "filling," "worth the calories." Menu items often involve cheese, carbs, slow-cooked meats, or rich sauces.
    - DEAL-BREAKERS (IMMEDIATE DISQUALIFICATION): Multiple reviews mention "tiny portions," "small plates," or "left hungry."

    ['Spicy & Bold']
    - PHILOSOPHY: Sensory intensity. The experience should be memorable and push flavor boundaries.
    - GEOGRAPHIC CONTEXTUALIZATION: Seek out cuisines known for heat: Thai, Sichuan, Southern Indian, Mexican, Korean. Be aware that "spicy" in a Scandinavian city might be different from "spicy" in Bangkok. Calibrate based on review language.
    - IDEAL CANDIDATE PROFILE: A restaurant that specializes in a cuisine known for its complex and intense spice profiles. Not just "hot," but flavorful.
    - TARGET DATA SIGNALS: REQUIRES multiple, unambiguous mentions of "spicy," "hot," "chili," "real heat," "flavorful kick," "authentic spice" in reviews. \`types\` include "thai_restaurant", "indian_restaurant", "sichuan_restaurant", "mexican_restaurant", "korean_restaurant".
    - DEAL-BREAKERS (IMMEDIATE DISQUALIFICATION): No credible mentions of "spicy" or "hot" in reviews. Reviews stating "bland," "mild," or "not spicy at all."

    ['View & Vibe']
    - PHILOSOPHY: The environment is a key ingredient. The setting should elevate the meal.
    - GEOGRAPHIC CONTEXTUALIZATION: A "view" in a dense city could be a rooftop overlooking the skyline. In a coastal town, it's the seaside. "Vibe" could be a hyper-modernist interior, a cozy historic building, or a bustling, trendy hotspot.
    - IDEAL CANDIDATE PROFILE: A restaurant where significant effort has been put into the physical environment. Rooftops, waterside locations, places with exceptional interior design, or a unique, memorable setting.
    - TARGET DATA SIGNALS: Reviews MUST contain keywords like "view," "vibe," "beautiful interior," "terrace," "ambiance," "atmosphere," "decor," "design." A high price_level (3-4) often correlates with investment in ambiance.
    - DEAL-BREAKERS (IMMEDIATE DISQUALIFICATION): Reviews do not mention the atmosphere/view, or actively describe it as "plain," "cramped," "no-frills," or "divey" (unless that is the specific, intended vibe).

    ['Authentic & Classic']
    - PHILOSOPHY: Reliability through tradition. A rejection of fleeting trends in favor of perfected classics.
    - GEOGRAPHIC CONTEXTUALIZATION: Look for local institutions. In Paris, a classic bistro. In Naples, a certified Neapolitan pizzeria. In New York, a century-old Jewish deli.
    - IDEAL CANDIDATE PROFILE: Long-standing institutions, often family-run, specializing in a specific regional or national cuisine, executed traditionally.
    - TARGET DATA SIGNALS: Reviews mention "institution," "classic," "traditional," "authentic," "been around forever," "like my grandma's cooking," "no frills, just great food." Often has a lower rating count but a very loyal following.
    - DEAL-BREAKERS (IMMEDIATE DISQUALIFICATION): Reviews describe it as a "modern take," "fusion," or "trendy." The \`types\` includes "fusion_restaurant".

    ---
    FINAL OUTPUT:
    Return strictly valid JSON matching the provided schema. Your analysis must be evident in the high quality and logic of your selections.
  `;

  const prompt = `
    USER LOCATION CONTEXT: ${address}
    CURRENT MENTAL STATE: ${vibe || "CUSTOM / USER DEFINED"}
    SPECIFIC REQUEST (FREESTYLE): ${freestylePrompt ? `"${freestylePrompt}"` : "None"}
    BUDGET TIER: ${price || "ANY / UNCONSTRAINED"}
    USER REQUIRES CASHLESS: ${noCash}
    DIETARY NEEDS: [${dietaryRestrictions.join(', ')}]
    
    CANDIDATES:
    ${JSON.stringify(analysisPayload)}
  `;

  try {
    const text = await callGeminiProxy(
      "gemini-3-pro-preview",
      prompt,
      {
        systemInstruction: systemInstruction,
        temperature: 0.7, 
        responseMimeType: "application/json",
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
            required: ["place_id", "ai_reason", "recommended_dish", "is_cash_only"],
          },
        },
      }
    );

    if (!text) throw new Error("Empty response from Gemini Proxy");

    const recommendations = JSON.parse(text) as Omit<GeminiRecommendation, 'cash_warning_msg'>[];
    
    return recommendations.map(rec => ({
      ...rec,
      cash_warning_msg: rec.is_cash_only ? "Note: This location may be cash-only." : null,
    }));

  } catch (error) {
    console.error("Gemini decision failed:", error);
    // Return an empty array on failure to allow the client-side fallback to trigger
    return [];
  }
};