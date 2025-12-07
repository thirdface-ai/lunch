import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateLoadingLogs, decideLunch, Type, PlaceDuration } from './aiService';
import { HungerVibe, PricePoint, DietaryRestriction, GooglePlace, PlaceReview } from '../types';

// Helper to create mock durations map
const createMockDurations = (candidates: GooglePlace[]): Map<string, PlaceDuration> => {
  const map = new Map<string, PlaceDuration>();
  candidates.forEach((c, i) => {
    map.set(c.place_id, { text: `${(i + 1) * 5} mins`, value: (i + 1) * 300 });
  });
  return map;
};

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
    
    // Fallback messages are funny and engaging
    expect(result).toContain('JUDGING RESTAURANTS BY THEIR FONTS...');
    expect(result).toContain('READING REVIEWS WRITTEN AT 3AM...');
    expect(result).toContain('CALCULATING FOOD COMA PROBABILITY...');
  });

  it('returns fallback logs when API returns empty text', async () => {
    mockInvoke.mockResolvedValueOnce({
      data: { text: '' },
      error: null,
    });

    const result = await generateLoadingLogs(null, 'Address');
    
    // When API returns empty text, it triggers error handling which returns fallback logs
    expect(result).toContain('JUDGING RESTAURANTS BY THEIR FONTS...');
    expect(result).toContain('READING REVIEWS WRITTEN AT 3AM...');
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

  it('passes correct model to API for loading logs (light model)', async () => {
    mockInvoke.mockResolvedValueOnce({
      data: { text: JSON.stringify(['LOG']) },
      error: null,
    });

    await generateLoadingLogs(HungerVibe.HEARTY_AND_RICH, 'Address');

    const callBody = mockInvoke.mock.calls[0][1].body;
    // Loading logs use the light model (Sonnet) for cost efficiency
    expect(callBody.model).toBe('anthropic/claude-sonnet-4.5');
  });

  it('handles JSON with trailing commas gracefully', async () => {
    // AI sometimes generates invalid JSON with trailing commas like ["item",]
    const invalidJsonWithTrailingComma = '["LOG 1...", "LOG 2...", "LOG 3...", "LOG 4...", "LOG 5...", "LOG 6...", "LOG 7...", "LOG 8...",]';
    
    mockInvoke.mockResolvedValueOnce({
      data: { text: invalidJsonWithTrailingComma },
      error: null,
    });

    const result = await generateLoadingLogs(HungerVibe.GRAB_AND_GO, 'Berlin');
    
    // Should parse successfully after cleanup
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(8);
    expect(result[0]).toBe('LOG 1...');
  });

  it('handles JSON wrapped in markdown code blocks', async () => {
    const markdownWrapped = '```json\n["LOG 1...", "LOG 2...", "LOG 3...", "LOG 4...", "LOG 5...", "LOG 6...", "LOG 7...", "LOG 8..."]\n```';
    
    mockInvoke.mockResolvedValueOnce({
      data: { text: markdownWrapped },
      error: null,
    });

    const result = await generateLoadingLogs(HungerVibe.LIGHT_AND_CLEAN, 'Berlin');
    
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(8);
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
      createMockDurations(mockCandidates),
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
      createMockDurations(mockCandidates),
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
      createMockDurations(mockCandidates),
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
      createMockDurations(mockCandidates),
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
      createMockDurations(mockCandidates),
      HungerVibe.LIGHT_AND_CLEAN,
      null,
      false,
      'Address',
      [DietaryRestriction.VEGAN, DietaryRestriction.GLUTEN_FREE],
      undefined
    );

    const callBody = mockInvoke.mock.calls[0][1].body;
    // System instruction includes dietary info in the CONTEXT section
    expect(callBody.config.systemInstruction).toContain('Dietary');
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
      createMockDurations(mockCandidates),
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
      createMockDurations(mockCandidates),
      HungerVibe.SPICY_AND_BOLD,
      PricePoint.COMPANY_CARD,
      true, // noCash
      'Berlin',
      [],
      undefined
    );

    const callBody = mockInvoke.mock.calls[0][1].body;
    // System instruction includes card payment requirement
    expect(callBody.config.systemInstruction).toContain('REQUIRE: Card payment');
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
      createMockDurations(candidatesWithDetails),
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
        createMockDurations(minimalCandidates),
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
      createMockDurations(mockCandidates),
      HungerVibe.GRAB_AND_GO,
      null,
      false,
      'Berlin',
      [],
      undefined
    );

    const callBody = mockInvoke.mock.calls[0][1].body;
    expect(callBody.model).toBe('anthropic/claude-opus-4.5');
  });

  it('limits reviews to 5 per place (Google API max)', async () => {
    const manyReviews: PlaceReview[] = Array.from({ length: 10 }, (_, i) => ({
      text: `Review ${i + 1}`,
      rating: 5,
      relativeTime: `${i + 1} weeks ago`,
    }));

    const candidateWithManyReviews: GooglePlace[] = [
      {
        place_id: 'many-reviews',
        name: 'Restaurant with Many Reviews',
        rating: 4.5,
        user_ratings_total: 500,
        reviews: manyReviews,
      },
    ];

    mockInvoke.mockResolvedValueOnce({
      data: { text: JSON.stringify([]) },
      error: null,
    });

    await decideLunch(
      candidateWithManyReviews,
      createMockDurations(candidateWithManyReviews),
      null,
      null,
      false,
      'Berlin',
      [],
      undefined
    );

    const callBody = mockInvoke.mock.calls[0][1].body;
    const payload = JSON.parse(callBody.contents.match(/\[[\s\S]*\]/)?.[0] || '[]');
    
    // Should only include up to 5 reviews (Google's max)
    if (payload.length > 0 && payload[0].reviews) {
      expect(payload[0].reviews.length).toBeLessThanOrEqual(5);
    }
  });

  it('removes duplicate recommendations by place_id', async () => {
    const duplicateRecommendations = [
      {
        place_id: 'place-1',
        ai_reason: 'First recommendation',
        recommended_dish: 'Dish 1',
        is_cash_only: false,
      },
      {
        place_id: 'place-1', // Duplicate
        ai_reason: 'Duplicate recommendation',
        recommended_dish: 'Dish 1 again',
        is_cash_only: false,
      },
      {
        place_id: 'place-2',
        ai_reason: 'Second recommendation',
        recommended_dish: 'Dish 2',
        is_cash_only: false,
      },
    ];

    mockInvoke.mockResolvedValueOnce({
      data: { text: JSON.stringify(duplicateRecommendations) },
      error: null,
    });

    const result = await decideLunch(
      mockCandidates,
      createMockDurations(mockCandidates),
      null,
      null,
      false,
      'Berlin',
      [],
      undefined
    );

    // Should deduplicate to 2 unique places
    const placeIds = result.map(r => r.place_id);
    const uniquePlaceIds = [...new Set(placeIds)];
    expect(placeIds.length).toBe(uniquePlaceIds.length);
  });

  it('handles newlyOpenedOnly filter flag', async () => {
    mockInvoke.mockResolvedValueOnce({
      data: { text: JSON.stringify([]) },
      error: null,
    });

    await decideLunch(
      mockCandidates,
      createMockDurations(mockCandidates),
      null,
      null,
      false,
      'Berlin',
      [],
      undefined,
      true, // newlyOpenedOnly
      false
    );

    const callBody = mockInvoke.mock.calls[0][1].body;
    expect(callBody.config.systemInstruction).toContain('Fresh drops only');
  });

  it('handles popularOnly filter flag', async () => {
    mockInvoke.mockResolvedValueOnce({
      data: { text: JSON.stringify([]) },
      error: null,
    });

    await decideLunch(
      mockCandidates,
      createMockDurations(mockCandidates),
      null,
      null,
      false,
      'Berlin',
      [],
      undefined,
      false,
      true // popularOnly
    );

    const callBody = mockInvoke.mock.calls[0][1].body;
    expect(callBody.config.systemInstruction).toContain('Trending spots');
  });

  it('returns empty array when no candidates provided', async () => {
    const result = await decideLunch(
      [],
      new Map(),
      null,
      null,
      false,
      'Berlin',
      [],
      undefined
    );

    expect(result).toEqual([]);
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it('calculates is_fresh_drop correctly for new places', async () => {
    const newPlace: GooglePlace = {
      place_id: 'new-place',
      name: 'Brand New Restaurant',
      rating: 4.5,
      user_ratings_total: 30, // Under 80 threshold
      reviews: [
        { text: 'Great new spot!', rating: 5, relativeTime: '1 week ago' },
        { text: 'Just opened!', rating: 5, relativeTime: '2 weeks ago' },
      ],
    };

    mockInvoke.mockResolvedValueOnce({
      data: { text: JSON.stringify([]) },
      error: null,
    });

    await decideLunch(
      [newPlace],
      createMockDurations([newPlace]),
      null,
      null,
      false,
      'Berlin',
      [],
      undefined
    );

    const callBody = mockInvoke.mock.calls[0][1].body;
    // The payload should mark this as fresh_drop
    expect(callBody.contents).toContain('is_fresh_drop');
  });

  it('handles JSON with trailing commas gracefully', async () => {
    // AI sometimes generates invalid JSON with trailing commas
    const invalidJsonWithTrailingComma = '[{"place_id":"place-1","ai_reason":"Great food","recommended_dish":"Pizza","is_cash_only":false,},]';
    
    mockInvoke.mockResolvedValueOnce({
      data: { text: invalidJsonWithTrailingComma },
      error: null,
    });

    const result = await decideLunch(
      mockCandidates,
      createMockDurations(mockCandidates),
      null,
      null,
      false,
      'Berlin',
      [],
      undefined
    );

    // Should parse successfully after cleanup
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(1);
    expect(result[0].place_id).toBe('place-1');
  });
});
