<?php
declare(strict_types=1);

/**
 * Security / privacy regression checks (no network, no writes to site-data).
 */
require dirname(__DIR__) . '/config.php';

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
putenv('SCOUTS_TRUSTED_PROXY_IPS');
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
    'groupLeadership' => [
        ['name' => 'Public Name', 'phone' => '04 00 00 00 00'],
    ],
    'branchLeadership' => [
        'kapoenen' => [
            ['name' => 'Branch Lead', 'phone' => '04 11 11 11 11', 'takleider' => true],
        ],
    ],
    'contact' => ['email' => 'info@example.test', 'address' => 'Teststraat 1'],
    'pageContent' => [
        'over-ons' => ['intro' => 'Hallo', 'secret' => 'nope'],
        'inschrijven' => ['lidgeld' => '60', 'rekeningnummer' => 'BE00 0000 0000 0000'],
        'photos' => ['x' => 1],
    ],
    'photos' => [
        'aboutHero' => '/uploads/about.jpg',
        'logo' => '/secret-logo.png',
        'pageBackgroundsPrevious' => ['home' => '/prev.jpg'],
        'pageBackgrounds' => ['home' => '/uploads/bg-home.jpg'],
        'branches' => ['kapoenen' => '/uploads/k.jpg'],
    ],
    'activePage' => 'admin-only',
];
$public = scouts_public_site_data($sample);
$ids = array_map(static fn ($n) => $n['id'] ?? '', $public['news']);
expect(in_array('a', $ids, true), 'published true stays public');
expect(in_array('f', $ids, true), 'legacy missing published stays public');
expect(!in_array('b', $ids, true), 'published false is hidden');
expect(!in_array('c', $ids, true), 'published string false is hidden');
expect(!in_array('d', $ids, true), 'published 0 is hidden');
expect(!in_array('e', $ids, true), 'published null is hidden');

expect(!array_key_exists('activePage', $public), 'activePage stripped from public payload');
expect(!isset($public['pageContent']['photos']), 'editor pageContent.photos stripped');
expect(($public['pageContent']['over-ons']['intro'] ?? null) === 'Hallo', 'over-ons intro allowlisted');
expect(!isset($public['pageContent']['over-ons']['secret']), 'non-allowlisted pageContent key dropped');

$groupPhones = 0;
foreach ($public['groupLeadership'] as $person) {
    if (array_key_exists('phone', $person)) {
        $groupPhones++;
    }
}
expect($groupPhones === 0, 'groupLeadership phones absent from public payload');
expect(($public['groupLeadership'][0]['name'] ?? '') === 'Public Name', 'groupLeadership name kept');

$branchPhones = 0;
foreach ($public['branchLeadership']['kapoenen'] ?? [] as $person) {
    if (array_key_exists('phone', $person)) {
        $branchPhones++;
    }
}
expect($branchPhones === 0, 'branchLeadership phones absent from public payload');
expect(!empty($public['branchLeadership']['kapoenen'][0]['takleider']), 'takleider flag kept');
expect(!isset($public['photos']['logo']), 'internal photo keys not public');
expect(!isset($public['photos']['pageBackgroundsPrevious']), 'previous backgrounds not public');
expect(($public['photos']['aboutHero'] ?? '') === '/uploads/about.jpg', 'aboutHero allowlisted');

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

// --- Runtime site-data must not be tracked in Git ---
$tracked = [];
exec('git -C ' . escapeshellarg(SCOUTS_ROOT) . ' ls-files -- data/site-data.json', $tracked);
$trackedLine = trim(implode("\n", $tracked));
expect($trackedLine === '', 'data/site-data.json is not tracked by Git');

$gitignore = file_get_contents(SCOUTS_ROOT . '/.gitignore') ?: '';
expect(
    str_contains($gitignore, 'data/site-data.json'),
    '.gitignore excludes data/site-data.json'
);

// --- Default seed contains only placeholder contact patterns ---
$defaultRaw = file_get_contents(SCOUTS_DEFAULT_DATA_FILE) ?: '';
$default = json_decode($defaultRaw, true);
expect(is_array($default), 'site-data.default.json parses');
expect(
    str_contains((string) ($default['contact']['email'] ?? ''), 'voorbeeld')
    || str_contains((string) ($default['contact']['email'] ?? ''), 'example'),
    'default contact email is fictional'
);
expect(
    str_starts_with((string) ($default['pageContent']['inschrijven']['rekeningnummer'] ?? ''), 'BE00'),
    'default IBAN is a fictional placeholder'
);

// --- Public cache format uses allowlist version ---
$bundleEtag = '';
try {
    // Bundle reads live file; only assert helper encoding path when file exists.
    if (is_file(SCOUTS_DATA_FILE)) {
        $bundle = scouts_public_site_data_bundle();
        $bundleEtag = trim($bundle['etag'], '"');
        expect(str_ends_with($bundleEtag, '-p3'), 'public bundle etag uses format p3');
        $decoded = json_decode($bundle['json'], true);
        expect(is_array($decoded), 'public bundle JSON decodes');
        if (is_array($decoded)) {
            $phones = 0;
            foreach ($decoded['groupLeadership'] ?? [] as $person) {
                if (is_array($person) && array_key_exists('phone', $person)) {
                    $phones++;
                }
            }
            expect($phones === 0, 'live public bundle has no group phones');
        }
    } else {
        expect(true, 'public bundle check skipped (no runtime site-data)');
    }
} catch (Throwable $e) {
    expect(false, 'public bundle check: ' . $e->getMessage());
}

echo "---\npassed={$passed} failed={$failed}\n";
exit($failed > 0 ? 1 : 0);
