import { useCallback } from 'react';
import { GooglePlace, HungerVibe, PlaceReview } from '../types';
import { getSearchQueriesForVibe } from '../utils/lunchAlgorithm';
import Logger from '../utils/logger';

// Price level mapping from Google Places API enum to numeric value
const PRICE_LEVEL_MAP: Record<string, number> = {
  'FREE': 1,
  'INEXPENSIVE': 2,
  'MODERATE': 3,
  'EXPENSIVE': 4,
  'VERY_EXPENSIVE': 5,
};

// Food-related place types - STRICT filter to eliminate non-restaurant results
// This prevents stores, services, and other non-food establishments from appearing
const FOOD_TYPES = new Set([
  // Primary food establishments
  'restaurant',
  'cafe',
  'bakery',
  'bar',
  'meal_delivery',
  'meal_takeaway',
  'food',
  // Specific cuisine types from Google Places
  'american_restaurant',
  'asian_restaurant',
  'barbecue_restaurant',
  'brazilian_restaurant',
  'breakfast_restaurant',
  'brunch_restaurant',
  'chinese_restaurant',
  'coffee_shop',
  'deli',
  'fast_food_restaurant',
  'french_restaurant',
  'greek_restaurant',
  'hamburger_restaurant',
  'ice_cream_shop',
  'indian_restaurant',
  'indonesian_restaurant',
  'italian_restaurant',
  'japanese_restaurant',
  'korean_restaurant',
  'lebanese_restaurant',
  'mediterranean_restaurant',
  'mexican_restaurant',
  'middle_eastern_restaurant',
  'pizza_restaurant',
  'ramen_restaurant',
  'sandwich_shop',
  'seafood_restaurant',
  'spanish_restaurant',
  'steak_house',
  'sushi_restaurant',
  'thai_restaurant',
  'turkish_restaurant',
  'vegan_restaurant',
  'vegetarian_restaurant',
  'vietnamese_restaurant',
]);

/**
 * Check if a place is a food establishment based on its types
 */
const isFoodEstablishment = (types: string[] | undefined): boolean => {
  if (!types || types.length === 0) return false;
  return types.some(type => FOOD_TYPES.has(type));
};

// Fields to request from Places API
const PLACE_FIELDS = [
  'id', 'displayName', 'location', 'rating', 'userRatingCount',
  'priceLevel', 'types', 'editorialSummary', 'websiteURI',
  'regularOpeningHours', 'reviews', 'servesVegetarianFood',
  'servesBeer', 'servesWine', 'paymentOptions'
] as const;

interface SearchPlacesParams {
  lat: number;
  lng: number;
  radius: number;
  vibe: HungerVibe | null;
  freestylePrompt?: string;
}

interface SearchPlacesResult {
  places: GooglePlace[];
  uniqueCount: number;
}

/**
 * Extract reviews from Google Places API response
 * The new Places API returns reviews in a different format than legacy
 */
const mapReviews = (reviews: google.maps.places.Review[] | null | undefined): PlaceReview[] => {
  if (!reviews || !Array.isArray(reviews)) return [];
  
  return reviews.map(review => {
    // Handle both new API format (text as object with .text property) and legacy format
    const reviewText = typeof review.text === 'object' && review.text !== null
      ? (review.text as unknown as { text?: string }).text || ''
      : (review.text as unknown as string) || '';
    
    return {
      text: reviewText,
      rating: review.rating ?? undefined,
      relativeTime: review.relativePublishTimeDescription ?? undefined,
      authorName: review.authorAttribution?.displayName ?? undefined,
    };
  }).filter(r => r.text && r.text.length > 0);
};

/**
 * Map Google Places API place to our GooglePlace type
 */
