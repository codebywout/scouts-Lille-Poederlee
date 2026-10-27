<?php
declare(strict_types=1);

/**
 * Server-side photo processing for Scoutslille.be.
 *
 * Flow on each admin photo upload:
 * 1. Validate type/size/pixels (caller + helpers here)
 * 2. Store an untouched original under uploads/originals/ (not web-readable)
 * 3. Build a public JPEG master (oriented, EXIF/GPS stripped, max edge)
 * 4. Write responsive -w{N}.jpg (+ .webp / optional .avif) next to it
 * 5. Only then treat the upload as successful
 *
 * Requires PHP GD (imagecreatefromstring + imagejpeg). WebP/AVIF are optional extras.
 */

function scouts_photo_gd_available(): bool
{
    return function_exists('imagejpeg')
        && function_exists('imagecreatefromstring')
        && function_exists('imagescale');
}

/** Free a GD image; no-op on PHP 8.5+ where imagedestroy is deprecated. */
function scouts_photo_destroy(mixed $image): void
{
    if ($image === null || $image === false) {
        return;
    }
    if (\PHP_VERSION_ID >= 80500) {
        return;
    }
    if (function_exists('imagedestroy')) {
        @imagedestroy($image);
    }
}

function scouts_photo_webp_available(): bool
{
    return function_exists('imagewebp');
}

function scouts_photo_avif_available(): bool
{
    return function_exists('imageavif');
}

function scouts_photo_ensure_dir(string $dir): void
{
    if (is_dir($dir)) {
        return;
    }
    if (!mkdir($dir, 0755, true) && !is_dir($dir)) {
        throw new RuntimeException('Uploadmap kon niet worden aangemaakt.');
    }
}

/** Move/copy $from onto $to (overwriting). Returns false on failure. */
function scouts_photo_replace_file(string $from, string $to): bool
{
    if (!is_file($from)) {
        return false;
    }
    if (is_file($to) && !@unlink($to)) {
        // Fall through to copy-overwrite attempt.
    }
    if (@rename($from, $to)) {
        @chmod($to, 0644);
        return true;
    }
    if (@copy($from, $to)) {
        @unlink($from);
        @chmod($to, 0644);
        return true;
    }
    return false;
}

function scouts_photo_originals_dir(): string
{
    return SCOUTS_PHOTO_ORIGINALS_DIR;
}

/**
 * Reject decompression bombs before decoding pixels into memory.
 */
function scouts_photo_assert_safe_dimensions(int $width, int $height): void
{
    if ($width < 1 || $height < 1) {
        throw new InvalidArgumentException('Ongeldige afbeeldingsafmetingen.');
    }
    if ($width > SCOUTS_PHOTO_MAX_DIMENSION || $height > SCOUTS_PHOTO_MAX_DIMENSION) {
        throw new InvalidArgumentException(
            'De foto is te groot (max. ' . SCOUTS_PHOTO_MAX_DIMENSION . ' px per zijde).'
        );
    }
    $pixels = $width * $height;
    if ($pixels > SCOUTS_PHOTO_MAX_PIXELS) {
        throw new InvalidArgumentException(
            'De foto heeft te veel pixels. Verklein de foto en probeer opnieuw.'
        );
    }
}

function scouts_photo_exif_orientation(string $sourcePath): int
{
    if (!function_exists('exif_read_data')) {
        return 1;
    }

    $exif = @exif_read_data($sourcePath);
    if (!is_array($exif)) {
        return 1;
    }

    $orientation = (int) ($exif['Orientation'] ?? 1);
    return $orientation >= 1 && $orientation <= 8 ? $orientation : 1;
}

/**
 * @param \GdImage|resource $image
 * @return \GdImage|resource
 */
function scouts_photo_apply_orientation($image, int $orientation)
{
    switch ($orientation) {
        case 2:
            if (function_exists('imageflip')) {
                imageflip($image, IMG_FLIP_HORIZONTAL);
            }
            return $image;
        case 3:
            $rotated = imagerotate($image, 180, 0);
            break;
        case 4:
            if (function_exists('imageflip')) {
                imageflip($image, IMG_FLIP_VERTICAL);
            }
            return $image;
        case 5:
            if (function_exists('imageflip')) {
                imageflip($image, IMG_FLIP_VERTICAL);
            }
            $rotated = imagerotate($image, -90, 0);
            break;
        case 6:
            $rotated = imagerotate($image, -90, 0);
            break;
        case 7:
            if (function_exists('imageflip')) {
                imageflip($image, IMG_FLIP_HORIZONTAL);
            }
            $rotated = imagerotate($image, -90, 0);
            break;
        case 8:
            $rotated = imagerotate($image, 90, 0);
            break;
        default:
            return $image;
    }

    if ($rotated === false) {
        return $image;
    }

    scouts_photo_destroy($image);
    return $rotated;
}

