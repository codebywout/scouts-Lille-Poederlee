<?php
declare(strict_types=1);

/**
 * Non-destructive HTTP smoke tests against a running local server.
 * Usage: php tools/smoke-http.php [baseUrl]
 * Default baseUrl: http://localhost:8000
 *
 * Ensures runtime site-data exists via explicit bootstrap (never overwrites).
 */

require dirname(__DIR__) . DIRECTORY_SEPARATOR . 'config.php';

$base = rtrim($argv[1] ?? 'http://localhost:8000', '/');
$failed = 0;
$passed = 0;
$skipped = 0;

function smoke_request(string $method, string $url, array $opts = []): array
{
    $headers = $opts['headers'] ?? [];
    $body = $opts['body'] ?? null;
    $headerLines = [];
    foreach ($headers as $name => $value) {
        $headerLines[] = $name . ': ' . $value;
    }
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_CUSTOMREQUEST => $method,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HEADER => true,
        CURLOPT_TIMEOUT => 20,
        CURLOPT_FOLLOWLOCATION => false,
        CURLOPT_HTTPHEADER => $headerLines,
        CURLOPT_POSTFIELDS => $body,
    ]);
    $raw = curl_exec($ch);
    $errno = curl_errno($ch);
    $error = curl_error($ch);
    $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    $headerSize = (int) curl_getinfo($ch, CURLINFO_HEADER_SIZE);
    if ($raw === false) {
        return ['status' => 0, 'headers' => '', 'body' => '', 'error' => $error !== '' ? $error : ('curl ' . $errno)];
    }
    return [
        'status' => $status,
        'headers' => substr($raw, 0, $headerSize),
        'body' => substr($raw, $headerSize),
        'error' => '',
    ];
}

function smoke_assert(string $name, bool $ok, string $detail = ''): void
{
    global $failed, $passed;
    if ($ok) {
        $passed++;
        echo "  OK  {$name}\n";
        return;
    }
    $failed++;
    echo "FAIL  {$name}" . ($detail !== '' ? " — {$detail}" : '') . "\n";
}

function smoke_expect_status(string $name, string $method, string $url, int $expected, array $opts = []): array
{
    $res = smoke_request($method, $url, $opts);
    if ($res['error'] !== '') {
        smoke_assert($name, false, $res['error']);
        return $res;
    }
    smoke_assert($name, $res['status'] === $expected, "expected {$expected}, got {$res['status']}");
    return $res;
}

echo "=== HTTP smoke against {$base} ===\n";

try {
    $boot = scouts_bootstrap_site_data();
    smoke_assert(
        'bootstrap runtime site-data',
        $boot === 'created' || $boot === 'exists',
        $boot
    );
} catch (Throwable $e) {
    smoke_assert('bootstrap runtime site-data', false, $e->getMessage());
}

$pages = [
    '/' => 200,
    '/over-ons' => 200,
    '/inschrijven' => 200,
    '/nieuws' => 200,
    '/uniform' => 200,
    '/tweedehands' => 200,
    '/kapoenen' => 200,
    '/welpen' => 200,
    '/jongverkenners' => 200,
    '/verkenners' => 200,
    '/jins' => 200,
    '/privacybeleid' => 200,
    '/login' => 200,
    '/404' => 404,
    '/does-not-exist' => 404,
];

foreach ($pages as $path => $status) {
    smoke_expect_status("GET {$path}", 'GET', $base . $path, $status);
}

smoke_expect_status('GET /assets/css/style.css', 'GET', $base . '/assets/css/style.css', 200);
smoke_expect_status('GET /assets/js/script.js', 'GET', $base . '/assets/js/script.js', 200);
smoke_expect_status('GET /assets/js/script.min.js', 'GET', $base . '/assets/js/script.min.js', 200);
$sitemap = smoke_expect_status('GET /sitemap.xml', 'GET', $base . '/sitemap.xml', 200);
if ($sitemap['status'] === 200) {
    $ctype = '';
    if (preg_match('/^Content-Type:\s*([^\r\n;]+)/mi', $sitemap['headers'], $m)) {
        $ctype = strtolower(trim($m[1]));
    }
    smoke_assert('sitemap Content-Type xml', str_contains($ctype, 'xml'), $ctype);
    $doc = new DOMDocument();
    $parsed = @$doc->loadXML($sitemap['body']);
    smoke_assert('sitemap XML parse', $parsed === true);
    if ($parsed) {
        $xpath = new DOMXPath($doc);
        $xpath->registerNamespace('s', 'http://www.sitemaps.org/schemas/sitemap/0.9');
        $locs = $xpath->query('//s:loc');
        smoke_assert('sitemap has urls', $locs !== false && $locs->length > 0, 'count=' . ($locs ? $locs->length : 0));
        $seen = [];
        $dup = false;
        $badHost = false;
        if ($locs) {
            foreach ($locs as $node) {
                $loc = $node->textContent;
                if (isset($seen[$loc])) {
                    $dup = true;
                }
                $seen[$loc] = true;
                if (!str_starts_with($loc, 'https://scoutslille.be')) {
                    $badHost = true;
                }
            }
        }
        smoke_assert('sitemap no duplicate locs', !$dup);
        smoke_assert('sitemap canonical host', !$badHost);
        smoke_assert('sitemap excludes /login', !isset($seen['https://scoutslille.be/login']));
        smoke_assert('sitemap excludes /admin', !isset($seen['https://scoutslille.be/admin']));
    }
}

