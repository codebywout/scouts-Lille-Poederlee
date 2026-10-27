<?php
declare(strict_types=1);

/**
 * One-off: create compact WebP variants of branch kentekens (and scouts logo).
 * Keeps original PNGs. Max edge 192px — enough for 76–96 CSS px at 2–2.5x DPR.
 */

$root = dirname(__DIR__);
$targets = [
    $root . '/assets/images/branches/kapoenen.png',
    $root . '/assets/images/branches/welpen.png',
    $root . '/assets/images/branches/jong-verkenners.png',
    $root . '/assets/images/branches/verkenners.png',
    $root . '/assets/images/branches/jins.png',
    // scouts.png stays PNG: WebP was larger (~16 KiB vs ~5 KiB).
];

$maxEdge = 192;
$quality = 90;

foreach ($targets as $path) {
    if (!is_file($path)) {
        fwrite(STDERR, "Missing: {$path}\n");
        continue;
    }
    $img = @imagecreatefrompng($path);
    if ($img === false) {
        fwrite(STDERR, "Cannot read: {$path}\n");
        continue;
    }
    imagesavealpha($img, true);
    $w = imagesx($img);
    $h = imagesy($img);
    $scale = min(1.0, $maxEdge / max($w, $h));
    $nw = max(1, (int) round($w * $scale));
    $nh = max(1, (int) round($h * $scale));
    $out = imagescale($img, $nw, $nh, IMG_BICUBIC);
    if ($out === false) {
        fwrite(STDERR, "Scale failed: {$path}\n");
        continue;
    }
    imagesavealpha($out, true);
    $webp = preg_replace('/\.png$/i', '.webp', $path);
    if (!@imagewebp($out, $webp, $quality)) {
        fwrite(STDERR, "WebP write failed: {$webp}\n");
        continue;
    }
    @chmod($webp, 0644);
    echo basename($path) . " {$w}x{$h} -> {$nw}x{$nh} webp=" . filesize($webp)
        . ' png=' . filesize($path) . PHP_EOL;
}
