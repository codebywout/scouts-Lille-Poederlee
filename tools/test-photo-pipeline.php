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

// Isolate encode tests from the real uploads/ directory.
$tmpUploads = sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'scouts-uploads-test-' . bin2hex(random_bytes(4));
if (!mkdir($tmpUploads, 0700) && !is_dir($tmpUploads)) {
    fwrite(STDERR, "Could not create temp uploads dir.\n");
    exit(1);
}
@mkdir($tmpUploads . DIRECTORY_SEPARATOR . 'originals', 0700, true);
@file_put_contents(
    $tmpUploads . DIRECTORY_SEPARATOR . 'originals' . DIRECTORY_SEPARATOR . '.htaccess',
    "Require all denied\n"
);
putenv('SCOUTS_TEST_UPLOADS_DIR=' . $tmpUploads);
$_ENV['SCOUTS_TEST_UPLOADS_DIR'] = $tmpUploads;

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

    // 25 MP exceeds the 20 MP pre-decode budget (memory-safe).
    try {
        scouts_photo_assert_safe_dimensions(5000, 5000);
        expect(false, '25 MP rejected by pixel budget');
    } catch (InvalidArgumentException $e) {
        expect(true, '25 MP rejected by pixel budget');
    }

    // Narrow master: variant files keep -w2400 names but pixel width is capped;
    // srcset builder must dedupe descriptors to the real width.
    $narrow = imagecreatetruecolor(900, 600);
    $fill = imagecolorallocate($narrow, 40, 90, 160);
    imagefilledrectangle($narrow, 0, 0, 899, 599, $fill);
    $narrowPath = $tmpDir . DIRECTORY_SEPARATOR . 'narrow.jpg';
    imagejpeg($narrow, $narrowPath, 90);
    scouts_photo_destroy($narrow);

    $basename3 = 'news-' . time() . '-narrow';
    $info3 = getimagesize($narrowPath);
    $public3 = scouts_store_uploaded_photo(
        $narrowPath,
        $basename3,
        'image/jpeg',
        (int) $info3[0],
        (int) $info3[1]
    );
    expect(str_contains($public3, 'sw='), 'public path includes source-width hint');
    $w2400 = SCOUTS_UPLOADS_DIR . DIRECTORY_SEPARATOR . $basename3 . '-w2400.jpg';
    $w1200 = SCOUTS_UPLOADS_DIR . DIRECTORY_SEPARATOR . $basename3 . '-w1200.jpg';
    expect(is_file($w2400) && is_file($w1200), 'named wide variants exist for narrow source');
    $size2400 = @getimagesize($w2400);
    $size1200 = @getimagesize($w1200);
    expect(
        is_array($size2400) && (int) $size2400[0] === 900,
        'w2400 file is capped to source width 900'
    );
    expect(
        is_array($size1200) && (int) $size1200[0] === 900,
        'w1200 file is capped to source width 900'
    );
    $srcset = scouts_photo_build_srcset(
        SCOUTS_UPLOADS_DIR . DIRECTORY_SEPARATOR . $basename3,
        '/uploads/' . $basename3,
        'jpg',
        [800, 1200, 1600, 2400],
        'v=1&sw=900'
    );
    expect(substr_count($srcset['srcset'], ' 900w') === 1, 'srcset lists 900w only once');
    expect(!str_contains($srcset['srcset'], '2400w'), 'srcset does not claim 2400w for 900px file');

    // Failed staging must not delete an already-committed master.
    $keepName = 'news-' . time() . '-keep';
    $keepMaster = SCOUTS_UPLOADS_DIR . DIRECTORY_SEPARATOR . $keepName . '.jpg';
    $keepImg = imagecreatetruecolor(320, 240);
    imagejpeg($keepImg, $keepMaster, 85);
    scouts_photo_destroy($keepImg);
    $before = filesize($keepMaster);
    try {
        scouts_store_uploaded_photo(
            $tmpDir . DIRECTORY_SEPARATOR . 'does-not-exist.jpg',
            $keepName,
            'image/jpeg',
            320,
            240
        );
        expect(false, 'missing source should fail');
    } catch (Throwable $e) {
        expect(true, 'missing source should fail');
    }
    expect(
        is_file($keepMaster) && filesize($keepMaster) === $before,
        'failed upload leaves existing master intact'
    );

    // Originals stay private (htaccess deny) — file exists but under originals/.
    $origOk = is_file(scouts_photo_originals_dir() . DIRECTORY_SEPARATOR . $basename3 . '.jpg');
    expect($origOk, 'original stored under originals/');
    expect(
        is_file(SCOUTS_UPLOADS_DIR . DIRECTORY_SEPARATOR . 'originals' . DIRECTORY_SEPARATOR . '.htaccess'),
        'originals/.htaccess present'
    );

    // Subpage background boot: custom CSS vars + body class without waiting for JS.
    $regHtml = '<!DOCTYPE html><html><head></head><body class="registration-page"></body></html>';
    // Use a real upload stem if present; otherwise skip gracefully.
    if (is_file(SCOUTS_UPLOADS_DIR . DIRECTORY_SEPARATOR . 'bg-registration.jpg')) {
        $regHtml = file_get_contents(SCOUTS_ROOT . '/pages/inschrijven.html') ?: $regHtml;
        $booted = scouts_html_boot_page_background($regHtml, 'inschrijven');
        expect(str_contains($booted, 'scouts-has-custom-bg'), 'subpage boot adds custom-bg class');
        expect(str_contains($booted, 'scouts-page-bg-boot'), 'subpage boot injects CSS vars');
        expect(str_contains($booted, 'data-bg-boot="1"'), 'subpage boot marks data-bg-boot');
        expect(
            str_contains($booted, 'bg-registration') || str_contains($booted, '--scouts-custom-bg-800'),
            'subpage boot references custom background'
        );
        expect(!str_contains($booted, 'domein2-w1600'), 'subpage boot replaces domein2 preload');
        expect(str_contains($booted, 'bg-registration-w1600'), 'subpage preload points at custom w1600');
        expect(str_contains($booted, 'bg-registration-w800'), 'subpage preload includes custom w800');
        expect(str_contains($booted, 'media="(max-width: 768px)"'), 'subpage mobile preload is media-scoped');
        expect(str_contains($booted, 'media="(min-width: 769px)"'), 'subpage desktop preload is media-scoped');
        $assetV = scouts_asset_version();
        expect(str_contains($booted, 'v=' . $assetV), 'subpage boot CSS/preload use asset version');
        preg_match('/href="([^"]*bg-registration-w800[^"]*)"/', $booted, $preloadHref);
        preg_match('/url\("([^"]*bg-registration-w800[^"]*)"\)/', $booted, $cssUrl);
        expect(($preloadHref[1] ?? '') !== '', 'subpage w800 preload href present');
        expect(($cssUrl[1] ?? '') !== '', 'subpage w800 CSS url present');
        $preloadDecoded = html_entity_decode($preloadHref[1] ?? '', ENT_QUOTES | ENT_HTML5, 'UTF-8');
        $cssDecoded = html_entity_decode($cssUrl[1] ?? '', ENT_QUOTES | ENT_HTML5, 'UTF-8');
        expect(
            $preloadDecoded === $cssDecoded,
            'subpage preload URL matches CSS url (same cache key)'
        );
    } else {
        expect(true, 'subpage boot skipped (no bg-registration.jpg fixture)');
    }

    // Media-scoped default domein preloads (helper used when no custom bg).
    if (is_file(SCOUTS_ROOT . '/assets/images/domein2-w800.webp')) {
        $defaultLinks = scouts_html_page_bg_preload_links(
            SCOUTS_ROOT . '/assets/images/domein2',
            '/assets/images/domein2',
            ''
        );
        expect(str_contains($defaultLinks, 'domein2-w800'), 'default preload helper includes w800');
        expect(str_contains($defaultLinks, 'domein2-w1600'), 'default preload helper includes w1600');
        expect(str_contains($defaultLinks, 'media="(max-width: 768px)"'), 'default helper mobile media');
        expect(str_contains($defaultLinks, 'media="(min-width: 769px)"'), 'default helper desktop media');
    } else {
        expect(true, 'default preload helper skipped (no domein2 fixture)');
    }

    expect(scouts_page_background_slot_for_page('inschrijven') === 'registration', 'slot map inschrijven');
    expect(scouts_page_background_slot_for_page('kapoenen') === 'branch', 'slot map branch');
    expect(scouts_page_background_slot_for_page('index') === null, 'slot map index is null');

    // Homepage hero: preload stem matches <picture>, prefers AVIF when present.
    $indexHtml = file_get_contents(SCOUTS_ROOT . '/index.html') ?: '';
    if ($indexHtml !== '' && is_file(SCOUTS_UPLOADS_DIR . DIRECTORY_SEPARATOR . 'bg-home.jpg')) {
        $heroHtml = scouts_html_apply_home_hero_background($indexHtml);
        expect(str_contains($heroHtml, 'bg-home'), 'home hero rewrite uses bg-home');
        preg_match('#<link\s+rel="preload"\s+as="image"[^>]*>#i', $heroHtml, $homePreload);
        preg_match('#src="([^"]*bg-home[^"]*)"#i', $heroHtml, $homeSrc);
        expect(($homePreload[0] ?? '') !== '', 'home hero has image preload');
        expect(($homeSrc[1] ?? '') !== '', 'home hero img src set');
        if (preg_match('/href="([^"]+)"/', $homePreload[0] ?? '', $hrefBits)) {
            $pStem = preg_replace('/-w\d+\.(avif|webp|jpe?g).*/i', '', basename($hrefBits[1]));
            $sStem = preg_replace('/-w\d+\.(avif|webp|jpe?g).*/i', '', basename($homeSrc[1]));
            expect($pStem === $sStem, 'home preload stem matches img src stem');
        }
        if (is_file(SCOUTS_UPLOADS_DIR . DIRECTORY_SEPARATOR . 'bg-home-w800.avif')) {
            expect(
                str_contains($homePreload[0] ?? '', 'type="image/avif"'),
                'home preload prefers AVIF when variants exist'
            );
            expect(
                str_contains($heroHtml, 'type="image/avif"'),
                'home picture includes AVIF source'
            );
        }
    } else {
        expect(true, 'home hero rewrite skipped (no index/bg-home fixture)');
    }

    // Cleanup test uploads
    scouts_delete_photo_versions($basename);
    scouts_delete_photo_versions($basename2);
    scouts_delete_photo_versions($basename3);
    scouts_delete_photo_versions($keepName);
    expect(!is_file(SCOUTS_UPLOADS_DIR . DIRECTORY_SEPARATOR . $basename . '.jpg'), 'cleanup removed master');
} catch (Throwable $e) {
    fwrite(STDOUT, ' FAIL exception: ' . $e->getMessage() . "\n");
    $failed++;
} finally {
    foreach (glob($tmpDir . DIRECTORY_SEPARATOR . '*') ?: [] as $f) {
        @unlink($f);
    }
    @rmdir($tmpDir);

    $purge = static function (string $dir) use (&$purge): void {
        if (!is_dir($dir)) {
            return;
        }
        foreach (scandir($dir) ?: [] as $entry) {
            if ($entry === '.' || $entry === '..') {
                continue;
            }
            $path = $dir . DIRECTORY_SEPARATOR . $entry;
            if (is_dir($path)) {
                $purge($path);
            } else {
                @unlink($path);
            }
        }
        @rmdir($dir);
    };
    $purge($tmpUploads);
    putenv('SCOUTS_TEST_UPLOADS_DIR');
    unset($_ENV['SCOUTS_TEST_UPLOADS_DIR']);
}

fwrite(STDOUT, $failed === 0 ? "All tests passed.\n" : "{$failed} failure(s).\n");
exit($failed > 0 ? 1 : 0);
