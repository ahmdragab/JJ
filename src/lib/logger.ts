/**
 * Structured logging utility for frontend
 * Uses console logging only - backend logging via Edge Functions handles Axiom
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogContext {
  user_id?: string;
  brand_id?: string;
  request_id?: string;
  [key: string]: unknown;
}

class Logger {
  private context: LogContext = {};

  /**
   * Set context that will be included in all subsequent logs
   */
  setContext(context: Partial<LogContext>): void {
    this.context = { ...this.context, ...context };
  }

  /**
   * Clear all context
   */
  clearContext(): void {
    this.context = {};
  }

  /**
   * Generate a request ID for tracing
   */
  generateRequestId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * Format log message with context
   */
  private formatLog(level: LogLevel, message: string, context?: Partial<LogContext>): [string, object] {
    const mergedContext = { ...this.context, ...context };
    const prefix = `[${level.toUpperCase()}]`;
    return [
      `${prefix} ${message}`,
      Object.keys(mergedContext).length > 0 ? mergedContext : {}
    ];
  }

  /**
   * Log at debug level (only in development)
   */
  debug(message: string, context?: Partial<LogContext>): void {
    if (import.meta.env.DEV) {
      const [msg, ctx] = this.formatLog('debug', message, context);
      console.debug(msg, ctx);
    }
  }

  /**
   * Log at info level
   */
  info(message: string, context?: Partial<LogContext>): void {
    const [msg, ctx] = this.formatLog('info', message, context);
    console.log(msg, ctx);
  }

  /**
   * Log at warn level
   */
  warn(message: string, context?: Partial<LogContext>): void {
    const [msg, ctx] = this.formatLog('warn', message, context);
    console.warn(msg, ctx);
  }

  /**
   * Log at error level
   */
  error(message: string, error?: Error, context?: Partial<LogContext>): void {
    const [msg, ctx] = this.formatLog('error', message, context);
    console.error(msg, error, ctx);
  }

  /**
   * Time a function execution
   */
  async time<T>(label: string, fn: () => Promise<T>, context?: Partial<LogContext>): Promise<T> {
    const start = performance.now();
    try {
      const result = await fn();
      const duration = performance.now() - start;
      this.info(`${label} completed in ${duration.toFixed(2)}ms`, {
        ...context,
        duration_ms: duration,
      });
      return result;
    } catch (error) {
      const duration = performance.now() - start;
      this.error(`${label} failed after ${duration.toFixed(2)}ms`, error as Error, {
        ...context,
        duration_ms: duration,
      });
      throw error;
    }
  }
}

// Export singleton instance
export const logger = new Logger();

/**
 * Test function for observability - call from browser console
 * Usage: window.testObservability()
 */
if (typeof window !== 'undefined') {
  (window as any).testObservability = async () => {
    console.log('🧪 Testing Observability...');

    // Check Sentry
    const Sentry = (window as any).Sentry;
    if (Sentry) {
      console.log('✅ Sentry is initialized');
    } else {
      console.warn('⚠️ Sentry is NOT initialized. Make sure VITE_SENTRY_DSN is set in your .env file');
    }

    // Test logging
    logger.info('Test info log from observability test', { test: true, timestamp: new Date().toISOString() });
    logger.warn('Test warning log from observability test', { test: true });

    // Test Sentry error
    const testError = new Error('Test error for Sentry - this is intentional');
    logger.error('Test error log from observability test', testError, { test: true });

    // Also capture directly in Sentry if available
    if (Sentry) {
      Sentry.captureException(testError, {
        tags: { test: true },
        extra: { source: 'observability_test' },
      });
      console.log('✅ Error sent to Sentry');
    }

    console.log('✅ Test complete! Check:');
    console.log('  - Sentry: https://sentry.io (should see test error)');
    console.log('  - Browser console for local logs');
  };
}
