/**
 * Cookie / statistics consent + gated Microsoft Clarity loader.
 *
 * Clarity loads only after explicit analytics consent (stricter than loading
 * Clarity always and relying on ConsentV2 alone). Documented APIs used:
 * - window.clarity('consentv2', { ad_Storage, analytics_Storage })
 * - window.clarity('consent', false) — erase cookies / stop until new consent
 * @see https://learn.microsoft.com/en-us/clarity/setup-and-installation/clarity-consent-api-v2
 */
(function () {
  "use strict";

  var cfg = window.__SCOUTS_CONSENT__ || {};
  var STORAGE_KEY = typeof cfg.storageKey === "string" && cfg.storageKey
    ? cfg.storageKey
    : "scouts_consent_v1";
  var PROJECT_ID = typeof cfg.clarityProjectId === "string" ? cfg.clarityProjectId : "";
  var CONSENT_VERSION = 1;

  var clarityInjected = false;
  var banner = document.getElementById("scouts-consent-banner");
  var lastFocus = null;

  function readChoice() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return null;
      }
      var data = JSON.parse(raw);
      if (!data || data.v !== CONSENT_VERSION) {
        return null;
      }
      if (data.analytics !== "granted" && data.analytics !== "denied") {
        return null;
      }
      return data;
    } catch (err) {
      return null;
    }
  }

  function writeChoice(analytics) {
    var payload = {
      v: CONSENT_VERSION,
      analytics: analytics,
      updatedAt: new Date().toISOString(),
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch (err) {
      // Private mode / blocked storage — choice still applies for this page load.
    }
    return payload;
  }

  /**
   * Pass ConsentV2 signals when the Clarity stub/API is present.
   * ad_Storage stays denied — this site does not use Clarity for ads.
   */
  function signalClarityConsent(analyticsGranted) {
    if (typeof window.clarity !== "function") {
      return;
    }
    window.clarity("consentv2", {
      ad_Storage: "denied",
      analytics_Storage: analyticsGranted ? "granted" : "denied",
    });
    if (!analyticsGranted) {
      // Documented erase path: clears Clarity cookies and stops tracking until new consent.
      window.clarity("consent", false);
    }
  }

  function loadClarity() {
    if (clarityInjected || !PROJECT_ID) {
      return;
    }
    clarityInjected = true;

    // Official Clarity bootstrap (tag only injected after consent).
    (function (c, l, a, r, i, t, y) {
      c[a] =
        c[a] ||
        function () {
          (c[a].q = c[a].q || []).push(arguments);
        };
      t = l.createElement(r);
      t.async = 1;
      t.src = "https://www.clarity.ms/tag/" + i;
      y = l.getElementsByTagName(r)[0];
      y.parentNode.insertBefore(t, y);
    })(window, document, "clarity", "script", PROJECT_ID);

    signalClarityConsent(true);
  }

  function focusNoScroll(el) {
    if (!el || typeof el.focus !== "function") {
      return;
    }
    try {
      el.focus({ preventScroll: true });
    } catch (err) {
      el.focus();
    }
  }

  function freezeScroll(scrollX, scrollY) {
    if (window.scrollX === scrollX && window.scrollY === scrollY) {
      return;
    }
    // Avoid smooth-scroll animation from html { scroll-behavior: smooth }.
    try {
      window.scrollTo({ left: scrollX, top: scrollY, behavior: "instant" });
    } catch (err) {
      window.scrollTo(scrollX, scrollY);
    }
  }

  function showBanner() {
    if (!banner) {
      return;
    }
    lastFocus = document.activeElement;
    var scrollX = window.scrollX;
    var scrollY = window.scrollY;
    banner.hidden = false;
    // Focusing the dialog must not scroll the page behind the overlay.
    focusNoScroll(
      banner.querySelector("[data-consent-reject]") ||
        banner.querySelector("[data-consent-accept]")
    );
    freezeScroll(scrollX, scrollY);
  }

  function hideBanner() {
    if (!banner) {
      return;
    }
    var scrollX = window.scrollX;
    var scrollY = window.scrollY;
    banner.hidden = true;
    focusNoScroll(lastFocus);
    freezeScroll(scrollX, scrollY);
    lastFocus = null;
  }

  function accept() {
    writeChoice("granted");
    hideBanner();
    loadClarity();
  }

  function reject() {
    writeChoice("denied");
    hideBanner();
    // Never start Clarity on deny; if it was already running, stop via documented APIs.
    if (clarityInjected) {
      signalClarityConsent(false);
    }
  }

  function applyStored() {
    var choice = readChoice();
    if (!choice) {
      showBanner();
      return;
    }
    hideBanner();
    if (choice.analytics === "granted") {
      loadClarity();
    }
    // denied: no Clarity script, no network, no cookies from this loader.
  }

  document.addEventListener("click", function (event) {
    var target = event.target;
    if (!(target instanceof Element)) {
      return;
    }
    if (target.closest("[data-consent-accept]")) {
      event.preventDefault();
      accept();
      return;
    }
    if (target.closest("[data-consent-reject]")) {
      event.preventDefault();
      reject();
      return;
    }
    if (target.closest("[data-consent-open]")) {
      event.preventDefault();
      showBanner();
    }
  });

  document.addEventListener("keydown", function (event) {
    if (event.key !== "Escape") {
      return;
    }
    if (!banner || banner.hidden) {
      return;
    }
    // Escape alone does not set a choice; keep banner until accept/reject.
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", applyStored);
  } else {
    applyStored();
  }

  // Test / debug hooks (no network side effects).
  window.__SCOUTS_CONSENT_API__ = {
    storageKey: STORAGE_KEY,
    readChoice: readChoice,
    accept: accept,
    reject: reject,
    showBanner: showBanner,
    isClarityInjected: function () {
      return clarityInjected;
    },
  };
})();