const mapPlace = (p: google.maps.places.Place): GooglePlace => ({
  place_id: p.id || '',
  name: p.displayName || '',
  rating: p.rating ?? undefined,
  user_ratings_total: p.userRatingCount ?? undefined,
  geometry: p.location ? { location: p.location } : undefined,
  types: p.types,
  price_level: p.priceLevel ? PRICE_LEVEL_MAP[p.priceLevel] : undefined,
  editorial_summary: p.editorialSummary ? { overview: (p.editorialSummary as unknown as { text?: string }).text || '' } : undefined,
  website: p.websiteURI ?? undefined,
  opening_hours: p.regularOpeningHours ? {
    open_now: (p.regularOpeningHours as unknown as { openNow?: boolean }).openNow ?? false,
    weekday_text: p.regularOpeningHours.weekdayDescriptions,
  } : undefined,
  // Map reviews from new Places API format to our PlaceReview type
  reviews: mapReviews(p.reviews),
  serves_vegetarian_food: p.servesVegetarianFood ?? undefined,
  serves_beer: p.servesBeer ?? undefined,
  serves_wine: p.servesWine ?? undefined,
  payment_options: p.paymentOptions ? {
    accepts_credit_cards: p.paymentOptions.acceptsCreditCards ?? undefined,
    accepts_cash_only: p.paymentOptions.acceptsCashOnly ?? undefined,
    accepts_nfc: p.paymentOptions.acceptsNFC ?? undefined
  } : undefined
});

/**
 * Custom hook for Google Places API interactions
 */
export const useGooglePlaces = () => {
  /**
   * Search for places based on user preferences
   */
  const searchPlaces = useCallback(async ({
    lat,
    lng,
    radius,
    vibe,
    freestylePrompt,
  }: SearchPlacesParams): Promise<SearchPlacesResult> => {
    if (!window.google) {
      throw new Error('Google Maps API not loaded');
    }

    const { Place } = await google.maps.importLibrary('places') as google.maps.PlacesLibrary;
    const location = new google.maps.LatLng(lat, lng);

    // Determine search queries
    let searchQueries = getSearchQueriesForVibe(vibe);
    
    if (freestylePrompt && freestylePrompt.trim().length > 0) {
      if (!vibe) {
        // Freestyle only: use it as primary, but add "restaurant" as fallback
        searchQueries = [freestylePrompt, 'restaurant', 'cafe'];
      } else {
        searchQueries = [freestylePrompt, ...searchQueries];
      }
    }

    // Search for place IDs
    const searchIdPromises = searchQueries.map(query => {
      const request = {
        textQuery: query,
        locationBias: { center: location, radius },
        maxResultCount: 20,
        fields: ['id']
      };
      return Place.searchByText(request);
    });

    const searchIdResults = await Promise.all(searchIdPromises);
    const allPlaceIds = searchIdResults.flatMap(result => result.places.map(p => p.id));
    const uniquePlaceIds = [...new Set(allPlaceIds)];

    if (uniquePlaceIds.length === 0) {
      return { places: [], uniqueCount: 0 };
    }

    // Fetch detailed place information
    const detailPromises = uniquePlaceIds.map(id => {
      const place = new Place({ id });
      return place.fetchFields({ fields: PLACE_FIELDS as unknown as string[] });
    });

    const detailResults = await Promise.allSettled(detailPromises);
    const allPlaces = detailResults
      .filter((res): res is PromiseFulfilledResult<{ place: google.maps.places.Place }> =>
        res.status === 'fulfilled' && !!res.value?.place
      )
      .map(res => mapPlace(res.value.place));

    // CRITICAL: Filter out non-food establishments (e.g., cap stores, clothing shops)
    // Only keep places that have at least one food-related type
    const foodPlaces = allPlaces.filter(place => isFoodEstablishment(place.types));
    
    Logger.info('SYSTEM', 'Food establishment filter applied', {
      total: allPlaces.length,
      passed: foodPlaces.length,
      filtered: allPlaces.length - foodPlaces.length
    });

    return { places: foodPlaces, uniqueCount: uniquePlaceIds.length };
  }, []);

  /**
   * Fetch details for a single place by ID
   */
  const fetchPlaceDetails = useCallback(async (placeId: string): Promise<GooglePlace | null> => {
    if (!window.google) {
      throw new Error('Google Maps API not loaded');
    }

    try {
      const { Place } = await google.maps.importLibrary('places') as google.maps.PlacesLibrary;
      const place = new Place({ id: placeId });
      await place.fetchFields({ fields: PLACE_FIELDS as unknown as string[] });
      return mapPlace(place);
    } catch (error) {
      console.error('Failed to fetch place details:', error);
      return null;
    }
  }, []);

  return {
    searchPlaces,
    fetchPlaceDetails,
  };
};

export default useGooglePlaces;
