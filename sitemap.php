<?php
declare(strict_types=1);

/**
 * Dynamic XML sitemap served as /sitemap.xml (see .htaccess + router.php).
 * Paths: scouts_sitemap_paths() in config.php.
 * lastmod: mtime of data/site-data.json when available.
 */

require_once __DIR__ . DIRECTORY_SEPARATOR . 'config.php';

$base = scouts_public_origin();
$paths = scouts_sitemap_paths();

$lastmodTs = @filemtime(SCOUTS_DATA_FILE);
if ($lastmodTs === false) {
    $lastmodTs = time();
}
$lastmod = gmdate('Y-m-d', $lastmodTs);

header('Content-Type: application/xml; charset=utf-8');
header('Cache-Control: public, max-age=3600');
header('Last-Modified: ' . gmdate('D, d M Y H:i:s', $lastmodTs) . ' GMT');

echo '<?xml version="1.0" encoding="UTF-8"?>' . "\n";
echo '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' . "\n";
foreach ($paths as $path) {
    $loc = htmlspecialchars($base . $path, ENT_XML1 | ENT_QUOTES, 'UTF-8');
    echo "  <url>\n";
    echo "    <loc>{$loc}</loc>\n";
    echo "    <lastmod>{$lastmod}</lastmod>\n";
    echo "  </url>\n";
}
echo '</urlset>';
