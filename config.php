<?php
declare(strict_types=1);

const SCOUTS_ROOT = __DIR__;
const SCOUTS_DATA_FILE = SCOUTS_ROOT . DIRECTORY_SEPARATOR . 'data' . DIRECTORY_SEPARATOR . 'site-data.json';
const SCOUTS_DEFAULT_DATA_FILE = SCOUTS_ROOT . DIRECTORY_SEPARATOR . 'data' . DIRECTORY_SEPARATOR . 'site-data.default.json';
const SCOUTS_GOOGLE_DRIVE_SETTINGS_FILE = SCOUTS_ROOT . DIRECTORY_SEPARATOR . 'data' . DIRECTORY_SEPARATOR . 'google-drive.json';
const SCOUTS_GOOGLE_SERVICE_ACCOUNT_FILE = SCOUTS_ROOT . DIRECTORY_SEPARATOR . 'data' . DIRECTORY_SEPARATOR . '.google-service-account.json';
const SCOUTS_GOOGLE_OAUTH_FILE = SCOUTS_ROOT . DIRECTORY_SEPARATOR . 'data' . DIRECTORY_SEPARATOR . '.google-oauth.json';
const SCOUTS_UPLOADS_DIR = SCOUTS_ROOT . DIRECTORY_SEPARATOR . 'uploads';
const SCOUTS_MAX_UPLOAD_BYTES = 20971520;
/** Match manually optimized heroes: sharp on retina, light to download. */
const SCOUTS_PHOTO_MAX_EDGE = 2400;
const SCOUTS_PHOTO_JPEG_QUALITY = 90;
const SCOUTS_MAX_PDF_UPLOAD_BYTES = 20971520;

/**
 * Bump this on every deploy so HTML/CSS/JS URLs change and old caches are skipped.
 * Format: YYYYMMDD-N
 */
const SCOUTS_ASSET_VERSION = '20261020-21';
const SCOUTS_LOGIN_ATTEMPTS_FILE = SCOUTS_ROOT . DIRECTORY_SEPARATOR . 'data' . DIRECTORY_SEPARATOR . '.login-attempts.json';
const SCOUTS_LOGIN_MAX_ATTEMPTS = 5;
const SCOUTS_LOGIN_LOCKOUT_SECONDS = 900;

// Best-effort: some hosts allow raising these at runtime.
@ini_set('upload_max_filesize', '20M');
@ini_set('post_max_size', '25M');
@ini_set('memory_limit', '256M');

function scouts_ini_bytes(string $value): int
{
    $value = trim($value);
    if ($value === '') {
        return 0;
    }

    if (is_numeric($value)) {
        return max(0, (int) $value);
    }

    $unit = strtolower(substr($value, -1));
    $number = (float) $value;
    return match ($unit) {
        'g' => (int) round($number * 1024 * 1024 * 1024),
        'm' => (int) round($number * 1024 * 1024),
        'k' => (int) round($number * 1024),
        default => max(0, (int) $number),
    };
}

function scouts_format_mb(int $bytes): string
{
    $mb = $bytes / (1024 * 1024);
    $formatted = number_format($mb, $mb >= 10 ? 0 : 1, ',', '');
    return $formatted . ' MB';
}

/** Smallest of app limit, upload_max_filesize and post_max_size. */
function scouts_effective_upload_max_bytes(int $appLimit = SCOUTS_MAX_UPLOAD_BYTES): int
{
    $limits = [$appLimit];
    $upload = scouts_ini_bytes((string) ini_get('upload_max_filesize'));
    $post = scouts_ini_bytes((string) ini_get('post_max_size'));
    if ($upload > 0) {
        $limits[] = $upload;
    }
    if ($post > 0) {
        $limits[] = $post;
    }
    return max(1, min($limits));
}

