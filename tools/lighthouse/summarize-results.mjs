#!/usr/bin/env node
/**
 * Print a concise mobile Lighthouse summary from .lighthouseci/*.json (LHCI collect output).
 * Always exits 0.
 */

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const preferred = process.argv[2] || 'lhci-reports';
const fallback = '.lighthouseci';
const dir = existsSync(preferred) ? preferred : fallback;

if (!existsSync(dir)) {
  console.warn(`WARN  No Lighthouse output directory at ${preferred} or ${fallback}`);
  process.exit(0);
}

console.log(`Reading Lighthouse JSON from ${dir}`);

const files = readdirSync(dir).filter(
  (name) =>
    name.endsWith('.json') &&
    !name.includes('assertion-results') &&
    name !== 'manifest.json'
);

if (files.length === 0) {
  console.warn(`WARN  No Lighthouse JSON reports in ${dir}`);
  process.exit(0);
}

function score100(raw) {
  return typeof raw === 'number' ? Math.round(raw * 100) : null;
}

function num(audit) {
  return typeof audit?.numericValue === 'number' ? Math.round(audit.numericValue) : null;
}

function cls(audit) {
  return typeof audit?.numericValue === 'number' ? Number(audit.numericValue.toFixed(3)) : null;
}

const byUrl = new Map();

for (const file of files) {
  let data;
  try {
    data = JSON.parse(readFileSync(join(dir, file), 'utf8'));
  } catch {
    continue;
  }
  if (!data?.categories || !data?.requestedUrl) {
    continue;
  }
  const url = data.finalRequestedUrl || data.requestedUrl;
  const entry = {
    file,
    performance: score100(data.categories.performance?.score),
    accessibility: score100(data.categories.accessibility?.score),
    seo: score100(data.categories.seo?.score),
    lcp_ms: num(data.audits?.['largest-contentful-paint']),
    cls: cls(data.audits?.['cumulative-layout-shift']),
    tbt_ms: num(data.audits?.['total-blocking-time']),
  };
  if (!byUrl.has(url)) {
    byUrl.set(url, []);
  }
  byUrl.get(url).push(entry);
}

console.log('=== Lighthouse mobile summary ===');
for (const [url, runs] of byUrl) {
  console.log(url);
  runs.forEach((run, i) => {
    console.log(
      `  run ${i + 1}: perf=${run.performance} a11y=${run.accessibility} seo=${run.seo} ` +
        `LCP=${run.lcp_ms ?? 'n/a'}ms CLS=${run.cls ?? 'n/a'} TBT=${run.tbt_ms ?? 'n/a'}ms`
    );
  });
}

process.exit(0);
