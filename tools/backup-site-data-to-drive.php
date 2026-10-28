<?php
declare(strict_types=1);

/**
 * Upload site-data.json to the weekly Google Drive backup folder.
 *
 * Usage (on the server, e.g. weekly cron):
 *   php tools/backup-site-data-to-drive.php
 *
 * Requires a working Google Drive OAuth (or service account) connection
 * on this host — same credentials as maandplanning uploads.
 */
require dirname(__DIR__) . '/config.php';
require_once dirname(__DIR__) . '/google-drive.php';

try {
    $result = scouts_google_drive_upload_site_backup();
    fwrite(STDOUT, json_encode([
        'success' => true,
        'updated' => !empty($result['updated']),
        'filename' => $result['filename'],
        'fileId' => $result['fileId'],
        'folderId' => $result['folderId'],
    ], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) . PHP_EOL);
    exit(0);
} catch (Throwable $error) {
    fwrite(STDERR, 'Backup mislukt: ' . $error->getMessage() . PHP_EOL);
    exit(1);
}