/**
 * Flatten onto cream so PNG/WebP alpha never becomes black in JPEG output.
 *
 * @param \GdImage|resource $image
 * @return \GdImage|resource
 */
function scouts_photo_flatten_to_canvas($image)
{
    $width = imagesx($image);
    $height = imagesy($image);
    $canvas = imagecreatetruecolor($width, $height);
    if ($canvas === false) {
        throw new RuntimeException('Afbeelding kon niet worden verwerkt.');
    }
    $background = imagecolorallocate($canvas, 245, 239, 231);
    imagefilledrectangle($canvas, 0, 0, $width, $height, $background);
    imagecopy($canvas, $image, 0, 0, 0, 0, $width, $height);
    scouts_photo_destroy($image);
    return $canvas;
}

/**
 * @param \GdImage|resource $image
 * @return \GdImage|resource
 */
function scouts_photo_scale_to_max_edge($image, int $maxEdge)
{
    $width = imagesx($image);
    $height = imagesy($image);
    $longest = max($width, $height);
    if ($longest <= $maxEdge) {
        return $image;
    }

    $scale = $maxEdge / $longest;
    $targetWidth = max(1, (int) round($width * $scale));
    $targetHeight = max(1, (int) round($height * $scale));
    $mode = defined('IMG_BICUBIC') ? IMG_BICUBIC : IMG_BILINEAR_FIXED;
    $scaled = imagescale($image, $targetWidth, $targetHeight, $mode);
    if ($scaled === false) {
        return $image;
    }
    scouts_photo_destroy($image);
    return $scaled;
}

/**
 * @param \GdImage|resource $image
 */
function scouts_photo_write_jpeg($image, string $path, int $quality): void
{
    if (function_exists('imageinterlace')) {
        imageinterlace($image, true);
    }
    $tmp = $path . '.__tmp';
    if (is_file($tmp)) {
        @unlink($tmp);
    }
    if (!@imagejpeg($image, $tmp, $quality)) {
        @unlink($tmp);
        throw new RuntimeException('JPEG kon niet worden opgeslagen.');
    }
    if (is_file($path) && !@unlink($path)) {
        @unlink($tmp);
        throw new RuntimeException('Bestaande foto kon niet worden vervangen.');
    }
    if (!@rename($tmp, $path)) {
        @unlink($tmp);
        throw new RuntimeException('JPEG kon niet definitief worden opgeslagen.');
    }
    @chmod($path, 0644);
}

/**
 * @param \GdImage|resource $image
 */
function scouts_photo_write_optional_modern($image, string $stemPath): void
{
    if (scouts_photo_webp_available()) {
        $webp = $stemPath . '.webp';
        $tmp = $webp . '.__tmp';
        if (@imagewebp($image, $tmp, SCOUTS_PHOTO_WEBP_QUALITY)) {
            if (is_file($webp)) {
                @unlink($webp);
            }
            if (@rename($tmp, $webp)) {
                @chmod($webp, 0644);
            } else {
                @unlink($tmp);
            }
        } else {
            @unlink($tmp);
        }
    }

    if (scouts_photo_avif_available()) {
        $avif = $stemPath . '.avif';
        $tmp = $avif . '.__tmp';
        // Soft quality ~45–50 is typical for AVIF; keep visual quality high.
        if (@imageavif($image, $tmp, SCOUTS_PHOTO_AVIF_QUALITY)) {
            if (is_file($avif)) {
                @unlink($avif);
            }
            if (@rename($tmp, $avif)) {
                @chmod($avif, 0644);
            } else {
                @unlink($tmp);
            }
        } else {
            @unlink($tmp);
        }
    }
}

/**
 * @param \GdImage|resource $source
 * @return list<int> widths that were written
 */
