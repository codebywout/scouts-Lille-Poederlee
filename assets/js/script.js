(function () {
  "use strict";

  /* ==========================================================
       Utilities
       ========================================================== */

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  // Longest labels first so "Jongverkenners" wins over "Verkenners".
  const FAQ_INTERNAL_LINKS = [
    ["Jongverkenners", "/jongverkenners"],
    ["Privacybeleid", "/privacybeleid"],
    ["Tweedehands", "/tweedehands"],
    ["Inschrijven", "/inschrijven"],
    ["Verkenners", "/verkenners"],
    ["Kapoenen", "/kapoenen"],
    ["Over ons", "/over-ons"],
    ["Praktisch", "/#praktisch"],
    ["Planning", "/#planning"],
    ["Uniform", "/uniform"],
    ["Welpen", "/welpen"],
    ["Nieuws", "/nieuws"],
    ["Takken", "/#takken"],
    ["Jins", "/jins"],
  ];

  function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function createFaqAnchor(href, label) {
    const link = document.createElement("a");
    link.href = href;
    link.textContent = label;
    if (/^https?:\/\//i.test(href)) {
      link.target = "_blank";
      link.rel = "noopener noreferrer";
    }
    return link;
  }

  /** Escape FAQ text, then auto-link known site pages and http(s) URLs. */
  function formatFaqAnswerHtml(text) {
    const root = document.createElement("p");
    root.textContent = String(text ?? "");

    // Case-sensitive labels so "inschrijven" (werkwoord) stays plain text.
    const phrasePattern = new RegExp(
      `\\b(?:${FAQ_INTERNAL_LINKS.map(([label]) => escapeRegExp(label)).join("|")})\\b`,
      "g",
    );
    const urlPattern = /\bhttps?:\/\/[^\s<]+/gi;
    const combined = new RegExp(
      `(?:${phrasePattern.source})|(?:${urlPattern.source})`,
      "g",
    );

    const labelToHref = new Map(FAQ_INTERNAL_LINKS);

    const textNodes = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) textNodes.push(walker.currentNode);

    textNodes.forEach((node) => {
      const value = node.nodeValue || "";
      combined.lastIndex = 0;
      if (!combined.test(value)) return;

      const fragment = document.createDocumentFragment();
      let lastIndex = 0;
      combined.lastIndex = 0;
      let match;
      while ((match = combined.exec(value))) {
        if (match.index > lastIndex) {
          fragment.append(document.createTextNode(value.slice(lastIndex, match.index)));
        }
        const token = match[0];
        if (/^https?:\/\//i.test(token)) {
          const href = token.replace(/[.,);:!?]+$/u, "");
          const trailing = token.slice(href.length);
          fragment.append(createFaqAnchor(href, href));
          if (trailing) fragment.append(document.createTextNode(trailing));
        } else {
          const href = labelToHref.get(token);
          if (href) fragment.append(createFaqAnchor(href, token));
          else fragment.append(document.createTextNode(token));
        }
        lastIndex = match.index + token.length;
      }
      if (lastIndex < value.length) {
        fragment.append(document.createTextNode(value.slice(lastIndex)));
      }
      node.parentNode?.replaceChild(fragment, node);
    });

    return root.innerHTML;
  }

  function debounce(fn, wait = 150) {
    let timeoutId;
    return (...args) => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => fn(...args), wait);
    };
  }

  function qs(selector, root = document) {
    return root.querySelector(selector);
  }

  function qsa(selector, root = document) {
    return [...root.querySelectorAll(selector)];
  }

  function setMultilineText(element, value, separator = "\n") {
    element.replaceChildren();
    String(value ?? "")
      .split(separator)
      .forEach((line, index) => {
        if (index > 0) element.append(document.createElement("br"));
        element.append(document.createTextNode(line));
      });
  }

  const IMAGE_ASSET_VERSION = "20261027-24";

  function formatLidgeldLabel(amount) {
    const amountNumber = Number(String(amount || "").replace(",", ".").replace(/[^\d.]/g, ""));
    if (!Number.isFinite(amountNumber) || amountNumber <= 0) return "";
    const formatted = amountNumber.toLocaleString("nl-BE", {
      style: "currency",
      currency: "EUR",
      maximumFractionDigits: amountNumber % 1 === 0 ? 0 : 2,
    });
    return `(${formatted.replace(/\s/g, "\u00a0")})`;
  }

  function updateLidgeldLabels(explicitAmount) {
    let lidgeldText = explicitAmount;
    if (lidgeldText == null || lidgeldText === "") {
      try {
        lidgeldText =
          DataStore.get()?.pageContent?.inschrijven?.lidgeld ||
          document.querySelector('[data-page-content="lidgeld"]')?.textContent ||
          "60";
      } catch {
        lidgeldText = "60";
      }
    }
    const label = formatLidgeldLabel(lidgeldText) || "(\u20ac\u00a060)";
    qsa("[data-lidgeld-label]").forEach((el) => {
      el.textContent = label;
    });
  }

  function versionStaticImage(src) {
    if (typeof src !== "string" || !src.includes("/assets/images/")) {
      return src;
    }

    return src.includes("?") ? src : `${src}?v=${IMAGE_ASSET_VERSION}`;
  }

  const RESPONSIVE_WIDTHS = {
    card: [480, 800, 1200],
    content: [480, 800, 1200, 1600],
    branch: [480, 800, 1200, 1600, 2400],
  };

  function splitResponsiveAsset(src) {
    const raw = String(src || "").trim();
    if (!raw) return null;
    const question = raw.indexOf("?");
    const path = question === -1 ? raw : raw.slice(0, question);
    const query = question === -1 ? "" : raw.slice(question);
    const normalized = path.replace(
      /-(?:thumb|md|display|w\d+)(\.[a-z0-9]+)$/i,
      "$1",
    );
    const match = normalized.match(/^(.*)(\.[a-z0-9]+)$/i);
    if (!match) return null;
    return {
      stem: match[1],
      ext: match[2].toLowerCase(),
      query,
      original: raw,
      originalPath: path,
    };
  }

  function withAssetQuery(path, query) {
    if (query) return `${path}${query}`;
    if (path.includes("/assets/images/")) {
      return `${path}?v=${IMAGE_ASSET_VERSION}`;
    }
    return path;
  }

  /** Source width hint from ?sw= on upload URLs (set by the photo pipeline). */
  function parseSourceWidthHint(query, fallback = 0) {
    const match = String(query || "").match(/(?:^\?|&)sw=(\d+)/i);
    if (match) {
      const value = Number(match[1]);
      if (Number.isFinite(value) && value > 0) return value;
    }
    return fallback > 0 ? fallback : 0;
  }

  function buildWidthSrcset(stem, ext, widths, query, sourceWidth = 0) {
    const maxWidth = sourceWidth || parseSourceWidthHint(query);
    const seen = new Set();
    const parts = [];
    for (const width of widths) {
      const pixelWidth = maxWidth > 0 ? Math.min(width, maxWidth) : width;
      if (seen.has(pixelWidth)) continue;
      seen.add(pixelWidth);
      parts.push(
        `${withAssetQuery(`${stem}-w${width}${ext}`, query)} ${pixelWidth}w`,
      );
    }
    return parts.join(", ");
  }

  function defaultResponsiveWidth(widths, preferredWidth = 0) {
    // Prefer a mid-size default so fallback `src` is never the largest file.
    if (preferredWidth && widths.includes(preferredWidth)) return preferredWidth;
    if (widths.includes(800)) return 800;
    if (widths.includes(480)) return 480;
    if (widths.includes(1200)) return 1200;
    return widths[Math.max(0, Math.floor((widths.length - 1) / 2))];
  }

  /** Maps body class → site-data photos.pageBackgrounds key. */
  const PAGE_BACKGROUND_SLOT_BY_BODY = {
    "registration-page": "registration",
    "news-page": "news",
    "about-page": "about",
    "secondhand-page": "secondhand",
    "uniform-page": "uniform",
    "branch-page": "branch",
    "error-page": "error",
  };

  function buildBackgroundImageSet(stem, width, query) {
    const webp = withAssetQuery(`${stem}-w${width}.webp`, query);
    const jpg = withAssetQuery(`${stem}-w${width}.jpg`, query);
    return `image-set(url("${webp}") type("image/webp"), url("${jpg}") type("image/jpeg"))`;
  }

  function applyHomeHeroBackground(src, sourceWidthHint = 0) {
    const picture = qs(".hero-media");
    if (!picture) return;
    const parts = splitResponsiveAsset(src);
    if (!parts) return;
    const widths = [800, 1200, 1600, 2400];
    const q = parts.query;
    const sourceWidth =
      sourceWidthHint ||
      parseSourceWidthHint(q) ||
      Number(picture.getAttribute("data-source-width") || 0) ||
      0;
    const webpSrcset = buildWidthSrcset(
      parts.stem,
      ".webp",
      widths,
      q,
      sourceWidth,
    );
    const jpgSrcset = buildWidthSrcset(
      parts.stem,
      ".jpg",
      widths,
      q,
      sourceWidth,
    );
    const avifSrcset = parts.stem.includes("/uploads/")
      ? buildWidthSrcset(parts.stem, ".avif", widths, q, sourceWidth)
      : "";
    const img = picture.querySelector("img");

    // Keep <source type> aligned with real URLs (never put JPEG in a WebP/AVIF source).
    const ensureSource = (type, srcset) => {
      let source = picture.querySelector(`source[type="${type}"]`);
      if (!srcset) {
        source?.remove();
        return;
      }
      if (!source) {
        source = document.createElement("source");
        source.type = type;
        picture.insertBefore(source, img || picture.firstChild);
      }
      source.srcset = srcset;
      source.sizes = "100vw";
    };
    ensureSource("image/avif", avifSrcset);
    ensureSource("image/webp", webpSrcset);

    if (img) {
      const preferred = defaultResponsiveWidth(
        sourceWidth > 0
          ? widths.filter((width) => width <= sourceWidth || width === widths[0])
          : widths,
        1200,
      );
      img.srcset = jpgSrcset;
      img.sizes = "100vw";
      img.src = withAssetQuery(`${parts.stem}-w${preferred}.jpg`, q);
      img.removeAttribute("data-fallback-applied");
      img.setAttribute("data-full-src", withAssetQuery(`${parts.stem}.jpg`, q));
    }
    if (sourceWidth > 0) {
      picture.setAttribute("data-source-width", String(sourceWidth));
    }
  }

  function applyConfigurablePageBackgrounds(data) {
    const backgrounds =
      data?.photos?.pageBackgrounds && typeof data.photos.pageBackgrounds === "object"
        ? data.photos.pageBackgrounds
        : {};

    if (document.body.classList.contains("home-page")) {
      const homeBg = String(backgrounds.home || "").trim();
      if (!homeBg) return;

      const parts = splitResponsiveAsset(homeBg);
      const img = qs(".hero-media img");
      const currentSrc = img?.getAttribute("src") || "";
      const current = splitResponsiveAsset(currentSrc);
      // PHP already aligned preload + picture with site-data; avoid a second swap.
      if (
        parts &&
        current &&
        current.stem.replace(/^\//, "") === parts.stem.replace(/^\//, "")
      ) {
        return;
      }
      applyHomeHeroBackground(homeBg);
      return;
    }

    let slot = "";
    for (const [bodyClass, key] of Object.entries(PAGE_BACKGROUND_SLOT_BY_BODY)) {
      if (document.body.classList.contains(bodyClass)) {
        slot = key;
        break;
      }
    }
    if (!slot) return;

    const custom = String(backgrounds[slot] || "").trim();
    if (!custom) {
      document.body.classList.remove("scouts-has-custom-bg");
      document.body.style.removeProperty("--scouts-custom-bg-800");
      document.body.style.removeProperty("--scouts-custom-bg-1600");
      return;
    }

    const parts = splitResponsiveAsset(custom);
    if (!parts) return;

    // PHP may already have set class + CSS variables for first paint.
    if (document.body.getAttribute("data-bg-boot") === "1") {
      document.body.classList.add("scouts-has-custom-bg");
      return;
    }

    document.body.style.setProperty(
      "--scouts-custom-bg-800",
      buildBackgroundImageSet(parts.stem, 800, parts.query),
    );
    document.body.style.setProperty(
      "--scouts-custom-bg-1600",
      buildBackgroundImageSet(parts.stem, 1600, parts.query),
    );
    document.body.classList.add("scouts-has-custom-bg");
  }

  if (typeof window !== "undefined" && !window.__scoutsImgFallback) {
    window.__scoutsImgFallback = function scoutsImgFallback(img) {
      if (!img || img.dataset.fallbackApplied === "1") return;
      const full = img.getAttribute("data-full-src") || "";
      if (!full) return;
      img.dataset.fallbackApplied = "1";
      img.removeAttribute("srcset");
      img.src = full;
    };
  }

  function responsivePictureHtml(
    src,
    {
      alt = "",
      className = "",
      pictureClass = "",
      sizes = "100vw",
      widths = RESPONSIVE_WIDTHS.content,
      preferredWidth = 0,
      loading = "lazy",
      fetchpriority = "",
      decoding = "async",
      width = "",
      height = "",
      linkFull = false,
    } = {},
  ) {
    const parts = splitResponsiveAsset(src);
    if (!parts) return "";

    const query = parts.query;
    const defaultWidth = defaultResponsiveWidth(widths, preferredWidth);
    const defaultJpg = withAssetQuery(
      `${parts.stem}-w${defaultWidth}.jpg`,
      query,
    );
    // Fallback `src` must always be a concrete URL (never empty) for parsers/Lighthouse.
    const fallbackSrc =
      defaultJpg ||
      withAssetQuery(parts.originalPath, query) ||
      parts.original;
    const sourceWidth = parseSourceWidthHint(query);
    const webpSrcset = buildWidthSrcset(
      parts.stem,
      ".webp",
      widths,
      query,
      sourceWidth,
    );
    const jpgSrcset = buildWidthSrcset(
      parts.stem,
      ".jpg",
      widths,
      query,
      sourceWidth,
    );
    // Upload pipeline writes AVIF alongside WebP; emit only for /uploads/ so missing
    // AVIFs on static assets never break picture selection.
    const useAvif = parts.stem.includes("/uploads/");
    const avifSrcset = useAvif
      ? buildWidthSrcset(parts.stem, ".avif", widths, query, sourceWidth)
      : "";
    const imgClass = className ? ` class="${escapeHtml(className)}"` : "";
    const pictureClassAttr = pictureClass
      ? ` class="${escapeHtml(pictureClass)}"`
      : "";
    const widthAttr = width ? ` width="${escapeHtml(String(width))}"` : "";
    const heightAttr = height ? ` height="${escapeHtml(String(height))}"` : "";
    const priorityAttr = fetchpriority
      ? ` fetchpriority="${escapeHtml(fetchpriority)}"`
      : "";
    const loadingAttr = loading ? ` loading="${escapeHtml(loading)}"` : "";
    const avifSource = avifSrcset
      ? `<source type="image/avif" srcset="${escapeHtml(avifSrcset)}" sizes="${escapeHtml(sizes)}">`
      : "";

    const picture = `
      <picture${pictureClassAttr}>
        ${avifSource}
        <source type="image/webp" srcset="${escapeHtml(webpSrcset)}" sizes="${escapeHtml(sizes)}">
        <img${imgClass}
          src="${escapeHtml(fallbackSrc)}"
          srcset="${escapeHtml(jpgSrcset)}"
          sizes="${escapeHtml(sizes)}"
          alt="${escapeHtml(alt)}"${loadingAttr}${priorityAttr}
          decoding="${escapeHtml(decoding)}"${widthAttr}${heightAttr}
          data-full-src="${escapeHtml(parts.original)}"
          onerror="window.__scoutsImgFallback&&window.__scoutsImgFallback(this)">
      </picture>`;

    if (!linkFull) return picture;
    return `<a class="responsive-full-link" href="${escapeHtml(parts.original)}" target="_blank" rel="noopener noreferrer" aria-label="${escapeHtml(alt || "Originale foto openen")}">${picture}</a>`;
  }

  function thumbImageHtml(src, { alt = "", className = "" } = {}) {
    // Measured: news/agenda thumbs are 84×84 (56×56 ≤768). Avoid 42vw over-fetch.
    return responsivePictureHtml(src, {
      alt,
      className,
      sizes: "(max-width: 768px) 56px, 84px",
      widths: [480, 800],
      preferredWidth: 480,
      loading: "lazy",
      width: 480,
      height: 480,
    });
  }

  function slugifyNewsTitle(title, index = 0) {
    const base = String(title || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 56);
    return base || `bericht-${index + 1}`;
  }

  function newsItemAnchorId(item, index = 0) {
    if (item && typeof item.id === "string" && item.id.trim()) {
      return item.id.trim().replace(/^#/, "");
    }
    return slugifyNewsTitle(item?.title, index);
  }

  function newsSharePath(anchorId) {
    return `/nieuws#${anchorId}`;
  }

  function newsShareUrl(anchorId) {
    return `${window.location.origin}${newsSharePath(anchorId)}`;
  }

  function openNewsFromHash() {
    const raw = window.location.hash.replace(/^#/, "").trim();
    if (!raw) return;
    const target =
      document.getElementById(raw) ||
      document.getElementById(decodeURIComponent(raw));
    if (!target?.classList.contains("news-item")) return;

    const summary = target.querySelector(".news-summary");
    if (summary && !target.classList.contains("is-open") && !target.classList.contains("is-static")) {
      summary.click();
    }
    window.requestAnimationFrame(() => {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function setupNewsShareLinks(container) {
    if (!container || container._newsShareBound) return;
    container._newsShareBound = true;
    container.addEventListener("click", async (event) => {
      const button = event.target.closest("[data-news-share]");
      if (!button || !container.contains(button)) return;
      event.preventDefault();
      event.stopPropagation();
      const id = button.getAttribute("data-news-share") || "";
      if (!id) return;

      const url = newsShareUrl(id);
      const row = button.closest(".news-share-box");
      const label = button.querySelector(".news-share-label");
      const idleText = "Kopieer";
      const doneText = "Gekopieerd";

      const showCopied = () => {
        button.classList.add("is-copied");
        row?.classList.add("is-copied");
        if (label) label.textContent = doneText;
        else button.textContent = doneText;
        window.setTimeout(() => {
          button.classList.remove("is-copied");
          row?.classList.remove("is-copied");
          if (label) label.textContent = idleText;
          else button.textContent = idleText;
        }, 2200);
      };

      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(url);
        } else {
          const field = document.createElement("textarea");
          field.value = url;
          field.setAttribute("readonly", "");
          field.style.position = "fixed";
          field.style.opacity = "0";
          document.body.appendChild(field);
          field.select();
          document.execCommand("copy");
          field.remove();
        }
        showCopied();
      } catch {
        await openDialog({
          title: "Link naar dit bericht",
          description: "Selecteer de link en kopieer ze.",
          confirmLabel: "Sluiten",
          cancelLabel: "",
          input: {
            type: "text",
            label: "Link",
            value: url,
            readOnly: true,
          },
        });
      }
    });
  }

  function refreshStaticImages() {
    qsa("img").forEach((image) => {
      const src = image.getAttribute("src");
      const versionedSrc = versionStaticImage(src);
      if (versionedSrc && versionedSrc !== src) image.src = versionedSrc;
    });
  }

  /* ==========================================================
       Auth (admin pages)
       ========================================================== */

  const Auth = {
    async redirectIfNotAuthenticated() {
      try {
        const response = await fetch("/api/session");
        const data = await response.json();
        if (!data.authenticated) window.location.href = "/login";
      } catch {
        window.location.href = "/login";
      }
    },

    async logout() {
      try {
        sessionStorage.removeItem("scouts_site_data_cache");
      } catch {
        // ignore
      }
      try {
        const response = await fetch("/api/logout", { method: "POST" });
        const data = await response.json();
        window.location.href = data.redirectTo || "/login";
      } catch {
        window.location.href = "/login";
      }
    },
  };

  /* ==========================================================
       Mobile menu
       ========================================================== */

  function initMobileMenu() {
    const menuButton = document.getElementById("mobileMenuButton");
    const mobileMenu = document.getElementById("mobileMenu");
    if (!menuButton || !mobileMenu) return;

    const menuItems = () => [menuButton, ...qsa("a", mobileMenu)];

    const setMenuOpen = (isOpen, { restoreFocus = false } = {}) => {
      const wasOpen = mobileMenu.classList.contains("open");
      mobileMenu.classList.toggle("open", isOpen);
      menuButton.classList.toggle("is-open", isOpen);
      menuButton.setAttribute("aria-expanded", isOpen ? "true" : "false");
      menuButton.setAttribute("aria-label", isOpen ? "Menu sluiten" : "Menu openen");
      if (isOpen && !wasOpen) {
        qsa("a", mobileMenu)[0]?.focus();
      } else if (!isOpen && wasOpen && restoreFocus) {
        menuButton.focus();
      }
    };

    menuButton.addEventListener("click", () => {
      setMenuOpen(!mobileMenu.classList.contains("open"));
    });

    qsa("a", mobileMenu).forEach((link) => {
      link.addEventListener("click", () => setMenuOpen(false));
    });

    document.addEventListener("click", (event) => {
      if (!mobileMenu.classList.contains("open")) return;
      if (menuButton.contains(event.target) || mobileMenu.contains(event.target)) return;
      setMenuOpen(false);
    });

    document.addEventListener("keydown", (event) => {
      if (!mobileMenu.classList.contains("open")) return;
      if (event.key === "Escape") {
        event.preventDefault();
        setMenuOpen(false, { restoreFocus: true });
        return;
      }
      if (event.key !== "Tab") return;
      const items = menuItems();
      if (!items.length) return;
      const index = items.indexOf(document.activeElement);
      event.preventDefault();
      const next = event.shiftKey
        ? items[(index <= 0 ? items.length : index) - 1]
        : items[index === items.length - 1 || index === -1 ? 0 : index + 1];
      next.focus();
    });
  }

  function updateBirthRanges() {
    const ranges = {
      kapoenen: [2018, 2019],
      welpen: [2015, 2017],
      jongverkenners: [2012, 2014],
      verkenners: [2010, 2011],
      jins: [2008, 2009],
    };
    const today = new Date();
    const seasonStartYear =
      today.getMonth() >= 8 ? today.getFullYear() : today.getFullYear() - 1;
    const yearOffset = seasonStartYear - 2025;

    qsa("[data-birth-range]").forEach((element) => {
      const range = ranges[element.dataset.birthRange];
      if (!range) return;

      element.textContent = `Geboren ${range[0] + yearOffset} – ${range[1] + yearOffset}`;
    });
  }

  const AGENDA_MONTH_ORDER = {
    SEP: 1,
    OKT: 2,
    NOV: 3,
    DEC: 4,
    JAN: 5,
    FEB: 6,
    MAA: 7,
    APR: 8,
    MEI: 9,
    JUN: 10,
    JUL: 11,
    AUG: 12,
  };

  const AGENDA_CALENDAR_MONTH = {
    SEP: 8,
    OKT: 9,
    NOV: 10,
    DEC: 11,
    JAN: 0,
    FEB: 1,
    MAA: 2,
    APR: 3,
    MEI: 4,
    JUN: 5,
    JUL: 6,
    AUG: 7,
  };

  function sortAgendaItems(items) {
    return (Array.isArray(items) ? items : [])
      .map((item, index) => ({ item, index }))
      .sort((left, right) => {
        const leftMonth =
          AGENDA_MONTH_ORDER[String(left.item.month || "").toUpperCase()] || 99;
        const rightMonth =
          AGENDA_MONTH_ORDER[String(right.item.month || "").toUpperCase()] ||
          99;
        const monthDifference = leftMonth - rightMonth;
        if (monthDifference !== 0) return monthDifference;

        const dayDifference =
          (Number(left.item.day) || 0) - (Number(right.item.day) || 0);
        return dayDifference || left.index - right.index;
      })
      .map(({ item }) => item);
  }

  function sortAgendaInPlace(items) {
    const sortedItems = sortAgendaItems(items);
    items.splice(0, items.length, ...sortedItems);
  }

  function agendaSeasonStartYear(now = new Date()) {
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return today.getMonth() >= 8 ? today.getFullYear() : today.getFullYear() - 1;
  }

  function agendaPartsToDate(dayValue, monthValue, now = new Date()) {
    const monthKey = String(monthValue || "").toUpperCase();
    const calendarMonth = AGENDA_CALENDAR_MONTH[monthKey];
    const day = Number(dayValue);
    if (calendarMonth === undefined || !Number.isFinite(day) || day < 1) {
      return null;
    }

    const seasonStartYear = agendaSeasonStartYear(now);
    const year = calendarMonth >= 8 ? seasonStartYear : seasonStartYear + 1;
    return new Date(year, calendarMonth, day);
  }

  function agendaItemDate(item, now = new Date()) {
    return agendaPartsToDate(item?.day, item?.month, now);
  }

  function agendaItemHasRange(item) {
    const endDay = Number(item?.endDay);
    const endMonth = String(item?.endMonth || "").trim();
    if (!endMonth || !Number.isFinite(endDay) || endDay < 1) return false;
    const startDay = String(item?.day || "").trim();
    const startMonth = String(item?.month || "")
      .trim()
      .toUpperCase();
    return !(
      String(endDay) === startDay && endMonth.toUpperCase() === startMonth
    );
  }

  function agendaItemEndDate(item, now = new Date()) {
    const start = agendaItemDate(item, now);
    if (!agendaItemHasRange(item)) return start;

    let end = agendaPartsToDate(item.endDay, item.endMonth, now);
    if (start && end && end < start) {
      end = new Date(end.getFullYear() + 1, end.getMonth(), end.getDate());
    }
    return end || start;
  }

  function formatAgendaDateParts(item) {
    const day = String(item?.day || "").trim();
    const month = String(item?.month || "").trim().toUpperCase();
    if (!agendaItemHasRange(item)) {
      return { day, month, isRange: false };
    }

    return {
      day,
      month,
      endDay: String(item.endDay || "").trim(),
      endMonth: String(item.endMonth || "").trim().toUpperCase(),
      isRange: true,
    };
  }

  function buildAgendaDateHtml(item) {
    const parts = formatAgendaDateParts(item);
    if (!parts.isRange) {
      return `
                    <div class="agenda-date">
                      <strong>${escapeHtml(parts.day)}</strong>
                      <span>${escapeHtml(parts.month)}</span>
                    </div>`;
    }

    const sameMonth = parts.month === parts.endMonth;
    const label = `${parts.day} ${parts.month} tot ${parts.endDay} ${parts.endMonth}`;

    // Compact period badge: "12 → 14" + month (same height as a single date).
    if (sameMonth) {
      return `
                    <div class="agenda-date is-range is-same-month" aria-label="${escapeHtml(label)}">
                      <div class="agenda-date-range">
                        <strong>${escapeHtml(parts.day)}</strong>
                        <span class="agenda-date-arrow" aria-hidden="true"></span>
                        <strong>${escapeHtml(parts.endDay)}</strong>
                      </div>
                      <span>${escapeHtml(parts.month)}</span>
                    </div>`;
    }

    return `
                    <div class="agenda-date is-range" aria-label="${escapeHtml(label)}">
                      <div class="agenda-date-range">
                        <span class="agenda-date-side">
                          <strong>${escapeHtml(parts.day)}</strong>
                          <span>${escapeHtml(parts.month)}</span>
                        </span>
                        <span class="agenda-date-arrow" aria-hidden="true"></span>
                        <span class="agenda-date-side">
                          <strong>${escapeHtml(parts.endDay)}</strong>
                          <span>${escapeHtml(parts.endMonth)}</span>
                        </span>
                      </div>
                    </div>`;
  }

  function filterUpcomingAgendaItems(items, now = new Date()) {
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return sortAgendaItems(items).filter((item) => {
      const date = agendaItemEndDate(item, now);
      return !date || date >= today;
    });
  }

  /* ==========================================================
       Registration form -> Google Forms bridge
       ========================================================== */

  const GOOGLE_FORM_ACTION =
    "https://docs.google.com/forms/d/e/1FAIpQLSdo1plmv_4p8ZEpL62lC8sV2uXnEhWT5YW_w-cedewV7uvH-w/formResponse";

  const GOOGLE_FORM_ENTRY_MAP = {
    voornaam: "entry.1889692174",
    achternaam: "entry.519369214",
    tak: "entry.172005220",
    opmerkingen: "entry.1532144269",
  };

  function ensureHiddenResponseFrame() {
    let frame = document.getElementById("googleFormResponse");
    if (!frame) {
      frame = document.createElement("iframe");
      frame.name = "googleFormResponse";
      frame.id = "googleFormResponse";
      frame.hidden = true;
      document.body.appendChild(frame);
    }
    return frame;
  }

  function submitToGoogleForm(formData) {
    const googleForm = document.createElement("form");
    googleForm.method = "POST";
    googleForm.action = GOOGLE_FORM_ACTION;
    googleForm.target = "googleFormResponse";
    googleForm.hidden = true;

    for (const [fieldName, entryId] of Object.entries(GOOGLE_FORM_ENTRY_MAP)) {
      const input = document.createElement("input");
      input.name = entryId;
      input.value = formData.get(fieldName) || "";
      googleForm.appendChild(input);
    }

    ensureHiddenResponseFrame();
    document.body.appendChild(googleForm);
    googleForm.submit();
    googleForm.remove();
  }

  function getRegistrationPaymentInfo() {
    let pageContent = {};
    try {
      pageContent = DataStore.get()?.pageContent?.inschrijven || {};
    } catch {
      pageContent = {};
    }
    const lidgeldText =
      pageContent.lidgeld ||
      document.querySelector('[data-page-content="lidgeld"]')?.textContent ||
      "";
    const rekeningnummer =
      pageContent.rekeningnummer ||
      document.querySelector('[data-page-content="rekeningnummer"]')?.textContent ||
      "";
    return { lidgeldText, rekeningnummer };
  }

  function normalizePaymentAmount(amount) {
    const amountNumber = Number(String(amount || "").replace(",", ".").replace(/[^\d.]/g, ""));
    return Number.isFinite(amountNumber) && amountNumber > 0 ? amountNumber : null;
  }

  function buildEpcPaymentPayload({ beneficiary, iban, amount, remittance }) {
    const cleanIban = String(iban || "").replace(/\s+/g, "").toUpperCase();
    const amountNumber = normalizePaymentAmount(amount);
    const amountLine = amountNumber ? `EUR${amountNumber.toFixed(2)}` : "";
    const remittanceText = String(remittance || "").trim().slice(0, 140);
    const beneficiaryName = String(beneficiary || "Scouts Lille-Poederlee").trim().slice(0, 70);

    // EPC069-12 veldvolgorde: gestructureerde mededeling blijft leeg.
    // Vrije tekst hoort in de ongestructureerde mededeling, anders weigert de bankapp de code.
    return [
      "BCD",
      "002",
      "1",
      "SCT",
      "",
      beneficiaryName,
      cleanIban,
      amountLine,
      "",
      "",
      remittanceText,
    ].join("\n");
  }

  function formatIban(iban) {
    return String(iban || "")
      .replace(/\s+/g, "")
      .toUpperCase()
      .replace(/(.{4})/g, "$1 ")
      .trim();
  }

  function formatPaymentAmount(amount) {
    const amountNumber = normalizePaymentAmount(amount);
    if (!amountNumber) return String(amount || "").trim();
    return amountNumber.toLocaleString("nl-BE", { style: "currency", currency: "EUR" });
  }

  let qrCodeLoader = null;

  function loadQrCodeLibrary() {
    if (typeof QRCode !== "undefined") return Promise.resolve();
    if (qrCodeLoader) return qrCodeLoader;
    qrCodeLoader = new Promise((resolve, reject) => {
      const existing = document.querySelector('script[data-qrcode-lib]');
      if (existing) {
        existing.addEventListener("load", () => resolve(), { once: true });
        existing.addEventListener("error", () => reject(new Error("QR laden mislukt")), { once: true });
        return;
      }
      const script = document.createElement("script");
      script.src = "/assets/js/qrcode.min.js";
      script.async = true;
      script.dataset.qrcodeLib = "true";
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("QR laden mislukt"));
      document.head.appendChild(script);
    });
    return qrCodeLoader;
  }

  async function renderRegistrationPaymentQr({ amount, iban, remittance }) {
    const container = document.getElementById("registrationPaymentQr");
    if (!container) {
      console.error("QR-container ontbreekt.");
      return;
    }

    if (!iban) {
      console.error("Geen rekeningnummer beschikbaar voor de betaal-QR.");
      return;
    }

    try {
      await loadQrCodeLibrary();
    } catch (error) {
      console.error(error);
      return;
    }

    if (typeof QRCode === "undefined") {
      console.error("QR-bibliotheek ontbreekt.");
      return;
    }

    const payload = buildEpcPaymentPayload({
      beneficiary: "Scouts Lille-Poederlee",
      iban,
      amount,
      remittance,
    });

    container.replaceChildren();
    // qrcodejs tekent in een lege container.
    new QRCode(container, {
      text: payload,
      width: 180,
      height: 180,
      colorDark: "#2c180f",
      colorLight: "#ffffff",
      correctLevel: QRCode.CorrectLevel.M,
    });
  }

  function clearRegistrationPaymentQr() {
    const container = document.getElementById("registrationPaymentQr");
    if (container) container.replaceChildren();
  }

  function initRegistrationForm() {
    const registrationForm = document.getElementById("registrationForm");
    const paymentCard = document.getElementById("registrationPayment");
    if (!registrationForm) return;

    const hidePaymentStep = () => {
      if (!paymentCard) return;
      paymentCard.hidden = true;
      paymentCard.classList.remove("is-visible");
      clearRegistrationPaymentQr();
    };

    const showPaymentStep = (voornaam, achternaam, takLabel) => {
      if (!paymentCard) return;
      const name = [voornaam, achternaam].filter(Boolean).join(" ").trim();
      const remittance = [name, takLabel].filter(Boolean).join(" - ") || "Naam van het kind - tak";
      const { lidgeldText, rekeningnummer } = getRegistrationPaymentInfo();
      const paymentDetails = document.getElementById("registrationPaymentDetails");
      const paymentAmount = document.getElementById("registrationPaymentAmount");
      const paymentIban = document.getElementById("registrationPaymentIban");
      const paymentMessage = document.getElementById("registrationPaymentMessage");

      if (paymentAmount) paymentAmount.textContent = formatPaymentAmount(lidgeldText);
      if (paymentIban) paymentIban.textContent = formatIban(rekeningnummer);
      if (paymentMessage) paymentMessage.textContent = remittance;
      if (paymentDetails) paymentDetails.hidden = false;

      paymentCard.hidden = false;
      paymentCard.classList.add("is-visible");

      try {
        renderRegistrationPaymentQr({
          amount: lidgeldText,
          iban: rekeningnummer,
          remittance,
        });
      } catch (error) {
        console.error("Betaal-QR aanmaken mislukt:", error);
      }

      paymentCard.scrollIntoView({ behavior: "smooth", block: "start" });
    };

    const registrationFields = [
      { name: "voornaam", message: "Vul de voornaam in." },
      { name: "achternaam", message: "Vul de achternaam in." },
      { name: "tak", message: "Kies een tak." },
    ];

    const setRegistrationFieldError = (field, message) => {
      const error = document.getElementById(`${field.name}Error`);
      if (!error) return;
      if (message) {
        field.setAttribute("aria-invalid", "true");
        field.setAttribute("aria-describedby", error.id);
        error.hidden = false;
        error.textContent = message;
      } else {
        field.removeAttribute("aria-invalid");
        field.removeAttribute("aria-describedby");
        error.hidden = true;
        error.textContent = "";
      }
    };

    registrationForm.addEventListener("input", (event) => {
      const field = event.target;
      if (!field?.name || !document.getElementById(`${field.name}Error`)) return;
      if (String(field.value || "").trim()) setRegistrationFieldError(field, "");
    });

    registrationForm.addEventListener("submit", (event) => {
      event.preventDefault();
      let firstInvalid = null;
      registrationFields.forEach(({ name, message }) => {
        const field = registrationForm.elements.namedItem(name);
        if (!field) return;
        if (!String(field.value || "").trim()) {
          setRegistrationFieldError(field, message);
          firstInvalid ||= field;
        } else {
          setRegistrationFieldError(field, "");
        }
      });
      if (firstInvalid) {
        firstInvalid.focus();
        return;
      }

      const formData = new FormData(registrationForm);
      const voornaam = String(formData.get("voornaam") || "").trim();
      const achternaam = String(formData.get("achternaam") || "").trim();
      const takSelect = registrationForm.querySelector('select[name="tak"]');
      const takLabel = takSelect?.selectedOptions?.[0]?.textContent?.trim() || "";

      const submitBtn = registrationForm.querySelector('button[type="submit"]');
      if (submitBtn) submitBtn.disabled = true;

      submitToGoogleForm(formData);
      showPaymentStep(voornaam, achternaam, takLabel);

      registrationForm.reset();
      const status = document.getElementById("registrationStatus");
      if (status) {
        status.textContent =
          "Je gegevens zijn doorgestuurd. Controleer of de leiding je aanvraag ontvangt, en betaal hieronder. Je bent pas verzekerd na betaling én inschrijving bij Scouts en Gidsen Vlaanderen.";
      }
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = "Opnieuw versturen";
      }
    });

    registrationForm._hidePaymentStep = hidePaymentStep;
  }

  function initRegistrationChoice() {
    const buttons = qsa("[data-registration-choice]");
    const panels = qsa("[data-registration-panel]");
    const registrationSection = document.getElementById("inschrijving");
    const choiceContainer = document.querySelector(".registration-choice");
    const panelStage = document.querySelector(".registration-panels");
    const buttonGroup = document.querySelector(".registration-choice-buttons");
    const liquid = buttonGroup?.querySelector(".registration-liquid");
    if (!buttons.length || !panels.length) return;

    const liquidPath = liquid?.querySelector("path");
    const liquidOrange = [211, 138, 45];
    const liquidGreen = [47, 107, 77];
    let liquidFrame;
    let liquidMotion = null;
    let panelToken = 0;

    const clampUnit = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));
    const lerp = (from, to, progress) => from + (to - from) * progress;
    const easeOutQuint = (value) => 1 - Math.pow(1 - value, 5);
    const easeInOutCubic = (value) =>
      value < 0.5 ? 4 * value * value * value : 1 - Math.pow(-2 * value + 2, 3) / 2;

    const liquidColor = (progress, towardCurrent) => {
      const mix = towardCurrent ? progress : 1 - progress;
      const channels = liquidOrange.map((channel, index) =>
        Math.round(channel + (liquidGreen[index] - channel) * mix),
      );
      return `rgb(${channels.join(", ")})`;
    };

    const buttonBox = (button, groupRect) => {
      const rect = button.getBoundingClientRect();
      return {
        x: rect.left - groupRect.left,
        y: rect.top - groupRect.top,
        w: rect.width,
        h: rect.height,
      };
    };

    const roundedRectPath = (x, y, width, height, radius) => {
      const r = Math.min(radius, width / 2, height / 2);
      return [
        `M ${(x + r).toFixed(2)} ${y.toFixed(2)}`,
        `H ${(x + width - r).toFixed(2)}`,
        `Q ${(x + width).toFixed(2)} ${y.toFixed(2)} ${(x + width).toFixed(2)} ${(y + r).toFixed(2)}`,
        `V ${(y + height - r).toFixed(2)}`,
        `Q ${(x + width).toFixed(2)} ${(y + height).toFixed(2)} ${(x + width - r).toFixed(2)} ${(y + height).toFixed(2)}`,
        `H ${(x + r).toFixed(2)}`,
        `Q ${x.toFixed(2)} ${(y + height).toFixed(2)} ${x.toFixed(2)} ${(y + height - r).toFixed(2)}`,
        `V ${(y + r).toFixed(2)}`,
        `Q ${x.toFixed(2)} ${y.toFixed(2)} ${(x + r).toFixed(2)} ${y.toFixed(2)}`,
        "Z",
      ].join(" ");
    };

    const paintLiquid = (progress, start, end, towardCurrent) => {
      const travel = easeOutQuint(progress);
      const stretch = Math.sin(Math.PI * progress) * 0.22;
      const centerX = lerp(start.x + start.w / 2, end.x + end.w / 2, travel);
      const centerY = lerp(start.y + start.h / 2, end.y + end.h / 2, travel);
      const width = lerp(start.w, end.w, travel) * (1 + stretch);
      const height = lerp(start.h, end.h, travel) * (1 - stretch * 0.28);
      const x = centerX - width / 2;
      const y = centerY - height / 2;
      liquidPath?.setAttribute("d", roundedRectPath(x, y, width, height, Math.min(16, height / 2)));
      if (liquidPath) {
        liquidPath.style.fill = liquidColor(easeInOutCubic(progress), towardCurrent);
      }

      const activeChoice = progress < 0.42
        ? (towardCurrent ? "new" : "current")
        : (towardCurrent ? "current" : "new");
      buttons.forEach((button) => {
        button.classList.toggle("is-active", button.dataset.registrationChoice === activeChoice);
      });
    };

    const showRegistrationPanel = (selectedChoice, direction = 0) => {
      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const next = panels.find((panel) => panel.dataset.registrationPanel === selectedChoice);
      const current = panels.find((panel) => panel !== next && panel.classList.contains("is-visible"));
      const token = ++panelToken;
      panelStage?.classList.toggle("is-current", selectedChoice === "current");
      choiceContainer?.classList.toggle("is-current", selectedChoice === "current");

      panels.forEach((panel) => {
        panel.classList.remove("is-enter-left", "is-enter-right", "is-leave-left", "is-leave-right");
      });

      const reveal = (panel) => {
        if (!panel || token !== panelToken) return;
        panels.forEach((item) => {
          const isVisible = item === panel;
          item.classList.toggle("is-visible", isVisible);
          item.setAttribute("aria-hidden", String(!isVisible));
          item.toggleAttribute("inert", !isVisible);
          if (!isVisible) {
            item.classList.remove("is-enter-left", "is-enter-right", "is-leave-left", "is-leave-right");
          }
        });
      };

      if (!current || current === next || reduceMotion || !direction) {
        reveal(next);
        return;
      }

      current.classList.add(direction > 0 ? "is-leave-left" : "is-leave-right");
      current.classList.remove("is-visible");
      if (next) {
        next.classList.add(direction > 0 ? "is-enter-right" : "is-enter-left");
        next.classList.add("is-visible");
        next.setAttribute("aria-hidden", "false");
        next.toggleAttribute("inert", false);
        current.setAttribute("aria-hidden", "true");
        current.toggleAttribute("inert", true);
        window.setTimeout(() => {
          if (token !== panelToken) return;
          next.classList.remove("is-enter-left", "is-enter-right");
          current.classList.remove("is-leave-left", "is-leave-right");
        }, 420);
      }
    };

    const markChoice = (button) => {
      buttons.forEach((item) => {
        const isActive = item === button;
        item.classList.toggle("is-active", isActive);
        item.setAttribute("aria-selected", String(isActive));
      });
      choiceContainer?.classList.toggle("is-current", button?.dataset.registrationChoice === "current");
    };

    const updateChoiceBlob = (fromButton, toButton, animate = true) => {
      if (!buttonGroup || !toButton || !liquid || !liquidPath) return;
      animate = animate && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;

      const groupRect = buttonGroup.getBoundingClientRect();
      liquid.setAttribute("viewBox", `0 0 ${groupRect.width} ${groupRect.height}`);
      const end = buttonBox(toButton, groupRect);
      const start = buttonBox(fromButton || toButton, groupRect);
      const towardCurrent = toButton.dataset.registrationChoice === "current";

      if (liquidFrame) cancelAnimationFrame(liquidFrame);
      if (!animate) {
        liquidMotion = null;
        paintLiquid(1, start, end, towardCurrent);
        markChoice(toButton);
        return;
      }

      const startedAt = performance.now();
      const duration = 620;
      liquidMotion = { fromChoice: fromButton?.dataset.registrationChoice, toChoice: toButton.dataset.registrationChoice, startedAt, duration };

      const animateLiquid = (now) => {
        const progress = Math.min(1, (now - startedAt) / duration);
        paintLiquid(progress, start, end, towardCurrent);
        if (progress < 1) {
          liquidFrame = requestAnimationFrame(animateLiquid);
          return;
        }
        paintLiquid(1, start, end, towardCurrent);
        markChoice(toButton);
        liquidMotion = null;
      };
      liquidFrame = requestAnimationFrame(animateLiquid);
    };

    const setRegistrationHelpOpen = (helpButton, panel, open) => {
      if (!helpButton || !panel) return;
      panel.classList.toggle("is-open", open);
      panel.setAttribute("aria-hidden", String(!open));
      helpButton.setAttribute("aria-expanded", String(open));
      helpButton.classList.toggle("is-open", open);
    };

    const collapseRegistrationHelp = () => {
      qsa("[data-registration-help]").forEach((helpButton) => {
        const panel = document.getElementById(
          helpButton.getAttribute("aria-controls"),
        );
        setRegistrationHelpOpen(helpButton, panel, false);
      });
    };

    buttons.forEach((button) => {
      button.addEventListener("click", () => {
        const selectedChoice = button.dataset.registrationChoice;
        const progress = liquidMotion
          ? clampUnit((performance.now() - liquidMotion.startedAt) / liquidMotion.duration)
          : 1;
        const originChoice = liquidMotion && progress < 0.45
          ? liquidMotion.fromChoice
          : (liquidMotion?.toChoice || buttons.find((item) => item.classList.contains("is-active"))?.dataset.registrationChoice);

        if (selectedChoice === originChoice) {
          const originButton = buttons.find((item) => item.dataset.registrationChoice === originChoice);
          updateChoiceBlob(originButton, originButton, false);
          showRegistrationPanel(selectedChoice, 0);
          return;
        }
        if (liquidMotion?.toChoice === selectedChoice) return;

        collapseRegistrationHelp();

        buttons.forEach((item) => {
          item.setAttribute("aria-selected", String(item === button));
        });

        const fromButton = buttons.find((item) => item.dataset.registrationChoice === originChoice) || button;
        const direction = selectedChoice === "current" ? 1 : -1;
        updateChoiceBlob(fromButton, button, true);
        showRegistrationPanel(selectedChoice, direction);

        if (registrationSection) {
          registrationSection.hidden = true;
          registrationSection.classList.remove("is-visible");
          document.getElementById("registrationForm")?._hidePaymentStep?.();
          const status = document.getElementById("registrationStatus");
          if (status) status.textContent = "";
        }
      });
    });

    const initialChoice = buttons.find((button) => button.classList.contains("is-active")) || buttons[0];
    updateChoiceBlob(initialChoice, initialChoice, false);
    window.addEventListener("resize", () => {
      const activeButton = buttons.find((button) => button.classList.contains("is-active")) || initialChoice;
      updateChoiceBlob(activeButton, activeButton, false);
    });

    qsa("[data-show-registration]").forEach((link) => {
      link.addEventListener("click", (event) => {
        if (!registrationSection) return;
        event.preventDefault();
        document.getElementById("registrationForm")?._hidePaymentStep?.();
        const status = document.getElementById("registrationStatus");
        if (status) status.textContent = "";
        registrationSection.hidden = false;
        registrationSection.classList.add("is-visible");
        registrationSection.scrollIntoView({ behavior: "smooth", block: "start" });
        const firstField = registrationSection.querySelector("input");
        if (firstField) window.setTimeout(() => firstField.focus(), 350);
      });
    });

    qsa("[data-registration-help]").forEach((button) => {
      button.addEventListener("click", () => {
        const panel = document.getElementById(button.getAttribute("aria-controls"));
        if (!panel) return;
        setRegistrationHelpOpen(
          button,
          panel,
          !panel.classList.contains("is-open"),
        );
      });
    });
  }

  /* ==========================================================
       Uniform shirt map markers
       ========================================================== */

  function initUniformGuide() {
    const guide = qs("[data-uniform-guide]");
    if (!guide) return;

    const markers = qsa("[data-uniform-marker]", guide);
    const rules = qsa("[data-uniform-rule]", guide);
    let activeId = null;

    function setActive(id, { scroll = false } = {}) {
      activeId = id;

      markers.forEach((marker) => {
        marker.classList.toggle("is-active", marker.dataset.uniformMarker === id);
      });

      rules.forEach((rule) => {
        const isActive = rule.dataset.uniformRule === id;
        rule.classList.toggle("is-active", isActive);
        if (isActive && scroll) {
          rule.scrollIntoView({ behavior: "smooth", block: "nearest" });
        }
      });
    }

    markers.forEach((marker) => {
      const id = marker.dataset.uniformMarker;

      marker.addEventListener("mouseenter", () => setActive(id, { scroll: true }));
      marker.addEventListener("focus", () => setActive(id, { scroll: true }));
      marker.addEventListener("click", () => setActive(id, { scroll: true }));
    });

    rules.forEach((rule) => {
      const id = rule.dataset.uniformRule;

      rule.addEventListener("mouseenter", () => setActive(id));
      rule.addEventListener("focus", () => setActive(id));
      rule.addEventListener("click", () => setActive(id));
      rule.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          setActive(id);
        }
      });
    });

    setActive("1");
  }

  /* ==========================================================
       Soft page enter animation
       ========================================================== */

  function initPageTransitions() {
    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const isAdmin = document.body.classList.contains("admin-page");

    try {
      sessionStorage.removeItem("page-transition");
    } catch {
      /* ignore legacy transition flag */
    }

    if (!reduceMotion && !isAdmin) {
      document.body.classList.add("page-enter");
      window.setTimeout(() => {
        document.body.classList.remove("page-enter");
      }, 280);
    }
  }

  /* ==========================================================
       FAQ accordion
       ========================================================== */

  function getSmoothDetailsContent(item) {
    return item.querySelector(".faq-content, .registration-bank-content");
  }

  function clearSmoothDetailsCloseTimer(item) {
    if (!item._smoothDetailsCloseTimer) return;
    window.clearTimeout(item._smoothDetailsCloseTimer);
    item._smoothDetailsCloseTimer = null;
  }

  function snapAccordionClosed(item, panel) {
    const nodes = [item, panel].filter(Boolean);
    nodes.forEach((node) => {
      node.style.transition = "none";
    });
    void item.offsetHeight;
    nodes.forEach((node) => {
      node.style.transition = "";
    });
  }

  function closeSmoothDetailsItem(item, { instant = false } = {}) {
    clearSmoothDetailsCloseTimer(item);
    item.classList.remove("open-anim");

    if (instant) {
      item.removeAttribute("open");
      snapAccordionClosed(item, getSmoothDetailsContent(item));
      return;
    }

    // Wait for the CSS close animation (0.35s). Do not use transitionend:
    // it can fire early and removing [open] then snaps the panel shut.
    item._smoothDetailsCloseTimer = window.setTimeout(() => {
      item.removeAttribute("open");
      item._smoothDetailsCloseTimer = null;
    }, 360);
  }

  function openSmoothDetailsItem(item) {
    clearSmoothDetailsCloseTimer(item);
    item.setAttribute("open", "");
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        item.classList.add("open-anim");
      });
    });
  }

  function setupSmoothDetailsAccordion(
    items,
    { exclusive = true, scrollOnOpen = false } = {},
  ) {
    items.forEach((item) => {
      const summary = item.querySelector("summary");
      const content = getSmoothDetailsContent(item);
      if (!summary || !content) return;

      summary.addEventListener("click", (event) => {
        event.preventDefault();

        if (item.classList.contains("open-anim")) {
          closeSmoothDetailsItem(item);
          return;
        }

        const closing = scrollOnOpen
          ? collectOtherOpenAccordions(item)
          : exclusive
            ? items.filter(
                (other) =>
                  other !== item && other.classList.contains("open-anim"),
              )
            : [];

        closeOtherOpenAccordions(item, closing);
        openSmoothDetailsItem(item);

        if (scrollOnOpen) {
          revealOpenedAccordion(item);
        }
      });
    });
  }

  function setupFaqAccordion(container) {
    setupSmoothDetailsAccordion(qsa(".faq-item", container), {
      exclusive: true,
      scrollOnOpen: true,
    });
  }

  function setupRegistrationBankInfo() {
    qsa(".registration-bank-info").forEach((item) => {
      const summary = item.querySelector("summary");
      const content = item.querySelector(".registration-bank-content");
      if (!summary || !content) return;

      const clearCloseTimer = () => {
        if (!item._bankCloseTimer) return;
        window.clearTimeout(item._bankCloseTimer);
        item._bankCloseTimer = null;
      };

      const setExpanded = (expanded) => {
        summary.setAttribute("aria-expanded", String(expanded));
      };

      setExpanded(false);

      summary.addEventListener("click", (event) => {
        event.preventDefault();
        clearCloseTimer();

        if (item.classList.contains("open-anim")) {
          // Lock current height, then animate to 0 for a smooth close.
          content.style.height = `${content.scrollHeight}px`;
          void content.offsetHeight;
          item.classList.remove("open-anim");
          setExpanded(false);
          content.style.height = "0px";
          item._bankCloseTimer = window.setTimeout(() => {
            item.removeAttribute("open");
            content.style.height = "";
            item._bankCloseTimer = null;
          }, 380);

          const anchor =
            document.querySelector(".registration-choice") ||
            document.querySelector(".registration-flow") ||
            item;
          requestAnimationFrame(() => {
            revealOpenedAccordion(anchor);
          });
          return;
        }

        item.setAttribute("open", "");
        setExpanded(true);
        content.style.height = "0px";
        void content.offsetHeight;
        item.classList.add("open-anim");
        content.style.height = `${content.scrollHeight}px`;

        const onOpenEnd = (event) => {
          if (event.target !== content || event.propertyName !== "height") return;
          content.removeEventListener("transitionend", onOpenEnd);
          if (item.classList.contains("open-anim")) {
            content.style.height = "auto";
          }
        };
        content.addEventListener("transitionend", onOpenEnd);

        // After the panel starts opening, bring it into view so IBAN is visible.
        requestAnimationFrame(() => {
          revealOpenedAccordion(item);
        });
      });
    });
  }

  let openedItemScrollTimer = 0;

  function collectOtherOpenAccordions(currentItem) {
    return [
      ...qsa(".news-item.is-open"),
      ...qsa(".agenda-item.is-open"),
      ...qsa(".faq-item.open-anim"),
    ].filter((item) => item !== currentItem);
  }

  // html { scroll-behavior: smooth } would also animate compensation jumps;
  // force an instant scroll so only the intentional reveal is smooth.
  function jumpWindowScroll(top) {
    const root = document.documentElement;
    const previous = root.style.scrollBehavior;
    root.style.scrollBehavior = "auto";
    window.scrollTo(0, Math.max(0, top));
    void root.offsetHeight;
    root.style.scrollBehavior = previous;
  }

  function closeAccordionItem(item, { instant = false } = {}) {
    if (item.classList.contains("news-item")) {
      qsa("[data-news-carousel]", item).forEach((carousel) => {
        carousel._newsCarousel?.stopAutoplay?.();
      });
      closeNewsItem(item, { instant });
      return;
    }

    if (item.classList.contains("agenda-item")) {
      closeAgendaItem(item, { instant });
      return;
    }

    if (item.classList.contains("faq-item")) {
      closeSmoothDetailsItem(item, { instant });
    }
  }

  // Items above close instantly. Compensate scroll so the clicked item does
  // not jump, then revealOpenedAccordion smooth-scrolls it to the top.
  function closeOtherOpenAccordions(currentItem, closingItems) {
    if (!closingItems.length) return;

    const beforeTop = currentItem.getBoundingClientRect().top;
    closingItems.forEach((item) => {
      const above = item.getBoundingClientRect().top < beforeTop - 0.5;
      closeAccordionItem(item, { instant: above });
    });

    const afterTop = currentItem.getBoundingClientRect().top;
    const delta = afterTop - beforeTop;
    if (Math.abs(delta) > 0.5) {
      jumpWindowScroll(window.scrollY + delta);
    }
  }

  function revealOpenedAccordion(item) {
    if (!item) return;
    window.clearTimeout(openedItemScrollTimer);

    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    const run = () => {
      openedItemScrollTimer = 0;
      if (!item.isConnected) return;

      const margin = parseFloat(getComputedStyle(item).scrollMarginTop) || 24;
      const top = item.getBoundingClientRect().top;
      if (top >= margin - 2 && top <= margin + 48) return;

      const target = window.scrollY + top - margin;
      if (reduceMotion) {
        jumpWindowScroll(target);
        return;
      }

      window.scrollTo({ top: Math.max(0, target), behavior: "smooth" });
    };

    requestAnimationFrame(() => {
      requestAnimationFrame(run);
    });
  }

  function closeAgendaItem(item, { instant = false } = {}) {
    if (item._agendaCloseTimer) {
      clearTimeout(item._agendaCloseTimer);
      item._agendaCloseTimer = null;
    }

    item.classList.remove("is-open");

    if (instant) {
      item.removeAttribute("open");
      snapAccordionClosed(item, item.querySelector(".agenda-details"));
      return;
    }

    item._agendaCloseTimer = window.setTimeout(() => {
      item.removeAttribute("open");
      item._agendaCloseTimer = null;
    }, 260);
  }

  function setupAgendaAccordion(container) {
    const agendaItems = qsa(".agenda-item", container);

    agendaItems.forEach((item) => {
      const summary = item.querySelector(".agenda-summary");
      if (!summary) return;

      summary.addEventListener("click", (event) => {
        event.preventDefault();

        if (item.classList.contains("is-open")) {
          closeAgendaItem(item);
          return;
        }

        const closing = collectOtherOpenAccordions(item);
        closeOtherOpenAccordions(item, closing);

        item.setAttribute("open", "");
        requestAnimationFrame(() => item.classList.add("is-open"));
        revealOpenedAccordion(item);
      });
    });
  }

  function closeNewsItem(item, { instant = false } = {}) {
    if (item._newsCloseTimer) {
      clearTimeout(item._newsCloseTimer);
      item._newsCloseTimer = null;
    }

    item.classList.remove("is-open");

    if (instant) {
      item.removeAttribute("open");
      snapAccordionClosed(item, item.querySelector(".news-details"));
      return;
    }

    item._newsCloseTimer = window.setTimeout(() => {
      item.removeAttribute("open");
      item._newsCloseTimer = null;
    }, 320);
  }

  function setupNewsAccordion(container) {
    const newsItems = qsa(".news-item", container);

    newsItems.forEach((item) => {
      const summary = item.querySelector(".news-summary");
      if (!summary || !item.querySelector(".news-details")) return;

      summary.addEventListener("click", (event) => {
        event.preventDefault();

        if (item.classList.contains("is-open")) {
          qsa("[data-news-carousel]", item).forEach((carousel) => {
            carousel._newsCarousel?.stopAutoplay?.();
          });
          closeNewsItem(item);
          return;
        }

        const closing = collectOtherOpenAccordions(item);
        closeOtherOpenAccordions(item, closing);

        item.setAttribute("open", "");
        requestAnimationFrame(() => {
          item.classList.add("is-open");
          qsa("[data-news-carousel]", item).forEach((carousel) => {
            carousel._newsCarousel?.startAutoplay?.();
          });
        });
        revealOpenedAccordion(item);
      });
    });
  }

  const NEWS_HOME_LIMIT = 3;
  const NEWS_IMAGES_MAX = 8;
  const NEWS_CAROUSEL_INTERVAL_MS = 5000;

  function getNewsImages(item) {
    if (!item || typeof item !== "object") return [];
    const fromArray = Array.isArray(item.images)
      ? item.images.filter((src) => typeof src === "string" && src.trim())
      : [];
    if (fromArray.length) return fromArray.map((src) => src.trim());
    if (typeof item.image === "string" && item.image.trim()) {
      return [item.image.trim()];
    }
    return [];
  }

  function setNewsImages(item, images) {
    if (!item || typeof item !== "object") return;
    const cleaned = (images || [])
      .filter((src) => typeof src === "string" && src.trim())
      .map((src) => src.trim())
      .slice(0, NEWS_IMAGES_MAX);
    item.images = cleaned;
    item.image = cleaned[0] || "";
  }

  function normalizeNewsItems(data) {
    if (!data) return;
    if (!Array.isArray(data.news)) data.news = [];
    const usedIds = new Set();
    data.news.forEach((item, index) => {
      if (!item || typeof item !== "object") return;
      if (typeof item.summary !== "string") item.summary = "";
      // Legacy (missing key) stays published; other non-booleans fail closed.
      if (!Object.prototype.hasOwnProperty.call(item, "published")) {
        item.published = true;
      } else if (typeof item.published !== "boolean") {
        item.published = false;
      }
      setNewsImages(item, getNewsImages(item));

      let id =
        typeof item.id === "string" ? item.id.trim().replace(/^#/, "") : "";
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/i.test(id)) {
        id = slugifyNewsTitle(item.title, index);
      }
      id = id.toLowerCase();
      let unique = id;
      let suffix = 2;
      while (usedIds.has(unique)) {
        unique = `${id}-${suffix}`;
        suffix += 1;
      }
      usedIds.add(unique);
      item.id = unique;
    });
  }

  function getPublishedNewsItems(items) {
    return (Array.isArray(items) ? items : []).filter(
      (item) => item && item.published === true,
    );
  }

  function padTwoDigits(value) {
    return String(value).padStart(2, "0");
  }

  function buildNewsCarouselHtml(images, title) {
    if (!images.length) return "";
    const altText = title || "Nieuwsfoto";
    if (images.length === 1) {
      return `<figure class="news-media">${responsivePictureHtml(images[0], {
        alt: altText,
        sizes: "(max-width: 800px) 100vw, 42vw",
        widths: RESPONSIVE_WIDTHS.content,
        loading: "lazy",
      })}</figure>`;
    }

    const total = images.length;
    const slides = images
      .map(
        (src, index) => `
                      <div class="news-carousel-slide${index === 0 ? " is-active" : ""}" data-slide-index="${index}" role="group" aria-roledescription="slide" aria-label="Foto ${index + 1} van ${total}">
                        ${responsivePictureHtml(src, {
                          alt: `${altText} ${index + 1}`,
                          sizes: "(max-width: 800px) 100vw, 42vw",
                          widths: RESPONSIVE_WIDTHS.content,
                          loading: index === 0 ? "eager" : "lazy",
                        }).replaceAll("<img", '<img draggable="false"')}
                      </div>`,
      )
      .join("");
    const dots = images
      .map(
        (_, index) =>
          `<button type="button" class="news-carousel-dot${index === 0 ? " is-active" : ""}" role="tab" data-carousel-dot="${index}" aria-label="Foto ${index + 1} van ${total}" aria-selected="${index === 0 ? "true" : "false"}" tabindex="${index === 0 ? "0" : "-1"}"></button>`,
      )
      .join("");

    return `
                      <figure class="news-media news-carousel" data-news-carousel aria-roledescription="carousel" aria-label="Foto's bij ${escapeHtml(altText)}">
                        <div class="news-carousel-viewport" tabindex="0">
                          <div class="news-carousel-track">
                            ${slides}
                          </div>
                          <div class="news-carousel-overlay">
                            <div class="news-carousel-dots" role="tablist" aria-label="Foto's">
                              ${dots}
                            </div>
                            <p class="news-carousel-status" aria-live="polite">
                              <span data-carousel-current>${padTwoDigits(1)}</span><span class="news-carousel-status-sep" aria-hidden="true">/</span><span data-carousel-total>${padTwoDigits(total)}</span>
                            </p>
                          </div>
                          <div class="news-carousel-progress" aria-hidden="true"><span></span></div>
                        </div>
                      </figure>`;
  }

  function setupNewsCarousel(carousel) {
    if (!carousel || carousel.dataset.carouselReady === "true") return;
    const slides = qsa(".news-carousel-slide", carousel);
    const dots = qsa("[data-carousel-dot]", carousel);
    const dotsWrap = qs(".news-carousel-dots", carousel);
    const track = qs(".news-carousel-track", carousel);
    const viewport = qs(".news-carousel-viewport", carousel);
    const currentLabel = qs("[data-carousel-current]", carousel);
    const progress = qs(".news-carousel-progress", carousel);
    const progressBar = qs(".news-carousel-progress > span", carousel);
    if (slides.length <= 1 || !track || !viewport) return;

    carousel.dataset.carouselReady = "true";
    let index = 0;
    let timer = 0;
    let pointerId = null;
    let startX = 0;
    let startY = 0;
    let deltaX = 0;
    let axis = null;
    let dragging = false;
    let pausedByUser = false;
    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    const syncFrame = () => {
      const images = slides
        .map((slide) => slide.querySelector("img"))
        .filter((img) => img && img.naturalWidth > 0);
      if (!images.length) return;

      let best = images[0];
      let bestArea = best.naturalWidth * best.naturalHeight;
      images.forEach((img) => {
        const area = img.naturalWidth * img.naturalHeight;
        if (area > bestArea) {
          best = img;
          bestArea = area;
        }
      });
      viewport.style.aspectRatio = `${best.naturalWidth} / ${best.naturalHeight}`;
    };

    const stopProgress = () => {
      if (!progress || !progressBar) return;
      progress.classList.remove("is-running");
      progressBar.style.animation = "none";
      // Force reflow so the next animation can restart cleanly.
      void progressBar.offsetWidth;
      progressBar.style.animation = "";
    };

    const startProgress = () => {
      if (!progress || !progressBar || reduceMotion || pausedByUser) {
        stopProgress();
        return;
      }
      const details = carousel.closest("details.news-item");
      if (details && !details.classList.contains("is-open")) {
        stopProgress();
        return;
      }
      progress.style.setProperty(
        "--carousel-progress-ms",
        `${NEWS_CAROUSEL_INTERVAL_MS}ms`,
      );
      stopProgress();
      progress.classList.add("is-running");
    };

    const goTo = (nextIndex, { animate = true } = {}) => {
      index = ((nextIndex % slides.length) + slides.length) % slides.length;
      track.style.transition = animate && !reduceMotion ? "" : "none";
      track.style.transform = `translate3d(-${index * 100}%, 0, 0)`;
      slides.forEach((slide, slideIndex) => {
        const active = slideIndex === index;
        slide.classList.toggle("is-active", active);
        slide.setAttribute("aria-hidden", active ? "false" : "true");
      });
      dots.forEach((dot, dotIndex) => {
        const active = dotIndex === index;
        dot.classList.toggle("is-active", active);
        dot.setAttribute("aria-selected", active ? "true" : "false");
        dot.tabIndex = active ? 0 : -1;
      });
      if (currentLabel) currentLabel.textContent = padTwoDigits(index + 1);
      if (!animate) {
        requestAnimationFrame(() => {
          track.style.transition = "";
        });
      }
    };

    const stopAutoplay = () => {
      if (timer) {
        window.clearInterval(timer);
        timer = 0;
      }
      stopProgress();
    };

    const startAutoplay = () => {
      stopAutoplay();
      if (reduceMotion || slides.length < 2 || pausedByUser) return;
      const details = carousel.closest("details.news-item");
      if (details && !details.classList.contains("is-open")) return;
      startProgress();
      timer = window.setInterval(() => {
        goTo(index + 1);
        startProgress();
      }, NEWS_CAROUSEL_INTERVAL_MS);
    };

    const restartAutoplay = () => {
      stopAutoplay();
      startAutoplay();
    };

    const step = (direction) => {
      goTo(index + direction);
      restartAutoplay();
    };

    dots.forEach((dot) => {
      dot.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        goTo(Number(dot.dataset.carouselDot) || 0);
        restartAutoplay();
      });
    });

    const onKeyNav = (event) => {
      if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
      event.preventDefault();
      event.stopPropagation();
      step(event.key === "ArrowRight" ? 1 : -1);
    };

    dotsWrap?.addEventListener("keydown", onKeyNav);
    viewport.addEventListener("keydown", onKeyNav);

    const pause = () => {
      pausedByUser = true;
      stopAutoplay();
    };
    const resume = () => {
      pausedByUser = false;
      startAutoplay();
    };

    carousel.addEventListener("mouseenter", pause);
    carousel.addEventListener("mouseleave", resume);
    carousel.addEventListener("focusin", pause);
    carousel.addEventListener("focusout", (event) => {
      if (!carousel.contains(event.relatedTarget)) resume();
    });

    viewport.addEventListener("pointerdown", (event) => {
      if (event.button !== undefined && event.button !== 0) return;
      if (event.target.closest("button")) return;
      pointerId = event.pointerId;
      startX = event.clientX;
      startY = event.clientY;
      deltaX = 0;
      axis = null;
      dragging = true;
      stopAutoplay();
    });

    viewport.addEventListener("pointermove", (event) => {
      if (!dragging || event.pointerId !== pointerId) return;
      const dx = event.clientX - startX;
      const dy = event.clientY - startY;

      if (axis === null) {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
        axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
        if (axis === "y") {
          dragging = false;
          pointerId = null;
          restartAutoplay();
          return;
        }
        viewport.setPointerCapture?.(pointerId);
        viewport.classList.add("is-dragging");
        track.style.transition = "none";
      }

      if (axis !== "x") return;
      deltaX = dx;
      const width = viewport.clientWidth || 1;
      let drag = deltaX;
      // Soft rubber-band at the ends.
      if ((index === 0 && drag > 0) || (index === slides.length - 1 && drag < 0)) {
        drag *= 0.35;
      }
      const offset = -index * 100 + (drag / width) * 100;
      track.style.transform = `translate3d(${offset}%, 0, 0)`;
    });

    const endDrag = (event) => {
      if (event.pointerId !== pointerId) return;
      const wasHorizontal = axis === "x";
      viewport.classList.remove("is-dragging");
      if (dragging && wasHorizontal) {
        viewport.releasePointerCapture?.(pointerId);
        const width = viewport.clientWidth || 1;
        const threshold = Math.min(56, width * 0.18);
        if (Math.abs(deltaX) > threshold) {
          goTo(index + (deltaX < 0 ? 1 : -1));
        } else {
          goTo(index);
        }
      }
      dragging = false;
      pointerId = null;
      axis = null;
      deltaX = 0;
      restartAutoplay();
    };

    viewport.addEventListener("pointerup", endDrag);
    viewport.addEventListener("pointercancel", endDrag);
    viewport.addEventListener("pointerleave", (event) => {
      if (dragging && event.pointerId === pointerId) endDrag(event);
    });

    slides.forEach((slide) => {
      const img = slide.querySelector("img");
      if (!img) return;
      if (img.complete) syncFrame();
      else img.addEventListener("load", syncFrame, { once: true });
    });
    window.addEventListener("resize", debounce(syncFrame, 120));

    carousel._newsCarousel = { startAutoplay, stopAutoplay, goTo };
    goTo(0, { animate: false });
    syncFrame();
    startAutoplay();
  }

  function initNewsCarousels(container = document) {
    qsa("[data-news-carousel]", container).forEach(setupNewsCarousel);
  }

  function buildNewsItemHtml(item, index = 0) {
    const images = getNewsImages(item);
    const date = typeof item.date === "string" ? item.date.trim() : "";
    const title = typeof item.title === "string" ? item.title.trim() : "";
    const summary =
      typeof item.summary === "string" ? item.summary.trim() : "";
    const text = typeof item.text === "string" ? item.text.trim() : "";
    const link =
      typeof item.link === "string" &&
      /^(https?:\/\/|mailto:)/i.test(item.link.trim())
        ? item.link.trim()
        : "";
    const linkText =
      typeof item.linkText === "string" ? item.linkText.trim() : "";
    const anchorId = newsItemAnchorId(item, index);
    const hasDetails = Boolean(text || images.length || (link && linkText));
    const teaser = summary || (!hasDetails && text ? text : "");
    const sharePath = newsSharePath(anchorId);
    const shareHtml = `
                      <div class="news-share-row">
                        <p class="news-share-caption">Deel dit bericht</p>
                        <div class="news-share-box">
                          <code class="news-share-url" title="${escapeHtml(sharePath)}">${escapeHtml(sharePath)}</code>
                          <button type="button" class="news-share" data-news-share="${escapeHtml(anchorId)}" aria-label="Kopieer deelbare link ${escapeHtml(sharePath)}">
                            <span class="news-share-label">Kopieer</span>
                          </button>
                        </div>
                      </div>`;
    const detailsHtml = hasDetails
      ? `
                  <div class="news-details">
                    <div class="news-details-inner">
                      <div class="news-details-copy">
                        ${text ? `<p>${escapeHtml(text)}</p>` : ""}
                        ${
                          link && linkText
                            ? `<a class="news-link" href="${escapeHtml(link)}" target="_blank" rel="noopener noreferrer">${escapeHtml(linkText)} <span class="icon-arrow-external" aria-hidden="true"></span></a>`
                            : ""
                        }
                        ${shareHtml}
                      </div>
                      ${buildNewsCarouselHtml(images, title)}
                    </div>
                  </div>
                `
      : "";

    const thumb = images[0]
      ? `<span class="news-thumb" aria-hidden="true">${thumbImageHtml(images[0])}</span>`
      : "";

    return `
                <details id="${escapeHtml(anchorId)}" class="news-item${images.length ? " has-news-image" : ""}${hasDetails ? "" : " is-static"}">
                  <summary class="news-summary">
                    ${thumb}
                    <div class="news-copy">
                      ${date ? `<span class="news-date">${escapeHtml(date)}</span>` : ""}
                      <h3>${escapeHtml(title || "Nieuws")}</h3>
                      ${teaser ? `<p class="news-teaser">${escapeHtml(teaser)}</p>` : ""}
                    </div>
                  </summary>
                  ${detailsHtml}
                </details>
              `;
  }

  /* ==========================================================
       Scroll-reveal animations
       ========================================================== */

  const revealSelector =
    ".section-top, .practical-heading, .branch, .news-item, .agenda-item, .faq-item";
  let revealObserver = null;

  function initRevealAnimations() {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const homePage = document.body.classList.contains("home-page");
    if (!homePage) return;

    const elements = qsa(revealSelector).filter(
      (element) => !element.dataset.revealReady,
    );
    if (elements.length === 0) return;

    const supportsViewTimeline = window.CSS && CSS.supports("animation-timeline", "view()");

    elements.forEach((element) => {
      element.dataset.revealReady = "true";
      if (supportsViewTimeline) element.classList.add("reveal-in");
    });

    if (supportsViewTimeline || !("IntersectionObserver" in window)) {
      if (!supportsViewTimeline) {
        elements.forEach((element) => element.classList.add("reveal-fallback"));
      }
      return;
    }

    if (!revealObserver) {
      revealObserver = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (!entry.isIntersecting) return;
            entry.target.classList.add("reveal-fallback");
            revealObserver.unobserve(entry.target);
          });
        },
        { threshold: 0, rootMargin: "0px 0px 40% 0px" },
      );
    }

    elements.forEach((element) => revealObserver.observe(element));
  }

  /* ==========================================================
       Secondhand items carousel
       ========================================================== */

  function setupSecondhandScroll() {
    const secondhandScroll = qs(".secondhand-scroll");
    const buttons = qsa(".secondhand-scroll-button");
    const status = qs(".secondhand-scroll-status");

    if (!secondhandScroll) return;

    const items = qsa(".secondhand-item", secondhandScroll);
    const itemsSection = secondhandScroll.closest(".secondhand-items");
    if (itemsSection) itemsSection.hidden = false;

    if (items.length === 0) {
      secondhandScroll.innerHTML = `
                <div class="secondhand-empty">
                    <h3>Geen items beschikbaar</h3>
                    <p>Neem later zeker nog eens een kijkje!</p>
                </div>
            `;
      buttons.forEach((button) => {
        button.hidden = true;
      });
      if (status) status.hidden = true;
      return;
    }

    buttons.forEach((button) => {
      button.hidden = false;
    });

    if (status) {
      status.hidden = false;
    }

    const updateControls = () => {
      const maxScroll =
        secondhandScroll.scrollWidth - secondhandScroll.clientWidth;

      const currentIndex = items.reduce((closestIndex, item, index) => {
        const distance = Math.abs(
          item.offsetLeft - secondhandScroll.scrollLeft,
        );

        const closestDistance = Math.abs(
          items[closestIndex].offsetLeft - secondhandScroll.scrollLeft,
        );

        return distance < closestDistance ? index : closestIndex;
      }, 0);

      buttons.forEach((button) => {
        button.disabled =
          button.dataset.scrollDirection === "-1"
            ? secondhandScroll.scrollLeft <= 2
            : secondhandScroll.scrollLeft >= maxScroll - 2;
      });

      if (status) {
        status.textContent = `${currentIndex + 1} / ${items.length}`;
      }
    };

    buttons.forEach((button) => {
      button.onclick = () => {
        const firstItem = items[0];

        const gap = parseFloat(getComputedStyle(secondhandScroll).gap) || 0;

        const distance = firstItem
          ? firstItem.getBoundingClientRect().width + gap
          : secondhandScroll.clientWidth;

        secondhandScroll.scrollBy({
          left: distance * Number(button.dataset.scrollDirection),
          behavior: "smooth",
        });
      };
    });

    secondhandScroll.addEventListener("scroll", updateControls, {
      passive: true,
    });

    window.addEventListener("resize", debounce(updateControls));

    updateControls();
  }

  const DataStore = {
    _cache: null,
    _version: null,
    _saveQueue: Promise.resolve(),
    _storageKey: "scouts_site_data_cache",

    _readVersion(response) {
      const header = response.headers.get("X-Scouts-Data-Version");
      if (header) return header.trim();
      const etag = response.headers.get("ETag");
      if (!etag) return null;
      return etag
        .replace(/^W\//, "")
        .trim()
        .replace(/"/g, "")
        .replace(/-[ap]\d*$/i, "");
    },

    _isAdminEtag(etag) {
      const token = String(etag || "")
        .replace(/^W\//, "")
        .trim()
        .replace(/"/g, "");
      return /-[aA]\d*$/.test(token);
    },

    _clearSessionCache() {
      try {
        sessionStorage.removeItem(this._storageKey);
      } catch {
        // ignore
      }
    },

    _readSessionCache() {
      try {
        const raw = sessionStorage.getItem(this._storageKey);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object" || !parsed.data) return null;
        // Never reuse an admin payload as a public cache.
        if (this._isAdminEtag(parsed.etag)) {
          this._clearSessionCache();
          return null;
        }
        return parsed;
      } catch {
        return null;
      }
    },

    _writeSessionCache(etag, version, data) {
      if (this._isAdminEtag(etag)) {
        this._clearSessionCache();
        return;
      }
      try {
        sessionStorage.setItem(
          this._storageKey,
          JSON.stringify({ etag, version, data }),
        );
      } catch {
        // Quota / private mode — ignore.
      }
    },

    async load({ force = false } = {}) {
      if (this._cache && !force) return this._cache;

      // Fastest path: data already inlined in the HTML (no network wait).
      if (!force && window.__SCOUTS_SITE_DATA__) {
        this._cache = window.__SCOUTS_SITE_DATA__;
        this._version =
          window.__SCOUTS_SITE_DATA_META__?.version ||
          this._version ||
          null;
        normalizeNewsItems(this._cache);
        normalizeBranchLeadership(this._cache);
        this._writeSessionCache(
          window.__SCOUTS_SITE_DATA_META__?.etag || null,
          this._version,
          this._cache,
        );
        window.__SCOUTS_SITE_DATA__ = null;
        return this._cache;
      }

      const cached = force ? null : this._readSessionCache();
      const headers = {};
      if (!force && cached?.etag) {
        headers["If-None-Match"] = cached.etag;
      }
      const response = await fetch("/api/site-data", {
        credentials: "same-origin",
        headers,
        cache: force ? "no-store" : "default",
      });

      if (response.status === 401) {
        this._clearSessionCache();
        this._cache = null;
        throw new Error("Niet geautoriseerd");
      }

      if (response.status === 304 && cached?.data) {
        this._version = cached.version || this._readVersion(response);
        this._cache = cached.data;
        normalizeNewsItems(this._cache);
        normalizeBranchLeadership(this._cache);
        return this._cache;
      }

      if (!response.ok) {
        // Do not fall back to a possibly-admin cache after auth loss.
        if (cached?.data && !this._isAdminEtag(cached.etag)) {
          this._version = cached.version || null;
          this._cache = cached.data;
          normalizeNewsItems(this._cache);
          normalizeBranchLeadership(this._cache);
          return this._cache;
        }
        this._clearSessionCache();
        throw new Error("Kon gegevens niet laden");
      }

      this._version = this._readVersion(response);
      this._cache = await response.json();
      normalizeNewsItems(this._cache);
      normalizeBranchLeadership(this._cache);
      this._writeSessionCache(
        response.headers.get("ETag"),
        this._version,
        this._cache,
      );
      return this._cache;
    },

    get() {
      if (!this._cache) {
        throw new Error("DataStore.get() called before load()");
      }

      return this._cache;
    },

    getVersion() {
      return this._version;
    },

    setVersion(version) {
      this._version = version || null;
    },

    async save(data) {
      // Elke save wacht tot de vorige save volledig klaar is.
      this._saveQueue = this._saveQueue.then(async () => {
        const headers = {
          "Content-Type": "application/json",
        };
        if (this._version) {
          headers["If-Match"] = this._version;
        }

        const response = await fetch("/api/site-data", {
          method: "POST",
          headers,
          body: JSON.stringify(data),
        });

        if (response.status === 409) {
          const result = await response.json().catch(() => ({}));
          const error = new Error(
            result.message ||
              "Iemand anders heeft ondertussen opgeslagen. Herlaad en probeer opnieuw.",
          );
          error.code = "version_conflict";
          throw error;
        }

        if (response.status === 428) {
          const result = await response.json().catch(() => ({}));
          const error = new Error(
            result.message ||
              "Ontbrekende versiecontrole. Herlaad de pagina en probeer opnieuw.",
          );
          error.code = "missing_version";
          throw error;
        }

        if (!response.ok) {
          const result = await response.json().catch(() => ({}));
          throw new Error(result.message || "Kon gegevens niet opslaan");
        }

        const result = await response.json().catch(() => ({}));
        this._version =
          result.version || this._readVersion(response) || this._version;
        this._cache = data;
        try {
          sessionStorage.removeItem(this._storageKey);
        } catch {
          // ignore
        }
        return data;
      });

      return this._saveQueue;
    },
  };

  /* ==========================================================
       Shared content helpers
       ========================================================== */

  const BRANCH_LABELS = {
    kapoenen: "Kapoenen",
    welpen: "Welpen",
    jongverkenners: "Jongverkenners",
    verkenners: "Verkenners",
    jins: "Jins",
  };

  const PLANNING_MONTHS = [
    "januari",
    "februari",
    "maart",
    "april",
    "mei",
    "juni",
    "juli",
    "augustus",
    "september",
    "oktober",
    "november",
    "december",
  ];

  function getMonthlyPlanning(data, branch) {
    return data.photos?.monthlyPlanning?.[branch] || "";
  }

  function setMonthlyPlanning(data, branch, value) {
    if (!data.photos.monthlyPlanning) data.photos.monthlyPlanning = {};
    data.photos.monthlyPlanning[branch] = value;
  }

  function planningMonthsFromTitle(title) {
    return String(title || "")
      .split(/[_\s,-]+/)
      .map((part) => part.trim().toLowerCase())
      .filter((month) => PLANNING_MONTHS.includes(month));
  }

  function formatPlanningLabel(title) {
    const months = planningMonthsFromTitle(title);
    const label = months.length
      ? months.join(", ")
      : String(title || "")
          .replace(/\.pdf$/i, "")
          .replace(/[-_]+/g, " ")
          .trim();
    if (!label) return "Maandplanning";
    return label.charAt(0).toUpperCase() + label.slice(1);
  }

  function slugifyDownloadPart(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  function buildPlanningDownloadName(branch, title) {
    const branchPart =
      slugifyDownloadPart(BRANCH_LABELS[branch] || branch) || "tak";
    const months = planningMonthsFromTitle(title);
    const monthPart = months.length
      ? months.map((month) => slugifyDownloadPart(month)).join("-")
      : slugifyDownloadPart(formatPlanningLabel(title)) || "planning";
    return `maandplanning-${branchPart}-${monthPart}.pdf`;
  }

  function buildLetterDownloadName(branch, title) {
    const branchPart =
      slugifyDownloadPart(BRANCH_LABELS[branch] || branch) || "tak";
    const titlePart = slugifyDownloadPart(title) || "brief";
    return `brief-${branchPart}-${titlePart}.pdf`;
  }

  function getMonthlyPlanningTitle(data, branch) {
    const savedTitle = data.photos?.monthlyPlanningTitle?.[branch];
    if (savedTitle) return savedTitle;

    const path = getMonthlyPlanning(data, branch);
    const filename = path.split("/").pop()?.split("?")[0] || "Maandplanning";
    return decodeURIComponent(filename)
      .replace(/\.pdf$/i, "")
      .replace(/[-_]+/g, " ");
  }

  function setMonthlyPlanningTitle(data, branch, value) {
    if (!data.photos.monthlyPlanningTitle)
      data.photos.monthlyPlanningTitle = {};
    data.photos.monthlyPlanningTitle[branch] = value;
  }

  function getBranchLetters(data, branch) {
    return Array.isArray(data.letters?.[branch]) ? data.letters[branch] : [];
  }

  const TAKLEIDER_SUFFIX = /\s*\(\s*takleider\s*\)\s*$/i;

  function stripTakleiderSuffix(name) {
    return String(name ?? "").replace(TAKLEIDER_SUFFIX, "").trim();
  }

  function leadershipPublicName(item) {
    const rawName = String(item?.name ?? "");
    const name = stripTakleiderSuffix(rawName);
    const isTakleider =
      Boolean(item?.takleider) || TAKLEIDER_SUFFIX.test(rawName);
    return isTakleider && name ? `${name} (Takleider)` : name;
  }

  function normalizeBranchLeaderList(list) {
    if (!Array.isArray(list)) return;

    const suffixIndexes = [];
    list.forEach((item, index) => {
      if (!item || typeof item !== "object") return;
      const rawName = String(item.name ?? "");
      if (TAKLEIDER_SUFFIX.test(rawName)) suffixIndexes.push(index);
      item.name = stripTakleiderSuffix(rawName);
      item.takleider = Boolean(item.takleider);
    });

    let chosen = -1;
    if (suffixIndexes.length) {
      chosen = suffixIndexes[suffixIndexes.length - 1];
    } else {
      for (let index = list.length - 1; index >= 0; index -= 1) {
        if (list[index]?.takleider) {
          chosen = index;
          break;
        }
      }
    }

    list.forEach((item, index) => {
      if (!item || typeof item !== "object") return;
      item.takleider = index === chosen;
    });
  }

  function normalizeBranchLeadership(data) {
    const branches = data?.branchLeadership;
    if (!branches || typeof branches !== "object") return;
    Object.values(branches).forEach((list) => normalizeBranchLeaderList(list));
  }

  function phoneTelHref(phone) {
    const digits = String(phone ?? "").replace(/[^\d+]/g, "");
    if (!digits) return "";
    if (digits.startsWith("+")) return `tel:${digits}`;
    if (digits.startsWith("00")) return `tel:+${digits.slice(2)}`;
    if (digits.startsWith("0")) return `tel:+32${digits.slice(1)}`;
    return `tel:${digits}`;
  }

  function renderLeadershipList(
    container,
    items,
    includeEmail = false,
    email = "",
  ) {
    if (!container) return;
    container.replaceChildren();

    const appendItem = (label, value, href = "") => {
      const item = document.createElement("li");
      const strong = document.createElement("strong");
      strong.textContent = label;
      item.append(strong, document.createTextNode(" "));

      const text = String(value ?? "").trim();
      if (text && href) {
        const link = document.createElement("a");
        link.className = "phone-number";
        link.href = href;
        link.textContent = text;
        item.append(link);
      } else {
        const span = document.createElement("span");
        span.className = "phone-number";
        span.textContent = text;
        item.append(span);
      }

      container.append(item);
    };

    const mail = String(email ?? "").trim();
    if (includeEmail && mail) {
      appendItem("Email", mail, `mailto:${mail}`);
    }

    items.forEach((item) => {
      const phone = String(item?.phone ?? "").trim();
      appendItem(leadershipPublicName(item), phone, phoneTelHref(phone));
    });
  }

  /* ==========================================================
       Public page renderer (applies saved admin data to a live page)
       ========================================================== */

  const PageRenderer = {
    updatePageFromData() {
      const data = DataStore.get();
      const pageName = window.location.pathname
        .split("/")
        .pop()
        .replace(".html", "");

      const pageContent = data.pageContent?.[pageName];

      if (pageContent) {
        qsa("[data-page-content]").forEach((element) => {
          const key = element.dataset.pageContent;
          const value = pageContent[key];

          if (value === undefined || value === null) return;

          if (element.tagName === "INPUT" || element.tagName === "TEXTAREA") {
            element.value = value;
          } else {
            setMultilineText(element, value);
          }
        });
      }

      qsa("[data-format-iban]").forEach((element) => {
        const raw =
          element.tagName === "INPUT" || element.tagName === "TEXTAREA"
            ? element.value
            : element.textContent;
        const formatted = formatIban(raw);
        if (!formatted) return;
        if (element.tagName === "INPUT" || element.tagName === "TEXTAREA") {
          element.value = formatted;
        } else {
          element.textContent = formatted;
        }
      });

      updateLidgeldLabels(data.pageContent?.inschrijven?.lidgeld);

      const branchPhotoNames = {
        "branch-kapoenen": "kapoenen",
        "branch-welpen": "welpen",
        "branch-jongverkenners": "jongverkenners",
        "branch-verkenners": "verkenners",
        "branch-jins": "jins",
      };

      qsa(".branch-bg-picture, img.branch-bg").forEach((node) => {
        const card = node.closest(".branch");
        const className = Object.keys(branchPhotoNames).find((name) =>
          card?.classList.contains(name),
        );
        const photo = className
          ? data.photos?.branches?.[branchPhotoNames[className]]
          : "";

        if (!photo) {
          node.hidden = true;
          return;
        }

        const parts = splitResponsiveAsset(photo);
        const img = node.matches("img")
          ? node
          : node.querySelector("img.branch-bg, img");
        const currentSrc = img?.getAttribute("src") || "";
        const currentParts = splitResponsiveAsset(currentSrc);
        if (
          parts &&
          currentParts &&
          currentParts.stem === parts.stem &&
          /(-w\d+|branch-bg)/.test(currentSrc + node.className)
        ) {
          node.hidden = false;
          if (img) img.hidden = false;
          return;
        }

        const html = responsivePictureHtml(photo, {
          alt: "",
          className: "branch-bg",
          pictureClass: "branch-bg-picture",
          // Measured: mobile cards ≈ calc(100vw − 48px) (~343px at 390vw); desktop ≈ 380px.
          sizes: "(max-width: 900px) calc(100vw - 48px), 380px",
          widths: RESPONSIVE_WIDTHS.card,
          loading: "lazy",
          width: 1200,
          height: 900,
        });
        const mount = node.matches("picture") ? node : node;
        mount.outerHTML = html;
      });

      if (pageName === "over-ons") {
        renderLeadershipList(
          qs(".story-card .contact-list"),
          data.groupLeadership,
          true,
          data.contact.email,
        );
      } else if (data.branchLeadership[pageName]) {
        renderLeadershipList(
          qs(".contact-list"),
          data.branchLeadership[pageName],
        );
        const planning = getMonthlyPlanning(data, pageName);
        qs(".document-resource-grid")?.remove();
        const resourceCards = [];
        if (planning) {
          const planningTitle = getMonthlyPlanningTitle(data, pageName);
          const planningLabel = formatPlanningLabel(planningTitle);
          const planningFile = buildPlanningDownloadName(
            pageName,
            planningTitle,
          );
          resourceCards.push(`
                            <div class="page-card planning-download-card">
                                <div class="planning-download-header">
                                    <h3>Maandplanning ${escapeHtml(BRANCH_LABELS[pageName])}</h3>
                                </div>
                                <a class="planning-download-button" href="${escapeHtml(planning)}" target="_blank" rel="noopener" download="${escapeHtml(planningFile)}" aria-label="Download maandplanning ${escapeHtml(planningLabel)}">
                                  <span class="planning-download-button-icon" aria-hidden="true">
                                    <span class="icon-arrow-down"></span>
                                  </span>
                                  <span class="planning-download-button-copy">
                                    <strong>Download PDF</strong>
                                    <span>${escapeHtml(planningLabel)}</span>
                                  </span>
                                </a>
                            </div>
                        `);
        }
        const letters = getBranchLetters(data, pageName);
        if (letters.length) {
          resourceCards.push(`
                            <div class="page-card branch-letters-card planning-download-card">
                                <div class="planning-download-header">
                                    <h3>Brieven ${escapeHtml(BRANCH_LABELS[pageName])}</h3>
                                </div>
                                <div class="branch-letters-list">
                                  ${letters
                                    .map((letter) => {
                                      const letterTitle =
                                        letter.title || "Brief";
                                      const letterFile = buildLetterDownloadName(
                                        pageName,
                                        letterTitle,
                                      );
                                      return `
                                    <a class="planning-download-button planning-download-button--letter" href="${escapeHtml(letter.path)}" target="_blank" rel="noopener" download="${escapeHtml(letterFile)}" aria-label="Download brief ${escapeHtml(letterTitle)}">
                                      <span class="planning-download-button-icon" aria-hidden="true">
                                        <span class="icon-arrow-down"></span>
                                      </span>
                                      <span class="planning-download-button-copy">
                                        <strong>Download PDF</strong>
                                        <span>${escapeHtml(letterTitle)}</span>
                                      </span>
                                    </a>
                                  `;
                                    })
                                    .join("")}
                                </div>
                            </div>
                        `);
        }
        const branchLayout = qs(".branch-detail-layout");
        if (branchLayout && resourceCards.length) {
          branchLayout.insertAdjacentHTML(
            "afterend",
            `<div class="document-resource-grid">${resourceCards.join("")}</div>`,
          );
        }
      }

      const newsSection = document.getElementById("nieuws");
      const newsEl = qs(".news-list");
      const newsMore = qs(".news-more");
      if (newsEl) {
        const newsItems = getPublishedNewsItems(data.news);
        const isNewsArchive = document.body.classList.contains("news-page");
        const visibleItems = isNewsArchive
          ? newsItems
          : newsItems.slice(0, NEWS_HOME_LIMIT);

        if (!newsItems.length) {
          if (isNewsArchive) newsSection?.removeAttribute("hidden");
          else newsSection?.setAttribute("hidden", "");
          newsEl.innerHTML = isNewsArchive
            ? `<div class="news-empty" role="status">
                    <h3>Er zijn nog geen nieuwsberichten</h3>
                    <p>Neem later zeker nog eens een kijkje!</p>
                </div>`
            : "";
          if (newsMore) newsMore.hidden = true;
        } else {
          newsSection?.removeAttribute("hidden");
          newsEl.innerHTML = visibleItems
            .map((item, index) => buildNewsItemHtml(item, index))
            .join("");
          setupNewsAccordion(newsEl);
          initNewsCarousels(newsEl);
          setupNewsShareLinks(newsEl);
          if (newsMore) {
            newsMore.hidden = isNewsArchive || newsItems.length <= NEWS_HOME_LIMIT;
          }
          openNewsFromHash();
        }
      }

      const agendaEl = qs(".agenda");
      if (agendaEl) {
        const upcomingAgenda = filterUpcomingAgendaItems(data.agenda);
        agendaEl.innerHTML = upcomingAgenda.length
          ? upcomingAgenda
              .map((item) => {
                const image =
                  typeof item.image === "string" ? item.image.trim() : "";
                const link =
                  typeof item.link === "string" &&
                  /^(https?:\/\/|mailto:)/i.test(item.link.trim())
                    ? item.link.trim()
                    : "";
                const linkText =
                  typeof item.linkText === "string" ? item.linkText.trim() : "";
                const thumb = image
                  ? `<span class="agenda-thumb" aria-hidden="true">${thumbImageHtml(image)}</span>`
                  : "";
                return `
                <details class="agenda-item ${image ? "has-agenda-image" : ""}">
                  <summary class="agenda-summary">
                    ${buildAgendaDateHtml(item)}
                    <div class="agenda-body">
                      <h3>${escapeHtml(item.title)}</h3>
                    </div>
                    ${thumb}
                  </summary>
                  <div class="agenda-details">
                    <div class="agenda-details-inner">
                      <p>${escapeHtml(item.text)}</p>
                      ${link && linkText ? `<a class="agenda-link" href="${escapeHtml(link)}" target="_blank" rel="noopener noreferrer">${escapeHtml(linkText)} <span class="icon-arrow-external" aria-hidden="true"></span></a>` : ""}
                      ${
                        image
                          ? responsivePictureHtml(image, {
                              alt: item.title || "",
                              sizes: "(max-width: 700px) 90vw, 360px",
                              widths: RESPONSIVE_WIDTHS.card,
                              loading: "lazy",
                            })
                          : ""
                      }
                    </div>
                  </div>
                </details>
              `;
              })
              .join("")
          : `<p class="agenda-empty">Er staan momenteel geen activiteiten gepland.</p>`;
        setupAgendaAccordion(agendaEl);
      }

      const faqEl = qs(".faq-list");
      if (faqEl) {
        faqEl.innerHTML = data.faq
          .map(
            (item) => `
                        <details class="faq-item">
                            <summary>${escapeHtml(item.question)}</summary>
                            <div class="faq-content">
                                <div class="faq-content-inner"><p>${formatFaqAnswerHtml(item.answer)}</p></div>
                            </div>
                        </details>
                    `,
          )
          .join("");
        setupFaqAccordion(faqEl);
      }

      const email = qs(".footer-column a[href^='mailto:']");
      if (email && data.contact.email) {
        email.href = `mailto:${data.contact.email}`;
        email.textContent = data.contact.email;
      }

      const footerAddress = qs("[data-footer-address]");
      if (footerAddress && data.contact.address) {
        const address = String(data.contact.address).trim();
        if (footerAddress.tagName === "A") {
          footerAddress.href = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
        }
        setMultilineText(footerAddress, address.replace(/,/g, ",\n"));
      }

      const aboutHero = qs(".about-hero");
      if (aboutHero && data.photos.aboutHero) {
        // PHP may already set the hero background for first paint.
        if (aboutHero.getAttribute("data-about-hero-boot") !== "1") {
          const aboutParts = splitResponsiveAsset(data.photos.aboutHero);
          if (aboutParts) {
            const q = aboutParts.query;
            const webp = withAssetQuery(`${aboutParts.stem}-w1600.webp`, q);
            const jpg = withAssetQuery(`${aboutParts.stem}-w1600.jpg`, q);
            aboutHero.style.backgroundImage = `image-set(url("${webp}") type("image/webp"), url("${jpg}") type("image/jpeg")), url("${jpg}")`;
          } else {
            aboutHero.style.backgroundImage = `url("${data.photos.aboutHero}")`;
          }
        }
      }

      applyConfigurablePageBackgrounds(data);

      if (data.photos.branches[pageName]) {
        const branchPhoto = qs(".branch-photo");
        const branchImage = branchPhoto?.querySelector("img, picture");
        if (branchPhoto && branchImage) {
          const full = data.photos.branches[pageName];
          const parts = splitResponsiveAsset(full);
          const current = splitResponsiveAsset(
            branchImage.matches("img")
              ? branchImage.getAttribute("src") || ""
              : branchImage.querySelector("img")?.getAttribute("src") || "",
          );
          if (!(parts && current && parts.stem === current.stem)) {
            branchImage.outerHTML = responsivePictureHtml(full, {
              alt: "",
              sizes: "(max-width: 800px) 100vw, 560px",
              widths: RESPONSIVE_WIDTHS.branch,
              loading: "lazy",
              width: 1600,
              height: 1200,
            });
          }
        }
      }

      const secondhandScroll = qs(".secondhand-scroll");
      if (secondhandScroll) {
        secondhandScroll.innerHTML = data.secondhand
          .map(
            (item) => `
                        <article class="secondhand-item">
                            <div class="secondhand-item-image">
                                ${responsivePictureHtml(
                                  item.image || "../assets/images/domein.jpg",
                                  {
                                    alt: item.title || "",
                                    sizes: "(max-width: 700px) 70vw, 280px",
                                    widths: RESPONSIVE_WIDTHS.card,
                                    loading: "lazy",
                                    width: 800,
                                    height: 800,
                                  },
                                )}
                            </div>
                            <div class="secondhand-item-content">
                                <span class="secondhand-item-category">${escapeHtml(item.category || "Materiaal")}</span>
                                <h3>${escapeHtml(item.title || "Tweedehands item")}</h3>
                                <p class="secondhand-item-info">${escapeHtml(item.size || item.info || "")}</p>
                                <div class="secondhand-item-bottom">
                                    <strong>€${escapeHtml(String(item.price || "").replace(/^€\s*/, ""))}</strong>
                                </div>
                            </div>
                        </article>
                    `,
          )
          .join("");
        setupSecondhandScroll();
      }

      initRevealAnimations();
    },
  };

  let dialogOpen = false;

  function openDialog({
    title,
    description = "",
    confirmLabel = "Doorgaan",
    cancelLabel = "Annuleren",
    tone = "default",
    input = null,
  } = {}) {
    const hasInput = Boolean(input);
    if (dialogOpen) return Promise.resolve(hasInput ? null : false);
    dialogOpen = true;

    return new Promise((resolve) => {
      const previouslyFocused = document.activeElement;
      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

      const root = document.createElement("div");
      root.className = "alert-dialog";

      const overlay = document.createElement("div");
      overlay.className = "alert-dialog-overlay";

      const dialog = document.createElement("div");
      dialog.className = "alert-dialog-content";
      dialog.setAttribute("role", "alertdialog");
      dialog.setAttribute("aria-modal", "true");
      dialog.setAttribute("aria-labelledby", "alert-dialog-title");

      const header = document.createElement("div");
      header.className = "alert-dialog-header";

      const titleEl = document.createElement("h2");
      titleEl.className = "alert-dialog-title";
      titleEl.id = "alert-dialog-title";
      titleEl.textContent = title || "Weet je het zeker?";
      header.append(titleEl);

      const descriptionText = String(description || "").trim();
      if (descriptionText) {
        const descriptionEl = document.createElement("p");
        descriptionEl.className = "alert-dialog-description";
        descriptionEl.id = "alert-dialog-description";
        descriptionEl.textContent = descriptionText;
        header.append(descriptionEl);
        dialog.setAttribute("aria-describedby", "alert-dialog-description");
      }

      let inputEl = null;
      if (hasInput) {
        const field = document.createElement("label");
        field.className = "alert-dialog-field";
        const labelText = String(input.label || "").trim();
        if (labelText) {
          const labelEl = document.createElement("span");
          labelEl.id = "alert-dialog-input-label";
          labelEl.textContent = labelText;
          field.append(labelEl);
        }
        inputEl = document.createElement("input");
        inputEl.className = "alert-dialog-input";
        inputEl.type = input.type === "password" ? "password" : "text";
        inputEl.value = input.value == null ? "" : String(input.value);
        if (input.readOnly) inputEl.readOnly = true;
        if (input.autocomplete) inputEl.setAttribute("autocomplete", input.autocomplete);
        if (labelText) inputEl.setAttribute("aria-labelledby", "alert-dialog-input-label");
        field.append(inputEl);
        header.append(field);
      }

      const footer = document.createElement("div");
      footer.className = "alert-dialog-footer";

      let cancelBtn = null;
      if (String(cancelLabel ?? "").trim() !== "") {
        cancelBtn = document.createElement("button");
        cancelBtn.type = "button";
        cancelBtn.className = "alert-dialog-cancel";
        cancelBtn.textContent = cancelLabel;
        footer.append(cancelBtn);
      }

      const confirmBtn = document.createElement("button");
      confirmBtn.type = "button";
      confirmBtn.className = "alert-dialog-action";
      if (tone === "destructive") confirmBtn.classList.add("is-destructive");
      confirmBtn.textContent = confirmLabel;
      footer.append(confirmBtn);

      dialog.append(header, footer);
      root.append(overlay, dialog);

      const htmlOverflow = document.documentElement.style.overflow;
      const bodyOverflow = document.body.style.overflow;
      document.documentElement.style.overflow = "hidden";
      document.body.style.overflow = "hidden";
      document.body.append(root);

      let settled = false;
      const finish = (result) => {
        if (settled) return;
        settled = true;
        if (cancelBtn) cancelBtn.disabled = true;
        confirmBtn.disabled = true;
        if (inputEl) inputEl.disabled = true;
        root.classList.add("is-closing");
        window.setTimeout(() => {
          root.remove();
          document.documentElement.style.overflow = htmlOverflow;
          document.body.style.overflow = bodyOverflow;
          dialogOpen = false;
          if (previouslyFocused instanceof HTMLElement && previouslyFocused.isConnected) {
            previouslyFocused.focus();
          }
          resolve(result);
        }, reduceMotion ? 0 : 150);
      };

      const confirm = () => finish(hasInput ? inputEl.value : true);
      const cancel = () => finish(hasInput ? null : false);

      cancelBtn?.addEventListener("click", cancel);
      confirmBtn.addEventListener("click", confirm);
      dialog.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          cancel();
          return;
        }
        if (event.key === "Enter" && event.target === inputEl) {
          event.preventDefault();
          confirm();
          return;
        }
        if (event.key !== "Tab") return;
        const focusable = [inputEl, cancelBtn, confirmBtn].filter(Boolean);
        const index = focusable.indexOf(document.activeElement);
        event.preventDefault();
        const nextIndex = event.shiftKey
          ? index <= 0
            ? focusable.length - 1
            : index - 1
          : index === focusable.length - 1 || index === -1
            ? 0
            : index + 1;
        focusable[nextIndex].focus();
      });

      if (inputEl) {
        inputEl.focus();
        if (inputEl.readOnly) inputEl.select();
      } else if (cancelBtn) {
        cancelBtn.focus();
      } else {
        confirmBtn.focus();
      }
    });
  }

  window.ScoutsSite = {
    escapeHtml,
    openDialog,
    qs,
    qsa,
    Auth,
    DataStore,
    sortAgendaInPlace,
    normalizeNewsItems,
    getPublishedNewsItems,
    getNewsImages,
    setNewsImages,
    NEWS_IMAGES_MAX,
    NEWS_HOME_LIMIT,
    PLANNING_MONTHS,
    getMonthlyPlanning,
    setMonthlyPlanning,
    formatPlanningLabel,
    getMonthlyPlanningTitle,
    setMonthlyPlanningTitle,
    getBranchLetters,
    normalizeBranchLeaderList,
    normalizeBranchLeadership,
    PageRenderer,
  };

  /* ==========================================================
       Bootstrap
       ========================================================== */

  async function init() {
    initMobileMenu();
    refreshStaticImages();
    updateBirthRanges();
    initRegistrationForm();
    initRegistrationChoice();
    initUniformGuide();
    initPageTransitions();
    setupFaqAccordion(document);
    setupRegistrationBankInfo();
    initRevealAnimations();
    setupSecondhandScroll();

    window.addEventListener("hashchange", openNewsFromHash);

    try {
      if (document.body.classList.contains("admin-page")) {
        // Admin UI lives in admin.js
        return;
      }
      if (!document.body.classList.contains("login-page")) {
        await DataStore.load();
        PageRenderer.updatePageFromData();
      }
    } catch (error) {
      console.error("Kon site-gegevens niet laden", error);
    }
  }

  init();
})();
