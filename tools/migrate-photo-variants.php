<?php
declare(strict_types=1);

/**
 * CLI-only migration: regenerate responsive photo variants for existing uploads.
 *
 * Usage (from project root):
 *   php tools/migrate-photo-variants.php
 *   php tools/migrate-photo-variants.php --dry-run
 *   php tools/migrate-photo-variants.php --only=kapoenenleiding,news-123-abc
 *
 * Does NOT run during normal web requests. Does not delete originals.
 * Requires PHP GD (imagejpeg + imagescale). WebP/AVIF written when available.
 */

if (PHP_SAPI !== 'cli') {
    fwrite(STDERR, "Dit script mag alleen via CLI worden uitgevoerd.\n");
    exit(1);
}

$root = dirname(__DIR__);
require_once $root . DIRECTORY_SEPARATOR . 'config.php';

$dryRun = in_array('--dry-run', $argv, true);
$only = null;
foreach ($argv as $arg) {
    if (str_starts_with($arg, '--only=')) {
        $only = array_values(array_filter(array_map('trim', explode(',', substr($arg, 7)))));
    }
}

if (!scouts_photo_gd_available()) {
    fwrite(STDERR, "FOUT: PHP GD ontbreekt (imagejpeg/imagescale).\n");
    exit(1);
}

fwrite(STDOUT, 'GD OK | WebP: ' . (scouts_photo_webp_available() ? 'ja' : 'nee'));
fwrite(STDOUT, ' | AVIF: ' . (scouts_photo_avif_available() ? 'ja' : 'nee') . PHP_EOL);
if ($dryRun) {
    fwrite(STDOUT, "Dry-run: er worden geen bestanden geschreven.\n");
}

$uploads = SCOUTS_UPLOADS_DIR;
$entries = scandir($uploads) ?: [];
$basenames = [];

foreach ($entries as $entry) {
    if ($entry === '.' || $entry === '..' || is_dir($uploads . DIRECTORY_SEPARATOR . $entry)) {
        continue;
    }
    if (!preg_match('/^(.+)\.(jpe?g|png|webp|gif)$/i', $entry, $m)) {
        continue;
    }
    $stem = $m[1];
    if (preg_match('/-(?:thumb|md|display|w\d+)$/i', $stem)) {
        continue;
    }
    if (!scouts_allowed_photo_name($stem)) {
        continue;
    }
    $basenames[$stem] = true;
}

// Also include private originals that have no public master yet.
$origDir = scouts_photo_originals_dir();
if (is_dir($origDir)) {
    foreach (scandir($origDir) ?: [] as $entry) {
        if (!preg_match('/^(.+)\.(jpe?g|png|webp|gif|bin)$/i', $entry, $m)) {
            continue;
        }
        $stem = $m[1];
        if (scouts_allowed_photo_name($stem)) {
            $basenames[$stem] = true;
        }
    }
}

$targets = array_keys($basenames);
sort($targets);
if (is_array($only)) {
    $targets = array_values(array_intersect($targets, $only));
}

fwrite(STDOUT, 'Gevonden masters: ' . count($targets) . PHP_EOL);

$ok = 0;
$fail = 0;
foreach ($targets as $basename) {
    fwrite(STDOUT, "- {$basename} ... ");
    if ($dryRun) {
        fwrite(STDOUT, "skip (dry-run)\n");
        $ok++;
        continue;
    }
    try {
        $result = scouts_photo_regenerate_variants($basename, true);
        fwrite(STDOUT, 'ok (w' . implode(',w', $result['widths']) . ")\n");
        $ok++;
    } catch (Throwable $e) {
        fwrite(STDOUT, 'FOUT: ' . $e->getMessage() . "\n");
        $fail++;
    }
}

fwrite(STDOUT, "Klaar. OK={$ok} FOUT={$fail}\n");
exit($fail > 0 ? 2 : 0);