function scouts_photo_write_width_variants($source, string $dir, string $basename): array
{
    $sourceWidth = imagesx($source);
    $sourceHeight = imagesy($source);
    if ($sourceWidth < 1 || $sourceHeight < 1) {
        throw new RuntimeException('Ongeldige masterafbeelding.');
    }

    $mode = defined('IMG_BICUBIC') ? IMG_BICUBIC : IMG_BILINEAR_FIXED;
    $written = [];
    /** @var array<int, string> pixelWidth => absolute stem of first encode */
    $stemByPixelWidth = [];

    foreach (SCOUTS_PHOTO_VARIANT_WIDTHS as $requestedWidth) {
        $pixelWidth = min($requestedWidth, $sourceWidth);
        $stem = $dir . DIRECTORY_SEPARATOR . $basename . '-w' . $requestedWidth;

        // Avoid re-encoding identical pixels under multiple requested names
        // (e.g. 1080px source still needs -w1200/-w1600 URLs for srcset).
        // Prefer a hard link (same bytes on disk); fall back to copy.
        if (isset($stemByPixelWidth[$pixelWidth])) {
            $sourceStem = $stemByPixelWidth[$pixelWidth];
            foreach (['jpg', 'webp', 'avif'] as $ext) {
                $from = $sourceStem . '.' . $ext;
                $to = $stem . '.' . $ext;
                if (!is_file($from)) {
                    continue;
                }
                if (is_file($to)) {
                    @unlink($to);
                }
                if (!@link($from, $to) && !@copy($from, $to)) {
                    throw new RuntimeException('Variant ' . $requestedWidth . 'w kon niet worden gekoppeld.');
                }
                @chmod($to, 0644);
            }
            $written[] = $requestedWidth;
            continue;
        }

        $pixelHeight = max(1, (int) round($sourceHeight * ($pixelWidth / $sourceWidth)));
        $scaled = $pixelWidth === $sourceWidth
            ? $source
            : imagescale($source, $pixelWidth, $pixelHeight, $mode);
        if ($scaled === false) {
            throw new RuntimeException('Variant ' . $requestedWidth . 'w kon niet worden gemaakt.');
        }

        scouts_photo_write_jpeg($scaled, $stem . '.jpg', SCOUTS_PHOTO_VARIANT_JPEG_QUALITY);
        scouts_photo_write_optional_modern($scaled, $stem);
        $stemByPixelWidth[$pixelWidth] = $stem;
        $written[] = $requestedWidth;

        if ($scaled !== $source) {
            scouts_photo_destroy($scaled);
        }
    }

    return $written;
}

function scouts_photo_extension_for_mime(string $mime): string
{
    return match ($mime) {
        'image/jpeg' => 'jpg',
        'image/png' => 'png',
        'image/webp' => 'webp',
        'image/gif' => 'gif',
        default => 'bin',
    };
}

/**
 * Remove public derivatives for a basename (not the private original).
 */
function scouts_photo_unlink_public_derivatives(string $basename): void
{
    $dir = SCOUTS_UPLOADS_DIR;
    foreach (['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif'] as $ext) {
        foreach ([
            $basename,
            $basename . '-thumb',
            $basename . '-md',
            $basename . '-display',
        ] as $name) {
            $path = $dir . DIRECTORY_SEPARATOR . $name . '.' . $ext;
            if (is_file($path)) {
                @unlink($path);
            }
        }
        foreach (glob($dir . DIRECTORY_SEPARATOR . $basename . '-w*.' . $ext) ?: [] as $variant) {
            @unlink($variant);
        }
    }
}

function scouts_photo_unlink_original(string $basename): void
{
    $dir = scouts_photo_originals_dir();
    if (!is_dir($dir)) {
        return;
    }
    foreach (['jpg', 'jpeg', 'png', 'webp', 'gif', 'bin'] as $ext) {
        $path = $dir . DIRECTORY_SEPARATOR . $basename . '.' . $ext;
        if (is_file($path)) {
            @unlink($path);
        }
    }
}

/**
 * Recursively delete a directory tree (staging cleanup).
 */
function scouts_photo_rrmdir(string $dir): void
{
    if (!is_dir($dir)) {
        return;
    }
    $items = scandir($dir);
    if ($items === false) {
        return;
    }
    foreach ($items as $item) {
        if ($item === '.' || $item === '..') {
            continue;
        }
        $path = $dir . DIRECTORY_SEPARATOR . $item;
        if (is_dir($path)) {
            scouts_photo_rrmdir($path);
        } else {
            @unlink($path);
        }
    }
    @rmdir($dir);
}

