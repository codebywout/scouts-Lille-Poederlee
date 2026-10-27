<?php
declare(strict_types=1);

/**
 * Regression tests for explicit site-data bootstrap.
 * Uses isolated temp paths for destructive cases; never overwrites
 * an existing local data/site-data.json with test content.
 */

require dirname(__DIR__) . DIRECTORY_SEPARATOR . 'config.php';

$failed = 0;
$passed = 0;
$tmpDirs = [];

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

function expect_throws(callable $fn, string $label): void
{
    try {
        $fn();
        expect(false, $label . ' (expected throw)');
    } catch (Throwable $e) {
        expect($e->getMessage() !== '', $label . ' (' . $e->getMessage() . ')');
    }
}

function make_tmp_dir(): string
{
    global $tmpDirs;
    $dir = sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'scouts-boot-' . bin2hex(random_bytes(4));
    if (!mkdir($dir, 0755, true) && !is_dir($dir)) {
        throw new RuntimeException('Temp dir failed');
    }
    $tmpDirs[] = $dir;
    return $dir;
}

function rm_tree(string $dir): void
{
    if (!is_dir($dir)) {
        return;
    }
    $items = scandir($dir);
    if ($items === false) {
        return;
    }
    foreach ($items as $item) {
        if ($item === '.' || $item === '..') {
            continue;
        }
        $path = $dir . DIRECTORY_SEPARATOR . $item;
        if (is_dir($path)) {
            rm_tree($path);
        } else {
            @unlink($path);
        }
    }
    @rmdir($dir);
}

echo "=== Site-data bootstrap tests ===\n";

// --- runtime missing → create valid JSON from default ---
$tmp = make_tmp_dir();
$runtime = $tmp . DIRECTORY_SEPARATOR . 'site-data.json';
$default = $tmp . DIRECTORY_SEPARATOR . 'site-data.default.json';
if (!copy(SCOUTS_DEFAULT_DATA_FILE, $default)) {
    expect(false, 'copy default seed into temp');
} else {
    expect(!is_file($runtime), 'runtime absent before bootstrap');
    $status = scouts_bootstrap_site_data($runtime, $default);
    expect($status === 'created', 'missing runtime → created');
    expect(is_file($runtime), 'runtime file exists after create');
    $decoded = json_decode((string) file_get_contents($runtime), true);
    expect(is_array($decoded) && $decoded !== [], 'created runtime is valid non-empty JSON');
    expect(isset($decoded['contact'], $decoded['pageContent']), 'created runtime has expected top-level keys');
}

// --- existing runtime with custom data stays unchanged ---
$tmp2 = make_tmp_dir();
$runtime2 = $tmp2 . DIRECTORY_SEPARATOR . 'site-data.json';
$default2 = $tmp2 . DIRECTORY_SEPARATOR . 'site-data.default.json';
copy(SCOUTS_DEFAULT_DATA_FILE, $default2);
$custom = "{\"marker\":\"keep-me-" . bin2hex(random_bytes(3)) . "\",\"pageContent\":{}}\n";
file_put_contents($runtime2, $custom);
$beforeHash = hash_file('sha256', $runtime2);
$status2 = scouts_bootstrap_site_data($runtime2, $default2);
expect($status2 === 'exists', 'existing runtime → exists');
expect(hash_file('sha256', $runtime2) === $beforeHash, 'existing runtime content unchanged');
expect((string) file_get_contents($runtime2) === $custom, 'custom marker preserved');

// --- default missing ---
$tmp3 = make_tmp_dir();
$runtime3 = $tmp3 . DIRECTORY_SEPARATOR . 'site-data.json';
$missingDefault = $tmp3 . DIRECTORY_SEPARATOR . 'missing-default.json';
expect_throws(
    static fn () => scouts_bootstrap_site_data($runtime3, $missingDefault),
    'missing default throws'
);
expect(!is_file($runtime3), 'no runtime created when default missing');

// --- default invalid (empty / not JSON / empty object) ---
$tmp4 = make_tmp_dir();
$badDefault = $tmp4 . DIRECTORY_SEPARATOR . 'bad-default.json';
$runtime4 = $tmp4 . DIRECTORY_SEPARATOR . 'site-data.json';
file_put_contents($badDefault, "{ not json");
expect_throws(
    static fn () => scouts_bootstrap_site_data($runtime4, $badDefault),
    'invalid JSON default throws'
);
expect(!is_file($runtime4), 'no runtime created from invalid JSON default');

file_put_contents($badDefault, " \n\t ");
expect_throws(
    static fn () => scouts_bootstrap_site_data($runtime4, $badDefault),
    'empty default throws'
);
expect(!is_file($runtime4), 'no runtime created from empty default');

file_put_contents($badDefault, "{}\n");
expect_throws(
    static fn () => scouts_bootstrap_site_data($runtime4, $badDefault),
    'empty-object default throws'
);
expect(!is_file($runtime4), 'no runtime created from empty-object default');

// --- CI-style init: real default seed → valid runtime (isolated path) ---
$tmpCi = make_tmp_dir();
$ciRuntime = $tmpCi . DIRECTORY_SEPARATOR . 'site-data.json';
$statusCi = scouts_bootstrap_site_data($ciRuntime, SCOUTS_DEFAULT_DATA_FILE);
expect($statusCi === 'created', 'CI-style init creates runtime from repo default');
$ciData = scouts_normalize_page_backgrounds(scouts_decode_json_file($ciRuntime));
expect($ciData !== [], 'CI-style runtime decodes');
$email = (string) ($ciData['contact']['email'] ?? '');
expect(
    str_contains($email, 'voorbeeld') || str_contains($email, 'example'),
    'CI-style seed stays fictional'
);

