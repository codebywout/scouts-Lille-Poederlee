<?php
declare(strict_types=1);

// The PHP development server sends every request through this file. Static
// files are returned to the server; /api/* requests are handled by the API.
$requestPath = parse_url((string) ($_SERVER['REQUEST_URI'] ?? '/'), PHP_URL_PATH);
$requestPath = is_string($requestPath) ? rawurldecode($requestPath) : '/';

if ($requestPath === '/data' || strncmp($requestPath, '/data/', 6) === 0
    || $requestPath === '/.env' || strncmp($requestPath, '/.git/', 6) === 0
    || $requestPath === '/config.php' || $requestPath === '/auth-config.php'
    || strncmp($requestPath, '/server/', 8) === 0) {
    http_response_code(404);
    exit;
}

$cleanRoutes = [
    '/login' => 'login.html',
    '/admin' => 'admin-gate.php',
    '/over-ons' => 'pages/over-ons.html',
    '/inschrijven' => 'pages/inschrijven.html',
    '/jins' => 'pages/jins.html',
    '/jongverkenners' => 'pages/jongverkenners.html',
    '/kapoenen' => 'pages/kapoenen.html',
    '/tweedehands' => 'pages/tweedehands.html',
    '/uniform' => 'pages/uniform.html',
    '/verkenners' => 'pages/verkenners.html',
    '/welpen' => 'pages/welpen.html',
    '/privacybeleid' => 'pages/privacyverklaring.html',
];

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

$legacyPageNames = [
    'over-ons', 'inschrijven', 'jins', 'jongverkenners', 'kapoenen',
    'tweedehands', 'uniform', 'verkenners', 'welpen',
];

if (preg_match('#^/(' . implode('|', $legacyPageNames) . ')\.html$#', $requestPath, $matches)) {
    header('Location: /' . $matches[1], true, 301);
    exit;
}

if (preg_match('#^/pages/(' . implode('|', $legacyPageNames) . ')\.html$#', $requestPath, $matches)) {
    header('Location: /' . $matches[1], true, 301);
    exit;
}

if (isset($cleanRoutes[$requestPath])) {
    require __DIR__ . DIRECTORY_SEPARATOR . $cleanRoutes[$requestPath];
    exit;
}

if (strncmp($requestPath, '/api/', 5) !== 0 && $requestPath !== '/api') {
    return false;
}

$_GET['route'] = trim(substr($requestPath, 5), '/');
require __DIR__ . DIRECTORY_SEPARATOR . 'api' . DIRECTORY_SEPARATOR . 'index.php';