<?php
declare(strict_types=1);

/**
 * Security / privacy regression checks (no network, no writes to site-data).
 */
require dirname(__DIR__) . DIRECTORY_SEPARATOR . 'config.php';

$failed = 0;
$passed = 0;

function expect(bool $ok, string $label): void
{
    global $failed, $passed;
    if ($ok) {
        $passed++;
        fwrite(STDOUT, "  OK  {$label}\n");
        return;
    }
    $failed++;
    fwrite(STDOUT, " FAIL {$label}\n");
}

echo "=== Security tests ===\n";

// --- Client IP must ignore spoofed proxy headers by default ---
$_SERVER['REMOTE_ADDR'] = '203.0.113.10';
$_SERVER['HTTP_X_FORWARDED_FOR'] = '198.51.100.1';
$_SERVER['HTTP_CF_CONNECTING_IP'] = '198.51.100.2';
putenv('TRUSTED_PROXY_IPS');
expect(scouts_client_ip() === '203.0.113.10', 'client IP ignores X-Forwarded-For without trusted proxy');

// --- News published filter fail-closed ---
$sample = [
    'news' => [
        ['id' => 'a', 'title' => 'pub', 'published' => true],
        ['id' => 'b', 'title' => 'draft', 'published' => false],
        ['id' => 'c', 'title' => 'string-false', 'published' => 'false'],
        ['id' => 'd', 'title' => 'zero', 'published' => 0],
        ['id' => 'e', 'title' => 'null', 'published' => null],
        ['id' => 'f', 'title' => 'legacy'],
    ],
];
$public = scouts_public_site_data($sample);
$ids = array_map(static fn ($n) => $n['id'] ?? '', $public['news']);
expect(in_array('a', $ids, true), 'published true stays public');
expect(in_array('f', $ids, true), 'legacy missing published stays public');
expect(!in_array('b', $ids, true), 'published false is hidden');
expect(!in_array('c', $ids, true), 'published string false is hidden');
expect(!in_array('d', $ids, true), 'published 0 is hidden');
expect(!in_array('e', $ids, true), 'published null is hidden');

// --- Inline JSON escapes script breakouts ---
$evil = [
    'news' => [
        [
            'id' => 'xss',
            'title' => '</script><script>alert(1)</script>',
            'published' => true,
            'text' => '<!--',
            'summary' => '',
            'date' => '',
            'image' => '',
            'images' => [],
            'link' => '',
            'linkText' => '',
        ],
    ],
];
$json = json_encode(
    scouts_public_site_data($evil),
    JSON_UNESCAPED_UNICODE
    | JSON_UNESCAPED_SLASHES
    | JSON_HEX_TAG
    | JSON_HEX_AMP
    | JSON_HEX_APOS
    | JSON_HEX_QUOT
);
expect(is_string($json) && $json !== '', 'evil payload encodes');
expect(!str_contains((string) $json, '</script>'), 'encoded JSON has no raw </script>');
expect(
    str_contains((string) $json, '\\u003c') || str_contains((string) $json, '\\u003C'),
    'encoded JSON uses HEX_TAG for <'
);

// --- .htaccess must not contain HTML comments ---
$htaccess = file_get_contents(SCOUTS_ROOT . '/.htaccess') ?: '';
expect(!str_contains($htaccess, '<!--'), '.htaccess has no HTML comments');

// --- Asset version constants stay aligned in JS source ---
$js = file_get_contents(SCOUTS_ROOT . '/assets/js/script.js') ?: '';
expect(
    str_contains($js, 'IMAGE_ASSET_VERSION = "' . SCOUTS_ASSET_VERSION . '"'),
    'JS IMAGE_ASSET_VERSION matches SCOUTS_ASSET_VERSION'
);

echo "---\npassed={$passed} failed={$failed}\n";
exit($failed > 0 ? 1 : 0);
