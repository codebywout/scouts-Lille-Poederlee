/**
 * Lighthouse CI — mobile-only collect for local PHP server (PR preview).
 * Assertions are warn-only so low scores never fail the workflow.
 */
module.exports = {
  ci: {
    collect: {
      numberOfRuns: 2,
      url: [
        'http://127.0.0.1:8000/',
        'http://127.0.0.1:8000/inschrijven',
      ],
      settings: {
        // Mobile form factor + simulated mid-tier mobile throttling (Lighthouse defaults).
        formFactor: 'mobile',
        screenEmulation: {
          mobile: true,
          width: 412,
          height: 823,
          deviceScaleFactor: 1.75,
          disabled: false,
        },
        emulatedUserAgent:
          'Mozilla/5.0 (Linux; Android 11; moto g power (2022)) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Mobile Safari/537.36',
        throttlingMethod: 'simulate',
        throttling: {
          rttMs: 150,
          throughputKbps: 1638.4,
          requestLatencyMs: 562.5,
          downloadThroughputKbps: 1638.4,
          uploadThroughputKbps: 675,
          cpuSlowdownMultiplier: 4,
        },
        onlyCategories: ['performance', 'accessibility', 'seo'],
        // Skip PWA / installability noise for this static PHP site.
        skipAudits: ['uses-http2'],
      },
    },
    assert: {
      // Warn-only: prints regressions but keeps exit code 0.
      assertions: {
        'categories:performance': ['warn', { minScore: 0.5 }],
        'categories:accessibility': ['warn', { minScore: 0.7 }],
        'categories:seo': ['warn', { minScore: 0.7 }],
        'largest-contentful-paint': ['warn', { maxNumericValue: 4000 }],
        'cumulative-layout-shift': ['warn', { maxNumericValue: 0.25 }],
        'total-blocking-time': ['warn', { maxNumericValue: 600 }],
      },
    },
    upload: {
      // Write HTML + JSON reports to a non-hidden directory.
      // (.lighthouseci is LHCI's temp working dir; upload-artifact skips dotfolders by default.)
      target: 'filesystem',
      outputDir: 'lhci-reports',
      reportFilenamePattern:
        '%%PATHNAME%%-%%DATETIME%%.report.%%EXTENSION%%',
    },
  },
};
