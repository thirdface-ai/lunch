<p align="center">
  <img src="https://img.shields.io/badge/LUNCH-DECIDER-FF4400?style=for-the-badge&labelColor=1A1A1A" alt="Lunch Decider" />
</p>

<h1 align="center">🍜 Lunch Decider</h1>

<p align="center">
  <strong>AI-powered lunch recommendations that match your vibe, not just your location.</strong>
</p>

<p align="center">
  <a href="#-quick-start">Quick Start</a> •
  <a href="#-features">Features</a> •
  <a href="#%EF%B8%8F-architecture">Architecture</a> •
  <a href="#-api-reference">API</a> •
  <a href="#-contributing">Contributing</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/React-18.3-61DAFB?logo=react&logoColor=white" alt="React" />
  <img src="https://img.shields.io/badge/TypeScript-5.4-3178C6?logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Vite-5.2-646CFF?logo=vite&logoColor=white" alt="Vite" />
  <img src="https://img.shields.io/badge/Supabase-2.39-3FCF8E?logo=supabase&logoColor=white" alt="Supabase" />
  <img src="https://img.shields.io/badge/Gemini_AI-Pro-4285F4?logo=google&logoColor=white" alt="Gemini" />
  <img src="https://img.shields.io/badge/License-MIT-FF4400" alt="License" />
</p>

<br />

---

## 🎯 What is this?

Lunch Decider is an **open-source AI-powered restaurant recommendation engine** that goes beyond basic location search. Instead of showing you 50 mediocre options, it:

1. **Understands your vibe** — "Grab & Go", "Spicy & Bold", "View & Vibe"
2. **Reads the reviews** — AI analyzes hundreds of reviews to find actual gems
3. **Recommends specific dishes** — Not just "try this place", but "get the Tonkotsu Ramen"
4. **Respects your constraints** — Budget, dietary needs, distance, payment preferences

Built with React, Google Maps, Google Gemini AI, and Supabase.

<br />

## 🚀 Quick Start

