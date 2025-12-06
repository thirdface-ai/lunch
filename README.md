# Lunch Decider

**Stop scrolling through 50 mediocre restaurants. Tell us your vibe, we'll tell you what to order.**

**[Try it live at lunch.thirdface.com](https://lunch.thirdface.com)**

---

## The Problem

Every lunch recommendation app does the same thing: here's a list of places, sorted by rating, good luck. You scroll for 10 minutes, pick something safe, and wonder why you bothered.

Lunch Decider does something different. Instead of asking "what cuisine do you want?" (you don't know, that's the whole problem), we ask "what's your vibe?" Feeling efficient? Grab & Go. Need comfort? Hearty & Rich. Want to wake up? Spicy & Bold.

Then our AI reads through hundreds of reviews to find the actual gems - not just "this place is good" but "get the Tonkotsu Ramen, it's legendary." Specific dish recommendations from real people who bothered to write about them.

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
| **Paying Myself** | You're paying, keep it reasonable ($ - $$) |
| **Company Card** | Someone else is paying, live a little ($$$ - $$$$) |

### Walk Time Preferences

| Option | Radius |
|--------|--------|
| **5 min** | ~1km radius |
| **15 min** | ~2.5km radius |
| **Doesn't Matter** | ~5km radius (30 min walk) |

### Dietary Restrictions

Filter results by dietary needs:
- Gluten-Free
- Vegan
- Vegetarian

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
    +---> Supabase Edge Function ---> OpenRouter AI (auto model selection)
    +---> Supabase PostgreSQL (search history, favorites, logs)
```

### Data Flow

1. User picks location + vibe + constraints
2. Google Places API returns ~20 candidates
3. OpenRouter AI analyzes reviews, extracts dish mentions, scores vibe match
4. You get 3 recommendations with specific dishes and honest explanations

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

-- Recommended Places (tracks AI recommendations per session)
create table if not exists recommended_places (
  id uuid primary key default gen_random_uuid(),
  session_id text not null,
  place_id text not null,
  place_name text,
  created_at timestamptz default now()
);

-- User API Keys (optional: for users bringing their own keys)
create table if not exists user_api_keys (
  id uuid primary key default gen_random_uuid(),
  session_id text not null,
  service text not null check (service in ('gemini', 'openai', 'anthropic', 'custom')),
  encrypted_key text not null,
  key_hint text,
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
comment on table user_api_keys is 'Stores encrypted user API keys for external services. Keys are encrypted client-side before storage.';

-- Enable RLS
alter table search_history enable row level security;
alter table favorites enable row level security;
alter table app_logs enable row level security;
alter table recommended_places enable row level security;
alter table user_api_keys enable row level security;

-- Policies (permissive for anonymous users)
create policy "Users can insert search history" on search_history for insert with check (true);
create policy "Users can manage favorites" on favorites for all using (true);
create policy "Anyone can insert logs" on app_logs for insert with check (true);
create policy "Users can manage recommended places" on recommended_places for all using (true);
create policy "Users can manage their API keys" on user_api_keys for all using (true);
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
│   │   ├── MapComponent.tsx      # Google Maps wrapper
│   │   ├── Footer.tsx            # Global footer
│   │   └── ErrorBoundary.tsx     # Error handling wrapper
│   ├── hooks/
│   │   ├── useGooglePlaces.ts    # Places API integration
│   │   ├── useDistanceMatrix.ts  # Walking times calculation
│   │   ├── useLunchDecision.ts   # Main orchestration
│   │   ├── usePreferences.ts     # User prefs with localStorage
│   │   ├── useTerminalLogs.ts    # Terminal log management
│   │   └── index.ts              # Hook exports
│   ├── services/
│   │   ├── aiService.ts          # AI logic (OpenRouter)
│   │   └── supabaseService.ts    # Database operations
│   ├── lib/
│   │   ├── supabase.ts           # Supabase client
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
- **Fresh drops** - new places (<50 reviews) with 4.0+ rating get highlighted
- **Will it be open?** - prioritizes places open by the time you'd arrive

Then OpenRouter AI picks the best 3 from the top 15 candidates.

---

## Design Philosophy

> Based on [Anthropic's Frontend Design Skill](https://github.com/anthropics/skills/blob/main/skills/frontend-design/SKILL.md)

This skill guides creation of distinctive, production-grade frontend interfaces that avoid generic "AI slop" aesthetics. Implement real working code with exceptional attention to aesthetic details and creative choices.

### Design Thinking

Before coding, understand the context and commit to a BOLD aesthetic direction:
- **Purpose**: What problem does this interface solve? Who uses it?
- **Tone**: Pick an extreme: brutally minimal, maximalist chaos, retro-futuristic, organic/natural, luxury/refined, playful/toy-like, editorial/magazine, brutalist/raw, art deco/geometric, soft/pastel, industrial/utilitarian, etc. There are so many flavors to choose from. Use these for inspiration but design one that is true to the aesthetic direction.
- **Constraints**: Technical requirements (framework, performance, accessibility).
- **Differentiation**: What makes this UNFORGETTABLE? What's the one thing someone will remember?

**CRITICAL**: Choose a clear conceptual direction and execute it with precision. Bold maximalism and refined minimalism both work - the key is intentionality, not intensity.

Then implement working code (HTML/CSS/JS, React, Vue, etc.) that is:
- Production-grade and functional
- Visually striking and memorable
- Cohesive with a clear aesthetic point-of-view
- Meticulously refined in every detail

### Frontend Aesthetics Guidelines

Focus on:
- **Typography**: Choose fonts that are beautiful, unique, and interesting. Avoid generic fonts like Arial and Inter; opt instead for distinctive choices that elevate the frontend's aesthetics; unexpected, characterful font choices. Pair a distinctive display font with a refined body font.
- **Color & Theme**: Commit to a cohesive aesthetic. Use CSS variables for consistency. Dominant colors with sharp accents outperform timid, evenly-distributed palettes.
- **Motion**: Use animations for effects and micro-interactions. Prioritize CSS-only solutions for HTML. Use Motion library for React when available. Focus on high-impact moments: one well-orchestrated page load with staggered reveals (animation-delay) creates more delight than scattered micro-interactions. Use scroll-triggering and hover states that surprise.
- **Spatial Composition**: Unexpected layouts. Asymmetry. Overlap. Diagonal flow. Grid-breaking elements. Generous negative space OR controlled density.
- **Backgrounds & Visual Details**: Create atmosphere and depth rather than defaulting to solid colors. Add contextual effects and textures that match the overall aesthetic. Apply creative forms like gradient meshes, noise textures, geometric patterns, layered transparencies, dramatic shadows, decorative borders, custom cursors, and grain overlays.

NEVER use generic AI-generated aesthetics like overused font families (Inter, Roboto, Arial, system fonts), cliched color schemes (particularly purple gradients on white backgrounds), predictable layouts and component patterns, and cookie-cutter design that lacks context-specific character.

Interpret creatively and make unexpected choices that feel genuinely designed for the context. No design should be the same. Vary between light and dark themes, different fonts, different aesthetics. NEVER converge on common choices (Space Grotesk, for example) across generations.

**IMPORTANT**: Match implementation complexity to the aesthetic vision. Maximalist designs need elaborate code with extensive animations and effects. Minimalist or refined designs need restraint, precision, and careful attention to spacing, typography, and subtle details. Elegance comes from executing the vision well.

Remember: Claude is capable of extraordinary creative work. Don't hold back, show what can truly be created when thinking outside the box and committing fully to a distinctive vision.

---

### Project-Specific Design Guidelines

#### This Project's Tone: Industrial/Utilitarian with Braun-Inspired Warmth

#### Core Design Philosophy: Dieter Rams Inspired

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

#### Color Palette (Braun-Inspired)

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

#### Spacing System (4px/8px Base Unit)

```css
--space-1: 4px;    /* Tight spacing */
--space-2: 8px;    /* Default small */
--space-3: 12px;   /* Medium-small */
--space-4: 16px;   /* Default medium */
--space-6: 24px;   /* Large */
--space-8: 32px;   /* XL */
--space-12: 48px;  /* Section spacing */
```

#### Typography

- **Display/Headers**: `'Inter', sans-serif` - Bold, tight tracking
- **Monospace/Data**: `'Roboto Mono', monospace` - Technical readability
- **Body**: System fonts for performance

#### Component Patterns

- **Buttons**: Minimal, uppercase labels, subtle hover states
- **Cards**: Sharp corners or very subtle radius (2-4px), clear hierarchy
- **Inputs**: Understated borders, focus states with accent color
- **Icons**: Functional, not decorative - use sparingly

#### Anti-Patterns (NEVER DO)

- ❌ Overused font families (Arial, system fonts only)
- ❌ Clichéd color schemes (purple gradients on white)
- ❌ Predictable layouts and component patterns
- ❌ Cookie-cutter design lacking context-specific character
- ❌ Inconsistent padding/spacing values
- ❌ Decorative elements without purpose
- ❌ Skeuomorphic details that don't add function

The Braun-inspired aesthetic isn't just for looks - it's a statement that a lunch app doesn't need to look like every other app. The terminal screen has actual scanlines because we thought it would be funny.

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

---

## License

MIT - do what you want, don't blame us.

---

Built by [thirdface](https://thirdface.com)

*"Good design is as little design as possible." - Dieter Rams*
