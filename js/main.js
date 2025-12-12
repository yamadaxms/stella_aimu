// ============================================================
// 外部依存
// ============================================================
// 本スクリプトは以下の外部ライブラリに依存します：
// - d3-celestial (https://github.com/ofrohn/d3-celestial)
// - d3.js (https://d3js.org/)
//
// 必要に応じて index.html でCDN等から読み込んでください。

// ============================================================
// 定数定義
// ============================================================
const AREA_DEFAULT = "area0";
const MSG_NO_AINU = "この地域に対応するアイヌ民族の星文化はありません。";
const CITY_SELECT_PLACEHOLDER = "現在地を選択してください";
const AINU_LABEL_COLOR_STAR= "#66ee66"; // 天体色
const AINU_LABEL_COLOR_CONST = "#ee66ee"; // 星座色
const AINU_LABEL_FONT = "bold 14px sans-serif";
const AINU_LABEL_TEXT_ALIGN = "center";

// areaキー→区分名の変換テーブル
const AREA_LABEL_MAP = {
  area0: "全域",
  area1: "区分Ⅰ",
  area2: "区分Ⅱ",
  area3: "区分Ⅲ",
  area4: "区分Ⅳ",
  area5: "区分Ⅴ",
};

// ============================================================
// アプリ状態管理オブジェクト
// ============================================================
const AppState = {
  AINU_DATA: null,
  CURRENT_AREA_KEY: null,
  CURRENT_REGION_AREA: null,
  CURRENT_CITY: null,
  AINU_GEOJSON: null,
};

// ============================================================
// スタイル設定（アイヌ民族星文化ライン用）
// ============================================================
// Celestial.js で描画するアイヌ民族星文化の線・塗りのスタイルを定義します。
const AINU_LINE_STYLE = {
  stroke: "#ee66ee",                  // 星座の線色
  fill: "rgba(240, 102, 240, 0.18)",  // 線で囲んだ領域の塗り色（半透明）
  width: 2,                           // 線幅
};

// ============================================================
// Celestial.js 設定
// ============================================================
// d3-celestial の描画設定。投影法・座標系・星座表示・UIなどの初期値をまとめて管理。
const CELESTIAL_CONFIG = {
  width: 0,                         // 0 ならコンテナ幅に合わせる
  projection: "aitoff",             // 全天用投影法
  transform: "equatorial",          // 座標系（赤道座標）
  center: null,                     // 中心座標（null で自動）
  orientationfixed: true,           // 地平座標への回転を固定
  geopos: null,                     // 地上位置（null で自動）
  follow: "zenith",                 // 画面中心を常に天頂に追従
  zoomlevel: null,                  // 初期ズーム（null で自動）
  zoomextend: 10,                   // ズーム範囲の上限
  adaptable: true,                  // コンテナサイズに自動追従
  interactive: true,                // ドラッグ・ズームなどの操作を有効化
  form: false,                      // 画面内にフォーム UI を表示しない
  controls: true,                   // 右上のコントロール UI を表示
  lang: "ja",                       // UI 表示言語
  culture: "iau",                   // 既定の星座
  container: "celestial-map",       // 描画先コンテナ ID

  datapath: "https://cdn.jsdelivr.net/npm/d3-celestial@0.7.35/data/", // 付属データの取得元

  stars: {
    show: true,                              // 星を表示
    limit: 6,                                // 視等級の上限（6 等級まで）
    colors: true,                            // 色を有効化
    style: { fill: "#ffffff", opacity: 1 },  // 星の塗りと透明度
    designation: false,                      // Bayer 記号などの表示
    propername: false,                       // 固有名の表示
    size: 7,                                 // 星の最大小サイズ
    exponent: -0.28,                         // 明るさ→サイズへの変換係数
    data: "stars.6.json",                    // 使用する星データファイル
  },

  dsos: { show: false },  // 星雲・銀河など Deep Sky Objects の表示

  constellations: {
    show: true,                                         // 星座情報を表示
    names: true,                                        // 星座名を表示
    desig: false,                                       // 星座略号を非表示
    lines: true,                                        // 星座線を表示
    linestyle: { stroke: "#555555", width: 1, opacity: 0.7 }, // 星座線のスタイル
    bounds: false,                                      // 星座境界線の表示
  },

  mw: {
    show: true,                          // 天の川の表示
    style: { fill: "#ffffff", opacity: 0.04 }, // 天の川の塗りスタイル
  },
};