```bash
# Clone it
git clone https://github.com/thirdface/lunch-decider.git
cd lunch-decider

# Install dependencies
npm install

# Set up environment (see below for details)
cp env.example .env.local
# Edit .env.local with your API keys

# Run it
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) and find lunch.

<br />

## ✨ Features

### 🧠 Vibe-Based Search

Choose your mental state, get matching recommendations:

| Vibe | What You Get |
|------|-------------|
| **Grab & Go** | Quick bites, food trucks, bakeries — in and out |
| **Light & Clean** | Salads, poke, Vietnamese — keep it fresh |
| **Hearty & Rich** | Ramen, burgers, Italian — comfort mode |
| **Spicy & Bold** | Thai, Sichuan, Indian — wake up your tastebuds |
| **View & Vibe** | Rooftops, scenic spots — Instagram-worthy |
| **Authentic & Classic** | Traditional, time-tested, no gimmicks |

### 🤖 AI-Powered Analysis

Gemini AI reads through reviews to:
- Extract specific dish recommendations ("the Duck Confit is legendary")
- Identify quality signals ("hidden gem", "locals' favorite")
- Detect red flags ("went downhill", "cash only")
- Match restaurants to your exact vibe

### 📍 Smart Location Awareness

- Google Maps integration with Places API
- Walking distance calculations
- Radius-based search (5/15/30 min walking)
- Interactive map with all results

### 💰 Budget Tiers

| Tier | Price Level | For When... |
|------|-------------|-------------|
| **Bootstrapped** | $ - $$ | Watching every dollar |
| **Series A** | $$ - $$$ | Comfortable spending |
| **Company Card** | $$$ - $$$$ | Expensing this one |

### 🥗 Dietary Support

- Gluten-Free
- Vegan  
- Vegetarian

### 💳 Payment Preferences

Toggle "No Cash" to exclude cash-only establishments (AI detects this from reviews too).

### ⭐ Favorites

Save recommendations for quick access later. Persisted via Supabase.

### 🌙 Dark Mode

Beautiful Braun-inspired design with light/dark themes. Follows system preference by default.

<br />

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           FRONTEND (React + Vite)                        │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   ┌─────────────────┐   ┌─────────────────┐   ┌─────────────────────┐   │
│   │  ControlPanel   │   │   TerminalLog   │   │    ResultsView      │   │
│   │                 │   │                 │   │                     │   │
│   │  • Vibe select  │   │  • AI progress  │   │  • Restaurant cards │   │
│   │  • Location     │   │  • Funny logs   │   │  • Interactive map  │   │
│   │  • Filters      │   │  • Status       │   │  • Dish recs        │   │
│   └─────────────────┘   └─────────────────┘   └─────────────────────┘   │
│                                                                         │
│   ┌─────────────────────────────────────────────────────────────────┐   │
│   │                        Custom Hooks                             │   │
│   │  useGooglePlaces • useDistanceMatrix • useLunchDecision         │   │
│   │  usePreferences • useFavorites • useTerminalLogs                │   │
│   └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                           SERVICES LAYER                                 │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   ┌────────────────────────────┐   ┌────────────────────────────────┐   │
│   │      geminiService.ts      │   │      supabaseService.ts        │   │
│   │                            │   │                                │   │
│   │  • decideLunch()           │   │  • saveSearchHistory()         │   │
│   │  • generateLoadingLogs()   │   │  • saveFavorite()              │   │
│   │  • Calls Edge Function     │   │  • getFavorites()              │   │
│   └────────────────────────────┘   └────────────────────────────────┘   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
           ┌────────────────────────┼────────────────────────┐
           │                        │                        │
           ▼                        ▼                        ▼
┌─────────────────────┐  ┌─────────────────────┐  ┌─────────────────────┐
│    Google Maps      │  │   Supabase Edge     │  │     Supabase        │
│    Platform         │  │   Function          │  │     PostgreSQL      │
│                     │  │                     │  │                     │
│  • Places API       │  │  • gemini-proxy     │  │  • search_history   │
│  • Distance Matrix  │  │  • Secure API key   │  │  • favorites        │
│  • Maps JavaScript  │  │  • Rate limiting    │  │  • app_logs         │
└─────────────────────┘  └─────────────────────┘  └─────────────────────┘
        (client)              (server-side)            (database)
```

### Data Flow

```
User Input → Google Places API → Candidate Restaurants (15-20)
                                         │
                                         ▼
                              Gemini AI (via Edge Function)
                              • Analyzes reviews
                              • Extracts dish mentions
                              • Scores vibe match
                                         │
                                         ▼
                              Top 3 Recommendations
                              • Specific dishes
                              • AI explanations
                              • Cash warnings
```

<br />

## 📦 Installation

### Prerequisites

