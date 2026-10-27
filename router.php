<?php
declare(strict_types=1);

require_once __DIR__ . DIRECTORY_SEPARATOR . 'config.php';

// The PHP development server sends every request through this file. Static
// files are returned to the server; /api/* requests are handled by the API.
$requestPath = parse_url((string) ($_SERVER['REQUEST_URI'] ?? '/'), PHP_URL_PATH);
$requestPath = is_string($requestPath) ? rawurldecode($requestPath) : '/';
// Normalize for blocklist checks (case-insensitive FS on Windows/macOS).
$blockedPath = strtolower(str_replace('\\', '/', $requestPath));
if (str_contains($blockedPath, "\0") || str_contains($blockedPath, '..')) {
    http_response_code(404);
    exit;
}

if ($blockedPath === '/data' || strncmp($blockedPath, '/data/', 6) === 0
    || $blockedPath === '/includes' || strncmp($blockedPath, '/includes/', 10) === 0
    || $blockedPath === '/tools' || strncmp($blockedPath, '/tools/', 7) === 0
    || $blockedPath === '/docs' || strncmp($blockedPath, '/docs/', 6) === 0
    || $blockedPath === '/uploads/originals' || strncmp($blockedPath, '/uploads/originals/', 19) === 0
    || $blockedPath === '/.env' || strncmp($blockedPath, '/.git', 5) === 0
    || $blockedPath === '/config.php'
    || $blockedPath === '/auth-config.php'
    || $blockedPath === '/router.php'
    || $blockedPath === '/sitemap.php'
    || $blockedPath === '/google-drive.php'
    || $blockedPath === '/readme.md'
    || $blockedPath === '/.user.ini'
    || $blockedPath === '/texput.log'
    || strncmp($blockedPath, '/server/', 8) === 0) {
    http_response_code(404);
    exit;
}

if ($requestPath === '/index.html') {
    header('Location: /', true, 301);
    exit;
}

if ($requestPath === '/login.html') {
    header('Location: /login', true, 301);
    exit;
}

if ($requestPath === '/admin.html' || $requestPath === '/admin/index.html') {
    header('Location: /admin', true, 301);
    exit;
}

if (in_array($requestPath, [
    '/privacybeleid.html',
    '/privacyverklaring',
    '/privacyverklaring.html',
    '/pages/privacyverklaring.html',
], true)) {
    header('Location: /privacybeleid', true, 301);
    exit;
}

$legacyPageNames = [
    'over-ons', 'inschrijven', 'jins', 'jongverkenners', 'kapoenen',
    'tweedehands', 'nieuws', 'uniform', 'verkenners', 'welpen',
];

if (preg_match('#^/(' . implode('|', $legacyPageNames) . ')\.html$#', $requestPath, $matches)) {
    header('Location: /' . $matches[1], true, 301);
    exit;
}

if (preg_match('#^/pages/(' . implode('|', $legacyPageNames) . ')\.html$#', $requestPath, $matches)) {
    header('Location: /' . $matches[1], true, 301);
    exit;
}

if ($requestPath === '/assets/css/style.css') {
    require __DIR__ . DIRECTORY_SEPARATOR . 'assets' . DIRECTORY_SEPARATOR . 'css' . DIRECTORY_SEPARATOR . 'style.php';
    exit;
}

$pageRoutes = [
    '/' => 'index',
    '/login' => 'login',
    '/over-ons' => 'over-ons',
    '/inschrijven' => 'inschrijven',
    '/jins' => 'jins',
    '/jongverkenners' => 'jongverkenners',
    '/kapoenen' => 'kapoenen',
    '/tweedehands' => 'tweedehands',
    '/nieuws' => 'nieuws',
    '/uniform' => 'uniform',
    '/verkenners' => 'verkenners',
    '/welpen' => 'welpen',
    '/privacybeleid' => 'privacybeleid',
    '/404' => '404',
];

if (isset($pageRoutes[$requestPath])) {
    $_GET['page'] = $pageRoutes[$requestPath];
    require __DIR__ . DIRECTORY_SEPARATOR . 'page.php';
    exit;
}

if ($requestPath === '/admin') {
    require __DIR__ . DIRECTORY_SEPARATOR . 'admin-gate.php';
    exit;
}

if ($requestPath === '/sitemap.xml') {
    require __DIR__ . DIRECTORY_SEPARATOR . 'sitemap.php';
    exit;
}

// Revalidate headers for static CSS/JS during local PHP server development.
if (preg_match('#^/assets/.+\.(css|js)$#', $requestPath) === 1) {
    $file = __DIR__ . str_replace('/', DIRECTORY_SEPARATOR, $requestPath);
    if (is_file($file)) {
        $ext = strtolower(pathinfo($file, PATHINFO_EXTENSION));
        header('Content-Type: ' . ($ext === 'css' ? 'text/css' : 'application/javascript') . '; charset=utf-8');
        scouts_send_asset_revalidate_headers();
        header('X-Asset-Version: ' . scouts_asset_version());
        readfile($file);
        exit;
    }
}

if (strncmp($requestPath, '/api/', 5) !== 0 && $requestPath !== '/api') {
    $localFile = __DIR__ . str_replace('/', DIRECTORY_SEPARATOR, $requestPath);
    if ($requestPath !== '/' && is_file($localFile)) {
        return false;
    }
    scouts_send_not_found();
}

$_GET['route'] = trim(substr($requestPath, 5), '/');
require __DIR__ . DIRECTORY_SEPARATOR . 'api' . DIRECTORY_SEPARATOR . 'index.php';
