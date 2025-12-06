import type { VercelRequest, VercelResponse } from '@vercel/node';
import { generateObject } from 'ai';
import { z } from 'zod';

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

// Zod schemas for different request types
const LoadingLogsSchema = z.array(z.string());

const RecommendationSchema = z.array(
  z.object({
    place_id: z.string(),
    recommended_dish: z.string(),
    ai_reason: z.string(),
    is_cash_only: z.boolean(),
    is_new_opening: z.boolean().optional(),
  })
);

/**
 * Vercel AI Gateway Proxy
 * 
 * Routes AI requests through Vercel's AI Gateway using Claude Sonnet 4.5
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Only allow POST requests
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Get client IP for rate limiting
  const ip =
    (req.headers['x-forwarded-for'] as string)?.split(',')[0] ||
    (req.headers['x-real-ip'] as string) ||
    'unknown';

  // Check rate limit
  if (!checkRateLimit(ip)) {
    console.warn(`[RATE LIMIT] Blocked request from ${ip}`);
    return res.status(429).json({ error: 'Too many requests. Please wait a moment.' });
  }

  // Verify API key is configured
  if (!process.env.AI_GATEWAY_API_KEY) {
    console.error('AI_GATEWAY_API_KEY is missing in environment variables.');
    return res.status(500).json({ error: 'Server configuration error.' });
  }

  try {
    const { prompt, systemInstruction, schemaType, config } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: 'Missing required parameter: prompt' });
    }

    // Select schema based on request type
    const schema = schemaType === 'recommendations' ? RecommendationSchema : LoadingLogsSchema;

    const result = await generateObject({
      model: 'anthropic/claude-sonnet-4.5',
      schema,
      prompt,
      system: systemInstruction,
      temperature: config?.temperature ?? 0.5,
    });

    return res.status(200).json({ text: JSON.stringify(result.object) });
  } catch (error) {
    console.error('AI Gateway Error:', error);
    return res.status(500).json({
      error: 'AI Processing Failed',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
