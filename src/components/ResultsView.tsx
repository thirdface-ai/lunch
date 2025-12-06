import React from 'react';
import { AppState, FinalResult, ThemeMode } from '../types';
import MapComponent from './MapComponent';
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
 * Extract opening time from a time range string like "11:00 am – 10:00 pm"
 * Returns the formatted opening time (e.g., "11:00 AM") or null if can't parse
 */
const extractOpeningTime = (rangeStr: string): string | null => {
  const parts = rangeStr.split(/\s*[–\-]\s*|\s+to\s+/i);
  if (parts.length !== 2) return null;
  
  const openTimeStr = parts[0].trim();
  // Validate it's a parseable time
  if (parseTimeToMinutes(openTimeStr) === null) return null;
  
  // Format nicely (capitalize AM/PM)
  return openTimeStr.toUpperCase().replace(/\s+/g, ' ');
};

/**
 * Get the next opening time from today's hours string
 * Returns formatted time like "11:00 AM" or null if closed all day or can't determine
 */
const getNextOpeningTime = (todaysHours: string | null | undefined): string | null => {
  if (!todaysHours) return null;
  
  const cleaned = todaysHours.trim().toLowerCase();
  if (cleaned === 'closed') return null; // Closed all day
  if (cleaned === 'open 24 hours') return null; // Always open
  
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  
  // Split by comma to handle multiple time ranges (e.g., lunch and dinner)
  const timeRanges = todaysHours.split(/\s*,\s*/);
  
  // Find the next opening time that's after current time
  for (const range of timeRanges) {
    const parts = range.split(/\s*[–\-]\s*|\s+to\s+/i);
    if (parts.length !== 2) continue;
    
    const openTime = parseTimeToMinutes(parts[0]);
    if (openTime === null) continue;
    
    // If this opening time is in the future, return it
    if (openTime > currentMinutes) {
      return extractOpeningTime(range);
    }
  }
  
  // No future opening time found today (closed for rest of day)
  return null;
};

/**
 * Check if a place is currently open based on today's hours string
 * Returns: { isOpen: boolean | null, nextOpenTime: string | null }
 */
