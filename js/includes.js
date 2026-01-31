(() => {
  const HEADER_PLACEHOLDER_ID = "site-header-include";
  const HEADER_PARTIAL_PATH = "partials/site-header.html";

  function inferCurrentPage() {
    const last = (window.location.pathname || "").split("/").pop() || "";
    return last || "index.html";
  }

  function setActiveNav() {
    const nav = document.querySelector(".utility-nav");
    if (!nav) return;

    nav.querySelectorAll('a[aria-current="page"]').forEach((a) => {
      a.removeAttribute("aria-current");
    });

    const current = inferCurrentPage();
    const link = nav.querySelector(`a[href="${current}"]`) || (current === "" || current === "/" ? nav.querySelector('a[href="index.html"]') : null);
    link?.setAttribute("aria-current", "page");
  }

  async function loadSiteHeader() {
    const placeholder = document.getElementById(HEADER_PLACEHOLDER_ID);
    if (!placeholder) return;

    const res = await fetch(HEADER_PARTIAL_PATH, { cache: "no-cache" });
    if (!res.ok) {
      throw new Error(`Failed to fetch header: ${res.status} ${res.statusText}`);
    }

    const html = await res.text();
    placeholder.outerHTML = html;

    setActiveNav();
  }

  document.addEventListener("DOMContentLoaded", () => {
    loadSiteHeader().catch((err) => {
      console.error(err);
      const placeholder = document.getElementById(HEADER_PLACEHOLDER_ID);
      if (placeholder) {
        placeholder.textContent = "ヘッダの読み込みに失敗しました（ローカルファイル直開きだと動かない場合があります）。";
      }
    });
  });
})();
