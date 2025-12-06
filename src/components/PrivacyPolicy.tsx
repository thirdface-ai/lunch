import React, { useRef } from 'react';
import { ThemeMode } from '../types';

interface PrivacyPolicyProps {
  theme: ThemeMode;
  onClose: () => void;
}

const PrivacyPolicy: React.FC<PrivacyPolicyProps> = ({ theme, onClose }) => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isDark = theme === ThemeMode.DARK;

  const lastUpdated = '2025-12-06';

  return (
    <div className={`min-h-screen flex items-center justify-center p-2 sm:p-4 transition-colors duration-300 ${isDark ? 'bg-dark-bg' : 'bg-braun-bg'}`}>
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
            <h1 className={`font-sans font-bold text-lg sm:text-xl tracking-tight leading-none ${isDark ? 'text-dark-text' : 'text-braun-dark'}`}>PRIVACY POLICY</h1>
            <p className={`font-mono text-[9px] tracking-[0.2em] mt-1 ${isDark ? 'text-dark-text-muted' : 'text-braun-text-muted'}`}>DATA TRANSPARENCY MODULE</p>
          </div>
          <button
            onClick={onClose}
            className={`font-mono text-[10px] uppercase tracking-widest px-3 py-2 border transition-all duration-150 hover:border-braun-orange hover:text-braun-orange ${isDark ? 'border-dark-border text-dark-text-muted' : 'border-braun-border text-braun-text-muted'}`}
            aria-label="Close privacy policy"
          >
            ← Back
          </button>
        </div>

        {/* Main Display Area */}
        <div className={`flex-1 p-4 sm:p-8 flex flex-col transition-colors duration-300 ${isDark ? 'bg-[#111]' : 'bg-[#F0F0EC]'}`}>
          
          {/* The "Screen" */}
          <div className={`p-3 sm:p-6 rounded-sm shadow-inner border-b-2 relative overflow-hidden flex flex-col h-[70vh] sm:h-[450px] transition-colors duration-300 ${isDark ? 'bg-[#0a0a0a] border-[#222]' : 'bg-[#1a1a1a] border-[#333]'}`}>
            
            {/* Screen Bezel Branding */}
            <div className="absolute top-2 left-1/2 -translate-x-1/2 text-[8px] font-sans font-bold text-[#444] tracking-widest uppercase pointer-events-none">
              Legal Document Viewer
            </div>

            {/* Policy Content */}
            <div 
              ref={scrollContainerRef} 
              className="flex-1 overflow-y-auto scrollbar-hide font-mono text-[11px] sm:text-xs leading-relaxed p-2 pt-5 sm:pt-6 relative z-10 text-braun-orange/90"
            >
              {/* Header */}
              <div className="mb-6">
                <div className="text-braun-orange font-bold text-sm sm:text-base mb-1">
                  {'>'} FOOD DECIDER PRIVACY POLICY
                </div>
                <div className="text-braun-orange/60 text-[10px]">
                  LAST_UPDATED: {lastUpdated}
                </div>
              </div>

              {/* Section 1 */}
              <Section title="1. OVERVIEW">
                <p>
                  Food Decider helps you find nearby restaurants based on your preferences. 
                  This policy explains what data we collect, why we collect it, and how it's used.
                </p>
                <p className="mt-2">
                  We believe in transparency and minimal data collection. No account creation 
                  is required, and we don't sell your data to third parties.
                </p>
              </Section>

              {/* Section 2 */}
              <Section title="2. DATA WE COLLECT">
                <SubSection title="2.1 LOCAL BROWSER STORAGE">
                  <p>Stored on your device only, never transmitted to our servers:</p>
                  <ul className="list-none mt-2 space-y-1">
                    <li>• Last used address and coordinates (for convenience)</li>
                    <li>• Transport mode preference (walk/delivery)</li>
                    <li>• Price preference</li>
                    <li>• Walk time limit</li>
                    <li>• Theme setting (light/dark/system)</li>
                    <li>• Dietary restrictions</li>
                    <li>• Filter preferences (fresh drops, cashless)</li>
                  </ul>
                  <p className="mt-2 text-braun-orange/60">
                    NOTE: Your address is stored locally for convenience and can be cleared 
                    by clearing browser data.
                  </p>
                </SubSection>

                <SubSection title="2.2 PERSISTENT SESSION ID">
                  <p>
                    A random session ID is generated and stored in your browser's local storage. 
                    This ID is anonymous and used to track which restaurants you've seen to 
                    provide variety in future recommendations. It persists until you clear 
                    browser data.
                  </p>
                </SubSection>

                <SubSection title="2.3 SEARCH HISTORY">
                  <p>When you search for restaurants, we store:</p>
                  <ul className="list-none mt-2 space-y-1">
                    <li>• Your search address and coordinates</li>
                    <li>• Selected preferences (vibe, price, walk limit)</li>
                    <li>• Dietary restrictions</li>
                    <li>• Custom search prompts (if provided)</li>
                    <li>• Number of results returned</li>
                    <li>• Timestamp of the search</li>
                  </ul>
                  <p className="mt-2 text-braun-orange/60">
                    PURPOSE: To improve recommendations and track app performance.
                  </p>
                </SubSection>

                <SubSection title="2.4 RECOMMENDED PLACES">
                  <p>
                    We track which restaurants were shown to you (place ID and name) to 
                    provide variety in future recommendations and avoid showing the same 
                    places repeatedly.
                  </p>
                </SubSection>

                <SubSection title="2.5 APPLICATION LOGS">
                  <p>For debugging and monitoring, we log:</p>
                  <ul className="list-none mt-2 space-y-1">
                    <li>• Error messages and system events</li>
                    <li>• AI request/response metadata</li>
                    <li>• Browser user agent string</li>
                  </ul>
                </SubSection>
              </Section>

              {/* Section 3 */}
              <Section title="3. THIRD-PARTY SERVICES">
                <SubSection title="3.1 GOOGLE PLACES API">
                  <p>
                    We use Google Places API to search for restaurants near your location 
                    and retrieve their details (ratings, reviews, hours, etc.).
                  </p>
                  <p className="mt-2">
                    Your location is sent directly to Google's servers. See Google's 
                    Privacy Policy: google.com/policies/privacy
                  </p>
                </SubSection>

                <SubSection title="3.2 AI RECOMMENDATIONS (OPENROUTER)">
                  <p>
                    Restaurant data and your preferences are processed by AI models via 
                    OpenRouter to generate personalized recommendations. This includes:
                  </p>
                  <ul className="list-none mt-2 space-y-1">
                    <li>• Restaurant names, ratings, and reviews</li>
                    <li>• Your vibe and dietary preferences</li>
                    <li>• Your custom search prompts</li>
                  </ul>
                  <p className="mt-2 text-braun-orange/60">
                    Your API key is never exposed; requests are proxied through our 
                    secure edge function.
                  </p>
                </SubSection>

                <SubSection title="3.3 SUPABASE (DATABASE)">
                  <p>
                    Search history and logs are stored in Supabase, a secure PostgreSQL 
                    database service. Data is encrypted in transit and at rest.
                  </p>
                </SubSection>
              </Section>

              {/* Section 4 */}
              <Section title="4. RATE LIMITING">
                <p>
                  Your IP address is temporarily used for rate limiting to prevent abuse. 
                  This data is held in memory only and is not permanently stored.
                </p>
              </Section>

              {/* Section 5 */}
              <Section title="5. DATA RETENTION">
                <ul className="list-none space-y-1">
                  <li>• Local storage (preferences + session ID): Until you clear browser data</li>
                  <li>• Search history: 90 days</li>
                  <li>• Recommended places history: 90 days</li>
                  <li>• Application logs: 30 days</li>
                </ul>
              </Section>

              {/* Section 6 */}
              <Section title="6. YOUR RIGHTS">
                <p>You can:</p>
                <ul className="list-none mt-2 space-y-1">
                  <li>• Clear local preferences and session ID by clearing browser storage</li>
                  <li>• Get fresh restaurant variety by clearing localStorage</li>
                  <li>• Request deletion of server-side data by contacting us</li>
                </ul>
              </Section>

              {/* Section 7 */}
              <Section title="7. NO ACCOUNTS">
                <p>
                  Food Decider does not require user accounts or authentication. 
                  All data is associated with anonymous session identifiers, not 
                  personal identities.
                </p>
              </Section>

              {/* Section 8 */}
              <Section title="8. COOKIES">
                <p>
                  We do not use tracking cookies. Local storage and session storage 
                  are used for functional purposes only.
                </p>
              </Section>

              {/* Section 9 */}
              <Section title="9. CONTACT">
                <p>
                  For privacy inquiries or data deletion requests:
                </p>
                <p className="mt-2 text-braun-orange">
                  {'>'} noah@thirdface.com
                </p>
              </Section>

              {/* Footer */}
              <div className="mt-8 pt-4 border-t border-braun-orange/20">
                <p className="text-braun-orange/50 text-[10px]">
                  END_OF_DOCUMENT // SCROLL_POSITION: EOF
                </p>
              </div>

              {/* Spacer for scroll */}
              <div className="h-4" />
            </div>

            {/* Scanlines & Glare */}
            <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] bg-[length:100%_2px,3px_100%] z-20" aria-hidden="true"></div>
          </div>

          {/* Status Bar */}
          <div className="mt-4 sm:mt-6">
            <div className={`flex justify-between font-mono text-[9px] uppercase tracking-widest ${isDark ? 'text-dark-text-muted' : 'text-braun-text-muted'}`}>
              <span>Document loaded</span>
              <span>Scroll for more ↓</span>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};

// Helper components for structured content
const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="mb-6">
    <div className="text-braun-orange font-bold mb-2 tracking-wide">
      {'>'} {title}
    </div>
    <div className="pl-4 text-braun-orange/80">
      {children}
    </div>
  </div>
);

const SubSection: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="mb-4">
    <div className="text-braun-orange/90 font-medium mb-1 text-[10px] sm:text-[11px]">
      [{title}]
    </div>
    <div className="pl-2 text-braun-orange/70">
      {children}
    </div>
  </div>
);

export default PrivacyPolicy;

