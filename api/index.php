<?php
declare(strict_types=1);

require_once dirname(__DIR__) . DIRECTORY_SEPARATOR . 'config.php';
ini_set('display_errors', '0');

$route = trim((string) ($_GET['route'] ?? ''), '/');
$method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');

try {
    // Fast path: public/admin site-data without loading Google Drive helpers.
    if ($route === 'site-data' && ($method === 'GET' || $method === 'HEAD')) {
        $modifiedAt = filemtime(SCOUTS_DATA_FILE);
        if ($modifiedAt === false) {
            throw new RuntimeException('Datastorebestand kan niet worden gelezen.');
        }

        // Only open a session when a cookie already exists (admins).
        // Anonymous visitors skip session I/O and Set-Cookie overhead.
        $isAdmin = false;
        if (!empty($_COOKIE['scouts_session'])) {
            scouts_start_session();
            $isAdmin = scouts_session_is_admin();
        }

        $version = scouts_site_data_version();
        $bundle = null;
        $json = null;

        // ETag must match exactly what we emit (public bundle uses format suffix).
        if ($isAdmin) {
            $etagToken = $version . '-a';
            $data = scouts_read_site_data();
            $json = json_encode(
                $data,
                JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES
            );
            if ($json === false) {
                throw new RuntimeException('Sitegegevens konden niet worden gecodeerd.');
            }
        } else {
            $bundle = scouts_public_site_data_bundle();
            $json = $bundle['json'];
            $etagToken = trim((string) $bundle['etag'], " \t\"");
            $version = $bundle['version'];
        }
        $etag = '"' . $etagToken . '"';

        header('Content-Type: application/json; charset=utf-8');
        if ($isAdmin) {
            header('Cache-Control: private, no-store');
        } else {
            // Short public cache + SWR; ETag still validates after expiry.
            header('Cache-Control: public, max-age=300, stale-while-revalidate=600');
        }
        header('ETag: ' . $etag);
        header('X-Scouts-Data-Version: ' . $version);
        header('Vary: Cookie');
        header('Last-Modified: ' . gmdate('D, d M Y H:i:s', $modifiedAt) . ' GMT');

        $clientEtags = array_map(
            static fn (string $value): string => trim($value, " \t\""),
            explode(',', (string) ($_SERVER['HTTP_IF_NONE_MATCH'] ?? ''))
        );
        if (in_array($etagToken, $clientEtags, true)) {
            http_response_code(304);
            exit;
        }

        $ifModifiedSince = strtotime((string) ($_SERVER['HTTP_IF_MODIFIED_SINCE'] ?? ''));
        if (
            $ifModifiedSince !== false
            && $ifModifiedSince >= $modifiedAt
            && ($_SERVER['HTTP_IF_NONE_MATCH'] ?? '') === ''
        ) {
            http_response_code(304);
            exit;
        }

        header('Content-Length: ' . strlen($json));
        if ($method === 'HEAD') {
            exit;
        }
        echo $json;
        exit;
    }

    require_once dirname(__DIR__) . DIRECTORY_SEPARATOR . 'google-drive.php';
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
        $backupFolderId = trim((string) ($settings['backupFolderId'] ?? ''));
        if ($backupFolderId === '') {
            $backupFolderId = trim((string) scouts_env(
                'SCOUTS_GOOGLE_DRIVE_BACKUP_FOLDER_ID',
                SCOUTS_GOOGLE_DRIVE_BACKUP_FOLDER_ID_DEFAULT
            ));
        }
        scouts_json_response([
            'folderId' => (string) ($settings['folderId'] ?? scouts_env('SCOUTS_GOOGLE_DRIVE_FOLDER_ID', '')),
            'backupFolderId' => $backupFolderId,
            'serviceAccountConfigured' => $credentials !== null,
            'serviceAccountEmail' => (string) ($credentials['client_email'] ?? ''),
            'oauthConfigured' => ($oauth = scouts_google_oauth_data()) !== null && !empty($oauth['refresh_token']),
            'oauthClientConfigured' => scouts_google_oauth_client() !== null,
            'oauthEmail' => (string) (($oauth['email'] ?? '') ?: ''),
            'redirectUri' => scouts_google_oauth_redirect_uri(),
            'authorizedRedirectUris' => scouts_google_oauth_authorized_redirect_uris(),
        ]);
    }

    if ($route === 'google-drive/settings' && $method === 'POST') {
        scouts_require_google_settings_access();
        scouts_require_same_origin();
        $body = scouts_request_json();
        $folderId = trim((string) ($body['folderId'] ?? ''));
        $backupFolderId = trim((string) ($body['backupFolderId'] ?? ''));
        if ($folderId !== '' && !preg_match('/^[a-zA-Z0-9_-]{10,}$/', $folderId)) {
            scouts_json_response(['message' => 'Ongeldige map-ID voor maandplanningen.'], 400);
        }
        if ($backupFolderId !== '' && !preg_match('/^[a-zA-Z0-9_-]{10,}$/', $backupFolderId)) {
            scouts_json_response(['message' => 'Ongeldige map-ID voor backups.'], 400);
        }
        $settings = scouts_read_google_drive_settings();
        $previousFolder = trim((string) ($settings['folderId'] ?? ''));
        $settings['folderId'] = $folderId;
        $settings['backupFolderId'] = $backupFolderId;
        // Folder change invalidates cached planning file IDs (they belong to the old folder).
        if ($previousFolder !== $folderId) {
            unset($settings['planningFileIds']);
        }
        scouts_write_google_drive_settings($settings);
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
        if (!is_uploaded_file($file['tmp_name'])) {
            scouts_json_response(['message' => 'Geen geldige credentials-upload ontvangen.'], 400);
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
        $existing = scouts_google_oauth_data() ?? [];
        $kept = [];
        foreach (['client_id', 'client_secret', 'redirect_uri', 'redirect_uris'] as $key) {
            if (array_key_exists($key, $existing)) {
                $kept[$key] = $existing[$key];
            }
        }
        scouts_write_google_oauth($kept);
        scouts_json_response(['success' => true]);
    }

    if ($route === 'google-drive/oauth-client' && $method === 'POST') {
        scouts_require_google_settings_access();
        scouts_require_same_origin();
        if (!isset($_FILES['client'])) {
            scouts_json_response(['message' => 'Selecteer eerst het Google OAuth-clientbestand.'], 400);
        }
        $clientFile = $_FILES['client'];
        if (($clientFile['error'] ?? UPLOAD_ERR_OK) !== UPLOAD_ERR_OK || (int) $clientFile['size'] > 256 * 1024) {
            scouts_json_response(['message' => 'Het Google OAuth-clientbestand is ongeldig of groter dan 256 KB.'], 400);
        }
        if (!is_uploaded_file($clientFile['tmp_name'])) {
            scouts_json_response(['message' => 'Geen geldige OAuth-clientupload ontvangen.'], 400);
        }
        $clientJson = json_decode((string) file_get_contents($clientFile['tmp_name']), true);
        $client = is_array($clientJson) ? ($clientJson['web'] ?? $clientJson['installed'] ?? $clientJson) : null;
        if (!is_array($client)
            || !is_string($client['client_id'] ?? null)
            || !is_string($client['client_secret'] ?? null)
            || !is_string(($client['redirect_uris'][0] ?? null))) {
            scouts_json_response(['message' => 'Dit is geen geldig Google OAuth-clientbestand.'], 400);
        }
        $existing = scouts_google_oauth_data() ?? [];
        $redirectUris = [];
        if (is_array($client['redirect_uris'] ?? null)) {
            foreach ($client['redirect_uris'] as $uri) {
                if (is_string($uri) && trim($uri) !== '') {
                    $redirectUris[] = trim($uri);
                }
            }
        }
        $payload = [
            'client_id' => $client['client_id'],
            'client_secret' => $client['client_secret'],
            'redirect_uris' => array_values(array_unique($redirectUris)),
            'redirect_uri' => $redirectUris[0] ?? scouts_google_oauth_current_host_callback(),
        ];
        // Keep an existing Drive connection when only the client JSON is replaced.
        if (!empty($existing['refresh_token']) && is_string($existing['refresh_token'])) {
            $payload['refresh_token'] = $existing['refresh_token'];
        }
        if (!empty($existing['email']) && is_string($existing['email'])) {
            $payload['email'] = $existing['email'];
        }
        scouts_write_google_oauth($payload);
        scouts_json_response([
            'success' => true,
            'redirectUri' => scouts_google_oauth_redirect_uri(),
            'authorizedRedirectUris' => scouts_google_oauth_authorized_redirect_uris(),
        ]);
    }

    if ($route === 'google-drive/oauth/start' && $method === 'GET') {
        scouts_require_google_settings_access();
        $client = scouts_google_oauth_client();
        if ($client === null) {
            scouts_json_response(['message' => 'Upload eerst een Google OAuth-clientbestand.'], 400);
        }
        $redirectUri = scouts_google_oauth_redirect_uri();
        $authorized = scouts_google_oauth_authorized_redirect_uris();
        $authorizedExact = array_map('strtolower', $authorized);
        if ($authorized !== [] && !in_array(strtolower($redirectUri), $authorizedExact, true)) {
            scouts_json_response([
                'message' => 'Redirect-URI ontbreekt in Google Cloud.',
                'redirectUri' => $redirectUri,
                'authorizedRedirectUris' => $authorized,
            ], 400);
        }
        $state = bin2hex(random_bytes(24));
        $_SESSION['google_oauth_state'] = $state;
        $query = http_build_query([
            'client_id' => $client['client_id'],
            'redirect_uri' => $redirectUri,
            'response_type' => 'code',
            'scope' => 'https://www.googleapis.com/auth/drive.file',
            'access_type' => 'offline',
            'prompt' => 'consent',
            'state' => $state,
        ]);
        scouts_json_response(['url' => 'https://accounts.google.com/o/oauth2/v2/auth?' . $query]);
    }

    if ($route === 'google-drive/oauth/callback' && $method === 'GET') {
        try {
            if (!scouts_session_is_admin()) {
                header('Location: /login?next=' . rawurlencode('/admin?google=error'));
                exit;
            }
            if (!isset($_SESSION['google_settings_unlocked_until'])
                || (int) $_SESSION['google_settings_unlocked_until'] < time()) {
                throw new RuntimeException('Instellingen vergrendeld. Probeer opnieuw.');
            }
            $state = (string) ($_GET['state'] ?? '');
            $code = (string) ($_GET['code'] ?? '');
            $oauthError = trim((string) ($_GET['error'] ?? ''));
            if ($oauthError !== '') {
                throw new RuntimeException('Google weigerde de koppeling.');
            }
            if ($state === '' || !hash_equals((string) ($_SESSION['google_oauth_state'] ?? ''), $state) || $code === '') {
                throw new RuntimeException('Ongeldige callback. Probeer opnieuw.');
            }
            unset($_SESSION['google_oauth_state']);
            $client = scouts_google_oauth_client();
            if ($client === null) {
                throw new RuntimeException('OAuth-client ontbreekt.');
            }
            $redirectUri = scouts_google_oauth_redirect_uri();
            $ch = curl_init('https://oauth2.googleapis.com/token');
            curl_setopt_array($ch, [
                CURLOPT_POST => true,
                CURLOPT_POSTFIELDS => http_build_query([
                    'code' => $code,
                    'client_id' => $client['client_id'],
                    'client_secret' => $client['client_secret'],
                    'redirect_uri' => $redirectUri,
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
            if ($response === false || $status < 200 || $status >= 300) {
                throw new RuntimeException(
                    'Koppeling mislukt'
                    . ($error !== '' ? '' : ': ' . scouts_google_error_message((string) $response, $status))
                );
            }
            $token = json_decode($response, true);
            if (!is_array($token)) {
                throw new RuntimeException('Ongeldig antwoord van Google.');
            }
            $refreshToken = is_string($token['refresh_token'] ?? null) ? $token['refresh_token'] : '';
            if ($refreshToken === '' && is_string($client['refresh_token'] ?? null)) {
                $refreshToken = $client['refresh_token'];
            }
            if ($refreshToken === '') {
                throw new RuntimeException('Geen refresh-token. Trek toegang in en verbind opnieuw.');
            }
            $accessToken = is_string($token['access_token'] ?? null) ? $token['access_token'] : '';
            $email = $accessToken !== '' ? scouts_google_oauth_fetch_email($accessToken) : '';
            if ($email === '' && is_string($client['email'] ?? null)) {
                $email = $client['email'];
            }
            $client['refresh_token'] = $refreshToken;
            if ($email !== '') {
                $client['email'] = $email;
            } else {
                unset($client['email']);
            }
            $client['redirect_uri'] = $redirectUri;
            scouts_write_google_oauth($client);
            $saved = scouts_google_oauth_data();
            if (!is_array($saved) || empty($saved['refresh_token'])) {
                throw new RuntimeException('Koppeling kon niet worden bewaard. Probeer opnieuw.');
            }
            $_SESSION['google_settings_unlocked_until'] = time() + 900;
            scouts_google_oauth_admin_redirect('connected');
        } catch (Throwable $oauthCallbackError) {
            error_log('Scouts Google OAuth callback: ' . $oauthCallbackError->getMessage());
            scouts_google_oauth_admin_redirect('error', $oauthCallbackError->getMessage());
        }
    }

    if ($route === 'login' && $method === 'POST') {
        scouts_require_same_origin();
        $body = scouts_request_json();
        $username = trim((string) ($body['username'] ?? ''));
        $password = (string) ($body['password'] ?? '');
        if ($username === '' || $password === '') {
            scouts_json_response(['message' => 'Vul zowel gebruikersnaam als wachtwoord in.'], 400);
        }

        $lockRemaining = scouts_login_lock_remaining_seconds();
        if ($lockRemaining > 0) {
            $minutes = (int) ceil($lockRemaining / 60);
            scouts_json_response([
                'message' => $minutes <= 1
                    ? 'Te veel mislukte pogingen. Probeer over een minuut opnieuw.'
                    : "Te veel mislukte pogingen. Probeer over {$minutes} minuten opnieuw.",
            ], 429);
        }

        if (scouts_admin_username() === '' || scouts_admin_password_hash() === '') {
            error_log('Scouts admin credentials are not configured.');
            scouts_json_response(['message' => 'Beheerlogin is niet geconfigureerd.'], 500);
        }
        // Always run both checks to avoid username-enumeration timing differences.
        $usernameOk = hash_equals(scouts_admin_username(), $username);
        $passwordOk = password_verify($password, scouts_admin_password_hash());
        if (!$usernameOk || !$passwordOk) {
            $lockAfterFail = scouts_login_record_failure();
            if ($lockAfterFail > 0) {
                $minutes = (int) ceil($lockAfterFail / 60);
                scouts_json_response([
                    'message' => $minutes <= 1
                        ? 'Te veel mislukte pogingen. Probeer over een minuut opnieuw.'
                        : "Te veel mislukte pogingen. Probeer over {$minutes} minuten opnieuw.",
                ], 429);
            }
            scouts_json_response(['message' => 'Ongeldige gebruikersnaam of wachtwoord.'], 401);
        }
        scouts_login_clear_failures();
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
            setcookie(session_name(), '', [
                'expires' => time() - 42000,
                'path' => $params['path'] ?? '/',
                'domain' => $params['domain'] ?? '',
                'secure' => (bool) ($params['secure'] ?? false),
                'httponly' => (bool) ($params['httponly'] ?? true),
                'samesite' => $params['samesite'] ?? 'Lax',
            ]);
        }
        session_destroy();
        scouts_json_response(['success' => true, 'redirectTo' => '/login']);
    }

    if ($route === 'site-data' && $method === 'POST') {
        scouts_require_admin();
        scouts_require_same_origin();
        $data = scouts_request_json();
        try {
            scouts_validate_site_data($data);
        } catch (InvalidArgumentException $error) {
            scouts_json_response(['message' => $error->getMessage()], 400);
        }

        $currentVersion = scouts_site_data_version();
        $ifMatch = trim((string) ($_SERVER['HTTP_IF_MATCH'] ?? ''), " \t\"");
        if ($ifMatch === '') {
            scouts_json_response([
                'message' => 'Ontbrekende versiecontrole. Herlaad de pagina en probeer opnieuw.',
                'code' => 'missing_version',
            ], 428);
        }
        if (!hash_equals($currentVersion, $ifMatch)) {
            scouts_json_response([
                'message' => 'Iemand anders heeft ondertussen opgeslagen. Herlaad en probeer opnieuw.',
                'code' => 'version_conflict',
                'version' => $currentVersion,
            ], 409);
        }

        scouts_write_site_data($data);
        $newVersion = scouts_site_data_version();
        header('X-Scouts-Data-Version: ' . $newVersion);
        header('ETag: "' . $newVersion . '-a"');
        scouts_json_response(['success' => true, 'version' => $newVersion]);
    }

    if ($route === 'site-data/restore' && $method === 'POST') {
        scouts_require_admin();
        scouts_require_same_origin();
        $data = scouts_request_json();
        try {
            scouts_validate_site_data($data);
        } catch (InvalidArgumentException $error) {
            scouts_json_response(['message' => $error->getMessage()], 400);
        }
        scouts_write_site_data($data);
        $newVersion = scouts_site_data_version();
        header('X-Scouts-Data-Version: ' . $newVersion);
        header('ETag: "' . $newVersion . '-a"');
        scouts_json_response(['success' => true, 'version' => $newVersion]);
    }

    if ($route === 'site-data/reset' && $method === 'POST') {
        scouts_require_admin();
        scouts_require_same_origin();
        scouts_write_site_data(scouts_decode_json_file(SCOUTS_DEFAULT_DATA_FILE));
        $newVersion = scouts_site_data_version();
        header('X-Scouts-Data-Version: ' . $newVersion);
        scouts_json_response(['success' => true, 'version' => $newVersion]);
    }

    if ($route === 'uploads/photo' && $method === 'POST') {
        scouts_require_admin();
        scouts_require_same_origin();
        $contentLength = (int) ($_SERVER['CONTENT_LENGTH'] ?? 0);
        $uploadLimit = scouts_effective_upload_max_bytes(SCOUTS_MAX_UPLOAD_BYTES);
        if (!isset($_FILES['photo'])) {
            if ($contentLength > 0 && $contentLength > $uploadLimit) {
                scouts_json_response(['message' => scouts_upload_too_large_message('foto')], 413);
            }
            scouts_json_response(['message' => 'Geen foto ontvangen.'], 400);
        }
        $file = $_FILES['photo'];
        if (($file['error'] ?? UPLOAD_ERR_OK) !== UPLOAD_ERR_OK) {
            $tooLarge = in_array($file['error'], [UPLOAD_ERR_INI_SIZE, UPLOAD_ERR_FORM_SIZE], true);
            scouts_json_response([
                'message' => $tooLarge
                    ? scouts_upload_too_large_message('foto')
                    : 'De foto kon niet worden geupload.',
            ], $tooLarge ? 413 : 400);
        }
        if (!is_uploaded_file($file['tmp_name'])) {
            scouts_json_response(['message' => 'Geen geldige foto-upload ontvangen.'], 400);
        }
        if ((int) $file['size'] > $uploadLimit) {
            scouts_json_response(['message' => scouts_upload_too_large_message('foto')], 413);
        }
        $filename = strtolower(trim((string) ($_POST['filename'] ?? '')));
        if (!scouts_allowed_photo_name($filename)) {
            scouts_json_response(['message' => 'Ongeldige bestandsnaam.'], 400);
        }
        $allowedMimes = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp', 'image/gif' => 'gif'];
        $imageInfo = @getimagesize($file['tmp_name']);
        if (!is_array($imageInfo)) {
            scouts_json_response(['message' => 'Ongeldig afbeeldingsbestand. Gebruik JPG, PNG, WEBP of GIF.'], 400);
        }
        $mimeFromImage = (string) ($imageInfo['mime'] ?? '');
        if (!isset($allowedMimes[$mimeFromImage]) || str_contains($mimeFromImage, 'svg')) {
            scouts_json_response(['message' => 'Ongeldig afbeeldingsbestand. Gebruik JPG, PNG, WEBP of GIF.'], 400);
        }
        // Cross-check content sniffing when fileinfo is available.
        if (function_exists('finfo_open')) {
            $fileInfo = finfo_open(FILEINFO_MIME_TYPE);
            if ($fileInfo !== false) {
                $detectedMime = finfo_file($fileInfo, $file['tmp_name']);
                finfo_close($fileInfo);
                if (
                    is_string($detectedMime)
                    && $detectedMime !== ''
                    && $detectedMime !== $mimeFromImage
                    && !isset($allowedMimes[$detectedMime])
                ) {
                    scouts_json_response(['message' => 'Ongeldig afbeeldingsbestand. Gebruik JPG, PNG, WEBP of GIF.'], 400);
                }
            }
        }
        $mime = $mimeFromImage;

        $width = (int) ($imageInfo[0] ?? 0);
        $height = (int) ($imageInfo[1] ?? 0);
        try {
            scouts_photo_assert_safe_dimensions($width, $height);
        } catch (InvalidArgumentException $e) {
            scouts_json_response(['message' => $e->getMessage()], 400);
        }

        try {
            $path = scouts_store_uploaded_photo($file['tmp_name'], $filename, $mime, $width, $height);
        } catch (InvalidArgumentException $e) {
            scouts_json_response(['message' => $e->getMessage()], 400);
        } catch (Throwable $e) {
            error_log('scouts photo upload failed: ' . $e->getMessage());
            // Surface known config/setup errors; keep other failures generic.
            $detail = $e->getMessage();
            $safeSetup = str_contains($detail, 'PHP GD')
                || str_contains($detail, 'GD-extensie')
                || str_contains($detail, 'niet leesbaar')
                || str_contains($detail, 'niet worden bewaard')
                || str_contains($detail, 'niet worden geplaatst');
            scouts_json_response([
                'message' => $safeSetup
                    ? $detail
                    : 'Foto verwerken mislukt. Probeer het opnieuw of kies een andere foto.',
            ], 500);
        }
        scouts_json_response(['success' => true, 'path' => $path]);
    }

    if ($route === 'uploads/planning' && $method === 'POST') {
        scouts_require_admin();
        scouts_require_same_origin();
        if (!isset($_FILES['planning'])) {
            scouts_json_response(['message' => 'Geen PDF ontvangen.'], 400);
        }

        $file = $_FILES['planning'];
        $pdfLimit = scouts_effective_upload_max_bytes(SCOUTS_MAX_PDF_UPLOAD_BYTES);
        if (($file['error'] ?? UPLOAD_ERR_OK) !== UPLOAD_ERR_OK) {
            $tooLarge = in_array($file['error'], [UPLOAD_ERR_INI_SIZE, UPLOAD_ERR_FORM_SIZE], true);
            scouts_json_response([
                'message' => $tooLarge
                    ? scouts_upload_too_large_message('PDF')
                    : 'De PDF kon niet worden geupload.',
            ], $tooLarge ? 413 : 400);
        }
        if (!is_uploaded_file($file['tmp_name'])) {
            scouts_json_response(['message' => 'Geen geldige PDF-upload ontvangen.'], 400);
        }
        if ((int) $file['size'] > $pdfLimit) {
            scouts_json_response(['message' => scouts_upload_too_large_message('PDF')], 413);
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
        $driveUpdated = false;
        $driveError = false;
        $driveErrorMessage = '';
        $driveFileId = '';
        $driveFilename = '';
        if (scouts_google_drive_is_configured()) {
            try {
                // Identity: {tak}_{maanden}_{jaar}.pdf — same period overwrites; new month = new file.
                $driveResult = scouts_google_drive_upload_planning($finalPath, $branch, $planningTitle);
                $driveUploaded = true;
                $driveUpdated = !empty($driveResult['updated']);
                $driveFileId = (string) ($driveResult['fileId'] ?? '');
                $driveFilename = (string) ($driveResult['filename'] ?? '');
            } catch (Throwable $error) {
                $driveError = true;
                $driveErrorMessage = $error->getMessage();
                error_log('Google Drive maandplanning upload mislukt: ' . $driveErrorMessage);
            }
        }

        scouts_json_response([
            'success' => true,
            'driveUploaded' => $driveUploaded,
            'driveUpdated' => $driveUpdated,
            'driveError' => $driveError,
            'driveErrorMessage' => $driveErrorMessage,
            'driveFileId' => $driveFileId,
            'driveFilename' => $driveFilename,
            // Cache-buster so browsers fetch the newest local PDF immediately.
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
        $letterLimit = scouts_effective_upload_max_bytes(SCOUTS_MAX_PDF_UPLOAD_BYTES);
        if (($file['error'] ?? UPLOAD_ERR_OK) !== UPLOAD_ERR_OK) {
            $tooLarge = in_array($file['error'], [UPLOAD_ERR_INI_SIZE, UPLOAD_ERR_FORM_SIZE], true);
            scouts_json_response([
                'message' => $tooLarge
                    ? scouts_upload_too_large_message('brief')
                    : 'De brief kon niet worden geupload.',
            ], $tooLarge ? 413 : 400);
        }
        if (!is_uploaded_file($file['tmp_name'])) {
            scouts_json_response(['message' => 'Geen geldige brief-upload ontvangen.'], 400);
        }
        if ((int) $file['size'] > $letterLimit) {
            scouts_json_response(['message' => scouts_upload_too_large_message('brief')], 413);
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
        // Compare against the decoded name so valid percent-encoded characters
        // (e.g. %2D) are accepted, while basename() still rejects path segments.
        $rawName = rawurldecode($matches[1]);
        $filename = basename(str_replace('\\', '/', $rawName));
        if ($filename !== $rawName || !str_ends_with(strtolower($filename), '.pdf')) {
            scouts_json_response(['message' => 'Ongeldige documentnaam.'], 400);
        }
        if (in_array(strtolower($filename), array_map('strtolower', scouts_protected_upload_filenames()), true)) {
            scouts_json_response(['message' => 'Dit document mag niet worden verwijderd.'], 403);
        }
        // Refuse deleting PDFs still referenced in site-data (prevents wiping a
        // just-replaced maandplanning-{tak}.pdf that reuses the same basename).
        $referenced = scouts_collect_referenced_uploads(scouts_read_site_data());
        if (isset($referenced[$filename])) {
            scouts_json_response(['message' => 'Document is nog in gebruik op de website.'], 409);
        }
        $path = SCOUTS_UPLOADS_DIR . DIRECTORY_SEPARATOR . $filename;
        if (is_file($path) && !unlink($path)) {
            scouts_json_response(['message' => 'Document kon niet worden verwijderd.'], 500);
        }
        scouts_json_response(['success' => true]);
    }

    if ($route === 'uploads/orphans' && $method === 'GET') {
        scouts_require_admin();
        $orphans = scouts_list_orphan_uploads();
        $totalBytes = 0;
        foreach ($orphans as $orphan) {
            $totalBytes += (int) ($orphan['size'] ?? 0);
        }
        scouts_json_response([
            'count' => count($orphans),
            'totalBytes' => $totalBytes,
            'orphans' => $orphans,
        ]);
    }

    if ($route === 'cron/backup-drive' && ($method === 'GET' || $method === 'POST')) {
        scouts_require_cron_secret();
        try {
            $driveResult = scouts_google_drive_upload_site_backup();
        } catch (Throwable $error) {
            error_log('Wekelijkse Drive-backup mislukt: ' . $error->getMessage());
            scouts_json_response([
                'success' => false,
                'message' => $error->getMessage(),
            ], 500);
        }
        scouts_json_response([
            'success' => true,
            'updated' => !empty($driveResult['updated']),
            'filename' => (string) ($driveResult['filename'] ?? ''),
            'fileId' => (string) ($driveResult['fileId'] ?? ''),
            'folderId' => (string) ($driveResult['folderId'] ?? ''),
        ]);
    }

    if ($route === 'uploads/orphans/purge' && $method === 'POST') {
        scouts_require_admin();
        scouts_require_same_origin();
        $body = scouts_request_json();
        $names = null;
        if (isset($body['names']) && is_array($body['names'])) {
            $names = $body['names'];
        }
        $deleted = scouts_purge_orphan_uploads($names);
        scouts_json_response([
            'success' => true,
            'deleted' => count($deleted),
            'names' => $deleted,
        ]);
    }

    scouts_json_response(['message' => 'Not found'], 404);
} catch (JsonException | InvalidArgumentException $error) {
    scouts_json_response(['message' => 'Ongeldige gegevens.'], 400);
} catch (Throwable $error) {
    error_log('Scouts API error: ' . $error->getMessage());
    scouts_json_response(['message' => 'Er is een interne serverfout opgetreden.'], 500);
}