/**
 * Store an uploaded photo:
 * - private original (full upload bytes)
 * - public JPEG master (oriented, metadata stripped, max edge)
 * - responsive -w* JPEG (+ WebP/AVIF when available)
 * - legacy -thumb.jpg for older admin/orphan tooling
 *
 * Returns the public path including a cache-buster query.
 */
function scouts_store_uploaded_photo(string $sourcePath, string $basename, string $mime, int $width, int $height): string
{
    if (!scouts_allowed_photo_name($basename)) {
        throw new InvalidArgumentException('Ongeldige bestandsnaam.');
    }
    if (!is_file($sourcePath) || !is_readable($sourcePath)) {
        throw new RuntimeException('Uploadbestand is niet leesbaar.');
    }
    if (!scouts_photo_gd_available()) {
        throw new RuntimeException(
            'Foto verwerken vereist de PHP GD-extensie (JPEG). Neem contact op met de hosting.'
        );
    }

    scouts_photo_assert_safe_dimensions($width, $height);
    scouts_photo_ensure_dir(SCOUTS_UPLOADS_DIR);
    scouts_photo_ensure_dir(scouts_photo_originals_dir());

    $stage = SCOUTS_UPLOADS_DIR . DIRECTORY_SEPARATOR . '.stage-' . bin2hex(random_bytes(8));
    scouts_photo_ensure_dir($stage);

    $originalExt = scouts_photo_extension_for_mime($mime);
    $stagedOriginal = $stage . DIRECTORY_SEPARATOR . 'original.' . $originalExt;
    $stagedMaster = $stage . DIRECTORY_SEPARATOR . $basename . '.jpg';
    $stagedThumb = $stage . DIRECTORY_SEPARATOR . $basename . '-thumb.jpg';

    try {
        if (!@copy($sourcePath, $stagedOriginal)) {
            throw new RuntimeException('Origineel kon niet worden bewaard.');
        }

        $binary = file_get_contents($sourcePath);
        if ($binary === false || $binary === '') {
            throw new RuntimeException('Afbeelding kon niet worden gelezen.');
        }

        $image = @imagecreatefromstring($binary);
        // Free binary ASAP.
        unset($binary);
        if ($image === false) {
            throw new RuntimeException('Afbeelding kon niet worden verwerkt.');
        }

        if (function_exists('imagepalettetotruecolor')) {
            @imagepalettetotruecolor($image);
        }

        $orientation = scouts_photo_exif_orientation($sourcePath);
        if ($orientation !== 1) {
            $image = scouts_photo_apply_orientation($image, $orientation);
        }

        $image = scouts_photo_flatten_to_canvas($image);
        $image = scouts_photo_scale_to_max_edge($image, SCOUTS_PHOTO_MAX_EDGE);

        scouts_photo_write_jpeg($image, $stagedMaster, SCOUTS_PHOTO_JPEG_QUALITY);
        scouts_photo_write_width_variants($image, $stage, $basename);

        // Legacy thumb (max edge 800) for older tooling / orphan marking.
        $thumbSource = @imagecreatefromjpeg($stagedMaster);
        if ($thumbSource === false) {
            scouts_photo_destroy($image);
            throw new RuntimeException('Thumbnail kon niet worden gemaakt.');
        }
        $thumb = scouts_photo_scale_to_max_edge($thumbSource, SCOUTS_PHOTO_THUMB_EDGE);
        scouts_photo_write_jpeg($thumb, $stagedThumb, SCOUTS_PHOTO_THUMB_JPEG_QUALITY);
        scouts_photo_destroy($thumb);

        scouts_photo_destroy($image);

        // Require at least JPEG variants for every configured width (capped naming).
        foreach (SCOUTS_PHOTO_VARIANT_WIDTHS as $w) {
            $jpg = $stage . DIRECTORY_SEPARATOR . $basename . '-w' . $w . '.jpg';
            if (!is_file($jpg) || filesize($jpg) < 32) {
                throw new RuntimeException('Vereiste variant ontbreekt: -w' . $w . '.jpg');
            }
            if (scouts_photo_webp_available()) {
                $webp = $stage . DIRECTORY_SEPARATOR . $basename . '-w' . $w . '.webp';
                if (!is_file($webp) || filesize($webp) < 16) {
                    throw new RuntimeException('Vereiste WebP-variant ontbreekt: -w' . $w . '.webp');
                }
            }
        }
        if (!is_file($stagedMaster) || !is_file($stagedOriginal)) {
            throw new RuntimeException('Upload kon niet volledig worden verwerkt.');
        }

        // Commit: overwrite masters/variants in place so a failure never
        // leaves the site without the previous public files.
        $finalMaster = SCOUTS_UPLOADS_DIR . DIRECTORY_SEPARATOR . $basename . '.jpg';
        $finalThumb = SCOUTS_UPLOADS_DIR . DIRECTORY_SEPARATOR . $basename . '-thumb.jpg';
        if (!scouts_photo_replace_file($stagedMaster, $finalMaster)) {
            throw new RuntimeException('Masterfoto kon niet worden geplaatst.');
        }
        if (is_file($stagedThumb) && !scouts_photo_replace_file($stagedThumb, $finalThumb)) {
            throw new RuntimeException('Thumbnail kon niet worden geplaatst.');
        }

        foreach (SCOUTS_PHOTO_VARIANT_WIDTHS as $w) {
            foreach (['jpg', 'webp', 'avif'] as $ext) {
                $from = $stage . DIRECTORY_SEPARATOR . $basename . '-w' . $w . '.' . $ext;
                if (!is_file($from)) {
                    continue;
                }
                $to = SCOUTS_UPLOADS_DIR . DIRECTORY_SEPARATOR . $basename . '-w' . $w . '.' . $ext;
                if (!scouts_photo_replace_file($from, $to)) {
                    throw new RuntimeException('Variant kon niet worden geplaatst: -w' . $w . '.' . $ext);
                }
            }
        }

        // Drop obsolete legacy names (md/display/png) after new JPG set is live.
        foreach (['png', 'gif', 'jpeg', 'webp'] as $oldExt) {
            $oldMaster = SCOUTS_UPLOADS_DIR . DIRECTORY_SEPARATOR . $basename . '.' . $oldExt;
            if ($oldExt !== 'jpg' && is_file($oldMaster)) {
                @unlink($oldMaster);
            }
        }
        foreach (['md', 'display'] as $legacy) {
            foreach (['jpg', 'jpeg', 'png', 'webp', 'gif'] as $ext) {
                $legacyPath = SCOUTS_UPLOADS_DIR . DIRECTORY_SEPARATOR . $basename . '-' . $legacy . '.' . $ext;
                if (is_file($legacyPath)) {
                    @unlink($legacyPath);
                }
            }
        }

        $finalOriginal = scouts_photo_originals_dir() . DIRECTORY_SEPARATOR . $basename . '.' . $originalExt;
        // Remove other original extensions for this stem, then place the new one.
        foreach (['jpg', 'jpeg', 'png', 'webp', 'gif', 'bin'] as $ext) {
            $path = scouts_photo_originals_dir() . DIRECTORY_SEPARATOR . $basename . '.' . $ext;
            if ($path !== $finalOriginal && is_file($path)) {
                @unlink($path);
            }
        }
        if (!scouts_photo_replace_file($stagedOriginal, $finalOriginal)) {
            throw new RuntimeException('Origineel kon niet in veilige opslag worden geplaatst.');
        }
        @chmod($finalOriginal, 0640);

        $masterWidth = 0;
        $masterInfo = @getimagesize($finalMaster);
        if (is_array($masterInfo) && !empty($masterInfo[0])) {
            $masterWidth = (int) $masterInfo[0];
        }
        $query = 'v=' . time();
        if ($masterWidth > 0) {
            $query .= '&sw=' . $masterWidth;
        }

        return '/uploads/' . $basename . '.jpg?' . $query;
    } catch (Throwable $e) {
        // Do not leave a half-written public replace: staging is discarded;
        // previously committed public files are only removed after staging succeeds.
        throw $e;
    } finally {
        scouts_photo_rrmdir($stage);
    }
}

