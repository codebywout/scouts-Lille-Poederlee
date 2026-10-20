<?php
declare(strict_types=1);

require_once __DIR__ . DIRECTORY_SEPARATOR . 'config.php';

$base = 'https://scoutslille.be';
$paths = [
    '/',
    '/over-ons',
    '/inschrijven',
    '/nieuws',
    '/uniform',
    '/tweedehands',
    '/kapoenen',
    '/welpen',
    '/jongverkenners',
    '/verkenners',
    '/jins',
    '/privacybeleid',
];

$lastmodTs = @filemtime(SCOUTS_DATA_FILE);
if ($lastmodTs === false) {
    $lastmodTs = time();
}
$lastmod = gmdate('Y-m-d', $lastmodTs);

header('Content-Type: application/xml; charset=utf-8');
header('Cache-Control: public, max-age=3600');

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
