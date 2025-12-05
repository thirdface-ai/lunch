import { useState, useEffect, useCallback } from 'react';
import {
  UserPreferences,
  TransportMode,
  HungerVibe,
  WalkLimit,
  ThemeMode,
  DietaryRestriction,
  PricePoint,
} from '../types';

const STORAGE_KEY = 'lunch_preferences';

const DEFAULT_PREFERENCES: UserPreferences = {
  address: '',
  lat: null,
  lng: null,
  mode: TransportMode.WALK,
  vibe: HungerVibe.GRAB_AND_GO,
  price: null,
  walkLimit: WalkLimit.FIFTEEN_MIN,
  noCash: false,
  theme: ThemeMode.LIGHT,
  dietaryRestrictions: [],
  freestylePrompt: '',
};

/**
 * Load preferences from localStorage
 */
const loadFromStorage = (): Partial<UserPreferences> => {
  if (typeof window === 'undefined') return {};
  
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (error) {
    console.warn('Failed to load preferences from localStorage:', error);
  }
  return {};
};

/**
 * Save preferences to localStorage
 */
const saveToStorage = (preferences: UserPreferences): void => {
  if (typeof window === 'undefined') return;
  
  try {
    // Only persist non-sensitive, reusable preferences
    const toStore = {
      mode: preferences.mode,
      vibe: preferences.vibe,
      price: preferences.price,
      walkLimit: preferences.walkLimit,
      noCash: preferences.noCash,
      theme: preferences.theme,
      dietaryRestrictions: preferences.dietaryRestrictions,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toStore));
  } catch (error) {
    console.warn('Failed to save preferences to localStorage:', error);
  }
};

/**
 * Custom hook for managing user preferences with localStorage persistence
 */
export const usePreferences = () => {
  const [preferences, setPreferencesState] = useState<UserPreferences>(() => ({
    ...DEFAULT_PREFERENCES,
    ...loadFromStorage(),
  }));

  // Persist to localStorage when preferences change
  useEffect(() => {
    saveToStorage(preferences);
  }, [preferences]);

  // Apply theme to document
  useEffect(() => {
    if (preferences.theme === ThemeMode.DARK) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [preferences.theme]);

  // Update preferences
  const setPreferences = useCallback((
    updater: UserPreferences | ((prev: UserPreferences) => UserPreferences)
  ) => {
    setPreferencesState(updater);
  }, []);

  // Update a single preference field
  const updatePreference = useCallback(<K extends keyof UserPreferences>(
    key: K,
    value: UserPreferences[K]
  ) => {
    setPreferencesState(prev => ({ ...prev, [key]: value }));
  }, []);

  // Set location
  const setLocation = useCallback((address: string, lat: number, lng: number) => {
    setPreferencesState(prev => ({ ...prev, address, lat, lng }));
  }, []);

  // Toggle theme
  const toggleTheme = useCallback(() => {
    setPreferencesState(prev => ({
      ...prev,
      theme: prev.theme === ThemeMode.LIGHT ? ThemeMode.DARK : ThemeMode.LIGHT,
    }));
  }, []);

  // Toggle dietary restriction
  const toggleDietaryRestriction = useCallback((restriction: DietaryRestriction) => {
    setPreferencesState(prev => {
      const current = prev.dietaryRestrictions;
      const newRestrictions = current.includes(restriction)
        ? current.filter(r => r !== restriction)
        : [...current, restriction];
      return { ...prev, dietaryRestrictions: newRestrictions };
    });
  }, []);

  // Reset to defaults
  const resetPreferences = useCallback(() => {
    setPreferencesState(DEFAULT_PREFERENCES);
    if (typeof window !== 'undefined') {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  // Check if preferences are valid for search
  const isValidForSearch = preferences.lat !== null && preferences.lng !== null;

  return {
    preferences,
    setPreferences,
    updatePreference,
    setLocation,
    toggleTheme,
    toggleDietaryRestriction,
    resetPreferences,
    isValidForSearch,
  };
};

export default usePreferences;

