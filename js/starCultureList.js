(() => {
  const ERROR_MESSAGE = "データの読み込みに失敗しました";

  const state = {
    constellations: [],
    query: "",
    region: "",
  };

  const els = {};

  function getElement(id) {
    return document.getElementById(id);
  }

  function normalizeText(value) {
    return String(value ?? "").trim().toLowerCase();
  }

  function formatText(value) {
    const text = String(value ?? "").trim();
    return text || "-";
  }

  function formatAynu(value) {
    if (!Array.isArray(value)) return "-";
    const codes = value.map((item) => String(item || "").trim()).filter(Boolean);
    return codes.length ? codes.join(" / ") : "-";
  }

  function setHidden(el, hidden) {
    if (el) el.hidden = hidden;
  }

  function setLoading(isLoading) {
    setHidden(els.loading, !isLoading);
  }

  function showStatus(message) {
    if (!els.status) return;
    els.status.textContent = message;
    els.status.hidden = !message;
  }

  function updateCount(count) {
    if (!els.resultCount) return;
    els.resultCount.textContent = `${count}件`;
  }

  function createCell(text, className) {
    const td = document.createElement("td");
    if (className) td.className = className;
    td.textContent = text;
    return td;
  }

  function createDetailCell(item) {
    const td = document.createElement("td");
    const key = String(item?.key ?? "").trim();

    if (!key) {
      td.textContent = "-";
      return td;
    }

    const link = document.createElement("a");
    link.className = "star-culture-action-link";
    link.href = `star-culture-detail.html?key=${encodeURIComponent(key)}`;
    link.textContent = "詳細";
    td.appendChild(link);
    return td;
  }

  function filterConstellations() {
    const query = normalizeText(state.query);
    const region = state.region;

    return state.constellations.filter((item) => {
      const matchesQuery =
        !query ||
        normalizeText(item?.name).includes(query) ||
        normalizeText(item?.description).includes(query) ||
        normalizeText(item?.key).includes(query);

      const aynu = Array.isArray(item?.aynu) ? item.aynu : [];
      const matchesRegion = !region || aynu.includes(region);

      return matchesQuery && matchesRegion;
    });
  }

  function renderRows(rows) {
    if (!els.results) return;
    els.results.textContent = "";

    const fragment = document.createDocumentFragment();
    for (const item of rows) {
      const tr = document.createElement("tr");
      tr.appendChild(createCell(formatText(item?.name), "star-culture-name-cell"));
      tr.appendChild(createCell(formatText(item?.description), "star-culture-description-cell"));
      tr.appendChild(createCell(formatAynu(item?.aynu), "star-culture-code-cell"));
      tr.appendChild(createCell(formatText(item?.key), "star-culture-code-cell"));
      tr.appendChild(createDetailCell(item));
      fragment.appendChild(tr);
    }

    els.results.appendChild(fragment);
  }

  function render() {
    const rows = filterConstellations();
    renderRows(rows);
    updateCount(rows.length);
    setHidden(els.tableWrap, rows.length === 0);
    setHidden(els.empty, rows.length !== 0);
  }

  function bindEvents() {
    els.query?.addEventListener("input", (event) => {
      state.query = event.target.value;
      render();
    });

    els.region?.addEventListener("change", (event) => {
      state.region = event.target.value;
      render();
    });

    els.reset?.addEventListener("click", () => {
      state.query = "";
      state.region = "";
      if (els.query) els.query.value = "";
      if (els.region) els.region.value = "";
      render();
      els.query?.focus();
    });
  }

  function applyInitialFiltersFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const query = params.get("key") || params.get("q") || "";
    const region = params.get("region") || "";

    state.query = query;
    state.region = /^aynu[1-5]$/.test(region) ? region : "";

    if (els.query) els.query.value = state.query;
    if (els.region) els.region.value = state.region;
  }

  async function loadData() {
    setLoading(true);
    showStatus("");
    setHidden(els.empty, true);
    setHidden(els.tableWrap, true);

    try {
      if (typeof loadAllAynuData !== "function") {
        throw new Error("loadAllAynuData is not available");
      }

      const data = await loadAllAynuData();
      state.constellations = Array.isArray(data?.constellations) ? data.constellations : [];
      render();
    } catch (err) {
      console.error(err);
      state.constellations = [];
      updateCount(0);
      showStatus(ERROR_MESSAGE);
      setHidden(els.empty, true);
      setHidden(els.tableWrap, true);
    } finally {
      setLoading(false);
    }
  }

  function init() {
    els.query = getElement("star-culture-query");
    els.region = getElement("star-culture-region");
    els.reset = getElement("star-culture-reset");
    els.results = getElement("star-culture-results");
    els.tableWrap = getElement("star-culture-table-wrap");
    els.empty = getElement("star-culture-empty");
    els.loading = getElement("star-culture-loading");
    els.status = getElement("star-culture-status");
    els.resultCount = getElement("star-culture-result-count");

    bindEvents();
    applyInitialFiltersFromUrl();
    loadData();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
