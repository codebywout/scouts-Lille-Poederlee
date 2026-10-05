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

  const IMAGE_ASSET_VERSION = "20260930-3";

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

    menuButton.addEventListener("click", () =>
      mobileMenu.classList.toggle("open"),
    );

    qsa("a", mobileMenu).forEach((link) => {
      link.addEventListener("click", () => mobileMenu.classList.remove("open"));
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
    JAN: 1,
    FEB: 2,
    MAA: 3,
    MRT: 3,
    APR: 4,
    MEI: 5,
    JUN: 6,
    JUL: 7,
    AUG: 8,
    SEP: 9,
    OKT: 10,
    NOV: 11,
    DEC: 12,
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

  function initRegistrationForm() {
    const registrationForm = document.getElementById("registrationForm");
    if (!registrationForm) return;

    registrationForm.addEventListener("submit", (event) => {
      event.preventDefault();
      if (!registrationForm.reportValidity()) return;

      submitToGoogleForm(new FormData(registrationForm));

      registrationForm.reset();
      const status = document.getElementById("registrationStatus");
      if (status) status.textContent = "Succesvol verzonden.";
    });
  }

  /* ==========================================================
       Soft page transitions for internal links
       ========================================================== */

  function initPageTransitions() {
    document.addEventListener("click", (event) => {
      const link = event.target.closest("a");
      if (!link || event.defaultPrevented || link.target === "_blank") return;

      const url = new URL(link.href, window.location.href);
      const isInternalPage =
        url.origin === window.location.origin &&
        url.pathname !== window.location.pathname &&
        !url.hash &&
        !link.hasAttribute("download");

      if (!isInternalPage) return;

      event.preventDefault();
      document.body.classList.add("page-leaving");
      window.setTimeout(() => (window.location.href = url.href), 220);
    });
  }

  /* ==========================================================
       FAQ accordion
       ========================================================== */

  function closeFaqItem(item) {
    const content = item.querySelector(".faq-content");
    item.classList.remove("open-anim");
    content.addEventListener(
      "transitionend",
      () => item.removeAttribute("open"),
      { once: true },
    );
  }

  function openFaqItem(item) {
    item.setAttribute("open", "");
    requestAnimationFrame(() => item.classList.add("open-anim"));
  }

  function setupFaqAccordion(container) {
    const faqItems = qsa(".faq-item", container);

    faqItems.forEach((item) => {
      const summary = item.querySelector("summary");
      const content = item.querySelector(".faq-content");
      if (!summary || !content) return; // guards against a missing-markup crash

      summary.addEventListener("click", (event) => {
        event.preventDefault();

        if (item.classList.contains("open-anim")) {
          closeFaqItem(item);
          return;
        }

        faqItems
          .filter(
            (other) => other !== item && other.classList.contains("open-anim"),
          )
          .forEach(closeFaqItem);

        openFaqItem(item);
      });
    });
  }

  function closeAgendaItem(item) {
    if (item._agendaCloseTimer) {
      clearTimeout(item._agendaCloseTimer);
      item._agendaCloseTimer = null;
    }

    item.classList.remove("is-open");
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

        agendaItems
          .filter(
            (other) => other !== item && other.classList.contains("is-open"),
          )
          .forEach(closeAgendaItem);

        item.setAttribute("open", "");
        requestAnimationFrame(() => item.classList.add("is-open"));
      });
    });
  }

  /* ==========================================================
       Scroll-reveal animations
       ========================================================== */

  function initRevealAnimations() {
    const animatedElements = qsa(".branch, .agenda-item, .faq-item");
    if (animatedElements.length === 0) return;

    if (!("IntersectionObserver" in window)) {
      animatedElements.forEach((el) => el.classList.add("visible"));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12 },
    );

    animatedElements.forEach((el) => {
      el.classList.add("animate");
      observer.observe(el);
    });
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

    // Geen tweedehandsitems beschikbaar
    if (items.length === 0) {
      secondhandScroll.innerHTML = `
                <div class="secondhand-empty">
                    <h3>Geen items beschikbaar</h3>
                    <p>
                        Neem later zeker nog eens een kijkje!
                    </p>
                </div>
            `;

      // Pijltjes verbergen
      buttons.forEach((button) => {
        button.hidden = true;
      });

      // Teller verbergen
      if (status) {
        status.hidden = true;
      }

      return;
    }

    // Er zijn wel items → pijltjes tonen
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
  let googleDriveSettings = {
    folderId: "",
    oauthConfigured: false,
    oauthEmail: "",
  };

  function setSaveStatus(message, state = "saved") {
    const status = document.getElementById("saveStatus");
    if (!status) return;
    status.textContent = message;
    status.dataset.state = state;
  }

  function markDirtyState(isDirty) {
    adminHasUnsavedChanges = isDirty;
    setSaveStatus(
      isDirty ? "Onopgeslagen wijzigingen" : "Opgeslagen",
      isDirty ? "dirty" : "saved",
    );
  }

  // Wraps a DataStore.save() call with consistent status messaging and
  // error handling, so every mutation (add/remove/photo/form submit) does
  // the same thing on failure: keep the change locally, tell the user.
  async function persist(data) {
    setSaveStatus("Opslaan...", "saving");
    try {
      await DataStore.save(data);
      markDirtyState(false);
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
                            ? `<span class="document-static-title planning-saved-title">${escapeHtml(title)}</span>`
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
    renderAdminPanel();
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
  }

  const PHOTO_FILENAMES = {
    aboutHero: "over-ons",
    "branches.kapoenen": "kapoenenleiding",
    "branches.welpen": "welpenleiding",
    "branches.jongverkenners": "jongverkennersleiding",
    "branches.verkenners": "verkennersleiding",
    "branches.jins": "jinsleiding",
  };

  async function updatePhoto(data, key, file) {
    if (!file) {
      throw new Error("Geen foto geselecteerd.");
    }

    if (!file.type.startsWith("image/")) {
      throw new Error("Selecteer een afbeeldingsbestand.");
    }

    const filename = PHOTO_FILENAMES[key];

    if (!filename) {
      throw new Error(`Geen bestandsnaam ingesteld voor ${key}.`);
    }

    const formData = new FormData();

    formData.append("photo", file);
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

    /*
     * De server zet iedere afbeelding om naar:
     *
     * /uploads/kapoenenleiding.jpg?v=123456789
     *
     * De originele resolutie wordt behouden.
     */
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

  // Generic config for the three "flat list" editors (agenda / faq / secondhand).
  // `row: true` groups a field onto a shared line with the field(s) before it.
  // `default` is the fallback value used when a saved field is blank.
  const listEditorConfig = {
    agenda: {
      itemLabel: "Event",
      newItem: {
        day: "1",
        month: "JAN",
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
          default: "JAN",
          options: [
            "JAN",
            "FEB",
            "MAA",
            "APR",
            "MEI",
            "JUN",
            "JUL",
            "AUG",
            "SEP",
            "OKT",
            "NOV",
            "DEC",
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
                            ? `<img src="${escapeHtml(item.image)}" alt="Foto van ${escapeHtml(item.title || "agenda-item")}" loading="lazy">
                               <span class="admin-agenda-photo-actions">
                                 <span class="admin-agenda-photo-change">Nieuwe foto kiezen<input type="file" accept="${field.accept}" data-agenda-upload="${index}"></span>
                                 <button type="button" class="admin-agenda-photo-remove" data-agenda-photo-remove="${index}">Foto verwijderen</button>
                               </span>`
                            : `<span class="admin-agenda-photo-change">Foto toevoegen<input type="file" accept="${field.accept}" data-agenda-upload="${index}"></span>`
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
                                <strong>${escapeHtml(type === "agenda" ? `${item.day || ""} ${item.month || ""} · ${item.title || `Event ${index + 1}`}` : item.question || `Vraag ${index + 1}`)}</strong>
                            </button>

                            <button
                                type="button"
                                data-remove="${type}"
                                data-index="${index}"
                            >
                                Verwijderen
                            </button>
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
    items.forEach((item) => appendItem(item.name, item.phone));
  }

  function renderLeadershipEditor(items, containerId, type) {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.classList.add("admin-leadership-list");
    container.classList.toggle(
      "admin-group-leadership-list",
      type === "groupLeadership",
    );
    container.innerHTML = items
      .map(
        (item, index) => `
                <article class="admin-item leadership-card">
                    <div class="leadership-card-head">
                        <button type="button" class="leadership-remove" data-remove="${type}" data-index="${index}">Verwijderen</button>
                    </div>
                    <div class="leadership-fields">
                        <label>Naam<input type="text" data-field="leadership-name" data-type="${type}" data-index="${index}" value="${escapeHtml(item.name)}" placeholder="Naam van de leider"></label>
                        <label>Telefoonnummer<input type="tel" data-field="leadership-phone" data-type="${type}" data-index="${index}" value="${escapeHtml(item.phone)}" placeholder="Telefoonnummer"></label>
                    </div>
                </article>
            `,
      )
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
            <button type="button" class="button button-secondary" data-google-connect ${googleDriveSettings.oauthConfigured ? "disabled" : ""}>Google-account verbinden</button>
          </section>
        `;
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

  function renderAdminPanel() {
    const data = DataStore.get();

    qsa(".page-picker-tile").forEach((button) => {
      const isActive =
        button.dataset.pageOption === (data.activePage || "home");
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-pressed", String(isActive));
    });

    renderPageSpecificEditors(data);
  }

  async function addEntry(type) {
    const data = DataStore.get();

    // Eerst alle huidige formulierwaarden bewaren.
    readFormValues();

    if (type in listEditorConfig) {
      data[type].push(structuredClone(listEditorConfig[type].newItem));
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
      });
    }

    renderAdminPanel();
  }

  async function removeEntry(type, index) {
    const data = DataStore.get();

    // Eerst huidige formulierwaarden bewaren.
    readFormValues();

    let removedItem = null;

    if (type in listEditorConfig) {
      removedItem = data[type][index];
    } else if (type === "groupLeadership") {
      removedItem = data.groupLeadership[index];
    } else if (type.startsWith("branchLeadership:")) {
      removedItem = data.branchLeadership[type.split(":")[1]][index];
    }

    /*
     * Verwijder eventueel de bijhorende tweedehandsfoto
     * ook daadwerkelijk uit /uploads.
     */
    if (type === "secondhand" && removedItem?.image) {
      try {
        const filename = removedItem.image
          .split("/")
          .pop()
          ?.split("?")[0]
          ?.replace(/\.[^/.]+$/, "");

        if (filename) {
          const response = await fetch(
            `/api/uploads/photo/${encodeURIComponent(filename)}`,
            {
              method: "DELETE",
            },
          );

          if (!response.ok) {
            console.warn("Tweedehandsfoto kon niet verwijderd worden.");
          }
        }
      } catch (error) {
        console.warn("Foto verwijderen mislukt:", error);
      }
    }

    if (type in listEditorConfig) {
      data[type].splice(index, 1);
    } else if (type === "groupLeadership") {
      data.groupLeadership.splice(index, 1);
    } else if (type.startsWith("branchLeadership:")) {
      data.branchLeadership[type.split(":")[1]].splice(index, 1);
    }

    await persist(data);
    renderAdminPanel();
  }

  function readFormValues() {
    const data = DataStore.get();
    const activePageButton = qs(".page-picker-tile.is-active");
    data.activePage = activePageButton
      ? activePageButton.dataset.pageOption
      : "home";

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
    markDirtyState(false);
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
        }
      }
    });

    document.addEventListener("change", async (event) => {
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

      const agendaUpload = event.target.closest("[data-agenda-upload]");
      if (agendaUpload?.files[0]) {
        readFormValues();
        const data = DataStore.get();
        const index = Number(agendaUpload.dataset.agendaUpload);
        const file = agendaUpload.files[0];

        if (!file.type.startsWith("image/")) {
          setSaveStatus("Selecteer een afbeeldingsbestand.", "error");
          return;
        }

        if (!data.agenda[index]) return;

        try {
          setSaveStatus("Foto uploaden...", "saving");
          const filename = `agenda-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
          const formData = new FormData();
          formData.append("photo", file);
          formData.append("filename", filename);

          const response = await fetch("/api/uploads/photo", {
            method: "POST",
            body: formData,
          });
          const result = await response.json().catch(() => ({}));
          if (!response.ok || !result.path) {
            throw new Error(result.message || "Foto uploaden mislukt.");
          }

          data.agenda[index].image = result.path;
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
        setSaveStatus("Foto uploaden...", "saving");

        /*
         * Iedere tweedehandsfoto krijgt een unieke bestandsnaam.
         */
        const filename = `tweedehands-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;

        const formData = new FormData();

        formData.append("photo", file);
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

      const agendaPhotoRemove = event.target.closest(
        "[data-agenda-photo-remove]",
      );
      if (agendaPhotoRemove) {
        readFormValues();
        const data = DataStore.get();
        const index = Number(agendaPhotoRemove.dataset.agendaPhotoRemove);
        const imagePath = data.agenda[index]?.image || "";
        const filename = imagePath
          .split("/")
          .pop()
          ?.split("?")[0]
          ?.replace(/\.[^/.]+$/, "");

        if (!window.confirm("Wil je deze eventfoto verwijderen?")) return;

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

          data.agenda[index].image = "";
          await persist(data);
          renderAdminPanel();
        } catch (error) {
          console.error(error);
          setSaveStatus(error.message || "Foto verwijderen mislukt.", "error");
        }
        return;
      }

      const pageTile = event.target.closest(".page-picker-tile");
      if (pageTile) {
        const data = DataStore.get();
        const targetPage = pageTile.dataset.pageOption;
        const currentPage = data.activePage || "home";
        if (
          targetPage !== currentPage &&
          adminHasUnsavedChanges &&
          !window.confirm(
            "Er zijn onopgeslagen wijzigingen. Wil je toch naar een andere pagina gaan?",
          )
        ) {
          return;
        }
        if (targetPage !== currentPage && adminHasUnsavedChanges) {
          pendingPlanningUploads.clear();
          adminHasUnsavedChanges = false;
        }
        if (pageTile.dataset.pageOption === "settings") {
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
        data.activePage = targetPage;
        await persist(data);
        renderAdminPanel();
        return;
      }

      const addTarget = event.target.closest("[data-add]");
      if (addTarget) {
        markDirtyState(true);
        await addEntry(addTarget.dataset.add);
        return;
      }

      const removeTarget = event.target.closest("[data-remove]");
      if (removeTarget) {
        const removeType = removeTarget.dataset.remove;
        const confirmation = {
          agenda: "Wil je dit event echt verwijderen?",
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
          if (driveErrors.length) {
            setSaveStatus(
              `Maandplanning staat op de website, maar Google Drive gaf deze fout: ${driveErrors[0]}`,
              "error",
            );
          } else {
            PageRenderer.updatePageFromData();
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
                                  <span class="button-icon" aria-hidden="true">↓</span>
                                  <span>${escapeHtml(planningTitle)}</span>
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
                                        <span class="button-icon" aria-hidden="true">↓</span>
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
            return `
                <details class="agenda-item ${image ? "has-agenda-image" : ""}">
                  <summary class="agenda-summary">
                    <div class="agenda-date">
                      <strong>${escapeHtml(item.day)}</strong>
                      <span>${escapeHtml(item.month)}</span>
                    </div>
                    <div class="agenda-body">
                      <h3>${escapeHtml(item.title)}</h3>
                      <span class="agenda-expand">Meer info <span aria-hidden="true">+</span></span>
                    </div>
                  </summary>
                  <div class="agenda-details">
                    <div class="agenda-details-inner">
                      <p>${escapeHtml(item.text)}</p>
                      ${link && linkText ? `<a class="agenda-link" href="${escapeHtml(link)}" target="_blank" rel="noopener noreferrer">${escapeHtml(linkText)} <span aria-hidden="true">↗</span></a>` : ""}
                      ${image ? `<img src="${escapeHtml(image)}" alt="${escapeHtml(item.title)}">` : ""}
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
    initPageTransitions();
    setupFaqAccordion(document);
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
