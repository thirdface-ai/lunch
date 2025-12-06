import { describe, it, expect } from 'vitest';
import {
  getSearchQueriesForVibe,
  calculateCandidateScore,
  shuffleArray,
  getWalkConfig,
  detectCuisineIntent,
  getOpenStatusScore,
  willBeOpenOnArrival,
} from './lunchAlgorithm';
import { HungerVibe, PricePoint, GooglePlace } from '../types';

describe('getSearchQueriesForVibe', () => {
  it('returns default queries when vibe is null', () => {
    const queries = getSearchQueriesForVibe(null);
    expect(queries).toContain('restaurant');
    expect(queries).toContain('lunch');
    expect(queries).toContain('food');
  });

  it('returns grab and go queries for GRAB_AND_GO vibe', () => {
    const queries = getSearchQueriesForVibe(HungerVibe.GRAB_AND_GO);
    expect(queries).toContain('quick bites');
    expect(queries).toContain('takeout food');
    expect(queries).toContain('restaurant');
  });

  it('returns healthy options for LIGHT_AND_CLEAN vibe', () => {
    const queries = getSearchQueriesForVibe(HungerVibe.LIGHT_AND_CLEAN);
    expect(queries).toContain('healthy restaurant');
    expect(queries).toContain('salad bar');
    expect(queries).toContain('sushi');
  });

  it('returns comfort food for HEARTY_AND_RICH vibe', () => {
    const queries = getSearchQueriesForVibe(HungerVibe.HEARTY_AND_RICH);
    expect(queries).toContain('comfort food');
    expect(queries).toContain('ramen shop');
    expect(queries).toContain('burger joint');
  });

  it('returns spicy options for SPICY_AND_BOLD vibe', () => {
    const queries = getSearchQueriesForVibe(HungerVibe.SPICY_AND_BOLD);
    expect(queries).toContain('spicy food');
    expect(queries).toContain('thai restaurant');
    expect(queries).toContain('indian restaurant');
  });

  it('returns scenic options for VIEW_AND_VIBE vibe', () => {
    const queries = getSearchQueriesForVibe(HungerVibe.VIEW_AND_VIBE);
    expect(queries).toContain('restaurant with a view');
    expect(queries).toContain('rooftop restaurant');
  });

  it('returns classic options for AUTHENTIC_AND_CLASSIC vibe', () => {
    const queries = getSearchQueriesForVibe(HungerVibe.AUTHENTIC_AND_CLASSIC);
    expect(queries).toContain('classic diner');
    expect(queries).toContain('traditional cuisine');
  });

  it('always includes restaurant in queries', () => {
    Object.values(HungerVibe).forEach(vibe => {
      const queries = getSearchQueriesForVibe(vibe);
      expect(queries).toContain('restaurant');
    });
  });
});

describe('calculateCandidateScore', () => {
  const createMockPlace = (overrides: Partial<GooglePlace> = {}): GooglePlace => ({
    place_id: 'test-place-id',
    name: 'Test Restaurant',
    rating: 4.0,
    user_ratings_total: 100,
    price_level: 2,
    ...overrides,
  });

  describe('proximity scoring', () => {
    it('gives higher score to closer places', () => {
      const place = createMockPlace();
      const maxDuration = 900; // 15 minutes
      
      const closeScore = calculateCandidateScore(place, null, 300, maxDuration); // 5 min
      const farScore = calculateCandidateScore(place, null, 800, maxDuration); // ~13 min
      
      expect(closeScore).toBeGreaterThan(farScore);
    });

    it('handles undefined duration', () => {
      const place = createMockPlace();
      const score = calculateCandidateScore(place, null, undefined, 900);
      expect(score).toBeDefined();
      expect(typeof score).toBe('number');
    });
  });

  describe('price matching', () => {
    it('gives high score for budget match with PAYING_MYSELF price point', () => {
      const cheapPlace = createMockPlace({ price_level: 1 });
      const expensivePlace = createMockPlace({ price_level: 4 });
      
      const cheapScore = calculateCandidateScore(cheapPlace, PricePoint.PAYING_MYSELF, 300, 900);
      const expensiveScore = calculateCandidateScore(expensivePlace, PricePoint.PAYING_MYSELF, 300, 900);
      
      expect(cheapScore).toBeGreaterThan(expensiveScore);
    });

    it('gives high score for mid-range with PAYING_MYSELF price point', () => {
      const midRangePlace = createMockPlace({ price_level: 2 });
      const expensivePlace = createMockPlace({ price_level: 4 });
      
      const midScore = calculateCandidateScore(midRangePlace, PricePoint.PAYING_MYSELF, 300, 900);
      const expensiveScore = calculateCandidateScore(expensivePlace, PricePoint.PAYING_MYSELF, 300, 900);
      
      expect(midScore).toBeGreaterThan(expensiveScore);
    });

    it('gives high score for expensive match with COMPANY_CARD price point', () => {
      const expensivePlace = createMockPlace({ price_level: 4 });
      const cheapPlace = createMockPlace({ price_level: 1 });
      
      const expensiveScore = calculateCandidateScore(expensivePlace, PricePoint.COMPANY_CARD, 300, 900);
      const cheapScore = calculateCandidateScore(cheapPlace, PricePoint.COMPANY_CARD, 300, 900);
      
      expect(expensiveScore).toBeGreaterThan(cheapScore);
    });

    it('gives neutral score when no price preference', () => {
      const place = createMockPlace();
      const score = calculateCandidateScore(place, null, 300, 900);
      expect(score).toBeGreaterThan(0);
    });
  });

  describe('hidden gem bonus', () => {
    it('gives bonus to high-rated places with moderate reviews', () => {
      const hiddenGem = createMockPlace({
        rating: 4.5,
        user_ratings_total: 200,
      });
      const popularPlace = createMockPlace({
        rating: 4.5,
        user_ratings_total: 1000,
      });
      
      const gemScore = calculateCandidateScore(hiddenGem, null, 300, 900);
      const popularScore = calculateCandidateScore(popularPlace, null, 300, 900);
      
      expect(gemScore).toBeGreaterThan(popularScore);
    });
  });

  describe('fresh drop bonus', () => {
    it('gives bonus to new places with good ratings', () => {
      const newPlace = createMockPlace({
        rating: 4.2,
        user_ratings_total: 25,
      });
      const establishedPlace = createMockPlace({
        rating: 4.2,
        user_ratings_total: 100,
      });
      
      const newScore = calculateCandidateScore(newPlace, null, 300, 900);
      const establishedScore = calculateCandidateScore(establishedPlace, null, 300, 900);
      
      expect(newScore).toBeGreaterThan(establishedScore);
    });
  });

  describe('rating contribution', () => {
    it('higher rated places get higher scores', () => {
      const highRated = createMockPlace({ rating: 4.8, user_ratings_total: 500 });
      const lowRated = createMockPlace({ rating: 3.2, user_ratings_total: 500 });
      
      const highScore = calculateCandidateScore(highRated, null, 300, 900);
      const lowScore = calculateCandidateScore(lowRated, null, 300, 900);
      
      expect(highScore).toBeGreaterThan(lowScore);
    });
  });
});