const getOpenStatus = (todaysHours: string | null | undefined): { isOpen: boolean | null; nextOpenTime: string | null } => {
  if (!todaysHours) return { isOpen: null, nextOpenTime: null };
  
  const cleaned = todaysHours.trim().toLowerCase();
  if (cleaned === 'closed') return { isOpen: false, nextOpenTime: null };
  if (cleaned === 'open 24 hours') return { isOpen: true, nextOpenTime: null };
  
  // Split by comma to handle multiple time ranges (e.g., lunch and dinner)
  const timeRanges = todaysHours.split(/\s*,\s*/);
  
  for (const range of timeRanges) {
    const isOpen = isWithinTimeRange(range.trim());
    if (isOpen === true) {
      return { isOpen: true, nextOpenTime: null };
    }
  }
  
  // Not currently open - find next opening time
  const nextOpenTime = getNextOpeningTime(todaysHours);
  
  // If we parsed at least one range and none matched, it's closed
  const parsedAny = timeRanges.some(range => isWithinTimeRange(range.trim()) !== null);
  return { 
    isOpen: parsedAny ? false : null, 
    nextOpenTime 
  };
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

  const handleReset = () => {
    Sounds.firmClick();
    onReset();
  };

  // Generate Google Maps URL for a place (works on desktop, mobile browsers, AND native Maps app)
  const getPlaceUrl = (name: string, vicinity: string | undefined, placeId: string) => {
    const query = encodeURIComponent(`${name} ${vicinity || ''}`.trim());
    return `https://www.google.com/maps/search/?api=1&query=${query}&query_place_id=${placeId}`;
  };

  if (appState !== AppState.RESULTS) return null;

  return (
    <div className={`min-h-screen flex items-center justify-center p-4 transition-colors duration-300 ${isDark ? 'bg-dark-bg' : 'bg-braun-bg'}`}>
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

              return (
                <article 
                  key={place.place_id} 
                  className={`px-4 py-5 sm:p-6 lg:p-8 border-b last:border-b-0 transition-colors group ${isDark ? 'border-dark-border hover:bg-dark-surface' : 'border-braun-border hover:bg-white'}`}
                >
                  {/* Grid Layout: Fixed number column + content */}
                  <div className="flex gap-3 lg:gap-6">
                    {/* Fixed-width number column */}
                    <div className="flex-shrink-0 w-6 lg:w-8">
                      <span className="font-mono text-braun-orange text-xs lg:text-sm font-bold tabular-nums">
                        {(idx + 1).toString().padStart(2, '0')}
                      </span>
                    </div>
                    
                    {/* Content column */}
                    <div className="flex-1 min-w-0 space-y-4">
                      {/* Name row */}
                      <div className="flex flex-wrap items-center gap-2">
                        <a 
                          href={getPlaceUrl(place.name, place.vicinity, place.place_id)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={`font-sans font-bold text-lg lg:text-xl leading-tight group-hover:text-braun-orange transition-colors ${isDark ? 'text-dark-text' : 'text-braun-dark'}`}
                        >
                          {place.name}
                        </a>
                        
                        {/* NEW OPENING BADGE */}
                        {place.is_new_opening && (
                          <span className={`font-mono text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-[1px] animate-pulse border ${isDark ? 'text-blue-400 border-blue-400/50 bg-blue-400/10' : 'text-blue-600 border-blue-600/50 bg-blue-50'}`}>
                            FRESH DROP
                          </span>
                        )}
                      </div>

                      {/* Metadata row - 2x2 grid on mobile, flex row on desktop */}
                      <div className={`font-mono text-[10px] lg:text-[11px] uppercase tracking-wider ${isDark ? 'text-[#888]' : 'text-braun-text-muted'}`}>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:flex sm:flex-wrap sm:gap-x-6 lg:gap-x-8 sm:gap-y-1">
                          <span className="inline-flex items-center gap-2">
                            <span className={`${isDark ? 'text-dark-text' : 'text-braun-dark'} font-bold`}>RATING:</span>
                            <span>{(place.rating || 0).toFixed(1)}</span>
                          </span>
                          <span className="inline-flex items-center gap-2">
                            <span className={`${isDark ? 'text-dark-text' : 'text-braun-dark'} font-bold`}>COST:</span>
                            <span>{place.price_level && place.price_level > 0 
                              ? '$'.repeat(place.price_level) 
                              : (place.price_level === 0 ? 'Free' : '$$')}</span>
                          </span>
                          <span className="inline-flex items-center gap-2">
                            <span className={`${isDark ? 'text-dark-text' : 'text-braun-dark'} font-bold`}>WALK:</span>
                            <span>{place.walking_time_text || 'N/A'}</span>
                          </span>
                          <span className="inline-flex items-center gap-2">
                            <span className={`${isDark ? 'text-dark-text' : 'text-braun-dark'} font-bold`}>HOURS:</span>
                            {place.opening_hours ? (
                              (() => {
                                const status = getOpenStatus(todaysHours);
                                if (status.isOpen === true) {
                                  return <span className="text-green-500 font-bold">OPEN</span>;
                                } else if (status.isOpen === false) {
                                  // Show next opening time if available, otherwise just say closed today
                                  if (status.nextOpenTime) {
                                    return <span className="text-red-500 font-bold">OPENS {status.nextOpenTime}</span>;
                                  }
                                  return <span className="text-red-500 font-bold">CLOSED TODAY</span>;
                                }
                                // Fallback to API's open_now status
                                return place.opening_hours?.open_now 
                                  ? <span className="text-green-500 font-bold">OPEN</span>
                                  : <span className="text-red-500 font-bold">CLOSED</span>;
                              })()
                            ) : <span>N/A</span>}
                          </span>
                        </div>
                      </div>

                      {/* Description - constrained width for readability */}
                      <p className={`font-sans text-[13px] lg:text-sm leading-relaxed max-w-xl ${isDark ? 'text-[#AAA]' : 'text-[#444]'}`}>
                        {place.ai_reason}
                      </p>

                      {/* TRY section */}
                      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 pt-3">
                        <div className="flex items-center gap-2">
                          <span className={`font-mono text-[10px] lg:text-[11px] font-bold uppercase tracking-wider ${isDark ? 'text-[#666]' : 'text-braun-text-muted'}`}>TRY:</span>
                          <span className={`font-sans text-[13px] lg:text-sm font-medium border-b ${isDark ? 'text-dark-text border-dark-border' : 'text-braun-dark border-braun-dark/20'}`}>
                            {place.recommended_dish}
                          </span>
                        </div>

                        {place.is_cash_only && (
                          <span className="font-mono text-[9px] lg:text-[10px] font-bold text-braun-orange uppercase tracking-widest border border-braun-orange/30 px-2 py-0.5 rounded-[1px]">
                            <span className="hidden sm:inline">LEGACY PAYMENT METHOD DETECTED</span>
                            <span className="sm:hidden">CASH ONLY</span>
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>

          {/* Map Column - hidden on mobile, shown on lg+ screens */}
          <div className={`hidden lg:block lg:w-[420px] lg:border-l lg:min-h-[600px] relative flex-shrink-0 ${isDark ? 'border-dark-border bg-[#181818]' : 'border-braun-border bg-[#E5E5E0]'}`}>
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
