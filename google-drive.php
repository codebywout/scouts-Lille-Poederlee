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

function scouts_google_oauth_current_host_callback(): string
{
    $https = (!empty($_SERVER['HTTPS']) && strtolower((string) $_SERVER['HTTPS']) !== 'off')
        || strtolower((string) ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '')) === 'https';
    return ($https ? 'https://' : 'http://') . ($_SERVER['HTTP_HOST'] ?? 'localhost') . '/api/google-drive/oauth/callback';
}

function scouts_google_oauth_authorized_redirect_uris(): array
{
    $oauth = scouts_google_oauth_data();
    if (!is_array($oauth)) {
        return [];
    }
    $uris = [];
    if (is_array($oauth['redirect_uris'] ?? null)) {
        foreach ($oauth['redirect_uris'] as $uri) {
            if (is_string($uri) && trim($uri) !== '') {
                $uris[] = trim($uri);
            }
        }
    }
    if (is_string($oauth['redirect_uri'] ?? null) && trim($oauth['redirect_uri']) !== '') {
        $uris[] = trim($oauth['redirect_uri']);
    }
    return array_values(array_unique($uris));
}

function scouts_google_oauth_redirect_uri(): string
{
    $current = scouts_google_oauth_current_host_callback();
    $authorized = scouts_google_oauth_authorized_redirect_uris();
    foreach ($authorized as $uri) {
        if (strcasecmp($uri, $current) === 0) {
            return $uri;
        }
    }
    // Same host/port/scheme, possibly different path spelling.
    $currentParts = parse_url($current);
    foreach ($authorized as $uri) {
        $parts = parse_url($uri);
        if (!is_array($parts) || !is_array($currentParts)) {
            continue;
        }
        $sameHost = strcasecmp((string) ($parts['host'] ?? ''), (string) ($currentParts['host'] ?? '')) === 0;
        $sameScheme = strcasecmp((string) ($parts['scheme'] ?? ''), (string) ($currentParts['scheme'] ?? '')) === 0;
        $samePort = (int) ($parts['port'] ?? 0) === (int) ($currentParts['port'] ?? 0);
        if ($sameHost && $sameScheme && $samePort) {
            return $uri;
        }
    }
    return $current;
}

function scouts_google_oauth_admin_redirect(string $status, string $message = ''): void
{
    $query = ['google' => $status];
    if ($message !== '') {
        $query['google_message'] = $message;
    }
    header('Location: /admin?' . http_build_query($query));
    exit;
}

function scouts_google_oauth_fetch_email(string $accessToken): string
{
    $ch = curl_init('https://www.googleapis.com/oauth2/v2/userinfo');
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 15,
        CURLOPT_HTTPHEADER => ['Authorization: Bearer ' . $accessToken],
    ]);
    if (defined('CURLSSLOPT_NATIVE_CA')) {
        curl_setopt($ch, CURLOPT_SSL_OPTIONS, CURLSSLOPT_NATIVE_CA);
    }
    $response = curl_exec($ch);
    $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    if ($response === false || $status < 200 || $status >= 300) {
        return '';
    }
    $payload = json_decode($response, true);
    $email = is_array($payload) ? ($payload['email'] ?? '') : '';
    return is_string($email) ? trim($email) : '';
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
    if ($response === false || $status < 200 || $status >= 300) {
        throw new RuntimeException('Google-token kon niet worden opgehaald: ' . ($error !== '' ? $error : scouts_google_error_message((string) $response, $status)));
    }

    $token = json_decode($response, true);
    if (!is_array($token) || !is_string($token['access_token'] ?? null)) {
        throw new RuntimeException('Google gaf geen geldige toegangstoken terug.');
    }
    return $token['access_token'];
}

/**
 * Dutch month name => 1–12 (scouts planning titles).
 *
 * @return array<string, int>
 */
function scouts_google_drive_planning_month_numbers(): array
{
    return [
        'januari' => 1,
        'februari' => 2,
        'maart' => 3,
        'april' => 4,
        'mei' => 5,
        'juni' => 6,
        'juli' => 7,
        'augustus' => 8,
        'september' => 9,
        'oktober' => 10,
        'november' => 11,
        'december' => 12,
    ];
}

/**
 * Month numbers found in a planning title (order preserved, unique).
 *
 * @return list<int>
 */
function scouts_google_drive_planning_months_from_title(string $title): array
{
    $map = scouts_google_drive_planning_month_numbers();
    $parts = preg_split('/[_\s,-]+/', strtolower(trim($title))) ?: [];
    $months = [];
    foreach ($parts as $part) {
        $part = trim((string) $part);
        if ($part !== '' && isset($map[$part]) && !in_array($map[$part], $months, true)) {
            $months[] = $map[$part];
        }
    }
    return $months;
}