- **Node.js 18+** (we recommend using [fnm](https://github.com/Schniz/fnm) or [nvm](https://github.com/nvm-sh/nvm))
- **npm** or **yarn**
- **Google Cloud Account** — for Maps & Gemini APIs
- **Supabase Account** — free tier works great

### Step 1: Clone & Install

```bash
git clone https://github.com/thirdface/lunch-decider.git
cd lunch-decider
npm install
```

### Step 2: Environment Variables

Create `.env.local` from the example:

```bash
cp env.example .env.local
```

Edit `.env.local`:

```env
# Supabase (get from: supabase.com/dashboard/project/_/settings/api)
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key

# Google Maps (get from: console.cloud.google.com/apis/credentials)
VITE_GOOGLE_MAPS_API_KEY=your-google-maps-key
```

### Step 3: Set Up Supabase

#### Database Tables

Run these migrations in your Supabase SQL editor:

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

-- RLS Policies (session-based)
create policy "Users can view their own search history"
  on search_history for select
  using (session_id = current_setting('request.jwt.claims')::json->>'session_id');

create policy "Users can insert their own search history"
  on search_history for insert
  with check (true);

create policy "Users can manage their own favorites"
  on favorites for all
  using (true);

create policy "Anyone can insert logs"
  on app_logs for insert
  with check (true);
```

#### Deploy Edge Function

```bash
# Install Supabase CLI if you haven't
npm install -g supabase

# Link to your project
supabase link --project-ref your-project-ref

# Set the Gemini API key as a secret
supabase secrets set GEMINI_API_KEY=your-gemini-key

# Deploy the proxy function
supabase functions deploy gemini-proxy
```

### Step 4: Configure Google Cloud

#### Enable APIs

In [Google Cloud Console](https://console.cloud.google.com/apis/library), enable:

- ✅ Maps JavaScript API
- ✅ Places API (New)
- ✅ Distance Matrix API
- ✅ Geocoding API

#### Restrict Your API Key

1. Go to **APIs & Services → Credentials**
2. Click your API key → **Edit**
3. Under **Application restrictions**, select **HTTP referrers**
4. Add:
   - `localhost:*` (development)
   - `your-domain.com/*` (production)
5. Under **API restrictions**, select **Restrict key** and choose only the 4 APIs above

### Step 5: Run

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) 🎉

<br />

## 🔐 Security

### API Key Strategy

| Key | Location | Protection |
|-----|----------|------------|
| `GOOGLE_MAPS_API_KEY` | Client `.env` | HTTP referrer restrictions |
| `GEMINI_API_KEY` | Edge Function secret | Server-side only, never exposed |
| `SUPABASE_ANON_KEY` | Client `.env` | Row Level Security (RLS) |

### Why Edge Functions?

The Gemini API key **cannot** be restricted by HTTP referrer, so it must stay server-side. We use Supabase Edge Functions as a proxy:

```
Client → Supabase Edge Function → Gemini API
              (secret key)
```

This keeps your AI costs protected while maintaining sub-second latency.

<br />

## 📁 Project Structure

```
lunch-decider/
├── 📄 index.html                 # Entry point
├── 📄 package.json               # Dependencies & scripts
├── 📄 vite.config.ts             # Vite configuration
├── 📄 tsconfig.json              # TypeScript config
├── 📄 tailwind.config.js         # Tailwind CSS config
│
├── 📁 src/
│   ├── 📄 App.tsx                # Root component
│   ├── 📄 index.css              # Global styles
│   ├── 📄 types.ts               # TypeScript definitions
│   │
│   ├── 📁 components/
│   │   ├── ControlPanel.tsx      # Input form, vibe selection
│   │   ├── TerminalLog.tsx       # AI progress animation
│   │   ├── ResultsView.tsx       # Results display + map
│   │   ├── MapComponent.tsx      # Google Maps wrapper
│   │   └── ErrorBoundary.tsx     # Error handling
│   │
│   ├── 📁 hooks/
│   │   ├── index.ts              # Barrel export
│   │   ├── useGooglePlaces.ts    # Places API integration
│   │   ├── useDistanceMatrix.ts  # Walking time calculation
│   │   ├── useLunchDecision.ts   # Main orchestration hook
│   │   ├── usePreferences.ts     # LocalStorage persistence
│   │   ├── useFavorites.ts       # Favorites management
│   │   └── useTerminalLogs.ts    # Log state management
│   │
│   ├── 📁 services/
│   │   ├── geminiService.ts      # AI recommendation logic
│   │   ├── geminiService.test.ts # Service tests
│   │   └── supabaseService.ts    # Database operations
│   │
│   ├── 📁 lib/
│   │   ├── supabase.ts           # Supabase client setup
│   │   └── database.types.ts     # Generated DB types
│   │
│   └── 📁 utils/
│       ├── logger.ts             # Structured logging
│       ├── lunchAlgorithm.ts     # Scoring & filtering
│       └── lunchAlgorithm.test.ts
│
├── 📁 supabase/
│   └── 📁 functions/
│       └── 📁 gemini-proxy/
│           └── index.ts          # Edge Function
│
└── 📁 test/
    └── setup.ts                  # Test configuration
```

<br />

## 🧪 Testing

```bash
# Run tests
npm test

# Run with UI
npm run test:ui

# Coverage report
npm run test:coverage
```

Tests use [Vitest](https://vitest.dev/) + [Testing Library](https://testing-library.com/).

<br />

## 🚢 Deployment

### Frontend (Vercel)

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel

# Set environment variables in Vercel Dashboard:
# - VITE_SUPABASE_URL
# - VITE_SUPABASE_ANON_KEY
# - VITE_GOOGLE_MAPS_API_KEY
```

### Frontend (Netlify)

```bash
npm run build
# Deploy dist/ folder
```

### Edge Functions (Supabase)

```bash
supabase functions deploy gemini-proxy
```

<br />

## 📜 Scripts Reference

| Script | Description |
|--------|-------------|
| `npm run dev` | Start dev server (Vite) |
| `npm run build` | Build for production |
| `npm run preview` | Preview production build |
| `npm run start` | Start production server |
| `npm test` | Run tests |
| `npm run test:ui` | Run tests with UI |
| `npm run test:coverage` | Generate coverage report |

<br />

## 🎨 Design System

Built on [Dieter Rams' principles](https://www.vitsoe.com/us/about/good-design) with a Braun-inspired aesthetic.

### Colors

```css
/* Light Mode */
--braun-bg: #F5F5F0;        /* Warm off-white */
--braun-surface: #F9F9F7;   /* Slightly elevated */
--braun-border: #D4D4D0;    /* Subtle borders */
--braun-text: #3D3D3D;      /* Primary text */
--braun-accent: #FF4400;    /* Action orange */

/* Dark Mode */
--dark-bg: #0A0A0A;         /* Deep black */
--dark-surface: #141414;    /* Elevated surfaces */
--dark-border: #2A2A2A;     /* Subtle borders */
--dark-text: #E0E0E0;       /* Primary text */
```

### Typography

- **Sans-serif**: Inter — for UI and body text
- **Monospace**: Roboto Mono — for terminal logs and data

### Spacing

Uses an 8px base unit system. See `.cursorrules` for the complete design system documentation.

<br />

## 🤝 Contributing

We love contributions! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

### Quick Contribution Guide

```bash
# Fork the repo, then:
git clone https://github.com/YOUR_USERNAME/lunch-decider.git
cd lunch-decider
npm install

# Create a branch
git checkout -b feature/amazing-feature

# Make your changes, then:
npm test
npm run build

# Commit and push
git commit -m "Add amazing feature"
git push origin feature/amazing-feature

# Open a Pull Request!
```

### Areas We'd Love Help With

- 🌍 **Internationalization** — Support for more languages
- 🍽️ **Cuisine Support** — Better vibe→cuisine mapping
- 📱 **PWA** — Offline support, installability
- ♿ **Accessibility** — Screen reader improvements
- 🧪 **Tests** — More coverage is always better
- 📖 **Docs** — Tutorials, guides, examples

<br />

## 📄 License

This project is licensed under the **MIT License** — see the [LICENSE](LICENSE) file for details.

```
MIT License — do whatever you want, just don't blame us.
```

<br />

## 🙏 Acknowledgments

Built with these incredible tools:

- [React](https://react.dev/) — UI library
- [Vite](https://vitejs.dev/) — Build tool
- [TypeScript](https://www.typescriptlang.org/) — Type safety
- [Tailwind CSS](https://tailwindcss.com/) — Styling
- [Google Maps Platform](https://developers.google.com/maps) — Location services
- [Google Gemini](https://ai.google.dev/) — AI recommendations
- [Supabase](https://supabase.com/) — Backend & Edge Functions
- [Vitest](https://vitest.dev/) — Testing

<br />

## 💬 Support

- 🐛 **Found a bug?** [Open an issue](https://github.com/thirdface/lunch-decider/issues)
- 💡 **Have an idea?** [Start a discussion](https://github.com/thirdface/lunch-decider/discussions)
- 📧 **Need help?** [Email us](mailto:hello@thirdface.com)

<br />

---

<p align="center">
  <strong>Built with 🍜 by <a href="https://thirdface.com">thirdface</a></strong>
</p>

<p align="center">
  <sub>Good design is as little design as possible — Dieter Rams</sub>
</p>
