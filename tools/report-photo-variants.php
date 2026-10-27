<?php
declare(strict_types=1);

/**
 * Report sizes/dimensions for representative photo variants (CLI).
 * Does not delete or modify files.
 */

if (PHP_SAPI !== 'cli') {
    fwrite(STDERR, "CLI only.\n");
    exit(1);
}

$root = dirname(__DIR__);
require_once $root . DIRECTORY_SEPARATOR . 'config.php';

$targets = array_slice($argv, 1);
if ($targets === []) {
    $targets = [];
    foreach (['bg-home', 'domein'] as $name) {
        $upload = SCOUTS_UPLOADS_DIR . DIRECTORY_SEPARATOR . $name . '.jpg';
        $asset = SCOUTS_ROOT . DIRECTORY_SEPARATOR . 'assets' . DIRECTORY_SEPARATOR . 'images' . DIRECTORY_SEPARATOR . $name . '.jpg';
        if (is_file($upload)) {
            $targets[] = $upload;
        } elseif (is_file($asset)) {
            $targets[] = $asset;
        }
    }
}

if ($targets === []) {
    fwrite(STDERR, "Geen bestanden gevonden. Gebruik: php tools/report-photo-variants.php [pad-naar-master.jpg]\n");
    exit(1);
}

function report_one(string $masterPath): void
{
    if (!is_file($masterPath)) {
        fwrite(STDOUT, "SKIP missing {$masterPath}\n");
        return;
    }

    $dir = dirname($masterPath);
    $base = preg_replace('/\.[^.]+$/', '', basename($masterPath)) ?? basename($masterPath);
    $masterInfo = @getimagesize($masterPath);
    $masterW = is_array($masterInfo) ? (int) $masterInfo[0] : 0;
    $masterH = is_array($masterInfo) ? (int) $masterInfo[1] : 0;

    fwrite(STDOUT, "\n=== {$base} ===\n");
    fwrite(STDOUT, sprintf(
        "Master: %dx%d, %s bytes (%s)\n",
        $masterW,
        $masterH,
        number_format(filesize($masterPath), 0, ',', '.'),
        $masterPath
    ));

    $total = (int) filesize($masterPath);
    foreach (SCOUTS_PHOTO_VARIANT_WIDTHS as $w) {
        foreach (['jpg', 'webp', 'avif'] as $ext) {
            $path = $dir . DIRECTORY_SEPARATOR . $base . '-w' . $w . '.' . $ext;
            if (!is_file($path)) {
                continue;
            }
            $info = @getimagesize($path);
            $pw = is_array($info) ? (int) $info[0] : 0;
            $ph = is_array($info) ? (int) $info[1] : 0;
            $size = (int) filesize($path);
            $total += $size;
            $mismatch = $pw > 0 && $pw !== $w ? "  [pixels={$pw}, name={$w}w]" : '';
            fwrite(STDOUT, sprintf(
                "  -w%-4d .%-4s  %4dx%-4d  %10s bytes%s\n",
                $w,
                $ext,
                $pw,
                $ph,
                number_format($size, 0, ',', '.'),
                $mismatch
            ));
        }
    }
    fwrite(STDOUT, 'Variant+master totaal: ' . number_format($total, 0, ',', '.') . " bytes\n");

    if ($masterW > 0) {
        $built = scouts_photo_build_srcset(
            $dir . DIRECTORY_SEPARATOR . $base,
            '/virtual/' . $base,
            'jpg',
            [800, 1200, 1600, 2400],
            'v=report'
        );
        fwrite(STDOUT, 'Srcset (deduped descriptors): ' . $built['srcset'] . "\n");
    }
}

foreach ($targets as $target) {
    report_one($target);
}

fwrite(STDOUT, "\nGD webp=" . (scouts_photo_webp_available() ? 'yes' : 'no')
    . ' avif=' . (scouts_photo_avif_available() ? 'yes' : 'no') . "\n");
fwrite(STDOUT, 'MAX_PIXELS=' . SCOUTS_PHOTO_MAX_PIXELS . ' MAX_EDGE=' . SCOUTS_PHOTO_MAX_EDGE
    . ' memory_limit=' . ini_get('memory_limit') . "\n");
