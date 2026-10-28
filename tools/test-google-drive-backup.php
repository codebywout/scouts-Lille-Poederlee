<?php
declare(strict_types=1);

/**
 * Weekly Drive backup helpers (no network).
 */
require dirname(__DIR__) . '/config.php';
require_once dirname(__DIR__) . '/google-drive.php';

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

echo "=== Google Drive weekly site-data backup ===\n";

expect(
    scouts_google_drive_backup_folder_id() === '1d494gLWlxCcxmUN7b9TdPer1IbliEp_6',
    'default backup folder id matches configured Drive map'
);

$week = new DateTimeImmutable('2026-10-28'); // Wednesday → ISO week 44 of 2026
expect(
    scouts_google_drive_backup_filename($week) === 'scouts-site-data-2026-W44.json',
    'weekly filename uses ISO year and week'
);

$sameWeek = new DateTimeImmutable('2026-10-30');
expect(
    scouts_google_drive_backup_filename($week) === scouts_google_drive_backup_filename($sameWeek),
    'same ISO week reuses the same backup filename'
);

$nextWeek = new DateTimeImmutable('2026-11-02');
expect(
    scouts_google_drive_backup_filename($week) !== scouts_google_drive_backup_filename($nextWeek),
    'next ISO week gets a new backup filename'
);

echo "---\npassed={$passed} failed={$failed}\n";
exit($failed > 0 ? 1 : 0);
