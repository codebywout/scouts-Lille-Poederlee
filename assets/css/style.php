<?php
declare(strict_types=1);

require_once dirname(__DIR__, 2) . DIRECTORY_SEPARATOR . 'config.php';

$version = rawurlencode(scouts_asset_version());
$sheets = ['base', 'layout', 'components', 'home', 'pages', 'admin', 'responsive'];

header('Content-Type: text/css; charset=utf-8');
scouts_send_asset_revalidate_headers();
header('X-Asset-Version: ' . scouts_asset_version());

foreach ($sheets as $sheet) {
    echo '@import url("' . $sheet . '.css?v=' . $version . '");' . "\n";
}
