<?php
declare(strict_types=1);

require_once dirname(__DIR__) . DIRECTORY_SEPARATOR . 'config.php';
require_once dirname(__DIR__) . DIRECTORY_SEPARATOR . 'google-drive.php';
ini_set('display_errors', '0');

$route = trim((string) ($_GET['route'] ?? ''), '/');
$method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');

try {
    if ($route === 'site-data' && $method === 'GET') {
        $modifiedAt = filemtime(SCOUTS_DATA_FILE);
        $fileSize = filesize(SCOUTS_DATA_FILE);
        if ($modifiedAt === false || $fileSize === false) {
            throw new RuntimeException('Datastorebestand kan niet worden gelezen.');
        }

        $etag = '"' . sha1($modifiedAt . ':' . $fileSize) . '"';
        header('Content-Type: application/json; charset=utf-8');
        header('Cache-Control: no-cache, must-revalidate');
        header('ETag: ' . $etag);
        header('Last-Modified: ' . gmdate('D, d M Y H:i:s', $modifiedAt) . ' GMT');

        $clientEtags = array_map(
            static fn (string $value): string => trim($value, " \t\"") ,
            explode(',', (string) ($_SERVER['HTTP_IF_NONE_MATCH'] ?? ''))
        );
        if (in_array(trim($etag, '"'), $clientEtags, true)) {
            http_response_code(304);
            exit;
        }

        $json = json_encode(
            scouts_read_site_data(),
            JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES
        );
        if ($json === false) {
            throw new RuntimeException('Sitegegevens konden niet worden gecodeerd.');
        }
        header('Content-Length: ' . strlen($json));
        echo $json;
        exit;
    }

    scouts_start_session();

    if ($route === 'session' && $method === 'GET') {
        scouts_json_response(['authenticated' => scouts_session_is_admin()]);
    }

    if ($route === 'google-drive/settings/unlock' && $method === 'POST') {
        scouts_require_admin();
        scouts_require_same_origin();
        $passwordHash = scouts_google_settings_password_hash();
        $password = (string) (scouts_request_json()['password'] ?? '');
        if ($passwordHash === '') {
            scouts_json_response(['message' => 'Speciaal instellingenwachtwoord is nog niet ingesteld.'], 503);
        }
        if ($password === '' || !password_verify($password, $passwordHash)) {
            scouts_json_response(['message' => 'Onjuist instellingenwachtwoord.'], 403);
        }
        $_SESSION['google_settings_unlocked_until'] = time() + 900;
        scouts_json_response(['success' => true]);
    }

    if ($route === 'google-drive/settings' && $method === 'GET') {
        scouts_require_google_settings_access();
        $settings = scouts_read_google_drive_settings();
        $credentials = scouts_google_drive_credentials();
        scouts_json_response([
            'folderId' => (string) ($settings['folderId'] ?? scouts_env('SCOUTS_GOOGLE_DRIVE_FOLDER_ID', '')),
            'serviceAccountConfigured' => $credentials !== null,
            'serviceAccountEmail' => (string) ($credentials['client_email'] ?? ''),
            'oauthConfigured' => ($oauth = scouts_google_oauth_data()) !== null && isset($oauth['refresh_token']),
            'oauthEmail' => (string) (($oauth['email'] ?? '') ?: ''),
        ]);
    }

    if ($route === 'google-drive/settings' && $method === 'POST') {
        scouts_require_google_settings_access();
        scouts_require_same_origin();
        $body = scouts_request_json();
        $folderId = trim((string) ($body['folderId'] ?? ''));
        if ($folderId !== '' && !preg_match('/^[a-zA-Z0-9_-]{10,}$/', $folderId)) {
            scouts_json_response(['message' => 'Ongeldige Google Drive-map-ID.'], 400);
        }
        scouts_write_google_drive_settings(['folderId' => $folderId]);
        scouts_json_response(['success' => true]);
    }

    if ($route === 'google-drive/credentials' && $method === 'POST') {
        scouts_require_google_settings_access();
        scouts_require_same_origin();
        if (!isset($_FILES['credentials'])) {
            scouts_json_response(['message' => 'Selecteer eerst het Google JSON-bestand.'], 400);
        }
        $file = $_FILES['credentials'];
        if (($file['error'] ?? UPLOAD_ERR_OK) !== UPLOAD_ERR_OK || (int) $file['size'] > 256 * 1024) {
            scouts_json_response(['message' => 'Het Google JSON-bestand is ongeldig of groter dan 256 KB.'], 400);
        }
        $credentials = json_decode((string) file_get_contents($file['tmp_name']), true);
        if (!is_array($credentials)
            || ($credentials['type'] ?? '') !== 'service_account'
            || !is_string($credentials['client_email'] ?? null)
            || !is_string($credentials['private_key'] ?? null)
            || !str_contains($credentials['private_key'], 'BEGIN PRIVATE KEY')) {
            scouts_json_response(['message' => 'Dit is geen geldig Google service-account JSON-bestand.'], 400);
        }
        scouts_write_google_drive_credentials($credentials);
        scouts_json_response(['success' => true, 'email' => $credentials['client_email']]);
    }

    if ($route === 'google-drive/oauth-reset' && $method === 'POST') {
        scouts_require_google_settings_access();
        scouts_require_same_origin();
        scouts_write_google_oauth([]);
        scouts_json_response(['success' => true]);
    }

    if ($route === 'google-drive/oauth-client' && $method === 'POST') {
        scouts_require_google_settings_access();
        scouts_require_same_origin();
        if (!isset($_FILES['client'])) {
            scouts_json_response(['message' => 'Selecteer eerst het Google OAuth-clientbestand.'], 400);
        }
        $clientFile = $_FILES['client'];
        $clientJson = json_decode((string) file_get_contents($clientFile['tmp_name']), true);
        $client = is_array($clientJson) ? ($clientJson['web'] ?? $clientJson['installed'] ?? $clientJson) : null;
        if (!is_array($client)
            || !is_string($client['client_id'] ?? null)
            || !is_string($client['client_secret'] ?? null)
            || !is_string(($client['redirect_uris'][0] ?? null))) {
            scouts_json_response(['message' => 'Dit is geen geldig Google OAuth-clientbestand.'], 400);
        }
        scouts_write_google_oauth([
            'client_id' => $client['client_id'],
            'client_secret' => $client['client_secret'],
            'redirect_uri' => $client['redirect_uris'][0],
        ]);
        scouts_json_response(['success' => true]);
    }

    if ($route === 'google-drive/oauth/start' && $method === 'GET') {
        scouts_require_google_settings_access();
        $client = scouts_google_oauth_client();
        if ($client === null) {
            scouts_json_response(['message' => 'Upload eerst een Google OAuth-clientbestand.'], 400);
        }
        $state = bin2hex(random_bytes(24));
        $_SESSION['google_oauth_state'] = $state;
        $query = http_build_query([
            'client_id' => $client['client_id'],
            'redirect_uri' => scouts_google_oauth_redirect_uri(),
            'response_type' => 'code',
            'scope' => 'https://www.googleapis.com/auth/drive.file',
            'access_type' => 'offline',
            'prompt' => 'consent',
            'state' => $state,
        ]);
        scouts_json_response(['url' => 'https://accounts.google.com/o/oauth2/v2/auth?' . $query]);
    }

    if ($route === 'google-drive/oauth/callback' && $method === 'GET') {
        scouts_require_google_settings_access();
        $state = (string) ($_GET['state'] ?? '');
        $code = (string) ($_GET['code'] ?? '');
        if ($state === '' || !hash_equals((string) ($_SESSION['google_oauth_state'] ?? ''), $state) || $code === '') {
            throw new RuntimeException('Ongeldige Google OAuth-callback.');
        }
        unset($_SESSION['google_oauth_state']);
        $client = scouts_google_oauth_client();
        if ($client === null) {
            throw new RuntimeException('Google OAuth-client ontbreekt.');
        }
        $ch = curl_init('https://oauth2.googleapis.com/token');
        curl_setopt_array($ch, [
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => http_build_query([
                'code' => $code,
                'client_id' => $client['client_id'],
                'client_secret' => $client['client_secret'],
                'redirect_uri' => scouts_google_oauth_redirect_uri(),
                'grant_type' => 'authorization_code',
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
            throw new RuntimeException('Google OAuth-koppeling mislukt: ' . ($error !== '' ? $error : scouts_google_error_message((string) $response, $status)));
        }
        $token = json_decode($response, true);
        if (!is_array($token) || !is_string($token['refresh_token'] ?? null)) {
            throw new RuntimeException('Google gaf geen refresh-token terug.');
        }
        $client['refresh_token'] = $token['refresh_token'];
        $client['email'] = 'Google-account gekoppeld';
        scouts_write_google_oauth($client);
        header('Location: /admin?google=connected');
        exit;
    }

    if ($route === 'login' && $method === 'POST') {
        scouts_require_same_origin();
        $body = scouts_request_json();
        $username = trim((string) ($body['username'] ?? ''));
        $password = (string) ($body['password'] ?? '');
        if ($username === '' || $password === '') {
            scouts_json_response(['message' => 'Vul zowel gebruikersnaam als wachtwoord in.'], 400);
        }
        if (scouts_admin_username() === '' || scouts_admin_password_hash() === '') {
            error_log('Scouts admin credentials are not configured.');
            scouts_json_response(['message' => 'Beheerlogin is niet geconfigureerd.'], 500);
        }
        if (!hash_equals(scouts_admin_username(), $username) || !password_verify($password, scouts_admin_password_hash())) {
            scouts_json_response(['message' => 'Ongeldige gebruikersnaam of wachtwoord.'], 401);
        }
        session_regenerate_id(true);
        $_SESSION['user'] = ['username' => scouts_admin_username()];
        scouts_json_response(['success' => true, 'redirectTo' => '/admin']);
    }

    if ($route === 'logout' && $method === 'POST') {
        scouts_require_admin();
        scouts_require_same_origin();
        $_SESSION = [];
        if (ini_get('session.use_cookies')) {
            $params = session_get_cookie_params();
            setcookie(session_name(), '', time() - 42000, $params['path'], '', (bool) $params['secure'], (bool) $params['httponly']);
        }
        session_destroy();
        scouts_json_response(['success' => true, 'redirectTo' => '/login']);
    }

    if ($route === 'site-data' && $method === 'POST') {
        scouts_require_admin();
        scouts_require_same_origin();
        $data = scouts_request_json();
        if ($data === []) {
            scouts_json_response(['message' => 'Ongeldige of lege sitegegevens.'], 400);
        }
        scouts_write_site_data($data);
        scouts_json_response(['success' => true]);
    }

    if ($route === 'site-data/reset' && $method === 'POST') {
        scouts_require_admin();
        scouts_require_same_origin();
        scouts_write_site_data(scouts_decode_json_file(SCOUTS_DEFAULT_DATA_FILE));
        scouts_json_response(['success' => true]);
    }

    if ($route === 'uploads/photo' && $method === 'POST') {
        scouts_require_admin();
        scouts_require_same_origin();
        if (!isset($_FILES['photo'])) {
            scouts_json_response(['message' => 'Geen foto ontvangen.'], 400);
        }
        $file = $_FILES['photo'];
        if (($file['error'] ?? UPLOAD_ERR_OK) !== UPLOAD_ERR_OK) {
            $tooLarge = in_array($file['error'], [UPLOAD_ERR_INI_SIZE, UPLOAD_ERR_FORM_SIZE], true);
            scouts_json_response(['message' => $tooLarge ? 'De foto is te groot. Maximum 20 MB.' : 'De foto kon niet worden geupload.'], $tooLarge ? 413 : 400);
        }
        if (!is_uploaded_file($file['tmp_name'])) {
            scouts_json_response(['message' => 'Geen geldige foto-upload ontvangen.'], 400);
        }
        if ((int) $file['size'] > SCOUTS_MAX_UPLOAD_BYTES) {
            scouts_json_response(['message' => 'De foto is te groot. Maximum 20 MB.'], 413);
        }
        $filename = strtolower(trim((string) ($_POST['filename'] ?? '')));
        if (!scouts_allowed_photo_name($filename)) {
            scouts_json_response(['message' => 'Ongeldige bestandsnaam.'], 400);
        }
        $allowedMimes = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp', 'image/gif' => 'gif'];
        $imageInfo = @getimagesize($file['tmp_name']);
        $mime = is_array($imageInfo) ? (string) ($imageInfo['mime'] ?? '') : '';
        if (function_exists('finfo_open')) {
            $fileInfo = finfo_open(FILEINFO_MIME_TYPE);
            if ($fileInfo !== false) {
                $detectedMime = finfo_file($fileInfo, $file['tmp_name']);
                finfo_close($fileInfo);
                if (is_string($detectedMime) && $detectedMime !== '') {
                    $mime = $detectedMime;
                }
            }
        }
        if (!isset($allowedMimes[$mime]) || !is_array($imageInfo)) {
            scouts_json_response(['message' => 'Ongeldig afbeeldingsbestand. Gebruik JPG, PNG, WEBP of GIF.'], 400);
        }
        if (!is_dir(SCOUTS_UPLOADS_DIR) && !mkdir(SCOUTS_UPLOADS_DIR, 0755, true)) {
            throw new RuntimeException('Uploadmap kon niet worden aangemaakt.');
        }

        $extension = 'jpg';
        $tempFile = tempnam(SCOUTS_UPLOADS_DIR, $filename . '-');
        if ($tempFile === false) {
            throw new RuntimeException('Tijdelijk uploadbestand kon niet worden aangemaakt.');
        }
        $finalPath = SCOUTS_UPLOADS_DIR . DIRECTORY_SEPARATOR . $filename . '.' . $extension;
        try {
            $gdAvailable = function_exists('imagejpeg') && function_exists('imagecreatefromstring');
            if ($gdAvailable) {
                $image = @imagecreatefromstring((string) file_get_contents($file['tmp_name']));
                if ($image === false || !imagejpeg($image, $tempFile, 92)) {
                    throw new RuntimeException('Afbeelding kon niet worden verwerkt.');
                }
                imagedestroy($image);
            } else {
                $extension = $allowedMimes[$mime];
                $finalPath = SCOUTS_UPLOADS_DIR . DIRECTORY_SEPARATOR . $filename . '.' . $extension;
                if (!copy($file['tmp_name'], $tempFile)) {
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
                $oldPath = SCOUTS_UPLOADS_DIR . DIRECTORY_SEPARATOR . $filename . '.' . $oldExtension;
                if ($oldPath !== $finalPath && is_file($oldPath)) {
                    @unlink($oldPath);
                }
            }
        } finally {
            if (is_file($tempFile)) {
                @unlink($tempFile);
            }
        }
        scouts_json_response(['success' => true, 'path' => '/uploads/' . basename($finalPath) . '?v=' . time()]);
    }

    if ($route === 'uploads/planning' && $method === 'POST') {
        scouts_require_admin();
        scouts_require_same_origin();
        if (!isset($_FILES['planning'])) {
            scouts_json_response(['message' => 'Geen PDF ontvangen.'], 400);
        }

        $file = $_FILES['planning'];
        if (($file['error'] ?? UPLOAD_ERR_OK) !== UPLOAD_ERR_OK) {
            $tooLarge = in_array($file['error'], [UPLOAD_ERR_INI_SIZE, UPLOAD_ERR_FORM_SIZE], true);
            scouts_json_response(['message' => $tooLarge ? 'De PDF is te groot. Maximum 20 MB.' : 'De PDF kon niet worden geupload.'], $tooLarge ? 413 : 400);
        }
        if (!is_uploaded_file($file['tmp_name'])) {
            scouts_json_response(['message' => 'Geen geldige PDF-upload ontvangen.'], 400);
        }
        if ((int) $file['size'] > SCOUTS_MAX_PDF_UPLOAD_BYTES) {
            scouts_json_response(['message' => 'De PDF is te groot. Maximum 20 MB.'], 413);
        }

        $branch = strtolower(trim((string) ($_POST['branch'] ?? '')));
        $allowedBranches = ['kapoenen', 'welpen', 'jongverkenners', 'verkenners', 'jins'];
        if (!in_array($branch, $allowedBranches, true)) {
            scouts_json_response(['message' => 'Ongeldige tak.'], 400);
        }

        $mime = '';
        if (function_exists('finfo_open')) {
            $fileInfo = finfo_open(FILEINFO_MIME_TYPE);
            if ($fileInfo !== false) {
                $mime = (string) finfo_file($fileInfo, $file['tmp_name']);
                finfo_close($fileInfo);
            }
        }
        $header = file_get_contents($file['tmp_name'], false, null, 0, 5);
        if (($mime !== '' && $mime !== 'application/pdf') || $header !== '%PDF-') {
            scouts_json_response(['message' => 'Ongeldig PDF-bestand.'], 400);
        }

        if (!is_dir(SCOUTS_UPLOADS_DIR) && !mkdir(SCOUTS_UPLOADS_DIR, 0755, true)) {
            throw new RuntimeException('Uploadmap kon niet worden aangemaakt.');
        }

        $filename = 'maandplanning-' . $branch . '.pdf';
        $finalPath = SCOUTS_UPLOADS_DIR . DIRECTORY_SEPARATOR . $filename;
        $tempFile = tempnam(SCOUTS_UPLOADS_DIR, 'planning-');
        if ($tempFile === false || !move_uploaded_file($file['tmp_name'], $tempFile)) {
            throw new RuntimeException('PDF kon niet tijdelijk worden opgeslagen.');
        }
        if (is_file($finalPath) && !unlink($finalPath)) {
            @unlink($tempFile);
            throw new RuntimeException('Bestaande maandplanning kon niet worden vervangen.');
        }
        if (!rename($tempFile, $finalPath) || !chmod($finalPath, 0644)) {
            @unlink($tempFile);
            throw new RuntimeException('Maandplanning kon niet definitief worden opgeslagen.');
        }

        $planningTitle = trim((string) ($_POST['title'] ?? ''));
        $driveUploaded = false;
        $driveError = false;
        $driveErrorMessage = '';
        if (scouts_google_drive_is_configured()) {
            $titlePart = preg_replace('/\.pdf$/i', '', $planningTitle);
            $titlePart = preg_replace('/[^a-zA-Z0-9]+/', '_', (string) $titlePart);
            $titlePart = trim(strtolower((string) $titlePart), '_');
            $titlePart = $titlePart !== '' ? $titlePart : 'planning';
            $driveFilename = $branch . '_' . $titlePart . '_' . date('Y') . '.pdf';
            try {
                scouts_google_drive_upload($finalPath, $driveFilename);
                $driveUploaded = true;
            } catch (Throwable $error) {
                $driveError = true;
                $driveErrorMessage = $error->getMessage();
                error_log('Google Drive maandplanning upload mislukt: ' . $driveErrorMessage);
            }
        }

        scouts_json_response([
            'success' => true,
            'driveUploaded' => $driveUploaded,
            'driveError' => $driveError,
            'driveErrorMessage' => $driveErrorMessage,
            'path' => '/uploads/' . $filename . '?v=' . time(),
        ]);
    }

    if ($route === 'uploads/letter' && $method === 'POST') {
        scouts_require_admin();
        scouts_require_same_origin();
        if (!isset($_FILES['letter'])) {
            scouts_json_response(['message' => 'Geen brief ontvangen.'], 400);
        }

        $file = $_FILES['letter'];
        if (($file['error'] ?? UPLOAD_ERR_OK) !== UPLOAD_ERR_OK) {
            $tooLarge = in_array($file['error'], [UPLOAD_ERR_INI_SIZE, UPLOAD_ERR_FORM_SIZE], true);
            scouts_json_response(['message' => $tooLarge ? 'De brief is te groot. Maximum 20 MB.' : 'De brief kon niet worden geupload.'], $tooLarge ? 413 : 400);
        }
        if (!is_uploaded_file($file['tmp_name']) || (int) $file['size'] > SCOUTS_MAX_PDF_UPLOAD_BYTES) {
            scouts_json_response(['message' => 'Ongeldige brief of bestand te groot. Gebruik een PDF van maximaal 20 MB.'], 400);
        }

        $branch = strtolower(trim((string) ($_POST['branch'] ?? '')));
        $allowedBranches = ['kapoenen', 'welpen', 'jongverkenners', 'verkenners', 'jins'];
        if (!in_array($branch, $allowedBranches, true)) {
            scouts_json_response(['message' => 'Ongeldige tak.'], 400);
        }

        $mime = '';
        if (function_exists('finfo_open')) {
            $fileInfo = finfo_open(FILEINFO_MIME_TYPE);
            if ($fileInfo !== false) {
                $mime = (string) finfo_file($fileInfo, $file['tmp_name']);
                finfo_close($fileInfo);
            }
        }
        $header = file_get_contents($file['tmp_name'], false, null, 0, 5);
        if (($mime !== '' && $mime !== 'application/pdf') || $header !== '%PDF-') {
            scouts_json_response(['message' => 'Ongeldig PDF-bestand.'], 400);
        }

        if (!is_dir(SCOUTS_UPLOADS_DIR) && !mkdir(SCOUTS_UPLOADS_DIR, 0755, true)) {
            throw new RuntimeException('Uploadmap kon niet worden aangemaakt.');
        }

        $filename = 'brief-' . $branch . '-' . bin2hex(random_bytes(8)) . '.pdf';
        $finalPath = SCOUTS_UPLOADS_DIR . DIRECTORY_SEPARATOR . $filename;
        if (!move_uploaded_file($file['tmp_name'], $finalPath) || !chmod($finalPath, 0644)) {
            throw new RuntimeException('Brief kon niet worden opgeslagen.');
        }

        scouts_json_response(['success' => true, 'path' => '/uploads/' . $filename . '?v=' . time()]);
    }

    if (preg_match('#^uploads/photo/([^/]+)$#', $route, $matches) && $method === 'DELETE') {
        scouts_require_admin();
        scouts_require_same_origin();
        scouts_delete_photo_versions(strtolower(rawurldecode($matches[1])));
        scouts_json_response(['success' => true]);
    }

    if (preg_match('#^uploads/document/([^/]+)$#', $route, $matches) && $method === 'DELETE') {
        scouts_require_admin();
        scouts_require_same_origin();
        $filename = basename(rawurldecode($matches[1]));
        if ($filename !== $matches[1] || !str_ends_with(strtolower($filename), '.pdf')) {
            scouts_json_response(['message' => 'Ongeldige documentnaam.'], 400);
        }
        $path = SCOUTS_UPLOADS_DIR . DIRECTORY_SEPARATOR . $filename;
        if (is_file($path) && !unlink($path)) {
            scouts_json_response(['message' => 'Document kon niet worden verwijderd.'], 500);
        }
        scouts_json_response(['success' => true]);
    }

    scouts_json_response(['message' => 'Not found'], 404);
} catch (JsonException | InvalidArgumentException $error) {
    scouts_json_response(['message' => 'Ongeldige gegevens.'], 400);
} catch (Throwable $error) {
    error_log('Scouts API error: ' . $error->getMessage());
    scouts_json_response(['message' => 'Er is een interne serverfout opgetreden.'], 500);
}