function scouts_upload_too_large_message(string $kind = 'bestand'): string
{
    $appLimit = $kind === 'foto' ? SCOUTS_MAX_UPLOAD_BYTES : SCOUTS_MAX_PDF_UPLOAD_BYTES;
    $limit = scouts_effective_upload_max_bytes($appLimit);
    $label = match (strtolower($kind)) {
        'foto' => 'De foto',
        'pdf' => 'De PDF',
        'brief' => 'De brief',
        default => 'Het bestand',
    };
    return $label . ' is te groot. Maximum is ' . scouts_format_mb($limit) . '.';
}

$scoutsAuthConfig = dirname(SCOUTS_ROOT) . DIRECTORY_SEPARATOR . 'auth-config.php';
if (!is_file($scoutsAuthConfig)) {
    $scoutsAuthConfig = SCOUTS_ROOT . DIRECTORY_SEPARATOR . 'auth-config.php';
}
if (is_readable($scoutsAuthConfig)) {
    require_once $scoutsAuthConfig;
}

function scouts_env(string $name, ?string $default = null): ?string
{
    $value = getenv($name);
    if ($value !== false && $value !== '') {
        return $value;
    }

    static $localEnv;
    if ($localEnv === null) {
        $localEnv = [];
        $envFile = SCOUTS_ROOT . DIRECTORY_SEPARATOR . '.env';
        if (is_readable($envFile)) {
            foreach (file($envFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) ?: [] as $line) {
                $line = trim($line);
                if ($line === '' || str_starts_with($line, '#') || !str_contains($line, '=')) {
                    continue;
                }
                [$key, $envValue] = explode('=', $line, 2);
                $key = trim($key);
                if (!str_starts_with($key, 'SCOUTS_')) {
                    continue;
                }
                $envValue = trim($envValue);
                if (strlen($envValue) >= 2 && $envValue[0] === '"' && substr($envValue, -1) === '"') {
                    $envValue = substr($envValue, 1, -1);
                }
                $localEnv[$key] = $envValue;
            }
        }
    }

    return $localEnv[$name] ?? $default;
}