/**
 * Calendar year for a planning period (scout season Sep–Aug).
 * Example: januari uploaded in december 2026 → 2027.
 */
function scouts_google_drive_planning_year(
    string $title,
    ?DateTimeInterface $now = null,
): int {
    $now = $now ?? new DateTimeImmutable('now');
    $calendarYear = (int) $now->format('Y');
    $currentMonth = (int) $now->format('n');
    // Season starts in September: Sep 2026–Aug 2027 → seasonStartYear 2026.
    $seasonStartYear = $currentMonth >= 9 ? $calendarYear : $calendarYear - 1;

    $months = scouts_google_drive_planning_months_from_title($title);
    if ($months === []) {
        return $calendarYear;
    }

    $years = [];
    foreach ($months as $month) {
        // Sep–Dec belong to seasonStartYear; Jan–Aug to the following calendar year.
        $years[] = $month >= 9 ? $seasonStartYear : $seasonStartYear + 1;
    }
    return max($years);
}

/**
 * Sanitize planning title (selected months) for Drive filenames.
 * Example: "oktober november" → "oktober_november"
 */
function scouts_google_drive_planning_title_part(string $title): string
{
    $titlePart = preg_replace('/\.pdf$/i', '', $title);
    $titlePart = preg_replace('/[^a-zA-Z0-9]+/', '_', (string) $titlePart);
    $titlePart = trim(strtolower((string) $titlePart), '_');
    return $titlePart !== '' ? $titlePart : 'planning';
}

/**
 * Stable Drive name for one planning period: {tak}_{maanden}_{jaar}.pdf
 * Same period → same name (overwrite). Other months/year → new name (new file).
 */
function scouts_google_drive_planning_filename(
    string $branch,
    string $title,
    ?int $year = null,
    ?DateTimeInterface $now = null,
): string {
    $branch = strtolower(trim($branch));
    $titlePart = scouts_google_drive_planning_title_part($title);
    $year = $year ?? scouts_google_drive_planning_year($title, $now);
    return $branch . '_' . $titlePart . '_' . $year . '.pdf';
}

/**
 * Map key for remembered Drive file ids (filename without .pdf).
 */
function scouts_google_drive_planning_id_key(
    string $branch,
    string $title,
    ?int $year = null,
    ?DateTimeInterface $now = null,
): string {
    $filename = scouts_google_drive_planning_filename($branch, $title, $year, $now);
    return (string) preg_replace('/\.pdf$/i', '', $filename);
}

/**
 * @return array<string, string> planningKey => Drive file id
 */
function scouts_google_drive_planning_file_ids(): array
{
    $settings = scouts_read_google_drive_settings();
    $map = is_array($settings['planningFileIds'] ?? null) ? $settings['planningFileIds'] : [];
    $out = [];
    foreach ($map as $key => $fileId) {
        if (!is_string($key) || !is_string($fileId)) {
            continue;
        }
        $key = strtolower(trim($key));
        $fileId = trim($fileId);
        if ($key !== '' && $fileId !== '') {
            $out[$key] = $fileId;
        }
    }
    return $out;
}

function scouts_google_drive_remember_planning_file_id(string $planningKey, string $fileId): void
{
    $planningKey = strtolower(trim($planningKey));
    $fileId = trim($fileId);
    if ($planningKey === '' || $fileId === '') {
        return;
    }
    $settings = scouts_read_google_drive_settings();
    $map = is_array($settings['planningFileIds'] ?? null) ? $settings['planningFileIds'] : [];
    $map[$planningKey] = $fileId;
    $settings['planningFileIds'] = $map;
    scouts_write_google_drive_settings($settings);
}

function scouts_google_drive_forget_planning_file_id(string $planningKey): void
{
    $planningKey = strtolower(trim($planningKey));
    if ($planningKey === '') {
        return;
    }
    $settings = scouts_read_google_drive_settings();
    $map = is_array($settings['planningFileIds'] ?? null) ? $settings['planningFileIds'] : [];
    if (!isset($map[$planningKey])) {
        return;
    }
    unset($map[$planningKey]);
    $settings['planningFileIds'] = $map;
    scouts_write_google_drive_settings($settings);
}

function scouts_google_drive_escape_query_value(string $value): string
{
    return str_replace(["\\", "'"], ["\\\\", "\\'"], $value);
}

/**
 * Whether Drive file metadata is visible in the target folder (not trashed).
 *
 * @param array{id?: string, trashed?: bool, parents?: list<string>}|null $meta
 */
