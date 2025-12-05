
import React, { useEffect, useRef, useState } from 'react';
import { FinalResult, ThemeMode } from '../types';

// Declare google for TypeScript to avoid errors with the inline script loader.
declare const google: any;

interface MapComponentProps {
  userLat: number | null;
  userLng: number | null;
  results: FinalResult[];
  theme: ThemeMode;
}

const MapComponent: React.FC<MapComponentProps> = ({ userLat, userLng, results, theme }) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<any | null>(null);
  const [apiStatus, setApiStatus] = useState<'loading' | 'loaded' | 'error'>('loading');
  const markersRef = useRef<any[]>([]);

  const isDark = theme === ThemeMode.DARK;

  // 1. Initialize the map instance once the component is mounted.
  useEffect(() => {
    if (!mapRef.current || map) return; // Prevent re-initialization

    let isMounted = true;
    const initMap = async () => {
      try {
        const { Map } = await google.maps.importLibrary("maps");
        if (isMounted) {
          const mapInstance = new Map(mapRef.current as HTMLDivElement, {
            center: { lat: userLat || 0, lng: userLng || 0 },
            zoom: 14,
            mapId: "DEMO_MAP_ID",
            disableDefaultUI: true,
          });
          setMap(mapInstance);
          setApiStatus('loaded');
        }
      } catch (e) {
        console.error("Failed to load Google Maps:", e);
        if (isMounted) setApiStatus('error');
      }
    };

    setApiStatus('loading');
    initMap();

    return () => { isMounted = false; };
  }, [map, userLat, userLng]);

  // 2. Update markers and viewport when map is ready or data changes.
  useEffect(() => {
    if (!map || apiStatus !== 'loaded' || !userLat || !userLng) return;

    const updateMap = async () => {
      // Clear any existing markers from the map and the ref array
      markersRef.current.forEach(marker => marker.map = null);
      markersRef.current = [];

      const { AdvancedMarkerElement, PinElement } = await google.maps.importLibrary("marker");
      
      // Create and add user marker
      const userPin = new PinElement({
          background: isDark ? "#FFFFFF" : "#111111",
          borderColor: isDark ? "#FFFFFF" : "#111111",
          glyphColor: isDark ? "#111111" : "#FFFFFF",
          scale: 1.0,
      });
      const userMarker = new AdvancedMarkerElement({
          map,
          position: { lat: userLat, lng: userLng },
          title: 'Your Location',
          content: userPin.element,
          zIndex: 1,
      });
      markersRef.current.push(userMarker);

      // Create and add result markers
      results.forEach((res, idx) => {
          if (!res.geometry?.location) return;
          
          const resultPin = new PinElement({
              background: "#FF4400",
              borderColor: "#CC3300",
              glyphText: (idx + 1).toString(),
              glyphColor: "#FFFFFF",
              scale: 1.2,
          });

          const marker = new AdvancedMarkerElement({
              map,
              position: res.geometry.location,
              title: `${idx + 1}. ${res.name}`,
              content: resultPin.element,
              zIndex: 10 + idx
          });
          
          marker.addListener('click', () => {
              window.open(`https://www.google.com/maps/place/?q=place_id:${res.place_id}`, '_blank');
          });
          
          markersRef.current.push(marker);
      });

      // Robustly determine unique locations to decide map view strategy
      const uniqueLocations = new Set<string>();
      if (userLat && userLng) {
          uniqueLocations.add(`${userLat},${userLng}`);
      }
      results.forEach(res => {
          if (res.geometry?.location) {
              try {
                  const lat = typeof res.geometry.location.lat === 'function' ? res.geometry.location.lat() : res.geometry.location.lat;
                  const lng = typeof res.geometry.location.lng === 'function' ? res.geometry.location.lng() : res.geometry.location.lng;
                  if (lat && lng) {
                    uniqueLocations.add(`${lat},${lng}`);
                  }
              } catch(e) { /* Gracefully ignore if location is invalid */ }
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
              if (map.getZoom() > 16) map.setZoom(16);
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
      <div ref={mapRef} className="w-full h-full" style={{ visibility: apiStatus === 'loaded' ? 'visible' : 'hidden' }} />
    </div>
  );
};

export default MapComponent;