$robots = smoke_expect_status('GET /robots.txt', 'GET', $base . '/robots.txt', 200);
if ($robots['status'] === 200) {
    smoke_assert(
        'robots.txt points to sitemap.xml',
        str_contains($robots['body'], 'Sitemap: https://scoutslille.be/sitemap.xml')
    );
}

$admin = smoke_expect_status('GET /admin → 302', 'GET', $base . '/admin', 302);
if ($admin['status'] === 302) {
    smoke_assert('admin Location /login', (bool) preg_match('#^Location:\s*/login#mi', $admin['headers']));
}

// 403 (Apache/LiteSpeed [F]) and 404 (PHP router) both mean "not publicly readable".
foreach ([
    '/config.php',
    '/router.php',
    '/auth-config.php',
    '/google-drive.php',
    '/sitemap.php',
    '/data/site-data.json',
    '/includes/site-chrome.php',
    '/tools/smoke-http.php',
    '/uploads/originals/',
    '/.env',
    '/.user.ini',
    '/README.md',
    '/docs/',
    '/docs/technische-handleiding.md',
] as $blocked) {
    $res = smoke_request('GET', $base . $blocked);
    if ($res['error'] !== '') {
        smoke_assert("blocked {$blocked}", false, $res['error']);
        continue;
    }
    smoke_assert(
        "blocked {$blocked}",
        in_array($res['status'], [403, 404], true),
        "expected 403 or 404, got {$res['status']}"
    );
}

$siteData = smoke_expect_status('GET /api/site-data', 'GET', $base . '/api/site-data', 200);
$siteDataEtag = '';
if ($siteData['status'] === 200) {
    $json = json_decode($siteData['body'], true);
    smoke_assert('site-data JSON', is_array($json), json_last_error_msg());
    if (is_array($json)) {
        $missingPhoneKey = 0;
        foreach ($json['groupLeadership'] ?? [] as $person) {
            if (is_array($person) && !array_key_exists('phone', $person)) {
                $missingPhoneKey++;
            }
        }
        foreach ($json['branchLeadership'] ?? [] as $list) {
            if (!is_array($list)) {
                continue;
            }
            foreach ($list as $person) {
                if (is_array($person) && !array_key_exists('phone', $person)) {
                    $missingPhoneKey++;
                }
            }
        }
        smoke_assert(
            'public site-data keeps leadership phone fields',
            $missingPhoneKey === 0,
            "missing={$missingPhoneKey}"
        );
    }
    if (preg_match('/^ETag:\s*([^\r\n]+)/mi', $siteData['headers'], $etagMatch)) {
        $siteDataEtag = trim($etagMatch[1]);
    }
    if ($siteDataEtag !== '') {
        $revalidate = smoke_request('GET', $base . '/api/site-data', [
            'headers' => ['If-None-Match' => $siteDataEtag],
        ]);
        smoke_assert(
            'site-data If-None-Match returns 304',
            $revalidate['status'] === 304,
            "expected 304, got {$revalidate['status']}"
        );
    } else {
        smoke_assert('site-data ETag header present', false);
    }
}

$session = smoke_expect_status('GET /api/session', 'GET', $base . '/api/session', 200);
if ($session['status'] === 200) {
    $json = json_decode($session['body'], true);
    smoke_assert('session unauthenticated', ($json['authenticated'] ?? null) === false);
}

$origin = ['Origin' => $base, 'Content-Type' => 'application/json'];
smoke_expect_status('POST /api/logout unauth', 'POST', $base . '/api/logout', 401, [
    'headers' => $origin,
    'body' => '{}',
]);
smoke_expect_status('POST /api/site-data unauth', 'POST', $base . '/api/site-data', 401, [
    'headers' => $origin,
    'body' => '{}',
]);
smoke_expect_status('POST /api/login empty', 'POST', $base . '/api/login', 400, [
    'headers' => $origin,
    'body' => '{"username":"","password":""}',
]);
smoke_expect_status('POST /api/login bad origin', 'POST', $base . '/api/login', 403, [
    'headers' => ['Origin' => 'https://evil.example', 'Content-Type' => 'application/json'],
    'body' => '{"username":"a","password":"b"}',
]);
smoke_expect_status('GET /api/nope', 'GET', $base . '/api/nope', 404);

echo "---\npassed={$passed} failed={$failed} skipped={$skipped}\n";
exit($failed > 0 ? 1 : 0);
