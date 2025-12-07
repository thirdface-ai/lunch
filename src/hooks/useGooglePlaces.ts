import { useCallback } from 'react';
import { GooglePlace, HungerVibe, PlaceReview } from '../types';
import { getSearchQueriesForVibe, detectCuisineIntent, CuisineIntent, filterOutClosedToday } from '../utils/lunchAlgorithm';
import { translateSearchIntent, TranslatedSearchIntent, filterPlacesByQuery } from '../services/aiService';
import { PlacesCache } from '../lib/placesCache';
import { SupabaseService } from '../services/supabaseService';
import Logger from '../utils/logger';

// Minimum cached matches required to skip Text Search API
// If AI finds this many relevant places from cache, we don't need to make new API calls
const MIN_CACHE_MATCHES = 10;

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
  address?: string; // For city-aware search queries
}

interface SearchPlacesResult {
  places: GooglePlace[];
  uniqueCount: number;
  cuisineIntent: CuisineIntent;
  translatedIntent?: TranslatedSearchIntent; // AI-translated search intent
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
    address,
  }: SearchPlacesParams): Promise<SearchPlacesResult> => {
    if (!window.google) {
      throw new Error('Google Maps API not loaded');
    }

    const { Place } = await google.maps.importLibrary('places') as google.maps.PlacesLibrary;
    const location = new google.maps.LatLng(lat, lng);

    // Detect cuisine intent from freestyle prompt (fast, rule-based)
    const cuisineIntent = freestylePrompt 
      ? detectCuisineIntent(freestylePrompt)
      : { isCuisineSpecific: false, searchQueries: [] };

    // Determine search queries based on cuisine intent
    // CRITICAL: Freestyle prompt should DOMINATE when provided - don't dilute with vibe queries
    let searchQueries: string[];
    let translatedIntent: TranslatedSearchIntent | undefined;
    
    if (freestylePrompt && freestylePrompt.trim().length > 0) {
      const trimmedPrompt = freestylePrompt.trim();
      
      if (cuisineIntent.isCuisineSpecific) {
        // Cuisine-specific query: use focused search queries, don't dilute with generic terms
        searchQueries = cuisineIntent.searchQueries;
        Logger.info('SYSTEM', 'Cuisine-specific search detected', { 
          cuisineType: cuisineIntent.cuisineType,
          queries: searchQueries 
        });
      } else {
        // Not a specific cuisine - use AI to translate vague prompts into smart search queries
        // This handles requests like "newest hottest places", "hidden gems", "something fancy"
        try {
          translatedIntent = await translateSearchIntent(trimmedPrompt, vibe, address);
          
          if (translatedIntent.searchQueries.length > 0) {
            searchQueries = translatedIntent.searchQueries;
            Logger.info('SYSTEM', 'AI-translated search intent', { 
              originalPrompt: trimmedPrompt,
              translatedQueries: searchQueries,
              newlyOpenedOnly: translatedIntent.newlyOpenedOnly,
              popularOnly: translatedIntent.popularOnly
            });
          } else {
            // AI returned empty queries - fallback to basic approach
            searchQueries = [
              trimmedPrompt,
              `${trimmedPrompt} restaurant`,
              'restaurant',
            ];
          }
        } catch (e) {
          // AI translation failed - fallback to basic approach
          Logger.warn('SYSTEM', 'AI translation failed, using basic approach', { error: e });
          searchQueries = [
            trimmedPrompt,
            `${trimmedPrompt} restaurant`,
            `best ${trimmedPrompt}`,
          ];
        }
      }
    } else {
      // No freestyle prompt: use AI to generate city-aware vibe queries
      // This makes "Grab & Go" in Berlin different from "Grab & Go" in NYC
      try {
        const vibeQuery = vibe || 'good local food';
        translatedIntent = await translateSearchIntent(vibeQuery, vibe, address);
        
        if (translatedIntent.searchQueries.length > 0) {
          searchQueries = translatedIntent.searchQueries;
          Logger.info('SYSTEM', 'City-aware vibe queries generated', { 
            vibe,
            address,
            queries: searchQueries
          });
        } else {
          // Fallback to static queries if AI fails
          searchQueries = getSearchQueriesForVibe(vibe);
        }
      } catch (e) {
        Logger.warn('SYSTEM', 'City-aware vibe query failed, using fallback', { error: e });
        searchQueries = getSearchQueriesForVibe(vibe);
      }
    }

    // Deduplicate and limit queries
    const uniqueQueries = [...new Set(searchQueries)].slice(0, 3);
    
    // Use AI-translated queries for filtering (not the raw freestyle prompt)
    // Priority: first search query > cuisineType > raw prompt
    // e.g., "I want schnitzel with gravy" → AI returns ["schnitzel restaurant", ...]
    // We use "schnitzel restaurant" which will match "Schnitzelei Mitte"
    const filterQuery = uniqueQueries[0] 
      || translatedIntent?.cuisineType 
      || freestylePrompt?.trim() 
      || '';
    
    // Convert radius to km for location query (radius is in meters)
    const radiusKm = Math.max(radius / 1000, 1); // At least 1km
    
    // ========================================
    // CACHE-FIRST STRATEGY
    // ========================================
    // Step 1: Query Supabase for all cached places in the area
    const cachedAreaPlaces = await SupabaseService.getPlacesByLocation(lat, lng, radiusKm);
    
    // Step 2: Filter cached places by query using AI
    let filteredCachePlaces: GooglePlace[] = [];
    if (cachedAreaPlaces.length > 0) {
      filteredCachePlaces = await filterPlacesByQuery(cachedAreaPlaces, filterQuery, vibe);
      
      Logger.info('SYSTEM', 'Cache-first filter results', {
        cachedInArea: cachedAreaPlaces.length,
        matchedQuery: filteredCachePlaces.length,
        query: filterQuery
      });
    }
    
    // Get IDs of places we already have from cache
    const cachedPlaceIds = new Set(filteredCachePlaces.map(p => p.place_id));
    
    // Step 3: Decide if we need Text Search API calls
    let apiPlaces: GooglePlace[] = [];
    let textSearchApiCalls = 0;
    let placeDetailApiCalls = 0; // Track actual Google Place Details API calls
    
    if (filteredCachePlaces.length < MIN_CACHE_MATCHES) {
      // Not enough cached matches - need to search for more
      Logger.info('SYSTEM', 'Insufficient cache matches, calling Text Search API', {
        cached: filteredCachePlaces.length,
        threshold: MIN_CACHE_MATCHES,
        queries: uniqueQueries.slice(0, 2) // Limit to 2 queries
      });
      
      // Make Text Search API calls (limit to 2 queries to control costs)
      const queriesToSearch = uniqueQueries.slice(0, 2);
      textSearchApiCalls = queriesToSearch.length;
      
      const searchIdPromises = queriesToSearch.map(query => {
        const request = {
          textQuery: query,
          locationBias: { center: location, radius },
          maxResultCount: 20,
          fields: ['id']
        };
        return Place.searchByText(request).then(result => 
          result.places.map(p => p.id).filter((id): id is string => !!id)
        ).catch(() => [] as string[]);
      });
      
      const searchResults = await Promise.all(searchIdPromises);
      const allFetchedIds = [...new Set(searchResults.flat())];
      
      // Filter out IDs we already have from cache
      const newPlaceIds = allFetchedIds.filter(id => !cachedPlaceIds.has(id));
      
      Logger.info('SYSTEM', 'Text Search API results', {
        totalFound: allFetchedIds.length,
        newPlaces: newPlaceIds.length,
        alreadyCached: allFetchedIds.length - newPlaceIds.length
      });
      
      // Fetch details only for NEW places (not in cache)
      if (newPlaceIds.length > 0) {
        // First check if any of these are in the places cache (but not in area)
        const { found: additionalCached, missing: trulyUncached } = await PlacesCache.getPlacesWithL2(newPlaceIds);
        
        // Add cached places to results (these are L1/L2 cache hits, NOT API calls)
        apiPlaces.push(...additionalCached.values());
        
        // Fetch only truly uncached places (these are actual API calls)
        if (trulyUncached.length > 0) {
          const detailPromises = trulyUncached.map(id => {
            const place = new Place({ id });
            return place.fetchFields({ fields: PLACE_FIELDS as unknown as string[] });
          });
          
          const detailResults = await Promise.allSettled(detailPromises);
          const newlyFetched = detailResults
            .filter((res): res is PromiseFulfilledResult<{ place: google.maps.places.Place }> =>
              res.status === 'fulfilled' && !!res.value?.place
            )
            .map(res => mapPlace(res.value.place));
          
          apiPlaces.push(...newlyFetched);
          placeDetailApiCalls = newlyFetched.length; // Only count actual API calls
          
          // Cache newly fetched places to BOTH L1 and L2
          if (newlyFetched.length > 0) {
            await PlacesCache.savePlacesToBothLayers(newlyFetched);
          }
        }
      }
    } else {
      Logger.info('SYSTEM', 'Sufficient cache matches - SKIPPING Text Search API', {
        cached: filteredCachePlaces.length,
        threshold: MIN_CACHE_MATCHES,
        estimatedSavings: `€${(uniqueQueries.slice(0, 2).length * 0.032).toFixed(3)}`
      });
    }
    
    // Combine cached and API places
    const allPlaces = [...filteredCachePlaces, ...apiPlaces];
    const uniquePlaceIds = [...new Set(allPlaces.map(p => p.place_id))];
    
    if (allPlaces.length === 0) {
      return { places: [], uniqueCount: 0, cuisineIntent };
    }
    
    // CRITICAL: Filter out non-food establishments (e.g., cap stores, clothing shops)
    const foodPlaces = allPlaces.filter(place => isFoodEstablishment(place.types));
    
    // Filter out places that are closed for the entire day today
    const openTodayPlaces = filterOutClosedToday(foodPlaces);
    const closedTodayCount = foodPlaces.length - openTodayPlaces.length;
    
    // Deduplicate by place_id
    const seenIds = new Set<string>();
    const deduplicatedPlaces = openTodayPlaces.filter(place => {
      if (seenIds.has(place.place_id)) return false;
      seenIds.add(place.place_id);
      return true;
    });
    
    Logger.info('SYSTEM', 'Place filters applied', {
      total: allPlaces.length,
      afterFoodFilter: foodPlaces.length,
      closedToday: closedTodayCount,
      final: deduplicatedPlaces.length
    });

    // Log API call summary for this search
    Logger.info('SYSTEM', '=== PLACES API SUMMARY ===', {
      cacheFirstMatches: filteredCachePlaces.length,
      textSearchCalls: textSearchApiCalls,
      placeDetailCalls: placeDetailApiCalls,
      totalPlaces: deduplicatedPlaces.length,
      estimatedCost: textSearchApiCalls > 0 
        ? `€${((textSearchApiCalls * 0.032) + (placeDetailApiCalls * 0.017)).toFixed(3)}`
        : '€0.000 (cache hit)'
    });

    return { places: deduplicatedPlaces, uniqueCount: uniquePlaceIds.length, cuisineIntent, translatedIntent };
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
