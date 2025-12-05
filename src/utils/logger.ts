import { supabase, getSessionId } from '../lib/supabase';

export enum LogLevel {
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR',
  DEBUG = 'DEBUG'
}

export type LogCategory = 'AI' | 'SYSTEM' | 'USER' | 'NETWORK';

export interface LogEvent {
  timestamp: string;
  level: LogLevel;
  category: LogCategory;
  message: string;
  metadata?: Record<string, unknown>;
}

// Batch logs to reduce database calls
const logQueue: LogEvent[] = [];
let flushTimeout: ReturnType<typeof setTimeout> | null = null;
const FLUSH_INTERVAL = 5000; // 5 seconds
const MAX_QUEUE_SIZE = 20;

class Logger {
  private static formatTime(): string {
    return new Date().toISOString();
  }

  private static getColor(level: LogLevel): string {
    switch (level) {
      case LogLevel.ERROR: return '#ff4444';
      case LogLevel.WARN: return '#ffaa00';
      case LogLevel.DEBUG: return '#00ff00';
      default: return '#00aaff';
    }
  }

  private static emit(event: LogEvent) {
    // Console output for development
    if (process.env.NODE_ENV !== 'production') {
      console.log(
        `%c[${event.timestamp}] [${event.category}] [${event.level}]: ${event.message}`,
        `color: ${this.getColor(event.level)}; font-weight: bold;`,
        event.metadata || ''
      );
    }

    // Queue for batch persistence
    this.queueLog(event);
  }

  private static queueLog(event: LogEvent) {
    logQueue.push(event);

    // Flush immediately if queue is full
    if (logQueue.length >= MAX_QUEUE_SIZE) {
      this.flushLogs();
      return;
    }

    // Schedule flush
    if (!flushTimeout) {
      flushTimeout = setTimeout(() => {
        this.flushLogs();
      }, FLUSH_INTERVAL);
    }
  }

  private static async flushLogs() {
    if (flushTimeout) {
      clearTimeout(flushTimeout);
      flushTimeout = null;
    }

    if (logQueue.length === 0) return;

    const logsToSend = [...logQueue];
    logQueue.length = 0;

    try {
      const sessionId = getSessionId();
      const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown';

      const records = logsToSend.map(log => ({
        level: log.level,
        category: log.category,
        message: log.message,
        metadata: {
          ...(log.metadata || {}),
          sessionId,
          userAgent,
        },
        created_at: log.timestamp,
      }));

      const { error } = await supabase
        .from('app_logs')
        .insert(records);

      if (error) {
        // Don't use Logger here to avoid infinite loop
        console.warn('Failed to flush logs to Supabase:', error.message);
      }
    } catch (e) {
      console.warn('Log flush exception:', e);
    }
  }

  // Public logging methods
  static info(category: LogCategory, message: string, metadata?: Record<string, unknown>) {
    this.emit({ 
      timestamp: this.formatTime(), 
      level: LogLevel.INFO, 
      category, 
      message, 
      metadata 
    });
  }

  static warn(category: LogCategory, message: string, metadata?: Record<string, unknown>) {
    this.emit({ 
      timestamp: this.formatTime(), 
      level: LogLevel.WARN, 
      category, 
      message, 
      metadata 
    });
  }

  static error(category: LogCategory, message: string, error?: unknown) {
    const metadata: Record<string, unknown> = {};
    
    if (error instanceof Error) {
      metadata.errorMessage = error.message;
      metadata.errorStack = error.stack;
    } else if (error) {
      metadata.error = error;
    }

    this.emit({ 
      timestamp: this.formatTime(), 
      level: LogLevel.ERROR, 
      category, 
      message, 
      metadata 
    });
  }

  static debug(category: LogCategory, message: string, metadata?: Record<string, unknown>) {
    if (process.env.NODE_ENV === 'production') return;
    
    this.emit({ 
      timestamp: this.formatTime(), 
      level: LogLevel.DEBUG, 
      category, 
      message, 
      metadata 
    });
  }

  // Specialized logging methods
  static aiRequest(model: string, context: string) {
    this.info('AI', `Request Initiated: ${model}`, { 
      contextLength: context.length,
      model 
    });
  }

  static aiResponse(model: string, durationMs: number, success: boolean, tokenUsageEstimate?: number) {
    this.info('AI', `Response Received: ${model}`, { 
      durationMs, 
      success, 
      estimatedTokens: tokenUsageEstimate 
    });
  }

  static userAction(action: string, details?: Record<string, unknown>) {
    this.info('USER', action, details);
  }

  static networkRequest(endpoint: string, method: string, status?: number) {
    this.info('NETWORK', `${method} ${endpoint}`, { status });
  }

  // Force flush on page unload
  static forceFlush() {
    this.flushLogs();
  }
}

// Flush logs before page unload
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    Logger.forceFlush();
  });

  // Also flush on visibility change (tab switch/close)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      Logger.forceFlush();
    }
  });
}

export default Logger;
