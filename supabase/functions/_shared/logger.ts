/**
 * Structured logging utility for Supabase Edge Functions (Deno)
 * Sends logs to Axiom for aggregation and visualization
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogContext {
  user_id?: string;
  brand_id?: string;
  request_id?: string;
  function_name?: string;
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

class EdgeLogger {
  private axiomToken: string | undefined;
  private axiomDataset: string | undefined;
  private axiomUrl: string;
  private context: LogContext = {};
  private functionName: string;

  constructor(functionName: string) {
    this.functionName = functionName;
    this.axiomToken = Deno.env.get('AXIOM_TOKEN');
    this.axiomDataset = Deno.env.get('AXIOM_DATASET');
    this.axiomUrl = Deno.env.get('AXIOM_URL') || 'https://api.axiom.co/v1/datasets';
    this.context.function_name = functionName;
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
    this.context = { function_name: this.functionName };
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
      // Silently fail - don't break the function if logging fails
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
    console.debug(`[${this.functionName}] ${message}`, context || {});
    // Don't send debug logs to Axiom to save quota
  }

  /**
   * Log at info level
   */
  info(message: string, context?: Partial<LogContext>): void {
    console.log(`[${this.functionName}] ${message}`, context || {});
    this.sendToAxiom(this.createLogEntry('info', message, context));
  }

  /**
   * Log at warn level
   */
  warn(message: string, context?: Partial<LogContext>): void {
    console.warn(`[${this.functionName}] ${message}`, context || {});
    this.sendToAxiom(this.createLogEntry('warn', message, context));
  }

  /**
   * Log at error level
   */
  error(message: string, error?: Error, context?: Partial<LogContext>): void {
    console.error(`[${this.functionName}] ${message}`, error, context || {});
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

/**
 * Create a logger instance for an edge function
 */
export function createLogger(functionName: string): EdgeLogger {
  return new EdgeLogger(functionName);
}









