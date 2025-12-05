
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { AppState, TransportMode, HungerVibe, PricePoint, UserPreferences, WalkLimit, ThemeMode, DietaryRestriction } from '../types';
import Sounds, { startSplitFlap, SoundController } from '../utils/sounds';


// Easter egg: Text scramble effect component (airport split-flap display style)
const ScrambleText: React.FC<{ text: string; className?: string; href?: string }> = ({ text, className = '', href }) => {
  const [displayText, setDisplayText] = useState(text);
  const [isHovering, setIsHovering] = useState(false);
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const iterationRef = useRef(0);
  const soundControllerRef = useRef<SoundController | null>(null);

  const scramble = useCallback(async () => {
    iterationRef.current = 0;
    const originalText = text;
    
    if (intervalRef.current) clearInterval(intervalRef.current);
    
    // Start the continuous split-flap sound (synced with animation)
    soundControllerRef.current = await startSplitFlap();
    
    intervalRef.current = setInterval(() => {
      setDisplayText(
        originalText
          .split('')
          .map((char, index) => {
            if (char === ' ') return ' ';
            if (index < iterationRef.current) {
              return originalText[index];
            }
            return chars[Math.floor(Math.random() * chars.length)];
          })
          .join('')
      );
      
      iterationRef.current += 1 / 3;
      
      if (iterationRef.current >= originalText.length) {
        // Animation complete - stop the sound with settling thunk
        if (intervalRef.current) clearInterval(intervalRef.current);
        if (soundControllerRef.current) {
          soundControllerRef.current.stop();
          soundControllerRef.current = null;
        }
        setDisplayText(originalText);
      }
    }, 30);
  }, [text]);

  const handleMouseEnter = () => {
    setIsHovering(true);
    scramble();
  };

  const handleMouseLeave = () => {
    setIsHovering(false);
    if (intervalRef.current) clearInterval(intervalRef.current);
    // Stop sound immediately when mouse leaves (with settling thunk)
    if (soundControllerRef.current) {
      soundControllerRef.current.stop();
      soundControllerRef.current = null;
    }
    setDisplayText(text);
  };

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (soundControllerRef.current) {
        soundControllerRef.current.stop();
        soundControllerRef.current = null;
      }
    };
  }, []);

  const content = (
    <span
      className={`cursor-pointer transition-all duration-200 font-mono tracking-wider ${className}`}
      style={{
        color: isHovering ? '#FF4400' : undefined,
        textShadow: isHovering ? '0 0 8px rgba(255, 68, 0, 0.6), 0 0 20px rgba(255, 68, 0, 0.3)' : 'none',
      }}
    >
      {displayText}
    </span>
  );

  if (href) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className="no-underline"
      >
        {content}
      </a>
    );
  }

  return (
    <span onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}>
      {content}
    </span>
  );
};

interface ControlPanelProps {
  appState: AppState;
  preferences: UserPreferences;
  setPreferences: React.Dispatch<React.SetStateAction<UserPreferences>>;
  onCalculate: () => void;
  effectiveTheme: 'light' | 'dark';
}