/**
 * Regenerate public derivatives from an existing public master or private original.
 * Never deletes the private original. Safe for CLI migration.
 *
 * @return array{basename: string, widths: list<int>, master: string}
 */
function scouts_photo_regenerate_variants(string $basename, bool $overwrite = true): array
{
    if (!scouts_allowed_photo_name($basename)) {
        throw new InvalidArgumentException('Ongeldige bestandsnaam: ' . $basename);
    }
    if (!scouts_photo_gd_available()) {
        throw new RuntimeException('PHP GD is vereist.');
    }

    $master = SCOUTS_UPLOADS_DIR . DIRECTORY_SEPARATOR . $basename . '.jpg';
    $source = $master;
    if (!is_file($source)) {
        foreach (['jpg', 'jpeg', 'png', 'webp', 'gif'] as $ext) {
            $candidate = scouts_photo_originals_dir() . DIRECTORY_SEPARATOR . $basename . '.' . $ext;
            if (is_file($candidate)) {
                $source = $candidate;
                break;
            }
        }
    }
    if (!is_file($source)) {
        // Fall back to any public raster with this stem.
        foreach (['jpg', 'jpeg', 'png', 'webp'] as $ext) {
            $candidate = SCOUTS_UPLOADS_DIR . DIRECTORY_SEPARATOR . $basename . '.' . $ext;
            if (is_file($candidate)) {
                $source = $candidate;
                break;
            }
        }
    }
    if (!is_file($source)) {
        throw new RuntimeException('Geen bronfoto gevonden voor ' . $basename);
    }

    if (!$overwrite) {
        $allPresent = true;
        foreach (SCOUTS_PHOTO_VARIANT_WIDTHS as $w) {
            if (!is_file(SCOUTS_UPLOADS_DIR . DIRECTORY_SEPARATOR . $basename . '-w' . $w . '.jpg')) {
                $allPresent = false;
                break;
            }
        }
        if ($allPresent) {
            return ['basename' => $basename, 'widths' => SCOUTS_PHOTO_VARIANT_WIDTHS, 'master' => $master];
        }
    }

    $info = @getimagesize($source);
    if (!is_array($info)) {
        throw new RuntimeException('Bron is geen geldige afbeelding: ' . $basename);
    }
    scouts_photo_assert_safe_dimensions((int) $info[0], (int) $info[1]);

    $binary = file_get_contents($source);
    if ($binary === false) {
        throw new RuntimeException('Kon bron niet lezen: ' . $basename);
    }
    $image = @imagecreatefromstring($binary);
    unset($binary);
    if ($image === false) {
        throw new RuntimeException('Kon bron niet decoderen: ' . $basename);
    }

    if (function_exists('imagepalettetotruecolor')) {
        @imagepalettetotruecolor($image);
    }
    $orientation = scouts_photo_exif_orientation($source);
    if ($orientation !== 1) {
        $image = scouts_photo_apply_orientation($image, $orientation);
    }
    $image = scouts_photo_flatten_to_canvas($image);
    $image = scouts_photo_scale_to_max_edge($image, SCOUTS_PHOTO_MAX_EDGE);

    scouts_photo_ensure_dir(SCOUTS_UPLOADS_DIR);
    scouts_photo_write_jpeg($image, $master, SCOUTS_PHOTO_JPEG_QUALITY);
    $widths = scouts_photo_write_width_variants($image, SCOUTS_UPLOADS_DIR, $basename);

    $thumbPath = SCOUTS_UPLOADS_DIR . DIRECTORY_SEPARATOR . $basename . '-thumb.jpg';
    $thumbSource = @imagecreatefromjpeg($master);
    if ($thumbSource !== false) {
        $thumb = scouts_photo_scale_to_max_edge($thumbSource, SCOUTS_PHOTO_THUMB_EDGE);
        scouts_photo_write_jpeg($thumb, $thumbPath, SCOUTS_PHOTO_THUMB_JPEG_QUALITY);
        scouts_photo_destroy($thumb);
    }

    scouts_photo_destroy($image);

    return ['basename' => $basename, 'widths' => $widths, 'master' => $master];
}