function scouts_start_session(): void
{
    if (session_status() === PHP_SESSION_ACTIVE) {
        return;
    }

    $isHttps = (!empty($_SERVER['HTTPS']) && strtolower((string) $_SERVER['HTTPS']) !== 'off')
        || strtolower((string) ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '')) === 'https';

    session_name('scouts_session');
    session_set_cookie_params([
        'lifetime' => 86400,
        'path' => '/',
        'secure' => $isHttps,
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
    session_start();
}

function scouts_json_response(array $payload, int $status = 200): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function scouts_client_ip(): string
{
    $candidates = [
        (string) ($_SERVER['HTTP_CF_CONNECTING_IP'] ?? ''),
        (string) ($_SERVER['HTTP_X_FORWARDED_FOR'] ?? ''),
        (string) ($_SERVER['REMOTE_ADDR'] ?? ''),
    ];

    foreach ($candidates as $candidate) {
        $ip = trim(explode(',', $candidate)[0]);
        if ($ip !== '' && filter_var($ip, FILTER_VALIDATE_IP)) {
            return $ip;
        }
    }

    return 'unknown';
}

/**
 * @return array{attempts: int, first_at: int, locked_until: int}
 */
function scouts_login_attempts_for_ip(string $ip): array
{
    $defaults = ['attempts' => 0, 'first_at' => 0, 'locked_until' => 0];
    if (!is_file(SCOUTS_LOGIN_ATTEMPTS_FILE)) {
        return $defaults;
    }

    $raw = file_get_contents(SCOUTS_LOGIN_ATTEMPTS_FILE);
    if ($raw === false || trim($raw) === '') {
        return $defaults;
    }

    try {
        $all = json_decode($raw, true, 512, JSON_THROW_ON_ERROR);
    } catch (Throwable) {
        return $defaults;
    }

    if (!is_array($all) || !is_array($all[$ip] ?? null)) {
        return $defaults;
    }

    $entry = $all[$ip];
    return [
        'attempts' => max(0, (int) ($entry['attempts'] ?? 0)),
        'first_at' => max(0, (int) ($entry['first_at'] ?? 0)),
        'locked_until' => max(0, (int) ($entry['locked_until'] ?? 0)),
    ];
}

/**
 * @param array{attempts: int, first_at: int, locked_until: int}|null $entry
 */
function scouts_login_attempts_write(string $ip, ?array $entry): void
{
    $dir = dirname(SCOUTS_LOGIN_ATTEMPTS_FILE);
    if (!is_dir($dir) && !mkdir($dir, 0755, true) && !is_dir($dir)) {
        return;
    }

    $handle = fopen(SCOUTS_LOGIN_ATTEMPTS_FILE, 'c+');
    if ($handle === false) {
        return;
    }

    try {
        if (!flock($handle, LOCK_EX)) {
            return;
        }

        rewind($handle);
        $raw = stream_get_contents($handle);
        $all = [];
        if (is_string($raw) && trim($raw) !== '') {
            try {
                $decoded = json_decode($raw, true, 512, JSON_THROW_ON_ERROR);
                if (is_array($decoded)) {
                    $all = $decoded;
                }
            } catch (Throwable) {
                $all = [];
            }
        }

        $now = time();
        foreach ($all as $key => $value) {
            if (!is_array($value)) {
                unset($all[$key]);
                continue;
            }
            $lockedUntil = (int) ($value['locked_until'] ?? 0);
            $firstAt = (int) ($value['first_at'] ?? 0);
            if ($lockedUntil > 0 && $lockedUntil < $now - 3600) {
                unset($all[$key]);
            } elseif ($lockedUntil <= 0 && $firstAt > 0 && $firstAt < $now - 3600) {
                unset($all[$key]);
            }
        }

        if ($entry === null) {
            unset($all[$ip]);
        } else {
            $all[$ip] = [
                'attempts' => max(0, (int) ($entry['attempts'] ?? 0)),
                'first_at' => max(0, (int) ($entry['first_at'] ?? 0)),
                'locked_until' => max(0, (int) ($entry['locked_until'] ?? 0)),
            ];
        }

        $json = json_encode($all, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        if ($json === false) {
            return;
        }

        ftruncate($handle, 0);
        rewind($handle);
        fwrite($handle, $json);
        fflush($handle);
    } finally {
        flock($handle, LOCK_UN);
        fclose($handle);
    }
}

function scouts_login_lock_remaining_seconds(string $ip = ''): int
{
    $ip = $ip !== '' ? $ip : scouts_client_ip();
    $entry = scouts_login_attempts_for_ip($ip);
    $remaining = $entry['locked_until'] - time();
    return $remaining > 0 ? $remaining : 0;
}

function scouts_login_record_failure(string $ip = ''): int
{
    $ip = $ip !== '' ? $ip : scouts_client_ip();
    $now = time();
    $entry = scouts_login_attempts_for_ip($ip);

    if ($entry['locked_until'] > $now) {
        return $entry['locked_until'] - $now;
    }

    if ($entry['first_at'] <= 0 || $now - $entry['first_at'] > SCOUTS_LOGIN_LOCKOUT_SECONDS) {
        $entry = ['attempts' => 0, 'first_at' => $now, 'locked_until' => 0];
    }

    $entry['attempts']++;
    if ($entry['attempts'] >= SCOUTS_LOGIN_MAX_ATTEMPTS) {
        $entry['locked_until'] = $now + SCOUTS_LOGIN_LOCKOUT_SECONDS;
        $entry['attempts'] = 0;
        $entry['first_at'] = $now;
    }

    scouts_login_attempts_write($ip, $entry);
    return max(0, $entry['locked_until'] - $now);
}

function scouts_login_clear_failures(string $ip = ''): void
{
    $ip = $ip !== '' ? $ip : scouts_client_ip();
    scouts_login_attempts_write($ip, null);
}

function scouts_asset_version(): string
{
    return SCOUTS_ASSET_VERSION;
}

/** HTML documents: never keep a stale shell that points at old CSS/JS. */
function scouts_send_html_cache_headers(): void
{
    header('Cache-Control: no-cache, no-store, must-revalidate');
    header('Pragma: no-cache');
    header('Expires: 0');
}

/**
 * CSS/JS: long-cache when versioned via ?v= (HTML always bumps that query).
 * Callers that stream dynamic CSS/JS without a stable version should override.
 */
function scouts_send_asset_revalidate_headers(): void
{
    header('Cache-Control: public, max-age=31536000, immutable');
}

/** Serve the styled 404 page (always with HTTP 404). */
function scouts_send_not_found(): never
{
    http_response_code(404);
    scouts_send_html_file(
        SCOUTS_ROOT . DIRECTORY_SEPARATOR . 'pages' . DIRECTORY_SEPARATOR . '404.html',
        '404'
    );
}

/**
 * Serve an HTML file with no-store headers and the current asset version
 * injected into stylesheet/script/image query strings.
 */
function scouts_send_html_file(string $absolutePath, ?string $pageId = null): never
{
    if (!is_file($absolutePath)) {
        http_response_code(404);
        header('Content-Type: text/plain; charset=utf-8');
        echo 'Pagina niet gevonden.';
        exit;
    }

    $html = file_get_contents($absolutePath);
    if ($html === false) {
        http_response_code(500);
        header('Content-Type: text/plain; charset=utf-8');
        echo 'Pagina kon niet worden geladen.';
        exit;
    }

    $resolvedPage = $pageId;
    if ($resolvedPage === null) {
        $base = strtolower(basename($absolutePath));
        $resolvedPage = match ($base) {
            'index.html' => 'index',
            'admin.html' => 'admin',
            'login.html' => 'login',
            'privacyverklaring.html' => 'privacybeleid',
            default => preg_replace('/\.html$/', '', $base) ?: 'index',
        };
    }

    $isPublicChrome = !in_array($resolvedPage, ['admin', 'login'], true);
    if ($isPublicChrome) {
        require_once SCOUTS_ROOT . DIRECTORY_SEPARATOR . 'includes' . DIRECTORY_SEPARATOR . 'site-chrome.php';

        $assetPrefix = str_contains(str_replace('\\', '/', $absolutePath), '/pages/')
            ? '../assets/'
            : 'assets/';
        $chromeOptions = [
            'page' => $resolvedPage,
            'asset_prefix' => $assetPrefix,
            'home_hash_prefix' => '/#',
        ];

        if (str_contains($html, '<!--SITE_HEADER-->')) {
            $html = str_replace('<!--SITE_HEADER-->', scouts_render_site_header($chromeOptions), $html);
        }
        if (str_contains($html, '<!--SITE_FOOTER-->')) {
            $html = str_replace('<!--SITE_FOOTER-->', scouts_render_site_footer($chromeOptions), $html);
        }

        if (!str_contains($html, 'property="og:title"')) {
            $shareTags = scouts_render_share_meta_tags($resolvedPage);
            $html = preg_replace('/<\/head>/i', $shareTags . "\n</head>", $html, 1) ?? $html;
        }
        if (!str_contains($html, 'application/ld+json')) {
            $jsonLd = scouts_render_json_ld();
            if ($jsonLd !== '') {
                $html = preg_replace('/<\/head>/i', $jsonLd . "\n</head>", $html, 1) ?? $html;
            }
        }
    }

    $version = scouts_asset_version();
    $html = preg_replace_callback(
        '/\b(href|src)=(["\'])([^"\'?]+\.(?:css|js|png|jpe?g|webp|gif|svg|ico))(?:\?([^"\']*))?\2/i',
        static function (array $matches) use ($version): string {
            $path = $matches[3];
            // Only version local site assets (not CDNs / external URLs).
            if (preg_match('#^(https?:)?//#i', $path) === 1) {
                return $matches[0];
            }
            $query = [];
            if (!empty($matches[4])) {
                parse_str(str_replace('&amp;', '&', $matches[4]), $query);
            }
            // Keep params like bundle=admin; always refresh cache buster.
            $query['v'] = $version;
            return $matches[1] . '=' . $matches[2] . $path . '?' . http_build_query($query) . $matches[2];
        },
        $html
    ) ?? $html;

    header('Content-Type: text/html; charset=utf-8');
    scouts_send_html_cache_headers();
    header('X-Asset-Version: ' . $version);
    echo $html;
    exit;
}

function scouts_admin_username(): string
{
    if (defined('SCOUTS_AUTH_USERNAME')) {
        return (string) SCOUTS_AUTH_USERNAME;
    }

    return (string) scouts_env('SCOUTS_ADMIN_USERNAME', '');
}

function scouts_admin_password_hash(): string
{
    if (defined('SCOUTS_AUTH_PASSWORD_HASH')) {
        return (string) SCOUTS_AUTH_PASSWORD_HASH;
    }

    return (string) scouts_env('SCOUTS_ADMIN_PASSWORD_HASH', '');
}

function scouts_session_is_admin(): bool
{
    return isset($_SESSION['user']['username'])
        && hash_equals(scouts_admin_username(), (string) $_SESSION['user']['username']);
}

function scouts_require_admin(): void
{
    if (!scouts_session_is_admin()) {
        scouts_json_response(['message' => 'Niet ingelogd'], 401);
    }
}

function scouts_require_same_origin(): void
{
    $origin = (string) ($_SERVER['HTTP_ORIGIN'] ?? '');
    $referer = (string) ($_SERVER['HTTP_REFERER'] ?? '');
    $host = (string) ($_SERVER['HTTP_HOST'] ?? '');

    $requestHost = parse_url('//' . $host);
    $requestHostName = strtolower((string) ($requestHost['host'] ?? ''));
    $requestPort = (int) ($requestHost['port'] ?? 0);

    $matchesRequestHost = static function (string $url) use ($requestHostName, $requestPort): bool {
        $parsed = parse_url($url);
        if (!is_array($parsed) || !isset($parsed['host'])) {
            return false;
        }

        $port = (int) ($parsed['port'] ?? 0);
        return hash_equals($requestHostName, strtolower((string) $parsed['host']))
            && ($port === 0 || $requestPort === 0 || $port === $requestPort);
    };

    if ($origin !== '') {
        if (!$matchesRequestHost($origin)) {
            scouts_json_response(['message' => 'Ongeldige aanvraag'], 403);
        }
        return;
    }

    if ($referer !== '') {
        if (!$matchesRequestHost($referer)) {
            scouts_json_response(['message' => 'Ongeldige aanvraag'], 403);
        }
        return;
    }

    scouts_json_response(['message' => 'Ongeldige aanvraag'], 403);
}

function scouts_decode_json_file(string $file): array
{
    if (!is_file($file)) {
        throw new RuntimeException('Datastorebestand ontbreekt.');
    }

    $raw = file_get_contents($file);
    if ($raw === false || trim($raw) === '') {
        throw new RuntimeException('Datastorebestand is leeg.');
    }

    $data = json_decode($raw, true, 512, JSON_THROW_ON_ERROR);
    if (!is_array($data) || $data === []) {
        throw new RuntimeException('Datastore bevat geen geldige gegevens.');
    }

    return $data;
}

function scouts_read_site_data(): array
{
    return scouts_decode_json_file(SCOUTS_DATA_FILE);
}

function scouts_write_site_data(array $data): void
{
    if ($data === []) {
        throw new InvalidArgumentException('Lege sitegegevens zijn niet toegestaan.');
    }

    json_encode($data, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
    if (!is_dir(dirname(SCOUTS_DATA_FILE)) && !mkdir(dirname(SCOUTS_DATA_FILE), 0755, true)) {
        throw new RuntimeException('Datamap kon niet worden aangemaakt.');
    }

    $tempFile = tempnam(dirname(SCOUTS_DATA_FILE), 'site-data-');
    if ($tempFile === false) {
        throw new RuntimeException('Tijdelijk datastorebestand kon niet worden aangemaakt.');
    }

    try {
        $json = json_encode($data, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT) . PHP_EOL;
        if (file_put_contents($tempFile, $json, LOCK_EX) === false) {
            throw new RuntimeException('Sitegegevens konden niet worden geschreven.');
        }
        scouts_decode_json_file($tempFile);

        if (!rename($tempFile, SCOUTS_DATA_FILE)) {
            throw new RuntimeException('Sitegegevens konden niet atomair worden vervangen.');
        }
    } finally {
        if (is_file($tempFile)) {
            @unlink($tempFile);
        }
    }
}

function scouts_request_json(): array
{
    $raw = file_get_contents('php://input');
    if ($raw === false || trim($raw) === '') {
        return [];
    }
    $data = json_decode($raw, true);
    return is_array($data) ? $data : [];
}

function scouts_allowed_photo_name(string $filename): bool
{
    return in_array($filename, [
        'over-ons', 'kapoenenleiding', 'welpenleiding',
        'jongverkennersleiding', 'verkennersleiding', 'jinsleiding',
    ], true)
        || (bool) preg_match('/^(?:tweedehands|agenda|news)-[0-9]+-[a-z0-9]+$/', $filename);
}

function scouts_delete_photo_versions(string $filename): void
{
    if (!scouts_allowed_photo_name($filename)) {
        throw new InvalidArgumentException('Ongeldige bestandsnaam.');
    }
    foreach (['jpg', 'jpeg', 'png', 'webp', 'gif'] as $extension) {
        $path = SCOUTS_UPLOADS_DIR . DIRECTORY_SEPARATOR . $filename . '.' . $extension;
        if (is_file($path) && !unlink($path)) {
            throw new RuntimeException('Foto kon niet worden verwijderd.');
        }
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

    imagedestroy($image);
    return $rotated;
}

/**
 * Store an uploaded photo (max edge 2400px, JPEG quality 90, progressive).
 * Always re-encodes when GD is available. $width/$height come from the caller
 * after getimagesize validation; GD reads final dimensions from the image.
 * Returns the public path including a cache-buster query.
 */
function scouts_store_uploaded_photo(string $sourcePath, string $basename, string $mime, int $width, int $height): string
{
    if (!is_dir(SCOUTS_UPLOADS_DIR) && !mkdir(SCOUTS_UPLOADS_DIR, 0755, true) && !is_dir(SCOUTS_UPLOADS_DIR)) {
        throw new RuntimeException('Uploadmap kon niet worden aangemaakt.');
    }

    $gdAvailable = function_exists('imagejpeg') && function_exists('imagecreatefromstring');
    $orientation = scouts_photo_exif_orientation($sourcePath);
    $needsOrient = $orientation !== 1;

    $tempFile = tempnam(SCOUTS_UPLOADS_DIR, $basename . '-');
    if ($tempFile === false) {
        throw new RuntimeException('Tijdelijk uploadbestand kon niet worden aangemaakt.');
    }

    $extension = 'jpg';
    $finalPath = SCOUTS_UPLOADS_DIR . DIRECTORY_SEPARATOR . $basename . '.' . $extension;

    try {
        if ($gdAvailable) {
            $binary = file_get_contents($sourcePath);
            if ($binary === false) {
                throw new RuntimeException('Afbeelding kon niet worden gelezen.');
            }

            $image = @imagecreatefromstring($binary);
            if ($image === false) {
                throw new RuntimeException('Afbeelding kon niet worden verwerkt.');
            }

            if (function_exists('imagepalettetotruecolor')) {
                @imagepalettetotruecolor($image);
            }

            if ($needsOrient) {
                $image = scouts_photo_apply_orientation($image, $orientation);
            }

            $currentWidth = imagesx($image);
            $currentHeight = imagesy($image);
            $longest = max($currentWidth, $currentHeight);
            if ($longest > SCOUTS_PHOTO_MAX_EDGE && function_exists('imagescale')) {
                $scale = SCOUTS_PHOTO_MAX_EDGE / $longest;
                $targetWidth = max(1, (int) round($currentWidth * $scale));
                $targetHeight = max(1, (int) round($currentHeight * $scale));
                $mode = defined('IMG_BICUBIC') ? IMG_BICUBIC : IMG_BILINEAR_FIXED;
                $scaled = imagescale($image, $targetWidth, $targetHeight, $mode);
                if ($scaled !== false) {
                    imagedestroy($image);
                    $image = $scaled;
                    $currentWidth = $targetWidth;
                    $currentHeight = $targetHeight;
                }
            }

            // Flatten onto cream so PNG/WebP transparency never becomes black.
            $canvas = imagecreatetruecolor($currentWidth, $currentHeight);
            if ($canvas === false) {
                imagedestroy($image);
                throw new RuntimeException('Afbeelding kon niet worden verwerkt.');
            }
            $background = imagecolorallocate($canvas, 245, 239, 231);
            imagefilledrectangle($canvas, 0, 0, $currentWidth, $currentHeight, $background);
            imagecopy($canvas, $image, 0, 0, 0, 0, $currentWidth, $currentHeight);
            imagedestroy($image);

            if (function_exists('imageinterlace')) {
                imageinterlace($canvas, true);
            }

            if (!imagejpeg($canvas, $tempFile, SCOUTS_PHOTO_JPEG_QUALITY)) {
                imagedestroy($canvas);
                throw new RuntimeException('Afbeelding kon niet worden opgeslagen.');
            }
            imagedestroy($canvas);
        } else {
            $allowed = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp', 'image/gif' => 'gif'];
            $extension = $allowed[$mime] ?? 'jpg';
            $finalPath = SCOUTS_UPLOADS_DIR . DIRECTORY_SEPARATOR . $basename . '.' . $extension;
            if (!copy($sourcePath, $tempFile)) {
                throw new RuntimeException('Afbeelding kon niet worden opgeslagen.');
            }
        }

        if (is_file($finalPath) && !unlink($finalPath)) {
            throw new RuntimeException('Bestaande foto kon niet worden vervangen.');
        }
        if (!rename($tempFile, $finalPath)) {
            throw new RuntimeException('Afbeelding kon niet definitief worden opgeslagen.');
        }
        if (!chmod($finalPath, 0644)) {
            throw new RuntimeException('Afbeelding kon niet leesbaar worden gemaakt.');
        }

        foreach (['jpg', 'jpeg', 'png', 'webp', 'gif'] as $oldExtension) {
            $oldPath = SCOUTS_UPLOADS_DIR . DIRECTORY_SEPARATOR . $basename . '.' . $oldExtension;
            if ($oldPath !== $finalPath && is_file($oldPath)) {
                @unlink($oldPath);
            }
        }
    } finally {
        if (is_file($tempFile)) {
            @unlink($tempFile);
        }
    }

    return '/uploads/' . basename($finalPath) . '?v=' . time();
}

function scouts_read_google_drive_settings(): array
{
    if (!is_file(SCOUTS_GOOGLE_DRIVE_SETTINGS_FILE)) {
        return [];
    }

    return scouts_decode_json_file(SCOUTS_GOOGLE_DRIVE_SETTINGS_FILE);
}

function scouts_write_google_drive_settings(array $settings): void
{
    $json = json_encode($settings, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT) . PHP_EOL;
    if (!is_dir(dirname(SCOUTS_GOOGLE_DRIVE_SETTINGS_FILE)) && !mkdir(dirname(SCOUTS_GOOGLE_DRIVE_SETTINGS_FILE), 0755, true)) {
        throw new RuntimeException('Datamap kon niet worden aangemaakt.');
    }

    $tempFile = tempnam(dirname(SCOUTS_GOOGLE_DRIVE_SETTINGS_FILE), 'google-drive-');
    if ($tempFile === false || file_put_contents($tempFile, $json, LOCK_EX) === false) {
        @unlink($tempFile);
        throw new RuntimeException('Google Drive-instellingen konden niet worden opgeslagen.');
    }

    try {
        if (!rename($tempFile, SCOUTS_GOOGLE_DRIVE_SETTINGS_FILE)) {
            throw new RuntimeException('Google Drive-instellingen konden niet worden vervangen.');
        }
    } finally {
        if (is_file($tempFile)) {
            @unlink($tempFile);
        }
    }
}

function scouts_write_google_drive_credentials(array $credentials): void
{
    $json = json_encode($credentials, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT) . PHP_EOL;
    if (!is_dir(dirname(SCOUTS_GOOGLE_SERVICE_ACCOUNT_FILE)) && !mkdir(dirname(SCOUTS_GOOGLE_SERVICE_ACCOUNT_FILE), 0755, true)) {
        throw new RuntimeException('Datamap kon niet worden aangemaakt.');
    }
    $tempFile = tempnam(dirname(SCOUTS_GOOGLE_SERVICE_ACCOUNT_FILE), 'google-key-');
    if ($tempFile === false || file_put_contents($tempFile, $json, LOCK_EX) === false) {
        @unlink($tempFile);
        throw new RuntimeException('Google-sleutel kon niet worden opgeslagen.');
    }

    try {
        if (!rename($tempFile, SCOUTS_GOOGLE_SERVICE_ACCOUNT_FILE)) {
            throw new RuntimeException('Google-sleutel kon niet worden vervangen.');
        }
        @chmod(SCOUTS_GOOGLE_SERVICE_ACCOUNT_FILE, 0600);
    } finally {
        if (is_file($tempFile)) {
            @unlink($tempFile);
        }
    }
}

function scouts_write_google_oauth(array $oauth): void
{
    $json = json_encode($oauth, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT) . PHP_EOL;
    if (!is_dir(dirname(SCOUTS_GOOGLE_OAUTH_FILE)) && !mkdir(dirname(SCOUTS_GOOGLE_OAUTH_FILE), 0755, true)) {
        throw new RuntimeException('Datamap kon niet worden aangemaakt.');
    }

    $tempFile = tempnam(dirname(SCOUTS_GOOGLE_OAUTH_FILE), 'google-oauth-');
    if ($tempFile === false || file_put_contents($tempFile, $json, LOCK_EX) === false) {
        @unlink($tempFile);
        throw new RuntimeException('Google OAuth-configuratie kon niet worden opgeslagen.');
    }

    try {
        if (!rename($tempFile, SCOUTS_GOOGLE_OAUTH_FILE)) {
            throw new RuntimeException('Google OAuth-configuratie kon niet worden vervangen.');
        }
        @chmod(SCOUTS_GOOGLE_OAUTH_FILE, 0600);
    } finally {
        if (is_file($tempFile)) {
            @unlink($tempFile);
        }
    }
}

function scouts_google_settings_password_hash(): string
{
    if (defined('SCOUTS_GOOGLE_SETTINGS_PASSWORD_HASH')) {
        return (string) SCOUTS_GOOGLE_SETTINGS_PASSWORD_HASH;
    }

    return (string) scouts_env('SCOUTS_GOOGLE_SETTINGS_PASSWORD_HASH', '');
}

function scouts_require_google_settings_access(): void
{
    scouts_require_admin();
    if (!isset($_SESSION['google_settings_unlocked_until'])
        || (int) $_SESSION['google_settings_unlocked_until'] < time()) {
        scouts_json_response(['message' => 'Google Drive-instellingen zijn vergrendeld.'], 403);
    }
}