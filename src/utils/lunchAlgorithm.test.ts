import { describe, it, expect } from 'vitest';
import {
  getSearchQueriesForVibe,
  calculateCandidateScore,
  shuffleArray,
  getWalkConfig,
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
    it('gives high score for budget match with INTERN price point', () => {
      const cheapPlace = createMockPlace({ price_level: 1 });
      const expensivePlace = createMockPlace({ price_level: 4 });
      
      const cheapScore = calculateCandidateScore(cheapPlace, PricePoint.INTERN, 300, 900);
      const expensiveScore = calculateCandidateScore(expensivePlace, PricePoint.INTERN, 300, 900);
      
      expect(cheapScore).toBeGreaterThan(expensiveScore);
    });

    it('gives high score for mid-range match with SENIOR price point', () => {
      const midRangePlace = createMockPlace({ price_level: 2 });
      const cheapPlace = createMockPlace({ price_level: 1 });
      
      const midScore = calculateCandidateScore(midRangePlace, PricePoint.SENIOR, 300, 900);
      const cheapScore = calculateCandidateScore(cheapPlace, PricePoint.SENIOR, 300, 900);
      
      expect(midScore).toBeGreaterThan(cheapScore);
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

