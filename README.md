# Lunch Decider

**Stop scrolling through 50 mediocre restaurants. Tell us your vibe, we'll tell you what to order.**

**[Try it live at lunch.thirdface.com](https://lunch.thirdface.com)**

---

## What It Does

Pick a vibe (Grab & Go, Spicy & Bold, etc.) or type what you want. Claude AI reads hundreds of reviews and gives you 3 specific recommendations with actual dish suggestions—not a generic list sorted by rating.

That's it. No endless scrolling.

---

## Quick Start

**Requirements:** Node.js 24.x

```bash
git clone https://github.com/thirdface/lunch-decider.git
cd lunch-decider
npm install
cp env.example .env.local
# Add your API keys (see Environment Setup below)
npm run dev
```

Open http://localhost:5173 and find lunch.

### Mock Mode (No API Keys)

```bash
npm run dev
# Open http://localhost:5173/?mock=true
```

Full UI flow with sample data. Perfect for development.

---

## Architecture

```
Frontend (React + Vite + TailwindCSS)
    |
    v
Services Layer
    |
    +---> Google Maps Platform (Places API, Distance Matrix)
    +---> Supabase Edge Function ---> OpenRouter AI (Claude Opus 4.5 / Sonnet 4.5)
    +---> Supabase PostgreSQL (places cache, search history, favorites, logs)
    +---> Two-Tier Cache (L1: In-memory, L2: Supabase)
```

### Data Flow (Cache-First Strategy)

1. User picks location + vibe + constraints
2. **L2 location query**: Fetch ALL cached places within radius from Supabase
3. **AI filtering**: Claude filters cached places by user's query/vibe
4. If enough matches (≥10): Skip Google API entirely, use cached data
5. If insufficient: Make targeted Text Search API calls, cache new results
6. Claude Opus 4.5 analyzes reviews, extracts dish mentions, scores vibe match
7. You get 3 recommendations with specific dishes and honest explanations

This cache-first approach dramatically reduces API costs—popular areas often return results without any Google API calls.

### API Key Security

OpenRouter key stays server-side in an Edge Function. Google Maps key uses HTTP referrer restrictions.

### Deployment

Production is deployed on **Vercel** at [lunch.thirdface.com](https://lunch.thirdface.com).

---

## Environment Setup

### 1. Supabase Project

Free tier works fine.

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

### 2. Google Cloud APIs

Enable: Maps JavaScript API, Places API (New), Distance Matrix API, Geocoding API

```env
VITE_GOOGLE_MAPS_API_KEY=your-maps-key
```

### 3. OpenRouter API Key (Server-Side)

```bash
supabase secrets set OPENROUTER_API_KEY=your-openrouter-key
supabase functions deploy openrouter-proxy
```

Uses **Claude Opus 4.5** for restaurant analysis, **Claude Sonnet 4.5** for quick tasks.

---

## Database Setup

Run in Supabase SQL editor:

```sql
-- Search History
create table if not exists search_history (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  session_id text not null,
  address text not null,
  lat float not null,
  lng float not null,
  vibe text,
  price text,
  walk_limit text not null,
  no_cash boolean default false,
  dietary_restrictions text[] default '{}',
  freestyle_prompt text,
  result_count int default 0
);

-- Favorites
create table if not exists favorites (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  session_id text not null,
  place_id text not null unique,
  place_name text not null,
  place_rating decimal,
  place_address text,
  ai_reason text,
  recommended_dish text,
  walking_time_text text,
  metadata jsonb default '{}'
);

-- App Logs
create table if not exists app_logs (
  id bigserial primary key,
  created_at timestamptz default timezone('utc', now()),
  level text not null,
  category text not null,
  message text not null,
  metadata jsonb
);

-- Recommended Places (tracks AI recommendations per session for variety)
create table if not exists recommended_places (
  id uuid primary key default gen_random_uuid(),
  session_id text not null,
  place_id text not null,
  place_name text,
  created_at timestamptz default now()
);

-- Places Cache (L2 cache - shared across users, 7-day TTL)
-- Includes lat/lng columns for spatial queries
create table if not exists places_cache (
  place_id text primary key,
  data jsonb not null,
  lat float,  -- Extracted for spatial queries
  lng float,  -- Extracted for spatial queries
  expires_at timestamptz default (now() + interval '7 days'),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Distance Cache (L2 cache for walking times)
create table if not exists distance_cache (
  id text primary key, -- format: "lat,lng:place_id"
  origin_lat float not null,
  origin_lng float not null,
  place_id text not null,
  distance_text text not null,
  distance_value int not null, -- seconds
  created_at timestamptz default now()
);

-- Enable RLS
alter table search_history enable row level security;
alter table favorites enable row level security;
alter table app_logs enable row level security;
alter table recommended_places enable row level security;
alter table places_cache enable row level security;
alter table distance_cache enable row level security;

-- Policies (permissive for anonymous users)
create policy "Users can insert search history" on search_history for insert with check (true);
create policy "Users can manage favorites" on favorites for all using (true);
create policy "Anyone can insert logs" on app_logs for insert with check (true);
create policy "Users can manage recommended places" on recommended_places for all using (true);
create policy "Anyone can read/write places cache" on places_cache for all using (true);
create policy "Anyone can read/write distance cache" on distance_cache for all using (true);

-- Index for spatial queries (critical for cache-first strategy)
create index if not exists idx_places_cache_location on places_cache (lat, lng);
create index if not exists idx_places_cache_expires on places_cache (expires_at);

-- Auto-cleanup old cache entries (run as scheduled job)
-- DELETE FROM places_cache WHERE expires_at < now();
-- DELETE FROM distance_cache WHERE created_at < now() - interval '7 days';
```

---

## The Caching System

Google Maps APIs are expensive. Every text search costs €0.032, every place detail €0.017, every distance calculation €0.005.

We built a two-tier cache with a **cache-first strategy** that shares data globally.

### Cache-First Flow

```
User searches "ramen near Kreuzberg"
    |
    v
┌─────────────────────────────────────┐
│ Step 1: Location Query (L2)         │
│ SELECT * FROM places_cache          │
│ WHERE lat/lng within radius         │
│ → Returns 150 cached restaurants    │
└────────────────┬────────────────────┘
                 │
                 v
┌─────────────────────────────────────┐
│ Step 2: AI Filtering                │
│ Claude filters by "ramen" intent    │
│ → 12 relevant matches               │
└────────────────┬────────────────────┘
                 │
                 │ ≥10 matches? DONE (no API calls)
                 │ <10 matches? Continue...
                 v
┌─────────────────────────────────────┐
│ Step 3: Text Search API (if needed) │
│ Fetch new places, cache results     │
│ → Future searches benefit           │
└─────────────────────────────────────┘
```

### Two Caches

| Cache | What It Stores | L1 TTL | L2 TTL | Cost/Hit Saved |
|-------|---------------|--------|--------|----------------|
| **Place Details** | Place ID → Full data (with lat/lng) | 1 hr | 7 days | €0.017 |
| **Distances** | Origin + Place → Walk time | 1 hr | 7 days | €0.005 |

### Why Location-Based Caching?

Previous versions cached by search query ("ramen near X"). Problem: "ramen", "Japanese", and "noodles" are different cache keys for overlapping results.

Now we cache by **location**. One query populates the cache, and ALL future searches in that area benefit—regardless of what cuisine they search for.

### The Smart Bits

**Spatial queries.** Places are cached with lat/lng columns. Finding restaurants in a 1km radius is a simple range query, not a text match.

**AI filtering replaces query matching.** Instead of exact query→result caching, Claude analyzes cached places against the user's intent. "Best lunch spot" and "quick bite" can both draw from the same cached data.

**Session tokens for address input.** Autocomplete requests + Place Details are bundled into one billing session (~60% cost reduction on address lookups).

**Graceful degradation.** Cache miss? We just fetch fresh. No errors, no retries—slightly higher cost that one time, then cached for everyone.

**Session cost tracking.**

```
=== SESSION CACHE SUMMARY ===
Places: 47 hits, 8 misses (85.5%) - €0.799 saved
Distances: 22 hits, 3 misses (88.0%) - €0.110 saved
────────────────────────────────────────────────────
Total API calls avoided: 69
Estimated session savings: €0.909
```

### The Result

Popular areas often return results with **zero Google API calls**—everything comes from cache + AI filtering. The more people use the app, the better it gets for everyone.

---

## Project Structure

```
lunch-decider/
├── src/
│   ├── components/
│   │   ├── ControlPanel.tsx      # Input form, vibe selection, filters
│   │   ├── TerminalLog.tsx       # The loading screen with AI jokes
│   │   ├── ResultsView.tsx       # Results + map
│   │   ├── MapComponent.tsx      # Google Maps wrapper
│   │   ├── Footer.tsx            # Global footer
│   │   ├── PrivacyPolicy.tsx     # Privacy policy viewer
│   │   └── ErrorBoundary.tsx     # Error handling wrapper
│   ├── hooks/
│   │   ├── useGooglePlaces.ts    # Places API + cache-first logic
│   │   ├── useDistanceMatrix.ts  # Walking times calculation
│   │   ├── useLunchDecision.ts   # Main orchestration
│   │   ├── usePreferences.ts     # User prefs with localStorage
│   │   ├── useTerminalLogs.ts    # Terminal log management
│   │   └── index.ts              # Hook exports
│   ├── services/
│   │   ├── aiService.ts          # AI logic + place filtering
│   │   └── supabaseService.ts    # Database + location queries
│   ├── lib/
│   │   ├── supabase.ts           # Supabase client
│   │   ├── placesCache.ts        # Two-tier caching system
│   │   └── database.types.ts     # Database type definitions
│   ├── utils/
│   │   ├── lunchAlgorithm.ts     # Scoring logic
│   │   ├── logger.ts             # Logging utility
│   │   └── sounds.ts             # Click sounds
│   └── types.ts                  # TypeScript types
├── supabase/
│   └── functions/
│       └── openrouter-proxy/     # Edge Function for AI calls
├── vercel.json                   # Vercel deployment config
└── vite.config.ts                # Vite configuration
```

---

## Scripts

| Command | What it does |
|---------|-------------|
| `npm run dev` | Start dev server (port 5173) |
| `npm run build` | Build for production |
| `npm run preview` | Preview production build locally |
| `npm start` | Run production server |
| `npm test` | Run tests |
| `npm run test:ui` | Run tests with interactive UI |
| `npm run test:coverage` | Coverage report |

**Tip:** Add `?mock=true` to any localhost URL to test without API keys.

---

## The Scoring Algorithm

Not just "highest rated wins." We factor in:

- **Proximity** - closer is better (weighted by walk time preference)
- **Price match** - respects your budget setting
- **Hidden gems** - 4.3+ rating with 50-750 reviews gets a boost
- **Fresh drops** - new places (<80 reviews, oldest review <6 months) with 4.0+ rating
- **Trending** - places with 10%+ of reviews from the last month
- **Will it be open?** - prioritizes places open by the time you'd arrive

Then Claude AI picks the best 3 from the top 25 candidates.

---

## Design Philosophy

Braun-inspired industrial aesthetic following **Dieter Rams' 10 Principles of Good Design**.

The terminal screen has actual scanlines because we thought it would be funny.

See `.cursorrules` for full design guidelines.

---

## Privacy

Anonymous session IDs, no accounts required, no tracking cookies. Data retention: 90 days for history, 30 days for logs.

See the [Privacy Policy](https://lunch.thirdface.com) (footer link) for details.

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

---

## License

MIT - do what you want, don't blame us.

---

Built by [thirdface](https://thirdface.com)

*"Good design is as little design as possible." - Dieter Rams*