function scouts_google_drive_file_usable_in_folder(?array $meta, string $folderId): bool
{
    if ($meta === null) {
        return false;
    }
    if (!empty($meta['trashed'])) {
        return false;
    }
    $parents = is_array($meta['parents'] ?? null) ? $meta['parents'] : [];
    foreach ($parents as $parent) {
        if (is_string($parent) && $parent === $folderId) {
            return true;
        }
    }
    return false;
}

/**
 * Fetch Drive file metadata, or null when missing / inaccessible.
 *
 * @return array{id: string, trashed: bool, parents: list<string>}|null
 */
function scouts_google_drive_get_file(string $accessToken, string $fileId): ?array
{
    $fileId = trim($fileId);
    if ($fileId === '') {
        return null;
    }
    $url = 'https://www.googleapis.com/drive/v3/files/'
        . rawurlencode($fileId)
        . '?' . http_build_query([
            'fields' => 'id,trashed,parents',
            'supportsAllDrives' => 'true',
        ]);
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 30,
        CURLOPT_HTTPHEADER => ['Authorization: Bearer ' . $accessToken],
    ]);
    if (defined('CURLSSLOPT_NATIVE_CA')) {
        curl_setopt($ch, CURLOPT_SSL_OPTIONS, CURLSSLOPT_NATIVE_CA);
    }
    $response = curl_exec($ch);
    $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    if ($response === false || $status === 404) {
        return null;
    }
    if ($status < 200 || $status >= 300) {
        throw new RuntimeException(
            'Google Drive-bestand lezen mislukt: ' . scouts_google_error_message((string) $response, $status)
        );
    }
    $payload = json_decode((string) $response, true);
    if (!is_array($payload) || !is_string($payload['id'] ?? null) || trim($payload['id']) === '') {
        return null;
    }
    $parents = [];
    if (is_array($payload['parents'] ?? null)) {
        foreach ($payload['parents'] as $parent) {
            if (is_string($parent) && $parent !== '') {
                $parents[] = $parent;
            }
        }
    }
    return [
        'id' => trim($payload['id']),
        'trashed' => !empty($payload['trashed']),
        'parents' => $parents,
    ];
}

/**
 * Restore a trashed/moved planning file into the configured folder.
 */
function scouts_google_drive_restore_file_in_folder(
    string $accessToken,
    string $fileId,
    string $folderId,
    array $currentParents,
): void {
    $params = [
        'supportsAllDrives' => 'true',
    ];
    if (!in_array($folderId, $currentParents, true)) {
        $params['addParents'] = $folderId;
        $remove = array_values(array_filter(
            $currentParents,
            static fn($parent): bool => is_string($parent) && $parent !== '' && $parent !== $folderId
        ));
        if ($remove !== []) {
            $params['removeParents'] = implode(',', $remove);
        }
    }
    $url = 'https://www.googleapis.com/drive/v3/files/'
        . rawurlencode($fileId)
        . '?' . http_build_query($params);
    $body = json_encode(['trashed' => false], JSON_THROW_ON_ERROR);
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_CUSTOMREQUEST => 'PATCH',
        CURLOPT_POSTFIELDS => $body,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 30,
        CURLOPT_HTTPHEADER => [
            'Authorization: Bearer ' . $accessToken,
            'Content-Type: application/json',
        ],
    ]);
    if (defined('CURLSSLOPT_NATIVE_CA')) {
        curl_setopt($ch, CURLOPT_SSL_OPTIONS, CURLSSLOPT_NATIVE_CA);
    }
    $response = curl_exec($ch);
    $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    $error = curl_error($ch);
    if ($response === false || $status < 200 || $status >= 300) {
        throw new RuntimeException(
            'Google Drive-bestand herstellen mislukt: '
            . ($error !== '' ? $error : scouts_google_error_message((string) $response, $status))
        );
    }
}

/**
 * Resolve a stored Drive file id to a writable target in the planning folder.
 * Returns null when the id is gone (permanent delete) so callers can create again.
 */
function scouts_google_drive_prepare_planning_file_id(
    string $accessToken,
    string $fileId,
    string $folderId,
): ?string {
    $meta = scouts_google_drive_get_file($accessToken, $fileId);
    if ($meta === null) {
        return null;
    }
    if (scouts_google_drive_file_usable_in_folder($meta, $folderId)) {
        return $meta['id'];
    }
    try {
        scouts_google_drive_restore_file_in_folder(
            $accessToken,
            $meta['id'],
            $folderId,
            $meta['parents']
        );
    } catch (Throwable $error) {
        error_log('Google Drive planning restore mislukt: ' . $error->getMessage());
        return null;
    }
    return $meta['id'];
}

