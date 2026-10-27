<?php
declare(strict_types=1);

/**
 * Consent banner + gated Clarity regression checks (no network, no site-data writes).
 */
require dirname(__DIR__) . '/config.php';
require_once SCOUTS_ROOT . DIRECTORY_SEPARATOR . 'includes' . DIRECTORY_SEPARATOR . 'site-chrome.php';

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

echo "=== Consent / Clarity tests ===\n";

expect(defined('SCOUTS_CLARITY_PROJECT_ID'), 'SCOUTS_CLARITY_PROJECT_ID is defined');
expect(SCOUTS_CLARITY_PROJECT_ID === 'z4c8od8ljm', 'Clarity project ID is z4c8od8ljm');

$banner = scouts_render_consent_banner(['page' => 'index', 'asset_prefix' => 'assets/']);
expect(str_contains($banner, 'id="scouts-consent-banner"'), 'banner markup present');
expect(str_contains($banner, 'role="dialog"'), 'banner is a dialog');
expect(str_contains($banner, 'data-consent-reject'), 'reject control present');
expect(str_contains($banner, 'data-consent-accept'), 'accept control present');
expect(str_contains($banner, 'Weigeren'), 'reject label visible');
expect(str_contains($banner, 'Aanvaarden'), 'accept label visible');
expect(str_contains($banner, 'consent-clarity.js'), 'consent script referenced');
expect(str_contains($banner, 'window.__SCOUTS_CONSENT__'), 'boot config present');
expect(str_contains($banner, 'z4c8od8ljm'), 'project id in boot config');
expect(str_contains($banner, 'scouts_consent_v1'), 'versioned storage key in boot config');
expect(!preg_match('#https://www\.clarity\.ms#i', $banner), 'banner HTML has no Clarity network URL');
expect(!str_contains($banner, 'clarity.ms/tag'), 'banner HTML does not embed Clarity tag');

$footer = scouts_render_site_footer(['page' => 'index', 'asset_prefix' => 'assets/']);
expect(str_contains($footer, 'data-consent-open'), 'footer opens cookie preferences');
expect(str_contains($footer, 'Cookievoorkeuren'), 'footer preference label visible');

$jsPath = SCOUTS_ROOT . '/assets/js/consent-clarity.js';
$js = is_file($jsPath) ? (string) file_get_contents($jsPath) : '';
expect($js !== '', 'consent-clarity.js readable');
expect(str_contains($js, "clarity.ms/tag/"), 'JS knows official Clarity tag URL');
expect(str_contains($js, "consentv2"), 'JS uses documented ConsentV2 API');
expect(str_contains($js, "'consent', false") || str_contains($js, '"consent", false'), 'JS uses documented consent false erase API');
expect(str_contains($js, 'localStorage'), 'JS persists choice in localStorage');
expect(str_contains($js, 'scouts_consent_v1') || str_contains($js, 'storageKey'), 'JS uses versioned storage key');

// --- Behavioral invariants via a tiny Node-less JS harness simulation in PHP ---
// We assert control-flow markers that gate network: loadClarity only after granted.
expect(
    (bool) preg_match('/function\s+loadClarity\s*\(/', $js),
    'loadClarity function exists'
);
expect(
    (bool) preg_match('/function\s+accept\s*\(\)\s*\{[^}]*loadClarity\s*\(/s', $js),
    'accept path calls loadClarity'
);
expect(
    (bool) preg_match('/function\s+reject\s*\(\)\s*\{(?![^}]*loadClarity\s*\()[^}]*\}/s', $js),
    'reject path does not call loadClarity'
);
expect(
    (bool) preg_match(
        '/function\s+applyStored\s*\([\s\S]*?analytics\s*===\s*["\']granted["\'][\s\S]*?loadClarity\s*\(/',
        $js
    ),
    'reload with granted consent restarts Clarity'
);
expect(
    str_contains($js, 'choice.analytics === "denied"')
        || str_contains($js, "choice.analytics === 'denied'")
        || str_contains($js, '// denied:'),
    'denied path documented / handled without loading'
);

// Ensure Clarity tag URL only appears inside loadClarity (not at top-level init).
$tagPos = strpos($js, 'clarity.ms/tag/');
$loadPos = strpos($js, 'function loadClarity');
expect($tagPos !== false && $loadPos !== false && $tagPos > $loadPos, 'Clarity tag URL only after loadClarity definition');

