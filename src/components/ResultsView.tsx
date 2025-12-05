import React from 'react';
import { AppState, FinalResult, ThemeMode } from '../types';
import MapComponent from './MapComponent';
import { useFavorites } from '../hooks/useFavorites';
import Logger from '../utils/logger';
import Sounds from '../utils/sounds';


/**
 * Parse time string like "11:00 am", "2:30 pm", "14:00" into minutes since midnight
 */
const parseTimeToMinutes = (timeStr: string): number | null => {
  const cleaned = timeStr.trim().toLowerCase();
  
  // Handle 24-hour format (e.g., "14:00")
  const match24 = cleaned.match(/^(\d{1,2}):(\d{2})$/);
  if (match24) {
    const hours = parseInt(match24[1], 10);
    const minutes = parseInt(match24[2], 10);
    return hours * 60 + minutes;
  }
  
  // Handle 12-hour format (e.g., "2:30 pm", "11:00 am")
  const match12 = cleaned.match(/^(\d{1,2}):(\d{2})\s*(am|pm)$/);
  if (match12) {
    let hours = parseInt(match12[1], 10);
    const minutes = parseInt(match12[2], 10);
    const period = match12[3];
    
    if (period === 'pm' && hours !== 12) hours += 12;
    if (period === 'am' && hours === 12) hours = 0;
    
    return hours * 60 + minutes;
  }
  
  return null;
};

/**
 * Check if current time falls within a single time range
 * Returns true if open, false if closed, null if can't parse
 */
const isWithinTimeRange = (rangeStr: string): boolean | null => {
  // Split by common separators: "–", "-", "to"
  const parts = rangeStr.split(/\s*[–\-]\s*|\s+to\s+/i);
  if (parts.length !== 2) return null;
  
  const openTime = parseTimeToMinutes(parts[0]);
  const closeTime = parseTimeToMinutes(parts[1]);
  
  if (openTime === null || closeTime === null) return null;
  
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  
  // Handle overnight hours (e.g., 6pm - 2am)
  if (closeTime < openTime) {
    return currentMinutes >= openTime || currentMinutes < closeTime;
  }
  
  return currentMinutes >= openTime && currentMinutes < closeTime;
};

/**
 * Check if a place is currently open based on today's hours string
 * Handles formats like "11:00 am – 10:00 pm", "12:00 – 3:30 pm, 5:30 – 10:30 pm", "Closed"
 */
const isCurrentlyOpen = (todaysHours: string | null | undefined): boolean | null => {
  if (!todaysHours) return null;
  
  const cleaned = todaysHours.trim().toLowerCase();
  if (cleaned === 'closed') return false;
  if (cleaned === 'open 24 hours') return true;
  
  // Split by comma to handle multiple time ranges (e.g., lunch and dinner)
  const timeRanges = todaysHours.split(/\s*,\s*/);
  
  for (const range of timeRanges) {
    const isOpen = isWithinTimeRange(range.trim());
    if (isOpen === true) {
      return true; // Open if within ANY time range
    }
  }
  
  // If we parsed at least one range and none matched, it's closed
  // If we couldn't parse any ranges, return null to fall back to API
  const parsedAny = timeRanges.some(range => isWithinTimeRange(range.trim()) !== null);
  return parsedAny ? false : null;
};

interface ResultsViewProps {
  appState: AppState;
  results: FinalResult[];
  userLat: number | null;
  userLng: number | null;
  onReset: () => void;
  theme: ThemeMode;
}

/**
 * Generate a funny, short title based on the results
 */
