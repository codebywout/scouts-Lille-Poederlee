#!/usr/bin/env node
/**
 * Generate assets/js/script.min.js from assets/js/script.js using vendored Terser 5.37.0.
 *
 * Usage (from repo root):
 *   node tools/minify-script.mjs
 *
 * Requires: tools/vendor/node_modules/terser (see tools/vendor/README.md).
 */
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const srcPath = join(root, 'assets', 'js', 'script.js');
const outPath = join(root, 'assets', 'js', 'script.min.js');
const terserJs = join(__dirname, 'vendor', 'node_modules', 'terser', 'bin', 'terser');

function fail(message, code = 1) {
  console.error(`[minify-script] ${message}`);
  process.exit(code);
}

if (!existsSync(srcPath)) {
  fail(`Source missing: ${srcPath}`);
}
if (!existsSync(terserJs)) {
  fail(
    'Vendored Terser not installed. Run:\n' +
      '  cd tools/vendor\n' +
      '  set NODE_OPTIONS=--use-system-ca\n' +
      '  npm install'
  );
}

const source = readFileSync(srcPath);
// Hash LF-normalized bytes so Windows (CRLF checkout) matches Linux CI / git blob.
const sourceForHash = Buffer.from(source.toString('utf8').replace(/\r\n/g, '\n'), 'utf8');
const sha256 = createHash('sha256').update(sourceForHash).digest('hex');
if (!/^[a-f0-9]{64}$/.test(sha256)) {
  fail('Unexpected SHA-256 digest');
}

const srcCheck = spawnSync(process.execPath, ['--check', srcPath], {
  encoding: 'utf8',
});
if (srcCheck.status !== 0) {
  fail(`Source syntax check failed:\n${srcCheck.stderr || srcCheck.stdout}`);
}

const workDir = mkdtempSync(join(tmpdir(), 'scouts-minify-'));
const tmpMin = join(workDir, 'script.min.raw.js');
const tmpFinal = join(workDir, 'script.min.js');

try {
  const terser = spawnSync(
    process.execPath,
    [terserJs, srcPath, '-c', 'passes=1', '-m', '-o', tmpMin],
    { encoding: 'utf8' }
  );
  if (terser.status !== 0 || !existsSync(tmpMin)) {
    fail(`Terser failed:\n${terser.stderr || terser.stdout || '(no output)'}`);
  }

  const minBody = readFileSync(tmpMin, 'utf8').trim();
  if (!minBody) {
    fail('Terser produced empty output');
  }

  const marker = `/*! scouts-src-sha256=${sha256} */`;
  const finalSource = `${marker}\n${minBody}\n`;
  writeFileSync(tmpFinal, finalSource, 'utf8');

  const minCheck = spawnSync(process.execPath, ['--check', tmpFinal], {
    encoding: 'utf8',
  });
  if (minCheck.status !== 0) {
    fail(`Minified syntax check failed:\n${minCheck.stderr || minCheck.stdout}`);
  }

  for (const token of ['window.ScoutsSite', 'window.__scoutsImgFallback', '__scoutsImgFallback']) {
    if (!finalSource.includes(token)) {
      fail(`Minified output missing required token: ${token}`);
    }
  }

  renameSync(tmpFinal, outPath);
  console.log(`[minify-script] Wrote ${outPath}`);
  console.log(`[minify-script] scouts-src-sha256=${sha256}`);
  console.log(`[minify-script] raw_src=${source.length} raw_min=${Buffer.byteLength(finalSource)}`);
} finally {
  rmSync(workDir, { recursive: true, force: true });
}
