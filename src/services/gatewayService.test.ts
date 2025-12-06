import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateLoadingLogs, decideLunch } from './gatewayService';
import { HungerVibe, PricePoint, DietaryRestriction, GooglePlace, PlaceReview } from '../types';

// Mock fetch for gateway API calls
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock Logger to avoid side effects
vi.mock('../utils/logger', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    aiRequest: vi.fn(),
    aiResponse: vi.fn(),
  },
}));

describe('generateLoadingLogs', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('returns parsed logs on successful API call', async () => {
    const mockLogs = [
      'PARSING BERLIN SECTOR GRID...',
      'ISOLATING RESTAURANTS...',
      'CALCULATING ROUTES...',
      'FINALIZING SELECTION...',
      'LOG 5...',
      'LOG 6...',
      'LOG 7...',
      'LOG 8...',
    ];

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ text: JSON.stringify(mockLogs) }),
    });

    const result = await generateLoadingLogs(HungerVibe.GRAB_AND_GO, 'Berlin, Germany');
    
    expect(result).toEqual(mockLogs);
    expect(mockFetch).toHaveBeenCalledWith('/api/gateway', expect.any(Object));
  });

  it('returns fallback logs when API fails', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: 'Network error' }),
    });

    const result = await generateLoadingLogs(HungerVibe.LIGHT_AND_CLEAN, 'Test Address');
    
    expect(result).toContain('SNIFFING OUT THE GOOD STUFF...');
    expect(result).toContain('JUDGING RESTAURANTS BY THEIR FONTS...');
  });

  it('returns fallback logs when API returns empty text', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ text: '' }),
    });

    const result = await generateLoadingLogs(null, 'Address');
    
    expect(result).toContain('SNIFFING OUT THE GOOD STUFF...');
  });

  it('handles null vibe gracefully', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ text: JSON.stringify(['LOG 1', 'LOG 2', 'LOG 3', 'LOG 4', 'LOG 5', 'LOG 6', 'LOG 7', 'LOG 8']) }),
    });

    const result = await generateLoadingLogs(null, 'Test Address');
    
    expect(Array.isArray(result)).toBe(true);
  });

  it('sends correct schema type to API', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ text: JSON.stringify(['LOG 1', 'LOG 2', 'LOG 3', 'LOG 4', 'LOG 5', 'LOG 6', 'LOG 7', 'LOG 8']) }),
    });

    await generateLoadingLogs(HungerVibe.HEARTY_AND_RICH, 'Address');

    const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(callBody.schemaType).toBe('loading_logs');
  });
});

describe('decideLunch', () => {
  const mockCandidates: GooglePlace[] = [
    {
      place_id: 'place-1',
      name: 'Test Restaurant 1',
      rating: 4.5,
      user_ratings_total: 100,
      price_level: 2,
      editorial_summary: { overview: 'Great Italian food' },
    },
    {
      place_id: 'place-2',
      name: 'Test Restaurant 2',
      rating: 4.2,
      user_ratings_total: 200,
      price_level: 1,
    },
  ];

  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('returns parsed recommendations on success', async () => {
    const mockRecommendations = [
      {
        place_id: 'place-1',
        ai_reason: 'Excellent reviews and good value',
        recommended_dish: 'Margherita Pizza',
        is_cash_only: false,
        is_new_opening: false,
      },
    ];

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ text: JSON.stringify(mockRecommendations) }),
    });

    const result = await decideLunch(
      mockCandidates,
      HungerVibe.HEARTY_AND_RICH,
      PricePoint.PAYING_MYSELF,
      false,
      'Berlin, Germany',
      [],
      undefined
    );

    expect(result).toHaveLength(1);
    expect(result[0].place_id).toBe('place-1');
    expect(result[0].cash_warning_msg).toBeNull();
  });

  it('adds cash warning message when is_cash_only is true', async () => {
    const mockRecommendations = [
      {
        place_id: 'place-1',
        ai_reason: 'Great but cash only',
        recommended_dish: 'Currywurst',
        is_cash_only: true,
        is_new_opening: false,
      },
    ];

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ text: JSON.stringify(mockRecommendations) }),
    });

    const result = await decideLunch(
      mockCandidates,
      HungerVibe.GRAB_AND_GO,
      null,
      false,
      'Berlin',
      [],
      undefined
    );

    expect(result[0].is_cash_only).toBe(true);
    expect(result[0].cash_warning_msg).toBe('Note: This location may be cash-only.');
  });

  it('returns empty array on API error', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: 'API Error' }),
    });

    const result = await decideLunch(
      mockCandidates,
      HungerVibe.LIGHT_AND_CLEAN,
      PricePoint.PAYING_MYSELF,
      true,
      'Test Address',
      [DietaryRestriction.VEGAN],
      undefined
    );

    expect(result).toEqual([]);
  });

  it('returns empty array when API returns empty text', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ text: '' }),
    });

    const result = await decideLunch(
      mockCandidates,
      null,
      null,
      false,
      'Address',
      [],
      'I want sushi'
    );

    expect(result).toEqual([]);
  });

  it('sends correct schema type to API for recommendations', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ text: JSON.stringify([]) }),
    });

    await decideLunch(
      mockCandidates,
      HungerVibe.GRAB_AND_GO,
      null,
      false,
      'Berlin',
      [],
      undefined
    );

    const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(callBody.schemaType).toBe('recommendations');
  });

  it('handles candidates without optional fields', async () => {
    const minimalCandidates: GooglePlace[] = [
      {
        place_id: 'minimal-place',
        name: 'Minimal Restaurant',
      },
    ];

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ text: JSON.stringify([]) }),
    });

    // Should not throw
    await expect(
      decideLunch(
        minimalCandidates,
        HungerVibe.AUTHENTIC_AND_CLASSIC,
        null,
        false,
        'Address',
        [],
        undefined
      )
    ).resolves.toEqual([]);
  });

  it('deduplicates results by place_id', async () => {
    const duplicateRecommendations = [
      {
        place_id: 'place-1',
        ai_reason: 'First mention',
        recommended_dish: 'Dish 1',
        is_cash_only: false,
      },
      {
        place_id: 'place-1', // Duplicate
        ai_reason: 'Second mention',
        recommended_dish: 'Dish 2',
        is_cash_only: false,
      },
      {
        place_id: 'place-2',
        ai_reason: 'Different place',
        recommended_dish: 'Dish 3',
        is_cash_only: false,
      },
    ];

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ text: JSON.stringify(duplicateRecommendations) }),
    });

    const result = await decideLunch(
      mockCandidates,
      HungerVibe.GRAB_AND_GO,
      null,
      false,
      'Berlin',
      [],
      undefined
    );

    expect(result).toHaveLength(2);
    expect(result[0].place_id).toBe('place-1');
    expect(result[1].place_id).toBe('place-2');
  });
});
