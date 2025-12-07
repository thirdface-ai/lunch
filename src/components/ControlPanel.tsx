import React, { useState, useEffect, useRef } from 'react';
import { AppState, TransportMode, HungerVibe, PricePoint, UserPreferences, WalkLimit, ThemeMode, DietaryRestriction } from '../types';
import Sounds from '../utils/sounds';

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
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  // Session token for Autocomplete API - bundles multiple autocomplete requests into one billing session
  // This reduces costs by ~60% by grouping autocomplete requests with the subsequent Place Details call
  const sessionTokenRef = useRef<google.maps.places.AutocompleteSessionToken | null>(null);
  // Store the AutocompleteSuggestion class reference
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const autocompleteSuggestionRef = useRef<any>(null);

  /**
   * Get or create a session token for Autocomplete API
   * The token bundles multiple autocomplete requests into one billing session
   * Token is reset when a prediction is selected (completing the session)
   */
  const getSessionToken = (): google.maps.places.AutocompleteSessionToken => {
    if (!sessionTokenRef.current) {
      sessionTokenRef.current = new google.maps.places.AutocompleteSessionToken();
    }
    return sessionTokenRef.current;
  };

  // Initialize Places library for AutocompleteSuggestion (new API, replaces deprecated AutocompleteService)
  useEffect(() => {
    const initAutocomplete = async () => {
        try {
            if ((window as any).google && (window as any).google.maps) {
                // Import the places library and get AutocompleteSuggestion class
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const placesLib = await (window as any).google.maps.importLibrary("places") as any;
                autocompleteSuggestionRef.current = placesLib.AutocompleteSuggestion;
            }
        } catch (error) {
            console.error("Failed to load Maps Places library", error);
        }
    };
    initAutocomplete();
    
    // Cleanup debounce timer on unmount
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  // Sync Input with Preferences (e.g. from Geolocation)
  useEffect(() => {
    setInputValue(preferences.address);
  }, [preferences.address]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setInputValue(value);
    
    // Clear previous debounce timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    
    if (value && value.length > 2 && autocompleteSuggestionRef.current) {
      // Debounce: wait 300ms after user stops typing before making API call
      debounceTimerRef.current = setTimeout(async () => {
        try {
          // Use new AutocompleteSuggestion API (replaces deprecated AutocompleteService)
          const request = {
            input: value,
            includedPrimaryTypes: ['geocode', 'establishment'],
            // Session token bundles all autocomplete requests + subsequent Place Details into one billing session
            // This reduces API costs by ~60% for address input
            sessionToken: getSessionToken()
          };
          
          const { suggestions } = await autocompleteSuggestionRef.current.fetchAutocompleteSuggestions(request);
          
          if (suggestions && suggestions.length > 0) {
            // Map new API response format to match the format expected by the UI
            // The new API has placePrediction.mainText and placePrediction.secondaryText
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const mappedPredictions = suggestions.map((suggestion: any) => {
              const pred = suggestion.placePrediction;
              return {
                place_id: pred.placeId,
                description: pred.text?.toString() || '',
                // Map to structured_formatting format that the UI expects
                structured_formatting: {
                  main_text: pred.mainText?.toString() || pred.text?.toString() || '',
                  secondary_text: pred.secondaryText?.toString() || ''
                },
                // Store the placePrediction for later use in handlePredictionSelect
                _placePrediction: pred
              };
            });
            setPredictions(mappedPredictions);
            setShowPredictions(true);
          } else {
            setPredictions([]);
            setShowPredictions(false);
          }
        } catch (error) {
          console.error('Autocomplete suggestion failed:', error);
          setPredictions([]);
          setShowPredictions(false);
        }
      }, 300);
    } else {
      setPredictions([]);
      setShowPredictions(false);
    }
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handlePredictionSelect = async (prediction: any) => {
      Sounds.select();
      const address = prediction.description;
      
      setInputValue(address);
      setShowPredictions(false);
      
      // Use Place Details with session token instead of Geocoder
      // This completes the autocomplete session and bundles all requests into one billing session
      // Saves ~60% on autocomplete costs compared to separate Geocoding call
      try {
        let place;
        
        // If we have the new API's placePrediction, use its toPlace() method
        if (prediction._placePrediction && typeof prediction._placePrediction.toPlace === 'function') {
          place = prediction._placePrediction.toPlace();
        } else {
          // Fallback to creating Place manually (for legacy format)
          const { Place } = await google.maps.importLibrary('places') as google.maps.PlacesLibrary;
          place = new Place({ id: prediction.place_id });
        }
        
        // Fetch only the geometry field we need, using the session token to complete the session
        await place.fetchFields({ 
          fields: ['location'],
          sessionToken: sessionTokenRef.current
        });
        
        // Reset session token after selection (completes the billing session)
        sessionTokenRef.current = null;
        
        if (place.location) {
          setPreferences(prev => ({
            ...prev,
            address: address,
            lat: place.location!.lat(),
            lng: place.location!.lng()
          }));
        } else {
          // Fallback: just set the address without coordinates
          console.warn('Place Details returned no location for:', prediction.place_id);
          setPreferences(prev => ({
            ...prev,
            address: address
          }));
        }
      } catch (error) {
        // Reset session token even on error
        sessionTokenRef.current = null;
        
        console.warn('Place Details failed, falling back to Geocoder:', error);
        // Fallback to Geocoder if Place Details fails
        const geocoder = new google.maps.Geocoder();
        geocoder.geocode({ placeId: prediction.place_id }, (results, status) => {
          if (status === 'OK' && results && results[0]) {
            const location = results[0].geometry.location;
            setPreferences(prev => ({
              ...prev,
              address: address,
              lat: location.lat(),
              lng: location.lng()
            }));
          } else {
            console.warn('Geocoding also failed for place:', prediction.place_id, status);
            setPreferences(prev => ({
              ...prev,
              address: address
            }));
          }
        });
      }
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
          // Toggle: if same vibe is clicked, unselect it (set to null)
          vibe: prev.vibe === vibe ? null : vibe,
          freestylePrompt: prev.vibe === vibe ? prev.freestylePrompt : '' // Only clear custom prompt when selecting a new preset
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
  
  // Check if we're in mock mode (allows testing without API keys)
  const isMockMode = () => {
    const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    const hasGoogle = !!(window as any).google?.maps;
    const forceMock = new URLSearchParams(window.location.search).get('mock') === 'true';
    return forceMock || (isLocalhost && !hasGoogle);
  };
  const mockMode = isMockMode();

  return (
    <div className={`flex-1 flex items-center justify-center p-3 sm:p-4 transition-colors duration-300 ${isDark ? 'bg-dark-bg' : 'bg-braun-bg'}`}>
      {/* Main Chassis */}
      <div className={`w-full max-w-5xl transition-colors duration-300 border shadow-braun-deep p-1 relative ${isDark ? 'bg-dark-bg border-dark-border shadow-dark-deep' : 'bg-braun-bg border-braun-border shadow-braun-deep'}`}>
        
        {/* Screw heads decorations - hidden on mobile */}
        <div className={`hidden sm:flex absolute top-2 left-2 w-2 h-2 rounded-full border opacity-50 items-center justify-center ${isDark ? 'border-dark-text-muted' : 'border-braun-text-muted'}`}><div className={`w-1.5 h-[1px] rotate-45 ${isDark ? 'bg-dark-text-muted' : 'bg-braun-text-muted'}`}></div></div>
        <div className={`hidden sm:flex absolute top-2 right-2 w-2 h-2 rounded-full border opacity-50 items-center justify-center ${isDark ? 'border-dark-text-muted' : 'border-braun-text-muted'}`}><div className={`w-1.5 h-[1px] rotate-45 ${isDark ? 'bg-dark-text-muted' : 'bg-braun-text-muted'}`}></div></div>
        <div className={`hidden sm:flex absolute bottom-2 left-2 w-2 h-2 rounded-full border opacity-50 items-center justify-center ${isDark ? 'border-dark-text-muted' : 'border-braun-text-muted'}`}><div className={`w-1.5 h-[1px] rotate-45 ${isDark ? 'bg-dark-text-muted' : 'bg-braun-text-muted'}`}></div></div>
        <div className={`hidden sm:flex absolute bottom-2 right-2 w-2 h-2 rounded-full border opacity-50 items-center justify-center ${isDark ? 'border-dark-text-muted' : 'border-braun-text-muted'}`}><div className={`w-1.5 h-[1px] rotate-45 ${isDark ? 'bg-dark-text-muted' : 'bg-braun-text-muted'}`}></div></div>

        {/* Branding Header */}
        <div className={`pt-4 pb-4 px-4 sm:pt-6 sm:pb-6 sm:px-8 flex justify-between items-start sm:items-end border-b transition-colors duration-300 ${isDark ? 'border-dark-border bg-dark-surface' : 'border-braun-border bg-[#F4F4F0]'}`}>
            <div>
                <div className="flex items-center gap-2">
                    <h1 className={`font-sans font-bold text-lg sm:text-xl tracking-tight leading-none ${isDark ? 'text-dark-text' : 'text-braun-dark'}`}>THIRDFACE FOOD DECIDER</h1>
                    {mockMode && (
                        <span className="font-mono text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.5 bg-blue-500 text-white rounded-[1px]">
                            MOCK
                        </span>
                    )}
                </div>
                <p className={`font-mono text-[9px] tracking-[0.2em] mt-1 ${isDark ? darkMuted : lightMuted}`}>{mockMode ? 'TEST MODE / NO API KEYS' : 'UNIT 01 / MK.III'}</p>
            </div>
            <button 
                onClick={toggleTheme} 
                aria-label={`Switch to ${isDark ? 'Light' : 'Dark'} Mode`}
                className={`flex items-center gap-1.5 px-2 py-1.5 sm:px-2 sm:py-1 rounded-[1px] border transition-colors shrink-0 ${isDark ? 'border-dark-border bg-dark-bg' : 'border-braun-border bg-[#E5E5E0]'}`}
            >
                <div className={`w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full ${isDark ? 'bg-braun-dark' : 'bg-braun-orange'}`}></div>
                <span className={`font-mono text-[8px] sm:text-[8px] uppercase tracking-wider ${isDark ? darkMuted : lightMuted}`}>
                    {isDark ? 'NIGHT' : 'DAY'}
                </span>
            </button>
        </div>

        {/* Input Module (LCD Style) */}
        <div className={`p-4 sm:p-6 border-b transition-colors duration-300 ${isDark ? 'border-dark-border bg-[#0C0C0C]' : 'border-braun-border bg-[#EAEAE6]'}`}>
            <div className="flex justify-between items-center mb-2">
                <label htmlFor="address-input" className={`font-mono text-[10px] sm:text-[9px] font-bold uppercase tracking-widest ${isDark ? darkMuted : 'text-braun-dark'}`}>Target Vector</label>
                {locating && <span className="font-mono text-[9px] text-braun-orange animate-pulse" role="status">TRIANGULATING...</span>}
            </div>
            
            <div className={`p-2 rounded-[2px] border relative group z-30 transition-colors duration-300 ${isDark ? 'bg-[#0A0A0A] border-[#1A1A1A]' : 'bg-[#1A1A1A] border-[#333]'}`}>
                <div className="relative flex items-center gap-2">
                    <div className={`relative flex-grow h-10 flex items-center px-3 rounded-[1px] ${isDark ? 'bg-[#050505]' : 'bg-[#222]'}`}>
                         <input
                            id="address-input"
                            type="text"
                            value={inputValue}
                            onChange={handleInputChange}
                            onBlur={() => { Sounds.inputBlur(); setTimeout(() => setShowPredictions(false), 200); }}
                            onFocus={() => { Sounds.inputFocus(); inputValue && predictions.length > 0 && setShowPredictions(true); }}
                            placeholder="Enter address..."
                            aria-expanded={showPredictions}
                            aria-haspopup="listbox"
                            className="w-full bg-transparent text-braun-orange font-mono text-sm p-0 focus:outline-none placeholder:text-[#444] tracking-wide z-20"
                            style={{ textShadow: inputValue ? "0 0 8px rgba(255, 68, 0, 0.4)" : "none" }}
                        />
                         {/* Subtle scanlines */}
                         <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(rgba(0,0,0,0)_50%,rgba(0,0,0,0.15)_50%)] bg-[length:100%_2px] opacity-30 z-30 rounded-[1px]"></div>
                         
                         {showPredictions && predictions.length > 0 && (
                             <div 
                                role="listbox"
                                className={`absolute top-full left-0 right-0 mt-2 border shadow-lg z-50 max-h-64 overflow-y-auto rounded-[2px] ${isDark ? 'bg-dark-bg border-dark-border' : 'bg-[#F4F4F0] border-braun-border'}`}
                            >
                                 {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                                {predictions.map((p: any) => (
                                     <button 
                                         key={p.place_id}
                                         role="option"
                                         onMouseDown={(e) => e.preventDefault()}
                                         onClick={() => handlePredictionSelect(p)}
                                         className={`w-full text-left p-3 border-b cursor-pointer font-mono text-xs truncate transition-colors group/item focus:outline-none focus:ring-1 focus:ring-white/30 ${isDark ? 'border-dark-border hover:bg-white/5 text-dark-text' : 'border-braun-border/50 hover:bg-braun-orange/10 text-braun-dark'}`}
                                     >
                                         <div className="flex flex-col pointer-events-none">
                                             <span className="font-bold group-hover/item:text-braun-orange">{p.structured_formatting.main_text}</span>
                                             <span className={`${isDark ? darkMuted : lightMuted} text-[10px]`}>{p.structured_formatting.secondary_text}</span>
                                         </div>
                                     </button>
                                 ))}
                             </div>
                         )}
                    </div>
                    
                    <button 
                        onClick={handleLocateMe}
                        aria-label="Use Current Location"
                        className={`w-10 h-10 rounded-[1px] flex items-center justify-center transition-all flex-shrink-0 ${isDark ? 'bg-[#0A0A0A] text-[#555] hover:text-braun-orange' : 'bg-[#2A2A2A] text-[#666] hover:text-braun-orange'}`}
                        title="Acquire GPS Lock"
                    >
                         <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                             <circle cx="12" cy="12" r="8" />
                             <line x1="12" y1="2" x2="12" y2="6" />
                             <line x1="12" y1="18" x2="12" y2="22" />
                             <line x1="2" y1="12" x2="6" y2="12" />
                             <line x1="18" y1="12" x2="22" y2="12" />
                             <circle cx="12" cy="12" r="2" fill="currentColor" />
                         </svg>
                    </button>
                </div>
            </div>
        </div>

        {/* TOP ROW: Vibes + Secondary Constraints */}
        <div className={`grid grid-cols-12 border-b ${isDark ? 'border-dark-border' : 'border-braun-border'}`}>
            
            {/* Top Left: Vibes Matrix (8 cols) */}
            <div className={`col-span-12 md:col-span-8 p-4 sm:p-8 border-r border-b md:border-b-0 ${isDark ? 'bg-[#151515] border-dark-border' : 'bg-[#F9F9F7] border-braun-border'}`}>
                <label className={`block font-mono text-[10px] sm:text-[9px] font-bold uppercase tracking-widest mb-3 sm:mb-4 ${isDark ? darkMuted : lightMuted}`}>Select Mental State</label>
                
                <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-3 mb-4" role="radiogroup" aria-label="Mental State">
                    {Object.values(HungerVibe).map((vibe) => (
                        <button
                            key={vibe}
                            role="radio"
                            aria-checked={preferences.vibe === vibe}
                            onClick={() => handleVibeSelect(vibe)}
                            className={`
                                relative p-3 sm:p-3 flex flex-col justify-between items-start min-h-[56px] sm:min-h-[68px]
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
                                <span className={`block font-sans text-[10px] sm:text-[11px] font-bold uppercase tracking-tight leading-tight sm:leading-none mb-1 ${isDark ? 'text-dark-text' : 'text-braun-dark'}`}>
                                    {vibe}
                                </span>
                                {preferences.vibe === vibe && (
                                    <span className={`hidden sm:block font-mono text-[8px] leading-tight tracking-tight mt-1 animate-scroll-up ${isDark ? darkMuted : lightMuted}`}>
                                        {getVibeSubtitle(vibe)}
                                    </span>
                                )}
                            </div>
                        </button>
                    ))}
                </div>

                {/* Freestyle Input as Alternative Option */}
                <div className="relative mt-4 sm:mt-5">
                     <div className="flex items-center gap-2 mb-2">
                        <div className={`h-[1px] flex-grow ${isDark ? 'bg-dark-border' : 'bg-braun-border'}`}></div>
                        <span className={`font-mono text-[8px] uppercase whitespace-nowrap ${isDark ? darkMuted : lightMuted}`}>OR CUSTOM</span>
                        <div className={`h-[1px] flex-grow ${isDark ? 'bg-dark-border' : 'bg-braun-border'}`}></div>
                     </div>

                    <div className={`p-2 rounded-[2px] border relative transition-colors duration-300 group ${isDark ? 'bg-[#0A0A0A] border-[#1A1A1A]' : 'bg-[#1A1A1A] border-[#333]'}`}>
                        <div className={`relative h-10 flex items-center px-3 rounded-[1px] ${isDark ? 'bg-[#050505]' : 'bg-[#222]'}`}>
                            <input
                                type="text"
                                aria-label="Custom Prompt"
                                value={preferences.freestylePrompt || ''}
                                onChange={(e) => handleFreestyleChange(e.target.value)}
                                onFocus={handleFreestyleFocus}
                                placeholder="Describe your specific craving..."
                                className={`w-full bg-transparent font-mono text-sm p-0 focus:outline-none tracking-wide z-20 text-braun-orange placeholder:text-[#444]`}
                                style={{ textShadow: preferences.freestylePrompt ? "0 0 8px rgba(255, 68, 0, 0.4)" : "none" }}
                            />
                            {/* Subtle scanlines */}
                            <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(rgba(0,0,0,0)_50%,rgba(0,0,0,0.15)_50%)] bg-[length:100%_2px] opacity-30 z-30 rounded-[1px]"></div>
                            
                            {/* Active Indicator */}
                            {preferences.freestylePrompt && !preferences.vibe && (
                                <div className="absolute right-3 top-1/2 -translate-y-1/2 w-1.5 h-1.5 bg-braun-orange rounded-full animate-pulse shadow-[0_0_6px_#FF4400]"></div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Top Right: Filters Section (4 cols) - aligned with left column */}
            <div className={`col-span-12 md:col-span-4 p-4 sm:p-8 flex flex-col justify-between ${isDark ? 'bg-[#111]' : 'bg-[#F0F0EC]'}`}>
                {/* Top group: Additional Filters + Dietary Needs (aligns with Mental State) */}
                <div className="space-y-5 sm:space-y-6">
                    {/* Additional Filters */}
                    <div>
                        <label className={`block font-mono text-[10px] sm:text-[9px] font-bold uppercase tracking-widest mb-3 sm:mb-4 ${isDark ? darkMuted : lightMuted}`}>Additional Filters</label>
                        <div className="flex flex-wrap gap-2" role="group" aria-label="Additional Filters">
                            <button
                                role="checkbox"
                                aria-checked={preferences.newlyOpenedOnly}
                                onClick={() => { Sounds.toggle(!preferences.newlyOpenedOnly); setPreferences(prev => ({ ...prev, newlyOpenedOnly: !prev.newlyOpenedOnly })); }}
                                className={`px-3 py-2.5 sm:py-2 rounded-[1px] font-mono text-[10px] sm:text-[9px] font-bold uppercase tracking-wide transition-all duration-200 outline-none border focus:ring-1 focus:ring-white/30
                                    ${preferences.newlyOpenedOnly
                                        ? `${isDark ? 'bg-dark-text text-dark-bg border-dark-text' : 'bg-braun-dark text-white border-braun-dark'} shadow-sm` 
                                        : `${isDark ? 'text-dark-text-muted border-dark-border hover:bg-white/10 hover:text-white' : 'text-braun-text-muted border-braun-border hover:bg-white/50 hover:text-braun-dark'}`
                                    }
                                `}
                            >
                                Fresh Drops
                            </button>
                            <button
                                role="checkbox"
                                aria-checked={preferences.noCash}
                                onClick={() => { Sounds.toggle(!preferences.noCash); setPreferences(prev => ({ ...prev, noCash: !prev.noCash })); }}
                                className={`px-3 py-2.5 sm:py-2 rounded-[1px] font-mono text-[10px] sm:text-[9px] font-bold uppercase tracking-wide transition-all duration-200 outline-none border focus:ring-1 focus:ring-white/30
                                    ${preferences.noCash
                                        ? `${isDark ? 'bg-dark-text text-dark-bg border-dark-text' : 'bg-braun-dark text-white border-braun-dark'} shadow-sm` 
                                        : `${isDark ? 'text-dark-text-muted border-dark-border hover:bg-white/10 hover:text-white' : 'text-braun-text-muted border-braun-border hover:bg-white/50 hover:text-braun-dark'}`
                                    }
                                `}
                            >
                                No Cash
                            </button>
                            <button
                                role="checkbox"
                                aria-checked={preferences.popularOnly}
                                onClick={() => { Sounds.toggle(!preferences.popularOnly); setPreferences(prev => ({ ...prev, popularOnly: !prev.popularOnly })); }}
                                className={`px-3 py-2.5 sm:py-2 rounded-[1px] font-mono text-[10px] sm:text-[9px] font-bold uppercase tracking-wide transition-all duration-200 outline-none border focus:ring-1 focus:ring-white/30
                                    ${preferences.popularOnly
                                        ? `${isDark ? 'bg-dark-text text-dark-bg border-dark-text' : 'bg-braun-dark text-white border-braun-dark'} shadow-sm` 
                                        : `${isDark ? 'text-dark-text-muted border-dark-border hover:bg-white/10 hover:text-white' : 'text-braun-text-muted border-braun-border hover:bg-white/50 hover:text-braun-dark'}`
                                    }
                                `}
                            >
                                Trending
                            </button>
                        </div>
                    </div>

                    {/* Dietary Needs */}
                    <div>
                        <label className={`block font-mono text-[10px] sm:text-[9px] font-bold uppercase tracking-widest mb-3 sm:mb-4 ${isDark ? darkMuted : lightMuted}`}>Dietary Needs</label>
                        <div className="flex flex-wrap gap-2" role="group" aria-label="Dietary Restrictions">
                            {Object.values(DietaryRestriction).map((restriction) => (
                                <button
                                    key={restriction}
                                    role="checkbox"
                                    aria-checked={(preferences.dietaryRestrictions || []).includes(restriction)}
                                    onClick={() => handleDietaryToggle(restriction)}
                                    className={`px-3 py-2.5 sm:py-2 rounded-[1px] font-mono text-[10px] sm:text-[9px] font-bold uppercase tracking-wide transition-all duration-200 outline-none border focus:ring-1 focus:ring-white/30
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

                {/* Bottom: Proximity Range (aligns with custom input) */}
                <div className="mt-4 sm:mt-0">
                    <label className={`block font-mono text-[10px] sm:text-[9px] font-bold uppercase tracking-widest mb-3 sm:mb-4 ${isDark ? darkMuted : lightMuted}`}>Proximity Range</label>
                    <div className={`flex h-14 sm:h-14 rounded-sm border p-1 gap-1 ${isDark ? 'bg-dark-surface border-dark-border' : 'bg-[#E5E5E0] border-braun-border'}`} role="radiogroup" aria-label="Walk Limit">
                        {Object.values(WalkLimit).map((limit) => (
                            <button
                                key={limit}
                                role="radio"
                                aria-checked={preferences.walkLimit === limit}
                                onClick={() => { Sounds.lightClick(); setPreferences(prev => ({ ...prev, walkLimit: limit })); }}
                                className={`flex-1 flex flex-col items-center justify-center rounded-[1px] btn-toggle outline-none focus:ring-1 focus:ring-white/30
                                    ${preferences.walkLimit === limit 
                                        ? `${isDark ? 'bg-dark-text text-dark-bg' : 'bg-braun-dark text-white'} shadow-md` 
                                        : `${isDark ? 'text-dark-text-muted hover:bg-white/10 hover:text-white' : 'text-braun-text-muted hover:bg-white/50 hover:text-braun-dark'}`
                                    }
                                `}
                            >
                                <span className="font-mono text-[11px] sm:text-[10px] font-bold uppercase tracking-wide">{limit}</span>
                            </button>
                        ))}
                    </div>
                </div>
            </div>
        </div>

        {/* BOTTOM ROW: Budget + Action */}
        <div className={`grid grid-cols-12 ${isDark ? 'bg-dark-bg' : 'bg-[#F4F4F0]'}`}>
            
            {/* Bottom Left: Budget (8 cols) */}
            <div className={`col-span-12 md:col-span-8 p-4 sm:p-8 border-r border-b md:border-b-0 flex flex-col justify-center ${isDark ? 'border-dark-border' : 'border-braun-border'}`}>
                <div className="flex justify-between items-center mb-3 sm:mb-4">
                    <label className={`block font-mono text-[10px] sm:text-[9px] font-bold uppercase tracking-widest ${isDark ? darkMuted : lightMuted}`}>Budget Protocol</label>
                </div>
                
                <div className={`flex h-14 sm:h-14 rounded-sm border p-1 gap-1 ${isDark ? 'bg-dark-surface border-dark-border' : 'bg-[#E5E5E0] border-braun-border'}`} role="radiogroup" aria-label="Budget">
                    
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
                        <span className="font-mono text-[11px] sm:text-[10px] font-bold uppercase tracking-wide">Any</span>
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
                        <span className="font-mono text-[11px] sm:text-[10px] font-bold uppercase tracking-wide">Personal</span>
                        <span className={`font-mono text-[9px] sm:text-[8px] mt-0.5 ${preferences.price === PricePoint.PAYING_MYSELF ? (isDark ? 'text-dark-bg/60' : 'text-white/60') : (isDark ? 'text-dark-text-muted/60' : 'text-braun-text-muted/60')}`}>$ – $$</span>
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
                        <span className="font-mono text-[11px] sm:text-[10px] font-bold uppercase tracking-wide">Company</span>
                        <span className={`font-mono text-[9px] sm:text-[8px] mt-0.5 ${preferences.price === PricePoint.COMPANY_CARD ? (isDark ? 'text-dark-bg/60' : 'text-white/60') : (isDark ? 'text-dark-text-muted/60' : 'text-braun-text-muted/60')}`}>$$$ – $$$$</span>
                    </button>
                </div>
            </div>

            {/* Bottom Right: Action Button (4 cols) */}
            <div className="col-span-12 md:col-span-4 p-4 sm:p-8 flex">
                <button
                    onClick={() => { Sounds.firmClick(); onCalculate(); }}
                    disabled={!mockMode && !preferences.lat}
                    aria-busy={(appState as AppState) === AppState.PROCESSING}
                    className={`
                        w-full h-full min-h-[56px] sm:min-h-[60px] relative transition-all duration-200 ease-out rounded-sm flex items-center justify-center group overflow-hidden focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-white/30
                        ${(!mockMode && !preferences.lat)
                            ? `${isDark ? 'bg-dark-surface border-dark-border' : 'bg-[#E5E5E0] border-braun-border'} cursor-not-allowed opacity-60` 
                            : 'bg-braun-orange border border-braun-orange shadow-braun-deep hover:shadow-[0_0_20px_rgba(255,68,0,0.4)] hover:scale-[1.02] active:scale-[0.98]'
                        }
                    `}
                >
                    <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"></div>

                    <div className="flex flex-col items-center gap-1 z-10">
                        <div className="flex items-center gap-2">
                             {(!mockMode && !preferences.lat) ? (
                                 <div className={`w-2 h-2 rounded-full ${isDark ? 'bg-dark-text-muted' : 'bg-braun-text-muted'}`}></div>
                             ) : (
                                 <div className="w-2 h-2 rounded-full bg-white animate-pulse shadow-[0_0_5px_rgba(255,255,255,0.8)]"></div>
                             )}
                             <span className={`font-sans font-bold text-sm tracking-widest uppercase ${(!mockMode && !preferences.lat) ? (isDark ? 'text-dark-text-muted' : 'text-braun-text-muted') : 'text-white'}`}>
                                 {mockMode ? 'TEST MODE' : 'INITIALIZE'}
                             </span>
                        </div>
                    </div>
                </button>
            </div>
        </div>

      </div>
      
      {/* Background decoration lines - hidden on mobile */}
      <div className="hidden sm:flex fixed inset-0 pointer-events-none -z-10 justify-center">
            <div className={`w-px h-full opacity-20 mr-96 ${isDark ? 'bg-dark-border' : 'bg-braun-border'}`}></div>
            <div className={`w-px h-full opacity-20 ml-96 ${isDark ? 'bg-dark-border' : 'bg-braun-border'}`}></div>
      </div>
      
    </div>
  );
};

export default ControlPanel;
