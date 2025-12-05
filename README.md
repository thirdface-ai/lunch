# Thirdface Lunch Decider

An AI-powered lunch recommendation engine that helps you discover the perfect spot for your next meal. Built with React, Google Maps, Gemini AI, and Supabase.

![Lunch Decider](https://img.shields.io/badge/version-1.0.0-orange)
![React](https://img.shields.io/badge/React-18.3-blue)
![TypeScript](https://img.shields.io/badge/TypeScript-5.4-blue)
![Supabase](https://img.shields.io/badge/Supabase-2.39-green)

## Features

- **Vibe-Based Search** - Choose from 6 distinct "mental states" to match your mood:
  - Grab & Go - Quick, efficient meals
  - Light & Clean - Fresh, healthy options
  - Hearty & Rich - Comfort food satisfaction
  - Spicy & Bold - Intense flavor experiences
  - View & Vibe - Atmosphere-focused dining
  - Authentic & Classic - Traditional favorites

- **AI-Powered Recommendations** - Gemini AI analyzes reviews, menus, and attributes to find hidden gems

- **Location-Aware** - Uses Google Maps to find restaurants within your preferred walking distance

- **Budget Filtering** - Filter by budget tier (Bootstrapped, Series A, Company Card)

- **Dietary Support** - Filter for Gluten-Free, Vegan, or Vegetarian options

- **Payment Preferences** - Option to exclude cash-only establishments

- **Favorites** - Save your favorite spots for quick access

- **Search History** - Track your searches with Supabase

- **Dark Mode** - Beautiful Braun-inspired design with light/dark themes

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Frontend (React)                      │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │ ControlPanel│  │ TerminalLog │  │    ResultsView      │  │
│  │   (Input)   │  │ (Processing)│  │ (Results + Map)     │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│                      Services Layer                          │
│  ┌──────────────────┐  ┌──────────────────────────────────┐ │
│  │  geminiService   │  │      supabaseService             │ │
│  │  (AI via proxy)  │  │  (History, Favorites, Logs)      │ │
│  └──────────────────┘  └──────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                      │
          ┌───────────┼───────────┐
          ▼           ▼           ▼
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│  Google Maps    │ │ Gemini AI       │ │    Supabase     │
│  (client-side)  │ │ (Edge Function) │ │   PostgreSQL    │
└─────────────────┘ └─────────────────┘ └─────────────────┘
```

## Quick Start

### Prerequisites

- Node.js 18+ 
- npm or yarn
- Google Maps API Key (with Places API and Distance Matrix API enabled)
- Gemini API Key
- Supabase Project

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/lunch-decider.git
   cd lunch-decider
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   
   Create a `.env.local` file:
   ```env
   # Supabase Configuration
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-key
   
   # Google Maps API Key (client-side, restricted by HTTP referrer)
   VITE_GOOGLE_MAPS_API_KEY=your-google-maps-api-key
   ```

4. **Deploy Supabase Edge Function for Gemini**
   ```bash
   # Link to your Supabase project
   supabase link --project-ref your-project-ref
   
   # Set Gemini API key secret
   supabase secrets set GEMINI_API_KEY=your-gemini-key
   
   # Deploy the Gemini proxy function
   supabase functions deploy gemini-proxy
   ```

5. **Start development server**
   ```bash
   npm run dev
   ```

6. **Open in browser**
   ```
   http://localhost:5173
   ```

## API Key Security

| Key | Storage Location | Security |
|-----|-----------------|----------|
| `GOOGLE_MAPS_API_KEY` | Client (env var) | Protected by HTTP referrer restrictions |
| `GEMINI_API_KEY` | Edge Function Secret | Server-side only, never exposed |
| `SUPABASE_ANON_KEY` | Client (env var) | Safe - RLS protected |

### Google Maps API Key Restrictions

In Google Cloud Console, restrict your client-side Google Maps key:

1. **Application restrictions**: HTTP referrers
   - `localhost:*` (for development)
   - `your-production-domain.com/*`

2. **API restrictions**: Only enable:
   - Maps JavaScript API
   - Places API (New)
   - Distance Matrix API
   - Geocoding API

### Setting Gemini Secret

```bash
# Set the Gemini API key as an Edge Function secret
supabase secrets set GEMINI_API_KEY=your-key-here

# List current secrets
supabase secrets list
```

## User API Keys (Optional)

The app supports user-provided API keys stored securely in Supabase Vault:

```sql
-- User API keys are stored in the user_api_keys table
-- Keys are encrypted client-side before storage
-- RLS ensures users can only access their own keys
```

## Deployment

### Vercel (Frontend)

```bash
# Deploy frontend to Vercel
vercel

# Set environment variables in Vercel dashboard:
# - VITE_SUPABASE_URL
# - VITE_SUPABASE_ANON_KEY
# - VITE_GOOGLE_MAPS_API_KEY
```

### Supabase (Backend)

```bash
# Deploy Edge Function
supabase functions deploy gemini-proxy

# Apply database migrations
supabase db push
```

## Project Structure

```
lunch-decider/
├── index.html              # HTML entry point
├── package.json            # Dependencies & scripts
├── vercel.json             # Vercel deployment config
│
├── supabase/
│   └── functions/
│       └── gemini-proxy/   # AI proxy Edge Function
│           └── index.ts
│
└── src/
    ├── App.tsx             # Main application component
    ├── types.ts            # TypeScript type definitions
    │
    ├── components/
    │   ├── ControlPanel.tsx    # Input form & preferences
    │   ├── TerminalLog.tsx     # Processing animation
    │   ├── ResultsView.tsx     # Results display
    │   ├── MapComponent.tsx    # Google Maps integration
    │   └── ErrorBoundary.tsx   # Error handling
    │
    ├── services/
    │   ├── geminiService.ts    # AI recommendation logic
    │   └── supabaseService.ts  # Database operations
    │
    ├── hooks/
    │   ├── useGooglePlaces.ts  # Places API (client-side)
    │   ├── useDistanceMatrix.ts # Distance Matrix (client-side)
    │   └── ...
    │
    ├── lib/
    │   ├── supabase.ts         # Supabase client setup
    │   └── database.types.ts   # Auto-generated DB types
    │
    └── utils/
        ├── logger.ts           # Application logging
        └── lunchAlgorithm.ts   # Scoring & filtering logic
```

## Database Schema

### Tables

#### `search_history`
Tracks user searches for analytics and history.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| session_id | TEXT | Browser session identifier |
| address | TEXT | Search location |
| lat, lng | FLOAT | Coordinates |
| vibe | TEXT | Selected vibe/mood |
| price | TEXT | Budget tier |
| walk_limit | TEXT | Walking time preference |
| dietary_restrictions | TEXT[] | Array of restrictions |
| result_count | INT | Number of results |

#### `favorites`
Stores user's favorite restaurants.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| session_id | TEXT | Browser session identifier |
| place_id | TEXT | Google Places ID (unique) |
| place_name | TEXT | Restaurant name |
| place_rating | DECIMAL | Rating |
| ai_reason | TEXT | AI recommendation reason |
| recommended_dish | TEXT | Suggested dish |

#### `user_api_keys`
Encrypted storage for user-provided API keys.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| session_id | TEXT | Browser session identifier |
| service | TEXT | Service name (gemini, openai, etc.) |
| encrypted_key | TEXT | Encrypted API key |
| key_hint | TEXT | Last 4 chars for display |

#### `app_logs`
Application logging for debugging and analytics.

| Column | Type | Description |
|--------|------|-------------|
| id | BIGINT | Primary key |
| level | TEXT | INFO, WARN, ERROR, DEBUG |
| category | TEXT | AI, SYSTEM, USER, NETWORK |
| message | TEXT | Log message |
| metadata | JSONB | Additional context |

## Design System

The app uses a Braun-inspired design language:

### Colors (Light Mode)
- Background: `#EFEFE8`
- Surface: `#F9F9F7`
- Border: `#D4D4D0`
- Text: `#3D3D3D`
- Accent: `#FF4400` (Orange)

### Colors (Dark Mode)
- Background: `#0A0A0A`
- Surface: `#141414`
- Border: `#2A2A2A`
- Text: `#E0E0E0`
- Accent: `#FF4400` (Orange)

### Typography
- Sans: Inter
- Mono: Roboto Mono

## Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Build for production |
| `npm run preview` | Preview production build |
| `npm start` | Start production server |

## Security

- Row Level Security (RLS) enabled on all Supabase tables
- Gemini API key stored as Edge Function secret (never exposed to client)
- Google Maps API key protected by HTTP referrer restrictions
- User API keys encrypted with pgsodium before storage
- Session-based identification (no user auth required)
- Input sanitization on all user inputs

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- [Google Maps Platform](https://developers.google.com/maps) for location services
- [Google Gemini](https://ai.google.dev/) for AI recommendations
- [Supabase](https://supabase.com/) for backend infrastructure
- [Tailwind CSS](https://tailwindcss.com/) for styling
- [Vite](https://vitejs.dev/) for blazing fast builds

---

Built with care by [Thirdface](https://thirdface.com)
