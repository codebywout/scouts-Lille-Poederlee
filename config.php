<?php
declare(strict_types=1);

const SCOUTS_ROOT = __DIR__;
const SCOUTS_DATA_FILE = SCOUTS_ROOT . DIRECTORY_SEPARATOR . 'data' . DIRECTORY_SEPARATOR . 'site-data.json';
const SCOUTS_DEFAULT_DATA_FILE = SCOUTS_ROOT . DIRECTORY_SEPARATOR . 'data' . DIRECTORY_SEPARATOR . 'site-data.default.json';
/** Precomputed public JSON for fast HTML inline + API responses. */
const SCOUTS_PUBLIC_DATA_CACHE = SCOUTS_ROOT . DIRECTORY_SEPARATOR . 'data' . DIRECTORY_SEPARATOR . '.site-data.public.json';
const SCOUTS_GOOGLE_DRIVE_SETTINGS_FILE = SCOUTS_ROOT . DIRECTORY_SEPARATOR . 'data' . DIRECTORY_SEPARATOR . 'google-drive.json';
const SCOUTS_GOOGLE_SERVICE_ACCOUNT_FILE = SCOUTS_ROOT . DIRECTORY_SEPARATOR . 'data' . DIRECTORY_SEPARATOR . '.google-service-account.json';
const SCOUTS_GOOGLE_OAUTH_FILE = SCOUTS_ROOT . DIRECTORY_SEPARATOR . 'data' . DIRECTORY_SEPARATOR . '.google-oauth.json';
const SCOUTS_UPLOADS_DIR = SCOUTS_ROOT . DIRECTORY_SEPARATOR . 'uploads';
/** Private originals — not web-readable (see uploads/originals/.htaccess). */
const SCOUTS_PHOTO_ORIGINALS_DIR = SCOUTS_UPLOADS_DIR . DIRECTORY_SEPARATOR . 'originals';
const SCOUTS_MAX_UPLOAD_BYTES = 20971520;
/** Public master max edge; full-res bytes live in originals/. */
const SCOUTS_PHOTO_MAX_EDGE = 4000;
const SCOUTS_PHOTO_THUMB_EDGE = 800;
const SCOUTS_PHOTO_JPEG_QUALITY = 90;
const SCOUTS_PHOTO_THUMB_JPEG_QUALITY = 82;
/**
 * Responsive widths used by the public site (srcset). Named by request width;
 * pixel width is min(requested, master width) — never upscaled.
 */
const SCOUTS_PHOTO_VARIANT_WIDTHS = [480, 800, 1200, 1600, 2400];
const SCOUTS_PHOTO_VARIANT_JPEG_QUALITY = 88;
const SCOUTS_PHOTO_WEBP_QUALITY = 85;
const SCOUTS_PHOTO_AVIF_QUALITY = 50;
/** Decompression-bomb guards (pre-decode). */
const SCOUTS_PHOTO_MAX_DIMENSION = 10000;
const SCOUTS_PHOTO_MAX_PIXELS = 40000000; // 40 MP
const SCOUTS_MAX_PDF_UPLOAD_BYTES = 20971520;

/**
 * Bump this on every deploy so HTML/CSS/JS URLs change and old caches are skipped.
 * Format: YYYYMMDD-N
 */
const SCOUTS_ASSET_VERSION = '20261027-8';
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

require_once SCOUTS_ROOT . DIRECTORY_SEPARATOR . 'includes' . DIRECTORY_SEPARATOR . 'photo-pipeline.php';

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

/** Canonical public origin (sitemap, robots, OG). */
function scouts_public_origin(): string
{
    return 'https://scoutslille.be';
}

/**
 * Indexable public URL paths for the XML sitemap (home = '/').
 * Keep aligned with page.php / router.php / .htaccess.
 * Excludes login, admin, and 404 (not for Google indexing).
 *
 * @return list<string>
 */
