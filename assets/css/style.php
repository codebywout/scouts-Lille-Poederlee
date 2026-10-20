<?php
declare(strict_types=1);

require_once dirname(__DIR__, 2) . DIRECTORY_SEPARATOR . 'config.php';

$version = scouts_asset_version();
$bundle = strtolower((string) ($_GET['bundle'] ?? 'public'));
$sheets = ['base', 'layout', 'components', 'home', 'pages', 'responsive'];
if ($bundle === 'admin') {
    // Admin styles after page styles, before responsive overrides.
    array_splice($sheets, 5, 0, ['admin']);
}

$cssDir = __DIR__ . DIRECTORY_SEPARATOR;
$css = '';
foreach ($sheets as $sheet) {
    $path = $cssDir . $sheet . '.css';
    if (!is_readable($path)) {
        continue;
    }
    $chunk = file_get_contents($path);
    if ($chunk === false) {
        continue;
    }
    $css .= "/* ===== {$sheet}.css ===== */\n" . $chunk . "\n";
}

// Keep local url(...?v=) in sync with SCOUTS_ASSET_VERSION (one cache-bust source).
$css = preg_replace_callback(
    '/url\(\s*(["\']?)([^)\'"\s]+)\1\s*\)/i',
    static function (array $matches) use ($version): string {
        $quote = $matches[1];
        $path = $matches[2];
        if (preg_match('#^(https?:)?//#i', $path) === 1 || str_starts_with($path, 'data:')) {
            return $matches[0];
        }
        if (!preg_match('#\.(?:css|js|png|jpe?g|webp|gif|svg|ico)(?:\?|$)#i', $path)) {
            return $matches[0];
        }
        $bare = preg_replace('/\?.*$/', '', $path) ?? $path;
        return 'url(' . $quote . $bare . '?v=' . $version . $quote . ')';
    },
    $css
) ?? $css;

header('Content-Type: text/css; charset=utf-8');
scouts_send_asset_revalidate_headers();
header('X-Asset-Version: ' . $version);
header('ETag: "' . hash('sha256', $version . '|' . $bundle . '|' . $css) . '"');
echo $css;