/**
 * @return list<array{id: string, name: string, modifiedTime?: string}>
 */
function scouts_google_drive_find_files_by_name(
    string $accessToken,
    string $folderId,
    string $filename,
): array {
    $escapedName = scouts_google_drive_escape_query_value($filename);
    $escapedFolder = scouts_google_drive_escape_query_value($folderId);
    $q = "name = '{$escapedName}' and '{$escapedFolder}' in parents and trashed = false";
    $url = 'https://www.googleapis.com/drive/v3/files?' . http_build_query([
        'q' => $q,
        'spaces' => 'drive',
        'fields' => 'files(id,name,modifiedTime)',
        'pageSize' => 10,
        'orderBy' => 'modifiedTime desc',
        'supportsAllDrives' => 'true',
        'includeItemsFromAllDrives' => 'true',
        'corpora' => 'allDrives',
    ]);

    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 30,
        CURLOPT_HTTPHEADER => ['Authorization: Bearer ' . $accessToken],
    ]);
    if (defined('CURLSSLOPT_NATIVE_CA')) {
        curl_setopt($ch, CURLOPT_SSL_OPTIONS, CURLSSLOPT_NATIVE_CA);
    }
    $response = curl_exec($ch);
    $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    $error = curl_error($ch);
    if ($response === false || $status < 200 || $status >= 300) {
        throw new RuntimeException(
            'Google Drive-bestand zoeken mislukt: '
            . ($error !== '' ? $error : scouts_google_error_message((string) $response, $status))
        );
    }
    $payload = json_decode($response, true);
    $files = is_array($payload) && is_array($payload['files'] ?? null) ? $payload['files'] : [];
    $out = [];
    foreach ($files as $file) {
        if (!is_array($file) || !is_string($file['id'] ?? null) || trim($file['id']) === '') {
            continue;
        }
        $out[] = [
            'id' => trim($file['id']),
            'name' => is_string($file['name'] ?? null) ? $file['name'] : $filename,
            'modifiedTime' => is_string($file['modifiedTime'] ?? null) ? $file['modifiedTime'] : '',
        ];
    }
    return $out;
}

function scouts_google_drive_update_file_media(
    string $accessToken,
    string $fileId,
    string $contents,
): void {
    $url = 'https://www.googleapis.com/upload/drive/v3/files/'
        . rawurlencode($fileId)
        . '?uploadType=media&supportsAllDrives=true';
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_CUSTOMREQUEST => 'PATCH',
        CURLOPT_POSTFIELDS => $contents,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 60,
        CURLOPT_HTTPHEADER => [
            'Authorization: Bearer ' . $accessToken,
            'Content-Type: application/pdf',
            'Content-Length: ' . (string) strlen($contents),
        ],
    ]);
    if (defined('CURLSSLOPT_NATIVE_CA')) {
        curl_setopt($ch, CURLOPT_SSL_OPTIONS, CURLSSLOPT_NATIVE_CA);
    }
    $response = curl_exec($ch);
    $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    $error = curl_error($ch);
    if ($response === false || $status < 200 || $status >= 300) {
        throw new RuntimeException(
            'Google Drive-bestand bijwerken mislukt: '
            . ($error !== '' ? $error : scouts_google_error_message((string) $response, $status))
        );
    }
}

/**
 * Create a new Drive file (multipart metadata + media).
 *
 * @return string Drive file id
 */
function scouts_google_drive_create_file(
    string $accessToken,
    string $folderId,
    string $filename,
    string $contents,
): string {
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
            'Authorization: Bearer ' . $accessToken,
            'Content-Type: multipart/related; boundary=' . $boundary,
        ],
    ]);
    if (defined('CURLSSLOPT_NATIVE_CA')) {
        curl_setopt($ch, CURLOPT_SSL_OPTIONS, CURLSSLOPT_NATIVE_CA);
    }
    $response = curl_exec($ch);
    $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    $error = curl_error($ch);
    if ($response === false || $status < 200 || $status >= 300) {
        throw new RuntimeException(
            'PDF kon niet naar Google Drive worden geupload: '
            . ($error !== '' ? $error : scouts_google_error_message((string) $response, $status))
        );
    }
    $payload = json_decode((string) $response, true);
    $fileId = is_array($payload) && is_string($payload['id'] ?? null) ? trim($payload['id']) : '';
    if ($fileId === '') {
        throw new RuntimeException('Google Drive gaf geen bestands-ID terug na upload.');
    }
    return $fileId;
}