const ControlPanel: React.FC<ControlPanelProps> = ({
  appState,
  preferences,
  setPreferences,
  onCalculate,
  effectiveTheme
}) => {
  // Input State
  const [inputValue, setInputValue] = useState(preferences.address);
  const [predictions, setPredictions] = useState<any[]>([]);
  const [showPredictions, setShowPredictions] = useState(false);
  
  const [locating, setLocating] = useState(false);
  const PlaceLibraryRef = useRef<any>(null);

  // Initialize Places Library (New API)
  useEffect(() => {
    const initPlaces = async () => {
        try {
            if ((window as any).google && (window as any).google.maps) {
                const { Place } = await (window as any).google.maps.importLibrary("places");
                PlaceLibraryRef.current = Place;
            }
        } catch (error) {
            console.error("Failed to load Maps Places library", error);
        }
    };
    initPlaces();
  }, []);

  // Sync Input with Preferences (e.g. from Geolocation)
  useEffect(() => {
    setInputValue(preferences.address);
  }, [preferences.address]);

  const handleInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setInputValue(value);
    
    if (value && value.length > 2 && PlaceLibraryRef.current) {
        try {
            const { places } = await PlaceLibraryRef.current.searchByText({
                textQuery: value,
                fields: ['displayName', 'formattedAddress', 'location', 'id'],
                isOpenNow: false, 
            });

            if (places && places.length > 0) {
                setPredictions(places);
                setShowPredictions(true);
            } else {
                setPredictions([]);
                setShowPredictions(false);
            }
        } catch (err) {
            setPredictions([]);
            setShowPredictions(false);
        }
    } else {
        setPredictions([]);
        setShowPredictions(false);
    }
  };

  const handlePredictionSelect = (place: any) => {
      Sounds.select();
      const address = place.formattedAddress || place.displayName;
      const lat = place.location.lat();
      const lng = place.location.lng();

      setInputValue(address);
      setShowPredictions(false);
      
      setPreferences(prev => ({
           ...prev,
           address: address,
           lat: lat,
           lng: lng
       }));
  };

  const handleLocateMe = () => {
    if (!navigator.geolocation) return;
    Sounds.locate();
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        const geocoder = new (window as any).google.maps.Geocoder();
        geocoder.geocode({ location: { lat: latitude, lng: longitude } }, (results: any[], status: string) => {
          if (status === 'OK' && results[0]) {
             setPreferences(prev => ({
                ...prev,
                address: results[0].formatted_address,
                lat: latitude,
                lng: longitude
             }));
          }
          setLocating(false);
        });
      },
      (error) => {
        console.error("Geolocation failed", error);
        setLocating(false);
      }
    );
  };

  const handleVibeSelect = (vibe: HungerVibe) => {
      Sounds.mediumClick();
      setPreferences(prev => ({
          ...prev,
          vibe: vibe,
          freestylePrompt: '' // Clear custom prompt when selecting a preset
      }));
  };

  const handleFreestyleChange = (text: string) => {
      setPreferences(prev => ({
          ...prev,
          freestylePrompt: text
      }));
  };

  const handleFreestyleFocus = () => {
      Sounds.inputFocus();
      setPreferences(prev => ({
          ...prev,
          vibe: null // Clear vibe immediately on focus
      }));
  };

  const handlePriceSelect = (price: PricePoint | null) => {
      Sounds.mediumClick();
      setPreferences(prev => ({
          ...prev,
          price: price
      }));
  };

  const getVibeSubtitle = (vibe: HungerVibe): string => {
      switch(vibe) {
          case HungerVibe.GRAB_AND_GO: return "For speed and efficiency.";
          case HungerVibe.LIGHT_AND_CLEAN: return "For fresh, healthy options.";
          case HungerVibe.HEARTY_AND_RICH: return "For comfort and satisfaction.";
          case HungerVibe.SPICY_AND_BOLD: return "For intense, flavorful food.";
          case HungerVibe.VIEW_AND_VIBE: return "For a great atmosphere.";
          case HungerVibe.AUTHENTIC_AND_CLASSIC: return "For timeless, traditional meals.";
          default: return "";
      }
  }

  // Toggle between light and dark
  const toggleTheme = () => {
      const isDarkNow = effectiveTheme === 'dark';
      Sounds.toggle(!isDarkNow);
      setPreferences(prev => {
          // Switch to the opposite of current effective theme
          const nextTheme = isDarkNow ? ThemeMode.LIGHT : ThemeMode.DARK;
          return { ...prev, theme: nextTheme };
      });
  };

  const handleDietaryToggle = (restriction: DietaryRestriction) => {
    const currentRestrictions = preferences.dietaryRestrictions || [];
    const isRemoving = currentRestrictions.includes(restriction);
    Sounds.toggle(!isRemoving);
    setPreferences(prev => {
      const currentRestrictions = prev.dietaryRestrictions || [];
      const newRestrictions = currentRestrictions.includes(restriction)
        ? currentRestrictions.filter(r => r !== restriction)
        : [...currentRestrictions, restriction];
      return { ...prev, dietaryRestrictions: newRestrictions };
    });
  };

  if (appState !== AppState.INPUT) return null;

  const isDark = effectiveTheme === 'dark';
  const darkMuted = 'text-[#999]';
  const lightMuted = 'text-braun-text-muted';

  return (
    <div className={`min-h-screen flex items-center justify-center p-4 transition-colors duration-300 ${isDark ? 'bg-dark-bg' : 'bg-braun-bg'}`}>
      {/* Main Chassis */}
      <div className={`w-full max-w-5xl transition-colors duration-300 border shadow-braun-deep p-1 relative ${isDark ? 'bg-dark-bg border-dark-border shadow-dark-deep' : 'bg-braun-bg border-braun-border shadow-braun-deep'}`}>
        
        {/* Screw heads decorations */}
        <div className={`absolute top-2 left-2 w-2 h-2 rounded-full border opacity-50 flex items-center justify-center ${isDark ? 'border-dark-text-muted' : 'border-braun-text-muted'}`}><div className={`w-1.5 h-[1px] rotate-45 ${isDark ? 'bg-dark-text-muted' : 'bg-braun-text-muted'}`}></div></div>
        <div className={`absolute top-2 right-2 w-2 h-2 rounded-full border opacity-50 flex items-center justify-center ${isDark ? 'border-dark-text-muted' : 'border-braun-text-muted'}`}><div className={`w-1.5 h-[1px] rotate-45 ${isDark ? 'bg-dark-text-muted' : 'bg-braun-text-muted'}`}></div></div>
        <div className={`absolute bottom-2 left-2 w-2 h-2 rounded-full border opacity-50 flex items-center justify-center ${isDark ? 'border-dark-text-muted' : 'border-braun-text-muted'}`}><div className={`w-1.5 h-[1px] rotate-45 ${isDark ? 'bg-dark-text-muted' : 'bg-braun-text-muted'}`}></div></div>
        <div className={`absolute bottom-2 right-2 w-2 h-2 rounded-full border opacity-50 flex items-center justify-center ${isDark ? 'border-dark-text-muted' : 'border-braun-text-muted'}`}><div className={`w-1.5 h-[1px] rotate-45 ${isDark ? 'bg-dark-text-muted' : 'bg-braun-text-muted'}`}></div></div>

        {/* Branding Header */}
        <div className={`pt-6 pb-6 px-8 flex justify-between items-end border-b transition-colors duration-300 ${isDark ? 'border-dark-border bg-dark-surface' : 'border-braun-border bg-[#F4F4F0]'}`}>
            <div>
                <h1 className={`font-sans font-bold text-xl tracking-tight leading-none ${isDark ? 'text-dark-text' : 'text-braun-dark'}`}>THIRDFACE LUNCH DECIDER</h1>
                <p className={`font-mono text-[9px] tracking-[0.2em] mt-1 ${isDark ? darkMuted : lightMuted}`}>UNIT 01 / MK.III</p>
            </div>
            <div className="flex flex-col items-end gap-2">
                <button 
                    onClick={toggleTheme} 
                    aria-label={`Switch to ${isDark ? 'Light' : 'Dark'} Mode`}
                    className={`flex items-center gap-2 px-2 py-1 rounded-[1px] border transition-colors ${isDark ? 'border-dark-border bg-dark-bg' : 'border-braun-border bg-[#E5E5E0]'}`}
                >
                    <div className={`w-2 h-2 rounded-full ${isDark ? 'bg-braun-dark' : 'bg-braun-orange'}`}></div>
                    <span className={`font-mono text-[8px] uppercase tracking-wider ${isDark ? darkMuted : lightMuted}`}>
                        {isDark ? 'NIGHT MODE' : 'DAY MODE'}
                    </span>
                </button>
            </div>
        </div>

        {/* Input Module (LCD Style) */}
        <div className={`p-8 border-b transition-colors duration-300 ${isDark ? 'border-dark-border bg-[#111]' : 'border-braun-border bg-[#F0F0EC]'}`}>
            <div className="flex justify-between items-center mb-2">
                <label htmlFor="address-input" className={`font-mono text-[9px] font-bold uppercase tracking-widest ${isDark ? darkMuted : 'text-braun-dark'}`}>Target Vector</label>
                {locating && <span className="font-mono text-[9px] text-braun-orange animate-pulse" role="status">TRIANGULATING...</span>}
            </div>
            
            <div className={`p-4 pb-2 pt-2 rounded-sm shadow-inner border-b-2 relative group z-30 transition-colors duration-300 ${isDark ? 'bg-[#000] border-[#222]' : 'bg-[#222] border-[#444]'}`}>
                <div className="relative flex items-center">
                    <div className={`relative flex-grow h-14 flex items-center px-4 ${isDark ? 'bg-[#050505]' : 'bg-[#2A2A2A]'}`}>
                         <input
                            id="address-input"
                            type="text"
                            value={inputValue}
                            onChange={handleInputChange}
                                            onBlur={() => { Sounds.inputBlur(); setTimeout(() => setShowPredictions(false), 200); }}
                                            onFocus={() => { Sounds.inputFocus(); inputValue && predictions.length > 0 && setShowPredictions(true); }}
                            placeholder="ENTER ADDRESS..."
                            aria-expanded={showPredictions}
                            aria-haspopup="listbox"
                            className="w-full bg-transparent text-braun-orange font-mono text-lg md:text-2xl p-0 focus:outline-none placeholder:text-[#555] tracking-wider z-20"
                            style={{ textShadow: inputValue ? "0 0 5px rgba(255, 68, 0, 0.5)" : "none" }}
                        />
                         <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] bg-[length:100%_2px,3px_100%] z-30"></div>
                         
                         {showPredictions && predictions.length > 0 && (
                             <div 
                                role="listbox"
                                className={`absolute top-full left-0 right-0 mt-1 border shadow-braun-deep z-50 max-h-64 overflow-y-auto ${isDark ? 'bg-dark-bg border-dark-border' : 'bg-[#F4F4F0] border-braun-border'}`}
                            >
                                 {predictions.map((p) => (
                                     <button 
                                         key={p.id}
                                         role="option"
                                         onMouseDown={(e) => e.preventDefault()}
                                         onClick={() => handlePredictionSelect(p)}
                                         className={`w-full text-left p-3 border-b cursor-pointer font-mono text-xs truncate transition-colors group/item focus:outline-none focus:ring-1 focus:ring-white/30 ${isDark ? 'border-dark-border hover:bg-white/5 text-dark-text' : 'border-braun-border/50 hover:bg-braun-orange/10 text-braun-dark'}`}
                                     >
                                         <div className="flex flex-col pointer-events-none">
                                             <span className="font-bold group-hover/item:text-braun-orange">{p.displayName}</span>
                                             <span className={`${isDark ? darkMuted : lightMuted} text-[10px]`}>{p.formattedAddress}</span>
                                         </div>
                                     </button>
                                 ))}
                             </div>
                         )}
                    </div>
                    
                    <button 
                        onClick={handleLocateMe}
                        aria-label="Use Current Location"
                        className={`ml-2 w-12 h-12 border rounded-sm flex items-center justify-center transition-all shadow-md group-hover:shadow-[0_0_8px_rgba(255,68,0,0.1)] z-20 ${isDark ? 'bg-[#111] border-[#333] text-[#666] hover:text-braun-orange hover:border-braun-orange active:bg-black' : 'bg-[#333] border-[#555] text-[#888] hover:text-braun-orange hover:border-braun-orange active:bg-[#222]'}`}
                        title="Acquire GPS Lock"
                    >
                         <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                             <circle cx="12" cy="12" r="10" />
                             <line x1="12" y1="2" x2="12" y2="22" />
                             <line x1="2" y1="12" x2="22" y2="12" />
                             <circle cx="12" cy="12" r="3" />
                         </svg>
                    </button>
                </div>
            </div>
        </div>

        {/* TOP ROW: Vibes + Secondary Constraints */}
        <div className={`grid grid-cols-12 border-b ${isDark ? 'border-dark-border' : 'border-braun-border'}`}>
            
            {/* Top Left: Vibes Matrix (8 cols) */}
            <div className={`col-span-12 md:col-span-8 p-8 border-r border-b md:border-b-0 ${isDark ? 'bg-[#151515] border-dark-border' : 'bg-[#F9F9F7] border-braun-border'}`}>
                <label className={`block font-mono text-[9px] font-bold uppercase tracking-widest mb-4 ${isDark ? darkMuted : lightMuted}`}>Select Mental State</label>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-4" role="radiogroup" aria-label="Mental State">
                    {Object.values(HungerVibe).map((vibe) => (
                        <button
                            key={vibe}
                            role="radio"
                            aria-checked={preferences.vibe === vibe}
                            onClick={() => handleVibeSelect(vibe)}
                            className={`
                                relative p-3 flex flex-col justify-between items-start min-h-[90px]
                                transition-all duration-75 ease-out rounded-sm text-left group
                                border focus:outline-none focus:ring-1 focus:ring-white/30
                                ${preferences.vibe === vibe 
                                    ? `${isDark ? 'bg-black border-dark-text' : 'bg-white border-braun-dark'} shadow-[inset_0_1px_2px_rgba(0,0,0,0.1)] translate-y-[1px]` 
                                    : `${isDark ? 'bg-dark-surface border-dark-border shadow-[0_3px_0_#333]' : 'bg-[#F4F4F0] border-braun-border shadow-[0_3px_0_#D4D4D0]'} hover:-translate-y-[1px] ${isDark ? 'hover:shadow-[0_4px_0_#333]' : 'hover:shadow-[0_4px_0_#D4D4D0]'}`}
                            `}
                        >
                            <div className="flex justify-between w-full mb-2">
                                <div className={`w-2 h-2 rounded-full transition-all duration-300 ${preferences.vibe === vibe ? 'bg-braun-orange shadow-[0_0_6px_#FF4400]' : `${isDark ? 'bg-dark-border' : 'bg-braun-border'} group-hover:bg-braun-text-muted`}`}></div>
                            </div>
                            <div>
                                <span className={`block font-sans text-[11px] font-bold uppercase tracking-tight leading-none mb-1 ${isDark ? 'text-dark-text' : 'text-braun-dark'}`}>
                                    {vibe}
                                </span>
                                {preferences.vibe === vibe && (
                                    <span className={`block font-mono text-[8px] leading-tight tracking-tight mt-1 animate-scroll-up ${isDark ? darkMuted : lightMuted}`}>
                                        {getVibeSubtitle(vibe)}
                                    </span>
                                )}
                            </div>
                        </button>
                    ))}
                </div>

                {/* Freestyle Input as Alternative Option */}
                <div className="relative mt-6">
                     <div className="flex items-center gap-2 mb-2">
                        <div className={`h-[1px] flex-grow ${isDark ? 'bg-dark-border' : 'bg-braun-border'}`}></div>
                        <span className={`font-mono text-[8px] uppercase ${isDark ? darkMuted : lightMuted}`}>OR DEFINE CUSTOM PARAMETERS</span>
                        <div className={`h-[1px] flex-grow ${isDark ? 'bg-dark-border' : 'bg-braun-border'}`}></div>
                     </div>

                    <div className={`p-3 pb-1 pt-1 rounded-sm shadow-inner border-b-2 relative transition-colors duration-300 group ${isDark ? 'bg-[#000] border-[#222]' : 'bg-[#222] border-[#444]'}`}>
                        <div className={`relative h-12 flex items-center px-4 ${isDark ? 'bg-[#050505]' : 'bg-[#2A2A2A]'}`}>
                            <input
                                type="text"
                                aria-label="Custom Prompt"
                                value={preferences.freestylePrompt || ''}
                                onChange={(e) => handleFreestyleChange(e.target.value)}
                                onFocus={handleFreestyleFocus}
                                placeholder="DESCRIBE YOUR SPECIFIC CRAVING..."
                                className={`w-full bg-transparent font-mono text-sm md:text-base p-0 focus:outline-none tracking-wider z-20 text-braun-orange placeholder:text-[#555]`}
                                style={{ textShadow: preferences.freestylePrompt ? "0 0 5px rgba(255, 68, 0, 0.3)" : "none" }}
                            />
                            {/* Scanline overlay */}
                            <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] bg-[length:100%_2px,3px_100%] z-30 opacity-70"></div>
                            
                            {/* Active Indicator */}
                            {preferences.freestylePrompt && !preferences.vibe && (
                                <div className="absolute right-3 top-1/2 -translate-y-1/2 w-1.5 h-1.5 bg-braun-orange rounded-full animate-pulse shadow-[0_0_5px_#FF4400]"></div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Top Right: Range & Payment (4 cols) */}
            <div className={`col-span-12 md:col-span-4 p-8 flex flex-col justify-start gap-8 ${isDark ? 'bg-[#111]' : 'bg-[#F0F0EC]'}`}>
                {/* Proximity Slider */}
                <div>
                    <label className={`block font-mono text-[9px] font-bold uppercase tracking-widest mb-4 ${isDark ? darkMuted : lightMuted}`}>Proximity Range</label>
                    <div className={`flex h-12 rounded-sm border p-1 gap-1 ${isDark ? 'bg-dark-surface border-dark-border' : 'bg-[#E5E5E0] border-braun-border'}`} role="radiogroup" aria-label="Walk Limit">
                        {Object.values(WalkLimit).map((limit) => (
                            <button
                                key={limit}
                                role="radio"
                                aria-checked={preferences.walkLimit === limit}
                                onClick={() => { Sounds.lightClick(); setPreferences(prev => ({ ...prev, walkLimit: limit })); }}
                                className={`flex-1 flex items-center justify-center rounded-[1px] font-mono text-[9px] font-bold uppercase tracking-wide transition-all duration-200 outline-none focus:ring-1 focus:ring-white/30
                                    ${preferences.walkLimit === limit 
                                        ? `${isDark ? 'bg-dark-text text-dark-bg' : 'bg-braun-dark text-white'} shadow-sm` 
                                        : `${isDark ? 'text-dark-text-muted hover:bg-white/10 hover:text-white' : 'text-braun-text-muted hover:bg-white/50 hover:text-braun-dark'}`
                                    }
                                `}
                            >
                                {limit}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Payment Override */}
                <div>
                    <label className={`block font-mono text-[9px] font-bold uppercase tracking-widest mb-4 ${isDark ? darkMuted : lightMuted}`}>Payment Constraint</label>
                    <button
                        role="switch"
                        aria-checked={preferences.noCash}
                        onClick={() => { Sounds.toggle(!preferences.noCash); setPreferences(prev => ({ ...prev, noCash: !prev.noCash })); }}
                        className={`
                            w-full h-12 border rounded-sm flex items-center justify-center transition-all duration-150 group outline-none focus:ring-1 focus:ring-white/30
                            ${preferences.noCash 
                                ? `${isDark ? 'bg-dark-text text-dark-bg' : 'bg-braun-dark text-white'} shadow-sm` 
                                : `${isDark ? 'bg-dark-surface border-dark-border shadow-dark-raised hover:shadow-[0_2px_0_#333]' : 'bg-[#E5E5E0] border-braun-border shadow-braun-raised hover:shadow-[0_2px_0_#D4D4D0]'} hover:translate-y-[1px]`
                            }
                        `}
                    >
                        <span className={`font-mono text-[10px] font-bold uppercase tracking-widest ${preferences.noCash ? (isDark ? 'text-dark-bg' : 'text-white') : (isDark ? 'text-dark-text' : 'text-braun-dark')}`}>
                             {preferences.noCash ? 'Cashless Only' : 'All Payment Types'}
                        </span>
                    </button>
                </div>

                {/* Dietary Needs */}
                <div>
                    <label className={`block font-mono text-[9px] font-bold uppercase tracking-widest mb-4 ${isDark ? darkMuted : lightMuted}`}>Dietary Needs</label>
                    <div className="flex flex-wrap gap-2" role="group" aria-label="Dietary Restrictions">
                        {Object.values(DietaryRestriction).map((restriction) => (
                            <button
                                key={restriction}
                                role="checkbox"
                                aria-checked={(preferences.dietaryRestrictions || []).includes(restriction)}
                                onClick={() => handleDietaryToggle(restriction)}
                                className={`px-3 py-2 rounded-[1px] font-mono text-[9px] font-bold uppercase tracking-wide transition-all duration-200 outline-none border focus:ring-1 focus:ring-white/30
                                    ${(preferences.dietaryRestrictions || []).includes(restriction)
                                        ? `${isDark ? 'bg-dark-text text-dark-bg border-dark-text' : 'bg-braun-dark text-white border-braun-dark'} shadow-sm` 
                                        : `${isDark ? 'text-dark-text-muted border-dark-border hover:bg-white/10 hover:text-white' : 'text-braun-text-muted border-braun-border hover:bg-white/50 hover:text-braun-dark'}`
                                    }
                                `}
                            >
                                {restriction}
                            </button>
                        ))}
                    </div>
                </div>
            </div>
        </div>

        {/* BOTTOM ROW: Budget + Action */}
        <div className={`grid grid-cols-12 ${isDark ? 'bg-dark-bg' : 'bg-[#F4F4F0]'}`}>
            
            {/* Bottom Left: Budget (8 cols) */}
            <div className={`col-span-12 md:col-span-8 p-8 border-r border-b md:border-b-0 flex flex-col justify-center ${isDark ? 'border-dark-border' : 'border-braun-border'}`}>
                <div className="flex justify-between items-center mb-4">
                    <label className={`block font-mono text-[9px] font-bold uppercase tracking-widest ${isDark ? darkMuted : lightMuted}`}>Budget Protocol</label>
                </div>
                
                <div className={`flex h-14 rounded-sm border p-1 gap-1 ${isDark ? 'bg-dark-surface border-dark-border' : 'bg-[#E5E5E0] border-braun-border'}`} role="radiogroup" aria-label="Budget">
                    
                    {/* Any Budget */}
                    <button
                        role="radio"
                        aria-checked={preferences.price === null}
                        onClick={() => handlePriceSelect(null)}
                        className={`flex-1 flex flex-col items-center justify-center rounded-[1px] btn-toggle outline-none focus:ring-1 focus:ring-white/30
                            ${preferences.price === null 
                                ? `${isDark ? 'bg-dark-text text-dark-bg' : 'bg-braun-dark text-white'} shadow-md`
                                : `${isDark ? 'text-dark-text-muted hover:bg-white/10 hover:text-white' : 'text-braun-text-muted hover:bg-white/50 hover:text-braun-dark'}`
                            }
                        `}
                    >
                        <span className="font-mono text-[10px] font-bold uppercase tracking-wide">Any Budget</span>
                    </button>

                    {/* Paying Myself ($ - $$) */}
                    <button
                        role="radio"
                        aria-checked={preferences.price === PricePoint.PAYING_MYSELF}
                        onClick={() => handlePriceSelect(PricePoint.PAYING_MYSELF)}
                        className={`flex-1 flex flex-col items-center justify-center rounded-[1px] btn-toggle outline-none focus:ring-1 focus:ring-white/30
                            ${preferences.price === PricePoint.PAYING_MYSELF 
                                ? `${isDark ? 'bg-dark-text text-dark-bg' : 'bg-braun-dark text-white'} shadow-md`
                                : `${isDark ? 'text-dark-text-muted hover:bg-white/10 hover:text-white' : 'text-braun-text-muted hover:bg-white/50 hover:text-braun-dark'}`
                            }
                        `}
                    >
                        <span className="font-mono text-[10px] font-bold uppercase tracking-wide">Paying Myself</span>
                        <span className={`font-mono text-[8px] mt-0.5 ${preferences.price === PricePoint.PAYING_MYSELF ? (isDark ? 'text-dark-bg/60' : 'text-white/60') : (isDark ? 'text-dark-text-muted/60' : 'text-braun-text-muted/60')}`}>$ – $$</span>
                    </button>

                    {/* Company Card ($$$ - $$$$) */}
                    <button
                        role="radio"
                        aria-checked={preferences.price === PricePoint.COMPANY_CARD}
                        onClick={() => handlePriceSelect(PricePoint.COMPANY_CARD)}
                        className={`flex-1 flex flex-col items-center justify-center rounded-[1px] btn-toggle outline-none focus:ring-1 focus:ring-white/30
                            ${preferences.price === PricePoint.COMPANY_CARD 
                                ? `${isDark ? 'bg-dark-text text-dark-bg' : 'bg-braun-dark text-white'} shadow-md`
                                : `${isDark ? 'text-dark-text-muted hover:bg-white/10 hover:text-white' : 'text-braun-text-muted hover:bg-white/50 hover:text-braun-dark'}`
                            }
                        `}
                    >
                        <span className="font-mono text-[10px] font-bold uppercase tracking-wide">Company Card</span>
                        <span className={`font-mono text-[8px] mt-0.5 ${preferences.price === PricePoint.COMPANY_CARD ? (isDark ? 'text-dark-bg/60' : 'text-white/60') : (isDark ? 'text-dark-text-muted/60' : 'text-braun-text-muted/60')}`}>$$$ – $$$$</span>
                    </button>
                </div>
            </div>

            {/* Bottom Right: Action Button (4 cols) */}
            <div className="col-span-12 md:col-span-4 p-8 flex">
                <button
                    onClick={() => { Sounds.firmClick(); onCalculate(); }}
                    disabled={!preferences.lat || (!preferences.vibe && !preferences.freestylePrompt)}
                    aria-busy={(appState as AppState) === AppState.PROCESSING}
                    className={`
                        w-full h-full min-h-[60px] relative transition-all duration-200 ease-out rounded-sm flex items-center justify-center group overflow-hidden focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-white/30
                        ${(!preferences.lat || (!preferences.vibe && !preferences.freestylePrompt))
                            ? `${isDark ? 'bg-dark-surface border-dark-border' : 'bg-[#E5E5E0] border-braun-border'} cursor-not-allowed opacity-60` 
                            : 'bg-braun-orange border border-braun-orange shadow-braun-deep hover:shadow-[0_0_20px_rgba(255,68,0,0.4)] hover:scale-[1.02] active:scale-[0.98]'
                        }
                    `}
                >
                    <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"></div>

                    <div className="flex flex-col items-center gap-1 z-10">
                        <div className="flex items-center gap-2">
                             {!preferences.lat ? (
                                 <div className={`w-2 h-2 rounded-full ${isDark ? 'bg-dark-text-muted' : 'bg-braun-text-muted'}`}></div>
                             ) : (
                                 <div className={`w-2 h-2 rounded-full ${(!preferences.vibe && !preferences.freestylePrompt) ? 'bg-braun-text-muted' : 'bg-white animate-pulse shadow-[0_0_5px_rgba(255,255,255,0.8)]'}`}></div>
                             )}
                             <span className={`font-sans font-bold text-sm tracking-widest uppercase ${(!preferences.lat || (!preferences.vibe && !preferences.freestylePrompt)) ? (isDark ? 'text-dark-text-muted' : 'text-braun-text-muted') : 'text-white'}`}>
                                 {(!preferences.vibe && !preferences.freestylePrompt) ? 'SELECT VIBE' : 'INITIALIZE'}
                             </span>
                        </div>
                    </div>
                </button>
            </div>
        </div>

      </div>
      
      {/* Background decoration lines */}
      <div className="fixed inset-0 pointer-events-none -z-10 flex justify-center">
            <div className={`w-px h-full opacity-20 mr-96 ${isDark ? 'bg-dark-border' : 'bg-braun-border'}`}></div>
            <div className={`w-px h-full opacity-20 ml-96 ${isDark ? 'bg-dark-border' : 'bg-braun-border'}`}></div>
      </div>
      
      {/* Footer: Credit + Imprint */}
      <div className={`fixed bottom-4 right-4 font-mono text-[9px] tracking-wider flex items-center gap-3 ${isDark ? 'text-dark-text-muted/40' : 'text-braun-text-muted/40'}`}>
        <span>
          Built by <ScrambleText 
            text="NOAH NAWARA" 
            href="https://www.linkedin.com/in/noahnawara/"
            className={isDark ? 'text-dark-text-muted/40' : 'text-braun-text-muted/40'} 
          />
        </span>
        <span className={isDark ? 'text-dark-text-muted/20' : 'text-braun-text-muted/20'}>|</span>
        <a 
          href="https://thirdface.com/imprint" 
          target="_blank" 
          rel="noopener noreferrer"
          className={`transition-all duration-200 hover:text-braun-orange ${isDark ? 'text-dark-text-muted/40 hover:text-braun-orange' : 'text-braun-text-muted/40 hover:text-braun-orange'}`}
        >
          Imprint
        </a>
      </div>
    </div>
  );
};

export default ControlPanel;
