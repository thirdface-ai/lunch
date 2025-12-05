import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateLoadingLogs, decideLunch, Type } from './geminiService';
import { HungerVibe, PricePoint, DietaryRestriction, GooglePlace } from '../types';

// Mock fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

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

describe('Type enum', () => {
  it('has correct values', () => {
    expect(Type.STRING).toBe('STRING');
    expect(Type.NUMBER).toBe('NUMBER');
    expect(Type.BOOLEAN).toBe('BOOLEAN');
    expect(Type.ARRAY).toBe('ARRAY');
    expect(Type.OBJECT).toBe('OBJECT');
  });
});

describe('generateLoadingLogs', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('returns parsed logs on successful API call', async () => {
    const mockLogs = [
      'PARSING BERLIN SECTOR GRID...',
      'ISOLATING RESTAURANTS...',
      'CALCULATING ROUTES...',
      'FINALIZING SELECTION...'
    ];

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ text: JSON.stringify(mockLogs) }),
    });

    const result = await generateLoadingLogs(HungerVibe.GRAB_AND_GO, 'Berlin, Germany');
    
    expect(result).toEqual(mockLogs);
    expect(mockFetch).toHaveBeenCalledWith('/api/gemini/generate', expect.any(Object));
  });

  it('returns fallback logs when API fails', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    const result = await generateLoadingLogs(HungerVibe.LIGHT_AND_CLEAN, 'Test Address');
    
    expect(result).toContain('OPTIMIZING SEARCH...');
    expect(result).toContain('READING MENUS...');
    expect(result).toContain('CALCULATING ROUTES...');
  });

  it('returns fallback logs when API returns empty text', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ text: '' }),
    });

    const result = await generateLoadingLogs(null, 'Address');
    
    expect(result).toEqual(['PROCESSING...']);
  });

  it('handles null vibe gracefully', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ text: JSON.stringify(['LOG 1', 'LOG 2', 'LOG 3', 'LOG 4']) }),
    });

    const result = await generateLoadingLogs(null, 'Test Address');
    
    expect(Array.isArray(result)).toBe(true);
  });

  it('passes correct model to API', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ text: JSON.stringify(['LOG']) }),
    });

    await generateLoadingLogs(HungerVibe.HEARTY_AND_RICH, 'Address');

    const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(callBody.model).toBe('gemini-2.0-flash');
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
      json: () => Promise.resolve({ text: JSON.stringify(mockRecommendations) }),
    });

    const result = await decideLunch(
      mockCandidates,
      HungerVibe.HEARTY_AND_RICH,
      PricePoint.SENIOR,
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
      json: () => Promise.resolve({ text: JSON.stringify(mockRecommendations) }),
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
    mockFetch.mockRejectedValueOnce(new Error('API Error'));

    const result = await decideLunch(
      mockCandidates,
      HungerVibe.LIGHT_AND_CLEAN,
      PricePoint.INTERN,
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
      json: () => Promise.resolve({ text: '' }),
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

  it('includes dietary restrictions in request when provided', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ text: JSON.stringify([]) }),
    });

    await decideLunch(
      mockCandidates,
      HungerVibe.LIGHT_AND_CLEAN,
      null,
      false,
      'Address',
      [DietaryRestriction.VEGAN, DietaryRestriction.GLUTEN_FREE],
      undefined
    );

    const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(callBody.contents).toContain('DIETARY NEEDS');
    expect(callBody.contents).toContain('Vegan');
    expect(callBody.contents).toContain('Gluten-Free');
  });

  it('includes freestyle prompt in request when provided', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ text: JSON.stringify([]) }),
    });

    await decideLunch(
      mockCandidates,
      null,
      null,
      false,
      'Address',
      [],
      'I want the best ramen in town'
    );

    const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(callBody.contents).toContain('I want the best ramen in town');
  });

  it('passes noCash constraint to API', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ text: JSON.stringify([]) }),
    });

    await decideLunch(
      mockCandidates,
      HungerVibe.SPICY_AND_BOLD,
      PricePoint.COMPANY_CARD,
      true, // noCash
      'Berlin',
      [],
      undefined
    );

    const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(callBody.contents).toContain('USER REQUIRES CASHLESS: true');
  });

  it('processes candidate data correctly for API payload', async () => {
    const candidatesWithDetails: GooglePlace[] = [
      {
        place_id: 'place-detailed',
        name: 'Detailed Restaurant',
        rating: 4.8,
        user_ratings_total: 150,
        price_level: 3,
        types: ['restaurant', 'italian'],
        editorial_summary: { overview: 'Fine Italian dining' },
        website: 'https://example.com',
        serves_vegetarian_food: true,
        serves_beer: true,
        serves_wine: true,
        takeout: false,
        dine_in: true,
        payment_options: {
          accepts_credit_cards: true,
          accepts_cash_only: false,
          accepts_nfc: true,
        },
        reviews: [
          { text: 'Amazing pasta!' },
          { text: 'Great wine selection' },
        ] as google.maps.places.PlaceReview[],
      },
    ];

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ text: JSON.stringify([]) }),
    });

    await decideLunch(
      candidatesWithDetails,
      HungerVibe.VIEW_AND_VIBE,
      PricePoint.COMPANY_CARD,
      false,
      'Rome, Italy',
      [],
      undefined
    );

    const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(callBody.contents).toContain('Detailed Restaurant');
    expect(callBody.contents).toContain('Fine Italian dining');
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
      json: () => Promise.resolve({ text: JSON.stringify([]) }),
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
});