function scouts_sitemap_paths(): array
{
    return [
        '/',
        '/over-ons',
        '/inschrijven',
        '/nieuws',
        '/uniform',
        '/tweedehands',
        '/kapoenen',
        '/welpen',
        '/jongverkenners',
        '/verkenners',
        '/jins',
        '/privacybeleid',
    ];
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

        // Inline public site-data so the first paint needs no extra API round-trip.
        if (!str_contains($html, '__SCOUTS_SITE_DATA__')) {
            try {
                $bundle = scouts_public_site_data_bundle();
                $meta = json_encode(
                    [
                        'version' => $bundle['version'],
                        'etag' => $bundle['etag'],
                    ],
                    JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES
                );
                if ($meta !== false) {
                    $boot = '<script>window.__SCOUTS_SITE_DATA__='
                        . $bundle['json']
                        . ';window.__SCOUTS_SITE_DATA_META__='
                        . $meta
                        . ';</script>';
                    $html = preg_replace('/<\/head>/i', $boot . "\n</head>", $html, 1) ?? $html;
                }
            } catch (Throwable) {
                // Fall back to JS fetch via DataStore.load().
            }
        }
    }

    $version = scouts_asset_version();
    $cssBundle = match ($resolvedPage) {
        'index', 'login' => 'core',
        'admin' => 'admin',
        default => 'public',
    };
    $versionLocalAssetUrl = static function (string $url) use ($version, $cssBundle): string {
        $url = html_entity_decode(trim($url), ENT_QUOTES | ENT_HTML5, 'UTF-8');
        if ($url === '' || preg_match('#^(https?:)?//#i', $url) === 1 || str_starts_with($url, 'data:')) {
            return $url;
        }
        if (preg_match('#\.(?:css|js|png|jpe?g|webp|avif|gif|svg|ico)(?:\?|$)#i', $url) !== 1) {
            return $url;
        }
        $parts = parse_url($url);
        if (!is_array($parts) || empty($parts['path'])) {
            return $url;
        }
        $query = [];
        if (!empty($parts['query'])) {
            parse_str($parts['query'], $query);
        }
        $path = $parts['path'];
        $baseName = strtolower(basename($path));
        if ($baseName === 'style.css') {
            if ($cssBundle === 'public') {
                unset($query['bundle']);
            } else {
                $query['bundle'] = $cssBundle;
            }
        } elseif ($baseName === 'script.js') {
            // Production serves the checked-in minified build; source stays script.js.
            if (preg_match('#^(.*)/script\.js$#i', $path, $pathParts) === 1) {
                $path = $pathParts[1] . '/script.min.js';
            } else {
                $path = 'script.min.js';
            }
        }
        $query['v'] = $version;
        return $path . '?' . http_build_query($query);
    };

    $html = preg_replace_callback(
        '/\b(href|src)=(["\'])([^"\']+)\2/i',
        static function (array $matches) use ($versionLocalAssetUrl): string {
            $next = $versionLocalAssetUrl($matches[3]);
            if ($next === $matches[3]) {
                return $matches[0];
            }
            return $matches[1] . '=' . $matches[2] . $next . $matches[2];
        },
        $html
    ) ?? $html;

    // Keep preload/srcset candidates on the same cache-busted versions.
    $html = preg_replace_callback(
        '/\b(imagesrcset|srcset)=(["\'])([^"\']+)\2/i',
        static function (array $matches) use ($versionLocalAssetUrl): string {
            $parts = preg_split('/\s*,\s*/', $matches[3]) ?: [];
            $rewritten = [];
            foreach ($parts as $part) {
                $part = trim($part);
                if ($part === '') {
                    continue;
                }
                if (preg_match('/^(.*?)(?:\s+(\d+[wx]|\d+(\.\d+)?x))?$/i', $part, $bit) !== 1) {
                    $rewritten[] = $part;
                    continue;
                }
                $url = $versionLocalAssetUrl($bit[1]);
                $descriptor = isset($bit[2]) ? ' ' . $bit[2] : '';
                $rewritten[] = $url . $descriptor;
            }
            return $matches[1] . '=' . $matches[2] . implode(', ', $rewritten) . $matches[2];
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

/**
 * Ensure photos.pageBackgrounds(+Previous) exist with known string keys.
 *
 * @param array<string, mixed> $data
 * @return array<string, mixed>
 */
function scouts_normalize_page_backgrounds(array $data): array
{
    if (!isset($data['photos']) || !is_array($data['photos'])) {
        $data['photos'] = [];
    }

    $keys = scouts_page_background_keys();
    foreach (['pageBackgrounds', 'pageBackgroundsPrevious'] as $bucket) {
        if (!isset($data['photos'][$bucket]) || !is_array($data['photos'][$bucket])) {
            $data['photos'][$bucket] = [];
        }
        foreach ($keys as $key) {
            $value = $data['photos'][$bucket][$key] ?? '';
            $data['photos'][$bucket][$key] = is_string($value) ? $value : '';
        }
    }

    return $data;
}

/**
 * @return list<string>
 */
function scouts_page_background_keys(): array
{
    return [
        'home',
        'registration',
        'news',
        'about',
        'secondhand',
        'uniform',
        'branch',
        'error',
    ];
}

/**
 * Upload stems for configurable page backgrounds (bg-home, …).
 *
 * @return list<string>
 */
function scouts_page_background_upload_names(): array
{
    $names = [];
    foreach (scouts_page_background_keys() as $key) {
        $names[] = 'bg-' . $key;
    }
    return $names;
}

function scouts_read_site_data(): array
{
    return scouts_normalize_page_backgrounds(scouts_decode_json_file(SCOUTS_DATA_FILE));
}

function scouts_site_data_version(): string
{
    $modifiedAt = filemtime(SCOUTS_DATA_FILE);
    $fileSize = filesize(SCOUTS_DATA_FILE);
    if ($modifiedAt === false || $fileSize === false) {
        throw new RuntimeException('Datastorebestand kan niet worden gelezen.');
    }

    return sha1($modifiedAt . ':' . $fileSize);
}

/**
 * Strip unpublished news for public API responses.
 *
 * @param array<string, mixed> $data
 * @return array<string, mixed>
 */
function scouts_public_site_data(array $data): array
{
    // Editor / unused keys — keep the public payload small.
    unset($data['activePage']);
    if (isset($data['pageContent']) && is_array($data['pageContent'])) {
        unset($data['pageContent']['photos'], $data['pageContent']['settings']);
    }
    if (isset($data['photos']) && is_array($data['photos'])) {
        unset(
            $data['photos']['logo'],
            $data['photos']['homeHero'],
            $data['photos']['uniform'],
            $data['photos']['branchLogos'],
            $data['photos']['letters'],
            $data['photos']['pageBackgroundsPrevious']
        );
    }

    if (!isset($data['news']) || !is_array($data['news'])) {
        $data['news'] = [];
        return $data;
    }

    $data['news'] = array_values(array_filter(
        $data['news'],
        static function ($item): bool {
            if (!is_array($item)) {
                return false;
            }
            return ($item['published'] ?? true) !== false;
        }
    ));

    return $data;
}

/**
 * Public site-data as JSON string + version (file-cached, rebuilt on write / miss).
 *
 * @return array{version: string, etag: string, json: string}
 */
function scouts_public_site_data_bundle(): array
{
    $version = scouts_site_data_version();
    $etag = '"' . $version . '-p"';

    if (is_file(SCOUTS_PUBLIC_DATA_CACHE)) {
        $raw = @file_get_contents(SCOUTS_PUBLIC_DATA_CACHE);
        if (is_string($raw) && $raw !== '') {
            $cached = json_decode($raw, true);
            if (
                is_array($cached)
                && ($cached['version'] ?? null) === $version
                && is_string($cached['json'] ?? null)
                && $cached['json'] !== ''
            ) {
                return [
                    'version' => $version,
                    'etag' => $etag,
                    'json' => $cached['json'],
                ];
            }
        }
    }

    $data = scouts_public_site_data(scouts_read_site_data());
    $json = json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if ($json === false) {
        throw new RuntimeException('Sitegegevens konden niet worden gecodeerd.');
    }

    $payload = json_encode(
        ['version' => $version, 'json' => $json],
        JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES
    );
    if ($payload !== false) {
        $dir = dirname(SCOUTS_PUBLIC_DATA_CACHE);
        if (!is_dir($dir)) {
            @mkdir($dir, 0755, true);
        }
        $temp = @tempnam($dir, 'pub-');
        if ($temp !== false) {
            if (@file_put_contents($temp, $payload, LOCK_EX) !== false) {
                @rename($temp, SCOUTS_PUBLIC_DATA_CACHE);
            }
            if (is_file($temp)) {
                @unlink($temp);
            }
        }
    }

    return [
        'version' => $version,
        'etag' => $etag,
        'json' => $json,
    ];
}

function scouts_invalidate_public_site_data_cache(): void
{
    if (is_file(SCOUTS_PUBLIC_DATA_CACHE)) {
        @unlink(SCOUTS_PUBLIC_DATA_CACHE);
    }
}

/**
 * Ensure required top-level shape matches the default datastore.
 *
 * @param array<string, mixed> $data
 */
function scouts_validate_site_data(array $data): void
{
    if ($data === []) {
        throw new InvalidArgumentException('Ongeldige of lege sitegegevens.');
    }

    $defaults = scouts_decode_json_file(SCOUTS_DEFAULT_DATA_FILE);
    foreach (array_keys($defaults) as $key) {
        if (!array_key_exists($key, $data)) {
            throw new InvalidArgumentException("Verplicht veld ontbreekt: {$key}.");
        }
    }

    $arrayKeys = [
        'pageContent',
        'agenda',
        'news',
        'faq',
        'contact',
        'groupLeadership',
        'branchLeadership',
        'secondhand',
        'photos',
    ];
    foreach ($arrayKeys as $key) {
        if (!is_array($data[$key])) {
            throw new InvalidArgumentException("Veld {$key} moet een object of lijst zijn.");
        }
    }

    if (!is_string($data['activePage'] ?? null)) {
        throw new InvalidArgumentException('Veld activePage moet tekst zijn.');
    }

    foreach (['agenda', 'news', 'faq', 'groupLeadership', 'secondhand'] as $listKey) {
        foreach ($data[$listKey] as $index => $item) {
            if (!is_array($item)) {
                throw new InvalidArgumentException("Ongeldig item in {$listKey} op positie {$index}.");
            }
        }
    }

    if (!is_array($data['branchLeadership'])) {
        throw new InvalidArgumentException('Veld branchLeadership moet een object zijn.');
    }
    foreach ($data['branchLeadership'] as $branch => $leaders) {
        if (!is_array($leaders)) {
            throw new InvalidArgumentException("Leiding voor {$branch} moet een lijst zijn.");
        }
    }
}

function scouts_write_site_data(array $data): void
{
    $data = scouts_normalize_page_backgrounds($data);
    scouts_validate_site_data($data);

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
        scouts_invalidate_public_site_data_cache();
        // Rebuild eagerly so the next HTML/API hit is a cache read.
        try {
            scouts_public_site_data_bundle();
        } catch (Throwable) {
            // Cache rebuild is best-effort; API/HTML can rebuild on demand.
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
        ...scouts_page_background_upload_names(),
    ], true)
        || (bool) preg_match('/^(?:tweedehands|agenda|news)-[0-9]+-[a-z0-9]+$/', $filename);
}

function scouts_delete_photo_versions(string $filename): void
{
    $basename = strtolower($filename);
    if (str_ends_with($basename, '-thumb')) {
        $basename = substr($basename, 0, -6);
    }
    if (!scouts_allowed_photo_name($basename)) {
        throw new InvalidArgumentException('Ongeldige bestandsnaam.');
    }

    scouts_photo_unlink_public_derivatives($basename);
    scouts_photo_unlink_original($basename);
}

/**
 * @return list<string>
 */
function scouts_protected_upload_filenames(): array
{
    return [
        '.htaccess',
        'htaccess',
        'privacybeleid.pdf',
        'over-ons.jpg',
        'kapoenenleiding.jpg',
        'welpenleiding.jpg',
        'jongverkennersleiding.jpg',
        'verkennersleiding.jpg',
        'jinsleiding.jpg',
        'bg-home.jpg',
        'bg-registration.jpg',
        'bg-news.jpg',
        'bg-about.jpg',
        'bg-secondhand.jpg',
        'bg-uniform.jpg',
        'bg-branch.jpg',
        'bg-error.jpg',
    ];
}

/**
 * Mark known derivative filenames for an upload stem (no extension).
 *
 * @param array<string, true> $found
 */
function scouts_mark_upload_variants(string $stem, array &$found): void
{
    foreach (['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif'] as $extension) {
        $found[$stem . '-thumb.' . $extension] = true;
        $found[$stem . '-md.' . $extension] = true;
        $found[$stem . '-display.' . $extension] = true;
        foreach (SCOUTS_PHOTO_VARIANT_WIDTHS as $width) {
            $found[$stem . '-w' . $width . '.' . $extension] = true;
        }
    }
}

/**
 * @param array<string, true> $referenced
 */
function scouts_upload_stem_is_referenced(string $stem, array $referenced): bool
{
    foreach (['jpg', 'jpeg', 'png', 'webp', 'gif'] as $extension) {
        if (isset($referenced[$stem . '.' . $extension])) {
            return true;
        }
    }
    return false;
}

/**
 * Collect upload basenames referenced by site-data (and their -thumb siblings).
 *
 * @param mixed $value
 * @return array<string, true>
 */
function scouts_collect_referenced_uploads(mixed $value, array &$found = []): array
{
    if (is_string($value)) {
        if (preg_match('#(?:^|/|\\\\)uploads[/\\\\]+([^?\"\'\\s]+)#i', $value, $matches) === 1) {
            $name = basename(str_replace('\\', '/', $matches[1]));
            if ($name !== '' && $name !== '.' && $name !== '..') {
                $found[$name] = true;
                if (preg_match('/^(.+)-(?:thumb|md|display|w\d+)(\.[a-z0-9]+)$/i', $name, $variant) === 1) {
                    $found[$variant[1] . $variant[2]] = true;
                    scouts_mark_upload_variants($variant[1], $found);
                } elseif (preg_match('/^(.+)(\.[a-z0-9]+)$/i', $name, $full) === 1) {
                    scouts_mark_upload_variants($full[1], $found);
                }
            }
        }
        return $found;
    }

    if (is_array($value)) {
        foreach ($value as $child) {
            scouts_collect_referenced_uploads($child, $found);
        }
    }

    return $found;
}

/**
 * @return list<array{name: string, size: int}>
 */
function scouts_list_orphan_uploads(): array
{
    if (!is_dir(SCOUTS_UPLOADS_DIR)) {
        return [];
    }

    $referenced = scouts_collect_referenced_uploads(scouts_read_site_data());
    foreach (scouts_protected_upload_filenames() as $protected) {
        $referenced[$protected] = true;
        if (preg_match('/^(.+)(\.[a-z0-9]+)$/i', $protected, $parts) === 1) {
            scouts_mark_upload_variants($parts[1], $referenced);
        }
    }

    $orphans = [];
    $entries = scandir(SCOUTS_UPLOADS_DIR);
    if ($entries === false) {
        return [];
    }

    foreach ($entries as $entry) {
        if ($entry === '.' || $entry === '..') {
            continue;
        }
        $path = SCOUTS_UPLOADS_DIR . DIRECTORY_SEPARATOR . $entry;
        if (!is_file($path) || isset($referenced[$entry])) {
            continue;
        }
        // Width/WebP derivatives of a referenced master are never orphans.
        if (
            preg_match('/^(.+)-w\d+\.(jpe?g|webp)$/i', $entry, $widthMatch) === 1
            && scouts_upload_stem_is_referenced($widthMatch[1], $referenced)
        ) {
            continue;
        }
        $orphans[] = [
            'name' => $entry,
            'size' => (int) filesize($path),
        ];
    }

    usort(
        $orphans,
        static fn (array $left, array $right): int => strcasecmp($left['name'], $right['name'])
    );

    return $orphans;
}

/**
 * @param list<string>|null $names
 * @return list<string>
 */
function scouts_purge_orphan_uploads(?array $names = null): array
{
    $orphans = scouts_list_orphan_uploads();
    $allowed = [];
    foreach ($orphans as $orphan) {
        $allowed[$orphan['name']] = true;
    }

    $targets = $names === null
        ? array_keys($allowed)
        : array_values(array_filter(
            $names,
            static fn ($name): bool => is_string($name) && isset($allowed[$name])
        ));

    $deleted = [];
    foreach ($targets as $name) {
        $path = SCOUTS_UPLOADS_DIR . DIRECTORY_SEPARATOR . basename($name);
        if (!is_file($path)) {
            continue;
        }
        if (!unlink($path)) {
            throw new RuntimeException('Kon ' . $name . ' niet verwijderen.');
        }
        $deleted[] = $name;
    }

    return $deleted;
}


function scouts_read_google_drive_settings(): array
{
    if (!is_file(SCOUTS_GOOGLE_DRIVE_SETTINGS_FILE)) {
        return [];
    }

    return scouts_decode_json_file(SCOUTS_GOOGLE_DRIVE_SETTINGS_FILE);
}

function scouts_replace_file_atomic(string $targetPath, string $contents, string $errorLabel): void
{
    $dir = dirname($targetPath);
    if (!is_dir($dir) && !mkdir($dir, 0755, true)) {
        throw new RuntimeException('Datamap kon niet worden aangemaakt.');
    }

    $tempFile = tempnam($dir, 'scouts-');
    if ($tempFile === false || file_put_contents($tempFile, $contents, LOCK_EX) === false) {
        if (is_string($tempFile) && is_file($tempFile)) {
            @unlink($tempFile);
        }
        throw new RuntimeException($errorLabel . ' kon niet worden opgeslagen.');
    }

    // Windows cannot rename() over an existing file; fall back to copy().
    $replaced = @rename($tempFile, $targetPath);
    if (!$replaced) {
        $replaced = @copy($tempFile, $targetPath);
        @unlink($tempFile);
    }
    if (!$replaced) {
        throw new RuntimeException($errorLabel . ' kon niet worden vervangen.');
    }
}

function scouts_write_google_drive_settings(array $settings): void
{
    $json = json_encode($settings, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT) . PHP_EOL;
    scouts_replace_file_atomic(SCOUTS_GOOGLE_DRIVE_SETTINGS_FILE, $json, 'Google Drive-instellingen');
}

function scouts_write_google_drive_credentials(array $credentials): void
{
    $json = json_encode($credentials, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT) . PHP_EOL;
    scouts_replace_file_atomic(SCOUTS_GOOGLE_SERVICE_ACCOUNT_FILE, $json, 'Google-sleutel');
    @chmod(SCOUTS_GOOGLE_SERVICE_ACCOUNT_FILE, 0600);
}

function scouts_write_google_oauth(array $oauth): void
{
    $json = json_encode($oauth, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT) . PHP_EOL;
    scouts_replace_file_atomic(SCOUTS_GOOGLE_OAUTH_FILE, $json, 'Google OAuth-configuratie');
    @chmod(SCOUTS_GOOGLE_OAUTH_FILE, 0600);
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