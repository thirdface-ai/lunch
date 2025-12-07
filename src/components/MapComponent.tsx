import React, { useEffect, useRef, useState } from 'react';
import { FinalResult, ThemeMode } from '../types';

// Pin SVG for user location marker
const createUserPinSvg = (isDark: boolean): string => {
  const color = isDark ? '#FFFFFF' : '#111111';
  return `<svg width="20" height="20" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
    <circle cx="10" cy="10" r="8" fill="${color}" stroke="${color}" stroke-width="2"/>
  </svg>`;
};

// Pin SVG for result markers with number label
const createResultPinSvg = (number: number): string => {
  return `<svg width="32" height="40" viewBox="0 0 32 40" xmlns="http://www.w3.org/2000/svg">
    <path d="M16 0C9.37 0 4 5.37 4 12c0 9 12 28 12 28s12-19 12-28c0-6.63-5.37-12-12-12z" fill="#FF4400" stroke="#CC3300" stroke-width="1"/>
    <text x="16" y="16" text-anchor="middle" fill="white" font-size="12" font-weight="bold" font-family="Arial, sans-serif">${number}</text>
  </svg>`;
};

// Dark mode styles for Google Maps
const DARK_MAP_STYLES: google.maps.MapTypeStyle[] = [
  { elementType: 'geometry', stylers: [{ color: '#1a1a1a' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#1a1a1a' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#8a8a8a' }] },
  { featureType: 'administrative', elementType: 'geometry', stylers: [{ color: '#2a2a2a' }] },
  { featureType: 'administrative.country', elementType: 'labels.text.fill', stylers: [{ color: '#9e9e9e' }] },
  { featureType: 'administrative.locality', elementType: 'labels.text.fill', stylers: [{ color: '#bdbdbd' }] },
  { featureType: 'poi', elementType: 'labels.text.fill', stylers: [{ color: '#757575' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#252525' }] },
  { featureType: 'poi.park', elementType: 'labels.text.fill', stylers: [{ color: '#616161' }] },
  { featureType: 'road', elementType: 'geometry.fill', stylers: [{ color: '#2c2c2c' }] },
  { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#8a8a8a' }] },
  { featureType: 'road.arterial', elementType: 'geometry', stylers: [{ color: '#373737' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#3c3c3c' }] },
  { featureType: 'road.highway.controlled_access', elementType: 'geometry', stylers: [{ color: '#4e4e4e' }] },
  { featureType: 'road.local', elementType: 'labels.text.fill', stylers: [{ color: '#616161' }] },
  { featureType: 'transit', elementType: 'labels.text.fill', stylers: [{ color: '#757575' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0e0e0e' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#4e4e4e' }] },
];

interface MapComponentProps {
  userLat: number | null;
  userLng: number | null;
  results: FinalResult[];
  theme: ThemeMode;
}

const MapComponent: React.FC<MapComponentProps> = ({ userLat, userLng, results, theme }) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<google.maps.Map | null>(null);
  const [apiStatus, setApiStatus] = useState<'loading' | 'loaded' | 'error'>('loading');
  const markersRef = useRef<google.maps.marker.AdvancedMarkerElement[]>([]);

  const isDark = theme === ThemeMode.DARK;

  // Initialize the map instance - recreate when theme changes for proper dark mode
  useEffect(() => {
    if (!mapRef.current) return;

    // Clear existing map when theme changes
    if (map) {
      setMap(null);
    }

    let isMounted = true;
    const initMap = async () => {
      try {
        const { Map } = await google.maps.importLibrary('maps') as google.maps.MapsLibrary;
        // Also import marker library for AdvancedMarkerElement
        await google.maps.importLibrary('marker');
        
        if (isMounted && mapRef.current) {
          // Use colorScheme for dark mode with cloud-based maps
          // This requires the map to be recreated when theme changes
          const mapInstance = new Map(mapRef.current, {
            center: { lat: userLat || 0, lng: userLng || 0 },
            zoom: 14,
            disableDefaultUI: true,
            mapId: 'lunch-map', // Required for AdvancedMarkerElement
            colorScheme: isDark ? 'DARK' : 'LIGHT',
          });
          setMap(mapInstance);
          setApiStatus('loaded');
        }
      } catch (e) {
        console.error('Failed to load Google Maps:', e);
        if (isMounted) setApiStatus('error');
      }
    };

    setApiStatus('loading');
    initMap();

    return () => { isMounted = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDark]); // Recreate map when theme changes

  // Update markers and viewport when map is ready or data changes
  useEffect(() => {
    if (!map || apiStatus !== 'loaded' || !userLat || !userLng) return;

    const updateMap = async () => {
      // Clear any existing markers
      markersRef.current.forEach(marker => marker.map = null);
      markersRef.current = [];

      // Get AdvancedMarkerElement class
      const { AdvancedMarkerElement } = await google.maps.importLibrary('marker') as google.maps.MarkerLibrary;

      // Create user location marker (black/white dot)
      const userPinElement = document.createElement('div');
      userPinElement.innerHTML = createUserPinSvg(isDark);
      
      const userMarker = new AdvancedMarkerElement({
        map,
        position: { lat: userLat, lng: userLng },
        title: 'Your Location',
        zIndex: 1,
        content: userPinElement,
      });
      markersRef.current.push(userMarker);

      // Create result markers with numbered labels
      results.forEach((res, idx) => {
        if (!res.geometry?.location) return;

        const pinElement = document.createElement('div');
        pinElement.innerHTML = createResultPinSvg(idx + 1);
        pinElement.style.cursor = 'pointer';
        
        const marker = new AdvancedMarkerElement({
          map,
          position: res.geometry.location,
          title: `${idx + 1}. ${res.name}`,
          zIndex: 10 + idx,
          content: pinElement,
        });
        
        marker.addListener('click', () => {
          window.open(`https://www.google.com/maps/place/?q=place_id:${res.place_id}`, '_blank');
        });
        
        markersRef.current.push(marker);
      });

      // Determine unique locations for map view strategy
      const uniqueLocations = new Set<string>();
      if (userLat && userLng) {
        uniqueLocations.add(`${userLat},${userLng}`);
      }
      
      results.forEach(res => {
        if (res.geometry?.location) {
          try {
            const loc = res.geometry.location;
            const lat = typeof loc.lat === 'function' ? loc.lat() : loc.lat;
            const lng = typeof loc.lng === 'function' ? loc.lng() : loc.lng;
            if (lat && lng) {
              uniqueLocations.add(`${lat},${lng}`);
            }
          } catch { 
            // Gracefully ignore invalid locations
          }
        }
      });

      if (uniqueLocations.size > 1) {
        // More than one unique point, fit bounds
        const bounds = new google.maps.LatLngBounds();
        if (userLat && userLng) {
          bounds.extend({ lat: userLat, lng: userLng });
        }
        results.forEach(res => {
          if (res.geometry?.location) bounds.extend(res.geometry.location);
        });
        map.fitBounds(bounds, { top: 80, right: 80, bottom: 80, left: 80 });
        
        const listener = map.addListener('idle', () => {
          const zoom = map.getZoom();
          if (zoom && zoom > 16) map.setZoom(16);
          google.maps.event.removeListener(listener);
        });
      } else if (userLat && userLng) {
        // Only one point (or zero results), center and zoom
        map.panTo({ lat: userLat, lng: userLng });
        map.setZoom(15);
      }
    };

    updateMap();
  }, [map, apiStatus, results, userLat, userLng, isDark]);

  return (
    <div className="absolute inset-0 w-full h-full">
      {apiStatus === 'loading' && (
        <div className="absolute inset-0 flex items-center justify-center p-8 text-center flex-col gap-2 bg-inherit">
          <div className={`font-mono text-xs uppercase animate-pulse ${isDark ? 'text-dark-text-muted' : 'text-braun-text-muted'}`}>
            INITIALIZING MAP INTERFACE...
          </div>
        </div>
      )}
      {apiStatus === 'error' && (
        <div className="absolute inset-0 flex items-center justify-center p-8 text-center flex-col gap-2">
          <div className="w-8 h-8 rounded-full border-2 border-braun-orange flex items-center justify-center mb-2">
            <span className="text-braun-orange font-bold text-lg">!</span>
          </div>
          <div className={`font-mono text-xs uppercase ${isDark ? 'text-dark-text-muted' : 'text-braun-text-muted'}`}>
            CRITICAL MAP FAILURE
          </div>
        </div>
      )}
      <div 
        ref={mapRef} 
        className="w-full h-full" 
        style={{ visibility: apiStatus === 'loaded' ? 'visible' : 'hidden' }}
        aria-label="Map showing restaurant locations"
      />
    </div>
  );
};

export default MapComponent;