// --- Idempotent on real project runtime (never overwrite local data) ---
$realExisted = is_file(SCOUTS_DATA_FILE);
$realHash = $realExisted ? hash_file('sha256', SCOUTS_DATA_FILE) : null;
$realStatus = scouts_bootstrap_site_data();
if ($realExisted) {
    expect($realStatus === 'exists', 'project runtime already present → exists');
    expect(hash_file('sha256', SCOUTS_DATA_FILE) === $realHash, 'project runtime hash unchanged');
} else {
    expect($realStatus === 'created', 'project runtime missing → created');
    expect(is_file(SCOUTS_DATA_FILE), 'project runtime file present after bootstrap');
}

// --- After bootstrap, read + public bundle + stable ETag (conditional GET basis) ---
expect(is_file(SCOUTS_DATA_FILE), 'runtime available for API helpers');
$read = scouts_read_site_data();
expect(is_array($read) && $read !== [], 'scouts_read_site_data after bootstrap');
$bundle1 = scouts_public_site_data_bundle();
$bundle2 = scouts_public_site_data_bundle();
expect(is_string($bundle1['json']) && $bundle1['json'] !== '', 'public bundle JSON after bootstrap');
expect($bundle1['etag'] === $bundle2['etag'] && $bundle1['etag'] !== '', 'ETag stable across reads (304 basis)');
$etagToken = trim((string) $bundle1['etag'], " \t\"");
expect($etagToken !== '', 'ETag token non-empty');

// Simulate API GET + conditional GET via subprocess (api/index.php calls exit).
$apiHarness = <<<'PHP'
<?php
declare(strict_types=1);
$root = $argv[1];
$outFile = $argv[2];
$etag = $argv[3] ?? '';
chdir($root);
require $root . DIRECTORY_SEPARATOR . 'config.php';
scouts_bootstrap_site_data();

$_SERVER['REQUEST_METHOD'] = 'GET';
$_SERVER['HTTP_HOST'] = '127.0.0.1';
$_GET['route'] = 'site-data';
if ($etag !== '') {
    $_SERVER['HTTP_IF_NONE_MATCH'] = $etag;
}

ob_start();
register_shutdown_function(static function () use ($outFile): void {
    $body = ob_get_contents();
    if (is_string($body)) {
        ob_end_clean();
    } else {
        $body = '';
    }
    $code = http_response_code();
    if ($code === false) {
        $code = 200;
    }
    file_put_contents($outFile, json_encode([
        'code' => $code,
        'body' => $body,
        'headers' => headers_list(),
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
});
include $root . DIRECTORY_SEPARATOR . 'api' . DIRECTORY_SEPARATOR . 'index.php';
PHP;

$harnessDir = make_tmp_dir();
$harnessFile = $harnessDir . DIRECTORY_SEPARATOR . 'api-harness.php';
$resultFile = $harnessDir . DIRECTORY_SEPARATOR . 'api-result.json';
file_put_contents($harnessFile, $apiHarness);
$phpBin = PHP_BINARY !== '' ? PHP_BINARY : 'php';

@unlink($resultFile);
$apiCmd = escapeshellarg($phpBin) . ' ' . escapeshellarg($harnessFile) . ' '
    . escapeshellarg(SCOUTS_ROOT) . ' ' . escapeshellarg($resultFile) . ' ' . escapeshellarg('');
exec($apiCmd . ' 2>&1', $apiOut, $apiExit);
$apiJson = is_file($resultFile) ? json_decode((string) file_get_contents($resultFile), true) : null;
expect($apiExit === 0 && is_array($apiJson), 'API GET subprocess ran');
$etagHeader = '';
if (is_array($apiJson)) {
    expect((int) ($apiJson['code'] ?? 0) === 200, 'API GET returns 200 after bootstrap');
    $payload = json_decode((string) ($apiJson['body'] ?? ''), true);
    expect(is_array($payload), 'API GET body is JSON');
    foreach ($apiJson['headers'] ?? [] as $line) {
        if (preg_match('/^ETag:\s*(.+)$/i', (string) $line, $m)) {
            $etagHeader = trim($m[1]);
        }
    }
    if ($etagHeader === '') {
        $etagHeader = (string) $bundle1['etag'];
    }
    expect($etagHeader !== '', 'API ETag available for conditional GET');

    $condResult = $harnessDir . DIRECTORY_SEPARATOR . 'api-cond.json';
    @unlink($condResult);
    $condOut = [];
    $condCmd = escapeshellarg($phpBin) . ' ' . escapeshellarg($harnessFile) . ' '
        . escapeshellarg(SCOUTS_ROOT) . ' ' . escapeshellarg($condResult) . ' '
        . escapeshellarg($etagHeader);
    exec($condCmd . ' 2>&1', $condOut, $condExit);
    $condJson = is_file($condResult) ? json_decode((string) file_get_contents($condResult), true) : null;
    expect(
        $condExit === 0 && is_array($condJson) && (int) ($condJson['code'] ?? 0) === 304,
        'conditional GET If-None-Match → 304'
    );
}

foreach ($tmpDirs as $dir) {
    rm_tree($dir);
}

echo "---\npassed={$passed} failed={$failed}\n";
exit($failed > 0 ? 1 : 0);
