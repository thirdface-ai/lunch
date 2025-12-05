import { useState, useCallback, useEffect, useRef } from 'react';
import { TerminalLog, AppState } from '../types';

interface UseTerminalLogsOptions {
  /** Auto-increment progress when in processing state */
  autoProgress?: boolean;
  /** Maximum progress value before it stops auto-incrementing */
  maxAutoProgress?: number;
}

interface UseTerminalLogsReturn {
  logs: TerminalLog[];
  progress: number;
  addLog: (text: string) => void;
  clearLogs: () => void;
  setProgress: (value: number | ((prev: number) => number)) => void;
  resetProgress: () => void;
}

/**
 * Custom hook for managing terminal logs and progress state
 */
export const useTerminalLogs = (
  appState: AppState,
  options: UseTerminalLogsOptions = {}
): UseTerminalLogsReturn => {
  const { autoProgress = true, maxAutoProgress = 99 } = options;
  
  const [logs, setLogs] = useState<TerminalLog[]>([]);
  const [progress, setProgress] = useState(0);
  const logIdCounter = useRef(0);

  // Add a new log entry
  const addLog = useCallback((text: string) => {
    const newLog: TerminalLog = {
      id: ++logIdCounter.current,
      text,
      timestamp: Date.now(),
    };
    setLogs(prev => [...prev, newLog]);
  }, []);

  // Clear all logs
  const clearLogs = useCallback(() => {
    setLogs([]);
    logIdCounter.current = 0;
  }, []);

  // Reset progress to 0
  const resetProgress = useCallback(() => {
    setProgress(0);
  }, []);

  // Auto-progress animation when processing
  useEffect(() => {
    if (!autoProgress || appState !== AppState.PROCESSING) {
      return;
    }

    const interval = setInterval(() => {
      setProgress(prev => {
        // Slow down as we approach the max
        if (prev < 30) return Math.min(prev + 0.5, 29);
        if (prev < 50) return Math.min(prev + 0.3, 49);
        if (prev < maxAutoProgress) return Math.min(prev + 0.1, maxAutoProgress);
        return prev;
      });
    }, 200);

    return () => clearInterval(interval);
  }, [appState, autoProgress, maxAutoProgress]);

  // Reset when leaving processing state
  useEffect(() => {
    if (appState === AppState.INPUT) {
      clearLogs();
      resetProgress();
    }
  }, [appState, clearLogs, resetProgress]);

  return {
    logs,
    progress,
    addLog,
    clearLogs,
    setProgress,
    resetProgress,
  };
};

export default useTerminalLogs;

