<?php
declare(strict_types=1);

/**
 * Google Drive maandplanning upsert helpers (no network, no Drive API calls).
 * Identity: {tak}_{maanden}_{jaar}.pdf
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

echo "=== Google Drive planning upsert (tak_maanden_jaar) ===\n";

expect(
    scouts_google_drive_planning_title_part('oktober november') === 'oktober_november',
    'title months become underscored slug'
);
expect(
    scouts_google_drive_planning_title_part('Oktober') === 'oktober',
    'title is lowercased'
);
expect(
    scouts_google_drive_planning_title_part('') === 'planning',
    'empty title falls back to planning'
);

expect(
    scouts_google_drive_planning_filename('kapoenen', 'oktober', 2026) === 'kapoenen_oktober_2026.pdf',
    'Drive name is tak_maand_jaar'
);
expect(
    scouts_google_drive_planning_filename('Kapoenen', 'oktober november', 2026)
        === 'kapoenen_oktober_november_2026.pdf',
    'multi-month title stays in one filename'
);
expect(
    scouts_google_drive_planning_filename('welpen', 'oktober', 2026) === 'welpen_oktober_2026.pdf',
    'other branch gets its own filename'
);
expect(
    scouts_google_drive_planning_filename('kapoenen', 'november', 2026) === 'kapoenen_november_2026.pdf',
    'next month gets a different filename'
);
expect(
    scouts_google_drive_planning_filename('kapoenen', 'oktober', 2027) === 'kapoenen_oktober_2027.pdf',
    'next year gets a different filename'
);

$dec2026 = new DateTimeImmutable('2026-12-15');
$jan2027 = new DateTimeImmutable('2027-01-10');
$okt2026 = new DateTimeImmutable('2026-10-05');
expect(
    scouts_google_drive_planning_year('januari', $dec2026) === 2027,
    'januari uploaded in december uses next calendar year'
);
expect(
    scouts_google_drive_planning_filename('kapoenen', 'januari', null, $dec2026)
        === 'kapoenen_januari_2027.pdf',
    'december upload of januari becomes …_januari_2027.pdf'
);
expect(
    scouts_google_drive_planning_year('oktober', $dec2026) === 2026,
    'oktober uploaded in december stays current autumn year'
);
expect(
    scouts_google_drive_planning_year('januari', $jan2027) === 2027,
    'januari uploaded in januari keeps that year'
);
expect(
    scouts_google_drive_planning_year('oktober', $okt2026) === 2026,
    'oktober uploaded in oktober keeps that year'
);
expect(
    scouts_google_drive_planning_year('december januari', $dec2026) === 2027,
    'span across year-end uses the later scout-year calendar year'
);

$keyOct = scouts_google_drive_planning_id_key('kapoenen', 'oktober', 2026);
$keyNov = scouts_google_drive_planning_id_key('kapoenen', 'november', 2026);
$keyWel = scouts_google_drive_planning_id_key('welpen', 'oktober', 2026);
expect($keyOct === 'kapoenen_oktober_2026', 'id key matches basename without .pdf');
expect($keyOct !== $keyNov, 'different months use different id keys');
expect($keyOct !== $keyWel, 'different branches use different id keys');

expect(
    scouts_google_drive_escape_query_value("O'Brien") === "O\\'Brien",
    'query escaping escapes single quotes'
);

// First upload for a period: no known id, no search hits → create
$first = scouts_google_drive_resolve_planning_upsert($keyOct, [], []);
expect($first['action'] === 'create' && $first['fileId'] === '', 'first upload for period decides create');

// Second version of same period → update stored id
$known = [
    $keyOct => 'file-kap-oct-1',
    $keyWel => 'file-wel-oct-1',
];
$again = scouts_google_drive_resolve_planning_upsert($keyOct, $known, []);
expect(
    $again['action'] === 'update' && $again['fileId'] === 'file-kap-oct-1',
    're-upload same month/year updates that Drive file'
);

// Next month → create (must not reuse oktober id)
$nextMonth = scouts_google_drive_resolve_planning_upsert($keyNov, $known, []);
expect(
    $nextMonth['action'] === 'create' && $nextMonth['fileId'] === '',
    'new month creates a new Drive file instead of overwriting previous month'
);

// Other branch same month → own id
$otherBranch = scouts_google_drive_resolve_planning_upsert($keyWel, $known, []);
expect(
    $otherBranch['action'] === 'update' && $otherBranch['fileId'] === 'file-wel-oct-1',
    'other branch same month uses its own stored id'
);
expect($otherBranch['fileId'] !== $again['fileId'], 'branches do not share Drive file ids');

// No stored id, but search finds existing period file → update
$found = scouts_google_drive_resolve_planning_upsert(
    $keyOct,
    [],
    [['id' => 'file-kap-oct-existing', 'name' => 'kapoenen_oktober_2026.pdf']]
);
expect(
    $found['action'] === 'update' && $found['fileId'] === 'file-kap-oct-existing',
    'search hit without stored id still updates that period file'
);

// Prefer newest when duplicates of same period name exist
$foundAgain = scouts_google_drive_resolve_planning_upsert(
    $keyOct,
    [],
    [
        ['id' => 'file-kap-oct-newest', 'name' => 'kapoenen_oktober_2026.pdf'],
        ['id' => 'file-kap-oct-older', 'name' => 'kapoenen_oktober_2026.pdf'],
    ]
);
expect(
    $foundAgain['fileId'] === 'file-kap-oct-newest',
    'newest search hit is preferred when period duplicates exist'
);

// After a Drive delete: trashed/missing metadata must not count as usable.
expect(
    scouts_google_drive_file_usable_in_folder(null, 'folder-1') === false,
    'missing Drive file is not usable'
);
expect(
    scouts_google_drive_file_usable_in_folder(
        ['id' => 'f1', 'trashed' => true, 'parents' => ['folder-1']],
        'folder-1'
    ) === false,
    'trashed Drive file is not usable until restored'
);
expect(
    scouts_google_drive_file_usable_in_folder(
        ['id' => 'f1', 'trashed' => false, 'parents' => ['other-folder']],
        'folder-1'
    ) === false,
    'file outside planning folder is not usable'
);
expect(
    scouts_google_drive_file_usable_in_folder(
        ['id' => 'f1', 'trashed' => false, 'parents' => ['folder-1']],
        'folder-1'
    ) === true,
    'active file in planning folder is usable'
);

echo "---\npassed={$passed} failed={$failed}\n";
exit($failed > 0 ? 1 : 0);
