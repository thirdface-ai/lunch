import { useState, useCallback, useEffect, useRef } from 'react';
import { TerminalLog, AppState, HungerVibe } from '../types';
import { generateLoadingLogs } from '../services/aiService';

// Message intervals - faster during AI analysis for engagement
// Starts slower (3-4s), gets faster as suspense builds (2-3s)
const getMessageInterval = (messageIndex: number): number => {
  if (messageIndex < 3) return Math.floor(Math.random() * 1000) + 3000;  // 3-4s early
  if (messageIndex < 6) return Math.floor(Math.random() * 1000) + 2500;  // 2.5-3.5s mid
  return Math.floor(Math.random() * 1000) + 2000;  // 2-3s late (more suspense)
};

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
  startDynamicMessages: (vibe: HungerVibe | null, address: string, freestylePrompt?: string) => void;
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
  const startDynamicMessages = useCallback(async (vibe: HungerVibe | null, address: string, freestylePrompt?: string) => {
    // Generate fresh messages from AI based on user's search
    const messages = await generateLoadingLogs(vibe, address, freestylePrompt);
    setDynamicMessages(messages);
    messageIndexRef.current = 0;
  }, []);

  // Display dynamic messages periodically during processing
  // Messages come faster as time goes on to build suspense
  useEffect(() => {
    if (appState !== AppState.PROCESSING || dynamicMessages.length === 0) {
      if (messageIntervalRef.current) {
        clearTimeout(messageIntervalRef.current);
        messageIntervalRef.current = null;
      }
      return;
    }

    const scheduleNextMessage = () => {
      const currentIndex = messageIndexRef.current;
      const interval = getMessageInterval(currentIndex);
      
      messageIntervalRef.current = setTimeout(() => {
        // Get next message (cycle through if we run out)
        const message = dynamicMessages[currentIndex % dynamicMessages.length];
        messageIndexRef.current++;
        addLog(message);
        scheduleNextMessage();
      }, interval);
    };

    // Start after a short initial delay (let system messages show first)
    messageIntervalRef.current = setTimeout(() => {
      scheduleNextMessage();
    }, 1500);

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
  // Creates smooth, suspenseful progression that slows as it approaches completion
  useEffect(() => {
    if (!autoProgress || appState !== AppState.PROCESSING) {
      return;
    }

    const interval = setInterval(() => {
      setProgress(prev => {
        // Phase 1: Quick start (0-30%) - "Setting up"
        if (prev < 30) return Math.min(prev + 1.2, 30);
        
        // Phase 2: Steady progress (30-60%) - "Searching & calculating"
        if (prev < 60) return Math.min(prev + 0.6, 60);
        
        // Phase 3: Slower progress (60-80%) - "AI analyzing"
        if (prev < 80) return Math.min(prev + 0.3, 80);
        
        // Phase 4: Suspenseful slowdown (80-92%) - "Almost there..."
        if (prev < 92) return Math.min(prev + 0.15, 92);
        
        // Phase 5: Very slow final stretch (92-97%) - "Building anticipation"
        if (prev < maxAutoProgress) return Math.min(prev + 0.08, maxAutoProgress);
        
        return prev;
      });
    }, 120); // Slightly faster tick rate for smoother animation

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

