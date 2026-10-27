<?php
declare(strict_types=1);

/**
 * Shared header/footer helpers for public pages (injected by scouts_send_html_file).
 *
 * @param array{page?: string, asset_prefix?: string, home_hash_prefix?: string} $options
 * @return array{page: string, assets: string, hash: string}
 */
function scouts_chrome_options(array $options = []): array
{
    $page = (string) ($options['page'] ?? 'index');
    $assets = (string) ($options['asset_prefix'] ?? '/assets/');
    $hash = (string) ($options['home_hash_prefix'] ?? '/#');
    if ($page === 'index') {
        $hash = '#';
    }

    return [
        'page' => $page,
        'assets' => $assets,
        'hash' => $hash,
    ];
}

function scouts_render_site_header(array $options = []): string
{
    ['page' => $page, 'assets' => $assets, 'hash' => $hash] = scouts_chrome_options($options);

    $brandHref = $page === 'index' ? '#top' : '/';
    $is = static function (string $id) use ($page): string {
        return $page === $id ? ' aria-current="page"' : '';
    };

    $verhuur = 'https://www.kampas.be/nl/domein/scoutsheem-lille-poederlee';
    $skipHref = $page === 'index' ? '#top' : '#main';

    return <<<HTML
<a class="skip-link" href="{$skipHref}">Ga naar inhoud</a>
<header class="navbar">
    <div class="nav-inner">
        <a href="{$brandHref}" class="brand" aria-label="Scouts Lille-Poederlee home">
            <img class="brand-logo" src="{$assets}images/scouts.png" alt="Scouts Lille-Poederlee logo">
        </a>

        <nav class="desktop-nav" aria-label="Hoofdnavigatie">
            <a href="/over-ons"{$is('over-ons')}>Over ons</a>
            <a href="{$hash}takken">Takken</a>
            <a href="/nieuws"{$is('nieuws')}>Nieuws</a>
            <a href="{$hash}planning">Planning</a>
            <a href="/uniform"{$is('uniform')}>Uniform</a>
            <a href="{$hash}praktisch">Praktisch</a>
            <a href="/tweedehands"{$is('tweedehands')}>Tweedehands</a>
            <a href="{$verhuur}" target="_blank" rel="noopener noreferrer" class="external-link">Verhuur</a>
        </nav>

        <a href="/inschrijven" class="nav-cta"{$is('inschrijven')}>Inschrijven</a>

        <button
            class="mobile-menu-button"
            id="mobileMenuButton"
            type="button"
            aria-label="Menu openen"
            aria-expanded="false"
            aria-controls="mobileMenu"
        >
            <span></span>
            <span></span>
            <span></span>
        </button>
    </div>

    <div class="mobile-menu" id="mobileMenu">
        <a href="/over-ons"{$is('over-ons')}>Over ons</a>
        <a href="{$hash}takken">Takken</a>
        <a href="/nieuws"{$is('nieuws')}>Nieuws</a>
        <a href="{$hash}planning">Planning</a>
        <a href="/uniform"{$is('uniform')}>Uniform</a>
        <a href="{$hash}praktisch">Praktisch</a>
        <a href="/tweedehands"{$is('tweedehands')}>Tweedehands</a>
        <a href="{$verhuur}" target="_blank" rel="noopener noreferrer">Verhuur</a>
        <a href="/inschrijven"{$is('inschrijven')}>Inschrijven</a>
    </div>
</header>
HTML;
}

/**
 * @param array{
 *   page?: string,
 *   asset_prefix?: string,
 *   home_hash_prefix?: string
 * } $options
 */
