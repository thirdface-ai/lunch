import React, { useEffect, useRef, useState, useMemo } from 'react';
import { AppState, TerminalLog as LogType, ThemeMode } from '../types';
import Sounds from '../utils/sounds';

// Funny messages for when no results are found
const SAD_MESSAGES = [
  "Your filters are more exclusive than a Berlin techno club's door policy.",
  "Even the hungriest AI couldn't find a match. That's... impressive?",
  "Congratulations! You've achieved the impossible: zero food options.",
  "Your standards are higher than Berlin rent prices.",
  "Not even a Döner stand survived your criteria. Brutal.",
  "The algorithm cried a single digital tear and gave up.",
  "We searched high and low. Mostly low. Found nothing.",
  "Your preferences created a food paradox. Scientists are baffled.",
  "Plot twist: The food was inside you all along. (Please eat something.)",
  "Error 404: Edible food not found within your extremely specific parameters.",
  "The AI tried its best. Its best wasn't good enough. It's reconsidering its career.",
  "Your filters eliminated literally everything. Achievement unlocked?",
];

interface TerminalLogProps {
  appState: AppState;
  logs: LogType[];
  progress?: number;
  theme: ThemeMode;
  onReset?: () => void;
}

const TerminalLog: React.FC<TerminalLogProps> = ({ appState, logs, progress = 0, theme, onReset }) => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const prevLogsLengthRef = useRef(0);
  const hasPlayedInitRef = useRef(false);
  const hasPlayedSuccessRef = useRef(false);
  const isDark = theme === ThemeMode.DARK;
  
  // Pick a random sad message when entering NO_RESULTS state
  const sadMessage = useMemo(() => {
    return SAD_MESSAGES[Math.floor(Math.random() * SAD_MESSAGES.length)];
  }, [appState]);

  // Play init sound when processing starts
  useEffect(() => {
    if (appState === AppState.PROCESSING && !hasPlayedInitRef.current) {
      hasPlayedInitRef.current = true;
      hasPlayedSuccessRef.current = false;
      Sounds.init();
    } else if (appState !== AppState.PROCESSING) {
      hasPlayedInitRef.current = false;
    }
  }, [appState]);

  // Play log entry sounds when new logs appear
  useEffect(() => {
    if (logs.length > prevLogsLengthRef.current) {
      Sounds.logEntry();
    }
    prevLogsLengthRef.current = logs.length;
  }, [logs]);

  // Play success sound when progress hits 100
  useEffect(() => {
    if (progress >= 100 && !hasPlayedSuccessRef.current) {
      hasPlayedSuccessRef.current = true;
      Sounds.success();
    }
  }, [progress]);

  // Scroll within the terminal container, not the whole page
  useEffect(() => {
    if (scrollContainerRef.current && endRef.current) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
    }
  }, [logs]);

  // Only render for PROCESSING or NO_RESULTS states
  if (appState !== AppState.PROCESSING && appState !== AppState.NO_RESULTS) return null;

  // NO_RESULTS state - show sad face screen
  if (appState === AppState.NO_RESULTS) {
    return (
      <div className={`min-h-screen flex items-center justify-center p-3 sm:p-4 transition-colors duration-300 ${isDark ? 'bg-dark-bg' : 'bg-braun-bg'}`}>
        <div className={`w-full max-w-2xl border p-1 relative flex flex-col shadow-braun-deep transition-colors duration-300 ${isDark ? 'bg-dark-bg border-dark-border shadow-dark-deep' : 'bg-braun-bg border-braun-border shadow-braun-deep'}`}>
          
          {/* Header */}
          <div className={`pt-4 pb-4 px-4 sm:pt-6 sm:pb-6 sm:px-8 flex justify-between items-center border-b shrink-0 transition-colors duration-300 ${isDark ? 'border-dark-border' : 'border-braun-border'}`}>
            <div>
              <h1 className={`font-sans font-bold text-lg sm:text-xl tracking-tight leading-none ${isDark ? 'text-dark-text' : 'text-braun-dark'}`}>NO RESULTS</h1>
              <p className={`font-mono text-[9px] tracking-[0.2em] mt-1 ${isDark ? 'text-dark-text-muted' : 'text-braun-text-muted'}`}>SEARCH YIELDED ZERO MATCHES</p>
            </div>
            <div className={`w-2 h-2 rounded-full ${isDark ? 'bg-dark-text-muted' : 'bg-braun-text-muted'}`}></div>
          </div>

          {/* Sad Face Content */}
          <div className={`p-8 sm:p-12 flex flex-col items-center justify-center text-center transition-colors duration-300 ${isDark ? 'bg-[#111]' : 'bg-[#F0F0EC]'}`}>
            
            {/* Big Sad Face */}
            <div className={`text-[120px] sm:text-[160px] leading-none mb-6 select-none ${isDark ? 'opacity-20' : 'opacity-10'}`}>
              :(
            </div>
            
            {/* Funny Message */}
            <p className={`font-mono text-sm sm:text-base max-w-md leading-relaxed mb-8 ${isDark ? 'text-dark-text-muted' : 'text-braun-text-muted'}`}>
              {sadMessage}
            </p>

            {/* Restart Button */}
            <button
              onClick={onReset}
              className="px-8 py-3 bg-braun-orange text-white font-sans font-bold text-sm uppercase tracking-widest rounded-sm shadow-braun-deep hover:shadow-[0_0_20px_rgba(255,68,0,0.4)] hover:scale-[1.02] active:scale-[0.98] transition-all duration-200"
            >
              Try Again
            </button>

            {/* Suggestions */}
            <div className={`mt-8 font-mono text-[10px] uppercase tracking-wider ${isDark ? 'text-dark-text-muted/50' : 'text-braun-text-muted/50'}`}>
              <p>Try: Wider radius • Fewer filters • Different vibe</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // PROCESSING state - show terminal
  return (
    <div className={`min-h-screen flex items-center justify-center p-3 sm:p-4 transition-colors duration-300 ${isDark ? 'bg-dark-bg' : 'bg-braun-bg'}`}>
      {/* Main Chassis */}
      <div className={`w-full max-w-5xl border p-1 relative min-h-[80vh] sm:min-h-[600px] flex flex-col shadow-braun-deep transition-colors duration-300 ${isDark ? 'bg-dark-bg border-dark-border shadow-dark-deep' : 'bg-braun-bg border-braun-border shadow-braun-deep'}`}>
        
        {/* Screw heads decorations - hidden on mobile */}
        <div className={`hidden sm:flex absolute top-2 left-2 w-2 h-2 rounded-full border opacity-50 items-center justify-center ${isDark ? 'border-dark-text-muted' : 'border-braun-text-muted'}`}>
          <div className={`w-1.5 h-[1px] rotate-45 ${isDark ? 'bg-dark-text-muted' : 'bg-braun-text-muted'}`}></div>
        </div>
        <div className={`hidden sm:flex absolute top-2 right-2 w-2 h-2 rounded-full border opacity-50 items-center justify-center ${isDark ? 'border-dark-text-muted' : 'border-braun-text-muted'}`}>
          <div className={`w-1.5 h-[1px] rotate-45 ${isDark ? 'bg-dark-text-muted' : 'bg-braun-text-muted'}`}></div>
        </div>
        <div className={`hidden sm:flex absolute bottom-2 left-2 w-2 h-2 rounded-full border opacity-50 items-center justify-center ${isDark ? 'border-dark-text-muted' : 'border-braun-text-muted'}`}>
          <div className={`w-1.5 h-[1px] rotate-45 ${isDark ? 'bg-dark-text-muted' : 'bg-braun-text-muted'}`}></div>
        </div>
        <div className={`hidden sm:flex absolute bottom-2 right-2 w-2 h-2 rounded-full border opacity-50 items-center justify-center ${isDark ? 'border-dark-text-muted' : 'border-braun-text-muted'}`}>
          <div className={`w-1.5 h-[1px] rotate-45 ${isDark ? 'bg-dark-text-muted' : 'bg-braun-text-muted'}`}></div>
        </div>

        {/* Branding Header */}
        <div className={`pt-4 pb-4 px-4 sm:pt-6 sm:pb-6 sm:px-8 flex justify-between items-center sm:items-end border-b shrink-0 transition-colors duration-300 ${isDark ? 'border-dark-border' : 'border-braun-border'}`}>
          <div>
            <h1 className={`font-sans font-bold text-lg sm:text-xl tracking-tight leading-none ${isDark ? 'text-dark-text' : 'text-braun-dark'}`}>SYSTEM STATUS</h1>
            <p className={`font-mono text-[9px] tracking-[0.2em] mt-1 ${isDark ? 'text-dark-text-muted' : 'text-braun-text-muted'}`}>PROCESSING CORE ACTIVE</p>
          </div>
          <div className="flex flex-col items-end">
            <div className="w-2 h-2 bg-braun-orange animate-pulse rounded-full shadow-[0_0_8px_#FF4400]" aria-label="Processing indicator"></div>
          </div>
        </div>

        {/* Main Display Area */}
        <div className={`flex-1 p-4 sm:p-8 flex flex-col justify-center transition-colors duration-300 ${isDark ? 'bg-[#111]' : 'bg-[#F0F0EC]'}`}>
          
          {/* The "Screen" */}
          <div className={`p-3 sm:p-4 rounded-sm shadow-inner border-b-2 relative overflow-hidden flex flex-col h-[70vh] sm:h-[400px] transition-colors duration-300 ${isDark ? 'bg-[#000] border-[#222]' : 'bg-[#222] border-[#444]'}`}>
            
            {/* Screen Bezel Branding */}
            <div className="absolute top-2 left-1/2 -translate-x-1/2 text-[8px] font-sans font-bold text-[#444] tracking-widest uppercase pointer-events-none">
              Output Monitor
            </div>

            {/* Terminal Content */}
            <div ref={scrollContainerRef} className="flex-1 overflow-y-auto scrollbar-hide font-mono text-[11px] sm:text-xs md:text-sm space-y-1.5 sm:space-y-2 p-2 pt-5 sm:pt-6 relative z-10" role="log" aria-live="polite">
              {logs.map((log) => (
                <div key={log.id} className="flex gap-2 sm:gap-4 text-braun-orange/90 animate-scroll-up">
                  <span className="opacity-50 text-[9px] sm:text-[10px] w-8 sm:w-10 text-right shrink-0 mt-0.5">
                    {(log.timestamp % 100).toString().padStart(2, '0')}:{(log.timestamp % 1000).toString().slice(0,2)}
                  </span>
                  <span className="uppercase tracking-wide font-medium">
                    {`> ${log.text}`}
                  </span>
                </div>
              ))}
              <div ref={endRef} />
              
              {/* Blinking Cursor */}
              <div className="w-2 h-4 bg-braun-orange animate-blink mt-2 ml-10 sm:ml-14" aria-hidden="true"></div>
            </div>

            {/* Scanlines & Glare */}
            <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] bg-[length:100%_2px,3px_100%] z-20" aria-hidden="true"></div>
          </div>

          {/* Loading Bar Physical Analogue */}
          <div className="mt-4 sm:mt-6">
            <div className={`flex justify-between font-mono text-[9px] sm:text-[9px] uppercase tracking-widest mb-2 ${isDark ? 'text-dark-text-muted' : 'text-braun-text-muted'}`}>
              <span>Calculating</span>
              <span aria-live="polite">{Math.round(progress)}%</span>
            </div>
            <div 
              className={`h-1.5 w-full rounded-full overflow-hidden ${isDark ? 'bg-dark-border' : 'bg-braun-border/50'}`}
              role="progressbar"
              aria-valuenow={Math.round(progress)}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div 
                className={`h-full transition-all duration-100 ease-linear ${isDark ? 'bg-dark-text' : 'bg-braun-dark'}`} 
                style={{ width: `${progress}%` }}
              ></div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};

export default TerminalLog;