/**
 * Build a srcset list with descriptors equal to real pixel widths.
 * Duplicate pixel widths (from capped small masters) appear only once.
 *
 * @param list<int> $requestedWidths
 * @return array{srcset: string, fallback: string, source_width: int}
 */
function scouts_photo_build_srcset(
    string $filesystemStem,
    string $webStem,
    string $extension,
    array $requestedWidths,
    string $query = ''
): array {
    $query = trim($query);
    if ($query !== '' && !str_starts_with($query, '?')) {
        $query = '?' . $query;
    }

    $sourceWidth = 0;
    $masterJpg = $filesystemStem . '.jpg';
    if (is_file($masterJpg)) {
        $info = @getimagesize($masterJpg);
        if (is_array($info) && !empty($info[0])) {
            $sourceWidth = (int) $info[0];
        }
    }

    $seen = [];
    $parts = [];
    $fallback = '';
    $fallbackWidth = 0;

    foreach ($requestedWidths as $requested) {
        $requested = (int) $requested;
        if ($requested < 1) {
            continue;
        }
        $path = $filesystemStem . '-w' . $requested . '.' . $extension;
        if (!is_file($path)) {
            continue;
        }
        $info = @getimagesize($path);
        $pixelWidth = is_array($info) && !empty($info[0]) ? (int) $info[0] : $requested;
        if ($sourceWidth > 0) {
            $pixelWidth = min($pixelWidth, $sourceWidth);
        }
        if (isset($seen[$pixelWidth])) {
            continue;
        }
        $seen[$pixelWidth] = true;
        $url = $webStem . '-w' . $requested . '.' . $extension . $query;
        $parts[] = $url . ' ' . $pixelWidth . 'w';
        if ($fallback === '' || abs($pixelWidth - 1200) < abs($fallbackWidth - 1200)) {
            $fallback = $url;
            $fallbackWidth = $pixelWidth;
        }
    }

    if ($fallback === '' && is_file($filesystemStem . '.' . $extension)) {
        $fallback = $webStem . '.' . $extension . $query;
    }

    return [
        'srcset' => implode(', ', $parts),
        'fallback' => $fallback,
        'source_width' => $sourceWidth,
    ];
}