const generateFunnyTitle = (results: FinalResult[]): string => {
  const titles: string[] = [];
  
  // Based on number of results
  if (results.length === 1) {
    titles.push("THE CHOSEN ONE", "FATE HAS SPOKEN", "YOUR DESTINY");
  } else if (results.length >= 5) {
    titles.push("FEAST MODE", "OPTION OVERLOAD", "DECISION PARALYSIS");
  }
  
  // Based on top result characteristics
  const topResult = results[0];
  if (topResult) {
    if (topResult.rating && topResult.rating >= 4.5) {
      titles.push("CERTIFIED BANGERS", "ELITE SELECTIONS", "PEAK CUISINE");
    }
    if (topResult.price_level === 1) {
      titles.push("BUDGET WINNERS", "CHEAP EATS SECURED", "WALLET FRIENDLY");
    }
    if (topResult.price_level && topResult.price_level >= 3) {
      titles.push("TREAT YOURSELF", "FANCY HOUR", "BOUGIE BITES");
    }
    if (topResult.walking_time_text?.includes("1 min") || topResult.walking_time_text?.includes("2 min")) {
      titles.push("LAZY MODE ENGAGED", "ALMOST THERE", "AROUND THE CORNER");
    }
    if (topResult.is_new_opening) {
      titles.push("FRESH FINDS", "NEW KID ALERT", "VIRGIN TERRITORY");
    }
  }
  
  // Fallback options
  titles.push(
    "CALCULATED OUTPUT",
    "LUNCH VERDICT",
    "HUNGER SOLUTIONS",
    "FEED THE BEAST",
    "SUSTENANCE ACQUIRED",
    "MISSION RESULTS",
    "OPERATION: LUNCH",
    "CHOW DETECTED",
    "FOOD RADAR RESULTS",
    "OPTIMAL FUEL SOURCES"
  );
  
  // Pick a random title
  return titles[Math.floor(Math.random() * titles.length)];
};

