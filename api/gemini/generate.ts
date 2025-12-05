import type { VercelRequest, VercelResponse } from '@vercel/node';

// Rate limiting state (in-memory, resets on cold start)
const rateLimit = new Map<string, { count: number; startTime: number }>();
const WINDOW_MS = 60 * 1000; // 1 minute
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
 * Gemini API Proxy Handler
 * 
 * This serverless function proxies requests to the Google Gemini API
 * to keep the API key secure on the server side.
 */
export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Get client IP for rate limiting
  const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0] || 
             req.headers['x-real-ip'] as string || 
             'unknown';
  
  // Check rate limit
  if (!checkRateLimit(ip)) {
    console.warn(`[RATE LIMIT] Blocked request from ${ip}`);
    return res.status(429).json({ error: 'Too many requests. Please wait a moment.' });
  }

  // Get API key from environment
  const API_KEY = process.env.API_KEY;
  
  if (!API_KEY) {
    console.error('API_KEY is missing in environment variables.');
    return res.status(500).json({ error: 'Server configuration error.' });
  }

  try {
    const { model, contents, config } = req.body;

    if (!model || !contents) {
      return res.status(400).json({ error: 'Missing required parameters: model, contents' });
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
          parts: [{ text: config.systemInstruction }]
        };
      }
    }

    const response = await fetch(geminiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Gemini API Error:', errorText);
      return res.status(response.status).json({ 
        error: 'AI Processing Failed',
        details: `Gemini API returned ${response.status}`
      });
    }

    const data = await response.json();
    
    // Extract text from Gemini response
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    return res.status(200).json({ text });

  } catch (error) {
    console.error('Gemini API Proxy Error:', error);
    return res.status(500).json({ 
      error: 'AI Processing Failed', 
      details: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
}

