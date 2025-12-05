// Application State
export enum AppState {
  INPUT = 'INPUT',
  PROCESSING = 'PROCESSING',
  RESULTS = 'RESULTS',
  ERROR = 'ERROR'
}

// Transport Mode
export enum TransportMode {
  WALK = 'WALK',
  DELIVERY = 'DELIVERY'
}

// Theme Mode
export enum ThemeMode {
  LIGHT = 'light',
  DARK = 'dark'
}

// Hunger Vibes
export enum HungerVibe {
  GRAB_AND_GO = 'Grab & Go',
  LIGHT_AND_CLEAN = 'Light & Clean',
  HEARTY_AND_RICH = 'Hearty & Rich',
  SPICY_AND_BOLD = 'Spicy & Bold',
  VIEW_AND_VIBE = 'View & Vibe',
  AUTHENTIC_AND_CLASSIC = 'Authentic & Classic',
}

// Price Points
export enum PricePoint {
  INTERN = 'Bootstrapped',
  SENIOR = 'Series A',
  COMPANY_CARD = 'Company Card'
}

// Walk Limits
export enum WalkLimit {
  FIVE_MIN = '5 min',
  FIFTEEN_MIN = '15 min',
  DOESNT_MATTER = '30 min'
}

// Dietary Restrictions
export enum DietaryRestriction {
  GLUTEN_FREE = 'Gluten-Free',
  VEGAN = 'Vegan',
  VEGETARIAN = 'Vegetarian',
}

// User Preferences
export interface UserPreferences {
  address: string;
  lat: number | null;
  lng: number | null;
  mode: TransportMode;
  vibe: HungerVibe | null;
  price: PricePoint | null;
  walkLimit: WalkLimit;
  noCash: boolean;
  theme: ThemeMode;
  dietaryRestrictions: DietaryRestriction[];
  freestylePrompt?: string;
}

// Google Place
export interface GooglePlace {
  place_id: string;
  name: string;
  rating?: number;
  user_ratings_total?: number;
  vicinity?: string;
  geometry?: {
    location: google.maps.LatLng | google.maps.LatLngLiteral;
  };
  types?: string[];
  price_level?: number;
  reviews?: google.maps.places.PlaceReview[];
  editorial_summary?: { overview: string };
  website?: string;
  formatted_phone_number?: string;
  opening_hours?: { 
    open_now: boolean;
    weekday_text?: string[];
  };
  payment_options?: { 
    accepts_credit_cards?: boolean; 
    accepts_cash_only?: boolean; 
    accepts_nfc?: boolean 
  };
  serves_vegetarian_food?: boolean;
  serves_wine?: boolean;
  serves_beer?: boolean;
  serves_breakfast?: boolean;
  serves_lunch?: boolean;
  takeout?: boolean;
  dine_in?: boolean;
}

// Gemini Recommendation
export interface GeminiRecommendation {
  place_id: string;
  ai_reason: string;
  recommended_dish: string;
  is_cash_only: boolean;
  cash_warning_msg: string | null;
  is_new_opening?: boolean;
}

// Final Result
export interface FinalResult extends GooglePlace, GeminiRecommendation {
  walking_time_text: string;
  walking_time_value: number;
}

// Terminal Log
export interface TerminalLog {
  id: number;
  text: string;
  timestamp: number;
}

// Supabase Database Types
export interface SearchHistoryRecord {
  id?: string;
  created_at?: string;
  session_id: string;
  address: string;
  lat: number;
  lng: number;
  vibe: string | null;
  price: string | null;
  walk_limit: string;
  no_cash: boolean;
  dietary_restrictions: string[];
  freestyle_prompt: string | null;
  result_count: number;
}

export interface FavoriteRecord {
  id?: string;
  created_at?: string;
  session_id: string;
  place_id: string;
  place_name: string;
  place_rating: number | null;
  place_address: string | null;
  ai_reason: string | null;
  recommended_dish: string | null;
  walking_time_text: string | null;
  metadata: Record<string, unknown>;
}

export interface AppLogRecord {
  id?: number;
  created_at?: string;
  level: string;
  category: string;
  message: string;
  metadata: Record<string, unknown> | null;
}