const ResultsView: React.FC<ResultsViewProps> = ({
  appState,
  results,
  userLat,
  userLng,
  onReset,
  theme
}) => {
  const isDark = theme === ThemeMode.DARK;
  
  // Generate title once per results set using useMemo
  const funnyTitle = React.useMemo(() => generateFunnyTitle(results), [results]);
  
  // Use TanStack Query-powered favorites hook
  const {
    isFavorite,
    toggleFavorite,
    isAddingFavorite,
    isRemovingFavorite,
  } = useFavorites();

  const handleToggleFavorite = async (result: FinalResult) => {
    try {
      const wasAlreadyFavorite = isFavorite(result.place_id);
      Sounds.favorite(!wasAlreadyFavorite);
      const isNowFavorite = await toggleFavorite(result);
      
      if (isNowFavorite) {
        Logger.userAction('Added Favorite', { placeId: result.place_id, placeName: result.name });
      } else {
        Logger.userAction('Removed Favorite', { placeId: result.place_id, placeName: result.name });
      }
    } catch (error) {
      Sounds.error();
      Logger.error('USER', 'Failed to toggle favorite', error);
    }
  };

  const handleReset = () => {
    Sounds.firmClick();
    onReset();
  };

  const handlePlaceClick = (placeId: string) => {
    Sounds.mediumClick();
    window.open(`https://www.google.com/maps/place/?q=place_id:${placeId}`, '_blank');
  };

  if (appState !== AppState.RESULTS) return null;

  // Check if any mutation is pending
  const isSavingAny = isAddingFavorite || isRemovingFavorite;

  return (
    <div className={`min-h-screen flex items-center justify-center p-2 sm:p-4 transition-colors duration-300 ${isDark ? 'bg-dark-bg' : 'bg-braun-bg'}`}>
      {/* Main Chassis */}
      <div className={`w-full max-w-7xl border shadow-braun-deep flex flex-col transition-colors duration-300 ${isDark ? 'bg-dark-bg border-dark-border shadow-dark-deep' : 'bg-braun-bg border-braun-border shadow-braun-deep'}`}>
        
        {/* Header */}
        <div className={`p-4 sm:p-8 flex justify-between items-center sm:items-end border-b transition-colors duration-300 ${isDark ? 'border-dark-border' : 'border-braun-border'}`}>
          <div>
            <h1 className={`font-sans font-bold text-base sm:text-xl tracking-tight leading-none ${isDark ? 'text-dark-text' : 'text-braun-dark'}`}>{funnyTitle}</h1>
          </div>
          <button 
            onClick={handleReset}
            className={`font-mono text-[10px] sm:text-[10px] font-bold uppercase tracking-widest transition-colors focus:outline-none focus:ring-2 focus:ring-white/30 px-2 py-2 sm:py-1 ${isDark ? 'text-[#999] hover:text-braun-orange' : 'text-braun-text-muted hover:text-braun-orange'}`}
          >
            <span className="hidden sm:inline">[ RESET SYSTEM ]</span>
            <span className="sm:hidden">RESET</span>
          </button>
        </div>

        {/* Split View */}
        <div className={`flex flex-col lg:flex-row transition-colors duration-300 ${isDark ? 'bg-[#151515]' : 'bg-[#F9F9F7]'}`}>
          
          {/* List Column */}
          <div className="flex-1 overflow-y-auto max-h-[75vh] sm:max-h-[80vh]">
            {results.map((place, idx) => {
              // Find today's hours by matching the day name in the weekday_text strings
              // Use the browser's locale to match Google Places API's weekdayDescriptions language
              const browserLocale = typeof navigator !== 'undefined' ? navigator.language : 'en-US';
              const todayName = new Date().toLocaleDateString(browserLocale, { weekday: 'long' });
              const todaysHoursRaw = place.opening_hours?.weekday_text?.find(
                text => text.toLowerCase().startsWith(todayName.toLowerCase())
              );
              const todaysHours = todaysHoursRaw ? todaysHoursRaw.substring(todaysHoursRaw.indexOf(':') + 2) : null;
              const isPlaceFavorite = isFavorite(place.place_id);

              return (
                <article 
                  key={place.place_id} 
                  className={`p-4 sm:p-8 border-b last:border-b-0 transition-colors group ${isDark ? 'border-dark-border hover:bg-dark-surface' : 'border-braun-border hover:bg-white'}`}
                >
                  {/* Header: Number + Name inline */}
                  <div className="mb-3 sm:mb-4">
                    <h2 
                      className={`font-sans font-bold text-base sm:text-xl leading-snug group-hover:text-braun-orange transition-colors cursor-pointer inline ${isDark ? 'text-dark-text' : 'text-braun-dark'}`} 
                      onClick={() => handlePlaceClick(place.place_id)}
                    >
                      <span className="font-mono text-braun-orange text-xs sm:text-sm font-bold tabular-nums mr-3">
                        {(idx + 1).toString().padStart(2, '0')}
                      </span>
                      {place.name}
                    </h2>
                    
                    {/* Favorite Button - inline after name */}
                    <button
                      onClick={() => handleToggleFavorite(place)}
                      disabled={isSavingAny}
                      aria-label={isPlaceFavorite ? 'Remove from favorites' : 'Add to favorites'}
                      className={`inline-flex align-middle ml-2 transition-all focus:outline-none focus:ring-2 focus:ring-white/30 ${
                        isSavingAny ? 'opacity-50 cursor-wait' : ''
                      } ${
                        isPlaceFavorite 
                          ? 'text-braun-orange' 
                          : `${isDark ? 'text-dark-text-muted hover:text-braun-orange' : 'text-braun-text-muted hover:text-braun-orange'}`
                      }`}
                    >
                      <svg 
                        width="16" 
                        height="16" 
                        viewBox="0 0 24 24" 
                        fill={isPlaceFavorite ? 'currentColor' : 'none'} 
                        stroke="currentColor" 
                        strokeWidth="2"
                      >
                        <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
                      </svg>
                    </button>
                    
                    {/* NEW OPENING BADGE */}
                    {place.is_new_opening && (
                      <span className={`inline-flex align-middle ml-2 font-mono text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-[1px] animate-pulse border ${isDark ? 'text-blue-400 border-blue-400/50 bg-blue-400/10' : 'text-blue-600 border-blue-600/50 bg-blue-50'}`}>
                        FRESH DROP
                      </span>
                    )}
                  </div>

                  {/* Content area - indented to align with name (after the 01 number) */}
                  <div className="pl-7 sm:pl-9 space-y-3 sm:space-y-4">
                    {/* Metadata - single line with wrapping */}
                    <div className={`flex flex-wrap items-center gap-x-4 sm:gap-x-6 gap-y-1 font-mono text-[9px] sm:text-[10px] uppercase tracking-wider ${isDark ? 'text-[#999]' : 'text-braun-text-muted'}`}>
                      <span>
                        <span className={`${isDark ? 'text-dark-text' : 'text-braun-dark'} font-bold`}>RATING:</span>{' '}
                        {(place.rating || 0).toFixed(1)}
                      </span>
                      <span>
                        <span className={`${isDark ? 'text-dark-text' : 'text-braun-dark'} font-bold`}>COST:</span>{' '}
                        {place.price_level && place.price_level > 0 
                          ? '$'.repeat(place.price_level) 
                          : (place.price_level === 0 ? 'Free' : '$$')}
                      </span>
                      <span>
                        <span className={`${isDark ? 'text-dark-text' : 'text-braun-dark'} font-bold`}>WALK:</span>{' '}
                        {place.walking_time_text || 'N/A'}
                      </span>
                      <span>
                        <span className={`${isDark ? 'text-dark-text' : 'text-braun-dark'} font-bold`}>HOURS:</span>{' '}
                        {place.opening_hours ? (
                          (() => {
                            const openStatus = isCurrentlyOpen(todaysHours);
                            if (openStatus === true) {
                              return <span className="text-green-500 font-bold">OPEN</span>;
                            } else if (openStatus === false) {
                              return <span className="text-red-500 font-bold">CLOSED</span>;
                            }
                            return place.opening_hours?.open_now 
                              ? <span className="text-green-500 font-bold">OPEN</span>
                              : <span className="text-red-500 font-bold">CLOSED</span>;
                          })()
                        ) : 'N/A'}
                      </span>
                    </div>

                    {/* Description */}
                    <p className={`font-sans text-xs sm:text-sm leading-relaxed max-w-2xl ${isDark ? 'text-[#BBB]' : 'text-[#333]'}`}>
                      {place.ai_reason}
                    </p>

                    {/* TRY section */}
                    <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2 pt-1">
                      <div className="flex items-baseline gap-2">
                        <span className={`font-mono text-[10px] font-bold uppercase tracking-wider ${isDark ? 'text-[#999]' : 'text-braun-text-muted'}`}>TRY:</span>
                        <span className={`font-sans text-xs sm:text-sm font-medium border-b pb-0.5 ${isDark ? 'text-dark-text border-dark-border' : 'text-braun-dark border-braun-border/50'}`}>
                          {place.recommended_dish}
                        </span>
                      </div>

                      {place.is_cash_only && (
                        <span className="font-mono text-[9px] sm:text-[10px] font-bold text-braun-orange uppercase tracking-widest border border-braun-orange/30 px-2 py-0.5 rounded-[1px]">
                          <span className="hidden sm:inline">LEGACY PAYMENT METHOD DETECTED</span>
                          <span className="sm:hidden">CASH ONLY</span>
                        </span>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>

          {/* Map Column - hidden on mobile, shown on lg+ screens */}
          <div className={`hidden lg:block lg:w-[500px] lg:border-l lg:min-h-[600px] relative flex-shrink-0 ${isDark ? 'border-dark-border bg-[#181818]' : 'border-braun-border bg-[#E5E5E0]'}`}>
            <MapComponent
              userLat={userLat}
              userLng={userLng}
              results={results}
              theme={theme}
            />
          </div>

        </div>
      </div>
    </div>
  );
};

export default ResultsView;
