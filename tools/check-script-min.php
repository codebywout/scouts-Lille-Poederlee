<?php
declare(strict_types=1);

/**
 * Verify assets/js/script.min.js matches assets/js/script.js (SHA-256 marker + syntax).
 *
 * Exit 0 = OK. Non-zero = do not deploy.
 *
 * Usage (from repo root):
 *   php tools/check-script-min.php
 */

$root = dirname(__DIR__);
$srcPath = $root . DIRECTORY_SEPARATOR . 'assets' . DIRECTORY_SEPARATOR . 'js' . DIRECTORY_SEPARATOR . 'script.js';
$minPath = $root . DIRECTORY_SEPARATOR . 'assets' . DIRECTORY_SEPARATOR . 'js' . DIRECTORY_SEPARATOR . 'script.min.js';

function check_fail(string $message, int $code = 1): never
{
    fwrite(STDERR, "[check-script-min] {$message}\n");
    exit($code);
}

if (!is_file($srcPath)) {
    check_fail("Source missing: {$srcPath}");
}
if (!is_readable($srcPath)) {
    check_fail("Source not readable: {$srcPath}");
}
if (!is_file($minPath)) {
    check_fail("Minified missing: {$minPath} — run: node tools/minify-script.mjs");
}
if (!is_readable($minPath)) {
    check_fail("Minified not readable: {$minPath}");
}

$srcRaw = file_get_contents($srcPath);
if ($srcRaw === false) {
    check_fail('Could not read script.js');
}
// LF-normalize so Windows CRLF checkouts match the git blob / Linux CI hash.
$srcHash = hash('sha256', str_replace("\r\n", "\n", $srcRaw));
if ($srcHash === false || strlen($srcHash) !== 64) {
    check_fail('Could not hash script.js');
}

$min = file_get_contents($minPath);
if ($min === false || $min === '') {
    check_fail('Could not read script.min.js or file is empty');
}

if (preg_match('/\/\*!?\s*scouts-src-sha256=([a-f0-9]{64})\s*\*\//', $min, $m) !== 1) {
    check_fail('SHA-256 marker missing or malformed in script.min.js');
}

$markerHash = $m[1];
if (!hash_equals($srcHash, $markerHash)) {
    check_fail(
        "Stale minified output: marker={$markerHash} source={$srcHash}\n" .
        "  Run: node tools/minify-script.mjs"
    );
}

foreach (['window.ScoutsSite', 'window.__scoutsImgFallback', '__scoutsImgFallback'] as $token) {
    if (!str_contains($min, $token)) {
        check_fail("Minified output missing required token: {$token}");
    }
}

$node = trim((string) shell_exec('node -v 2>&1'));
if ($node === '' || !str_starts_with($node, 'v')) {
    check_fail('node is required for syntax check (node -v failed)');
}

$descriptors = [
    0 => ['pipe', 'r'],
    1 => ['pipe', 'w'],
    2 => ['pipe', 'w'],
];
$cmd = ['node', '--check', $minPath];
$proc = proc_open($cmd, $descriptors, $pipes, $root);
if (!is_resource($proc)) {
    check_fail('Could not start node --check');
}
fclose($pipes[0]);
$stdout = stream_get_contents($pipes[1]);
$stderr = stream_get_contents($pipes[2]);
fclose($pipes[1]);
fclose($pipes[2]);
$status = proc_close($proc);
if ($status !== 0) {
    check_fail("node --check failed for script.min.js:\n{$stderr}{$stdout}");
}

$srcCheck = proc_open(['node', '--check', $srcPath], $descriptors, $pipes2, $root);
if (!is_resource($srcCheck)) {
    check_fail('Could not start node --check for script.js');
}
fclose($pipes2[0]);
stream_get_contents($pipes2[1]);
$stderr2 = stream_get_contents($pipes2[2]);
fclose($pipes2[1]);
fclose($pipes2[2]);
$status2 = proc_close($srcCheck);
if ($status2 !== 0) {
    check_fail("node --check failed for script.js:\n{$stderr2}");
}

fwrite(STDOUT, "[check-script-min] OK sha256={$srcHash} min_bytes=" . strlen($min) . "\n");
exit(0);
