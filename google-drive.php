<?php
declare(strict_types=1);

function scouts_google_drive_credentials(): ?array
{
    $credentialFiles = [SCOUTS_GOOGLE_SERVICE_ACCOUNT_FILE];
    $environmentPath = scouts_env('SCOUTS_GOOGLE_SERVICE_ACCOUNT_JSON_PATH');
    if ($environmentPath !== null && $environmentPath !== '') {
        $credentialFiles[] = $environmentPath;
    }
    $credentials = null;
    foreach ($credentialFiles as $credentialsPath) {
        if (is_readable($credentialsPath)) {
            $credentials = json_decode((string) file_get_contents($credentialsPath), true);
            break;
        }
    }
    if (!is_array($credentials) || !isset($credentials['client_email'], $credentials['private_key'])) {
        return null;
    }

    return $credentials;
}

function scouts_google_drive_is_configured(): bool
{
    $oauth = scouts_google_oauth_data();
    return scouts_google_drive_folder_id() !== ''
        && (($oauth !== null && isset($oauth['refresh_token'])) || scouts_google_drive_credentials() !== null);
}

function scouts_google_oauth_data(): ?array
{
    if (!is_readable(SCOUTS_GOOGLE_OAUTH_FILE)) {
        return null;
    }
    $oauth = json_decode((string) file_get_contents(SCOUTS_GOOGLE_OAUTH_FILE), true);
    return is_array($oauth) ? $oauth : null;
}

function scouts_google_oauth_client(): ?array
{
    $oauth = scouts_google_oauth_data();
    if (!is_array($oauth)) {
        return null;
    }
    return isset($oauth['client_id'], $oauth['client_secret']) ? $oauth : null;
}

function scouts_google_oauth_redirect_uri(): string
{
    $oauth = scouts_google_oauth_data();
    if (is_array($oauth) && is_string($oauth['redirect_uri'] ?? null) && $oauth['redirect_uri'] !== '') {
        return $oauth['redirect_uri'];
    }
    $https = (!empty($_SERVER['HTTPS']) && strtolower((string) $_SERVER['HTTPS']) !== 'off')
        || strtolower((string) ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '')) === 'https';
    return ($https ? 'https://' : 'http://') . ($_SERVER['HTTP_HOST'] ?? 'localhost') . '/api/google-drive/oauth/callback';
}

function scouts_google_drive_folder_id(): string
{
    return trim((string) (scouts_read_google_drive_settings()['folderId']
        ?? scouts_env('SCOUTS_GOOGLE_DRIVE_FOLDER_ID', '')));
}

function scouts_google_base64url(string $value): string
{
    return rtrim(strtr(base64_encode($value), '+/', '-_'), '=');
}

function scouts_google_error_message(string $response, int $status): string
{
    $payload = json_decode($response, true);
    $message = is_array($payload) ? ($payload['error']['message'] ?? '') : '';
    return is_string($message) && $message !== '' ? $message : 'HTTP ' . $status;
}

