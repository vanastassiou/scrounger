// =============================================================================
// LOGGER UTILITY
// =============================================================================
// Structured logging with configurable levels.
// Set localStorage.logLevel to 'debug', 'info', 'warn', or 'error' to control output.

const LOG_LEVELS = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  silent: 4
};

/**
 * Get current log level from localStorage or default to 'warn'.
 * @returns {string}
 */
function getLogLevel() {
  if (typeof localStorage === 'undefined') return 'warn';
  return localStorage.getItem('logLevel') || 'warn';
}

/**
 * Check if a given level should be logged.
 * @param {string} level
 * @returns {boolean}
 */
function shouldLog(level) {
  const currentLevel = LOG_LEVELS[getLogLevel()] ?? LOG_LEVELS.warn;
  const targetLevel = LOG_LEVELS[level] ?? LOG_LEVELS.debug;
  return targetLevel >= currentLevel;
}

/**
 * Format a log message with timestamp and level.
 * @param {string} level
 * @param {string} module
 * @returns {string}
 */
function formatPrefix(level, module) {
  const timestamp = new Date().toISOString().slice(11, 23);
  const moduleStr = module ? `[${module}]` : '';
  return `${timestamp} [${level.toUpperCase()}]${moduleStr}`;
}

/**
 * Create a logger instance, optionally scoped to a module.
 * @param {string} [moduleName] - Optional module name for prefixing
 * @returns {Object} Logger with debug, info, warn, error methods
 */
export function createLogger(moduleName = '') {
  return {
    debug(...args) {
      if (shouldLog('debug')) {
        console.log(formatPrefix('debug', moduleName), ...args);
      }
    },
    
    info(...args) {
      if (shouldLog('info')) {
        console.info(formatPrefix('info', moduleName), ...args);
      }
    },
    
    warn(...args) {
      if (shouldLog('warn')) {
        console.warn(formatPrefix('warn', moduleName), ...args);
      }
    },
    
    error(...args) {
      if (shouldLog('error')) {
        console.error(formatPrefix('error', moduleName), ...args);
      }
    },

    /**
     * Log an error with stack trace if available.
     * @param {string} message
     * @param {Error} [err]
     */
    errorWithStack(message, err) {
      if (shouldLog('error')) {
        console.error(formatPrefix('error', moduleName), message);
        if (err?.stack) {
          console.error(err.stack);
        }
      }
    },

    /**
     * Time an async operation.
     * @param {string} label
     * @param {Function} fn - Async function to time
     * @returns {Promise<*>} Result of fn
     */
    async time(label, fn) {
      if (!shouldLog('debug')) {
        return fn();
      }
      const start = performance.now();
      try {
        return await fn();
      } finally {
        const duration = (performance.now() - start).toFixed(2);
        console.log(formatPrefix('debug', moduleName), `${label} completed in ${duration}ms`);
      }
    }
  };
}

// Default logger instance (no module prefix)
export const log = createLogger();

// Convenience: set log level programmatically
export function setLogLevel(level) {
  if (LOG_LEVELS[level] !== undefined) {
    localStorage.setItem('logLevel', level);
  }
}

// Convenience: get available log levels
export function getLogLevels() {
  return Object.keys(LOG_LEVELS).filter(l => l !== 'silent');
}
