import { describe, it, expect, vi, beforeEach } from 'vitest';
import SupabaseService from './supabaseService';
import { GooglePlace } from '../types';

// Mock supabase client
const mockSelect = vi.fn();
const mockInsert = vi.fn();
const mockUpsert = vi.fn();
const mockEq = vi.fn();
const mockIn = vi.fn();
const mockGt = vi.fn();
const mockOrder = vi.fn();
const mockLimit = vi.fn();

const mockFrom = vi.fn(() => ({
  select: mockSelect,
  insert: mockInsert,
  upsert: mockUpsert,
}));

mockSelect.mockReturnValue({
  eq: mockEq,
  in: mockIn,
  gt: mockGt,
  order: mockOrder,
  limit: mockLimit,
});

mockEq.mockReturnValue({
  eq: mockEq,
  in: mockIn,
  gt: mockGt,
  order: mockOrder,
  limit: mockLimit,
});

mockIn.mockReturnValue({
  gt: mockGt,
  eq: mockEq,
});

mockGt.mockReturnValue({
  then: vi.fn((resolve) => resolve({ data: [], error: null })),
});

mockOrder.mockReturnValue({
  limit: mockLimit,
});

mockLimit.mockReturnValue({
  then: vi.fn((resolve) => resolve({ data: [], error: null })),
});

mockInsert.mockResolvedValue({ error: null });
mockUpsert.mockResolvedValue({ error: null });

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: mockFrom,
  },
  getSessionId: () => 'test-session-id',
}));

