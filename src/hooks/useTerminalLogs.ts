import { useState, useCallback, useEffect, useRef } from 'react';
import { TerminalLog, AppState, HungerVibe } from '../types';
import { generateLoadingLogs } from '../services/aiService';

// Message intervals - fast and engaging
const getMessageInterval = (messageIndex: number): number => {
  if (messageIndex < 2) return Math.floor(Math.random() * 500) + 1500;  // 1.5-2s first few
  if (messageIndex < 5) return Math.floor(Math.random() * 500) + 2000;  // 2-2.5s mid
  return Math.floor(Math.random() * 500) + 2500;  // 2.5-3s later
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
  const [isComplete, setIsComplete] = useState(false); // Track when DONE is logged
  const logIdCounter = useRef(0);
  const messageIndexRef = useRef(0);
  const messageIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Add a new log entry
  const addLog = useCallback((text: string) => {
    // RULE: Nothing appears after DONE
    if (text.toUpperCase().includes('DONE')) {
      setIsComplete(true);
      // Clear any pending dynamic message timers
      if (messageIntervalRef.current) {
        clearTimeout(messageIntervalRef.current);
        messageIntervalRef.current = null;
      }
    }
    
    const newLog: TerminalLog = {
      id: ++logIdCounter.current,
      text,
      timestamp: Date.now(),
    };
    setLogs(prev => [...prev, newLog]);
  }, []);

  // Start generating and displaying dynamic messages
  const startDynamicMessages = useCallback(async (vibe: HungerVibe | null, address: string, freestylePrompt?: string) => {
    try {
      // Generate fresh messages from AI based on user's search
      const messages = await generateLoadingLogs(vibe, address, freestylePrompt);
      if (messages && messages.length > 0) {
        setDynamicMessages(messages);
        messageIndexRef.current = 0;
      }
    } catch (error) {
      console.error('Failed to generate loading messages:', error);
      // Will fall back to no dynamic messages (system messages still show)
    }
  }, []);

  // Display dynamic messages periodically during processing
  useEffect(() => {
    // Stop if not processing, no messages, or already complete
    if (appState !== AppState.PROCESSING || dynamicMessages.length === 0 || isComplete) {
      if (messageIntervalRef.current) {
        clearTimeout(messageIntervalRef.current);
        messageIntervalRef.current = null;
      }
      return;
    }

    const scheduleNextMessage = () => {
      // Double-check we're not complete before scheduling
      if (isComplete) return;
      
      const currentIndex = messageIndexRef.current;
      const interval = getMessageInterval(currentIndex);
      
      messageIntervalRef.current = setTimeout(() => {
        // Triple-check before actually adding the message
        if (isComplete) return;
        
        // Get next message (cycle through if we run out)
        const message = dynamicMessages[currentIndex % dynamicMessages.length];
        messageIndexRef.current++;
        addLog(message);
        scheduleNextMessage();
      }, interval);
    };

    // Show FIRST message immediately when AI messages are ready
    const firstMessage = dynamicMessages[0];
    if (firstMessage && messageIndexRef.current === 0) {
      messageIndexRef.current = 1;
      addLog(firstMessage);
    }
    
    // Then schedule the rest
    scheduleNextMessage();

    return () => {
      if (messageIntervalRef.current) {
        clearTimeout(messageIntervalRef.current);
        messageIntervalRef.current = null;
      }
    };
  }, [appState, dynamicMessages, addLog, isComplete]);

  // Reset dynamic messages and complete state when leaving processing state
  useEffect(() => {
    if (appState !== AppState.PROCESSING) {
      setDynamicMessages([]);
      messageIndexRef.current = 0;
      setIsComplete(false);
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

