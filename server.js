import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenerativeAI } from '@google/generative-ai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 8080;
const API_KEY = process.env.API_KEY;

// -----------------------------------------------------------------------------
// RATE LIMITER (In-Memory)
// -----------------------------------------------------------------------------
// Prevents abuse by limiting requests per IP address.
// Limit: 20 requests per 1 minute window.
const rateLimit = new Map();
const WINDOW_MS = 60 * 1000;
const MAX_REQUESTS = 20;

const limiter = (req, res, next) => {
  const ip = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  const now = Date.now();
  
  const userRecord = rateLimit.get(ip) || { count: 0, startTime: now };
  
  // Reset window if expired
  if (now - userRecord.startTime > WINDOW_MS) {
    userRecord.count = 0;
    userRecord.startTime = now;
  }
  
  userRecord.count++;
  rateLimit.set(ip, userRecord);
  
  if (userRecord.count > MAX_REQUESTS) {
    console.warn(`[RATE LIMIT] Blocked request from ${ip}`);
    return res.status(429).json({ error: 'Too many requests. Please wait a moment.' });
  }
  
  next();
};

// -----------------------------------------------------------------------------
// MIDDLEWARE
// -----------------------------------------------------------------------------
// Increased limit to 10mb to handle large candidate arrays from Places API
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'dist')));

// -----------------------------------------------------------------------------
// API ROUTES
// -----------------------------------------------------------------------------

app.post('/api/gemini/generate', limiter, async (req, res) => {
  if (!API_KEY) {
    console.error('API_KEY is missing in server environment variables.');
    return res.status(500).json({ error: 'Server configuration error.' });
  }

  try {
    const { model, contents, config } = req.body;

    if (!model || !contents) {
      return res.status(400).json({ error: 'Missing required parameters: model, contents' });
    }

    const genAI = new GoogleGenerativeAI(API_KEY);
    const genModel = genAI.getGenerativeModel({ model: model });
    
    const result = await genModel.generateContent(contents);
    const response = await result.response;
    const text = response.text();

    res.json({ text });

  } catch (error) {
    console.error('Gemini API Proxy Error:', error);
    res.status(500).json({ 
      error: 'AI Processing Failed', 
      details: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

// -----------------------------------------------------------------------------
// STATIC SERVING
// -----------------------------------------------------------------------------
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  console.log(`Rate limiting active: ${MAX_REQUESTS} req / ${WINDOW_MS/1000}s`);
});