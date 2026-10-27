<?php
declare(strict_types=1);

/**
 * Smoke tests for the photo pipeline (CLI only).
 *
 * With GD: creates synthetic JPEG/PNG fixtures and runs the full store path.
 * Without GD: still validates dimension guards and naming rules.
 */

if (PHP_SAPI !== 'cli') {
    fwrite(STDERR, "CLI only.\n");
    exit(1);
}

$root = dirname(__DIR__);
require_once $root . DIRECTORY_SEPARATOR . 'config.php';

$failed = 0;
function expect(bool $cond, string $label): void
{
    global $failed;
    if ($cond) {
        fwrite(STDOUT, "  OK  {$label}\n");
    } else {
        fwrite(STDOUT, " FAIL {$label}\n");
        $failed++;
    }
}

fwrite(STDOUT, "=== Photo pipeline smoke tests ===\n");
fwrite(STDOUT, 'GD: ' . (scouts_photo_gd_available() ? 'yes' : 'NO') . PHP_EOL);

// Naming / guards (no GD required).
expect(scouts_allowed_photo_name('kapoenenleiding'), 'allowed fixed name');
expect(scouts_allowed_photo_name('bg-registration'), 'allowed background name');
expect(scouts_allowed_photo_name('news-123-abc'), 'allowed news name');
expect(!scouts_allowed_photo_name('../etc/passwd'), 'reject path traversal name');
expect(!scouts_allowed_photo_name('photo.svg'), 'reject odd name');

try {
    scouts_photo_assert_safe_dimensions(800, 600);
    expect(true, 'safe dimensions accepted');
} catch (Throwable $e) {
    expect(false, 'safe dimensions accepted');
}

try {
    scouts_photo_assert_safe_dimensions(20000, 20000);
    expect(false, 'bomb dimensions rejected');
} catch (InvalidArgumentException $e) {
    expect(true, 'bomb dimensions rejected');
}

if (!scouts_photo_gd_available()) {
    fwrite(STDOUT, "GD ontbreekt — volledige encode-tests overgeslagen.\n");
    fwrite(STDOUT, "Installeer php-gd op de server (vereiste voor uploads).\n");
    exit($failed > 0 ? 1 : 0);
}

$tmpDir = sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'scouts-photo-test-' . bin2hex(random_bytes(4));
mkdir($tmpDir, 0700);

try {
    // Synthetic JPEG
    $img = imagecreatetruecolor(640, 480);
    $bg = imagecolorallocate($img, 30, 120, 60);
    imagefilledrectangle($img, 0, 0, 639, 479, $bg);
    $jpegPath = $tmpDir . DIRECTORY_SEPARATOR . 'sample.jpg';
    imagejpeg($img, $jpegPath, 90);
    scouts_photo_destroy($img);

    $basename = 'news-' . time() . '-testpipe';
    $info = getimagesize($jpegPath);
    $path = scouts_store_uploaded_photo($jpegPath, $basename, 'image/jpeg', (int) $info[0], (int) $info[1]);
    expect(str_contains($path, '/uploads/' . $basename . '.jpg'), 'store returns public path');
    expect(is_file(SCOUTS_UPLOADS_DIR . DIRECTORY_SEPARATOR . $basename . '.jpg'), 'public master exists');
    expect(is_file(SCOUTS_UPLOADS_DIR . DIRECTORY_SEPARATOR . $basename . '-w800.jpg'), 'w800 jpg exists');
    expect(
        !scouts_photo_webp_available()
            || is_file(SCOUTS_UPLOADS_DIR . DIRECTORY_SEPARATOR . $basename . '-w800.webp'),
        'w800 webp exists when supported'
    );

    $origFound = false;
    foreach (['jpg', 'jpeg', 'png', 'webp', 'gif', 'bin'] as $ext) {
        if (is_file(scouts_photo_originals_dir() . DIRECTORY_SEPARATOR . $basename . '.' . $ext)) {
            $origFound = true;
            break;
        }
    }
    expect($origFound, 'private original stored');

    // PNG with transparency
    $png = imagecreatetruecolor(200, 200);
    imagealphablending($png, false);
    imagesavealpha($png, true);
    $transparent = imagecolorallocatealpha($png, 0, 0, 0, 127);
    imagefilledrectangle($png, 0, 0, 199, 199, $transparent);
    $red = imagecolorallocatealpha($png, 200, 40, 40, 40);
    imagefilledellipse($png, 100, 100, 120, 120, $red);
    $pngPath = $tmpDir . DIRECTORY_SEPARATOR . 'alpha.png';
    imagepng($png, $pngPath);
    scouts_photo_destroy($png);

    $basename2 = 'news-' . time() . '-alphatest';
    $info2 = getimagesize($pngPath);
    scouts_store_uploaded_photo($pngPath, $basename2, 'image/png', (int) $info2[0], (int) $info2[1]);
    expect(is_file(SCOUTS_UPLOADS_DIR . DIRECTORY_SEPARATOR . $basename2 . '.jpg'), 'png upload becomes public jpeg');

    // Too-large file rejected by assert (synthetic 1x1 is fine; test API-level bomb)
    try {
        scouts_photo_assert_safe_dimensions(9000, 9000);
        expect(false, '9k x 9k rejected by pixel budget');
    } catch (InvalidArgumentException $e) {
        expect(true, '9k x 9k rejected by pixel budget');
    }

    // Cleanup test uploads
    scouts_delete_photo_versions($basename);
    scouts_delete_photo_versions($basename2);
    expect(!is_file(SCOUTS_UPLOADS_DIR . DIRECTORY_SEPARATOR . $basename . '.jpg'), 'cleanup removed master');
} catch (Throwable $e) {
    fwrite(STDOUT, ' FAIL exception: ' . $e->getMessage() . "\n");
    $failed++;
} finally {
    foreach (glob($tmpDir . DIRECTORY_SEPARATOR . '*') ?: [] as $f) {
        @unlink($f);
    }
    @rmdir($tmpDir);
}

fwrite(STDOUT, $failed === 0 ? "All tests passed.\n" : "{$failed} failure(s).\n");
exit($failed > 0 ? 1 : 0);
