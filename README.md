# 🍜 Thirdface Lunch Decider

An AI-powered lunch recommendation engine that helps you discover the perfect spot for your next meal. Built with React, Google Maps, Gemini AI, and Supabase.

![Lunch Decider](https://img.shields.io/badge/version-1.0.0-orange)
![React](https://img.shields.io/badge/React-18.3-blue)
![TypeScript](https://img.shields.io/badge/TypeScript-5.4-blue)
![Supabase](https://img.shields.io/badge/Supabase-2.39-green)

## ✨ Features

- **🎯 Vibe-Based Search** - Choose from 6 distinct "mental states" to match your mood:
  - Grab & Go - Quick, efficient meals
  - Light & Clean - Fresh, healthy options
  - Hearty & Rich - Comfort food satisfaction
  - Spicy & Bold - Intense flavor experiences
  - View & Vibe - Atmosphere-focused dining
  - Authentic & Classic - Traditional favorites

- **🤖 AI-Powered Recommendations** - Gemini AI analyzes reviews, menus, and attributes to find hidden gems

- **📍 Location-Aware** - Uses Google Maps to find restaurants within your preferred walking distance

- **💰 Budget Filtering** - Filter by budget tier (Bootstrapped, Series A, Company Card)

- **🥗 Dietary Support** - Filter for Gluten-Free, Vegan, or Vegetarian options

- **💳 Payment Preferences** - Option to exclude cash-only establishments

- **❤️ Favorites** - Save your favorite spots for quick access

- **📊 Search History** - Track your searches with Supabase

- **🌙 Dark Mode** - Beautiful Braun-inspired design with light/dark themes

## 🏗️ Architecture

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
│  │  (AI Decisions)  │  │  (History, Favorites, Logs)      │ │
│  └──────────────────┘  └──────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                              │
          ┌───────────────────┼───────────────────┐
          ▼                   ▼                   ▼
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│  Google Maps    │ │   Gemini AI     │ │    Supabase     │
│  Places API     │ │   (via proxy)   │ │   PostgreSQL    │
└─────────────────┘ └─────────────────┘ └─────────────────┘
```

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ 
- npm or yarn
- Google Maps API Key (with Places API enabled)
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
   
   Create a `.env` file in the root directory:
   ```env
   # Gemini AI (for the server proxy)
   API_KEY=your_gemini_api_key
   
   # Port for production server
   PORT=8080
   ```

4. **Start development server**
   ```bash
   npm run dev
   ```

5. **Open in browser**
   ```
   http://localhost:5173
   ```

## 🌐 Deployment on Vercel

### One-Click Deploy

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/yourusername/lunch-decider)

### Manual Deployment

1. **Install Vercel CLI**
   ```bash
   npm i -g vercel
   ```

2. **Login to Vercel**
   ```bash
   vercel login
   ```

3. **Deploy**
   ```bash
   vercel
   ```

4. **Set Environment Variables**
   
   In your Vercel project settings, add:
   - `API_KEY` - Your Gemini API key

### Vercel Configuration

The project includes a `vercel.json` configuration file that:
- Builds the frontend with Vite
- Sets up serverless functions for the Gemini API proxy
- Configures proper routing

## 📁 Project Structure

```
lunch-decider/
├── index.html              # HTML entry point
├── index.tsx               # React entry point
├── package.json            # Dependencies & scripts
├── tsconfig.json           # TypeScript configuration
├── vite.config.ts          # Vite bundler configuration
├── vercel.json             # Vercel deployment config
├── server.js               # Express server (production)
│
├── api/                    # Vercel Serverless Functions
│   └── gemini/
│       └── generate.ts     # Gemini API proxy endpoint
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
    ├── lib/
    │   ├── supabase.ts         # Supabase client setup
    │   └── database.types.ts   # Auto-generated DB types
    │
    └── utils/
        ├── logger.ts           # Application logging
        └── lunchAlgorithm.ts   # Scoring & filtering logic
```

## 🗃️ Database Schema

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

#### `app_logs`
Application logging for debugging and analytics.

| Column | Type | Description |
|--------|------|-------------|
| id | BIGINT | Primary key |
| level | TEXT | INFO, WARN, ERROR, DEBUG |
| category | TEXT | AI, SYSTEM, USER, NETWORK |
| message | TEXT | Log message |
| metadata | JSONB | Additional context |

## 🔧 Configuration

### Google Maps API

The app requires a Google Maps API key with the following APIs enabled:
- Maps JavaScript API
- Places API (New)
- Distance Matrix API
- Geocoding API

Update the API key in `index.html`:
```javascript
key: "YOUR_GOOGLE_MAPS_API_KEY",
```

### Supabase

Update the Supabase configuration in `src/lib/supabase.ts`:
```typescript
const SUPABASE_URL = 'https://your-project.supabase.co';
const SUPABASE_ANON_KEY = 'your-anon-key';
```

### Gemini AI

The Gemini API key is passed via environment variable to the server:
```env
API_KEY=your_gemini_api_key
```

## 🎨 Design System

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

## 📜 Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Build for production |
| `npm run preview` | Preview production build |
| `npm start` | Start production server |

## 🔒 Security

- Row Level Security (RLS) enabled on all Supabase tables
- API keys are server-side only (proxied through serverless functions)
- Session-based identification (no user auth required)
- Input sanitization on all user inputs

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [Google Maps Platform](https://developers.google.com/maps) for location services
- [Google Gemini](https://ai.google.dev/) for AI recommendations
- [Supabase](https://supabase.com/) for backend infrastructure
- [Tailwind CSS](https://tailwindcss.com/) for styling
- [Vite](https://vitejs.dev/) for blazing fast builds

---

Built with ❤️ by [Thirdface](https://thirdface.com)