/**
 * Resolve a public photo URL (e.g. /uploads/bg-home.jpg?v=…) to stems for srcset.
 *
 * @return array{fs: string, web: string, query: string, basename: string}|null
 */
function scouts_photo_resolve_responsive_stem(string $publicUrl): ?array
{
    $publicUrl = trim(html_entity_decode($publicUrl, ENT_QUOTES | ENT_HTML5, 'UTF-8'));
    if ($publicUrl === '') {
        return null;
    }
    $parts = parse_url($publicUrl);
    if (!is_array($parts) || empty($parts['path'])) {
        return null;
    }
    $path = str_replace('\\', '/', (string) $parts['path']);
    $path = preg_replace('#^/#', '', $path) ?? $path;
    $path = preg_replace('/-(?:thumb|md|display|w\d+)(\.[a-z0-9]+)$/i', '$1', $path) ?? $path;
    if (preg_match('/^(.*)\.(jpe?g|png|webp|gif|avif)$/i', $path, $m) !== 1) {
        return null;
    }
    $stemRel = $m[1];
    $basename = basename($stemRel);
    $fs = SCOUTS_ROOT . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $stemRel);
    $web = '/' . str_replace('\\', '/', $stemRel);
    if (str_starts_with($stemRel, 'assets/')) {
        $web = $stemRel;
    }
    $query = '';
    if (!empty($parts['query'])) {
        $query = '?' . $parts['query'];
    }
    $sw = 0;
    if (is_file($fs . '.jpg')) {
        $info = @getimagesize($fs . '.jpg');
        if (is_array($info) && !empty($info[0])) {
            $sw = (int) $info[0];
        }
    }
    if ($sw > 0 && !preg_match('/(?:^|&)sw=\d+/', (string) ($parts['query'] ?? ''))) {
        $query .= ($query === '' ? '?' : '&') . 'sw=' . $sw;
    }

    return [
        'fs' => $fs,
        'web' => $web,
        'query' => $query,
        'basename' => $basename,
    ];
}

/**
 * Align homepage hero preload + <picture> with photos.pageBackgrounds.home
 * (or keep the static domein defaults when empty).
 */
