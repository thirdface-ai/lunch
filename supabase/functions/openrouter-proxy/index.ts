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
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-application-name",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/**
 * OpenRouter API Proxy Edge Function
 *
 * Proxies requests to the OpenRouter API to keep the API key secure.
 * Uses openrouter/auto for automatic model selection.
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
  const API_KEY = Deno.env.get("OPENROUTER_API_KEY");

  if (!API_KEY) {
    console.error("OPENROUTER_API_KEY is missing in environment variables.");
    return new Response(
      JSON.stringify({ error: "Server configuration error." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    const { model, contents, config } = await req.json();
    
    console.log("[OpenRouter] Request received:", { 
      model, 
      contentsLength: contents?.length,
      hasSystemInstruction: !!config?.systemInstruction,
      temperature: config?.temperature,
      responseMimeType: config?.responseMimeType
    });

    if (!model || !contents) {
      console.error("[OpenRouter] Missing required parameters");
      return new Response(
        JSON.stringify({ error: "Missing required parameters: model, contents" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build messages array for OpenRouter (OpenAI-compatible format)
    const messages: Array<{ role: string; content: string }> = [];

    // Add system instruction if provided
    if (config?.systemInstruction) {
      messages.push({
        role: "system",
        content: config.systemInstruction,
      });
    }

    // Add user message
    messages.push({
      role: "user",
      content: contents,
    });

    // Build request body for OpenRouter
    const requestBody: Record<string, unknown> = {
      model,
      messages,
    };

    // Add temperature if provided
    if (config?.temperature !== undefined) {
      requestBody.temperature = config.temperature;
    }

    // Add JSON response format if requested
    if (config?.responseMimeType === "application/json") {
      requestBody.response_format = { type: "json_object" };
    }

    console.log("[OpenRouter] Sending request to API...");
    console.log("[OpenRouter] Request body (truncated):", {
      model: requestBody.model,
      messageCount: messages.length,
      temperature: requestBody.temperature,
      response_format: requestBody.response_format,
    });

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://lunch-decider.app",
        "X-Title": "Lunch Decider",
      },
      body: JSON.stringify(requestBody),
    });

    console.log("[OpenRouter] Response status:", response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[OpenRouter] API Error Response:", errorText);
      return new Response(
        JSON.stringify({
          error: "AI Processing Failed",
          details: `OpenRouter API returned ${response.status}: ${errorText}`,
        }),
        { status: response.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    
    console.log("[OpenRouter] Response received:", {
      model: data.model,
      hasChoices: !!data.choices,
      choicesCount: data.choices?.length,
      finishReason: data.choices?.[0]?.finish_reason,
      contentLength: data.choices?.[0]?.message?.content?.length,
    });

    // Extract text from OpenRouter response (OpenAI format)
    const text = data.choices?.[0]?.message?.content || "";

    if (!text) {
      console.error("[OpenRouter] Empty response content. Full response:", JSON.stringify(data, null, 2));
    } else {
      console.log("[OpenRouter] Success! Response preview:", text.substring(0, 200));
    }

    // Log which model was actually used (useful for openrouter/auto)
    if (data.model) {
      console.log(`[OpenRouter] Model used: ${data.model}`);
    }

    return new Response(
      JSON.stringify({ text }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[OpenRouter] Proxy Error:", error);
    return new Response(
      JSON.stringify({
        error: "AI Processing Failed",
        details: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
