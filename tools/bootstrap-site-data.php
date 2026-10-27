<?php
declare(strict_types=1);

/**
 * Explicitly create data/site-data.json from data/site-data.default.json
 * when the runtime file is missing. Never overwrites an existing file.
 *
 * Usage: php tools/bootstrap-site-data.php
 */

require dirname(__DIR__) . DIRECTORY_SEPARATOR . 'config.php';

try {
    $result = scouts_bootstrap_site_data();
    if ($result === 'created') {
        fwrite(STDOUT, "Created runtime datastore from default seed.\n");
        fwrite(STDOUT, SCOUTS_DATA_FILE . "\n");
        exit(0);
    }

    fwrite(STDOUT, "Runtime datastore already exists; left unchanged.\n");
    fwrite(STDOUT, SCOUTS_DATA_FILE . "\n");
    exit(0);
} catch (Throwable $e) {
    fwrite(STDERR, 'Bootstrap failed: ' . $e->getMessage() . "\n");
    exit(1);
}
