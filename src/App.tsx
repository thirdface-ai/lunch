import React from 'react';
import ControlPanel from './components/ControlPanel';
import TerminalLog from './components/TerminalLog';
import ResultsView from './components/ResultsView';
import ErrorBoundary from './components/ErrorBoundary';
import { usePreferences } from './hooks/usePreferences';
import { useLunchDecision } from './hooks/useLunchDecision';
import { ThemeMode } from './types';

/**
 * Main application content component
 * Uses custom hooks for state management and business logic
 */
const AppContent: React.FC = () => {
  // User preferences with localStorage persistence
  const { preferences, setPreferences } = usePreferences();
  
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

  // Determine if dark mode is active
  const isDark = preferences.theme === ThemeMode.DARK;

  return (
    <div className={`font-sans transition-colors duration-300 ${isDark ? 'text-dark-text bg-dark-bg' : 'text-braun-dark bg-braun-bg'}`}>
      
      {/* Input Screen */}
      <ControlPanel 
        appState={appState} 
        preferences={preferences} 
        setPreferences={setPreferences}
        onCalculate={handleCalculate}
      />

      {/* Processing Screen */}
      <TerminalLog 
        appState={appState} 
        logs={logs} 
        progress={progress}
        theme={preferences.theme}
      />

      {/* Results Screen */}
      <ResultsView 
        appState={appState} 
        results={results}
        userLat={preferences.lat}
        userLng={preferences.lng}
        onReset={reset}
        theme={preferences.theme}
      />
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
    </ErrorBoundary>
  );
};

export default App;
