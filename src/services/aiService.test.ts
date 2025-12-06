import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateLoadingLogs, decideLunch, Type } from './aiService';
import { HungerVibe, PricePoint, DietaryRestriction, GooglePlace, PlaceReview } from '../types';

// Mock the supabase functions invoke
const mockInvoke = vi.fn();

vi.mock('../lib/supabase', () => ({
  supabase: {
    functions: {
      invoke: (...args: unknown[]) => mockInvoke(...args),
    },
  },
}));

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
    mockInvoke.mockReset();
  });

  it('returns parsed logs on successful API call', async () => {
    const mockLogs = [
      'PARSING BERLIN SECTOR GRID...',
      'ISOLATING RESTAURANTS...',
      'CALCULATING ROUTES...',
      'FINALIZING SELECTION...',
      'CHECKING REVIEWS...',
      'ANALYZING VIBES...',
      'RANKING OPTIONS...',
      'ALMOST DONE...'
    ];

    mockInvoke.mockResolvedValueOnce({
      data: { text: JSON.stringify(mockLogs) },
      error: null,
    });

    const result = await generateLoadingLogs(HungerVibe.GRAB_AND_GO, 'Berlin, Germany');
    
    expect(result).toEqual(mockLogs);
    expect(mockInvoke).toHaveBeenCalledWith('openrouter-proxy', expect.any(Object));
  });

  it('returns fallback logs when API fails', async () => {
    mockInvoke.mockResolvedValueOnce({
      data: null,
      error: { message: 'Network error' },
    });

    const result = await generateLoadingLogs(HungerVibe.LIGHT_AND_CLEAN, 'Test Address');
    
    expect(result).toContain('SNIFFING OUT THE GOOD STUFF...');
    expect(result).toContain('JUDGING RESTAURANTS BY THEIR FONTS...');
    expect(result).toContain('CALCULATING FOOD COMA PROBABILITY...');
  });

  it('returns fallback logs when API returns empty text', async () => {
    mockInvoke.mockResolvedValueOnce({
      data: { text: '' },
      error: null,
    });

    const result = await generateLoadingLogs(null, 'Address');
    
    // When API returns empty text, it triggers error handling which returns fallback logs
    expect(result).toContain('SNIFFING OUT THE GOOD STUFF...');
    expect(result).toContain('JUDGING RESTAURANTS BY THEIR FONTS...');
    expect(result).toContain('CALCULATING FOOD COMA PROBABILITY...');
  });

  it('handles null vibe gracefully', async () => {
    mockInvoke.mockResolvedValueOnce({
      data: { text: JSON.stringify(['LOG 1', 'LOG 2', 'LOG 3', 'LOG 4']) },
      error: null,
    });

    const result = await generateLoadingLogs(null, 'Test Address');
    
    expect(Array.isArray(result)).toBe(true);
  });

  it('passes correct model to API for loading logs', async () => {
    mockInvoke.mockResolvedValueOnce({
      data: { text: JSON.stringify(['LOG']) },
      error: null,
    });

    await generateLoadingLogs(HungerVibe.HEARTY_AND_RICH, 'Address');

    const callBody = mockInvoke.mock.calls[0][1].body;
    expect(callBody.model).toBe('openrouter/auto');
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
    mockInvoke.mockReset();
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

    mockInvoke.mockResolvedValueOnce({
      data: { text: JSON.stringify(mockRecommendations) },
      error: null,
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

    mockInvoke.mockResolvedValueOnce({
      data: { text: JSON.stringify(mockRecommendations) },
      error: null,
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
    mockInvoke.mockResolvedValueOnce({
      data: null,
      error: { message: 'API Error' },
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
    mockInvoke.mockResolvedValueOnce({
      data: { text: '' },
      error: null,
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
    mockInvoke.mockResolvedValueOnce({
      data: { text: JSON.stringify([]) },
      error: null,
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

    const callBody = mockInvoke.mock.calls[0][1].body;
    expect(callBody.config.systemInstruction).toContain('DIETARY REQUIREMENTS');
    expect(callBody.config.systemInstruction).toContain('Vegan');
    expect(callBody.config.systemInstruction).toContain('Gluten-Free');
  });

  it('includes freestyle prompt in request when provided', async () => {
    mockInvoke.mockResolvedValueOnce({
      data: { text: JSON.stringify([]) },
      error: null,
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

    const callBody = mockInvoke.mock.calls[0][1].body;
    expect(callBody.config.systemInstruction).toContain('I want the best ramen in town');
  });

  it('passes noCash constraint to API', async () => {
    mockInvoke.mockResolvedValueOnce({
      data: { text: JSON.stringify([]) },
      error: null,
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

    const callBody = mockInvoke.mock.calls[0][1].body;
    expect(callBody.config.systemInstruction).toContain('USER REQUIRES CARD PAYMENT');
  });

  it('processes candidate data with reviews correctly for API payload', async () => {
    const reviewsData: PlaceReview[] = [
      { text: 'The Cacio e Pepe is absolutely incredible!', rating: 5, relativeTime: '2 weeks ago' },
      { text: 'Best carbonara in Rome. The truffle pasta is a must-try.', rating: 5, relativeTime: '1 month ago' },
      { text: 'Great wine selection and cozy atmosphere', rating: 4, relativeTime: '3 months ago' },
    ];

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
        reviews: reviewsData,
      },
    ];

    mockInvoke.mockResolvedValueOnce({
      data: { text: JSON.stringify([]) },
      error: null,
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

    const callBody = mockInvoke.mock.calls[0][1].body;
    expect(callBody.contents).toContain('Detailed Restaurant');
    expect(callBody.contents).toContain('Fine Italian dining');
    // Verify reviews are included in the payload
    expect(callBody.contents).toContain('Cacio e Pepe');
    expect(callBody.contents).toContain('carbonara');
  });

  it('handles candidates without optional fields', async () => {
    const minimalCandidates: GooglePlace[] = [
      {
        place_id: 'minimal-place',
        name: 'Minimal Restaurant',
      },
    ];

    mockInvoke.mockResolvedValueOnce({
      data: { text: JSON.stringify([]) },
      error: null,
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

  it('passes correct model to API for deep analysis', async () => {
    mockInvoke.mockResolvedValueOnce({
      data: { text: JSON.stringify([]) },
      error: null,
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

    const callBody = mockInvoke.mock.calls[0][1].body;
    expect(callBody.model).toBe('openrouter/auto');
  });
});
