import "jsr:@supabase/functions-js/edge-runtime.d.ts";

/**
 * Website Scraper Edge Function
 * 
 * Fetches restaurant website content and uses Gemini to extract menu data.
 * This enables deep analysis of actual menu items for dish recommendations.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-application-name",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface MenuExtractionResult {
  dishes: Array<{
    name: string;
    description?: string;
    price?: string;
    category?: string;
  }>;
  cuisineType?: string;
  specialties?: string[];
  rawTextSample?: string;
}

/**
 * Fetch website content with timeout and error handling
 */
async function fetchWebsiteContent(url: string): Promise<string | null> {
  try {
    // Validate URL
    const parsedUrl = new URL(url);
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      console.warn(`Invalid protocol for URL: ${url}`);
      return null;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000); // 10s timeout

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; LunchBot/1.0; +https://lunch.app)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9,de;q=0.8',
      },
    });

    clearTimeout(timeout);

    if (!response.ok) {
      console.warn(`Failed to fetch ${url}: ${response.status}`);
      return null;
    }

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/html') && !contentType.includes('text/plain')) {
      console.warn(`Non-HTML content type for ${url}: ${contentType}`);
      return null;
    }

    const html = await response.text();
    
    // Basic HTML to text conversion - strip tags, scripts, styles
    const textContent = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '') // Remove scripts
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '') // Remove styles
      .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '') // Remove navigation
      .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '') // Remove footer
      .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '') // Remove header (often nav)
      .replace(/<[^>]+>/g, ' ') // Remove remaining HTML tags
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, ' ') // Collapse whitespace
      .trim();

    // Limit content size for AI processing (roughly 15k chars = ~4k tokens)
    return textContent.substring(0, 15000);
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      console.warn(`Timeout fetching ${url}`);
    } else {
      console.warn(`Error fetching ${url}:`, error);
    }
    return null;
  }
}

/**
 * Use Gemini to extract menu data from website content
 */
async function extractMenuWithGemini(
  websiteContent: string,
  restaurantName: string,
  apiKey: string
): Promise<MenuExtractionResult> {
  const prompt = `
You are a menu extraction specialist. Analyze the following website content from "${restaurantName}" and extract menu information.

WEBSITE CONTENT:
${websiteContent}

TASK:
1. Identify ALL specific dish names mentioned (not categories like "appetizers" but actual dishes like "Margherita Pizza" or "Tonkotsu Ramen")
2. Extract any descriptions or ingredients mentioned for dishes
3. Note any prices if visible
4. Identify the cuisine type
5. List any dishes that appear to be specialties or signature items (mentioned multiple times, marked as "popular", "famous", etc.)

Return a JSON object with this structure:
{
  "dishes": [
    {"name": "Specific Dish Name", "description": "Brief description if available", "price": "$XX" or null, "category": "category if known"}
  ],
  "cuisineType": "Italian/Japanese/etc",
  "specialties": ["List of dishes that seem to be signature/popular items"],
  "rawTextSample": "A brief 100-char sample of menu-relevant text you found"
}

If no menu data is found, return {"dishes": [], "cuisineType": null, "specialties": [], "rawTextSample": null}

IMPORTANT: 
- Only include ACTUAL dish names, not generic categories
- If you see prices, include them
- Prioritize dishes that appear to be highlighted or featured
`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-preview:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.2,
            responseMimeType: 'application/json',
          },
        }),
      }
    );

    if (!response.ok) {
      console.error('Gemini API error:', await response.text());
      return { dishes: [], specialties: [] };
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
    
    return JSON.parse(text) as MenuExtractionResult;
  } catch (error) {
    console.error('Error extracting menu with Gemini:', error);
    return { dishes: [], specialties: [] };
  }
}

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const API_KEY = Deno.env.get("GEMINI_API_KEY");
  if (!API_KEY) {
    return new Response(
      JSON.stringify({ error: "Server configuration error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    const { websiteUrl, restaurantName } = await req.json();

    if (!websiteUrl) {
      return new Response(
        JSON.stringify({ error: "Missing websiteUrl parameter" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[SCRAPER] Fetching menu from: ${websiteUrl} for ${restaurantName}`);

    // Fetch website content
    const websiteContent = await fetchWebsiteContent(websiteUrl);
    
    if (!websiteContent || websiteContent.length < 100) {
      console.log(`[SCRAPER] No usable content from ${websiteUrl}`);
      return new Response(
        JSON.stringify({ 
          success: false, 
          data: { dishes: [], specialties: [] },
          message: "Could not extract content from website"
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[SCRAPER] Extracted ${websiteContent.length} chars, sending to Gemini`);

    // Extract menu with Gemini
    const menuData = await extractMenuWithGemini(
      websiteContent,
      restaurantName || 'Restaurant',
      API_KEY
    );

    console.log(`[SCRAPER] Extracted ${menuData.dishes?.length || 0} dishes from ${restaurantName}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        data: menuData,
        contentLength: websiteContent.length
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error('[SCRAPER] Error:', error);
    return new Response(
      JSON.stringify({ 
        error: "Processing failed", 
        details: error instanceof Error ? error.message : "Unknown error" 
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
