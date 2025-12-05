

export enum AppState {
  INPUT = 'INPUT',
  PROCESSING = 'PROCESSING',
  RESULTS = 'RESULTS',
  ERROR = 'ERROR'
}

export enum TransportMode {
  WALK = 'WALK',
  DELIVERY = 'DELIVERY'
}

export enum ThemeMode {
  LIGHT = 'light',
  DARK = 'dark'
}

export enum HungerVibe {
  GRAB_AND_GO = 'Grab & Go',
  LIGHT_AND_CLEAN = 'Light & Clean',
  HEARTY_AND_RICH = 'Hearty & Rich',
  SPICY_AND_BOLD = 'Spicy & Bold',
  VIEW_AND_VIBE = 'View & Vibe',
  AUTHENTIC_AND_CLASSIC = 'Authentic & Classic',
}

export enum PricePoint {
  INTERN = 'Bootstrapped',
  SENIOR = 'Series A',
  COMPANY_CARD = 'Company Card'
}

export enum WalkLimit {
  FIVE_MIN = '5 min',
  FIFTEEN_MIN = '15 min',
  DOESNT_MATTER = '30 min'
}

export enum DietaryRestriction {
  GLUTEN_FREE = 'Gluten-Free',
  VEGAN = 'Vegan',
  VEGETARIAN = 'Vegetarian',
}

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

export interface GooglePlace {
  place_id: string;
  name: string;
  rating?: number;
  user_ratings_total?: number;
  vicinity?: string;
  geometry?: {
    location: any; // google.maps.LatLng
  };
  types?: string[];
  price_level?: number;
  reviews?: any[]; // For Gemini analysis
  editorial_summary?: { overview: string }; // Rich vibe context
  website?: string;
  formatted_phone_number?: string;
  opening_hours?: { 
    open_now: boolean;
    weekday_text?: string[];
  };
  // New hard data fields for better decisions
  payment_options?: { accepts_credit_cards?: boolean; accepts_cash_only?: boolean; accepts_nfc?: boolean };
  serves_vegetarian_food?: boolean;
  serves_wine?: boolean;
  serves_beer?: boolean;
  serves_breakfast?: boolean;
  serves_lunch?: boolean;
  takeout?: boolean;
  dine_in?: boolean;
}

export interface GeminiRecommendation {
  place_id: string;
  ai_reason: string;
  recommended_dish: string;
  is_cash_only: boolean;
  cash_warning_msg: string | null;
  is_new_opening?: boolean;
}

export interface FinalResult extends GooglePlace, GeminiRecommendation {
  walking_time_text: string;
  walking_time_value: number; // seconds
}

export interface TerminalLog {
  id: number;
  text: string;
  timestamp: number;
}