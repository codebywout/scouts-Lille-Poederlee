<?php
declare(strict_types=1);

/**
 * Maandplanning upload lifecycle: fixed basename must not be deleted while referenced.
 *
 * No network. Uses an isolated uploads dir + temporary site-data file.
 */
$root = dirname(__DIR__);
$tmpRoot = sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'scouts-planning-' . bin2hex(random_bytes(4));
$uploadsDir = $tmpRoot . DIRECTORY_SEPARATOR . 'uploads';
$dataDir = $tmpRoot . DIRECTORY_SEPARATOR . 'data';
if (!mkdir($uploadsDir, 0755, true) || !mkdir($dataDir, 0755, true)) {
    fwrite(STDERR, "Could not create temp dirs\n");
    exit(1);
}

putenv('SCOUTS_TEST_UPLOADS_DIR=' . $uploadsDir);
$_ENV['SCOUTS_TEST_UPLOADS_DIR'] = $uploadsDir;

require $root . '/config.php';

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

echo "=== Planning upload lifecycle ===\n";

$filename = 'maandplanning-kapoenen.pdf';
$path = SCOUTS_UPLOADS_DIR . DIRECTORY_SEPARATOR . $filename;
expect(file_put_contents($path, "%PDF-1.4 test") !== false, 'seed planning PDF on disk');
expect(is_file($path), 'planning PDF exists before reference check');

$siteData = [
    'photos' => [
        'monthlyPlanning' => [
            'kapoenen' => '/uploads/' . $filename . '?v=123',
        ],
    ],
];
$referenced = scouts_collect_referenced_uploads($siteData);
expect(isset($referenced[$filename]), 'fixed planning basename is collected as referenced');

$unreferenced = scouts_collect_referenced_uploads([
    'photos' => ['monthlyPlanning' => ['kapoenen' => '']],
]);
expect(!isset($unreferenced[$filename]), 'cleared planning path is not referenced');

// Simulate replace: same basename still referenced after "new" upload path is saved.
$afterReplace = $siteData;
$afterReplace['photos']['monthlyPlanning']['kapoenen'] = '/uploads/' . $filename . '?v=999';
$refsAfter = scouts_collect_referenced_uploads($afterReplace);
expect(isset($refsAfter[$filename]), 'replaced planning with same basename stays referenced');

// Orphan logic (same rule as purge): referenced basenames in uploads/ are kept.
$orphans = [];
$entries = scandir(SCOUTS_UPLOADS_DIR) ?: [];
foreach ($entries as $entry) {
    if ($entry === '.' || $entry === '..' || !is_file(SCOUTS_UPLOADS_DIR . DIRECTORY_SEPARATOR . $entry)) {
        continue;
    }
    if (!isset($refsAfter[$entry])) {
        $orphans[] = $entry;
    }
}
expect(!in_array($filename, $orphans, true), 'referenced planning PDF is not treated as orphan');

// Letters use unique names — deleting old letter basename is fine when unreferenced.
$letterOld = 'brief-kapoenen-aaaaaaaaaaaaaaaa.pdf';
$letterNew = 'brief-kapoenen-bbbbbbbbbbbbbbbb.pdf';
file_put_contents(SCOUTS_UPLOADS_DIR . DIRECTORY_SEPARATOR . $letterOld, "%PDF-1.4 old");
file_put_contents(SCOUTS_UPLOADS_DIR . DIRECTORY_SEPARATOR . $letterNew, "%PDF-1.4 new");
$letterData = [
    'letters' => [
        'kapoenen' => [
            ['title' => 'Nieuwe brief', 'path' => '/uploads/' . $letterNew . '?v=1'],
        ],
    ],
];
$letterRefs = scouts_collect_referenced_uploads($letterData);
expect(isset($letterRefs[$letterNew]), 'new letter basename referenced');
expect(!isset($letterRefs[$letterOld]), 'old letter basename not referenced after replace');

// Cleanup temp tree
$iterator = new RecursiveIteratorIterator(
    new RecursiveDirectoryIterator($tmpRoot, FilesystemIterator::SKIP_DOTS),
    RecursiveIteratorIterator::CHILD_FIRST
);
foreach ($iterator as $fileInfo) {
    $fileInfo->isDir() ? @rmdir($fileInfo->getPathname()) : @unlink($fileInfo->getPathname());
}
@rmdir($tmpRoot);

echo "---\npassed={$passed} failed={$failed}\n";
exit($failed > 0 ? 1 : 0);
