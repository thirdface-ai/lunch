
import React, { useEffect, useRef, useState } from 'react';
import { AppState, FinalResult, ThemeMode } from '../types';
import MapComponent from './MapComponent';

interface ResultsViewProps {
  appState: AppState;
  results: FinalResult[];
  userLat: number | null;
  userLng: number | null;
  onReset: () => void;
  theme: ThemeMode;
}

const ResultsView: React.FC<ResultsViewProps> = ({
  appState,
  results,
  userLat,
  userLng,
  onReset,
  theme
}) => {
  const isDark = theme === ThemeMode.DARK;

  if (appState !== AppState.RESULTS) return null;

  return (
    <div className={`min-h-screen flex items-center justify-center p-4 transition-colors duration-300 ${isDark ? 'bg-dark-bg' : 'bg-braun-bg'}`}>
        {/* Main Chassis - Max Width 7xl */}
        <div className={`w-full max-w-7xl border shadow-braun-deep flex flex-col transition-colors duration-300 ${isDark ? 'bg-dark-bg border-dark-border shadow-dark-deep' : 'bg-braun-bg border-braun-border shadow-braun-deep'}`}>
            
            {/* Header */}
            <div className={`p-8 flex justify-between items-end border-b transition-colors duration-300 ${isDark ? 'border-dark-border' : 'border-braun-border'}`}>
                <div>
                    <h1 className={`font-sans font-bold text-xl tracking-tight leading-none ${isDark ? 'text-dark-text' : 'text-braun-dark'}`}>CALCULATED OPTIONS</h1>
                </div>
                <button 
                    onClick={onReset}
                    className={`font-mono text-[10px] font-bold uppercase tracking-widest transition-colors ${isDark ? 'text-[#999] hover:text-braun-orange' : 'text-braun-text-muted hover:text-braun-orange'}`}
                >
                    [ RESET SYSTEM ]
                </button>
            </div>

            {/* Split View */}
            <div className={`flex flex-col lg:flex-row transition-colors duration-300 ${isDark ? 'bg-[#151515]' : 'bg-[#F9F9F7]'}`}>
                
                {/* List Column */}
                <div className="flex-1 overflow-y-auto max-h-[80vh]">
                    {results.map((place, idx) => {
                        const dayOfWeek = (new Date().getDay() + 6) % 7;
                        const todaysHoursRaw = place.opening_hours?.weekday_text?.[dayOfWeek];
                        const todaysHours = todaysHoursRaw ? todaysHoursRaw.substring(todaysHoursRaw.indexOf(':') + 2) : null;

                        return (
                            <div key={place.place_id} className={`p-8 border-b last:border-b-0 transition-colors group ${isDark ? 'border-dark-border hover:bg-dark-surface' : 'border-braun-border hover:bg-white'}`}>
                                
                                <div className="flex gap-6">
                                    <div className="font-mono text-braun-orange text-sm font-bold pt-1">
                                        {(idx + 1).toString().padStart(2, '0')}
                                    </div>

                                    <div className="flex-1 space-y-4">
                                        
                                        <div>
                                            <div className="flex items-center gap-3 flex-wrap">
                                                <a 
                                                    href={`https://www.google.com/maps/place/?q=place_id:${place.place_id}`}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="focus:outline-none focus:ring-1 focus:ring-braun-orange rounded-sm"
                                                >
                                                    <h2 className={`font-sans font-bold text-xl leading-none group-hover:text-braun-orange transition-colors cursor-pointer ${isDark ? 'text-dark-text' : 'text-braun-dark'}`}>
                                                        {place.name}
                                                    </h2>
                                                </a>
                                                
                                                {/* NEW OPENING BADGE */}
                                                {place.is_new_opening && (
                                                    <span className={`font-mono text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-[1px] animate-pulse border ${isDark ? 'text-blue-400 border-blue-400/50 bg-blue-400/10' : 'text-blue-600 border-blue-600/50 bg-blue-50'}`}>
                                                        FRESH DROP
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        <div className={`flex flex-wrap gap-x-6 gap-y-2 font-mono text-[10px] uppercase tracking-wider ${isDark ? 'text-[#999]' : 'text-braun-text-muted'}`}>
                                            <span className="flex items-center gap-1">
                                                <span className={`${isDark ? 'text-dark-text' : 'text-braun-dark'} font-bold`}>RATING:</span> {(place.rating || 0).toFixed(1)}
                                            </span>
                                            <span className="flex items-center gap-1">
                                                <span className={`${isDark ? 'text-dark-text' : 'text-braun-dark'} font-bold`}>COST:</span> 
                                                {place.price_level && place.price_level > 0 
                                                ? '$'.repeat(place.price_level) 
                                                : (place.price_level === 0 ? 'Free' : '$$')}
                                            </span>
                                            <span className="flex items-center gap-1">
                                                <span className={`${isDark ? 'text-dark-text' : 'text-braun-dark'} font-bold`}>WALK:</span> {place.walking_time_text || 'N/A'}
                                            </span>
                                            <span className="flex items-center gap-1">
                                                <span className={`${isDark ? 'text-dark-text' : 'text-braun-dark'} font-bold`}>HOURS:</span>
                                                {place.opening_hours ? (
                                                    <>
                                                        {place.opening_hours.open_now ? (
                                                            <span className="text-green-500 font-bold">Open</span>
                                                        ) : (
                                                            <span className="text-red-500 font-bold">Closed</span>
                                                        )}
                                                        {todaysHours && <span className="ml-1 normal-case">({todaysHours})</span>}
                                                    </>
                                                ) : 'N/A'}
                                            </span>
                                        </div>

                                        <p className={`font-sans text-sm leading-relaxed max-w-2xl ${isDark ? 'text-[#BBB]' : 'text-[#333]'}`}>
                                            {place.ai_reason}
                                        </p>

                                        <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-8 pt-2">
                                            <div className="flex items-baseline gap-2">
                                                <span className={`font-mono text-[10px] font-bold uppercase ${isDark ? 'text-[#999]' : 'text-braun-text-muted'}`}>TRY:</span>
                                                <span className={`font-sans text-sm font-medium border-b pb-0.5 ${isDark ? 'text-dark-text border-dark-border' : 'text-braun-dark border-braun-border/50'}`}>
                                                    {place.recommended_dish}
                                                </span>
                                            </div>

                                            {place.is_cash_only && (
                                                <span className="font-mono text-[10px] font-bold text-braun-orange uppercase tracking-widest border border-braun-orange/30 px-2 py-0.5 rounded-[1px]">
                                                    LEGACY PAYMENT METHOD DETECTED
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )
                    })}
                </div>

                {/* Map Column */}
                <div className={`lg:w-[500px] w-full border-t lg:border-t-0 lg:border-l min-h-[400px] lg:min-h-[600px] relative flex-shrink-0 ${isDark ? 'border-dark-border bg-[#181818]' : 'border-braun-border bg-[#E5E5E0]'}`}>
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
