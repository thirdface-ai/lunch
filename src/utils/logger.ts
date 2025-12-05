import { supabase } from '../lib/supabase';

export enum LogLevel {
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR',
  DEBUG = 'DEBUG'
}

export interface LogEvent {
  timestamp: string;
  level: LogLevel;
  category: 'AI' | 'SYSTEM' | 'USER' | 'NETWORK';
  message: string;
  metadata?: any;
}

class Logger {
  private static sessionId = Math.random().toString(36).substring(2, 15);

  private static formatTime(): string {
    return new Date().toISOString();
  }

  private static emit(event: LogEvent) {
    // 1. Console Output (Immediate developer feedback)
    const color = event.level === LogLevel.ERROR ? '#ff0000' : 
                  event.level === LogLevel.WARN ? '#ffa500' : 
                  event.level === LogLevel.DEBUG ? '#00ff00' : '#00aaff';
    
    console.log(
      `%c[${event.timestamp}] [${event.category}] [${event.level}]: ${event.message}`,
      `color: ${color}; font-weight: bold;`,
      event.metadata || ''
    );

    // 2. Persist to Supabase (Backend Logging)
    this.persistToSupabase(event);
  }

  private static async persistToSupabase(event: LogEvent) {
    try {
        const enhancedMetadata = {
            ...(event.metadata || {}),
            sessionId: this.sessionId,
            userAgent: navigator.userAgent
        };

        const { error } = await supabase
            .from('app_logs')
            .insert([
                {
                    level: event.level,
                    category: event.category,
                    message: event.message,
                    metadata: enhancedMetadata,
                    created_at: event.timestamp
                }
            ]);

        if (error) {
            console.warn('Failed to push log to Supabase:', error.message);
        }
    } catch (e) {
        // Fail silently to avoid infinite loops if the logger breaks
        console.warn('Supabase logging exception:', e);
    }
  }

  static info(category: LogEvent['category'], message: string, metadata?: any) {
    this.emit({ timestamp: this.formatTime(), level: LogLevel.INFO, category, message, metadata });
  }

  static warn(category: LogEvent['category'], message: string, metadata?: any) {
    this.emit({ timestamp: this.formatTime(), level: LogLevel.WARN, category, message, metadata });
  }

  static error(category: LogEvent['category'], message: string, error?: any) {
    this.emit({ timestamp: this.formatTime(), level: LogLevel.ERROR, category, message, metadata: error });
  }

  static aiRequest(model: string, context: string) {
    this.info('AI', `Request Initiated: ${model}`, { contextLength: context.length });
  }

  static aiResponse(model: string, durationMs: number, success: boolean, tokenUsageEstimate?: number) {
    this.info('AI', `Response Received: ${model}`, { durationMs, success, estimatedTokens: tokenUsageEstimate });
  }
}

export default Logger;