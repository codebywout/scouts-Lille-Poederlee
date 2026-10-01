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
const SCOUTS_MAX_PDF_UPLOAD_BYTES = 20971520;

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
        || (bool) preg_match('/^(?:tweedehands|agenda)-[0-9]+-[a-z0-9]+$/', $filename);
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