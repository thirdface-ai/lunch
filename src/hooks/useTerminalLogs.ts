import { useState, useCallback, useEffect, useRef } from 'react';
import { TerminalLog, AppState, HungerVibe } from '../types';
import { generateLoadingLogs } from '../services/geminiService';

// Get random interval between 8-12 seconds
const getRandomInterval = () => Math.floor(Math.random() * 4000) + 8000;

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
  startDynamicMessages: (vibe: HungerVibe | null, address: string) => void;
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
  const [dynamicMessages, setDynamicMessages] = useState<string[]>([]);
  const logIdCounter = useRef(0);
  const messageIndexRef = useRef(0);
  const messageIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Add a new log entry
  const addLog = useCallback((text: string) => {
    const newLog: TerminalLog = {
      id: ++logIdCounter.current,
      text,
      timestamp: Date.now(),
    };
    setLogs(prev => [...prev, newLog]);
  }, []);

  // Start generating and displaying dynamic messages
  const startDynamicMessages = useCallback(async (vibe: HungerVibe | null, address: string) => {
    // Generate fresh messages from AI
    const messages = await generateLoadingLogs(vibe, address);
    setDynamicMessages(messages);
    messageIndexRef.current = 0;
  }, []);

  // Display dynamic messages periodically during processing
  useEffect(() => {
    if (appState !== AppState.PROCESSING || dynamicMessages.length === 0) {
      if (messageIntervalRef.current) {
        clearTimeout(messageIntervalRef.current);
        messageIntervalRef.current = null;
      }
      return;
    }

    const scheduleNextMessage = () => {
      const interval = getRandomInterval();
      messageIntervalRef.current = setTimeout(() => {
        // Get next message (cycle through if we run out)
        const message = dynamicMessages[messageIndexRef.current % dynamicMessages.length];
        messageIndexRef.current++;
        addLog(message);
        scheduleNextMessage();
      }, interval);
    };

    // Start the cycle
    scheduleNextMessage();

    return () => {
      if (messageIntervalRef.current) {
        clearTimeout(messageIntervalRef.current);
        messageIntervalRef.current = null;
      }
    };
  }, [appState, dynamicMessages, addLog]);

  // Reset dynamic messages when leaving processing state
  useEffect(() => {
    if (appState !== AppState.PROCESSING) {
      setDynamicMessages([]);
      messageIndexRef.current = 0;
    }
  }, [appState]);

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
    startDynamicMessages,
  };
};

export default useTerminalLogs;