function scouts_html_apply_home_hero_background(string $html): string
{
    $homeBg = '';
    try {
        $data = scouts_read_site_data();
        $homeBg = trim((string) ($data['photos']['pageBackgrounds']['home'] ?? ''));
    } catch (Throwable) {
        $homeBg = '';
    }

    $heroWidths = [800, 1200, 1600, 2400];
    if ($homeBg === '') {
        $resolved = scouts_photo_resolve_responsive_stem('assets/images/domein.jpg');
    } else {
        $resolved = scouts_photo_resolve_responsive_stem($homeBg);
    }
    if ($resolved === null) {
        return $html;
    }

    $webp = scouts_photo_build_srcset(
        $resolved['fs'],
        $resolved['web'],
        'webp',
        $heroWidths,
        $resolved['query']
    );
    $jpg = scouts_photo_build_srcset(
        $resolved['fs'],
        $resolved['web'],
        'jpg',
        $heroWidths,
        $resolved['query']
    );
    $avif = scouts_photo_build_srcset(
        $resolved['fs'],
        $resolved['web'],
        'avif',
        $heroWidths,
        $resolved['query']
    );
    if ($webp['srcset'] === '' && $jpg['srcset'] === '') {
        return $html;
    }

    // Preload the best widely supported candidate. Never put JPEG URLs in a
    // type="image/webp" source/preload — browsers would fail to decode them.
    $useWebpPreload = $webp['srcset'] !== '' && $webp['fallback'] !== '';
    $preloadHref = $useWebpPreload ? $webp['fallback'] : $jpg['fallback'];
    $preloadSrcset = $useWebpPreload ? $webp['srcset'] : $jpg['srcset'];
    $preloadType = $useWebpPreload ? 'image/webp' : 'image/jpeg';
    $sourceWidth = max($webp['source_width'], $jpg['source_width'], $avif['source_width']);
    $imgSrc = $jpg['fallback'] !== '' ? $jpg['fallback'] : $preloadHref;
    $imgSrcset = $jpg['srcset'] !== '' ? $jpg['srcset'] : $webp['srcset'];
    $fullSrc = $resolved['web'] . '.jpg' . $resolved['query'];
    $dataSw = $sourceWidth > 0 ? ' data-source-width="' . $sourceWidth . '"' : '';

    if ($preloadSrcset !== '' && $preloadHref !== '') {
        $html = preg_replace(
            '#<link\s+rel="preload"\s+as="image"\s+type="image/(?:webp|jpeg)"\s+href="[^"]*"\s+imagesrcset="[^"]*"\s+imagesizes="100vw"\s+fetchpriority="high"\s*/?>#i',
            '<link rel="preload" as="image" type="'
                . $preloadType
                . '" href="'
                . htmlspecialchars($preloadHref, ENT_QUOTES | ENT_HTML5, 'UTF-8')
                . '" imagesrcset="'
                . htmlspecialchars($preloadSrcset, ENT_QUOTES | ENT_HTML5, 'UTF-8')
                . '" imagesizes="100vw" fetchpriority="high">',
            $html,
            1
        ) ?? $html;
    }

    $extraSources = '';
    if ($avif['srcset'] !== '') {
        $extraSources .= '            <source' . "\n"
            . '                type="image/avif"' . "\n"
            . '                srcset="' . htmlspecialchars($avif['srcset'], ENT_QUOTES | ENT_HTML5, 'UTF-8') . '"' . "\n"
            . '                sizes="100vw"' . "\n"
            . '            >' . "\n";
    }
    if ($webp['srcset'] !== '') {
        $extraSources .= '            <source' . "\n"
            . '                type="image/webp"' . "\n"
            . '                srcset="' . htmlspecialchars($webp['srcset'], ENT_QUOTES | ENT_HTML5, 'UTF-8') . '"' . "\n"
            . '                sizes="100vw"' . "\n"
            . '            >' . "\n";
    }

    $picture = '<picture class="hero-media"' . $dataSw . '>' . "\n"
        . $extraSources
        . '            <img' . "\n"
        . '                class="hero-media-img"' . "\n"
        . '                src="' . htmlspecialchars($imgSrc, ENT_QUOTES | ENT_HTML5, 'UTF-8') . '"' . "\n"
        . '                srcset="' . htmlspecialchars($imgSrcset, ENT_QUOTES | ENT_HTML5, 'UTF-8') . '"' . "\n"
        . '                sizes="100vw"' . "\n"
        . '                width="' . ($sourceWidth > 0 ? min(1600, $sourceWidth) : 1600) . '"' . "\n"
        . '                height="' . ($sourceWidth > 0 ? (int) round(min(1600, $sourceWidth) * 2 / 3) : 1067) . '"' . "\n"
        . '                alt=""' . "\n"
        . '                decoding="async"' . "\n"
        . '                fetchpriority="high"' . "\n"
        . '                data-full-src="' . htmlspecialchars($fullSrc, ENT_QUOTES | ENT_HTML5, 'UTF-8') . '"' . "\n"
        . '            >' . "\n"
        . '        </picture>';

    $html = preg_replace(
        '#<picture class="hero-media">.*?</picture>#s',
        $picture,
        $html,
        1
    ) ?? $html;

    return $html;
}

