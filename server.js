import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 8080;

// -----------------------------------------------------------------------------
// MIDDLEWARE
// -----------------------------------------------------------------------------
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'dist')));

// -----------------------------------------------------------------------------
// STATIC SERVING
// -----------------------------------------------------------------------------
// Note: AI requests are handled by Vercel serverless functions in /api/gateway.ts
// This server is for serving the static build in non-Vercel environments
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  console.log(`Note: AI Gateway requires Vercel deployment. This server only serves static files.`);
});
