// =============================================================================
// WEB VITALS - Native Performance Monitoring
// =============================================================================
// Lightweight web vitals measurement using native PerformanceObserver API
// No external dependencies - measures LCP, FID, CLS, and INP

/**
 * @typedef {Object} WebVitalMetric
 * @property {string} name - Metric name (LCP, FID, CLS, INP)
 * @property {number} value - Metric value
 * @property {string} rating - 'good' | 'needs-improvement' | 'poor'
 */

/**
 * @typedef {function(WebVitalMetric): void} MetricCallback
 */

// Thresholds based on Google's Core Web Vitals recommendations
const THRESHOLDS = {
  LCP: { good: 2500, poor: 4000 },    // milliseconds
  FID: { good: 100, poor: 300 },       // milliseconds
  CLS: { good: 0.1, poor: 0.25 },      // unitless
  INP: { good: 200, poor: 500 }        // milliseconds
};

/**
 * Get rating based on metric value and thresholds
 * @param {string} name - Metric name
 * @param {number} value - Metric value
 * @returns {'good' | 'needs-improvement' | 'poor'}
 */
function getRating(name, value) {
  const threshold = THRESHOLDS[name];
  if (!threshold) return 'good';
  if (value <= threshold.good) return 'good';
  if (value <= threshold.poor) return 'needs-improvement';
  return 'poor';
}

/**
 * Create a metric object
 * @param {string} name - Metric name
 * @param {number} value - Metric value
 * @returns {WebVitalMetric}
 */
function createMetric(name, value) {
  return {
    name,
    value: Math.round(value * 1000) / 1000, // Round to 3 decimal places
    rating: getRating(name, value)
  };
}

/** @type {MetricCallback | null} */
let callback = null;

/** @type {WebVitalMetric[]} */
const collectedMetrics = [];

/**
 * Report a metric to the callback and store it
 * @param {WebVitalMetric} metric
 */
function reportMetric(metric) {
  collectedMetrics.push(metric);

  if (callback) {
    callback(metric);
  } else {
    // Default: log to console in development
    const emoji = metric.rating === 'good' ? '✅' : metric.rating === 'needs-improvement' ? '⚠️' : '❌';
    console.log(`${emoji} ${metric.name}: ${metric.value}${metric.name === 'CLS' ? '' : 'ms'} (${metric.rating})`);
  }
}

/**
 * Observe Largest Contentful Paint (LCP)
 * LCP measures loading performance - the time until the largest content element is visible
 */
function observeLCP() {
  if (!('PerformanceObserver' in window)) return;

  try {
    const observer = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      const lastEntry = entries[entries.length - 1];
      if (lastEntry) {
        reportMetric(createMetric('LCP', lastEntry.startTime));
      }
    });

    observer.observe({ type: 'largest-contentful-paint', buffered: true });

    // LCP should be finalized by page hide or first input
    const finalizeLCP = () => {
      observer.disconnect();
    };

    // Hidden visibility indicates user navigated away
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        finalizeLCP();
      }
    }, { once: true });
  } catch (e) {
    console.warn('LCP observation not supported:', e);
  }
}

/**
 * Observe First Input Delay (FID)
 * FID measures interactivity - the time from first user interaction to browser response
 */
function observeFID() {
  if (!('PerformanceObserver' in window)) return;

  try {
    const observer = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      const firstEntry = entries[0];
      if (firstEntry) {
        reportMetric(createMetric('FID', firstEntry.processingStart - firstEntry.startTime));
        observer.disconnect();
      }
    });

    observer.observe({ type: 'first-input', buffered: true });
  } catch (e) {
    console.warn('FID observation not supported:', e);
  }
}

/**
 * Observe Cumulative Layout Shift (CLS)
 * CLS measures visual stability - cumulative score of unexpected layout shifts
 */
function observeCLS() {
  if (!('PerformanceObserver' in window)) return;

  try {
    let clsValue = 0;
    let sessionValue = 0;
    let sessionEntries = [];

    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        // Only count layout shifts without recent user input
        if (!entry.hadRecentInput) {
          const firstSessionEntry = sessionEntries[0];
          const lastSessionEntry = sessionEntries[sessionEntries.length - 1];

          // If entry occurred within 1 second of previous entry and within 5 seconds
          // of the first entry in the session, include it in the current session
          if (sessionValue &&
              entry.startTime - lastSessionEntry.startTime < 1000 &&
              entry.startTime - firstSessionEntry.startTime < 5000) {
            sessionValue += entry.value;
            sessionEntries.push(entry);
          } else {
            // New session
            sessionValue = entry.value;
            sessionEntries = [entry];
          }

          // Update CLS value if this session is larger
          if (sessionValue > clsValue) {
            clsValue = sessionValue;
          }
        }
      }
    });

    observer.observe({ type: 'layout-shift', buffered: true });

    // Report CLS on page hide
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden' && clsValue > 0) {
        reportMetric(createMetric('CLS', clsValue));
      }
    }, { once: true });
  } catch (e) {
    console.warn('CLS observation not supported:', e);
  }
}

/**
 * Observe Interaction to Next Paint (INP)
 * INP measures responsiveness - the longest interaction latency throughout page lifecycle
 */
function observeINP() {
  if (!('PerformanceObserver' in window)) return;

  try {
    let maxINP = 0;

    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        // Get the duration of the interaction
        const duration = entry.duration;
        if (duration > maxINP) {
          maxINP = duration;
        }
      }
    });

    observer.observe({ type: 'event', buffered: true, durationThreshold: 16 });

    // Report INP on page hide
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden' && maxINP > 0) {
        reportMetric(createMetric('INP', maxINP));
      }
    }, { once: true });
  } catch (e) {
    // INP observation may not be supported in all browsers
    console.warn('INP observation not supported:', e);
  }
}

/**
 * Initialize web vitals monitoring
 * @param {MetricCallback} [onMetric] - Optional callback for each metric
 */
export function initWebVitals(onMetric) {
  if (typeof onMetric === 'function') {
    callback = onMetric;
  }

  // Start observing all metrics
  observeLCP();
  observeFID();
  observeCLS();
  observeINP();
}

/**
 * Get all collected metrics
 * @returns {WebVitalMetric[]}
 */
export function getMetrics() {
  return [...collectedMetrics];
}

/**
 * Check if all core web vitals are 'good'
 * @returns {boolean}
 */
export function hasGoodVitals() {
  const lcpMetric = collectedMetrics.find(m => m.name === 'LCP');
  const fidMetric = collectedMetrics.find(m => m.name === 'FID');
  const clsMetric = collectedMetrics.find(m => m.name === 'CLS');

  if (!lcpMetric || !fidMetric || !clsMetric) {
    return false; // Not all metrics collected yet
  }

  return lcpMetric.rating === 'good' &&
         fidMetric.rating === 'good' &&
         clsMetric.rating === 'good';
}
