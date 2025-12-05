import React, { useEffect, useRef } from 'react';
import { AppState, TerminalLog as LogType, ThemeMode } from '../types';
import Sounds from '../utils/sounds';

interface TerminalLogProps {
  appState: AppState;
  logs: LogType[];
  progress?: number;
  theme: ThemeMode;
}

const TerminalLog: React.FC<TerminalLogProps> = ({ appState, logs, progress = 0, theme }) => {
  const endRef = useRef<HTMLDivElement>(null);
  const prevLogsLengthRef = useRef(0);
  const hasPlayedInitRef = useRef(false);
  const isDark = theme === ThemeMode.DARK;

  // Play init sound when processing starts
  useEffect(() => {
    if (appState === AppState.PROCESSING && !hasPlayedInitRef.current) {
      hasPlayedInitRef.current = true;
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
    if (progress >= 100) {
      Sounds.success();
    }
  }, [progress >= 100]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  if (appState !== AppState.PROCESSING) return null;

  return (
    <div className={`min-h-screen flex items-center justify-center p-4 transition-colors duration-300 ${isDark ? 'bg-dark-bg' : 'bg-braun-bg'}`}>
      {/* Main Chassis */}
      <div className={`w-full max-w-5xl border p-1 relative min-h-[600px] flex flex-col shadow-braun-deep transition-colors duration-300 ${isDark ? 'bg-dark-bg border-dark-border shadow-dark-deep' : 'bg-braun-bg border-braun-border shadow-braun-deep'}`}>
        
        {/* Screw heads decorations */}
        <div className={`absolute top-2 left-2 w-2 h-2 rounded-full border opacity-50 flex items-center justify-center ${isDark ? 'border-dark-text-muted' : 'border-braun-text-muted'}`}>
          <div className={`w-1.5 h-[1px] rotate-45 ${isDark ? 'bg-dark-text-muted' : 'bg-braun-text-muted'}`}></div>
        </div>
        <div className={`absolute top-2 right-2 w-2 h-2 rounded-full border opacity-50 flex items-center justify-center ${isDark ? 'border-dark-text-muted' : 'border-braun-text-muted'}`}>
          <div className={`w-1.5 h-[1px] rotate-45 ${isDark ? 'bg-dark-text-muted' : 'bg-braun-text-muted'}`}></div>
        </div>
        <div className={`absolute bottom-2 left-2 w-2 h-2 rounded-full border opacity-50 flex items-center justify-center ${isDark ? 'border-dark-text-muted' : 'border-braun-text-muted'}`}>
          <div className={`w-1.5 h-[1px] rotate-45 ${isDark ? 'bg-dark-text-muted' : 'bg-braun-text-muted'}`}></div>
        </div>
        <div className={`absolute bottom-2 right-2 w-2 h-2 rounded-full border opacity-50 flex items-center justify-center ${isDark ? 'border-dark-text-muted' : 'border-braun-text-muted'}`}>
          <div className={`w-1.5 h-[1px] rotate-45 ${isDark ? 'bg-dark-text-muted' : 'bg-braun-text-muted'}`}></div>
        </div>

        {/* Branding Header */}
        <div className={`pt-6 pb-6 px-8 flex justify-between items-end border-b shrink-0 transition-colors duration-300 ${isDark ? 'border-dark-border' : 'border-braun-border'}`}>
          <div>
            <h1 className={`font-sans font-bold text-xl tracking-tight leading-none ${isDark ? 'text-dark-text' : 'text-braun-dark'}`}>SYSTEM STATUS</h1>
            <p className={`font-mono text-[9px] tracking-[0.2em] mt-1 ${isDark ? 'text-dark-text-muted' : 'text-braun-text-muted'}`}>PROCESSING CORE ACTIVE</p>
          </div>
          <div className="flex flex-col items-end">
            <div className="w-2 h-2 bg-braun-orange animate-pulse rounded-full shadow-[0_0_8px_#FF4400]" aria-label="Processing indicator"></div>
          </div>
        </div>

        {/* Main Display Area */}
        <div className={`flex-1 p-8 flex flex-col justify-center transition-colors duration-300 ${isDark ? 'bg-[#111]' : 'bg-[#F0F0EC]'}`}>
          
          {/* The "Screen" */}
          <div className={`p-4 rounded-sm shadow-inner border-b-2 relative overflow-hidden flex flex-col h-[400px] transition-colors duration-300 ${isDark ? 'bg-[#000] border-[#222]' : 'bg-[#222] border-[#444]'}`}>
            
            {/* Screen Bezel Branding */}
            <div className="absolute top-2 left-1/2 -translate-x-1/2 text-[8px] font-sans font-bold text-[#444] tracking-widest uppercase pointer-events-none">
              Output Monitor
            </div>

            {/* Terminal Content */}
            <div className="flex-1 overflow-y-auto scrollbar-hide font-mono text-xs md:text-sm space-y-2 p-2 pt-6 relative z-10" role="log" aria-live="polite">
              {logs.map((log) => (
                <div key={log.id} className="flex gap-4 text-braun-orange/90 animate-scroll-up">
                  <span className="opacity-50 text-[10px] w-10 text-right shrink-0 mt-0.5">
                    {(log.timestamp % 100).toString().padStart(2, '0')}:{(log.timestamp % 1000).toString().slice(0,2)}
                  </span>
                  <span className="uppercase tracking-wide font-medium">
                    {`> ${log.text}`}
                  </span>
                </div>
              ))}
              <div ref={endRef} />
              
              {/* Blinking Cursor */}
              <div className="w-2 h-4 bg-braun-orange animate-blink mt-2 ml-14" aria-hidden="true"></div>
            </div>

            {/* Scanlines & Glare */}
            <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] bg-[length:100%_2px,3px_100%] z-20" aria-hidden="true"></div>
          </div>

          {/* Loading Bar Physical Analogue */}
          <div className="mt-6">
            <div className={`flex justify-between font-mono text-[9px] uppercase tracking-widest mb-2 ${isDark ? 'text-dark-text-muted' : 'text-braun-text-muted'}`}>
              <span>Calculating Sequence</span>
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

