<?php
declare(strict_types=1);

/**
 * Weekly Drive backup helpers + mocked upload paths (no network / no real Drive).
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

// --- Config ---
expect(
    scouts_google_drive_backup_config_ok(null, null, 'folder') === false,
    'missing Drive auth is not configured'
);
expect(
    scouts_google_drive_backup_config_ok(
        ['refresh_token' => 'r', 'client_id' => 'c', 'client_secret' => 's'],
        null,
        ''
    ) === false,
    'empty backup folder is not configured'
);
expect(
    scouts_google_drive_backup_config_ok(
        ['refresh_token' => 'r', 'client_id' => 'c', 'client_secret' => 's'],
        null,
        'folder-1'
    ) === true,
    'oauth + folder is configured'
);
expect(
    scouts_google_drive_backup_config_ok(null, ['client_email' => 'a@b.c'], 'folder-1') === true,
    'service account + folder is configured'
);

// --- Payload validation ---
expect(
    scouts_google_drive_backup_read_payload('{"ok":true}') === '{"ok":true}',
    'valid JSON payload is accepted'
);
$invalidPayload = false;
try {
    scouts_google_drive_backup_read_payload('{broken');
} catch (Throwable $error) {
    $invalidPayload = true;
}
expect($invalidPayload, 'invalid JSON payload is rejected');
$emptyPayload = false;
try {
    scouts_google_drive_backup_read_payload('');
} catch (Throwable $error) {
    $emptyPayload = true;
}
expect($emptyPayload, 'empty payload is rejected');

// --- Create vs update / restore decisions ---
expect(
    scouts_google_drive_resolve_backup_upsert([], '') === ['action' => 'create', 'fileId' => ''],
    'first weekly backup decides create'
);
expect(
    scouts_google_drive_resolve_backup_upsert(
        [['id' => 'file-w44']],
        'file-w44'
    ) === ['action' => 'update', 'fileId' => 'file-w44'],
    'existing weekly file decides update (overwrite)'
);
expect(
    scouts_google_drive_resolve_backup_upsert(
        [['id' => 'file-trashed']],
        ''
    ) === ['action' => 'create', 'fileId' => ''],
    'unusable/deleted found file falls back to create'
);

expect(
    scouts_google_drive_file_usable_in_folder(
        ['id' => 'f1', 'trashed' => true, 'parents' => ['folder-1']],
        'folder-1'
    ) === false,
    'trashed backup file is not usable until restored'
);
expect(
    scouts_google_drive_file_usable_in_folder(null, 'folder-1') === false,
    'missing backup file is not usable'
);

// --- Mocked upload paths (no network) ---
$baseHooks = [
    'credentials' => static fn(): ?array => null,
    'oauth_data' => static fn(): ?array => [
        'refresh_token' => 'r',
        'client_id' => 'c',
        'client_secret' => 's',
    ],
    'folder_id' => static fn(): string => 'backup-folder',
    'read_site_data' => static fn(): string => '{"hello":"world"}',
    'access_token' => static fn(?array $c): string => 'token',
];

$created = [];
$updated = [];
$first = scouts_google_drive_upload_site_backup($week, $baseHooks + [
    'find' => static fn(): array => [],
    'prepare' => static fn(): ?string => null,
    'update' => static function () use (&$updated): void {
        $updated[] = 'should-not-run';
    },
    'create' => static function (
        string $token,
        string $folderId,
        string $filename,
        string $contents,
        string $mime
    ) use (&$created): string {
        $created[] = compact('folderId', 'filename', 'contents', 'mime');
        return 'new-file-1';
    },
]);
expect($first['updated'] === false && $first['fileId'] === 'new-file-1', 'mocked first upload creates file');
expect(
    ($created[0]['filename'] ?? '') === 'scouts-site-data-2026-W44.json'
        && ($created[0]['mime'] ?? '') === 'application/json',
    'mocked create uses weekly JSON name and mime'
);
expect($updated === [], 'mocked first upload does not update');

$created = [];
$updated = [];
$again = scouts_google_drive_upload_site_backup($week, $baseHooks + [
    'find' => static fn(): array => [['id' => 'existing-w44']],
    'prepare' => static fn(): ?string => 'existing-w44',
    'update' => static function (
        string $token,
        string $fileId,
        string $contents,
        string $mime
    ) use (&$updated): void {
        $updated[] = compact('fileId', 'contents', 'mime');
    },
    'create' => static function () use (&$created): string {
        $created[] = 'should-not-run';
        return 'x';
    },
]);
expect($again['updated'] === true && $again['fileId'] === 'existing-w44', 'mocked re-upload updates same week file');
expect(($updated[0]['fileId'] ?? '') === 'existing-w44', 'mocked update targets existing id');
expect($created === [], 'mocked re-upload does not create');

$created = [];
$restored = scouts_google_drive_upload_site_backup($week, $baseHooks + [
    'find' => static fn(): array => [['id' => 'gone']],
    'prepare' => static fn(): ?string => null, // permanently deleted / unrestorable
    'update' => static function (): void {
        throw new RuntimeException('should not update');
    },
    'create' => static function () use (&$created): string {
        $created[] = 'recreate';
        return 'recreated-1';
    },
]);
expect(
    $restored['updated'] === false && $restored['fileId'] === 'recreated-1' && $created === ['recreate'],
    'mocked deleted Drive file recreates instead of updating'
);

$driveError = false;
try {
    scouts_google_drive_upload_site_backup($week, $baseHooks + [
        'find' => static function (): array {
            throw new RuntimeException('Drive search HTTP 500');
        },
        'prepare' => static fn(): ?string => null,
        'update' => static function (): void {},
        'create' => static fn(): string => 'x',
    ]);
} catch (Throwable $error) {
    $driveError = str_contains($error->getMessage(), 'Drive search HTTP 500');
}
expect($driveError, 'mocked Drive API failure propagates');

$badConfig = false;
try {
    scouts_google_drive_upload_site_backup($week, [
        'credentials' => static fn(): ?array => null,
        'oauth_data' => static fn(): ?array => null,
        'folder_id' => static fn(): string => 'backup-folder',
        'read_site_data' => static fn(): string => '{}',
        'access_token' => static fn(): string => 'token',
        'find' => static fn(): array => [],
        'prepare' => static fn(): ?string => null,
        'update' => static function (): void {},
        'create' => static fn(): string => 'x',
    ]);
} catch (Throwable $error) {
    $badConfig = str_contains($error->getMessage(), 'niet geconfigureerd');
}
expect($badConfig, 'mocked missing auth refuses backup');

// --- Cron secret gate (never starts backup on bad secret) ---
echo "=== Cron backup auth ===\n";
$secret = 'abcdefghijklmnopqrstuvwxyz012345';
expect(
    scouts_cron_provided_secret('header-secret', 'query-secret') === 'header-secret',
    'cron prefers header secret over query token'
);
expect(
    scouts_cron_provided_secret('', 'query-secret') === 'query-secret',
    'cron falls back to query token when header empty'
);
expect(
    scouts_cron_secret_status('', 'anything') === 'not_configured',
    'empty cron secret is not configured'
);
expect(
    scouts_cron_secret_status('short', 'short') === 'not_configured',
    'short cron secret is not configured'
);
expect(
    scouts_cron_secret_status($secret, '') === 'forbidden',
    'missing provided secret is forbidden'
);
expect(
    scouts_cron_secret_status($secret, 'wrong-secret-value-here') === 'forbidden',
    'wrong provided secret is forbidden'
);
expect(
    scouts_cron_secret_status($secret, $secret) === 'ok',
    'matching secret is ok'
);
expect(
    scouts_cron_secret_status($secret, 'wrong') !== 'ok'
        && scouts_cron_secret_status('', $secret) !== 'ok',
    'missing/wrong secrets never reach ok (backup must not start)'
);

echo "---\npassed={$passed} failed={$failed}\n";
exit($failed > 0 ? 1 : 0);
