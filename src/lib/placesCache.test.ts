import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PlacesCache, DistanceCache, logCacheSummary } from './placesCache';
import { GooglePlace } from '../types';

// Mock Logger to avoid side effects
vi.mock('../utils/logger', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Helper to create mock place
const createMockPlace = (id: string, overrides: Partial<GooglePlace> = {}): GooglePlace => ({
  place_id: id,
  name: `Test Restaurant ${id}`,
  rating: 4.5,
  user_ratings_total: 100,
  ...overrides,
});

describe('PlacesCache', () => {
  beforeEach(() => {
    PlacesCache.clear();
  });

  describe('setPlace and getPlace', () => {
    it('caches and retrieves a place', () => {
      const place = createMockPlace('place-1');
      
      PlacesCache.setPlace('place-1', place);
      const cached = PlacesCache.getPlace('place-1');
      
      expect(cached).toEqual(place);
    });

    it('returns null for uncached place', () => {
      const result = PlacesCache.getPlace('nonexistent');
      expect(result).toBeNull();
    });

    it('preserves all place properties', () => {
      const place = createMockPlace('place-2', {
        price_level: 3,
        types: ['restaurant', 'italian'],
        editorial_summary: { overview: 'Great food' },
        reviews: [{ text: 'Delicious!', rating: 5 }],
        serves_vegetarian_food: true,
        serves_beer: true,
        serves_wine: false,
      });
      
      PlacesCache.setPlace('place-2', place);
      const cached = PlacesCache.getPlace('place-2');
      
      expect(cached?.price_level).toBe(3);
      expect(cached?.types).toEqual(['restaurant', 'italian']);
      expect(cached?.editorial_summary?.overview).toBe('Great food');
      expect(cached?.reviews).toHaveLength(1);
      expect(cached?.serves_vegetarian_food).toBe(true);
    });
  });

  describe('TTL expiration', () => {
    it('returns null for expired place', () => {
      const place = createMockPlace('expiring-place');
      PlacesCache.setPlace('expiring-place', place);
      
      // Fast-forward time by 16 minutes (past 15-min TTL)
      vi.useFakeTimers();
      vi.advanceTimersByTime(16 * 60 * 1000);
      
      const cached = PlacesCache.getPlace('expiring-place');
      expect(cached).toBeNull();
      
      vi.useRealTimers();
    });

    it('returns place within TTL', () => {
      vi.useFakeTimers();
      
      const place = createMockPlace('fresh-place');
      PlacesCache.setPlace('fresh-place', place);
      
      // Fast-forward time by 10 minutes (within 15-min TTL)
      vi.advanceTimersByTime(10 * 60 * 1000);
      
      const cached = PlacesCache.getPlace('fresh-place');
      expect(cached).toEqual(place);
      
      vi.useRealTimers();
    });
  });

  describe('getPlaces (batch)', () => {
    it('returns map of cached places', () => {
      const place1 = createMockPlace('batch-1');
      const place2 = createMockPlace('batch-2');
      
      PlacesCache.setPlace('batch-1', place1);
      PlacesCache.setPlace('batch-2', place2);
      
      const result = PlacesCache.getPlaces(['batch-1', 'batch-2', 'batch-3']);
      
      expect(result.size).toBe(2);
      expect(result.get('batch-1')).toEqual(place1);
      expect(result.get('batch-2')).toEqual(place2);
      expect(result.has('batch-3')).toBe(false);
    });

    it('returns empty map when no places cached', () => {
      const result = PlacesCache.getPlaces(['none-1', 'none-2']);
      expect(result.size).toBe(0);
    });

    it('handles empty input array', () => {
      const result = PlacesCache.getPlaces([]);
      expect(result.size).toBe(0);
    });
  });

  describe('setPlaces (batch)', () => {
    it('caches multiple places at once', () => {
      const places = [
        createMockPlace('multi-1'),
        createMockPlace('multi-2'),
        createMockPlace('multi-3'),
      ];
      
      PlacesCache.setPlaces(places);
      
      expect(PlacesCache.getPlace('multi-1')).toBeDefined();
      expect(PlacesCache.getPlace('multi-2')).toBeDefined();
      expect(PlacesCache.getPlace('multi-3')).toBeDefined();
    });

    it('handles empty array', () => {
      PlacesCache.setPlaces([]);
      const stats = PlacesCache.getStats();
      expect(stats.placeCount).toBe(0);
    });
  });

  describe('getStats', () => {
    it('returns correct cache counts', () => {
      PlacesCache.setPlace('stat-1', createMockPlace('stat-1'));
      PlacesCache.setPlace('stat-2', createMockPlace('stat-2'));
      
      const stats = PlacesCache.getStats();
      
      expect(stats.placeCount).toBe(2);
    });

    it('tracks cache hits and misses', () => {
      PlacesCache.setPlace('tracked', createMockPlace('tracked'));
      
      // This should register 1 hit, 1 miss
      PlacesCache.getPlaces(['tracked', 'not-cached']);
      
      const stats = PlacesCache.getStats();
      expect(stats.placeHits).toBeGreaterThanOrEqual(1);
      expect(stats.placeMisses).toBeGreaterThanOrEqual(1);
    });
  });

  describe('clear', () => {
    it('removes all cached places', () => {
      PlacesCache.setPlace('clear-1', createMockPlace('clear-1'));
      PlacesCache.setPlace('clear-2', createMockPlace('clear-2'));
      
      PlacesCache.clear();
      
      expect(PlacesCache.getPlace('clear-1')).toBeNull();
      expect(PlacesCache.getPlace('clear-2')).toBeNull();
      expect(PlacesCache.getStats().placeCount).toBe(0);
    });
  });
});

describe('DistanceCache', () => {
  beforeEach(() => {
    PlacesCache.clear(); // This also clears distance cache
  });

  describe('set and get', () => {
    it('caches and retrieves a distance', () => {
      DistanceCache.set(52.52, 13.405, 'place-1', { text: '12 mins', value: 720 });
      
      const cached = DistanceCache.get(52.52, 13.405, 'place-1');
      
      expect(cached).toEqual({ text: '12 mins', value: 720 });
    });

    it('returns null for uncached distance', () => {
      const result = DistanceCache.get(52.52, 13.405, 'nonexistent');
      expect(result).toBeNull();
    });

    it('returns null for different origin', () => {
      DistanceCache.set(52.52, 13.405, 'place-1', { text: '12 mins', value: 720 });
      
      // Different origin coordinates
      const cached = DistanceCache.get(52.53, 13.41, 'place-1');
      expect(cached).toBeNull();
    });
  });

  describe('origin precision rounding', () => {
    it('matches same origin coordinates exactly', () => {
      // Set and get with same coordinates
      DistanceCache.set(52.5200, 13.4050, 'place-1', { text: '10 mins', value: 600 });
      const cached = DistanceCache.get(52.5200, 13.4050, 'place-1');
      
      expect(cached).toEqual({ text: '10 mins', value: 600 });
    });

    it('does not match origins beyond precision threshold', () => {
      DistanceCache.set(52.5200, 13.4050, 'place-1', { text: '10 mins', value: 600 });
      
      // Get with significantly different coordinate
      const cached = DistanceCache.get(52.5210, 13.4060, 'place-1');
      
      expect(cached).toBeNull();
    });
  });

  describe('getMany (batch)', () => {
    it('returns map of cached distances', () => {
      DistanceCache.set(52.52, 13.405, 'dist-1', { text: '5 mins', value: 300 });
      DistanceCache.set(52.52, 13.405, 'dist-2', { text: '10 mins', value: 600 });
      
      const result = DistanceCache.getMany(52.52, 13.405, ['dist-1', 'dist-2', 'dist-3']);
      
      expect(result.size).toBe(2);
      expect(result.get('dist-1')).toEqual({ text: '5 mins', value: 300 });
      expect(result.get('dist-2')).toEqual({ text: '10 mins', value: 600 });
      expect(result.has('dist-3')).toBe(false);
    });

    it('returns empty map for uncached distances', () => {
      const result = DistanceCache.getMany(52.52, 13.405, ['none-1', 'none-2']);
      expect(result.size).toBe(0);
    });
  });

  describe('setMany (batch)', () => {
    it('caches multiple distances at once', () => {
      const distances = new Map<string, { text: string; value: number }>();
      distances.set('multi-1', { text: '5 mins', value: 300 });
      distances.set('multi-2', { text: '8 mins', value: 480 });
      
      DistanceCache.setMany(52.52, 13.405, distances);
      
      expect(DistanceCache.get(52.52, 13.405, 'multi-1')).toEqual({ text: '5 mins', value: 300 });
      expect(DistanceCache.get(52.52, 13.405, 'multi-2')).toEqual({ text: '8 mins', value: 480 });
    });
  });
});

describe('Cost tracking', () => {
  beforeEach(() => {
    PlacesCache.clear();
  });

  it('estimates savings correctly for place cache hits', () => {
    // Cache 5 places
    for (let i = 1; i <= 5; i++) {
      PlacesCache.setPlace(`cost-${i}`, createMockPlace(`cost-${i}`));
    }
    
    // Get 5 cached places (should be 5 hits)
    PlacesCache.getPlaces(['cost-1', 'cost-2', 'cost-3', 'cost-4', 'cost-5']);
    
    const stats = PlacesCache.getStats();
    
    // 5 hits × €0.017 = €0.085
    expect(stats.estimatedSavingsEur).toBeGreaterThanOrEqual(0.08);
    expect(stats.placeHits).toBe(5);
  });

  it('estimates savings correctly for distance cache hits', () => {
    // Cache 10 distances
    for (let i = 1; i <= 10; i++) {
      DistanceCache.set(52.52, 13.405, `dist-cost-${i}`, { text: `${i} mins`, value: i * 60 });
    }
    
    // Get 10 cached distances (should be 10 hits)
    DistanceCache.getMany(52.52, 13.405, Array.from({ length: 10 }, (_, i) => `dist-cost-${i + 1}`));
    
    const stats = PlacesCache.getStats();
    
    // 10 hits × €0.005 = €0.05
    expect(stats.estimatedSavingsEur).toBeGreaterThanOrEqual(0.04);
    expect(stats.distanceHits).toBe(10);
  });
});

describe('logCacheSummary', () => {
  it('does not throw when called', () => {
    PlacesCache.clear();
    PlacesCache.setPlace('test', createMockPlace('test'));
    PlacesCache.getPlaces(['test', 'missing']);
    
    expect(() => logCacheSummary()).not.toThrow();
  });
});