/**
 * Decide whether to update an existing Drive file or create a new one.
 *
 * @param array<string, string> $knownIds planningKey => file id
 * @param list<array{id: string}> $foundFiles search hits (newest first)
 * @return array{action: 'update'|'create', fileId: string}
 */
function scouts_google_drive_resolve_planning_upsert(
    string $planningKey,
    array $knownIds,
    array $foundFiles,
): array {
    $planningKey = strtolower(trim($planningKey));
    $known = trim((string) ($knownIds[$planningKey] ?? ''));
    if ($known !== '') {
        return ['action' => 'update', 'fileId' => $known];
    }
    foreach ($foundFiles as $file) {
        $id = is_array($file) && is_string($file['id'] ?? null) ? trim($file['id']) : '';
        if ($id !== '') {
            return ['action' => 'update', 'fileId' => $id];
        }
    }
    return ['action' => 'create', 'fileId' => ''];
}

/**
 * Upload or replace a planning PDF in the configured Drive folder.
 * Identity is {tak}_{maanden}_{jaar}: same period overwrites; a new month creates a file.
 *
 * @return array{fileId: string, updated: bool, filename: string}
 */
function scouts_google_drive_upload_planning(
    string $filePath,
    string $branch,
    string $title,
    ?int $year = null,
): array {
    $credentials = scouts_google_drive_credentials();
    $folderId = scouts_google_drive_folder_id();
    if ($folderId === '' || (scouts_google_oauth_client() === null && $credentials === null)) {
        throw new RuntimeException('Google Drive is niet geconfigureerd.');
    }
    if (!function_exists('curl_init') || !function_exists('openssl_sign')) {
        throw new RuntimeException('PHP cURL en OpenSSL zijn vereist voor Google Drive.');
    }

    $branch = strtolower(trim($branch));
    // Scout season Sep–Aug: januari in december → next calendar year.
    $year = $year ?? scouts_google_drive_planning_year($title);
    $filename = scouts_google_drive_planning_filename($branch, $title, $year);
    $planningKey = scouts_google_drive_planning_id_key($branch, $title, $year);
    $contents = file_get_contents($filePath);
    if ($contents === false) {
        throw new RuntimeException('PDF kon niet voor Google Drive worden gelezen.');
    }

    $accessToken = scouts_google_drive_access_token($credentials);
    $knownIds = scouts_google_drive_planning_file_ids();
    $decision = scouts_google_drive_resolve_planning_upsert($planningKey, $knownIds, []);

    if ($decision['action'] === 'update' && $decision['fileId'] !== '') {
        try {
            // Trashed IDs still accept media PATCH — restore/verify first so the
            // file reappears in the folder after a manual Drive delete.
            $readyId = scouts_google_drive_prepare_planning_file_id(
                $accessToken,
                $decision['fileId'],
                $folderId
            );
            if ($readyId === null) {
                scouts_google_drive_forget_planning_file_id($planningKey);
            } else {
                scouts_google_drive_update_file_media($accessToken, $readyId, $contents);
                scouts_google_drive_remember_planning_file_id($planningKey, $readyId);
                return ['fileId' => $readyId, 'updated' => true, 'filename' => $filename];
            }
        } catch (Throwable $error) {
            // Stale id (deleted/moved) — fall through to folder lookup/create.
            scouts_google_drive_forget_planning_file_id($planningKey);
            error_log('Google Drive planning update via opgeslagen ID mislukt: ' . $error->getMessage());
        }
    }

    $matches = scouts_google_drive_find_files_by_name($accessToken, $folderId, $filename);
    $decision = scouts_google_drive_resolve_planning_upsert($planningKey, [], $matches);
    if ($decision['action'] === 'update' && $decision['fileId'] !== '') {
        $readyId = scouts_google_drive_prepare_planning_file_id(
            $accessToken,
            $decision['fileId'],
            $folderId
        );
        if ($readyId !== null) {
            scouts_google_drive_update_file_media($accessToken, $readyId, $contents);
            scouts_google_drive_remember_planning_file_id($planningKey, $readyId);
            return ['fileId' => $readyId, 'updated' => true, 'filename' => $filename];
        }
    }

    $fileId = scouts_google_drive_create_file($accessToken, $folderId, $filename, $contents);
    scouts_google_drive_remember_planning_file_id($planningKey, $fileId);
    return ['fileId' => $fileId, 'updated' => false, 'filename' => $filename];
}

/**
 * @deprecated Use scouts_google_drive_upload_planning() for maandplanningen.
 * Kept for any unexpected callers; always creates a new Drive file.
 */
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
    $accessToken = scouts_google_drive_access_token($credentials);
    scouts_google_drive_create_file($accessToken, $folderId, $filename, $contents);
}