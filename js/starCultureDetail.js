(() => {
  const ERROR_MESSAGE = "データの読み込みに失敗しました";

  const els = {};

  function getElement(id) {
    return document.getElementById(id);
  }

  function formatText(value) {
    const text = String(value ?? "").trim();
    return text || "-";
  }

  function formatNumber(value) {
    const num = Number(value);
    if (!Number.isFinite(num)) return "-";
    return new Intl.NumberFormat("ja-JP", {
      maximumFractionDigits: 6,
    }).format(num);
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

  function appendBasicRow(label, value) {
    const tr = document.createElement("tr");
    const th = document.createElement("th");
    const td = document.createElement("td");

    th.scope = "row";
    th.textContent = label;
    td.textContent = value;

    tr.appendChild(th);
    tr.appendChild(td);
    els.basic.appendChild(tr);
  }

  function flattenLineItem(item, out = []) {
    if (Array.isArray(item)) {
      for (const child of item) flattenLineItem(child, out);
      return out;
    }

    const text = String(item ?? "").trim();
    if (text) out.push(text);
    return out;
  }

  function getLineItems(lines) {
    return Array.isArray(lines) ? lines : [];
  }

  function collectUsedStarKeys(lines) {
    const seen = new Set();
    const keys = [];

    for (const item of getLineItems(lines)) {
      for (const key of flattenLineItem(item)) {
        if (seen.has(key)) continue;
        seen.add(key);
        keys.push(key);
      }
    }

    return keys;
  }

  function renderBasic(item) {
    els.basic.textContent = "";
    appendBasicRow("星文化キー", formatText(item?.key));
    appendBasicRow("名称", formatText(item?.name));
    appendBasicRow("意味", formatText(item?.description));
    appendBasicRow("RA", formatNumber(item?.ra));
    appendBasicRow("Dec", formatNumber(item?.dec));
    appendBasicRow("地域 aynu", formatAynu(item?.aynu));
  }

  function renderLines(lines) {
    const lineItems = getLineItems(lines);
    els.lines.textContent = "";

    const fragment = document.createDocumentFragment();
    lineItems.forEach((item, index) => {
      const tr = document.createElement("tr");
      const numberCell = document.createElement("td");
      const starsCell = document.createElement("td");
      const starKeys = flattenLineItem(item);

      numberCell.textContent = String(index + 1);
      starsCell.className = "star-culture-code-cell";
      starsCell.textContent = starKeys.length ? starKeys.join(" -> ") : "-";

      tr.appendChild(numberCell);
      tr.appendChild(starsCell);
      fragment.appendChild(tr);
    });

    els.lines.appendChild(fragment);
    setHidden(els.linesWrap, lineItems.length === 0);
    setHidden(els.linesEmpty, lineItems.length !== 0);
  }

  function renderStars(lines, stars) {
    const starKeys = collectUsedStarKeys(lines);
    const starMap = stars && typeof stars === "object" ? stars : {};
    els.stars.textContent = "";

    const fragment = document.createDocumentFragment();
    for (const key of starKeys) {
      const tr = document.createElement("tr");
      const keyCell = document.createElement("td");
      const raCell = document.createElement("td");
      const decCell = document.createElement("td");
      const star = starMap[key] || {};

      keyCell.className = "star-culture-code-cell";
      keyCell.textContent = key;
      raCell.textContent = formatNumber(star.ra);
      decCell.textContent = formatNumber(star.dec);

      tr.appendChild(keyCell);
      tr.appendChild(raCell);
      tr.appendChild(decCell);
      fragment.appendChild(tr);
    }

    els.stars.appendChild(fragment);
    setHidden(els.starsWrap, starKeys.length === 0);
    setHidden(els.starsEmpty, starKeys.length !== 0);
  }

  function renderDetail(item, stars) {
    renderBasic(item);
    renderLines(item?.lines);
    renderStars(item?.lines, stars);

    const key = String(item?.key ?? "").trim();
    if (els.listLink && key) {
      els.listLink.href = `star-cultures.html?key=${encodeURIComponent(key)}`;
    }

    setHidden(els.detail, false);
  }

  function getRequestedKey() {
    const params = new URLSearchParams(window.location.search);
    return String(params.get("key") || "").trim();
  }

  async function loadDetail() {
    const key = getRequestedKey();
    setLoading(true);
    showStatus("");
    setHidden(els.detail, true);

    if (!key) {
      showStatus("星文化キーが指定されていません。");
      setLoading(false);
      return;
    }

    try {
      if (typeof loadAllAynuData !== "function") {
        throw new Error("loadAllAynuData is not available");
      }

      const data = await loadAllAynuData();
      const constellations = Array.isArray(data?.constellations) ? data.constellations : [];
      const item = constellations.find((entry) => String(entry?.key ?? "") === key);

      if (!item) {
        showStatus("該当する星文化情報が見つかりませんでした。");
        return;
      }

      renderDetail(item, data?.stars || {});
    } catch (err) {
      console.error(err);
      showStatus(ERROR_MESSAGE);
    } finally {
      setLoading(false);
    }
  }

  function init() {
    els.loading = getElement("star-culture-loading");
    els.status = getElement("star-culture-status");
    els.detail = getElement("star-culture-detail");
    els.basic = getElement("star-culture-basic");
    els.lines = getElement("star-culture-lines");
    els.linesWrap = getElement("star-culture-lines-wrap");
    els.linesEmpty = getElement("star-culture-lines-empty");
    els.stars = getElement("star-culture-stars");
    els.starsWrap = getElement("star-culture-stars-wrap");
    els.starsEmpty = getElement("star-culture-stars-empty");
    els.listLink = getElement("star-culture-detail-list-link");

    loadDetail();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