$beforeLoad = substr($js, 0, (int) $loadPos);
expect(
    !str_contains($beforeLoad, 'clarity.ms'),
    'no Clarity host reference before loadClarity (no pre-consent network helper)'
);

// applyStored must not call loadClarity unconditionally.
expect(
    (bool) preg_match(
        '/function\s+applyStored\s*\(\)\s*\{[\s\S]*?if\s*\(\s*!choice\s*\)[\s\S]*?showBanner[\s\S]*?if\s*\(\s*choice\.analytics\s*===\s*["\']granted["\']/',
        $js
    ),
    'applyStored only loads Clarity when stored choice is granted'
);

$privacy = (string) file_get_contents(SCOUTS_ROOT . '/pages/privacyverklaring.html');
expect(str_contains($privacy, 'id="cookies"'), 'privacy has cookies section anchor');
expect(str_contains($privacy, 'Microsoft Clarity'), 'privacy mentions Microsoft Clarity');
expect(str_contains($privacy, 'Cookievoorkeuren') || str_contains($privacy, 'toestemming'), 'privacy explains consent / preferences');
expect(str_contains($privacy, 'scouts_consent_v1'), 'privacy documents storage key');
expect(str_contains($privacy, 'scouts_session'), 'privacy distinguishes session cookie');

// --- HTML pipeline: public pages get banner; admin/login do not ---
$configSrc = (string) file_get_contents(SCOUTS_ROOT . '/config.php');
expect(
    str_contains($configSrc, "\$isPublicChrome = !in_array(\$resolvedPage, ['admin', 'login'], true)"),
    'admin and login excluded from public chrome'
);
expect(
    str_contains($configSrc, 'scouts_render_consent_banner'),
    'consent banner injected from scouts_send_html_file public path'
);

$adminHtml = (string) file_get_contents(SCOUTS_ROOT . '/admin.html');
$loginHtml = (string) file_get_contents(SCOUTS_ROOT . '/login.html');
expect(!str_contains($adminHtml, 'clarity.ms'), 'admin.html source has no Clarity URL');
expect(!str_contains($loginHtml, 'clarity.ms'), 'login.html source has no Clarity URL');
expect(!str_contains($adminHtml, 'scouts-consent-banner'), 'admin.html has no consent banner markup');
expect(!str_contains($loginHtml, 'scouts-consent-banner'), 'login.html has no consent banner markup');
expect(!str_contains($adminHtml, 'consent-clarity.js'), 'admin.html has no consent script');
expect(!str_contains($loginHtml, 'consent-clarity.js'), 'login.html has no consent script');

// Simulate public chrome injection on a minimal fixture (mirrors config.php public branch).
$fixture = "<!DOCTYPE html><html><body><main>Hi</main></body></html>";
$consent = scouts_render_consent_banner(['page' => 'nieuws', 'asset_prefix' => '../assets/']);
$injected = preg_replace('/<\/body>/i', $consent . "\n</body>", $fixture, 1) ?? ($fixture . $consent);
expect(str_contains($injected, 'scouts-consent-banner'), 'public fixture receives consent banner');
expect(str_contains($injected, 'consent-clarity.js'), 'public fixture loads consent script');
expect(!preg_match('#clarity\.ms/tag#i', $injected), 'public HTML still has no Clarity tag before JS consent');

// Simulate admin exclusion: chrome helpers are simply not called.
$adminSim = $adminHtml;
expect(!str_contains($adminSim, 'scouts-consent-banner'), 'admin exclusion: no banner without public chrome');

// CSS present for equal-choice actions.
$css = (string) file_get_contents(SCOUTS_ROOT . '/assets/css/components.css');
expect(str_contains($css, '.consent-banner__btn--reject'), 'reject button styled');
expect(str_contains($css, '.consent-banner__btn--accept'), 'accept button styled');
expect(str_contains($css, '.footer-consent-link'), 'footer preference control styled');
expect(str_contains($css, 'grid-template-columns: 1fr 1fr'), 'accept/reject share equal grid columns');

echo "---\npassed={$passed} failed={$failed}\n";
exit($failed > 0 ? 1 : 0);