// ============================================================
// アプリ初期化処理
// ============================================================
// ページロード時に必要なデータを取得し、UI・天球図を初期化します。
// データ取得失敗時はエラーメッセージを表示します。
document.addEventListener("DOMContentLoaded", initApp);

// 星図リセットボタンのイベント登録
window.addEventListener("DOMContentLoaded", () => {
  const btn = document.getElementById("reset-celestial-view");
  if (btn) {
    btn.addEventListener("click", () => {
      resetCelestialView();
    });
  }

  // 投影法プルダウンのイベント登録
  const projSelect = document.getElementById("projection-select");
  if (projSelect) {
    projSelect.addEventListener("change", (e) => {
      const val = e.target.value;
      if (val) {
        applyProjection(val);
      }
    });
  }

  // 88星座ON/OFFチェックボックスのイベント登録
  const constChk = document.getElementById("toggle-constellations");
  if (constChk) {
    constChk.addEventListener("change", (e) => {
      const show = e.target.checked;
      Celestial.apply({ constellations: { show: show, names: show, lines: show } });
    });
  }
});

async function initApp() {
  setLoadingMessage("SIMBADデータ検索中……");
  try {
    // 必要な JSON をまとめて取得し、以降の UI 更新に使う。
    AppState.AINU_DATA = await loadAllAinuData();

    // 市町村リストをプルダウンに並べる。
    setupCitySelect(AppState.AINU_DATA.cityMap);
    // 天球図を初期化し、独自レイヤーを登録。
    setupCelestial();
    // 初回描画前に現地時間へ合わせておくことで、ロード直後の追従アニメを抑える。
    setCelestialTimeToJST();
    Celestial.redraw();

    // 初期状態は市町村未選択のまま、全体マップ(area0)を表示
    updateAreaMapPreview(AREA_DEFAULT);
    updateRegionInfo();
  } catch (err) {
    console.error(err);
    alert("データの読み込みに失敗しました。");
  } finally {
    setLoadingMessage("");
  }
}

// ============================================================
// 市町村選択 UI の構築
// ============================================================
// city_map.json をもとにプルダウンリストを生成。
// 選択変更時は onCityChange で描画・情報を更新します。
function setupCitySelect(cityMap) {
  const select = document.getElementById("city-select");
  const cities = Object.keys(cityMap.cities);

  // 既存の option をクリアしてからプレースホルダーを追加。
  select.innerHTML = "";

  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = CITY_SELECT_PLACEHOLDER;
  select.appendChild(placeholder);

  // city_map.json に登録されている市町村名をすべて挿入。
  for (const city of cities) {
    const opt = document.createElement("option");
    opt.value = city;
    opt.textContent = city;
    select.appendChild(opt);
  }

  // 選択変更イベントでハンドラを振り分け。
  select.addEventListener("change", (e) => {
    const selected = e.target.value;
    if (selected) {
      onCityChange(selected);
    } else {
      resetSelection();
    }
  });
}

// ============================================================
// 市町村選択時の処理
// ============================================================
// 選択された市町村から予報区・文化地域を特定し、
// 地図プレビュー・星文化描画・情報表示を選択内容に合わせて更新します。
function onCityChange(cityName) {
  const cityInfo = AppState.AINU_DATA.cityMap.cities[cityName];
  if (!cityInfo) return;

  // 市町村名から予報区・文化地域キーを取得し、グローバル状態を更新。
  AppState.CURRENT_CITY = cityName;
  AppState.CURRENT_REGION_AREA = cityInfo.region;
  AppState.CURRENT_AREA_KEY = AppState.AINU_DATA.cityMap.regionToArea[cityInfo.region];

  // 地図プレビュー画像を選択地域に切り替え。
  updateAreaMapPreview(AppState.CURRENT_AREA_KEY);

  // 地域情報・星文化リスト・GeoJSONレイヤーを選択内容で更新。
  updateRegionInfo();
  updateAinuGeoJSON();
  updateAinuList();

  // 変更内容を反映するため天球図を再描画。
  Celestial.redraw();
}

