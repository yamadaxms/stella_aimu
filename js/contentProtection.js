(() => {
  // --- コンテンツ保護（軽い抑止） ---
  // ※静的配信では「完全な抜き取り防止」は不可能です。
  //   ここでは UI 操作（右クリック/ドラッグ/選択/一部ショートカット）を抑止し、注意喚起します。

  // ページ全体に保護を適用（必要ならセレクタを絞る）
  const PROTECT_SELECTORS = ["body"];

  const isInProtectedArea = (target) => {
    // document / window / svg なども来るので安全側で判定
    if (!target) return false;
    if (target === document || target === window) return true;
    if (target === document.documentElement || target === document.body)
      return true;
    if (!target.closest) return false;
    return PROTECT_SELECTORS.some((sel) => !!target.closest(sel));
  };

  // UI 操作に必要な要素は巻き込まない（最低限）
  const isExemptElement = (target) => {
    if (!target || !target.closest) return false;
    return !!target.closest(
      "input, textarea, select, option, button, label, [contenteditable='true']",
    );
  };

  // alert() はUXが悪いので廃止し、簡易トーストで通知（連打防止あり）
  const toast = (() => {
    let el;
    let lastAt = 0;
    let timer;
    const ensure = () => {
      if (el) return el;
      el = document.createElement("div");
      el.id = "protect-toast";
      el.setAttribute("role", "status");
      el.setAttribute("aria-live", "polite");
      // インラインで最小限（CSSファイル改変不要）
      Object.assign(el.style, {
        position: "fixed",
        left: "50%",
        bottom: "16px",
        transform: "translateX(-50%)",
        maxWidth: "min(92vw, 720px)",
        background: "rgba(0,0,0,0.78)",
        color: "#fff",
        padding: "10px 12px",
        borderRadius: "10px",
        fontSize: "14px",
        lineHeight: "1.4",
        zIndex: "99999",
        boxShadow: "0 8px 22px rgba(0,0,0,0.35)",
        opacity: "0",
        pointerEvents: "none",
        transition: "opacity 120ms ease",
      });
      document.body.appendChild(el);
      return el;
    };

    return (message) => {
      const now = Date.now();
      // 連打防止（キー押しっぱなし/連続イベント対策）
      if (now - lastAt < 1200) return;
      lastAt = now;

      const node = ensure();
      node.textContent = message;
      node.style.opacity = "1";
      clearTimeout(timer);
      timer = setTimeout(() => {
        node.style.opacity = "0";
      }, 1600);
    };
  })();

  const preventWithNotice = (e, message) => {
    e.preventDefault();
    // 一部イベントでは stopPropagation も併用（右クリックメニュー等）
    if (typeof e.stopPropagation === "function") e.stopPropagation();
    if (message) toast(message);
  };

  // 右クリック（コンテキストメニュー）を抑止
  document.addEventListener(
    "contextmenu",
    function (e) {
      if (isExemptElement(e.target)) return;
      if (!isInProtectedArea(e.target)) return;
      preventWithNotice(
        e,
        "当サイト掲載コンテンツの複製・保存（スクリーンショット等を含む）は禁止されています。",
      );
    },
    true,
  );

  // ドラッグ開始を抑止
  document.addEventListener(
    "dragstart",
    function (e) {
      if (isExemptElement(e.target)) return;
      if (!isInProtectedArea(e.target)) return;
      preventWithNotice(e);
    },
    true,
  );

  // 選択開始を抑止（フォーム等は除外）
  document.addEventListener(
    "selectstart",
    function (e) {
      if (isExemptElement(e.target)) return;
      if (!isInProtectedArea(e.target)) return;
      preventWithNotice(e);
    },
    true,
  );

  // 主要ショートカット抑止（完全ではない）
  document.addEventListener(
    "keydown",
    function (e) {
      // 入力欄を巻き込まない（UX/アクセシビリティ配慮）
      const tag =
        e.target && e.target.tagName ? e.target.tagName.toUpperCase() : "";
      if (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        (e.target && e.target.isContentEditable)
      )
        return;

      const key = (e.key || "").toLowerCase();
      const isCtrlOrMeta = e.ctrlKey || e.metaKey; // Windows/Linux: Ctrl, macOS: Cmd
      const isOnProtected =
        isInProtectedArea(e.target) ||
        isInProtectedArea(document.activeElement);

      const isDevtools =
        e.key === "F12" ||
        (isCtrlOrMeta && e.shiftKey && (key === "i" || key === "j" || key === "c"));

      const isViewSource = isCtrlOrMeta && key === "u";
      const isSave = isCtrlOrMeta && key === "s";
      const isCopy = isCtrlOrMeta && key === "c";
      const isPrint = isCtrlOrMeta && key === "p";

      // PrintScreen（OS機能のため抑止できないケースが多い）
      if (e.key === "PrintScreen") {
        preventWithNotice(e, "画面コピーは禁止されています。");
        return;
      }

      // Devtools/ソース表示はページ全体で抑止（効果は限定的）
      if (isDevtools || isViewSource) {
        preventWithNotice(e, "この操作は禁止されています。");
        return;
      }

      // コピー/保存/印刷は抑止（保護領域が body の場合はページ全体が対象）
      if (isOnProtected && (isCopy || isSave || isPrint)) {
        preventWithNotice(e, "この操作は禁止されています。");
      }
    },
    true,
  );
})();