// Mock Logger
vi.mock('../utils/logger', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Helper to create mock place
const createMockPlace = (id: string): GooglePlace => ({
  place_id: id,
  name: `Test Restaurant ${id}`,
  rating: 4.5,
  user_ratings_total: 100,
  geometry: {
    location: { lat: 52.52, lng: 13.405 },
  },
});

describe('SupabaseService - Cache Methods', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getCachedPlaces', () => {
    it('returns empty map for empty input', async () => {
      const result = await SupabaseService.getCachedPlaces([]);
      expect(result.size).toBe(0);
      expect(mockFrom).not.toHaveBeenCalled();
    });

    it('queries Supabase with correct parameters', async () => {
      const placeIds = ['place-1', 'place-2'];
      
      // Setup mock to return data
      mockGt.mockReturnValueOnce(
        Promise.resolve({
          data: [
            { place_id: 'place-1', data: createMockPlace('place-1') },
          ],
          error: null,
        })
      );

      await SupabaseService.getCachedPlaces(placeIds);

      expect(mockFrom).toHaveBeenCalledWith('places_cache');
      expect(mockSelect).toHaveBeenCalledWith('place_id, data');
      expect(mockIn).toHaveBeenCalledWith('place_id', placeIds);
    });

    it('returns map of cached places', async () => {
      const mockPlaces = [
        { place_id: 'place-1', data: createMockPlace('place-1') },
        { place_id: 'place-2', data: createMockPlace('place-2') },
      ];

      mockGt.mockReturnValueOnce(
        Promise.resolve({ data: mockPlaces, error: null })
      );

      const result = await SupabaseService.getCachedPlaces(['place-1', 'place-2']);

      expect(result.size).toBe(2);
      expect(result.get('place-1')?.name).toBe('Test Restaurant place-1');
      expect(result.get('place-2')?.name).toBe('Test Restaurant place-2');
    });

    it('returns empty map on error', async () => {
      mockGt.mockReturnValueOnce(
        Promise.resolve({ data: null, error: { message: 'Database error' } })
      );

      const result = await SupabaseService.getCachedPlaces(['place-1']);

      expect(result.size).toBe(0);
    });

    it('handles exceptions gracefully', async () => {
      mockGt.mockRejectedValueOnce(new Error('Network error'));

      const result = await SupabaseService.getCachedPlaces(['place-1']);

      expect(result.size).toBe(0);
    });
  });

  describe('cachePlaces', () => {
    it('does nothing for empty input', async () => {
      await SupabaseService.cachePlaces([]);
      expect(mockFrom).not.toHaveBeenCalled();
    });

    it('upserts places to Supabase', async () => {
      const places = [createMockPlace('place-1'), createMockPlace('place-2')];

      await SupabaseService.cachePlaces(places);

      expect(mockFrom).toHaveBeenCalledWith('places_cache');
      expect(mockUpsert).toHaveBeenCalled();
      
      const upsertCall = mockUpsert.mock.calls[0];
      expect(upsertCall[0]).toHaveLength(2);
      expect(upsertCall[0][0].place_id).toBe('place-1');
      expect(upsertCall[0][1].place_id).toBe('place-2');
      expect(upsertCall[1]).toEqual({ onConflict: 'place_id' });
    });

    it('includes expiration timestamp', async () => {
      const places = [createMockPlace('place-1')];

      await SupabaseService.cachePlaces(places);

      const upsertCall = mockUpsert.mock.calls[0];
      expect(upsertCall[0][0].expires_at).toBeDefined();
      
      // Should be ~7 days from now
      const expiresAt = new Date(upsertCall[0][0].expires_at);
      const now = new Date();
      const diffDays = (expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
      expect(diffDays).toBeCloseTo(7, 0);
    });

    it('extracts lat/lng from geometry', async () => {
      const place = createMockPlace('place-1');
      place.geometry = { location: { lat: 52.123, lng: 13.456 } };

      await SupabaseService.cachePlaces([place]);

      const upsertCall = mockUpsert.mock.calls[0];
      expect(upsertCall[0][0].lat).toBe(52.123);
      expect(upsertCall[0][0].lng).toBe(13.456);
    });

    it('handles places without geometry', async () => {
      const place = createMockPlace('place-1');
      delete place.geometry;

      await SupabaseService.cachePlaces([place]);

      const upsertCall = mockUpsert.mock.calls[0];
      expect(upsertCall[0][0].lat).toBeNull();
      expect(upsertCall[0][0].lng).toBeNull();
    });
  });

  describe('getCachedDistances', () => {
    it('returns empty map for empty input', async () => {
      const result = await SupabaseService.getCachedDistances(52.52, 13.405, []);
      expect(result.size).toBe(0);
    });

    it('rounds origin coordinates to 4 decimal places', async () => {
      mockGt.mockReturnValueOnce(Promise.resolve({ data: [], error: null }));

      await SupabaseService.getCachedDistances(52.123456789, 13.987654321, ['place-1']);

      // Should query with rounded coordinates
      expect(mockEq).toHaveBeenCalledWith('origin_lat', 52.1235);
      expect(mockEq).toHaveBeenCalledWith('origin_lng', 13.9877);
    });

    it('returns map of cached distances', async () => {
      const mockDistances = [
        { place_id: 'place-1', duration_text: '5 mins', duration_value: 300 },
        { place_id: 'place-2', duration_text: '10 mins', duration_value: 600 },
      ];

      mockGt.mockReturnValueOnce(Promise.resolve({ data: mockDistances, error: null }));

      const result = await SupabaseService.getCachedDistances(52.52, 13.405, ['place-1', 'place-2']);

      expect(result.size).toBe(2);
      expect(result.get('place-1')).toEqual({ text: '5 mins', value: 300 });
      expect(result.get('place-2')).toEqual({ text: '10 mins', value: 600 });
    });
  });

  describe('cacheDistances', () => {
    it('does nothing for empty input', async () => {
      await SupabaseService.cacheDistances(52.52, 13.405, new Map());
      expect(mockFrom).not.toHaveBeenCalled();
    });

    it('upserts distances with rounded coordinates', async () => {
      const distances = new Map([
        ['place-1', { text: '5 mins', value: 300 }],
        ['place-2', { text: '10 mins', value: 600 }],
      ]);

      await SupabaseService.cacheDistances(52.123456, 13.654321, distances);

      expect(mockFrom).toHaveBeenCalledWith('distances_cache');
      expect(mockUpsert).toHaveBeenCalled();
      
      const upsertCall = mockUpsert.mock.calls[0];
      expect(upsertCall[0]).toHaveLength(2);
      expect(upsertCall[0][0].origin_lat).toBe(52.1235);
      expect(upsertCall[0][0].origin_lng).toBe(13.6543);
      expect(upsertCall[0][0].place_id).toBe('place-1');
      expect(upsertCall[0][0].duration_text).toBe('5 mins');
      expect(upsertCall[0][0].duration_value).toBe(300);
    });

    it('includes correct unique constraint', async () => {
      const distances = new Map([['place-1', { text: '5 mins', value: 300 }]]);

      await SupabaseService.cacheDistances(52.52, 13.405, distances);

      const upsertCall = mockUpsert.mock.calls[0];
      expect(upsertCall[1]).toEqual({ onConflict: 'origin_lat,origin_lng,place_id' });
    });
  });
});

