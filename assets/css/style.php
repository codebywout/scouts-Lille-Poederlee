<?php
declare(strict_types=1);

require_once dirname(__DIR__, 2) . DIRECTORY_SEPARATOR . 'config.php';

$version = scouts_asset_version();
$requestedBundle = strtolower(trim((string) ($_GET['bundle'] ?? 'public')));
[$bundle, $sheets] = match ($requestedBundle) {
    'core', 'home' => [
        'core',
        ['base', 'layout', 'components', 'home', 'responsive'],
    ],
    'admin' => [
        'admin',
        ['base', 'layout', 'components', 'home', 'pages', 'admin', 'responsive'],
    ],
    default => [
        'public',
        ['base', 'layout', 'components', 'home', 'pages', 'responsive'],
    ],
};

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
        if (!preg_match('#\.(?:css|js|png|jpe?g|webp|avif|gif|svg|ico)(?:\?|$)#i', $path)) {
            return $matches[0];
        }
        $bare = preg_replace('/\?.*$/', '', $path) ?? $path;
        return 'url(' . $quote . $bare . '?v=' . $version . $quote . ')';
    },
    $css
) ?? $css;

// Light production minify: drop comments and collapse excess whitespace.
$css = preg_replace('#/\*.*?\*/#s', '', $css) ?? $css;
$css = preg_replace('/\s+/', ' ', $css) ?? $css;
$css = preg_replace('/\s*([{}:;,>])\s*/', '$1', $css) ?? $css;
$css = str_replace(';}', '}', $css);
$css = trim($css);

header('Content-Type: text/css; charset=utf-8');
scouts_send_asset_revalidate_headers();
header('X-Asset-Version: ' . $version);
header('ETag: "' . hash('sha256', $version . '|' . $bundle . '|' . $css) . '"');
echo $css;
