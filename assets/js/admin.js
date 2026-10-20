(function () {
  "use strict";

  if (!document.body.classList.contains("admin-page")) return;

  const S = window.ScoutsSite;
  if (!S) {
    console.error("ScoutsSite ontbreekt; laad script.js voor admin.js.");
    return;
  }

  const {
    escapeHtml,
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
  } = S;

  async function readResponseJson(response) {
    try {
      return await response.json();
    } catch {
      return {};
    }
  }

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
  let orphanUploadNames = [];
  let orphanScanResetTimer = 0;
  let settingsReturnPage = "home";

  function formatBytes(bytes) {
    const value = Number(bytes) || 0;
    if (value < 1024) return `${value} B`;
    if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
    return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  }

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
      if (error?.code === "version_conflict") {
        setSaveStatus(
          error.message ||
            "Conflict: herlaad de pagina en probeer opnieuw",
          "error",
        );
        return;
      }
      setSaveStatus(
        error?.message || "Opslaan mislukt — probeer opnieuw",
        "error",
      );
    }
  }

  const photoEditorConfig = [
    { key: "aboutHero", label: "Over ons" },
    { key: "branches.kapoenen", label: "Kapoenen" },
    { key: "branches.welpen", label: "Welpen" },
    { key: "branches.jongverkenners", label: "Jongverkenners" },
    { key: "branches.verkenners", label: "Verkenners" },
    { key: "branches.jins", label: "Jins" },
  ];

  const BRANCH_LABELS = {
    kapoenen: "Kapoenen",
    welpen: "Welpen",
    jongverkenners: "Jongverkenners",
    verkenners: "Verkenners",
    jins: "Jins",
  };

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
    const result = await readResponseJson(response);
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
                            <input class="document-title-input" type="text" data-letter-title-new="${branch}" placeholder="Naam brief" autocomplete="off">
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
    const result = await readResponseJson(response);
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

    const result = await readResponseJson(response);

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
    "over-ons": [{ key: "intro", label: "Tekst", type: "textarea" }],
    inschrijven: [
      { key: "lidgeld", label: "Lidgeld (€)", type: "number" },
      { key: "rekeningnummer", label: "Rekeningnummer", type: "text" },
    ],
  };

  const listEditorConfig = {
    agenda: {
      itemLabel: "Activiteit",
      newItem: {
        day: "",
        month: "",
        title: "",
        text: "",
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
          default: "",
          min: 1,
          max: 31,
          inputmode: "numeric",
          placeholder: "bv. 25",
        },
        {
          key: "month",
          label: "Maand",
          tag: "select",
          row: true,
          default: "",
          placeholder: "Maand",
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
          default: "",
          placeholder: "Titel van de activiteit",
        },
        {
          key: "text",
          label: "Tekst",
          tag: "textarea",
          default: "",
          placeholder: "Beschrijving",
        },
        {
          key: "linkText",
          label: "Linktekst",
          tag: "input",
          type: "text",
          default: "",
          placeholder: "bv. Inschrijven",
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
      newItem: { question: "", answer: "" },
      fields: [
        {
          key: "question",
          label: "Vraag",
          tag: "input",
          type: "text",
          default: "",
          placeholder: "Stel hier je vraag",
        },
        {
          key: "answer",
          label: "Antwoord",
          tag: "textarea",
          default: "",
          placeholder: "Antwoord",
        },
      ],
    },
    news: {
      itemLabel: "Nieuws",
      newItem: {
        id: "",
        title: "Nieuw bericht",
        date: "",
        summary: "",
        text: "",
        image: "",
        images: [],
        link: "",
        linkText: "",
        published: false,
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
          label: "Datum",
          tag: "input",
          type: "text",
          default: "",
          placeholder: "bv. Maart 2026",
        },
        {
          key: "summary",
          label: "Korte intro",
          tag: "textarea",
          default: "",
          placeholder: "Zichtbaar vóór het openklappen",
        },
        {
          key: "text",
          label: "Tekst",
          tag: "textarea",
          default: "",
          placeholder: "Volledige berichttekst",
        },
        {
          key: "linkText",
          label: "Linktekst",
          tag: "input",
          type: "text",
          default: "",
          placeholder: "bv. Meer info",
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
        `<p class="admin-news-empty">Nog geen berichten.</p>`;
      return;
    }

    const homeIndexes = new Set(
      getPublishedNewsItems(items)
        .slice(0, NEWS_HOME_LIMIT)
        .map((item) => items.indexOf(item)),
    );

    container.innerHTML = items
      .map((item, index) => {
        const images = getNewsImages(item);
        const isPublished = item.published !== false;
        const isHome = isPublished && homeIndexes.has(index);
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
            ? `<p class="admin-news-photos-limit">Maximum ${NEWS_IMAGES_MAX} foto's.</p>`
            : `<label class="admin-news-photo-add">
                        <span class="admin-news-photo-plus" aria-hidden="true"></span>
                        <strong>Foto toevoegen</strong>
                        <small>Max. ${NEWS_IMAGES_MAX}</small>
                        <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple data-news-image-upload data-index="${index}">
                      </label>`;
        return `
          <article class="admin-item admin-collapsible-item admin-news-item is-collapsed${isHome ? " is-home-news" : ""}${isPublished ? "" : " is-draft-news"}">
            <div class="admin-item-head">
              <button type="button" class="admin-collapse-toggle" data-collapse-toggle aria-expanded="false">
                <span class="admin-collapse-chevron" aria-hidden="true"></span>
                <span class="admin-news-summary">
                  <strong>${escapeHtml(title)}</strong>
                  <span class="admin-news-summary-date"${item.date ? "" : " hidden"}>${escapeHtml(item.date || "")}</span>
                  <span class="admin-news-status">${isPublished ? "Zichtbaar" : "Concept"}</span>
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
                    <label class="admin-news-publish${isPublished ? " is-on" : ""}">
                      <span class="admin-news-publish-copy">Zichtbaar op website</span>
                      <span class="admin-news-publish-switch" aria-hidden="true"></span>
                      <input type="checkbox" data-field="news-published" data-index="${index}"${isPublished ? " checked" : ""}>
                    </label>
                    <div class="admin-news-field-row">
                      <label>
                        <span>Titel</span>
                        <input type="text" data-field="news-title" data-index="${index}" value="${escapeHtml(item.title || "")}" placeholder="Titel">
                      </label>
                      <label>
                        <span>Datum</span>
                        <input type="text" data-field="news-date" data-index="${index}" value="${escapeHtml(item.date || "")}" placeholder="bv. Maart 2026">
                      </label>
                    </div>
                    <label>
                      <span>Korte intro</span>
                      <textarea data-field="news-summary" data-index="${index}" rows="2" placeholder="Zichtbaar vóór het openklappen">${escapeHtml(item.summary || "")}</textarea>
                    </label>
                    <label>
                      <span>Tekst</span>
                      <textarea data-field="news-text" data-index="${index}" rows="4" placeholder="Volledige berichttekst">${escapeHtml(item.text || "")}</textarea>
                    </label>
                    <div class="admin-news-field-row">
                      <label>
                        <span>Linktekst</span>
                        <input type="text" data-field="news-linkText" data-index="${index}" value="${escapeHtml(item.linkText || "")}" placeholder="bv. Meer info">
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
                                                <span class="admin-secondhand-photo-plus"></span>
                                                <strong>Foto toevoegen</strong>

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
                                 <span class="admin-agenda-photo-change">Vervangen<input type="file" accept="${field.accept}" data-list-image-upload="${type}" data-index="${index}"></span>
                                 <button type="button" class="admin-agenda-photo-remove" data-list-image-remove="${type}" data-index="${index}">Verwijderen</button>
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
                        <textarea ${attrs}${field.placeholder ? ` placeholder="${escapeHtml(field.placeholder)}"` : ""}>${value}</textarea>
                    </label>
                `;
      }

      if (field.tag === "select") {
        const current = item[field.key] || "";
        return `
                    <label>
                        ${field.label}
                        <select ${attrs}>
                            <option value="" ${current ? "" : "selected"}${field.placeholder ? "" : " disabled"}>${escapeHtml(field.placeholder || "Kies…")}</option>
                            ${field.options
                              .map(
                                (option) => `
                                        <option value="${escapeHtml(option)}" ${current === option ? "selected" : ""}>
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
                                    ? (() => {
                                        const when = [item.day, item.month]
                                          .filter(Boolean)
                                          .join(" ");
                                        const title =
                                          item.title || `Activiteit ${index + 1}`;
                                        return when ? `${when} · ${title}` : title;
                                      })()
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

        let value = input.value.trim();
        if (value === "" && field.default !== undefined && field.default !== "") {
          value = field.default;
        }
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
                        <label><span>Naam</span><input type="text" data-field="leadership-name" data-type="${type}" data-index="${index}" value="${escapeHtml(item.name)}" placeholder="Naam"></label>
                        <label><span>Telefoon</span><input type="tel" data-field="leadership-phone" data-type="${type}" data-index="${index}" value="${escapeHtml(item.phone)}" placeholder="04xx xx xx xx"></label>
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
                                                <span>Vervangen</span>
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
                                            <div class="admin-photo-empty-icon"></div>
                                            <strong>Foto toevoegen</strong>

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
                                                aria-label="Foto verwijderen"
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
      const driveConnected = Boolean(googleDriveSettings.oauthConfigured);
      const driveEmail =
        typeof googleDriveSettings.oauthEmail === "string"
          ? googleDriveSettings.oauthEmail.trim()
          : "";
      container.innerHTML = `
          <div class="admin-settings">
            <header class="admin-settings-intro">
              <button type="button" class="admin-settings-back" data-page-option="${escapeHtml(settingsReturnPage || "home")}">
                <span class="icon-arrow-left" aria-hidden="true"></span>
                Terug naar beheer
              </button>
            </header>

            <div class="admin-settings-layout">
              <section class="admin-card compact-card admin-settings-card admin-settings-card--drive">
                <div class="admin-card-head">
                  <h2>Google Drive</h2>
                  <span class="admin-settings-status ${driveConnected ? "is-ok" : "is-off"}">
                    ${driveConnected ? "Verbonden" : "Niet verbonden"}
                  </span>
                </div>
                ${
                  driveEmail
                    ? `<p class="form-help">${escapeHtml(driveEmail)}</p>`
                    : ""
                }
                <div class="admin-fields">
                  <label>
                    Map-ID
                    <input type="text" data-drive-setting="folderId" value="${escapeHtml(googleDriveSettings.folderId)}" placeholder="Drive-map ID" autocomplete="off">
                  </label>
                  <div class="admin-settings-file">
                    <span class="admin-settings-file-heading">OAuth-client</span>
                    <label class="document-upload-button document-upload-button--wide admin-settings-file-pick">
                      <span data-drive-oauth-label>JSON kiezen</span>
                      <input type="file" data-drive-oauth-client accept="application/json,.json">
                    </label>
                  </div>
                </div>
                <div class="admin-actions">
                  <button type="button" class="button button-secondary" data-google-connect>${driveConnected ? "Opnieuw verbinden" : "Verbinden"}</button>
                  <button type="button" class="button button-ghost-dark" data-google-oauth-reset ${driveConnected ? "" : "hidden"}>Resetten</button>
                </div>
              </section>

              <div class="admin-settings-side">
                <section class="admin-card compact-card admin-settings-card">
                  <div class="admin-card-head"><h2>Backup</h2></div>
                  <div class="admin-actions">
                    <button type="button" class="button button-secondary" data-download-backup>Downloaden</button>
                    <label class="button button-ghost-dark admin-restore-button">
                      Terugzetten
                      <input type="file" id="restoreBackup" accept="application/json,.json" hidden>
                    </label>
                  </div>
                </section>

                <section class="admin-card compact-card admin-settings-card admin-settings-card--orphans">
                  <div class="admin-card-head"><h2>Uploads opruimen</h2></div>
                  <div class="admin-actions admin-orphan-actions">
                    <button type="button" class="button button-secondary admin-orphan-scan" data-orphan-scan>
                      <span class="admin-orphan-scan-icon" aria-hidden="true"></span>
                      <span data-orphan-scan-label>Zoeken</span>
                    </button>
                    <button type="button" class="button button-ghost-dark" data-orphan-purge hidden>Verwijderen</button>
                  </div>
                  <p class="form-help" data-orphan-help></p>
                  <ul class="admin-orphan-list" data-orphan-list hidden></ul>
                </section>
              </div>
            </div>
          </div>
        `;
      return;
    }

    if (activePage === "news") {
      if (!Array.isArray(data.news)) data.news = [];
      container.innerHTML = `
                <section class="admin-card compact-card admin-news-card">
                    <div class="admin-card-head"><h2>Nieuws</h2><button type="button" class="mini-button" data-add="news">+ Nieuws</button></div>
                    <p class="form-help">De eerste 3 zichtbare berichten staan op de homepage.</p>
                    <div id="newsEditor" class="admin-list admin-news-list"></div>
                </section>
            `;
      renderNewsEditor(data.news);
      return;
    }

    if (activePage === "home") {
      container.innerHTML = `
                <section class="admin-card compact-card">
                    <div class="admin-card-head"><h2>Planning</h2><button type="button" class="mini-button" data-add="agenda">+ Activiteit</button></div>
                    <div id="agendaEditor" class="admin-list"></div>
                </section>
                <section class="admin-card compact-card">
                    <div class="admin-card-head"><h2>Veelgestelde vragen</h2><button type="button" class="mini-button" data-add="faq">+ Vraag</button></div>
                    <div id="faqEditor" class="admin-list"></div>
                </section>
                <section class="admin-card compact-card">
                    <div class="admin-card-head">
                        <h2>Contact</h2>
                    </div>

                    <div class="admin-fields">
                        <label>
                            E-mail
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
                    <div class="admin-card-head"><h2>Foto's</h2></div>
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
                    <div class="admin-card-head"><h2>Tweedehands</h2><button type="button" class="mini-button" data-add="secondhand">+ Item</button></div>
                    <div id="secondhandEditor" class="admin-list"></div>
                </section>
            `;
      renderListEditor("secondhandEditor", data.secondhand, "secondhand");
      return;
    }

    if (activePage in data.branchLeadership) {
      container.innerHTML = `
                <section class="admin-card compact-card">
                    <div class="admin-card-head"><h2>Leiding ${BRANCH_LABELS[activePage] || activePage}</h2><button type="button" class="mini-button" data-add="branchLeadership:${activePage}">+ Leider</button></div>
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
    const isSettings = activePage === "settings";

    document.body.classList.toggle("admin-is-settings", isSettings);
    qs(".page-picker")?.toggleAttribute("hidden", isSettings);
    qs(".admin-utilities")?.toggleAttribute("hidden", isSettings);

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
      qsa("[data-field='news-published']").forEach((input) => {
        const index = Number(input.dataset.index);
        if (data.news[index]) data.news[index].published = input.checked;
      });
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
              ?.value.trim() || `Activiteit ${itemIndex + 1}`;
          const when = [day, month].filter(Boolean).join(" ");
          summary.textContent = when ? `${when} · ${title}` : title;
        } else if (summary && type === "faq") {
          const question =
            collapsibleItem.querySelector("[data-field='faq-question']")
              ?.value.trim() || `Vraag ${itemIndex + 1}`;
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
      const newsPublishToggle = event.target.closest(
        "[data-field='news-published']",
      );
      if (newsPublishToggle) {
        const index = Number(newsPublishToggle.dataset.index);
        const data = DataStore.get();
        if (data.news?.[index]) {
          data.news[index].published = newsPublishToggle.checked;
        }
        markDirtyState(true);
        const article = newsPublishToggle.closest(".admin-news-item");
        const publishLabel = newsPublishToggle.closest(".admin-news-publish");
        const status = article?.querySelector(".admin-news-status");
        if (status) {
          status.textContent = newsPublishToggle.checked
            ? "Zichtbaar"
            : "Concept";
        }
        publishLabel?.classList.toggle("is-on", newsPublishToggle.checked);
        article?.classList.toggle("is-draft-news", !newsPublishToggle.checked);
        const publishedIndexes = getPublishedNewsItems(data.news || [])
          .slice(0, NEWS_HOME_LIMIT)
          .map((item) => (data.news || []).indexOf(item));
        const homeSet = new Set(publishedIndexes);
        qsa(".admin-news-item").forEach((item, itemIndex) => {
          item.classList.toggle("is-home-news", homeSet.has(itemIndex));
        });
        return;
      }

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

      const oauthClientInput = event.target.closest("[data-drive-oauth-client]");
      if (oauthClientInput) {
        const file = oauthClientInput.files?.[0];
        const pick = oauthClientInput.closest(".admin-settings-file-pick");
        const label = pick?.querySelector("[data-drive-oauth-label]");
        if (file) {
          pick?.classList.add("is-selected");
          if (label) label.textContent = file.name;
        } else {
          pick?.classList.remove("is-selected");
          if (label) label.textContent = "JSON kiezen";
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
            const result = await readResponseJson(response);
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
          const result = await readResponseJson(response);
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

        const result = await readResponseJson(response);

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
          const result = await readResponseJson(response);
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
        if (!window.confirm("Google-koppeling resetten? Daarna opnieuw verbinden.")) {
          return;
        }
        try {
          const response = await fetch("/api/google-drive/oauth-reset", {
            method: "POST",
          });
          const result = await readResponseJson(response);
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
        if (!window.confirm("Maandplanning verwijderen?")) {
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
        if (!window.confirm("Brief verwijderen?")) return;

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

              const result = await readResponseJson(response);

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

        if (!window.confirm("Foto verwijderen?")) return;

        try {
          if (filename && imagePath.startsWith("/uploads/")) {
            const response = await fetch(
              `/api/uploads/photo/${encodeURIComponent(filename)}`,
              { method: "DELETE" },
            );
            if (!response.ok) {
              const result = await readResponseJson(response);
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

        if (!window.confirm("Foto verwijderen?")) return;

        try {
          if (filename && imagePath.startsWith("/uploads/")) {
            const response = await fetch(
              `/api/uploads/photo/${encodeURIComponent(filename)}`,
              { method: "DELETE" },
            );
            if (!response.ok) {
              const result = await readResponseJson(response);
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
            "Onopgeslagen wijzigingen gaan verloren. Toch verdergaan?",
          );
          if (!leave) return;
        }

        if (targetPage === "settings") {
          const password = window.prompt("Wachtwoord voor instellingen:");
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
            const result = await readResponseJson(unlockResponse);
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
          if (currentPage && currentPage !== "settings") {
            settingsReturnPage = currentPage;
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
          agenda: "Deze activiteit verwijderen?",
          news: "Dit bericht verwijderen?",
          faq: "Deze vraag verwijderen?",
          secondhand: "Dit item verwijderen?",
          groupLeadership: "Deze groepsleider verwijderen?",
        };
        const message = removeType.startsWith("branchLeadership:")
          ? "Deze leider verwijderen?"
          : confirmation[removeType] || "Dit item verwijderen?";
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
            "Vul een linktekst in bij elke activiteit met een link.",
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
              const result = await readResponseJson(oauthResponse);
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
            const result = await readResponseJson(response);
            setSaveStatus(
              result.message || "Instellingen opslaan mislukt",
              "error",
            );
            return;
          }
          googleDriveSettings.folderId = folderId;
          markDirtyState(false);
          setSaveStatus("Opgeslagen", "saved");
          flashSaveButton();
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

    document.addEventListener("click", async (event) => {
      const downloadBackup = event.target.closest(
        "#downloadBackup, [data-download-backup]",
      );
      if (downloadBackup) {
        try {
          const response = await fetch("/api/site-data", { cache: "no-store" });
          if (!response.ok) {
            throw new Error("Backup downloaden mislukt");
          }
          const version = response.headers.get("X-Scouts-Data-Version");
          if (version) DataStore.setVersion(version);
          const payload = await response.text();
          const stamp = new Date().toISOString().slice(0, 10);
          const blob = new Blob([payload], { type: "application/json" });
          const url = URL.createObjectURL(blob);
          const link = document.createElement("a");
          link.href = url;
          link.download = `scouts-site-data-${stamp}.json`;
          document.body.append(link);
          link.click();
          link.remove();
          URL.revokeObjectURL(url);
          setSaveStatus("Backup gedownload", "saved");
        } catch (error) {
          console.error(error);
          setSaveStatus(error.message || "Backup downloaden mislukt", "error");
        }
        return;
      }

      const scanButton = event.target.closest("[data-orphan-scan]");
      if (scanButton) {
        if (scanButton.classList.contains("is-scanning")) return;

        const scanLabel = scanButton.querySelector("[data-orphan-scan-label]");
        const resetScanButton = () => {
          window.clearTimeout(orphanScanResetTimer);
          orphanScanResetTimer = 0;
          scanButton.classList.remove(
            "is-clean",
            "is-clean-pop",
            "is-clean-out",
            "is-scanning",
          );
          if (scanLabel) scanLabel.textContent = "Zoeken";
        };

        try {
          resetScanButton();
          scanButton.classList.add("is-scanning");
          if (scanLabel) scanLabel.textContent = "Zoeken...";
          setSaveStatus("Uploads zoeken...", "saving");

          const response = await fetch("/api/uploads/orphans", {
            cache: "no-store",
          });
          const result = await readResponseJson(response);
          if (!response.ok) {
            throw new Error(result.message || "Zoeken mislukt");
          }

          orphanUploadNames = (result.orphans || []).map((item) => item.name);
          const help = qs("[data-orphan-help]");
          const list = qs("[data-orphan-list]");
          const purgeButton = qs("[data-orphan-purge]");
          scanButton.classList.remove("is-scanning");

          if (!orphanUploadNames.length) {
            if (help) help.textContent = "";
            if (list) {
              list.hidden = true;
              list.innerHTML = "";
            }
            purgeButton?.setAttribute("hidden", "");
            scanButton.classList.add("is-clean");
            if (scanLabel) scanLabel.textContent = "Alles in gebruik";
            scanButton.classList.remove("is-clean-pop");
            void scanButton.offsetWidth;
            scanButton.classList.add("is-clean-pop");
            setSaveStatus("Alles in gebruik", "saved");

            orphanScanResetTimer = window.setTimeout(() => {
              scanButton.classList.add("is-clean-out");
              orphanScanResetTimer = window.setTimeout(() => {
                resetScanButton();
              }, 320);
            }, 2400);
            return;
          }

          resetScanButton();
          if (help) {
            help.textContent = `${result.count} ongebruikte bestand${result.count === 1 ? "" : "en"} (${formatBytes(result.totalBytes)})`;
          }
          if (list) {
            list.hidden = false;
            list.innerHTML = (result.orphans || [])
              .map(
                (item) =>
                  `<li>
                    <label class="admin-orphan-item">
                      <input type="checkbox" data-orphan-name="${escapeHtml(item.name)}" checked>
                      <span class="admin-orphan-meta">
                        <code>${escapeHtml(item.name)}</code>
                        <span>${escapeHtml(formatBytes(item.size))}</span>
                      </span>
                    </label>
                  </li>`,
              )
              .join("");
          }
          purgeButton?.removeAttribute("hidden");
          setSaveStatus("Zoeken klaar", "saved");
        } catch (error) {
          console.error(error);
          resetScanButton();
          setSaveStatus(error.message || "Zoeken mislukt", "error");
        }
        return;
      }

      const purgeButton = event.target.closest("[data-orphan-purge]");
      if (purgeButton) {
        const selected = qsa("[data-orphan-name]:checked")
          .map((input) => input.getAttribute("data-orphan-name") || "")
          .filter(Boolean);
        if (!selected.length) {
          setSaveStatus("Selecteer minstens één bestand", "error");
          return;
        }
        if (
          !window.confirm(
            `${selected.length} bestand${selected.length === 1 ? "" : "en"} definitief van de server verwijderen?\n\nDit kan niet ongedaan gemaakt worden.`,
          )
        ) {
          return;
        }
        try {
          setSaveStatus("Uploads verwijderen...", "saving");
          const response = await fetch("/api/uploads/orphans/purge", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ names: selected }),
          });
          const result = await readResponseJson(response);
          if (!response.ok) {
            throw new Error(result.message || "Verwijderen mislukt");
          }
          orphanUploadNames = [];
          const help = qs("[data-orphan-help]");
          const list = qs("[data-orphan-list]");
          if (help) {
            help.textContent =
              "Geselecteerde bestanden zijn verwijderd. Zoek opnieuw als je nog wilt opruimen.";
          }
          if (list) {
            list.hidden = true;
            list.innerHTML = "";
          }
          purgeButton.setAttribute("hidden", "");
          setSaveStatus(
            `${result.deleted || 0} bestand${result.deleted === 1 ? "" : "en"} verwijderd`,
            "saved",
          );
        } catch (error) {
          console.error(error);
          setSaveStatus(error.message || "Verwijderen mislukt", "error");
        }
      }
    });

    document.addEventListener("change", async (event) => {
      const input = event.target.closest("#restoreBackup");
      if (!input) return;

      const file = input.files?.[0];
      input.value = "";
      if (!file) return;

      if (
        !window.confirm(
          "Huidige sitegegevens vervangen door deze backup? Dit kan niet ongedaan gemaakt worden.",
        )
      ) {
        return;
      }

      try {
        setSaveStatus("Backup terugzetten...", "saving");
        const text = await file.text();
        let data;
        try {
          data = JSON.parse(text);
        } catch {
          throw new Error("Ongeldig JSON-bestand.");
        }
        if (!data || typeof data !== "object" || Array.isArray(data)) {
          throw new Error("Backup bevat geen geldige sitegegevens.");
        }

        const response = await fetch("/api/site-data/restore", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });
        const result = await readResponseJson(response);
        if (!response.ok) {
          throw new Error(result.message || "Backup terugzetten mislukt");
        }

        if (result.version) DataStore.setVersion(result.version);
        await DataStore.load({ force: true });
        pendingPlanningUploads.clear();
        pendingUploadDeletes.length = 0;
        markDirtyState(false, { announce: false });
        const fresh = DataStore.get();
        fresh.activePage = "settings";
        renderAdminPanel();
        PageRenderer.updatePageFromData();
        setSaveStatus("Backup teruggezet", "saved");
      } catch (error) {
        console.error(error);
        setSaveStatus(error.message || "Backup terugzetten mislukt", "error");
      }
    });

    window.addEventListener("beforeunload", (event) => {
      if (!adminHasUnsavedChanges) return;
      event.preventDefault();
      event.returnValue = "";
    });
  }

  initAdminPanel().catch((error) => {
    console.error("Kon adminpaneel niet laden", error);
  });
})();