function scouts_render_site_footer(array $options = []): string
{
    ['page' => $page, 'assets' => $assets, 'hash' => $hash] = scouts_chrome_options($options);

    $privacyCurrent = $page === 'privacybeleid' ? ' aria-current="page"' : '';

    return <<<HTML
<footer class="footer">
    <div class="footer-main">
        <div class="footer-brand">
            <div class="brand">
                <img class="brand-logo" src="{$assets}images/scouts.png" alt="Scouts Lille-Poederlee logo">
            </div>
            <p>Scouts Lille-Poederlee is een jeugdbeweging voor kinderen en jongeren in de regio.</p>
        </div>

        <div class="footer-column">
            <span>NAVIGATIE</span>
            <a href="/over-ons">Over ons</a>
            <a href="{$hash}takken">Takken</a>
            <a href="/nieuws">Nieuws</a>
            <a href="{$hash}planning">Planning</a>
            <a href="{$hash}praktisch">Praktisch</a>
        </div>

        <div class="footer-column">
            <span>CONTACT</span>
            <a data-footer-email href="mailto:groepsleidingscoutslille@gmail.com">groepsleidingscoutslille@gmail.com</a>
            <a
                data-footer-address
                href="https://www.google.com/maps/search/?api=1&amp;query=Zagerijstraat%2029%2C%202275%20Lille"
                target="_blank"
                rel="noopener noreferrer"
            >Zagerijstraat 29<br>2275 Lille</a>
        </div>

        <div class="footer-column">
            <span>SOCIALS</span>
            <a href="https://www.facebook.com/scoutslille" target="_blank" rel="noopener noreferrer">Facebook<span class="icon-arrow-external" aria-hidden="true"></span></a>
            <a href="https://www.instagram.com/scoutslille/" target="_blank" rel="noopener noreferrer">Instagram<span class="icon-arrow-external" aria-hidden="true"></span></a>
        </div>
    </div>

    <div class="footer-bottom">
        <span>© 2026 Scouts Lille-Poederlee</span>
        <span>Wout Pluym</span>
        <a href="/privacybeleid"{$privacyCurrent}>Privacybeleid</a>
    </div>
</footer>
HTML;
}

/**
 * @return array{title: string, description: string, image: string, url: string}
 */
function scouts_page_share_meta(string $page): array
{
    $base = 'https://scoutslille.be';
    $defaultImage = $base . '/assets/images/domein-w1200.jpg';

    $pages = [
        'index' => [
            'title' => 'Scouts Lille-Poederlee',
            'description' => 'Scouts Lille-Poederlee — samen op avontuur voor kinderen en jongeren in Lille en Poederlee.',
            'image' => $defaultImage,
            'url' => $base . '/',
        ],
        'over-ons' => [
            'title' => 'Over ons | Scouts Lille-Poederlee',
            'description' => 'Meer informatie over Scouts Lille-Poederlee, de groepsleiding en onze scouting.',
            'image' => $base . '/assets/images/domein4-w1200.jpg',
            'url' => $base . '/over-ons',
        ],
        'inschrijven' => [
            'title' => 'Inschrijven | Scouts Lille-Poederlee',
            'description' => 'Schrijf je kind in bij Scouts Lille-Poederlee. Info over lidgeld, takken en hoe inschrijven werkt.',
            'image' => $defaultImage,
            'url' => $base . '/inschrijven',
        ],
        'nieuws' => [
            'title' => 'Nieuws | Scouts Lille-Poederlee',
            'description' => 'Het laatste nieuws van Scouts Lille-Poederlee.',
            'image' => $base . '/assets/images/domein2-w1200.jpg',
            'url' => $base . '/nieuws',
        ],
        'tweedehands' => [
            'title' => 'Tweedehands | Scouts Lille-Poederlee',
            'description' => 'Ontdek en deel tweedehands uniformen en scoutsmateriaal bij Scouts Lille-Poederlee.',
            'image' => $base . '/assets/images/domein3-w1200.jpg',
            'url' => $base . '/tweedehands',
        ],
        'uniform' => [
            'title' => 'Uniform | Scouts Lille-Poederlee',
            'description' => 'Alles over het scoutsuniform bij Scouts Lille-Poederlee.',
            'image' => $base . '/assets/images/domein5-w1200.jpg',
            'url' => $base . '/uniform',
        ],
        'kapoenen' => [
            'title' => 'Kapoenen | Scouts Lille-Poederlee',
            'description' => 'Ontdek de Kapoenen van Scouts Lille-Poederlee.',
            'image' => $defaultImage,
            'url' => $base . '/kapoenen',
        ],
        'welpen' => [
            'title' => 'Welpen | Scouts Lille-Poederlee',
            'description' => 'Ontdek de Welpen van Scouts Lille-Poederlee.',
            'image' => $defaultImage,
            'url' => $base . '/welpen',
        ],
        'jongverkenners' => [
            'title' => 'Jongverkenners | Scouts Lille-Poederlee',
            'description' => 'Ontdek de Jongverkenners van Scouts Lille-Poederlee.',
            'image' => $defaultImage,
            'url' => $base . '/jongverkenners',
        ],
        'verkenners' => [
            'title' => 'Verkenners | Scouts Lille-Poederlee',
            'description' => 'Ontdek de Verkenners van Scouts Lille-Poederlee.',
            'image' => $defaultImage,
            'url' => $base . '/verkenners',
        ],
        'jins' => [
            'title' => 'Jins | Scouts Lille-Poederlee',
            'description' => 'Ontdek de Jins van Scouts Lille-Poederlee.',
            'image' => $defaultImage,
            'url' => $base . '/jins',
        ],
        'privacybeleid' => [
            'title' => 'Privacybeleid | Scouts Lille-Poederlee',
            'description' => 'Privacybeleid van Scouts Lille-Poederlee.',
            'image' => $defaultImage,
            'url' => $base . '/privacybeleid',
        ],
        '404' => [
            'title' => 'Pagina niet gevonden | Scouts Lille-Poederlee',
            'description' => 'Deze link bestaat niet of is verplaatst.',
            'image' => $defaultImage,
            'url' => $base . '/404',
        ],
    ];

    return $pages[$page] ?? [
        'title' => 'Scouts Lille-Poederlee',
        'description' => 'Scouts Lille-Poederlee — samen op avontuur.',
        'image' => $defaultImage,
        'url' => $base . '/',
    ];
}

