<?php
declare(strict_types=1);

require_once __DIR__ . DIRECTORY_SEPARATOR . 'config.php';

$page = (string) ($_GET['page'] ?? 'index');

$pages = [
    'index' => 'index.html',
    'login' => 'login.html',
    'over-ons' => 'pages' . DIRECTORY_SEPARATOR . 'over-ons.html',
    'inschrijven' => 'pages' . DIRECTORY_SEPARATOR . 'inschrijven.html',
    'jins' => 'pages' . DIRECTORY_SEPARATOR . 'jins.html',
    'jongverkenners' => 'pages' . DIRECTORY_SEPARATOR . 'jongverkenners.html',
    'kapoenen' => 'pages' . DIRECTORY_SEPARATOR . 'kapoenen.html',
    'nieuws' => 'pages' . DIRECTORY_SEPARATOR . 'nieuws.html',
    'tweedehands' => 'pages' . DIRECTORY_SEPARATOR . 'tweedehands.html',
    'uniform' => 'pages' . DIRECTORY_SEPARATOR . 'uniform.html',
    'verkenners' => 'pages' . DIRECTORY_SEPARATOR . 'verkenners.html',
    'welpen' => 'pages' . DIRECTORY_SEPARATOR . 'welpen.html',
    'privacybeleid' => 'pages' . DIRECTORY_SEPARATOR . 'privacyverklaring.html',
    '404' => 'pages' . DIRECTORY_SEPARATOR . '404.html',
];

if (!isset($pages[$page])) {
    scouts_send_not_found();
}

if ($page === '404') {
    http_response_code(404);
}

scouts_send_html_file(__DIR__ . DIRECTORY_SEPARATOR . $pages[$page], $page);
