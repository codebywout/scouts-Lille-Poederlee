#!/usr/bin/env node
/**
 * Mobile PageSpeed Insights reporter for CI.
 * - Never prints the API key or a request URL containing the key.
 * - Treats API errors as warnings (exit 0); does not invent score 0 as a real measurement.
 * - Writes JSON summary for Actions artifacts.
 *
 * Usage: node tools/pagespeed-mobile-report.mjs [url ...]
 * Env: PAGESPEED_API_KEY (required for live calls)
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, '..', 'pagespeed-results');
const DEFAULT_URLS = [
  'https://scoutslille.be/',
  'https://scoutslille.be/inschrijven',
];

const urls = process.argv.slice(2).length > 0 ? process.argv.slice(2) : DEFAULT_URLS;
const apiKey = (process.env.PAGESPEED_API_KEY || '').trim();

const CATEGORIES = ['performance', 'accessibility', 'seo'];
const TIMEOUT_MS = 90_000;
const MAX_RETRIES = 2;

function score100(raw) {
  if (typeof raw !== 'number' || Number.isNaN(raw)) {
    return null;
  }
  return Math.round(raw * 100);
}

function metricMs(audits, id) {
  const audit = audits?.[id];
  if (!audit || typeof audit.numericValue !== 'number') {
    return null;
  }
  return Math.round(audit.numericValue);
}

function metricCls(audits) {
  const audit = audits?.['cumulative-layout-shift'];
  if (!audit || typeof audit.numericValue !== 'number') {
    return null;
  }
  return Number(audit.numericValue.toFixed(3));
}

async function fetchPsi(url) {
  const endpoint = new URL('https://www.googleapis.com/pagespeedonline/v5/runPagespeed');
  endpoint.searchParams.set('url', url);
  endpoint.searchParams.set('strategy', 'mobile');
  for (const category of CATEGORIES) {
    endpoint.searchParams.append('category', category);
  }
  endpoint.searchParams.set('key', apiKey);

  let lastError = 'unknown error';
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(endpoint, {
        method: 'GET',
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      });
      clearTimeout(timer);
      const text = await res.text();
      let body;
      try {
        body = JSON.parse(text);
      } catch {
        lastError = `non-JSON response (HTTP ${res.status})`;
        continue;
      }
      if (!res.ok || body.error) {
        const msg = body.error?.message || `HTTP ${res.status}`;
        lastError = msg;
        // Retry transient errors
        if (res.status === 429 || res.status >= 500) {
          continue;
        }
        return { ok: false, error: msg };
      }
      return { ok: true, body };
    } catch (err) {
      clearTimeout(timer);
      lastError = err?.name === 'AbortError' ? 'request timed out' : String(err?.message || err);
    }
  }
  return { ok: false, error: lastError };
}

function extractReport(url, body) {
  const lr = body?.lighthouseResult;
  if (!lr || typeof lr !== 'object') {
    return {
      url,
      ok: false,
      error: 'missing lighthouseResult in API response (not treated as score 0)',
    };
  }
  const categories = lr.categories || {};
  const audits = lr.audits || {};
  const performance = score100(categories.performance?.score);
  const accessibility = score100(categories.accessibility?.score);
  const seo = score100(categories.seo?.score);

  if (performance === null && accessibility === null && seo === null) {
    return {
      url,
      ok: false,
      error: 'API returned no category scores (not treated as score 0)',
    };
  }

  return {
    url,
    ok: true,
    strategy: 'mobile',
    scores: {
      performance,
      accessibility,
      seo,
    },
    metrics: {
      lcp_ms: metricMs(audits, 'largest-contentful-paint'),
      cls: metricCls(audits),
      tbt_ms: metricMs(audits, 'total-blocking-time'),
    },
    fetchTime: lr.fetchTime || null,
  };
}

function printReport(report) {
  if (!report.ok) {
    console.warn(`WARN  ${report.url}`);
    console.warn(`      ${report.error}`);
    return;
  }
  const { scores, metrics } = report;
  console.log(`OK    ${report.url}`);
  console.log(
    `      performance=${scores.performance} accessibility=${scores.accessibility} seo=${scores.seo}`
  );
  console.log(
    `      LCP=${metrics.lcp_ms ?? 'n/a'}ms CLS=${metrics.cls ?? 'n/a'} TBT=${metrics.tbt_ms ?? 'n/a'}ms`
  );
  for (const [name, value] of Object.entries(scores)) {
    if (typeof value === 'number' && value < 50) {
      console.warn(`      low ${name} score: ${value}/100 (non-blocking)`);
    }
  }
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });

  if (!apiKey) {
    console.warn(
      'WARN  PAGESPEED_API_KEY is not set. Skipping live PageSpeed calls (non-blocking).'
    );
    console.warn(
      '      Add repository secret PAGESPEED_API_KEY to enable mobile PageSpeed Insights.'
    );
    const summary = {
      generatedAt: new Date().toISOString(),
      skipped: true,
      reason: 'missing_api_key',
      urls,
      reports: [],
    };
    writeFileSync(join(OUT_DIR, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
    process.exit(0);
  }

  console.log(`PageSpeed Insights (mobile) for ${urls.length} URL(s)`);
  const reports = [];
  for (const url of urls) {
    console.log(`— Fetching ${url}`);
    const result = await fetchPsi(url);
    if (!result.ok) {
      const report = {
        url,
        ok: false,
        error: `PageSpeed API error: ${result.error}`,
      };
      reports.push(report);
      printReport(report);
      continue;
    }
    const report = extractReport(url, result.body);
    reports.push(report);
    printReport(report);
  }

  const summary = {
    generatedAt: new Date().toISOString(),
    skipped: false,
    strategy: 'mobile',
    urls,
    reports,
  };
  writeFileSync(join(OUT_DIR, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');

  const failed = reports.filter((r) => !r.ok).length;
  if (failed > 0) {
    console.warn(`WARN  ${failed}/${reports.length} URL(s) could not be measured (non-blocking).`);
  } else {
    console.log(`Done. ${reports.length} measurement(s) written to pagespeed-results/summary.json`);
  }
  process.exit(0);
}

main().catch((err) => {
  console.warn(`WARN  Unexpected failure: ${err?.message || err} (non-blocking)`);
  process.exit(0);
});