// ============================================================
// 天球図の時刻を日本標準時(JST)に設定
// ============================================================
// ブラウザのローカルタイムからUTCを算出し、Celestial.jsに渡します。
function setCelestialTimeToJST() {
  // ブラウザのローカルタイムから UTC を導出し、Celestial に渡す。
  // Celestial は内部で経度を考慮してローカル時間表示を行う。
  const now = new Date();
  const utc = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  Celestial.date(utc);
}

// ============================================================
// 投影法の適用
// ============================================================
// d3-celestialの描画を作り直して投影法を変更する。
function applyProjection(projection) {
  // 現行設定をベースに投影法だけ差し替えて再描画
  const nextConfig = { ...CELESTIAL_CONFIG, projection };
  Celestial.display(nextConfig);

  // 既存の独自レイヤーを再バインド
  if (AppState.AINU_GEOJSON) {
    bindAinuFeatures();
  }

  setCelestialTimeToJST();
  Celestial.redraw();
}

// ============================================================
// 星図ビューのリセット
// ============================================================
// d3-celestialには「全部初期化」用のresetがないため、初期設定を再適用する。
function resetCelestialView() {
  // UI側も初期値に戻す
  const projSelect = document.getElementById("projection-select");
  if (projSelect) {
    projSelect.value = CELESTIAL_CONFIG.projection;
  }
  const constChk = document.getElementById("toggle-constellations");
  if (constChk) {
    constChk.checked = CELESTIAL_CONFIG.constellations.show;
  }

  // displayを再実行してズーム・パン状態も含めて描画を作り直す
  Celestial.display(CELESTIAL_CONFIG);

  // 既に選択中の独自レイヤーがあれば再バインド
  if (AppState.AINU_GEOJSON) {
    bindAinuFeatures();
  }

  setCelestialTimeToJST();
  Celestial.redraw();
}

// ============================================================
// 市町村未選択時のリセット処理
// ============================================================
// 選択状態・描画・UIを初期状態に戻します。
function resetSelection() {
  // 選択状態をリセットし、未選択に戻す。
  AppState.CURRENT_CITY = null;
  AppState.CURRENT_REGION_AREA = null;
  AppState.CURRENT_AREA_KEY = null;
  AppState.AINU_GEOJSON = null;

  // clear drawn features and reset UI to initial state
  Celestial.container?.selectAll(".ainu-constellation").remove();
  updateAreaMapPreview(AREA_DEFAULT);
  updateRegionInfo();
  updateAinuList();
  Celestial.redraw();
}

// ============================================================
// ローディング表示の切り替え
// ============================================================
// データ取得中や処理中にインジケータを表示・非表示します。
function setLoadingMessage(text) {
  const el = document.getElementById("loading-indicator");
  if (!el) return;
  if (text) {
    el.textContent = text;
    el.style.display = "block";
  } else {
    el.textContent = "";
    el.style.display = "none";
  }
}

// ============================================================
// 地域情報表示の更新
// ============================================================
// 選択状態に応じて右側の地域名・区分・文化地域を表示します。
// 未選択時はダミー文言を表示。
function updateRegionInfo() {
  const div = document.getElementById("region-info");
  if (!AppState.CURRENT_CITY) {
    div.innerHTML = [
//      '<div><strong>市町村：</strong>未選択</div>',     2025/12/11(Ver.0.1.0)：一時的に抑止
//      '<div><strong>地域区分：</strong>未選択</div>',   2025/12/11(Ver.0.1.0)：一時的に抑止
      '<div><strong>星文化地域：</strong>未選択</div>'
    ].join("");
    return;
  }
  // areaキーを区分名に変換して表示
  const areaLabel = AREA_LABEL_MAP[AppState.CURRENT_AREA_KEY] || AppState.CURRENT_AREA_KEY;
  div.innerHTML = [
//    `<div><strong>市町村：</strong>${AppState.CURRENT_CITY}</div>`,              2025/12/11(Ver.0.1.0)：一時的に抑止
//    `<div><strong>地域区分：</strong>${AppState.CURRENT_REGION_AREA}</div>`,     2025/12/11(Ver.0.1.0)：一時的に抑止
    `<div><strong>星文化地域：</strong>${areaLabel}</div>`
  ].join("");
}

