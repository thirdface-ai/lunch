import React, { useState } from 'react';
import { Analytics } from '@vercel/analytics/react';
import ControlPanel from './components/ControlPanel';
import TerminalLog from './components/TerminalLog';
import ResultsView from './components/ResultsView';
import ErrorBoundary from './components/ErrorBoundary';
import Footer from './components/Footer';
import PrivacyPolicy from './components/PrivacyPolicy';
import { usePreferences } from './hooks/usePreferences';
import { useLunchDecision } from './hooks/useLunchDecision';
import { ThemeMode } from './types';

/**
 * Main application content component
 * Uses custom hooks for state management and business logic
 */
const AppContent: React.FC = () => {
  // User preferences with localStorage persistence
  const { preferences, setPreferences, effectiveTheme } = usePreferences();
  
  // Privacy policy view state
  const [showPrivacyPolicy, setShowPrivacyPolicy] = useState(false);
  
  // Main lunch decision orchestration
  const {
    appState,
    results,
    logs,
    progress,
    calculate,
    reset,
  } = useLunchDecision();

  // Handle calculate button click
  const handleCalculate = () => {
    calculate(preferences);
  };

  // Determine if dark mode is active (based on effective theme, not preference)
  const isDark = effectiveTheme === 'dark';

  // Show privacy policy screen
  if (showPrivacyPolicy) {
    return (
      <div className={`font-sans transition-colors duration-300 ${isDark ? 'text-dark-text bg-dark-bg' : 'text-braun-dark bg-braun-bg'}`}>
        <PrivacyPolicy 
          theme={effectiveTheme === 'dark' ? ThemeMode.DARK : ThemeMode.LIGHT}
          onClose={() => setShowPrivacyPolicy(false)}
        />
      </div>
    );
  }

  return (
    <div className={`min-h-screen flex flex-col font-sans transition-colors duration-300 ${isDark ? 'text-dark-text bg-dark-bg' : 'text-braun-dark bg-braun-bg'}`}>
      
      {/* Main content area - grows to push footer down */}
      <div className="flex-grow flex flex-col">
        {/* Input Screen */}
        <ControlPanel 
          appState={appState} 
          preferences={preferences} 
          setPreferences={setPreferences}
          onCalculate={handleCalculate}
          effectiveTheme={effectiveTheme}
        />

        {/* Processing Screen / No Results Screen */}
        <TerminalLog 
          appState={appState} 
          logs={logs} 
          progress={progress}
          theme={effectiveTheme === 'dark' ? ThemeMode.DARK : ThemeMode.LIGHT}
          onReset={reset}
        />

        {/* Results Screen */}
        <ResultsView 
          appState={appState} 
          results={results}
          userLat={preferences.lat}
          userLng={preferences.lng}
          onReset={reset}
          theme={effectiveTheme === 'dark' ? ThemeMode.DARK : ThemeMode.LIGHT}
          transportMode={preferences.mode}
        />
      </div>

      {/* Global Footer - sticks to bottom when space allows, scrolls with content otherwise */}
      <Footer isDark={isDark} onPrivacyClick={() => setShowPrivacyPolicy(true)} />
    </div>
  );
};

/**
 * Root App component with error boundary
 */
const App: React.FC = () => {
  return (
    <ErrorBoundary>
      <AppContent />
      <Analytics />
    </ErrorBoundary>
  );
};

export default App;