describe('shuffleArray', () => {
  it('returns array of same length', () => {
    const input = [1, 2, 3, 4, 5];
    const result = shuffleArray(input);
    expect(result).toHaveLength(input.length);
  });

  it('contains all original elements', () => {
    const input = [1, 2, 3, 4, 5];
    const result = shuffleArray(input);
    expect(result.sort()).toEqual(input.sort());
  });

  it('does not modify the original array', () => {
    const input = [1, 2, 3, 4, 5];
    const original = [...input];
    shuffleArray(input);
    expect(input).toEqual(original);
  });

  it('handles empty array', () => {
    const result = shuffleArray([]);
    expect(result).toEqual([]);
  });

  it('handles single element array', () => {
    const result = shuffleArray([42]);
    expect(result).toEqual([42]);
  });
});

describe('getWalkConfig', () => {
  it('returns correct config for 5 min walk limit', () => {
    const config = getWalkConfig('5 min');
    expect(config.radius).toBe(1000);
    expect(config.maxDurationSeconds).toBe(300);
  });

  it('returns correct config for 15 min walk limit', () => {
    const config = getWalkConfig('15 min');
    expect(config.radius).toBe(2500);
    expect(config.maxDurationSeconds).toBe(900);
  });

  it('returns correct config for 30 min walk limit', () => {
    const config = getWalkConfig('30 min');
    expect(config.radius).toBe(5000);
    expect(config.maxDurationSeconds).toBe(2400);
  });

  it('returns default (30 min) config for unknown value', () => {
    const config = getWalkConfig('unknown');
    expect(config.radius).toBe(5000);
    expect(config.maxDurationSeconds).toBe(2400);
  });
});