// ============================================================
// アイヌ民族星文化リスト表示の更新
// ============================================================
// 選択地域に対応する星文化情報をリスト表示。
// GeoJSONデータがなければメッセージのみ表示します。
function updateAinuList() {
  const list = document.getElementById("ainu-list");
  list.innerHTML = "";

  if (!AppState.AINU_GEOJSON?.features?.length) {
    // 該当地域がなければメッセージだけ表示。
    list.innerHTML = `<li>${MSG_NO_AINU}</li>`;
    return;
  }

  // 各星文化をリストアイテムとして描画。
  for (const f of AppState.AINU_GEOJSON.features) {
    const li = document.createElement("li");
    li.innerHTML = `
      <div class="name">${f.properties.n}</div>
      <div class="desc">${f.properties.desc || ""}</div>
    `;
    list.appendChild(li);
  }
}

// ============================================================
// Celestial.js 初期化と独自レイヤー追加
// ============================================================
// 独自GeoJSONレイヤーを追加し、星座線・ラベル描画のコールバックを登録します。
function setupCelestial() {
  Celestial.add({
    type: "line",

    // GeoJSON が揃ったタイミングで path 要素を作成。
    callback: () => {
      if (!AppState.AINU_GEOJSON) return;
      bindAinuFeatures();
    },

    redraw: () => {
      const ctx = Celestial.context;

      // path 要素に紐づくデータを Canvas に描画。
      const sel = Celestial.container.selectAll(".ainu-constellation");
      sel.each(function (d) {
        Celestial.setStyle(AINU_LINE_STYLE);
        Celestial.map(d);
        ctx.fill();
        ctx.stroke();
      });

      // ラベル用に GeoJSON を再投影し、中心座標に文字を描画。
      if (!AppState.AINU_GEOJSON) return;
      const transformed = Celestial.getData(AppState.AINU_GEOJSON, CELESTIAL_CONFIG.transform);

      transformed.features.forEach(f => {
        const name = f.properties?.n;
        const loc = f.properties?.loc;
        if (!name || !loc) return;

        // 使用した星の数で色分け
        const numPoints = f.properties?.starCount ?? f.geometry.coordinates.length;
        ctx.fillStyle = numPoints === 1 ? AINU_LABEL_COLOR_STAR : AINU_LABEL_COLOR_CONST;
        ctx.font = AINU_LABEL_FONT;
        ctx.textAlign = AINU_LABEL_TEXT_ALIGN;

        const xy = Celestial.mapProjection(loc);
        if (!xy) return;

        ctx.fillText(name, xy[0], xy[1]);
      });
    }
  });

  // 設定を元に Celestial の描画を開始。
  Celestial.display(CELESTIAL_CONFIG);
}

// ============================================================
// GeoJSONデータのD3バインド
// ============================================================
// Celestial.jsの投影座標系に合わせてGeoJSONを変換し、path要素へデータバインドします。
function bindAinuFeatures() {
  if (!AppState.AINU_GEOJSON) return;

  // GeoJSON を現在の投影設定に合わせて変換。
  const transformed = Celestial.getData(AppState.AINU_GEOJSON, CELESTIAL_CONFIG.transform);

  // Feature ごとに path を紐づけ。id をキーに差分更新する。
  const sel = Celestial.container
    .selectAll(".ainu-constellation")
    .data(transformed.features, (d) => d.id);

  sel.exit().remove();
  sel.enter().append("path").attr("class", "ainu-constellation");
}

