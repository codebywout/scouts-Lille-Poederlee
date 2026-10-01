<?php
declare(strict_types=1);

require_once __DIR__ . DIRECTORY_SEPARATOR . 'config.php';
scouts_start_session();

if (!scouts_session_is_admin()) {
    header('Location: /login', true, 302);
    exit;
}

header('Content-Type: text/html; charset=utf-8');
readfile(__DIR__ . DIRECTORY_SEPARATOR . 'admin.html');