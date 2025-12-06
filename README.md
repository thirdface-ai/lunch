# Lunch Decider

**Stop scrolling through 50 mediocre restaurants. Tell us your vibe, we'll tell you what to order.**

**[Try it live at lunch.thirdface.com](https://lunch.thirdface.com)**

---

## The Problem

Every lunch recommendation app does the same thing: here's a list of places, sorted by rating, good luck. You scroll for 10 minutes, pick something safe, and wonder why you bothered.

Lunch Decider does something different. Instead of asking "what cuisine do you want?" (you don't know, that's the whole problem), we ask "what's your vibe?" Feeling efficient? Grab & Go. Need comfort? Hearty & Rich. Want to wake up? Spicy & Bold.

Then Claude AI reads through hundreds of reviews to find the actual gems - not just "this place is good" but "get the Tonkotsu Ramen, it's legendary." Specific dish recommendations from real people who bothered to write about them.

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

### Mock Mode (No API Keys Required)

Want to test the UI without setting up API keys? Use mock mode:

```bash
npm run dev
# Open http://localhost:5173/?mock=true
```

This gives you:
- Full UI flow (input → loading → results)
- 5 sample Berlin restaurants with realistic data
- No Google Maps or OpenRouter API calls
- Perfect for UI development and testing

---

## What Makes This Different

### Vibe-Based Search

Pick your mental state, not your cuisine:

| Vibe | What You Get |
|------|-------------|
| **Grab & Go** | Quick bites, food trucks, bakeries - in and out |
| **Light & Clean** | Salads, poke, Vietnamese - keep it fresh |
| **Hearty & Rich** | Ramen, burgers, Italian - comfort mode |
| **Spicy & Bold** | Thai, Sichuan, Indian - wake up your tastebuds |
| **View & Vibe** | Rooftops, scenic spots - the Instagram lunch |
| **Authentic & Classic** | Traditional, time-tested, no gimmicks |

Or just type what you want. "Schnitzel" works too.

### Custom Search with AI Translation

Type anything in the freestyle input:
- "newest hottest places" → AI activates Fresh Drops + Trending filters
- "fancy date night" → searches fine dining, upscale restaurants
- "cheap eats under €10" → focuses on budget-friendly spots
- "hidden gems" → prioritizes local favorites, underrated spots

The AI translates vague requests into concrete Google Places searches.

### AI That Actually Reads Reviews

Claude AI (Opus 4.5 for analysis, Sonnet 4.5 for quick tasks) digs through reviews to:
- Extract specific dish recommendations ("the Duck Confit is legendary")
- Identify quality signals ("hidden gem", "locals' favorite")
- Detect red flags ("went downhill", "used to be better")
- Catch cash-only warnings - even in German ("nur Barzahlung")
- Provide backup dish recommendations and caveats

You get 3 recommendations with actual reasoning, not a ranked list of 50.

### Smart Filters

| Filter | What It Does |
|--------|-------------|
| **Fresh Drops** | Prioritize newly opened restaurants (<80 reviews, <6 months old) |
| **No Cash** | Exclude cash-only establishments |
| **Trending** | Focus on places with high recent review activity |

### Budget Tiers With Personality

| Tier | Translation |
|------|------------|
| **Any** | Show me everything |
| **Personal** | You're paying, keep it reasonable ($ - $$) |
| **Company** | Someone else is paying, live a little ($$$ - $$$$) |

### Walk Time Preferences

| Option | Radius |
|--------|--------|
| **5 min** | ~1km radius |
| **15 min** | ~2.5km radius |
| **30 min** | ~5km radius |

### Dietary Restrictions

Filter results by dietary needs:
- Gluten-Free
- Vegan
- Vegetarian

### Variety Tracking

The app remembers what restaurants you've seen and prioritizes fresh options in future searches. No more "why does it keep showing me the same 3 places?"

### The Terminal UI

Yes, it looks like a piece of Braun equipment from 1968. That's intentional. The loading screen has scanlines, generates contextual jokes while it thinks (AI-generated based on your location and search), and makes satisfying click sounds. We're not trying to look like every other food app.

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
    +---> Supabase PostgreSQL (search history, favorites, places cache, logs)
    +---> Two-Tier Cache (L1: In-memory, L2: Supabase)
```

### Data Flow

1. User picks location + vibe + constraints
2. AI translates freestyle prompts into Google Places search queries
3. Google Places API returns ~20-30 candidates
4. Places and distances are cached (L1 in-memory + L2 Supabase) to reduce API costs
5. Claude Opus 4.5 analyzes reviews, extracts dish mentions, scores vibe match
6. You get 3 recommendations with specific dishes and honest explanations
7. Results are tracked for variety in future searches

### API Key Security

The OpenRouter API key stays server-side in an Edge Function. Google Maps key uses HTTP referrer restrictions. Your API bills are protected.

### Deployment

Production is deployed on **Vercel** at [lunch.thirdface.com](https://lunch.thirdface.com).

---

## Environment Setup

You need three things:

### 1. Supabase Project

Free tier works fine. Get your credentials from the dashboard.

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

### 2. Google Cloud APIs

Enable these in Google Cloud Console:
- Maps JavaScript API
- Places API (New)
- Distance Matrix API
- Geocoding API

Then restrict your key to HTTP referrers (localhost for dev, your domain for prod).

```env
VITE_GOOGLE_MAPS_API_KEY=your-maps-key
```

### 3. OpenRouter API Key (Server-Side)

This one stays in Supabase as a secret, not in your frontend:

```bash
supabase secrets set OPENROUTER_API_KEY=your-openrouter-key
supabase functions deploy openrouter-proxy
```

Get your API key from [OpenRouter](https://openrouter.ai/). The app uses:
- **Claude Opus 4.5** (`anthropic/claude-opus-4.5`) for complex restaurant analysis
- **Claude Sonnet 4.5** (`anthropic/claude-sonnet-4.5`) for search translation and loading messages

---

## Database Setup

Run these in your Supabase SQL editor:

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
create table if not exists places_cache (
  place_id text primary key,
  data jsonb not null,
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

-- Auto-cleanup old cache entries (run as scheduled job)
-- DELETE FROM places_cache WHERE updated_at < now() - interval '7 days';
-- DELETE FROM distance_cache WHERE created_at < now() - interval '7 days';
```

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
│   │   ├── useGooglePlaces.ts    # Places API integration
│   │   ├── useDistanceMatrix.ts  # Walking times calculation
│   │   ├── useLunchDecision.ts   # Main orchestration (including mock mode)
│   │   ├── usePreferences.ts     # User prefs with localStorage
│   │   ├── useTerminalLogs.ts    # Terminal log management
│   │   └── index.ts              # Hook exports
│   ├── services/
│   │   ├── aiService.ts          # AI logic (Claude via OpenRouter)
│   │   └── supabaseService.ts    # Database operations + cache
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
- **Fresh drops** - new places (<80 reviews, oldest review <6 months) with 4.0+ rating get highlighted
- **Trending** - places with 10%+ of reviews from the last month are flagged as hot
- **Will it be open?** - prioritizes places open by the time you'd arrive

Then Claude AI picks the best 3 from the top 25 candidates.

---

## Caching System

Two-tier caching to reduce Google API costs:

| Layer | Scope | TTL | Purpose |
|-------|-------|-----|---------|
| **L1** | In-memory | 1 hour | Instant access within session |
| **L2** | Supabase | 7 days | Shared across all users |

Cache performance is logged per session, including estimated cost savings.

---

## Design Philosophy

> Based on [Anthropic's Frontend Design Skill](https://github.com/anthropics/skills/blob/main/skills/frontend-design/SKILL.md)

### This Project's Tone: Industrial/Utilitarian with Braun-Inspired Warmth

### Core Design Philosophy: Dieter Rams Inspired

All designs in this project follow **Dieter Rams' 10 Principles of Good Design**:

1. **Good design is innovative** - Push boundaries while solving real problems
2. **Good design makes a product useful** - Form follows function
3. **Good design is aesthetic** - Visual quality is integral to usefulness
4. **Good design makes a product understandable** - Self-explanatory interfaces
5. **Good design is unobtrusive** - Products should be neutral and restrained
6. **Good design is honest** - No manipulation or false promises
7. **Good design is long-lasting** - Avoid trends, aim for timelessness
8. **Good design is thorough down to the last detail** - Nothing is arbitrary
9. **Good design is environmentally friendly** - Minimal, efficient code
10. **Good design is as little design as possible** - Less, but better

### Color Palette (Braun-Inspired)

```css
/* Light Theme */
--braun-bg: #F5F5F0;           /* Warm off-white */
--braun-dark: #1A1A1A;         /* Near-black */
--braun-border: #C4C4B8;       /* Warm gray */
--braun-text-muted: #707070;   /* Muted text */
--braun-orange: #FF4400;       /* Accent - Warm orange */

/* Dark Theme */
--dark-bg: #0F0F0F;            /* Deep black */
--dark-text: #E8E8E8;          /* Off-white text */
--dark-border: #2A2A2A;        /* Subtle border */
--dark-text-muted: #6B6B6B;    /* Muted text */
```

### Spacing System (4px/8px Base Unit)

```css
--space-1: 4px;    /* Tight spacing */
--space-2: 8px;    /* Default small */
--space-3: 12px;   /* Medium-small */
--space-4: 16px;   /* Default medium */
--space-6: 24px;   /* Large */
--space-8: 32px;   /* XL */
--space-12: 48px;  /* Section spacing */
```

### Typography

- **Display/Headers**: `'Inter', sans-serif` - Bold, tight tracking
- **Monospace/Data**: `'Roboto Mono', monospace` - Technical readability
- **Body**: System fonts for performance

The Braun-inspired aesthetic isn't just for looks - it's a statement that a lunch app doesn't need to look like every other app. The terminal screen has actual scanlines because we thought it would be funny.

---

## Privacy

We believe in transparency. See our [Privacy Policy](https://lunch.thirdface.com) (click the footer link) for details on:
- What data is stored locally vs. server-side
- How search history and recommendations are tracked
- Third-party services used (Google Places, OpenRouter, Supabase)
- Your rights and how to clear your data

**TL;DR:** No accounts required, anonymous session IDs, no tracking cookies, data retention limits (90 days for history, 30 days for logs).

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

---

## License

MIT - do what you want, don't blame us.

---

Built by [thirdface](https://thirdface.com)

*"Good design is as little design as possible." - Dieter Rams*
