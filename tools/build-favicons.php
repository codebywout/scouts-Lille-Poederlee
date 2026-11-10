<?php
declare(strict_types=1);

/**
 * Build stable favicon assets from assets/images/scouts.png.
 * Google Search wants a square icon (>=48px recommended) at a stable URL.
 */

$root = dirname(__DIR__);
$srcPath = $root . DIRECTORY_SEPARATOR . 'assets' . DIRECTORY_SEPARATOR . 'images' . DIRECTORY_SEPARATOR . 'scouts.png';
$outDir = $root . DIRECTORY_SEPARATOR . 'assets' . DIRECTORY_SEPARATOR . 'images';

if (!extension_loaded('gd')) {
    fwrite(STDERR, "GD extension required\n");
    exit(1);
}
if (!is_file($srcPath)) {
    fwrite(STDERR, "Missing source logo: {$srcPath}\n");
    exit(1);
}

$src = imagecreatefrompng($srcPath);
if ($src === false) {
    fwrite(STDERR, "Could not read {$srcPath}\n");
    exit(1);
}
imagesavealpha($src, true);

$writePng = static function ($image, string $path): void {
    imagesavealpha($image, true);
    if (!imagepng($image, $path, 6)) {
        throw new RuntimeException("Failed writing {$path}");
    }
};

$sizes = [16, 32, 48, 180, 192];
foreach ($sizes as $size) {
    $scaled = imagescale($src, $size, $size, IMG_BICUBIC);
    if ($scaled === false) {
        imagedestroy($src);
        fwrite(STDERR, "Could not scale to {$size}px\n");
        exit(1);
    }
    $path = $outDir . DIRECTORY_SEPARATOR . "favicon-{$size}.png";
    $writePng($scaled, $path);
    echo "wrote {$path}\n";
}

/**
 * Minimal ICO containing a PNG payload (supported by modern browsers / Google).
 */
$png48 = $outDir . DIRECTORY_SEPARATOR . 'favicon-48.png';
$pngBytes = file_get_contents($png48);
if ($pngBytes === false) {
    imagedestroy($src);
    fwrite(STDERR, "Could not read favicon-48.png\n");
    exit(1);
}

$ico = pack('vvv', 0, 1, 1); // reserved, type=icon, count=1
$ico .= pack('CCCCvvVV', 48, 48, 0, 0, 1, 32, strlen($pngBytes), 22);
$ico .= $pngBytes;

$icoPath = $root . DIRECTORY_SEPARATOR . 'favicon.ico';
if (file_put_contents($icoPath, $ico) === false) {
    imagedestroy($src);
    fwrite(STDERR, "Could not write favicon.ico\n");
    exit(1);
}
echo "wrote {$icoPath}\n";
echo "OK\n";
