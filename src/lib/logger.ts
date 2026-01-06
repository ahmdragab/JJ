/**
 * Structured logging utility for frontend
 * Sends logs to Axiom for aggregation and visualization
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogContext {
  user_id?: string;
  brand_id?: string;
  request_id?: string;
  [key: string]: unknown;
}

interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  context?: LogContext;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
  [key: string]: unknown;
}

class Logger {
  private axiomToken: string | undefined;
  private axiomDataset: string | undefined;
  private axiomUrl: string;
  private context: LogContext = {};

  constructor() {
    this.axiomToken = import.meta.env.VITE_AXIOM_TOKEN;
    this.axiomDataset = import.meta.env.VITE_AXIOM_DATASET;
    this.axiomUrl = import.meta.env.VITE_AXIOM_URL || 'https://api.axiom.co/v1/datasets';
  }

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
   * Send log to Axiom
   */
  private async sendToAxiom(entry: LogEntry): Promise<void> {
    // Only send if Axiom is configured
    if (!this.axiomToken || !this.axiomDataset) {
      // Fallback to console if Axiom not configured
      const consoleMethod = entry.level === 'error' ? 'error' : entry.level === 'warn' ? 'warn' : 'log';
      console[consoleMethod](`[${entry.level.toUpperCase()}]`, entry.message, entry.context || {});
      return;
    }

    try {
      const response = await fetch(`${this.axiomUrl}/${this.axiomDataset}/ingest`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.axiomToken}`,
        },
        body: JSON.stringify([entry]),
      });

      if (!response.ok) {
        console.warn('Failed to send log to Axiom:', response.status, response.statusText);
      }
    } catch (error) {
      // Silently fail - don't break the app if logging fails
      console.warn('Error sending log to Axiom:', error);
    }
  }

  /**
   * Create a log entry
   */
  private createLogEntry(
    level: LogLevel,
    message: string,
    context?: Partial<LogContext>,
    error?: Error
  ): LogEntry {
    const entry: LogEntry = {
      level,
      message,
      timestamp: new Date().toISOString(),
      context: { ...this.context, ...context },
    };

    if (error) {
      entry.error = {
        name: error.name,
        message: error.message,
        stack: error.stack,
      };
    }

    return entry;
  }

  /**
   * Log at debug level
   */
  debug(message: string, context?: Partial<LogContext>): void {
    if (import.meta.env.DEV) {
      console.debug(message, context || {});
    }
    // Don't send debug logs to Axiom in production to save quota
    if (import.meta.env.DEV && this.axiomToken) {
      this.sendToAxiom(this.createLogEntry('debug', message, context));
    }
  }

  /**
   * Log at info level
   */
  info(message: string, context?: Partial<LogContext>): void {
    console.log(`[INFO] ${message}`, context || {});
    this.sendToAxiom(this.createLogEntry('info', message, context));
  }

  /**
   * Log at warn level
   */
  warn(message: string, context?: Partial<LogContext>): void {
    console.warn(`[WARN] ${message}`, context || {});
    this.sendToAxiom(this.createLogEntry('warn', message, context));
  }

  /**
   * Log at error level
   */
  error(message: string, error?: Error, context?: Partial<LogContext>): void {
    console.error(`[ERROR] ${message}`, error, context || {});
    this.sendToAxiom(this.createLogEntry('error', message, context, error));
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
    
    // Test Axiom logging
    logger.info('Test info log from observability test', { test: true, timestamp: new Date().toISOString() });
    logger.warn('Test warning log from observability test', { test: true });
    
    // Test Sentry error - both via logger and directly
    const testError = new Error('Test error for Sentry - this is intentional');
    
    // Log to Axiom
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
    console.log('  - Axiom: https://app.axiom.co (should see test logs)');
  };
}

