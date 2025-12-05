import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// Rate limiting state (in-memory, resets on cold start)
const rateLimit = new Map<string, { count: number; startTime: number }>();
const WINDOW_MS = 60_000; // 1 minute
const MAX_REQUESTS = 20;

/**
 * Simple rate limiter
 */
function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const record = rateLimit.get(ip) || { count: 0, startTime: now };

  // Reset window if expired
  if (now - record.startTime > WINDOW_MS) {
    record.count = 0;
    record.startTime = now;
  }

  record.count++;
  rateLimit.set(ip, record);

  return record.count <= MAX_REQUESTS;
}

/**
 * CORS headers for browser requests
 */
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/**
 * Gemini API Proxy Edge Function
 *
 * Proxies requests to the Google Gemini API to keep the API key secure.
 */
Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Only allow POST requests
  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // Get client IP for rate limiting
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0] ||
    req.headers.get("x-real-ip") ||
    "unknown";

  // Check rate limit
  if (!checkRateLimit(ip)) {
    console.warn(`[RATE LIMIT] Blocked request from ${ip}`);
    return new Response(
      JSON.stringify({ error: "Too many requests. Please wait a moment." }),
      { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // Get API key from environment
  const API_KEY = Deno.env.get("GEMINI_API_KEY");

  if (!API_KEY) {
    console.error("GEMINI_API_KEY is missing in environment variables.");
    return new Response(
      JSON.stringify({ error: "Server configuration error." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    const { model, contents, config } = await req.json();

    if (!model || !contents) {
      return new Response(
        JSON.stringify({ error: "Missing required parameters: model, contents" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build the request to Gemini API
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${API_KEY}`;

    const requestBody: Record<string, unknown> = {
      contents: [{ parts: [{ text: contents }] }],
    };

    // Add generation config if provided
    if (config) {
      const generationConfig: Record<string, unknown> = {};

      if (config.temperature !== undefined) {
        generationConfig.temperature = config.temperature;
      }
      if (config.responseMimeType) {
        generationConfig.responseMimeType = config.responseMimeType;
      }
      if (config.responseSchema) {
        generationConfig.responseSchema = config.responseSchema;
      }

      if (Object.keys(generationConfig).length > 0) {
        requestBody.generationConfig = generationConfig;
      }

      // Add system instruction if provided
      if (config.systemInstruction) {
        requestBody.systemInstruction = {
          parts: [{ text: config.systemInstruction }],
        };
      }
    }

    const response = await fetch(geminiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Gemini API Error:", errorText);
      return new Response(
        JSON.stringify({
          error: "AI Processing Failed",
          details: `Gemini API returned ${response.status}`,
        }),
        { status: response.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();

    // Extract text from Gemini response
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";

    return new Response(
      JSON.stringify({ text }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Gemini API Proxy Error:", error);
    return new Response(
      JSON.stringify({
        error: "AI Processing Failed",
        details: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