function scouts_google_drive_access_token(?array $credentials): string
{
    $oauth = scouts_google_oauth_client();
    if ($oauth !== null && isset($oauth['refresh_token'])) {
        $ch = curl_init('https://oauth2.googleapis.com/token');
        curl_setopt_array($ch, [
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => http_build_query([
                'client_id' => $oauth['client_id'],
                'client_secret' => $oauth['client_secret'],
                'refresh_token' => $oauth['refresh_token'],
                'grant_type' => 'refresh_token',
            ]),
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 30,
            CURLOPT_HTTPHEADER => ['Content-Type: application/x-www-form-urlencoded'],
        ]);
        if (defined('CURLSSLOPT_NATIVE_CA')) {
            curl_setopt($ch, CURLOPT_SSL_OPTIONS, CURLSSLOPT_NATIVE_CA);
        }
        $response = curl_exec($ch);
        $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        $error = curl_error($ch);
        curl_close($ch);
        if ($response === false || $status < 200 || $status >= 300) {
            throw new RuntimeException('Google OAuth-token kon niet worden vernieuwd: ' . ($error !== '' ? $error : scouts_google_error_message((string) $response, $status)));
        }
        $token = json_decode($response, true);
        if (!is_array($token) || !is_string($token['access_token'] ?? null)) {
            throw new RuntimeException('Google gaf geen geldige OAuth-token terug.');
        }
        return $token['access_token'];
    }

    $header = scouts_google_base64url(json_encode(['alg' => 'RS256', 'typ' => 'JWT'], JSON_THROW_ON_ERROR));
    $claims = scouts_google_base64url(json_encode([
        'iss' => $credentials['client_email'],
        'scope' => 'https://www.googleapis.com/auth/drive.file',
        'aud' => 'https://oauth2.googleapis.com/token',
        'iat' => time(),
        'exp' => time() + 3600,
    ], JSON_THROW_ON_ERROR));
    $signature = '';
    if (!openssl_sign($header . '.' . $claims, $signature, $credentials['private_key'], OPENSSL_ALGO_SHA256)) {
        throw new RuntimeException('Google-token kon niet worden ondertekend.');
    }

    $ch = curl_init('https://oauth2.googleapis.com/token');
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => http_build_query([
            'grant_type' => 'urn:ietf:params:oauth:grant-type:jwt-bearer',
            'assertion' => $header . '.' . $claims . '.' . scouts_google_base64url($signature),
        ]),
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 30,
        CURLOPT_HTTPHEADER => ['Content-Type: application/x-www-form-urlencoded'],
    ]);
    if (defined('CURLSSLOPT_NATIVE_CA')) {
        curl_setopt($ch, CURLOPT_SSL_OPTIONS, CURLSSLOPT_NATIVE_CA);
    }
    $response = curl_exec($ch);
    $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    $error = curl_error($ch);
    curl_close($ch);
    if ($response === false || $status < 200 || $status >= 300) {
        throw new RuntimeException('Google-token kon niet worden opgehaald: ' . ($error !== '' ? $error : scouts_google_error_message((string) $response, $status)));
    }

    $token = json_decode($response, true);
    if (!is_array($token) || !is_string($token['access_token'] ?? null)) {
        throw new RuntimeException('Google gaf geen geldige toegangstoken terug.');
    }
    return $token['access_token'];
}

function scouts_google_drive_upload(string $filePath, string $filename): void
{
    $credentials = scouts_google_drive_credentials();
    $folderId = scouts_google_drive_folder_id();
    if ($folderId === '' || (scouts_google_oauth_client() === null && $credentials === null)) {
        throw new RuntimeException('Google Drive is niet geconfigureerd.');
    }
    if (!function_exists('curl_init') || !function_exists('openssl_sign')) {
        throw new RuntimeException('PHP cURL en OpenSSL zijn vereist voor Google Drive.');
    }

    $contents = file_get_contents($filePath);
    if ($contents === false) {
        throw new RuntimeException('PDF kon niet voor Google Drive worden gelezen.');
    }
    $boundary = 'scouts-' . bin2hex(random_bytes(12));
    $metadata = json_encode([
        'name' => $filename,
        'parents' => [$folderId],
        'mimeType' => 'application/pdf',
    ], JSON_THROW_ON_ERROR);
    $body = '--' . $boundary . "\r\n"
        . "Content-Type: application/json; charset=UTF-8\r\n\r\n"
        . $metadata . "\r\n"
        . '--' . $boundary . "\r\n"
        . "Content-Type: application/pdf\r\n\r\n"
        . $contents . "\r\n"
        . '--' . $boundary . "--\r\n";

    $ch = curl_init('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true');
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => $body,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 60,
        CURLOPT_HTTPHEADER => [
            'Authorization: Bearer ' . scouts_google_drive_access_token($credentials),
            'Content-Type: multipart/related; boundary=' . $boundary,
        ],
    ]);
    if (defined('CURLSSLOPT_NATIVE_CA')) {
        curl_setopt($ch, CURLOPT_SSL_OPTIONS, CURLSSLOPT_NATIVE_CA);
    }
    $response = curl_exec($ch);
    $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    $error = curl_error($ch);
    curl_close($ch);
    if ($response === false || $status < 200 || $status >= 300) {
        throw new RuntimeException('PDF kon niet naar Google Drive worden geupload: ' . ($error !== '' ? $error : scouts_google_error_message((string) $response, $status)));
    }
}