describe('detectCuisineIntent', () => {
  describe('specific cuisine detection', () => {
    it('detects ramen as cuisine-specific', () => {
      const result = detectCuisineIntent('I want ramen');
      expect(result.isCuisineSpecific).toBe(true);
      expect(result.cuisineType).toBe('ramen');
      expect(result.searchQueries).toContain('ramen');
    });

    it('detects sushi as cuisine-specific', () => {
      const result = detectCuisineIntent('sushi for lunch');
      expect(result.isCuisineSpecific).toBe(true);
      expect(result.cuisineType).toBe('sushi');
    });

    it('detects pizza as cuisine-specific', () => {
      const result = detectCuisineIntent('best pizza nearby');
      expect(result.isCuisineSpecific).toBe(true);
      expect(result.cuisineType).toBe('pizza');
    });

    it('detects burger as cuisine-specific', () => {
      const result = detectCuisineIntent('burger place');
      expect(result.isCuisineSpecific).toBe(true);
      expect(result.cuisineType).toBe('burger');
    });

    it('detects thai as cuisine-specific', () => {
      const result = detectCuisineIntent('thai food');
      expect(result.isCuisineSpecific).toBe(true);
      expect(result.cuisineType).toBe('thai');
    });

    it('detects indian as cuisine-specific', () => {
      const result = detectCuisineIntent('indian curry');
      expect(result.isCuisineSpecific).toBe(true);
      // Could be 'indian' or 'curry' depending on order
      expect(result.isCuisineSpecific).toBe(true);
    });

    it('detects korean as cuisine-specific', () => {
      const result = detectCuisineIntent('korean bbq');
      expect(result.isCuisineSpecific).toBe(true);
      expect(result.cuisineType).toBe('korean');
    });

    it('detects vietnamese as cuisine-specific', () => {
      const result = detectCuisineIntent('vietnamese pho');
      expect(result.isCuisineSpecific).toBe(true);
      // Could be 'vietnamese' or 'pho'
      expect(result.isCuisineSpecific).toBe(true);
    });

    it('detects mexican as cuisine-specific', () => {
      const result = detectCuisineIntent('mexican tacos');
      expect(result.isCuisineSpecific).toBe(true);
    });

    it('detects vegan as cuisine-specific', () => {
      const result = detectCuisineIntent('vegan restaurant');
      expect(result.isCuisineSpecific).toBe(true);
      expect(result.cuisineType).toBe('vegan');
    });
  });

  describe('non-specific queries', () => {
    it('returns non-specific for generic query', () => {
      const result = detectCuisineIntent('something good');
      expect(result.isCuisineSpecific).toBe(false);
      expect(result.cuisineType).toBeUndefined();
    });

    it('returns non-specific for empty query', () => {
      const result = detectCuisineIntent('');
      expect(result.isCuisineSpecific).toBe(false);
    });

    it('returns non-specific for whitespace query', () => {
      const result = detectCuisineIntent('   ');
      expect(result.isCuisineSpecific).toBe(false);
    });

    it('returns non-specific for mood-based query', () => {
      const result = detectCuisineIntent('something fancy');
      expect(result.isCuisineSpecific).toBe(false);
    });

    it('returns non-specific for location query', () => {
      const result = detectCuisineIntent('nearby restaurant');
      expect(result.isCuisineSpecific).toBe(false);
    });
  });

  describe('search queries generation', () => {
    it('generates multiple search queries for cuisine', () => {
      const result = detectCuisineIntent('ramen');
      expect(result.searchQueries.length).toBeGreaterThan(1);
      expect(result.searchQueries).toContain('ramen');
    });

    it('includes original query for non-specific searches', () => {
      const result = detectCuisineIntent('hidden gem');
      expect(result.searchQueries).toContain('hidden gem');
    });

    it('includes restaurant fallback for non-specific searches', () => {
      const result = detectCuisineIntent('something tasty');
      expect(result.searchQueries).toContain('restaurant');
    });
  });

  describe('case insensitivity', () => {
    it('detects cuisine regardless of case', () => {
      expect(detectCuisineIntent('RAMEN').isCuisineSpecific).toBe(true);
      expect(detectCuisineIntent('Sushi').isCuisineSpecific).toBe(true);
      expect(detectCuisineIntent('PIZZA').isCuisineSpecific).toBe(true);
    });
  });
});

describe('getOpenStatusScore', () => {
  const createMockPlaceWithHours = (openNow: boolean, weekdayText?: string[]): GooglePlace => ({
    place_id: 'test-place',
    name: 'Test Restaurant',
    opening_hours: {
      open_now: openNow,
      weekday_text: weekdayText,
    },
  });

  it('returns high score for open place', () => {
    const place = createMockPlaceWithHours(true);
    const result = getOpenStatusScore(place, 300);
    
    expect(result.status).toBe('open');
    expect(result.score).toBeGreaterThan(0);
  });

  it('returns penalty for closed place', () => {
    const place = createMockPlaceWithHours(false, ['Monday: Closed']);
    const result = getOpenStatusScore(place, 300);
    
    expect(result.status).toBe('closed');
    expect(result.score).toBeLessThan(0);
  });

  it('returns unknown status for place without hours', () => {
    const place: GooglePlace = {
      place_id: 'no-hours',
      name: 'Unknown Hours Place',
    };
    const result = getOpenStatusScore(place, 300);
    
    expect(result.status).toBe('unknown');
  });
});

describe('willBeOpenOnArrival', () => {
  it('returns true for currently open place', () => {
    const place: GooglePlace = {
      place_id: 'test',
      name: 'Test',
      opening_hours: { open_now: true },
    };
    
    expect(willBeOpenOnArrival(place, 300)).toBe(true);
  });

  it('returns true for place without opening hours', () => {
    const place: GooglePlace = {
      place_id: 'test',
      name: 'Test',
    };
    
    expect(willBeOpenOnArrival(place, 300)).toBe(true);
  });

  it('returns true for place without opening_hours property', () => {
    const place: GooglePlace = {
      place_id: 'test',
      name: 'Test',
    };
    
    expect(willBeOpenOnArrival(place, undefined)).toBe(true);
  });
});