function scouts_render_share_meta_tags(string $page): string
{
    $meta = scouts_page_share_meta($page);
    $title = htmlspecialchars($meta['title'], ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
    $description = htmlspecialchars($meta['description'], ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
    $image = htmlspecialchars($meta['image'], ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
    $url = htmlspecialchars($meta['url'], ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');

    return <<<HTML
    <meta property="og:type" content="website">
    <meta property="og:site_name" content="Scouts Lille-Poederlee">
    <meta property="og:title" content="{$title}">
    <meta property="og:description" content="{$description}">
    <meta property="og:url" content="{$url}">
    <meta property="og:image" content="{$image}">
    <meta property="og:locale" content="nl_BE">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="{$title}">
    <meta name="twitter:description" content="{$description}">
    <meta name="twitter:image" content="{$image}">
HTML;
}

function scouts_render_json_ld(): string
{
    $email = 'groepsleidingscoutslille@gmail.com';
    $address = 'Zagerijstraat 29, 2275 Lille';
    $street = 'Zagerijstraat 29';
    $postalCode = '2275';
    $locality = 'Lille';

    try {
        $data = scouts_read_site_data();
        $contact = is_array($data['contact'] ?? null) ? $data['contact'] : [];
        if (is_string($contact['email'] ?? null) && trim($contact['email']) !== '') {
            $email = trim($contact['email']);
        }
        if (is_string($contact['address'] ?? null) && trim($contact['address']) !== '') {
            $address = trim($contact['address']);
            if (preg_match('/^(.+?),\\s*(\\d{4})\\s+(.+)$/u', $address, $matches) === 1) {
                $street = trim($matches[1]);
                $postalCode = trim($matches[2]);
                $locality = trim($matches[3]);
            }
        }
    } catch (Throwable) {
        // Keep fallback contact details.
    }

    $logoUrl = 'https://scoutslille.be/assets/images/scouts.png';

    $payload = [
        '@context' => 'https://schema.org',
        '@type' => 'LocalBusiness',
        'name' => 'Scouts Lille-Poederlee',
        'url' => 'https://scoutslille.be/',
        'email' => $email,
        'logo' => $logoUrl,
        'image' => $logoUrl,
        'address' => [
            '@type' => 'PostalAddress',
            'streetAddress' => $street,
            'postalCode' => $postalCode,
            'addressLocality' => $locality,
            'addressCountry' => 'BE',
        ],
        'sameAs' => [
            'https://www.facebook.com/scoutslille',
            'https://www.instagram.com/scoutslille/',
        ],
    ];

    $json = json_encode(
        $payload,
        JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS
    );
    if ($json === false) {
        return '';
    }

    return "    <script type=\"application/ld+json\">{$json}</script>";
}
