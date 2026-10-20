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

  const IMAGE_ASSET_VERSION = "20261020-4";

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
    const label = formatLidgeldLabel(lidgeldText) || "(€\u00a060)";
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

    const setMenuOpen = (isOpen) => {
      mobileMenu.classList.toggle("open", isOpen);
      menuButton.classList.toggle("is-open", isOpen);
      menuButton.setAttribute("aria-expanded", isOpen ? "true" : "false");
      menuButton.setAttribute("aria-label", isOpen ? "Menu sluiten" : "Menu openen");
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
      if (event.key === "Escape") setMenuOpen(false);
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
    const paymentReference = document.getElementById("registrationPaymentReference");
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
      if (paymentReference) paymentReference.textContent = remittance;

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

    registrationForm.addEventListener("submit", (event) => {
      event.preventDefault();
      if (!registrationForm.reportValidity()) return;

      const formData = new FormData(registrationForm);
      const voornaam = String(formData.get("voornaam") || "").trim();
      const achternaam = String(formData.get("achternaam") || "").trim();
      const takSelect = registrationForm.querySelector('select[name="tak"]');
      const takLabel = takSelect?.selectedOptions?.[0]?.textContent?.trim() || "";

      submitToGoogleForm(formData);
      showPaymentStep(voornaam, achternaam, takLabel);

      registrationForm.reset();
      const status = document.getElementById("registrationStatus");
      if (status) status.textContent = "Formulier verzonden. Betaal hieronder om af te ronden.";
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
    data.news.forEach((item) => {
      if (!item || typeof item !== "object") return;
      if (typeof item.summary !== "string") item.summary = "";
      setNewsImages(item, getNewsImages(item));
    });
  }

  function buildNewsCarouselHtml(images, title) {
    if (!images.length) return "";
    const alt = escapeHtml(title || "Nieuwsfoto");
    if (images.length === 1) {
      return `<figure class="news-media"><img src="${escapeHtml(images[0])}" alt="${alt}" loading="lazy" decoding="async"></figure>`;
    }

    const total = images.length;
    const pad = (value) => String(value).padStart(2, "0");
    const slides = images
      .map(
        (src, index) => `
                      <div class="news-carousel-slide${index === 0 ? " is-active" : ""}" data-slide-index="${index}" role="group" aria-roledescription="slide" aria-label="Foto ${index + 1} van ${total}">
                        <img src="${escapeHtml(src)}" alt="${alt} ${index + 1}" loading="${index === 0 ? "eager" : "lazy"}" decoding="async" draggable="false">
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
                      <figure class="news-media news-carousel" data-news-carousel aria-roledescription="carousel" aria-label="Foto's bij ${alt}">
                        <div class="news-carousel-viewport" tabindex="0">
                          <div class="news-carousel-track">
                            ${slides}
                          </div>
                          <div class="news-carousel-overlay">
                            <div class="news-carousel-dots" role="tablist" aria-label="Foto's">
                              ${dots}
                            </div>
                            <p class="news-carousel-status" aria-live="polite">
                              <span data-carousel-current>${pad(1)}</span><span class="news-carousel-status-sep" aria-hidden="true">/</span><span data-carousel-total>${pad(total)}</span>
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
    const pad = (value) => String(value).padStart(2, "0");

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
      if (currentLabel) currentLabel.textContent = pad(index + 1);
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

  function buildNewsItemHtml(item) {
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
    const hasDetails = Boolean(text || images.length || (link && linkText));
    const teaser = summary || (!hasDetails && text ? text : "");
    const detailsHtml = hasDetails
      ? `
                  <div class="news-details">
                    <div class="news-details-inner">
                      ${text ? `<p>${escapeHtml(text)}</p>` : ""}
                      ${
                        link && linkText
                          ? `<a class="news-link" href="${escapeHtml(link)}" target="_blank" rel="noopener noreferrer">${escapeHtml(linkText)} <span class="icon-arrow-external" aria-hidden="true"></span></a>`
                          : ""
                      }
                      ${buildNewsCarouselHtml(images, title)}
                    </div>
                  </div>
                `
      : "";

    const thumb = images[0]
      ? `<span class="news-thumb" aria-hidden="true"><img src="${escapeHtml(images[0])}" alt="" loading="lazy"></span>`
      : "";

    return `
                <details class="news-item${images.length ? " has-news-image" : ""}${hasDetails ? "" : " is-static"}">
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

    if (items.length === 0) {
      secondhandScroll.innerHTML = `
                <div class="secondhand-empty">
                    <h3>Geen items beschikbaar</h3>
                    <p>
                        Neem later zeker nog eens een kijkje!
                    </p>
                </div>
            `;

      buttons.forEach((button) => {
        button.hidden = true;
      });

      if (status) {
        status.hidden = true;
      }

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
    _saveQueue: Promise.resolve(),

    async load({ force = false } = {}) {
      if (this._cache && !force) return this._cache;

      const response = await fetch("/api/site-data", {
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error("Kon gegevens niet laden");
      }

      this._cache = await response.json();
      normalizeNewsItems(this._cache);
      normalizeBranchLeadership(this._cache);
      return this._cache;
    },

    get() {
      if (!this._cache) {
        throw new Error("DataStore.get() called before load()");
      }

      return this._cache;
    },

    async save(data) {
      // Elke save wacht tot de vorige save volledig klaar is.
      this._saveQueue = this._saveQueue.then(async () => {
        const response = await fetch("/api/site-data", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(data),
        });

        if (!response.ok) {
          throw new Error("Kon gegevens niet opslaan");
        }

        this._cache = data;
        return data;
      });

      return this._saveQueue;
    },
  };

  /* ==========================================================
       Admin panel
       ========================================================== */

  let adminHasUnsavedChanges = false;
  const pendingPlanningUploads = new Map();
  const pendingUploadDeletes = [];
  let saveStatusTimer = 0;
  let saveButtonTimer = 0;
  let googleDriveSettings = {
    folderId: "",
    oauthConfigured: false,
    oauthEmail: "",
  };

  function setSaveButtonPhase(phase) {
    const button = document.getElementById("saveChanges");
    if (!button) return;
    button.classList.toggle("is-saving", phase === "saving");
    button.classList.toggle("is-saved", phase === "saved");
    if (phase === "saving") button.setAttribute("aria-busy", "true");
    else button.removeAttribute("aria-busy");
    button.querySelector(".save-button-label-idle")?.toggleAttribute("aria-hidden", phase !== "idle");
    button.querySelector(".save-button-label-saving")?.toggleAttribute("aria-hidden", phase !== "saving");
    button.querySelector(".save-button-label-done")?.toggleAttribute("aria-hidden", phase !== "saved");
  }

  function flashSaveButton() {
    const button = document.getElementById("saveChanges");
    if (!button) return;
    window.clearTimeout(saveButtonTimer);
    setSaveButtonPhase("saved");
    saveButtonTimer = window.setTimeout(() => {
      setSaveButtonPhase("idle");
    }, 1800);
  }

  function showSaveButtonSaving() {
    window.clearTimeout(saveButtonTimer);
    setSaveButtonPhase("saving");
  }

  function clearSaveButton() {
    window.clearTimeout(saveButtonTimer);
    setSaveButtonPhase("idle");
  }

  function setSaveStatus(message, state = "saved") {
    const status = document.getElementById("saveStatus");
    if (!status) return;
    window.clearTimeout(saveStatusTimer);
    const confirmOnButton = state === "saved" && message === "Opgeslagen";
    const savingOnButton = state === "saving" && message === "Opslaan...";
    if (confirmOnButton || savingOnButton) {
      status.textContent = message;
      status.dataset.state = confirmOnButton ? "saved" : "saving";
      status.dataset.buttonConfirm = "true";
      if (confirmOnButton) {
        flashSaveButton();
        saveStatusTimer = window.setTimeout(() => {
          if (status.dataset.buttonConfirm !== "true") return;
          status.textContent = "";
          status.dataset.state = "idle";
          delete status.dataset.buttonConfirm;
        }, 2300);
      } else {
        showSaveButtonSaving();
      }
      return;
    }
    clearSaveButton();
    delete status.dataset.buttonConfirm;
    status.textContent = message;
    status.dataset.state = state;
    if (state === "saved") {
      saveStatusTimer = window.setTimeout(() => {
        if (status.dataset.state !== "saved") return;
        status.textContent = "";
        status.dataset.state = "idle";
      }, 2500);
    }
  }

  function markDirtyState(isDirty, { announce = true } = {}) {
    adminHasUnsavedChanges = isDirty;
    if (!announce) {
      setSaveStatus("", "idle");
      return;
    }
    setSaveStatus(
      isDirty ? "Onopgeslagen wijzigingen" : "Opgeslagen",
      isDirty ? "dirty" : "saved",
    );
  }

  function queueUploadDelete(imagePath) {
    const filename = imagePath
      ?.split("/")
      .pop()
      ?.split("?")[0]
      ?.replace(/\.[^/.]+$/, "");
    if (filename) pendingUploadDeletes.push(filename);
  }

  async function flushUploadDeletes() {
    const filenames = pendingUploadDeletes.splice(0);
    await Promise.all(
      filenames.map(async (filename) => {
        try {
          const response = await fetch(
            `/api/uploads/photo/${encodeURIComponent(filename)}`,
            { method: "DELETE" },
          );
          if (!response.ok) {
            console.warn("Tweedehandsfoto kon niet verwijderd worden.");
          }
        } catch (error) {
          console.warn("Foto verwijderen mislukt:", error);
        }
      }),
    );
  }

  async function persist(data, { quiet = false } = {}) {
    normalizeBranchLeadership(data);
    normalizeNewsItems(data);
    if (!quiet) setSaveStatus("Opslaan...", "saving");
    try {
      await DataStore.save(data);
      await flushUploadDeletes();
      markDirtyState(false, { announce: !quiet });
    } catch (error) {
      console.error(error);
      adminHasUnsavedChanges = true;
      setSaveStatus("Opslaan mislukt — probeer opnieuw", "error");
    }
  }

  const photoEditorConfig = [
    { key: "aboutHero", label: "Foto Over ons" },
    { key: "branches.kapoenen", label: "Foto Kapoenen" },
    { key: "branches.welpen", label: "Foto Welpen" },
    { key: "branches.jongverkenners", label: "Foto Jongverkenners" },
    { key: "branches.verkenners", label: "Foto Verkenners" },
    { key: "branches.jins", label: "Foto Jins" },
  ];

  function getPhotoValue(data, key) {
    return (
      key.split(".").reduce((value, part) => value?.[part], data.photos) || ""
    );
  }

  function setPhotoValue(data, key, value) {
    const parts = key.split(".");
    const last = parts.pop();
    const target = parts.reduce((current, part) => current[part], data.photos);
    target[last] = value;
  }
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

  function formatPlanningLabel(title) {
    const months = String(title || "")
      .split(/[_\s]+/)
      .map((part) => part.trim().toLowerCase())
      .filter((month) => PLANNING_MONTHS.includes(month));
    const label = months.length
      ? months.join(", ")
      : String(title || "")
          .replace(/\.pdf$/i, "")
          .replace(/[-_]+/g, " ")
          .trim();
    if (!label) return "Maandplanning";
    return label.charAt(0).toUpperCase() + label.slice(1);
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

  function renderPlanningEditor(data, branch) {
    const value = getMonthlyPlanning(data, branch);
    const title = value ? getMonthlyPlanningTitle(data, branch) : "";
    const selectedMonths = title
      .split("_")
      .filter((month) => PLANNING_MONTHS.includes(month));
    const selectedMonthsLabel = selectedMonths.length
      ? `Maanden: ${selectedMonths.join(", ")}`
      : "Kies maanden";
    return `
            <section class="admin-card compact-card">
                <div class="admin-card-head">
                    <div><h2>Maandplanning</h2></div>
                </div>
                <div class="document-add-box document-planning-box ${value ? "document-planning-box--active" : ""}">
                    <div class="document-add-fields">
                        <input type="hidden" data-planning-title="${branch}" value="${escapeHtml(title)}">
                        ${
                          value
                            ? `<span class="document-static-title planning-saved-title">${escapeHtml(formatPlanningLabel(title))}</span>`
                            : `<details class="planning-month-dropdown" data-planning-month-dropdown="${branch}">
                          <summary><span data-planning-month-label="${branch}">${selectedMonthsLabel}</span></summary>
                          <div class="planning-month-options">
                            ${PLANNING_MONTHS.map(
                              (month) =>
                                `<label><input type="checkbox" value="${month}" data-planning-month="${branch}" ${selectedMonths.includes(month) ? "checked" : ""}> ${month}</label>`,
                            ).join("")}
                          </div>
                        </details>
                        <label class="document-upload-button">
                          <span data-planning-upload-label>PDF kiezen</span>
                          <input type="file" accept="application/pdf,.pdf" data-planning-upload="${branch}" ${title ? "" : "disabled"}>
                        </label>`
                        }
                        ${value ? `<button type="button" class="document-remove" data-planning-remove="${branch}">Verwijderen</button>` : ""}
                    </div>
                </div>
            </section>
        `;
  }

  async function updateMonthlyPlanning(data, branch, file, title) {
    if (!title) throw new Error("Kies eerst minstens één maand.");
    if (file.type !== "application/pdf")
      throw new Error("Selecteer een PDF-bestand.");
    setSaveStatus("Maandplanning uploaden...", "saving");
    const formData = new FormData();
    formData.append("planning", file);
    formData.append("branch", branch);
    formData.append("title", title);
    const response = await fetch("/api/uploads/planning", {
      method: "POST",
      body: formData,
    });
    let result = {};
    try {
      result = await response.json();
    } catch {
      // Server gaf geen JSON terug.
    }
    if (!response.ok || !result.path)
      throw new Error(result.message || "Maandplanning uploaden mislukt.");
    setMonthlyPlanning(data, branch, result.path);
    setMonthlyPlanningTitle(data, branch, title);
    return result;
  }

  async function removeMonthlyPlanning(data, branch) {
    const planning = getMonthlyPlanning(data, branch);
    const filename = planning.split("/").pop()?.split("?")[0];
    if (filename) {
      const response = await fetch(
        `/api/uploads/document/${encodeURIComponent(filename)}`,
        { method: "DELETE" },
      );
      if (!response.ok) throw new Error("Maandplanning verwijderen mislukt.");
    }
    setMonthlyPlanning(data, branch, "");
    setMonthlyPlanningTitle(data, branch, "");
    await persist(data);
    renderAdminPanel();
    if (!adminHasUnsavedChanges) setSaveStatus("Maandplanning verwijderd", "saved");
  }

  function getBranchLetters(data, branch) {
    return Array.isArray(data.letters?.[branch]) ? data.letters[branch] : [];
  }

  function renderLettersEditor(data, branch) {
    const letters = getBranchLetters(data, branch);
    return `
            <section class="admin-card compact-card">
                <div class="admin-card-head">
                    <div><h2>Brieven</h2></div>
                </div>
                ${
                  letters.length
                    ? letters
                        .map(
                          (letter, index) => `
                    <div class="admin-item document-list-item">
                        <strong class="document-static-title">${escapeHtml(letter.title || `Brief ${index + 1}`)}</strong>
                        <button type="button" class="document-remove" data-letter-remove="${branch}" data-index="${index}">Verwijderen</button>
                    </div>
                `,
                        )
                        .join("")
                    : ""
                }
                <div class="document-add-box">
                    <div class="document-add-fields">
                        <label class="document-title-field">
                            <input class="document-title-input" type="text" data-letter-title-new="${branch}" placeholder="Naam van de brief" autocomplete="off">
                        </label>
                        <label class="document-upload-button">PDF kiezen
                        <input type="file" accept="application/pdf,.pdf" data-letter-upload="${branch}" disabled>
                        </label>
                    </div>
                </div>
            </section>
        `;
  }

  async function addLetter(data, branch, file) {
    const titleInput = qs(`[data-letter-title-new="${branch}"]`);
    const title = titleInput?.value.trim() || "";
    if (!title) throw new Error("Geef eerst een naam aan de brief.");
    if (file.type !== "application/pdf")
      throw new Error("Selecteer een PDF-bestand.");
    setSaveStatus("Brief uploaden...", "saving");
    const formData = new FormData();
    formData.append("letter", file);
    formData.append("branch", branch);
    const response = await fetch("/api/uploads/letter", {
      method: "POST",
      body: formData,
    });
    let result = {};
    try {
      result = await response.json();
    } catch {
      // Server gaf geen JSON terug.
    }
    if (!response.ok || !result.path)
      throw new Error(result.message || "Brief uploaden mislukt.");
    if (!Array.isArray(data.letters?.[branch])) {
      if (!data.letters) data.letters = {};
      data.letters[branch] = [];
    }
    data.letters[branch].push({ title, path: result.path });
    await persist(data);
    renderAdminPanel();
    if (!adminHasUnsavedChanges) setSaveStatus("Brief opgeslagen", "saved");
  }

  async function removeLetter(data, branch, index) {
    const letter = getBranchLetters(data, branch)[index];
    if (!letter) return;
    const filename = letter.path.split("/").pop()?.split("?")[0];
    if (filename) {
      const response = await fetch(
        `/api/uploads/document/${encodeURIComponent(filename)}`,
        { method: "DELETE" },
      );
      if (!response.ok) throw new Error("Brief verwijderen mislukt.");
    }
    data.letters[branch].splice(index, 1);
    await persist(data);
    renderAdminPanel();
    if (!adminHasUnsavedChanges) setSaveStatus("Brief verwijderd", "saved");
  }

  const PHOTO_FILENAMES = {
    aboutHero: "over-ons",
    "branches.kapoenen": "kapoenenleiding",
    "branches.welpen": "welpenleiding",
    "branches.jongverkenners": "jongverkennersleiding",
    "branches.verkenners": "verkennersleiding",
    "branches.jins": "jinsleiding",
  };

  const CLIENT_MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
  const PHOTO_UPLOAD_MAX_EDGE = 2400;
  const PHOTO_UPLOAD_JPEG_QUALITY = 0.9;

  function assertUploadSize(file, label = "bestand") {
    if (!file) return;
    if (file.size > CLIENT_MAX_UPLOAD_BYTES) {
      const mb = (file.size / (1024 * 1024)).toFixed(1).replace(".", ",");
      throw new Error(
        `Dit ${label} is ${mb} MB en daarmee te groot. Maximum is 20 MB.`,
      );
    }
  }

  /** Resize/compress uploads to max 2400px JPEG @ 0.9 before sending. */
  async function optimizeImageForUpload(file) {
    if (!file || !file.type.startsWith("image/")) return file;

    let bitmap;
    try {
      bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      try {
        bitmap = await createImageBitmap(file);
      } catch {
        return file;
      }
    }

    try {
      const longest = Math.max(bitmap.width, bitmap.height);
      const scale =
        longest > PHOTO_UPLOAD_MAX_EDGE ? PHOTO_UPLOAD_MAX_EDGE / longest : 1;
      const width = Math.max(1, Math.round(bitmap.width * scale));
      const height = Math.max(1, Math.round(bitmap.height * scale));

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d", { alpha: false });
      if (!ctx) return file;

      ctx.fillStyle = "#f5efe7";
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(bitmap, 0, 0, width, height);

      const blob = await new Promise((resolve) => {
        canvas.toBlob(resolve, "image/jpeg", PHOTO_UPLOAD_JPEG_QUALITY);
      });
      if (!blob || blob.size < 1) return file;

      const baseName = String(file.name || "foto").replace(/\.[^.]+$/, "");
      return new File([blob], `${baseName}.jpg`, {
        type: "image/jpeg",
        lastModified: Date.now(),
      });
    } finally {
      if (typeof bitmap.close === "function") bitmap.close();
    }
  }

  async function updatePhoto(data, key, file) {
    if (!file) {
      throw new Error("Geen foto geselecteerd.");
    }

    if (!file.type.startsWith("image/")) {
      throw new Error("Selecteer een afbeeldingsbestand.");
    }

    assertUploadSize(file, "foto");
    const optimized = await optimizeImageForUpload(file);

    const filename = PHOTO_FILENAMES[key];

    if (!filename) {
      throw new Error(`Geen bestandsnaam ingesteld voor ${key}.`);
    }

    const formData = new FormData();

    formData.append("photo", optimized);
    formData.append("filename", filename);

    const response = await fetch("/api/uploads/photo", {
      method: "POST",
      body: formData,
    });

    let result = {};

    try {
      result = await response.json();
    } catch {
      // Server gaf geen JSON terug.
    }

    if (!response.ok) {
      throw new Error(result.message || "Foto uploaden mislukt.");
    }

    if (!result.path) {
      throw new Error("Server gaf geen fotopad terug.");
    }

    setPhotoValue(data, key, result.path);

    await persist(data);

    renderAdminPanel();
  }

  const pageFieldConfig = {
    "over-ons": [{ key: "intro", label: "Introductietekst", type: "textarea" }],
    inschrijven: [
      { key: "lidgeld", label: "Lidgeld", type: "number" },
      { key: "rekeningnummer", label: "Rekeningnummer", type: "text" },
    ],
  };

  // Flat list editors (agenda / faq / secondhand).
  // row: shared line with previous fields; default: fallback when blank.
  const listEditorConfig = {
    agenda: {
      itemLabel: "Event",
      newItem: {
        day: "1",
        month: "SEP",
        title: "Nieuwe activiteit",
        text: "Beschrijving...",
        link: "",
        linkText: "",
        image: "",
      },
      fields: [
        {
          key: "day",
          label: "Dag",
          tag: "input",
          type: "number",
          row: true,
          default: "1",
          min: 1,
          max: 31,
          inputmode: "numeric",
        },
        {
          key: "month",
          label: "Maand",
          tag: "select",
          row: true,
          default: "SEP",
          options: [
            "SEP",
            "OKT",
            "NOV",
            "DEC",
            "JAN",
            "FEB",
            "MAA",
            "APR",
            "MEI",
            "JUN",
            "JUL",
            "AUG",
          ],
        },
        {
          key: "title",
          label: "Titel",
          tag: "input",
          type: "text",
          default: "Nieuwe activiteit",
        },
        {
          key: "text",
          label: "Tekst",
          tag: "textarea",
          default: "Beschrijving...",
        },
        {
          key: "linkText",
          label: "Linktekst",
          tag: "input",
          type: "text",
          default: "",
          placeholder: "Tekst van de link",
        },
        {
          key: "link",
          label: "Link",
          tag: "input",
          type: "url",
          default: "",
          placeholder: "https://...",
        },
        {
          key: "image",
          label: "Foto",
          tag: "file",
          type: "file",
          accept: "image/jpeg,image/png,image/webp,image/gif",
        },
      ],
    },
    faq: {
      itemLabel: "Vraag",
      newItem: { question: "Nieuwe vraag", answer: "Antwoord..." },
      fields: [
        {
          key: "question",
          label: "Vraag",
          tag: "input",
          type: "text",
          default: "Nieuwe vraag",
        },
        {
          key: "answer",
          label: "Antwoord",
          tag: "textarea",
          default: "Antwoord...",
        },
      ],
    },
    news: {
      itemLabel: "Nieuws",
      newItem: {
        title: "Nieuw bericht",
        date: "",
        summary: "",
        text: "",
        image: "",
        images: [],
        link: "",
        linkText: "",
      },
      fields: [
        {
          key: "title",
          label: "Titel",
          tag: "input",
          type: "text",
          default: "Nieuw bericht",
        },
        {
          key: "date",
          label: "Datum of periode",
          tag: "input",
          type: "text",
          default: "",
          placeholder: "Bijvoorbeeld Maart 2026",
        },
        {
          key: "summary",
          label: "Korte intro",
          tag: "textarea",
          default: "",
          placeholder: "Korte tekst die zichtbaar is voor het uitklappen",
        },
        {
          key: "text",
          label: "Volledige tekst",
          tag: "textarea",
          default: "",
          placeholder: "De rest van het bericht...",
        },
        {
          key: "linkText",
          label: "Linktekst",
          tag: "input",
          type: "text",
          default: "",
          placeholder: "Tekst van de link",
        },
        {
          key: "link",
          label: "Link",
          tag: "input",
          type: "url",
          default: "",
          placeholder: "https://...",
        },
      ],
    },
    secondhand: {
      itemLabel: "Item",

      newItem: {
        category: "UNIFORM",
        title: "Nieuw item",
        size: "",
        price: "",
        image: "",
      },

      fields: [
        {
          key: "category",
          label: "Categorie",
          tag: "select",
          options: ["HEMD", "KAPOENENTRUI", "SJAALTJE"],
          default: "UNIFORM",
        },
        {
          key: "size",
          label: "Maat",
          tag: "input",
          type: "text",
          default: "",
        },
        {
          key: "price",
          label: "Prijs",
          tag: "input",
          type: "number",
          default: "",
        },
      ],
    },
  };

  function renderNewsEditor(items) {
    const container = document.getElementById("newsEditor");
    if (!container) return;

    if (!items.length) {
      container.innerHTML =
        `<p class="admin-news-empty">Nog geen nieuwsberichten. Klik op + Nieuws om te beginnen.</p>`;
      return;
    }

    container.innerHTML = items
      .map((item, index) => {
        const images = getNewsImages(item);
        const isHome = index < NEWS_HOME_LIMIT;
        const title = item.title || `Nieuws ${index + 1}`;
        const thumbs = images
          .map(
            (src, imageIndex) => `
                      <div class="admin-news-photo-item">
                        <span class="admin-news-photo-order" aria-hidden="true">${imageIndex + 1}</span>
                        <div class="admin-news-photo-thumb">
                          <img src="${escapeHtml(src)}" alt="${escapeHtml(title)} foto ${imageIndex + 1}" loading="lazy">
                        </div>
                        <div class="admin-news-photo-controls">
                          <button type="button" class="admin-news-photo-move" data-news-image-move data-index="${index}" data-image-index="${imageIndex}" data-direction="-1" ${imageIndex === 0 ? "disabled" : ""} aria-label="Foto ${imageIndex + 1} eerder zetten">
                            <span class="icon-arrow-up" aria-hidden="true"></span>
                            <span class="admin-news-photo-move-label">Eerder</span>
                          </button>
                          <button type="button" class="admin-news-photo-move" data-news-image-move data-index="${index}" data-image-index="${imageIndex}" data-direction="1" ${imageIndex === images.length - 1 ? "disabled" : ""} aria-label="Foto ${imageIndex + 1} later zetten">
                            <span class="icon-arrow-down" aria-hidden="true"></span>
                            <span class="admin-news-photo-move-label">Later</span>
                          </button>
                          <button type="button" class="admin-news-photo-remove" data-news-image-remove data-index="${index}" data-image-index="${imageIndex}" aria-label="Foto ${imageIndex + 1} verwijderen">
                            <span aria-hidden="true">×</span>
                            <span class="admin-news-photo-move-label">Weg</span>
                          </button>
                        </div>
                      </div>`,
          )
          .join("");
        const addPhotoHtml =
          images.length >= NEWS_IMAGES_MAX
            ? `<p class="admin-news-photos-limit">Maximum van ${NEWS_IMAGES_MAX} foto's bereikt.</p>`
            : `<label class="admin-news-photo-add">
                        <span class="admin-news-photo-plus" aria-hidden="true">＋</span>
                        <strong>Foto's toevoegen</strong>
                        <small>Max. ${NEWS_IMAGES_MAX} · JPG, PNG of WebP</small>
                        <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple data-news-image-upload data-index="${index}">
                      </label>`;
        return `
          <article class="admin-item admin-collapsible-item admin-news-item is-collapsed${isHome ? " is-home-news" : ""}">
            <div class="admin-item-head">
              <button type="button" class="admin-collapse-toggle" data-collapse-toggle aria-expanded="false">
                <span class="admin-collapse-chevron" aria-hidden="true"></span>
                <span class="admin-news-summary">
                  <strong>${escapeHtml(title)}</strong>
                  <span class="admin-news-summary-date"${item.date ? "" : " hidden"}>${escapeHtml(item.date || "")}</span>
                </span>
              </button>
              <div class="admin-item-actions">
                <div class="admin-reorder-controls" title="Volgorde van dit nieuwsbericht">
                  <button type="button" class="admin-reorder" data-move="news" data-index="${index}" data-direction="-1" ${index === 0 ? "disabled" : ""} aria-label="Bericht omhoog"><span class="icon-arrow-up" aria-hidden="true"></span></button>
                  <button type="button" class="admin-reorder" data-move="news" data-index="${index}" data-direction="1" ${index === items.length - 1 ? "disabled" : ""} aria-label="Bericht omlaag"><span class="icon-arrow-down" aria-hidden="true"></span></button>
                </div>
                <button type="button" data-remove="news" data-index="${index}">
                  <span class="admin-action-full">Verwijderen</span>
                  <span class="admin-action-short">Weg</span>
                </button>
              </div>
            </div>
            <div class="admin-collapsible-content">
              <div class="admin-collapsible-content-inner">
                <div class="admin-news-editor">
                  <div class="admin-news-photos">
                    <div class="admin-news-photos-head">
                      <span>Foto's</span>
                    </div>
                    <div class="admin-news-photo-list">
                      ${thumbs}
                      ${addPhotoHtml}
                    </div>
                  </div>
                  <div class="admin-news-fields">
                    <div class="admin-news-field-row">
                      <label>
                        <span>Titel</span>
                        <input type="text" data-field="news-title" data-index="${index}" value="${escapeHtml(item.title || "")}" placeholder="Titel van het bericht">
                      </label>
                      <label>
                        <span>Datum of periode</span>
                        <input type="text" data-field="news-date" data-index="${index}" value="${escapeHtml(item.date || "")}" placeholder="Bijvoorbeeld Maart 2026">
                      </label>
                    </div>
                    <label>
                      <span>Korte intro</span>
                      <textarea data-field="news-summary" data-index="${index}" rows="2" placeholder="Zichtbaar vóór het uitklappen">${escapeHtml(item.summary || "")}</textarea>
                    </label>
                    <label>
                      <span>Volledige tekst</span>
                      <textarea data-field="news-text" data-index="${index}" rows="4" placeholder="De rest van het bericht...">${escapeHtml(item.text || "")}</textarea>
                    </label>
                    <div class="admin-news-field-row">
                      <label>
                        <span>Linktekst</span>
                        <input type="text" data-field="news-linkText" data-index="${index}" value="${escapeHtml(item.linkText || "")}" placeholder="Tekst van de link">
                      </label>
                      <label>
                        <span>Link</span>
                        <input type="url" data-field="news-link" data-index="${index}" value="${escapeHtml(item.link || "")}" placeholder="https://...">
                      </label>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </article>
        `;
      })
      .join("");
  }

  function renderListEditor(containerId, items, type) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const { itemLabel, fields } = listEditorConfig[type];

    if (type === "secondhand") {
      container.innerHTML = items
        .map((item, index) => {
          const image = item.image || "";

          return `
                        <article class="admin-secondhand-item">

                            <div class="admin-secondhand-photo">

                                ${
                                  image
                                    ? `
                                            <img
                                                src="${escapeHtml(image)}"
                                                alt="${escapeHtml(item.title || "Tweedehands item")}"
                                            >

                                            <label class="admin-secondhand-photo-change">
                                                <span>↻</span>
                                                Foto wijzigen
                                                <input
                                                    type="file"
                                                    accept="image/jpeg,image/png,image/webp,image/gif"
                                                    data-secondhand-upload="${index}"
                                                >
                                            </label>
                                        `
                                    : `
                                            <label class="admin-secondhand-photo-empty">
                                                <span class="admin-secondhand-photo-plus">＋</span>
                                                <strong>Foto toevoegen</strong>
                                                <small>Klik om een foto te kiezen</small>

                                                <input
                                                    type="file"
                                                    accept="image/jpeg,image/png,image/webp,image/gif"
                                                    data-secondhand-upload="${index}"
                                                >
                                            </label>
                                        `
                                }

                            </div>

                            <div class="admin-secondhand-content">

                                <div class="admin-item-head">
                                    <strong>${itemLabel} ${index + 1}</strong>

                                    <button
                                        type="button"
                                      class="admin-secondhand-remove"
                                        data-remove="${type}"
                                        data-index="${index}"
                                    >
                                        Verwijderen
                                    </button>
                                </div>

                                <div class="admin-secondhand-fields">

                                    <label>
                                        Categorie
                                        <select
                                            data-field="secondhand-category"
                                            data-index="${index}"
                                        >
                                            ${fields
                                              .find(
                                                (field) =>
                                                  field.key === "category",
                                              )
                                              .options.map(
                                                (option) => `
                                                        <option
                                                            value="${escapeHtml(option)}"
                                                            ${item.category === option ? "selected" : ""}
                                                        >
                                                            ${escapeHtml(option)}
                                                        </option>
                                                    `,
                                              )
                                              .join("")}
                                        </select>
                                    </label>

                                    <div class="admin-secondhand-row">

                                        <label>
                                            Maat
                                            <input
                                                type="text"
                                                data-field="secondhand-size"
                                                data-index="${index}"
                                                value="${escapeHtml(item.size || item.info || "")}"
                                                placeholder="bv. 152 / M / 38"
                                            >
                                        </label>

                                        <label>
                                            Prijs
                                            <div class="admin-price-input">
                                                <span>€</span>
                                                <input
                                                    type="number"
                                                    min="0"
                                                    step="0.01"
                                                    inputmode="decimal"
                                                    data-field="secondhand-price"
                                                    data-index="${index}"
                                                    value="${escapeHtml(
                                                      String(
                                                        item.price || "",
                                                      ).replace(/^€\s*/, ""),
                                                    )}"
                                                    placeholder="10"
                                                >
                                            </div>
                                        </label>

                                    </div>

                                </div>

                            </div>

                        </article>
                    `;
        })
        .join("");

      return;
    }

    const rowFields = fields.filter((f) => f.row);
    const restFields = fields.filter((f) => !f.row);

    const fieldHtml = (field, item, index) => {
      const value = escapeHtml(item[field.key] ?? "");
      const attrs = `data-field="${type}-${field.key}" data-index="${index}"`;

      if (field.tag === "file") {
        return `
                    <div class="admin-agenda-photo-field">
                        ${field.label}
                        ${
                          item.image
                            ? `<img src="${escapeHtml(item.image)}" alt="Foto van ${escapeHtml(item.title || item.question || "item")}" loading="lazy">
                               <span class="admin-agenda-photo-actions">
                                 <span class="admin-agenda-photo-change">Nieuwe foto kiezen<input type="file" accept="${field.accept}" data-list-image-upload="${type}" data-index="${index}"></span>
                                 <button type="button" class="admin-agenda-photo-remove" data-list-image-remove="${type}" data-index="${index}">Foto verwijderen</button>
                               </span>`
                            : `<span class="admin-agenda-photo-change">Foto toevoegen<input type="file" accept="${field.accept}" data-list-image-upload="${type}" data-index="${index}"></span>`
                        }
                    </div>
                `;
      }

      if (field.tag === "textarea") {
        return `
                    <label>
                        ${field.label}
                        <textarea ${attrs}>${value}</textarea>
                    </label>
                `;
      }

      if (field.tag === "select") {
        return `
                    <label>
                        ${field.label}
                        <select ${attrs}>
                            ${field.options
                              .map(
                                (option) => `
                                        <option value="${escapeHtml(option)}" ${item[field.key] === option ? "selected" : ""}>
                                            ${escapeHtml(option)}
                                        </option>
                                    `,
                              )
                              .join("")}
                        </select>
                    </label>
                `;
      }

      return `
                <label>
                    ${field.label}
                    <input
                        type="${field.type}"
                        ${attrs}
                        ${field.min !== undefined ? `min="${field.min}"` : ""}
                        ${field.max !== undefined ? `max="${field.max}"` : ""}
                        ${field.inputmode ? `inputmode="${field.inputmode}"` : ""}
                        ${field.placeholder ? `placeholder="${field.placeholder}"` : ""}
                        value="${value}"
                    >
                </label>
            `;
    };

    container.innerHTML = items
      .map((item, index) => {
        const rowHtml = rowFields.length
          ? `
                        <div
                            class="admin-item-row"
                            style="display:grid; grid-template-columns:1fr 1fr; gap:12px;"
                        >
                            ${rowFields
                              .map((f) => fieldHtml(f, item, index))
                              .join("")}
                        </div>
                    `
          : "";

        const restHtml = restFields
          .map((f) => fieldHtml(f, item, index))
          .join("");

        return `
                    <div class="admin-item admin-collapsible-item is-collapsed">

                        <div class="admin-item-head">
                            <button type="button" class="admin-collapse-toggle" data-collapse-toggle aria-expanded="false">
                                <span class="admin-collapse-chevron" aria-hidden="true"></span>
                                <strong>${escapeHtml(
                                  type === "agenda"
                                    ? `${item.day || ""} ${item.month || ""} · ${item.title || `Event ${index + 1}`}`
                                    : item.question || `Vraag ${index + 1}`,
                                )}</strong>
                            </button>

                            <div class="admin-item-actions">
                              <button
                                  type="button"
                                  data-remove="${type}"
                                  data-index="${index}"
                              >
                                  <span class="admin-action-full">Verwijderen</span>
                                  <span class="admin-action-short">Weg</span>
                              </button>
                            </div>
                        </div>

                        <div class="admin-collapsible-content">
                          <div class="admin-collapsible-content-inner">
                            ${rowHtml}
                            ${restHtml}
                          </div>
                        </div>

                    </div>
                `;
      })
      .join("");
  }

  function toggleAdminCollapsible(item) {
    const toggle = item?.querySelector("[data-collapse-toggle]");
    if (!item || !toggle) return;

    const isOpening = item.classList.toggle("is-collapsed");
    toggle.setAttribute("aria-expanded", String(!isOpening));
  }

  function readListFields(items, type) {
    const { fields } = listEditorConfig[type];

    fields.forEach((field) => {
      if (field.tag === "file") return;

      qsa(`[data-field='${type}-${field.key}']`).forEach((input) => {
        const index = Number(input.dataset.index);

        if (!items[index]) return;

        let value = input.value.trim() || field.default;
        if (type === "agenda" && field.key === "day" && value !== "") {
          value = String(Math.min(31, Math.max(1, Number(value) || 1)));
        }
        items[index][field.key] = value;
      });
    });

    // Oude "info"-velden eventueel omzetten naar "size".
    if (type === "secondhand") {
      items.forEach((item) => {
        if (!item.size && item.info) {
          item.size = item.info;
        }

        delete item.info;
      });
    }
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

  function renderLeadershipList(
    container,
    items,
    includeEmail = false,
    email = "",
  ) {
    if (!container) return;
    container.replaceChildren();

    const appendItem = (label, value) => {
      const item = document.createElement("li");
      const strong = document.createElement("strong");
      const phone = document.createElement("span");
      strong.textContent = label;
      phone.className = "phone-number";
      phone.textContent = value ?? "";
      item.append(strong, document.createTextNode(" "), phone);
      container.append(item);
    };

    if (includeEmail) appendItem("Email", email);
    items.forEach((item) => appendItem(leadershipPublicName(item), item.phone));
  }

  function renderLeadershipEditor(items, containerId, type) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const isBranchLeadership = type.startsWith("branchLeadership:");
    if (isBranchLeadership) normalizeBranchLeaderList(items);

    container.classList.add("admin-leadership-list");
    container.classList.toggle(
      "admin-group-leadership-list",
      type === "groupLeadership",
    );
    container.innerHTML = items
      .map((item, index) => {
        const takleiderField = isBranchLeadership
          ? `<label class="leadership-takleider"><input type="checkbox" data-field="leadership-takleider" data-type="${type}" data-index="${index}"${item.takleider ? " checked" : ""}><span>Takleider</span></label>`
          : "";

        return `
                <article class="admin-item leadership-card">
                    <div class="leadership-card-head">
                        ${takleiderField}
                        <button type="button" class="leadership-remove" data-remove="${type}" data-index="${index}">Verwijderen</button>
                    </div>
                    <div class="leadership-fields">
                        <label><span>Naam</span><input type="text" data-field="leadership-name" data-type="${type}" data-index="${index}" value="${escapeHtml(item.name)}" placeholder="Naam van de leider"></label>
                        <label><span>Telefoonnummer</span><input type="tel" data-field="leadership-phone" data-type="${type}" data-index="${index}" value="${escapeHtml(item.phone)}" placeholder="Telefoonnummer"></label>
                    </div>
                </article>
            `;
      })
      .join("");
  }

  function renderPhotoEditor(data) {
    const container = document.getElementById("photoEditor");
    if (!container) return;

    container.innerHTML = photoEditorConfig
      .map(({ key, label }) => {
        const value = getPhotoValue(data, key);
        const hasPhoto = Boolean(value);

        return `
                    <article class="admin-photo-card ${hasPhoto ? "has-photo" : "no-photo"}">

                        <div class="admin-photo-card-preview">
                            ${
                              hasPhoto
                                ? `
                                        <img
                                            src="${escapeHtml(value)}"
                                            alt="${escapeHtml(label)}"
                                            loading="lazy"
                                        >

                                        <div class="admin-photo-overlay">
                                            <label class="admin-photo-change">
                                                <span class="admin-photo-change-icon">↻</span>
                                                <span>Nieuwe foto kiezen</span>
                                                <input
                                                    type="file"
                                                    accept="image/jpeg,image/png,image/webp,image/gif"
                                                    data-photo-upload="${key}"
                                                >
                                            </label>
                                        </div>
                                    `
                                : `
                                        <label class="admin-photo-empty">
                                            <div class="admin-photo-empty-icon">＋</div>
                                            <strong>Geen foto</strong>

                                            <input
                                                type="file"
                                                accept="image/jpeg,image/png,image/webp,image/gif"
                                                data-photo-upload="${key}"
                                            >
                                        </label>
                                    `
                            }
                        </div>

                        <div class="admin-photo-card-content">

                            <div class="admin-photo-card-heading">
                                <div>
                                    <h3>${escapeHtml(label)}</h3>
                                </div>

                                ${
                                  hasPhoto
                                    ? `
                                            <button
                                                type="button"
                                                class="admin-photo-delete"
                                                data-photo-remove="${key}"
                                                title="Foto verwijderen"
                                            >
                                                ×
                                            </button>
                                        `
                                    : ""
                                }
                            </div>
                        </div>
                    </article>
                `;
      })
      .join("");
  }

  function renderPageSpecificEditors(data) {
    const container = document.getElementById("pageEditor");
    if (!container) return;

    const activePage = data.activePage || "home";

    if (activePage === "settings") {
      container.innerHTML = `
          <section class="admin-card compact-card">
            <div class="admin-card-head"><h2>Google Drive</h2></div>
            <div class="admin-fields">
              <label>
                ID van de leidingsmap
                <input type="text" data-drive-setting="folderId" value="${escapeHtml(googleDriveSettings.folderId)}" placeholder="Bijvoorbeeld 1AbC..." autocomplete="off">
              </label>
              <label>
                Google OAuth-client JSON
                <input type="file" data-drive-oauth-client accept="application/json,.json">
              </label>
            </div>
            <p class="form-help">OAuth: ${googleDriveSettings.oauthConfigured ? "verbonden" : "nog niet verbonden"}</p>
            <div class="admin-actions">
              <button type="button" class="button button-secondary" data-google-connect>${googleDriveSettings.oauthConfigured ? "Google-account opnieuw verbinden" : "Google-account verbinden"}</button>
              <button type="button" class="button button-ghost-dark" data-google-oauth-reset>OAuth-client resetten</button>
            </div>
          </section>
        `;
      return;
    }

    if (activePage === "news") {
      if (!Array.isArray(data.news)) data.news = [];
      container.innerHTML = `
                <section class="admin-card compact-card admin-news-card">
                    <div class="admin-card-head"><h2>Nieuws</h2><button type="button" class="mini-button" data-add="news">+ Nieuws</button></div>
                    <p class="form-help">De eerste 3 berichten (oranje balk) staan op de homepage. Verplaats met de pijltjes. Extra berichten staan op /nieuws.</p>
                    <div id="newsEditor" class="admin-list admin-news-list"></div>
                </section>
            `;
      renderNewsEditor(data.news);
      return;
    }

    if (activePage === "home") {
      container.innerHTML = `
                <section class="admin-card compact-card">
                    <div class="admin-card-head"><h2>Planning</h2><button type="button" class="mini-button" data-add="agenda">+ Event</button></div>
                    <div id="agendaEditor" class="admin-list"></div>
                </section>
                <section class="admin-card compact-card">
                    <div class="admin-card-head"><h2>Praktische vragen</h2><button type="button" class="mini-button" data-add="faq">+ Vraag</button></div>
                    <div id="faqEditor" class="admin-list"></div>
                </section>
                <section class="admin-card compact-card">
                    <div class="admin-card-head">
                        <h2>Contactgegevens</h2>
                    </div>

                    <div class="admin-fields">
                        <label>
                            E-mailadres
                            <input
                                type="email"
                                data-contact-field="email"
                                value="${escapeHtml(data.contact?.email || "")}"
                            >
                        </label>

                        <label>
                            Adres
                            <input
                                type="text"
                                data-contact-field="address"
                                value="${escapeHtml(data.contact?.address || "")}"
                            >
                        </label>
                    </div>
                </section>
            `;
      renderListEditor("agendaEditor", data.agenda, "agenda");
      renderListEditor("faqEditor", data.faq, "faq");
      return;
    }

    if (activePage === "photos") {
      container.innerHTML = `
                <section class="admin-card compact-card admin-photos-card">
                    <div class="admin-card-head"><h2>Foto's beheren</h2></div>
                    <div id="photoEditor" class="admin-photo-grid"></div>
                </section>
            `;
      renderPhotoEditor(data);
      return;
    }

    if (activePage === "inschrijven") {
      const fields = pageFieldConfig[activePage] || [];

      container.innerHTML = `
                <section class="admin-card compact-card">
                    <div class="admin-card-head">
                        <h2>Inschrijven</h2>
                    </div>

                    <div class="admin-fields">
                        ${fields
                          .map((field) => {
                            const value =
                              data.pageContent?.[activePage]?.[field.key] ?? "";

                            return `
                                    <label>
                                        ${field.label}
                                        <input
                                            type="${field.type}"
                                            data-page-field="${field.key}"
                                            value="${escapeHtml(value)}"
                                        >
                                    </label>
                                `;
                          })
                          .join("")}
                    </div>
                </section>
            `;

      return;
    }

    if (activePage === "secondhand") {
      container.innerHTML = `
                <section class="admin-card compact-card">
                    <div class="admin-card-head"><h2>Tweedehandsitems</h2><button type="button" class="mini-button" data-add="secondhand">+ Item</button></div>
                    <div id="secondhandEditor" class="admin-list"></div>
                </section>
            `;
      renderListEditor("secondhandEditor", data.secondhand, "secondhand");
      return;
    }

    if (activePage in data.branchLeadership) {
      container.innerHTML = `
                <section class="admin-card compact-card">
                    <div class="admin-card-head"><h2>Leiding ${activePage}</h2><button type="button" class="mini-button" data-add="branchLeadership:${activePage}">+ Leider</button></div>
                    <div id="branchLeadershipEditor" class="admin-list"></div>
                </section>
                ${renderPlanningEditor(data, activePage)}
                ${renderLettersEditor(data, activePage)}
            `;
      renderLeadershipEditor(
        data.branchLeadership[activePage],
        "branchLeadershipEditor",
        `branchLeadership:${activePage}`,
      );
      return;
    }

    if (activePage === "over-ons") {
      const fields = pageFieldConfig[activePage] || [];

      container.innerHTML = `
                <section class="admin-card compact-card">
                    <div class="admin-card-head">
                        <h2>Over ons</h2>
                    </div>

                    <div class="admin-fields">
                        ${fields
                          .map((field) => {
                            const value =
                              data.pageContent[activePage]?.[field.key] || "";

                            return field.type === "textarea"
                              ? `
                                        <label>
                                            ${field.label}
                                            <textarea data-page-field="${field.key}">${escapeHtml(value)}</textarea>
                                        </label>
                                    `
                              : `
                                        <label>
                                            ${field.label}
                                            <input
                                                type="${field.type}"
                                                data-page-field="${field.key}"
                                                value="${escapeHtml(value)}"
                                            >
                                        </label>
                                    `;
                          })
                          .join("")}
                    </div>
                </section>

                <section class="admin-card compact-card">
                    <div class="admin-card-head">
                        <h2>Groepsleiding</h2>
                        <button
                            type="button"
                            class="mini-button"
                            data-add="groupLeadership"
                        >
                            + Groepsleider
                        </button>
                    </div>

                    <div id="groupLeadershipEditor" class="admin-list"></div>
                </section>
            `;

      renderLeadershipEditor(
        data.groupLeadership || [],
        "groupLeadershipEditor",
        "groupLeadership",
      );

      return;
    }

    const fields = pageFieldConfig[activePage] || [];
    container.innerHTML = `
            <section class="admin-card compact-card">
                <div class="admin-card-head"><h2>Pagina</h2></div>
                <div class="admin-fields">
                    ${fields
                      .map((field) => {
                        const value =
                          data.pageContent[activePage]?.[field.key] || "";
                        return field.type === "textarea"
                          ? `<label>${field.label}<textarea data-page-field="${field.key}">${escapeHtml(value)}</textarea></label>`
                          : `<label>${field.label}<input type="${field.type}" data-page-field="${field.key}" value="${escapeHtml(value)}"></label>`;
                      })
                      .join("")}
                </div>
            </section>
        `;
  }

  const publicPagePaths = {
    home: "/",
    news: "/nieuws",
    "over-ons": "/over-ons",
    inschrijven: "/inschrijven",
    kapoenen: "/kapoenen",
    welpen: "/welpen",
    jongverkenners: "/jongverkenners",
    verkenners: "/verkenners",
    jins: "/jins",
    secondhand: "/tweedehands",
  };

  function renderAdminPanel() {
    const data = DataStore.get();
    const activePage = data.activePage || "home";

    qsa("[data-page-option]").forEach((button) => {
      const isActive = button.dataset.pageOption === activePage;
      button.classList.toggle("is-active", isActive);
      if (button.getAttribute("role") === "radio") {
        button.setAttribute("aria-checked", String(isActive));
      } else {
        button.setAttribute("aria-pressed", String(isActive));
      }
    });

    const viewLink = document.getElementById("viewLivePage");
    const livePath = publicPagePaths[activePage];
    if (viewLink) {
      if (livePath) {
        viewLink.href = livePath;
        viewLink.hidden = false;
      } else {
        viewLink.hidden = true;
      }
    }

    renderPageSpecificEditors(data);
  }

  async function addEntry(type) {
    const data = DataStore.get();

    readFormValues();

    if (type in listEditorConfig) {
      const newItem = structuredClone(listEditorConfig[type].newItem);
      if (type === "news") data.news.unshift(newItem);
      else data[type].push(newItem);
      if (type === "agenda") sortAgendaInPlace(data.agenda);
    } else if (type === "groupLeadership") {
      if (!data.groupLeadership) {
        data.groupLeadership = [];
      }

      data.groupLeadership.push({
        name: "",
        phone: "",
      });
    } else if (type.startsWith("branchLeadership:")) {
      const branch = type.split(":")[1];

      if (!data.branchLeadership[branch]) {
        data.branchLeadership[branch] = [];
      }

      data.branchLeadership[branch].push({
        name: "",
        phone: "",
        takleider: false,
      });
    }

    renderAdminPanel();

    if (type === "news") {
      const newest = document.querySelector(".admin-news-item");
      if (newest?.classList.contains("is-collapsed")) {
        toggleAdminCollapsible(newest);
      }
    }
  }

  function moveEntry(type, index, direction) {
    const data = DataStore.get();
    readFormValues();

    const list = data[type];
    if (!Array.isArray(list)) return;

    const target = index + direction;
    if (target < 0 || target >= list.length) return;

    const [item] = list.splice(index, 1);
    list.splice(target, 0, item);
    markDirtyState(true);
    renderAdminPanel();
  }

  async function removeEntry(type, index) {
    const data = DataStore.get();

    readFormValues();

    let removedItem = null;

    if (type in listEditorConfig) {
      removedItem = data[type][index];
    } else if (type === "groupLeadership") {
      removedItem = data.groupLeadership[index];
    } else if (type.startsWith("branchLeadership:")) {
      removedItem = data.branchLeadership[type.split(":")[1]][index];
    }

    if (
      (type === "secondhand" || type === "news" || type === "agenda") &&
      removedItem?.image
    ) {
      queueUploadDelete(removedItem.image);
    }

    if (type in listEditorConfig) {
      data[type].splice(index, 1);
    } else if (type === "groupLeadership") {
      data.groupLeadership.splice(index, 1);
    } else if (type.startsWith("branchLeadership:")) {
      data.branchLeadership[type.split(":")[1]].splice(index, 1);
    }

    markDirtyState(true);
    renderAdminPanel();
  }

  function readFormValues() {
    const data = DataStore.get();
    const activePageButton = qs("[data-page-option].is-active");
    data.activePage = activePageButton
      ? activePageButton.dataset.pageOption
      : "home";

    if (data.activePage === "news") {
      if (!Array.isArray(data.news)) data.news = [];
      readListFields(data.news, "news");
      normalizeNewsItems(data);
      return data;
    }

    if (data.activePage === "home") {
      qsa("[data-contact-field]").forEach((input) => {
        const field = input.dataset.contactField;

        if (!data.contact) {
          data.contact = {};
        }

        data.contact[field] = input.value.trim();
      });

      readListFields(data.agenda, "agenda");
      sortAgendaInPlace(data.agenda);
      readListFields(data.faq, "faq");

      return data;
    }

    if (data.activePage === "over-ons") {
      qsa(
        "[data-field='leadership-name'], [data-field='leadership-phone']",
      ).forEach((input) => {
        const index = Number(input.dataset.index);
        const field =
          input.dataset.field === "leadership-name" ? "name" : "phone";

        if (data.groupLeadership[index]) {
          data.groupLeadership[index][field] = input.value.trim();
        }
      });

      const pageData = data.pageContent["over-ons"] || {};

      qsa("[data-page-field]").forEach((input) => {
        pageData[input.dataset.pageField] = input.value.trim();
      });

      data.pageContent["over-ons"] = pageData;

      return data;
    }

    if (data.activePage === "secondhand") {
      readListFields(data.secondhand, "secondhand");
      return data;
    }

    if (data.activePage in data.branchLeadership) {
      const list = data.branchLeadership[data.activePage];
      qsa(
        "[data-field='leadership-name'], [data-field='leadership-phone']",
      ).forEach((input) => {
        const index = Number(input.dataset.index);
        const field =
          input.dataset.field === "leadership-name" ? "name" : "phone";
        list[index][field] = input.value.trim();
      });
      list.forEach((item) => {
        item.takleider = false;
      });
      qsa("[data-field='leadership-takleider']").forEach((input) => {
        const index = Number(input.dataset.index);
        if (list[index]) list[index].takleider = input.checked;
      });
      normalizeBranchLeaderList(list);
      return data;
    }

    const pageData = data.pageContent[data.activePage] || {};
    qsa("[data-page-field]").forEach((input) => {
      pageData[input.dataset.pageField] = input.value.trim();
    });
    data.pageContent[data.activePage] = pageData;
    return data;
  }

  async function initAdminPanel() {
    Auth.redirectIfNotAuthenticated();

    setSaveStatus("Gegevens laden...", "saving");
    try {
      await DataStore.load();
    } catch (error) {
      console.error(error);
      setSaveStatus("Kon gegevens niet laden — herlaad de pagina", "error");
      return;
    }
    sortAgendaInPlace(DataStore.get().agenda);
    markDirtyState(false, { announce: false });
    renderAdminPanel();

    document.addEventListener("input", (event) => {
      const dayInput = event.target.closest("[data-field='agenda-day']");
      if (dayInput) {
        dayInput.value = dayInput.value.replace(/[^0-9]/g, "");
        if (dayInput.value !== "") {
          dayInput.value = String(
            Math.min(31, Math.max(1, Number(dayInput.value))),
          );
        }
      }

      const leadershipNameInput = event.target.closest(
        "[data-field='leadership-name']",
      );
      if (leadershipNameInput) {
        const card = leadershipNameInput.closest(".leadership-card");
        const name =
          leadershipNameInput.value.trim() || "Naam nog niet ingevuld";
        const title = card?.querySelector(".leadership-card-title strong");
        if (title) title.textContent = name;
      }

      const letterTitleInput = event.target.closest("[data-letter-title-new]");
      if (letterTitleInput) {
        const branch = letterTitleInput.dataset.letterTitleNew;
        const uploadInput = qs(`[data-letter-upload="${branch}"]`);
        if (uploadInput) uploadInput.disabled = !letterTitleInput.value.trim();
        return;
      }

      const planningTitleInput = event.target.closest("[data-planning-title]");
      if (planningTitleInput) {
        const branch = planningTitleInput.dataset.planningTitle;
        const uploadInput = qs(`[data-planning-upload="${branch}"]`);
        if (uploadInput)
          uploadInput.disabled = !planningTitleInput.value.trim();
        return;
      }

      const planningMonthInput = event.target.closest("[data-planning-month]");
      if (planningMonthInput) {
        const branch = planningMonthInput.dataset.planningMonth;
        const titleInput = qs(`[data-planning-title="${branch}"]`);
        const uploadInput = qs(`[data-planning-upload="${branch}"]`);
        const selectedMonths = [
          ...document.querySelectorAll(
            `[data-planning-month="${branch}"]:checked`,
          ),
        ].map((input) => input.value);
        const title = selectedMonths.join("_");
        if (titleInput) titleInput.value = title;
        const monthLabel = qs(`[data-planning-month-label="${branch}"]`);
        if (monthLabel)
          monthLabel.textContent = selectedMonths.length
            ? `Maanden: ${selectedMonths.join(", ")}`
            : "Kies maanden";
        if (uploadInput) uploadInput.disabled = !title;
        markDirtyState(true);
        return;
      }

      if (event.target.closest("[data-field], [data-page-field]"))
        markDirtyState(true);

      if (event.target.closest("[data-drive-setting]")) markDirtyState(true);
      if (event.target.closest("[data-drive-oauth-client]"))
        markDirtyState(true);

      const collapsibleItem = event.target.closest(".admin-collapsible-item");
      if (collapsibleItem) {
        const summary = collapsibleItem.querySelector(
          ".admin-collapse-toggle strong",
        );
        const itemIndex = Number(
          collapsibleItem.querySelector("[data-index]")?.dataset.index,
        );
        const type = event.target.dataset.field?.split("-")[0];
        if (summary && type === "agenda") {
          const day =
            collapsibleItem.querySelector("[data-field='agenda-day']")?.value ||
            "";
          const month =
            collapsibleItem.querySelector("[data-field='agenda-month']")
              ?.value || "";
          const title =
            collapsibleItem.querySelector("[data-field='agenda-title']")
              ?.value || `Event ${itemIndex + 1}`;
          summary.textContent = `${day} ${month} · ${title}`;
        } else if (summary && type === "faq") {
          const question =
            collapsibleItem.querySelector("[data-field='faq-question']")
              ?.value || `Vraag ${itemIndex + 1}`;
          summary.textContent = question;
        } else if (summary && type === "news") {
          const title =
            collapsibleItem.querySelector("[data-field='news-title']")?.value.trim() ||
            `Nieuws ${itemIndex + 1}`;
          const dateValue =
            collapsibleItem.querySelector("[data-field='news-date']")?.value.trim() ||
            "";
          const dateLabel = collapsibleItem.querySelector(
            ".admin-news-summary-date",
          );
          summary.textContent = title;
          if (dateLabel) {
            dateLabel.hidden = !dateValue;
            dateLabel.textContent = dateValue;
          }
        }
      }
    });

    document.addEventListener("change", async (event) => {
      const takleiderToggle = event.target.closest(
        "[data-field='leadership-takleider']",
      );
      if (takleiderToggle) {
        if (takleiderToggle.checked) {
          const type = takleiderToggle.dataset.type;
          qsa(
            `[data-field='leadership-takleider'][data-type="${type}"]`,
          ).forEach((other) => {
            if (other !== takleiderToggle) other.checked = false;
          });
        }
        markDirtyState(true);
        return;
      }

      const planningUpload = event.target.closest("[data-planning-upload]");
      if (planningUpload?.files[0]) {
        const branch = planningUpload.dataset.planningUpload;
        const dropdown = qs(`[data-planning-month-dropdown="${branch}"]`);
        dropdown?.removeAttribute("open");
        const title =
          qs(`[data-planning-title="${branch}"]`)?.value.trim() || "";
        pendingPlanningUploads.set(branch, {
          file: planningUpload.files[0],
          title,
        });
        const uploadLabel = planningUpload
          .closest(".document-upload-button")
          ?.querySelector("[data-planning-upload-label]");
        const uploadButton = planningUpload.closest(".document-upload-button");
        uploadButton?.classList.add("is-selected");
        uploadButton?.setAttribute("title", "PDF geselecteerd");
        if (uploadLabel) uploadLabel.textContent = "✓";
        markDirtyState(true);
        return;
      }

      const letterUpload = event.target.closest("[data-letter-upload]");
      if (letterUpload?.files[0]) {
        try {
          await addLetter(
            DataStore.get(),
            letterUpload.dataset.letterUpload,
            letterUpload.files[0],
          );
        } catch (error) {
          console.error(error);
          setSaveStatus(error.message || "Brief uploaden mislukt", "error");
        }
        return;
      }

      const photoUpload = event.target.closest("[data-photo-upload]");

      if (photoUpload?.files[0]) {
        try {
          await updatePhoto(
            DataStore.get(),
            photoUpload.dataset.photoUpload,
            photoUpload.files[0],
          );
        } catch (error) {
          console.error(error);
          setSaveStatus(error.message || "Foto uploaden mislukt", "error");
        }

        return;
      }

      const newsImageUpload = event.target.closest("[data-news-image-upload]");
      if (newsImageUpload?.files?.length) {
        readFormValues();
        const data = DataStore.get();
        const index = Number(newsImageUpload.dataset.index);
        const files = [...newsImageUpload.files];
        if (!Array.isArray(data.news) || !data.news[index]) return;

        const images = getNewsImages(data.news[index]);
        const remaining = NEWS_IMAGES_MAX - images.length;
        if (remaining <= 0) {
          setSaveStatus(`Maximum van ${NEWS_IMAGES_MAX} foto's bereikt.`, "error");
          newsImageUpload.value = "";
          return;
        }

        const imageFiles = files
          .filter((file) => file.type.startsWith("image/"))
          .slice(0, remaining);
        if (!imageFiles.length) {
          setSaveStatus("Selecteer een afbeeldingsbestand.", "error");
          return;
        }

        try {
          imageFiles.forEach((file) => assertUploadSize(file, "foto"));
          setSaveStatus(
            imageFiles.length > 1 ? "Foto's uploaden..." : "Foto uploaden...",
            "saving",
          );
          for (const file of imageFiles) {
            const optimized = await optimizeImageForUpload(file);
            const filename = `news-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
            const formData = new FormData();
            formData.append("photo", optimized);
            formData.append("filename", filename);
            const response = await fetch("/api/uploads/photo", {
              method: "POST",
              body: formData,
            });
            const result = await response.json().catch(() => ({}));
            if (!response.ok || !result.path) {
              throw new Error(result.message || "Foto uploaden mislukt.");
            }
            images.push(result.path);
          }
          setNewsImages(data.news[index], images);
          await persist(data);
          renderAdminPanel();
          const card = qsa(".admin-news-item")[index];
          if (card?.classList.contains("is-collapsed")) {
            toggleAdminCollapsible(card);
          }
        } catch (error) {
          console.error(error);
          setSaveStatus(error.message || "Foto uploaden mislukt.", "error");
        }
        return;
      }

      const listImageUpload = event.target.closest("[data-list-image-upload]");
      if (listImageUpload?.files[0]) {
        readFormValues();
        const data = DataStore.get();
        const type = listImageUpload.dataset.listImageUpload;
        const index = Number(listImageUpload.dataset.index);
        const file = listImageUpload.files[0];

        if (!file.type.startsWith("image/")) {
          setSaveStatus("Selecteer een afbeeldingsbestand.", "error");
          return;
        }

        if (!Array.isArray(data[type]) || !data[type][index]) return;

        try {
          assertUploadSize(file, "foto");
          setSaveStatus("Foto uploaden...", "saving");
          const optimized = await optimizeImageForUpload(file);
          const filename = `${type}-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
          const formData = new FormData();
          formData.append("photo", optimized);
          formData.append("filename", filename);

          const response = await fetch("/api/uploads/photo", {
            method: "POST",
            body: formData,
          });
          const result = await response.json().catch(() => ({}));
          if (!response.ok || !result.path) {
            throw new Error(result.message || "Foto uploaden mislukt.");
          }

          data[type][index].image = result.path;
          markDirtyState(true);
          renderAdminPanel();
        } catch (error) {
          console.error(error);
          setSaveStatus(error.message || "Foto uploaden mislukt.", "error");
        }
        return;
      }

      const secondhandUpload = event.target.closest("[data-secondhand-upload]");

      if (!secondhandUpload?.files[0]) return;

      const data = DataStore.get();
      const index = Number(secondhandUpload.dataset.secondhandUpload);
      const file = secondhandUpload.files[0];

      if (!file.type.startsWith("image/")) {
        setSaveStatus("Selecteer een afbeeldingsbestand.", "error");
        return;
      }

      if (!data.secondhand[index]) return;

      try {
        assertUploadSize(file, "foto");
        setSaveStatus("Foto uploaden...", "saving");

        const optimized = await optimizeImageForUpload(file);
        const filename = `tweedehands-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
        const formData = new FormData();
        formData.append("photo", optimized);
        formData.append("filename", filename);

        const response = await fetch("/api/uploads/photo", {
          method: "POST",
          body: formData,
        });

        let result = {};

        try {
          result = await response.json();
        } catch {
          // Geen JSON.
        }

        if (!response.ok) {
          throw new Error(result.message || "Foto uploaden mislukt.");
        }

        if (!result.path) {
          throw new Error("Server gaf geen fotopad terug.");
        }

        data.secondhand[index].image = result.path;

        await persist(data);
        renderAdminPanel();
      } catch (error) {
        console.error(error);

        setSaveStatus(error.message || "Foto uploaden mislukt.", "error");
      }
    });

    document.addEventListener("click", async (event) => {
      const planningUpload = event.target.closest("[data-planning-upload]");
      if (planningUpload) {
        const branch = planningUpload.dataset.planningUpload;
        qs(`[data-planning-month-dropdown="${branch}"]`)?.removeAttribute(
          "open",
        );
        return;
      }

      const googleConnect = event.target.closest("[data-google-connect]");
      if (googleConnect) {
        try {
          const response = await fetch("/api/google-drive/oauth/start");
          const result = await response.json().catch(() => ({}));
          if (!response.ok || !result.url) {
            throw new Error(result.message || "Google verbinden mislukt");
          }
          window.location.href = result.url;
        } catch (error) {
          setSaveStatus(error.message || "Google verbinden mislukt", "error");
        }
        return;
      }

      const googleOAuthReset = event.target.closest("[data-google-oauth-reset]");
      if (googleOAuthReset) {
        if (!window.confirm("Wil je de Google OAuth-client en koppeling resetten? Daarna moet je een nieuw clientbestand uploaden en opnieuw verbinden.")) {
          return;
        }
        try {
          const response = await fetch("/api/google-drive/oauth-reset", {
            method: "POST",
          });
          const result = await response.json().catch(() => ({}));
          if (!response.ok) {
            throw new Error(result.message || "OAuth-client resetten mislukt.");
          }
          googleDriveSettings.oauthConfigured = false;
          googleDriveSettings.oauthEmail = "";
          renderAdminPanel();
          setSaveStatus("OAuth-client gereset. Upload nu een nieuw clientbestand.", "saved");
        } catch (error) {
          console.error(error);
          setSaveStatus(error.message || "OAuth-client resetten mislukt.", "error");
        }
        return;
      }

      const collapseToggle = event.target.closest("[data-collapse-toggle]");
      if (collapseToggle) {
        const item = collapseToggle.closest(".admin-collapsible-item");
        toggleAdminCollapsible(item);
        return;
      }

      const planningRemove = event.target.closest("[data-planning-remove]");
      if (planningRemove) {
        if (!window.confirm("Wil je deze maandplanning echt verwijderen?")) {
          return;
        }

        try {
          await removeMonthlyPlanning(
            DataStore.get(),
            planningRemove.dataset.planningRemove,
          );
        } catch (error) {
          console.error(error);
          setSaveStatus(
            error.message || "Maandplanning verwijderen mislukt",
            "error",
          );
        }
        return;
      }

      const letterRemove = event.target.closest("[data-letter-remove]");
      if (letterRemove) {
        if (!window.confirm("Wil je deze brief echt verwijderen?")) return;

        try {
          await removeLetter(
            DataStore.get(),
            letterRemove.dataset.letterRemove,
            Number(letterRemove.dataset.index),
          );
        } catch (error) {
          console.error(error);
          setSaveStatus(error.message || "Brief verwijderen mislukt", "error");
        }
        return;
      }

      const photoRemove = event.target.closest("[data-photo-remove]");

      if (photoRemove) {
        const data = DataStore.get();

        const photo = photoEditorConfig.find(
          (item) => item.key === photoRemove.dataset.photoRemove,
        );

        if (photo) {
          const filename = PHOTO_FILENAMES[photo.key];

          if (filename) {
            try {
              const response = await fetch(
                `/api/uploads/photo/${encodeURIComponent(filename)}`,
                {
                  method: "DELETE",
                },
              );

              let result = {};

              try {
                result = await response.json();
              } catch {
                // Geen JSON nodig.
              }

              if (!response.ok) {
                throw new Error(result.message || "Foto verwijderen mislukt.");
              }
            } catch (error) {
              console.error(error);

              setSaveStatus("Foto verwijderen mislukt", "error");

              return;
            }
          }

          setPhotoValue(data, photo.key, "");

          await persist(data);

          renderAdminPanel();
        }

        return;
      }

      const newsImageMove = event.target.closest("[data-news-image-move]");
      if (newsImageMove) {
        readFormValues();
        const data = DataStore.get();
        const index = Number(newsImageMove.dataset.index);
        const imageIndex = Number(newsImageMove.dataset.imageIndex);
        const direction = Number(newsImageMove.dataset.direction);
        if (!Array.isArray(data.news) || !data.news[index]) return;

        const images = getNewsImages(data.news[index]);
        const target = imageIndex + direction;
        if (target < 0 || target >= images.length) return;

        const [moved] = images.splice(imageIndex, 1);
        images.splice(target, 0, moved);
        setNewsImages(data.news[index], images);
        await persist(data);
        renderAdminPanel();
        const card = qsa(".admin-news-item")[index];
        if (card?.classList.contains("is-collapsed")) {
          toggleAdminCollapsible(card);
        }
        return;
      }

      const newsImageRemove = event.target.closest("[data-news-image-remove]");
      if (newsImageRemove) {
        readFormValues();
        const data = DataStore.get();
        const index = Number(newsImageRemove.dataset.index);
        const imageIndex = Number(newsImageRemove.dataset.imageIndex);
        if (!Array.isArray(data.news) || !data.news[index]) return;

        const images = getNewsImages(data.news[index]);
        const imagePath = images[imageIndex] || "";
        if (!imagePath) return;

        const filename = imagePath
          .split("/")
          .pop()
          ?.split("?")[0]
          ?.replace(/\.[^/.]+$/, "");

        if (!window.confirm("Wil je deze foto verwijderen?")) return;

        try {
          if (filename && imagePath.startsWith("/uploads/")) {
            const response = await fetch(
              `/api/uploads/photo/${encodeURIComponent(filename)}`,
              { method: "DELETE" },
            );
            if (!response.ok) {
              const result = await response.json().catch(() => ({}));
              throw new Error(result.message || "Foto verwijderen mislukt.");
            }
          }

          images.splice(imageIndex, 1);
          setNewsImages(data.news[index], images);
          await persist(data);
          renderAdminPanel();
          const card = qsa(".admin-news-item")[index];
          if (card?.classList.contains("is-collapsed")) {
            toggleAdminCollapsible(card);
          }
        } catch (error) {
          console.error(error);
          setSaveStatus(error.message || "Foto verwijderen mislukt.", "error");
        }
        return;
      }

      const listImageRemove = event.target.closest("[data-list-image-remove]");
      if (listImageRemove) {
        readFormValues();
        const data = DataStore.get();
        const type = listImageRemove.dataset.listImageRemove;
        const index = Number(listImageRemove.dataset.index);
        if (!Array.isArray(data[type]) || !data[type][index]) return;

        const imagePath = data[type][index].image || "";
        const filename = imagePath
          .split("/")
          .pop()
          ?.split("?")[0]
          ?.replace(/\.[^/.]+$/, "");

        if (!window.confirm("Wil je deze foto verwijderen?")) return;

        try {
          if (filename && imagePath.startsWith("/uploads/")) {
            const response = await fetch(
              `/api/uploads/photo/${encodeURIComponent(filename)}`,
              { method: "DELETE" },
            );
            if (!response.ok) {
              const result = await response.json().catch(() => ({}));
              throw new Error(result.message || "Foto verwijderen mislukt.");
            }
          }

          data[type][index].image = "";
          await persist(data);
          renderAdminPanel();
        } catch (error) {
          console.error(error);
          setSaveStatus(error.message || "Foto verwijderen mislukt.", "error");
        }
        return;
      }

      const pageTile = event.target.closest("[data-page-option]");
      if (pageTile) {
        const targetPage = pageTile.dataset.pageOption;
        const currentPage = DataStore.get().activePage || "home";
        if (targetPage === currentPage) return;

        if (adminHasUnsavedChanges) {
          const leave = window.confirm(
            "Er zijn onopgeslagen wijzigingen. Die gaan verloren als je naar een andere pagina gaat. Toch verdergaan?",
          );
          if (!leave) return;
        }

        if (targetPage === "settings") {
          const password = window.prompt("Voer het instellingenwachtwoord in:");
          if (!password) return;
          const unlockResponse = await fetch(
            "/api/google-drive/settings/unlock",
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ password }),
            },
          );
          if (!unlockResponse.ok) {
            const result = await unlockResponse.json().catch(() => ({}));
            setSaveStatus(
              result.message || "Instellingen ontgrendelen mislukt",
              "error",
            );
            return;
          }
          const settingsResponse = await fetch("/api/google-drive/settings");
          if (settingsResponse.ok) {
            googleDriveSettings = await settingsResponse.json();
          }
        }

        if (adminHasUnsavedChanges) {
          pendingPlanningUploads.clear();
          pendingUploadDeletes.length = 0;
          adminHasUnsavedChanges = false;
          await DataStore.load({ force: true });
        }

        const fresh = DataStore.get();
        fresh.activePage = targetPage;
        await persist(fresh, { quiet: true });
        renderAdminPanel();
        window.scrollTo(0, 0);
        return;
      }

      const addTarget = event.target.closest("[data-add]");
      if (addTarget) {
        markDirtyState(true);
        await addEntry(addTarget.dataset.add);
        return;
      }

      const moveTarget = event.target.closest("[data-move]");
      if (moveTarget && !moveTarget.disabled) {
        moveEntry(
          moveTarget.dataset.move,
          Number(moveTarget.dataset.index),
          Number(moveTarget.dataset.direction),
        );
        return;
      }

      const removeTarget = event.target.closest("[data-remove]");
      if (removeTarget) {
        const removeType = removeTarget.dataset.remove;
        const confirmation = {
          agenda: "Wil je dit event echt verwijderen?",
          news: "Wil je dit nieuwsbericht echt verwijderen?",
          faq: "Wil je deze praktische vraag echt verwijderen?",
          secondhand: "Wil je dit tweedehandsitem echt verwijderen?",
          groupLeadership: "Wil je deze groepsleider echt verwijderen?",
        };
        const message = removeType.startsWith("branchLeadership:")
          ? "Wil je deze leider echt verwijderen?"
          : confirmation[removeType] || "Wil je dit item echt verwijderen?";
        if (!window.confirm(message)) return;
        markDirtyState(true);
        await removeEntry(removeType, Number(removeTarget.dataset.index));
      }
    });

    document
      .getElementById("logoutBtn")
      ?.addEventListener("click", Auth.logout);

    document
      .getElementById("adminForm")
      ?.addEventListener("submit", async (event) => {
        event.preventDefault();
        const data = readFormValues();
        if (
          data.activePage === "home" &&
          data.agenda.some(
            (item) => item.link?.trim() && !item.linkText?.trim(),
          )
        ) {
          setSaveStatus(
            "Vul een linktekst in voor elk event met een link.",
            "error",
          );
          return;
        }
        if (data.activePage === "settings") {
          const folderId =
            qs("[data-drive-setting='folderId']")?.value.trim() || "";
          const oauthClientFile = qs("[data-drive-oauth-client]")?.files?.[0];
          if (oauthClientFile) {
            const oauthData = new FormData();
            oauthData.append("client", oauthClientFile);
            const oauthResponse = await fetch(
              "/api/google-drive/oauth-client",
              {
                method: "POST",
                body: oauthData,
              },
            );
            if (!oauthResponse.ok) {
              const result = await oauthResponse.json().catch(() => ({}));
              setSaveStatus(
                result.message || "OAuth-client opslaan mislukt",
                "error",
              );
              return;
            }
          }
          const response = await fetch("/api/google-drive/settings", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ folderId }),
          });
          if (!response.ok) {
            const result = await response.json().catch(() => ({}));
            setSaveStatus(
              result.message || "Instellingen opslaan mislukt",
              "error",
            );
            return;
          }
          googleDriveSettings.folderId = folderId;
          markDirtyState(false);
          return;
        }

        const driveErrors = [];
        const hadPlanningUpload = pendingPlanningUploads.size > 0;
        try {
          for (const [branch, pendingUpload] of pendingPlanningUploads) {
            const uploadButton = qs(
              `[data-planning-upload="${branch}"]`,
            )?.closest(".document-upload-button");
            const uploadLabel = uploadButton?.querySelector(
              "[data-planning-upload-label]",
            );
            uploadButton?.classList.add("is-uploading");
            uploadButton?.classList.remove("is-selected");
            uploadButton?.setAttribute("aria-busy", "true");
            if (uploadLabel) uploadLabel.textContent = "";
            setSaveStatus("Maandplanning uploaden...", "saving");

            try {
              const title =
                qs(`[data-planning-title="${branch}"]`)?.value.trim() ||
                pendingUpload.title;
              const result = await updateMonthlyPlanning(
                data,
                branch,
                pendingUpload.file,
                title,
              );
              if (result.driveError) {
                driveErrors.push(
                  result.driveErrorMessage ||
                    "De Google Drive-upload is mislukt.",
                );
              }
              pendingPlanningUploads.delete(branch);
            } finally {
              if (uploadButton?.isConnected) {
                uploadButton.classList.remove("is-uploading");
                uploadButton.classList.add("is-selected");
                uploadButton.removeAttribute("aria-busy");
                uploadButton.setAttribute("title", "PDF geselecteerd");
                if (uploadLabel) uploadLabel.textContent = "✓";
              }
            }
          }

          await persist(data);
          renderAdminPanel();
          PageRenderer.updatePageFromData();
          if (driveErrors.length) {
            setSaveStatus(
              `Maandplanning staat op de website, maar Google Drive gaf deze fout: ${driveErrors[0]}`,
              "error",
            );
          } else if (hadPlanningUpload) {
            setSaveStatus("Maandplanning opgeslagen", "saved");
          }
        } catch (error) {
          console.error(error);
          setSaveStatus(
            error.message || "Wijzigingen opslaan mislukt",
            "error",
          );
        }
      });

    document
      .getElementById("resetDefaults")
      ?.addEventListener("click", async () => {
        const response = await fetch("/api/site-data/reset", {
          method: "POST",
        });

        if (!response.ok) {
          setSaveStatus("Resetten mislukt", "error");
          return;
        }

        await DataStore.load({ force: true });
        renderAdminPanel();
        PageRenderer.updatePageFromData();
      });

    window.addEventListener("beforeunload", (event) => {
      if (!adminHasUnsavedChanges) return;
      event.preventDefault();
      event.returnValue = "";
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

      qsa(".branch-bg").forEach((image) => {
        const card = image.closest(".branch");
        const className = Object.keys(branchPhotoNames).find((name) => card?.classList.contains(name));
        const photo = className ? data.photos?.branches?.[branchPhotoNames[className]] : "";

        if (!photo) {
          image.hidden = true;
          return;
        }

        let attempt = 0;

        const loadPhoto = (src) => {
          image.onload = () => {
            image.hidden = false;
          };
          image.onerror = () => {
            if (image.naturalWidth > 0) {
              image.hidden = false;
              return;
            }

            if (attempt < 1) {
              attempt += 1;
              const glue = src.includes("?") ? "&" : "?";
              loadPhoto(`${src}${glue}retry=${attempt}`);
              return;
            }

            image.hidden = true;
          };

          const absolute = new URL(src, window.location.origin).href;
          const alreadyFailed = image.src === absolute && image.complete && image.naturalWidth === 0;

          if (alreadyFailed && attempt < 1) {
            attempt += 1;
            const glue = src.includes("?") ? "&" : "?";
            loadPhoto(`${src}${glue}retry=${attempt}`);
            return;
          }

          image.src = src;

          if (image.complete && image.naturalWidth > 0) {
            image.hidden = false;
          }
        };

        loadPhoto(photo);
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
          resourceCards.push(`
                            <div class="page-card planning-download-card">
                                <div class="planning-download-header">
                                    <h3>Maandplanning ${escapeHtml(BRANCH_LABELS[pageName])}</h3>
                                </div>
                                <a class="button button-primary download-button document-action-button" href="${escapeHtml(planning)}" target="_blank" rel="noopener" download>
                                  <span class="button-icon icon-arrow-down" aria-hidden="true"></span>
                                  <span>${escapeHtml(formatPlanningLabel(planningTitle))}</span>
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
                                ${letters
                                  .map(
                                    (letter) => `
                                    <a class="button button-ghost-dark download-button document-action-button" href="${escapeHtml(letter.path)}" target="_blank" rel="noopener" download>
                                        <span class="button-icon icon-arrow-down" aria-hidden="true"></span>
                                        <span>${escapeHtml(letter.title || "Brief")}</span>
                                    </a>
                                `,
                                  )
                                  .join("")}
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
        const newsItems = Array.isArray(data.news) ? data.news : [];
        const isNewsArchive = document.body.classList.contains("news-page");
        const visibleItems = isNewsArchive
          ? newsItems
          : newsItems.slice(0, NEWS_HOME_LIMIT);

        if (!newsItems.length) {
          if (isNewsArchive) newsSection?.removeAttribute("hidden");
          else newsSection?.setAttribute("hidden", "");
          newsEl.innerHTML = isNewsArchive
            ? `<p class="news-empty">Er zijn nog geen nieuwsberichten.</p>`
            : "";
          if (newsMore) newsMore.hidden = true;
        } else {
          newsSection?.removeAttribute("hidden");
          newsEl.innerHTML = visibleItems.map(buildNewsItemHtml).join("");
          setupNewsAccordion(newsEl);
          initNewsCarousels(newsEl);
          if (newsMore) {
            newsMore.hidden = isNewsArchive || newsItems.length <= NEWS_HOME_LIMIT;
          }
        }
      }

      const agendaEl = qs(".agenda");
      if (agendaEl) {
        agendaEl.innerHTML = sortAgendaItems(data.agenda)
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
              ? `<span class="agenda-thumb" aria-hidden="true"><img src="${escapeHtml(image)}" alt="" loading="lazy"></span>`
              : "";
            return `
                <details class="agenda-item ${image ? "has-agenda-image" : ""}">
                  <summary class="agenda-summary">
                    <div class="agenda-date">
                      <strong>${escapeHtml(item.day)}</strong>
                      <span>${escapeHtml(item.month)}</span>
                    </div>
                    <div class="agenda-body">
                      <h3>${escapeHtml(item.title)}</h3>
                    </div>
                    ${thumb}
                  </summary>
                  <div class="agenda-details">
                    <div class="agenda-details-inner">
                      <p>${escapeHtml(item.text)}</p>
                      ${link && linkText ? `<a class="agenda-link" href="${escapeHtml(link)}" target="_blank" rel="noopener noreferrer">${escapeHtml(linkText)} <span class="icon-arrow-external" aria-hidden="true"></span></a>` : ""}
                      ${image ? `<img src="${escapeHtml(image)}" alt="${escapeHtml(item.title)}" loading="lazy" decoding="async">` : ""}
                    </div>
                  </div>
                </details>
              `;
          })
          .join("");
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
                                <div class="faq-content-inner"><p>${escapeHtml(item.answer)}</p></div>
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

      const footerAddress = qs(".footer-column p");
      if (footerAddress && data.contact.address) {
        setMultilineText(
          footerAddress,
          data.contact.address.replace(/,/g, ",\n"),
        );
      }

      const aboutHero = qs(".about-hero");
      if (aboutHero) {
        aboutHero.style.backgroundImage = data.photos.aboutHero
          ? `url("${data.photos.aboutHero}")`
          : "none";
      }

      if (data.photos.branches[pageName]) {
        const branchImage = qs(".branch-photo img");
        if (branchImage)
          branchImage.src = versionStaticImage(data.photos.branches[pageName]);
      }

      const secondhandScroll = qs(".secondhand-scroll");
      if (secondhandScroll) {
        secondhandScroll.innerHTML = data.secondhand
          .map(
            (item) => `
                        <article class="secondhand-item">
                            <div class="secondhand-item-image">
                                <img src="${escapeHtml(versionStaticImage(item.image || "../assets/images/domein.jpg"))}" alt="${escapeHtml(item.title)}">
                            </div>
                            <div class="secondhand-item-content">
                                <span class="eyebrow">${escapeHtml(item.category)}</span>
                                <p class="secondhand-item-info">${escapeHtml(item.size || item.info || "")}</p>
                                <div class="secondhand-item-bottom">
                                    <strong>€${escapeHtml(item.price)}</strong>
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

    try {
      if (document.body.classList.contains("admin-page")) {
        await initAdminPanel();
      } else if (!document.body.classList.contains("login-page")) {
        await DataStore.load();
        PageRenderer.updatePageFromData();
      }
    } catch (error) {
      console.error("Kon site-gegevens niet laden", error);
    }
  }

  init();
})();
