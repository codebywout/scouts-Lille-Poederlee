# Start local PHP server with upload limits high enough for admin photos.
Set-Location $PSScriptRoot
php -d upload_max_filesize=20M -d post_max_size=25M -d memory_limit=256M -S localhost:8000 router.php
