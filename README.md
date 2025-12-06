# Lunch Decider

**Stop scrolling through 50 mediocre restaurants. Tell us your vibe, we'll tell you what to order.**

---

## The Problem

Every lunch recommendation app does the same thing: here's a list of places, sorted by rating, good luck. You scroll for 10 minutes, pick something safe, and wonder why you bothered.

Lunch Decider does something different. Instead of asking "what cuisine do you want?" (you don't know, that's the whole problem), we ask "what's your vibe?" Feeling efficient? Grab & Go. Need comfort? Hearty & Rich. Want to wake up? Spicy & Bold.

Then our AI reads through hundreds of reviews to find the actual gems - not just "this place is good" but "get the Tonkotsu Ramen, it's legendary." Specific dish recommendations from real people who bothered to write about them.

---

## Quick Start

```bash
git clone https://github.com/thirdface/lunch-decider.git
cd lunch-decider
npm install
cp env.example .env.local
# Add your API keys (see Environment Setup below)
npm run dev
```

Open http://localhost:5173 and find lunch.

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

### AI That Actually Reads Reviews

OpenRouter AI (with auto model selection) digs through reviews to:
- Extract specific dish recommendations ("the Duck Confit is legendary")
- Identify quality signals ("hidden gem", "locals' favorite")
- Detect red flags ("went downhill", "used to be better")
- Catch cash-only warnings - even in German ("nur Barzahlung")

You get 3 recommendations with actual reasoning, not a ranked list of 50.

### Budget Tiers With Personality

| Tier | Translation |
|------|------------|
| **Personal** | You're paying, keep it reasonable ($ - $$) |
| **Company** | Someone else is paying, live a little ($$$ - $$$$) |

### The Terminal UI

Yes, it looks like a piece of Braun equipment from 1968. That's intentional. The loading screen has scanlines, generates contextual jokes while it thinks, and makes satisfying click sounds. We're not trying to look like every other food app.

---

## Architecture

```
Frontend (React + Vite)
    |
    v
Services Layer
    |
    +---> Google Maps Platform (Places API, Distance Matrix)
    +---> Supabase Edge Function ---> OpenRouter AI
    +---> Supabase PostgreSQL (search history, favorites)
```

### Data Flow

1. User picks location + vibe + constraints
2. Google Places API returns ~20 candidates
3. OpenRouter AI analyzes reviews, extracts dish mentions, scores vibe match
4. You get 3 recommendations with specific dishes and honest explanations

The OpenRouter API key stays server-side in an Edge Function. Google Maps key uses HTTP referrer restrictions. Your API bills are protected.

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

Get your API key from [OpenRouter](https://openrouter.ai/). The app uses `openrouter/auto` for automatic model selection.

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
  no_cash boolean,
  dietary_restrictions text[],
  freestyle_prompt text,
  result_count int
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
  metadata jsonb
);

-- App Logs
create table if not exists app_logs (
  id bigserial primary key,
  created_at timestamptz default now(),
  level text not null,
  category text not null,
  message text not null,
  metadata jsonb
);

-- Enable RLS
alter table search_history enable row level security;
alter table favorites enable row level security;
alter table app_logs enable row level security;

-- Policies (permissive for anonymous users)
create policy "Users can insert search history" on search_history for insert with check (true);
create policy "Users can manage favorites" on favorites for all using (true);
create policy "Anyone can insert logs" on app_logs for insert with check (true);
```

---

## Project Structure

```
lunch-decider/
├── src/
│   ├── components/
│   │   ├── ControlPanel.tsx      # Input form, vibe selection
│   │   ├── TerminalLog.tsx       # The loading screen with jokes
│   │   ├── ResultsView.tsx       # Results + map
│   │   └── MapComponent.tsx      # Google Maps wrapper
│   ├── hooks/
│   │   ├── useGooglePlaces.ts    # Places API
│   │   ├── useDistanceMatrix.ts  # Walking times
│   │   └── useLunchDecision.ts   # Main orchestration
│   ├── services/
│   │   ├── aiService.ts          # AI logic (OpenRouter)
│   │   └── supabaseService.ts    # Database ops
│   └── utils/
│       ├── lunchAlgorithm.ts     # Scoring logic
│       └── sounds.ts             # Click sounds
└── supabase/
    └── functions/
        └── openrouter-proxy/     # Edge Function
```

---

## Scripts

| Command | What it does |
|---------|-------------|
| `npm run dev` | Start dev server |
| `npm run build` | Build for production |
| `npm test` | Run tests |
| `npm run test:coverage` | Coverage report |

---

## The Scoring Algorithm

Not just "highest rated wins." We factor in:

- **Proximity** - closer is better (weighted by walk time preference)
- **Price match** - respects your budget setting
- **Hidden gems** - 4.3+ rating with 50-750 reviews gets a boost
- **Fresh drops** - new places (<50 reviews) with 4.0+ rating get highlighted
- **Will it be open?** - filters out places closed by the time you'd arrive

Then OpenRouter AI picks the best 3 from the top 15 candidates.

---

## Design Philosophy

The UI follows Dieter Rams' principles: less but better, nothing arbitrary, every element earns its place. The Braun-inspired aesthetic isn't just for looks - it's a statement that a lunch app doesn't need to look like every other app.

Light mode uses warm off-whites (#F5F5F0). Dark mode uses deep blacks (#0A0A0A). The accent orange (#FF4400) is used sparingly. The terminal screen has actual scanlines because we thought it would be funny.

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

---

## License

MIT - do what you want, don't blame us.

---

Built by [thirdface](https://thirdface.com)

*"Good design is as little design as possible." - Dieter Rams*
