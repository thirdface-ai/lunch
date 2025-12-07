/**
 * Timezone Service
 * 
 * Uses Google Time Zone API to get accurate timezone data for any location.
 * Handles DST, political boundaries, and half-hour offsets correctly.
 * 
 * Caching: In-memory only (timezone data is also stored in places_cache)
 * 
 * Included in Essentials plan: 10,000 free/month, then $5/1000
 */

import Logger from '../utils/logger';

// L1 cache: In-memory (by rounded lat/lng)
const memoryCache = new Map<string, { offset: number; timestamp: number }>();
const MEMORY_TTL_MS = 60 * 60 * 1000; // 1 hour

/**
 * Generate cache key from coordinates (rounded to 0.1 degree)
 * Timezones are regional, so nearby locations share the same timezone
 */
const getCacheKey = (lat: number, lng: number): string => {
  const latRounded = Math.round(lat * 10) / 10;
  const lngRounded = Math.round(lng * 10) / 10;
  return `${latRounded},${lngRounded}`;
};

/**
 * Fetch timezone offset from Google Time Zone API
 * Returns total offset in seconds (includes DST)
 */
export const fetchTimezoneOffset = async (lat: number, lng: number): Promise<number | null> => {
  const cacheKey = getCacheKey(lat, lng);
  
  // Check memory cache
  const cached = memoryCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < MEMORY_TTL_MS) {
    return cached.offset;
  }
  
  try {
    // Get API key
    const apiKey = (window as any).GOOGLE_MAPS_API_KEY || 
                   import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
    
    if (!apiKey) {
      Logger.warn('SYSTEM', 'No Google Maps API key available for timezone');
      return null;
    }
    
    const timestamp = Math.floor(Date.now() / 1000);
    const url = `https://maps.googleapis.com/maps/api/timezone/json?location=${lat},${lng}&timestamp=${timestamp}&key=${apiKey}`;
    
    const response = await fetch(url);
    const data = await response.json();
    
    if (data.status !== 'OK') {
      Logger.warn('NETWORK', `Google Time Zone API error: ${data.status}`);
      return null;
    }
    
    const totalOffset = data.rawOffset + data.dstOffset;
    
    // Cache it
    memoryCache.set(cacheKey, { offset: totalOffset, timestamp: Date.now() });
    
    Logger.info('CACHE', `Fetched timezone: ${data.timeZoneId} (offset: ${totalOffset}s)`);
    
    return totalOffset;
  } catch (err) {
    Logger.error('NETWORK', 'Failed to fetch timezone', { err });
    return null;
  }
};

/**
 * Get current minutes since midnight at a location
 * Uses cached offset if available, otherwise falls back to longitude estimate
 */
export const getCurrentMinutesAtLocation = (lat: number, lng: number, cachedOffset?: number | null): number => {
  const now = new Date();
  
  // Try to use cached offset from place data
  if (cachedOffset !== undefined && cachedOffset !== null) {
    const utcMs = now.getTime() + now.getTimezoneOffset() * 60 * 1000;
    const localMs = utcMs + cachedOffset * 1000;
    const localDate = new Date(localMs);
    return localDate.getHours() * 60 + localDate.getMinutes();
  }
  
  // Check memory cache
  const cacheKey = getCacheKey(lat, lng);
  const cached = memoryCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < MEMORY_TTL_MS) {
    const utcMs = now.getTime() + now.getTimezoneOffset() * 60 * 1000;
    const localMs = utcMs + cached.offset * 1000;
    const localDate = new Date(localMs);
    return localDate.getHours() * 60 + localDate.getMinutes();
  }
  
  // Fallback: estimate from longitude (less accurate but instant)
  const utcHours = now.getUTCHours();
  const utcMinutes = now.getUTCMinutes();
  const utcTotalMinutes = utcHours * 60 + utcMinutes;
  const lngOffset = Math.round(lng / 15) * 60; // 15° = 1 hour
  
  let localMinutes = utcTotalMinutes + lngOffset;
  if (localMinutes < 0) localMinutes += 24 * 60;
  if (localMinutes >= 24 * 60) localMinutes -= 24 * 60;
  
  return localMinutes;
};

/**
 * Pre-fetch timezone for a location (fire and forget)
 */
export const prefetchTimezone = (lat: number, lng: number): void => {
  fetchTimezoneOffset(lat, lng).catch(() => {});
};

export default {
  fetchTimezoneOffset,
  getCurrentMinutesAtLocation,
  prefetchTimezone,
};