// ============================================================
// 選択地域に対応するGeoJSONデータの生成・更新
// ============================================================
// 現在の文化地域キーで星文化GeoJSONを再生成し、描画レイヤーを更新します。
function updateAinuGeoJSON() {
  if (!AppState.CURRENT_AREA_KEY) return;

  // 現在の文化地域キーで GeoJSON を再生成。
  AppState.AINU_GEOJSON = buildAinuGeoJSON(
    AppState.AINU_DATA.constellations,
    AppState.AINU_DATA.stars,
    AppState.CURRENT_AREA_KEY
  );

  // path 要素とデータの紐付けを更新。
  bindAinuFeatures();
}

// ============================================================
// 赤経・赤緯 → 経度・緯度変換
// ============================================================
// 赤経が180度を跨ぐ場合は負側に反転し、地図座標系に合わせます。
function raDecToLonLat(raDeg, decDeg) {
  return [raDeg > 180 ? raDeg - 360 : raDeg, decDeg];
}

// ============================================================
// アイヌ民族星文化データ → GeoJSON生成
// ============================================================
// 地域ごとの星文化定義から線分・ラベル位置を算出し、MultiLineString形式でGeoJSON化します。
function buildAinuGeoJSON(constellations, stars, areaKey) {
  const features = [];

  for (const c of constellations) {
    const name = c.names?.[areaKey];
    if (!name) continue;

    const desc = c.description?.[areaKey] || "";
    const lineSegments = [];
    const usedPoints = [];

    // `lines` の各要素を共通ロジックで処理
    for (const item of c.lines || []) {
      const indices = Array.isArray(item) ? item : [item];
      for (let i = 0; i < indices.length - 1; i++) {
        const s1 = stars[indices[i]];
        const s2 = stars[indices[i + 1]];
        if (!s1 || !s2) continue;
        const p1 = raDecToLonLat(s1.ra, s1.dec);
        const p2 = raDecToLonLat(s2.ra, s2.dec);
        lineSegments.push([p1, p2]);
        usedPoints.push(p1, p2);
      }
      // 単一点（配列長1）の場合は点線分で追加
      if (indices.length === 1) {
        const s = stars[indices[0]];
        if (!s) continue;
        const p = raDecToLonLat(s.ra, s.dec);
        lineSegments.push([p, p]);
        usedPoints.push(p);
      }
    }

    // 描く線分が一つもない場合はスキップ。
    if (!lineSegments.length) continue;

    // ラベル表示用の座標を決定。
    // namesPos（[RA, Dec]）が定義されていればそれを優先し、なければ重心を使う。
    let labelLon, labelLat;
    if (Array.isArray(c.namesPos) && c.namesPos.length === 2 &&
        typeof c.namesPos[0] === "number" && typeof c.namesPos[1] === "number") {
      // namesPosは赤経・赤緯なので、そのまま経度・緯度に変換
      [labelLon, labelLat] = raDecToLonLat(c.namesPos[0], c.namesPos[1]);
    } else {
      // 使用した点の平均値（重心）
      labelLon = usedPoints.reduce((a, p) => a + p[0], 0) / usedPoints.length;
      labelLat = usedPoints.reduce((a, p) => a + p[1], 0) / usedPoints.length;
    }

    // 使用した星のユニーク数を算出（重複座標は1点として扱う）
    const uniqueStarCount = new Set(usedPoints.map((p) => `${p[0]},${p[1]}`)).size;

    // `constellation_data.json` uses `key` as the identifier (not `code`), so use that to avoid duplicate/undefined IDs
    const featureId = c.key || c.code || name;

    features.push({
      type: "Feature",
      id: featureId,
      properties: { n: name, loc: [labelLon, labelLat], desc, starCount: uniqueStarCount },
      geometry: { type: "MultiLineString", coordinates: lineSegments },
    });
  }

  return { type: "FeatureCollection", features };
}

// ============================================================
// 地図エリアプレビュー画像の切り替え
// ============================================================
// 選択地域に応じて地図画像を表示・非表示します。
function updateAreaMapPreview(areaKey) {
  const img = document.getElementById("area-map-preview");
  if (!img) return;

  if (!areaKey) {
    img.style.display = "none";
    img.src = "";
    return;
  }

  img.src = `img/${areaKey}.png`;
  img.style.display = "block";
}
