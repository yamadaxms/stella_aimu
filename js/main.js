// ============================================================
// グローバル状態
// ============================================================
// アプリ全体で使用する主要な状態変数を定義します。
// これらは市町村選択や星座データの表示など、各種処理で参照・更新されます。
let AINU_DATA = null;             // アイヌ民族星文化・市町村データ全体
let CURRENT_AREA_KEY = null;      // 現在選択されている文化地域キー（"Area1" 〜 "Area5"）
let CURRENT_FORECAST_AREA = null; // 気象庁の天気予報発表区域（一次細分区域）（例: "石狩中部"）
let CURRENT_CITY = null;          // 現在選択されている市町村名
let AINU_GEOJSON = null;          // 現在の地域に対応したアイヌ民族星文化のGeoJSONデータ

// ============================================================
// 定数定義
// ============================================================
const DEFAULT_AREA_IMAGE = "img/Area0.png";             // 地図画像の未選択時ファイル名
const AINU_LINE_COLOR = "#ee82ee";                      // アイヌ星座線の色
const AINU_FILL_COLOR = "rgba(238, 130, 238, 0.18)";  // アイヌ星座塗り色
const AINU_FONT_SIZE = "bold 14px sans-serif";          // アイヌ星座ラベルフォントサイズ

// ============================================================
// スタイル設定
// ============================================================
// アイヌ民族星文化の描画スタイル（線色・塗り色・線幅）を定義します。
const AINU_LINE_STYLE = {
  stroke: AINU_LINE_COLOR,      // 線の色
  fill: AINU_FILL_COLOR,        // 塗りつぶし色
  width: 2,                     // 線幅
};

// ============================================================
// Celestial 設定
// ============================================================
// d3-celestialライブラリの星図表示設定。
// 投影法や表示言語、星座・星の表示方法などを細かく指定します。
const CELESTIAL_CONFIG = {
  width: 0,                     // 自動サイズ調整
  projection: "aitoff",         // 星図の投影法
  transform: "equatorial",      // 座標系（赤道座標）
  center: null,                 // 初期中心座標
  orientationfixed: true,       // 方位固定
  geopos: null,                 // 地理座標（市町村選択時に設定）
  follow: "zenith",             // 視点追従（天頂）
  zoomlevel: null,              // 初期ズーム
  zoomextend: 10,               // ズーム最大値
  adaptable: true,              // レイアウト自動調整
  interactive: true,            // ユーザー操作可
  form: false,                  // 設定フォーム非表示
  controls: true,               // コントロール表示
  lang: "ja",                   // 日本語表示
  culture: "iau",               // 星座文化（国際天文学連合）
  container: "celestial-map",   // 星図描画先のDOM要素ID

  datapath: "https://cdn.jsdelivr.net/npm/d3-celestial@0.7.35/data/", // 星座・星データのパス

  stars: {
    show: true,                             // 星を表示
    limit: 6,                               // 表示する星の等級制限
    colors: true,                           // 星の色を反映
    style: { fill: "#ffffff", opacity: 1 }, // 星の描画スタイル
    designation: false,                     // 星の記号名非表示
    propername: false,                      // 星の固有名非表示
    size: 7,                                // 星の最大サイズ
    exponent: -0.28,                        // 星サイズの指数
    data: "stars.6.json",                   // 星データファイル
  },

  dsos: { show: false },    // 星雲・星団は非表示

  constellations: {
    show: true,                                               // 星座線を表示
    names: true,                                              // 星座名を表示
    desig: false,                                             // 星座記号名非表示
    lines: true,                                              // 星座線を表示
    linestyle: { stroke: "#555555", width: 1, opacity: 0.7 }, // 星座線のスタイル
    bounds: false,                                            // 星座境界線非表示
  },

  mw: {
    show: true,                                 // 天の川を表示
    style: { fill: "#ffffff", opacity: 0.04 },  // 天の川の描画スタイル
  },
};

// ============================================================
// アプリ初期化
// ============================================================
// ページのDOM構築完了時に初期化処理を実行します。
// 1. データの非同期読み込み
// 2. 市町村選択UIのセットアップ
// 3. 星図（Celestial）の初期化
// 4. 初期選択（最初の市町村）を自動で反映
document.addEventListener("DOMContentLoaded", initApp);
async function initApp() {
  try {
    // アイヌ民族星文化・市町村データを全て読み込む
    AINU_DATA = await loadAllAinuData();

    // 市町村選択UIをセットアップ
    setupCitySelect(AINU_DATA.cityMap);

    // 星図（Celestial）を初期化
    setupCelestial();

    // 地域情報を初期化
    updateRegionInfo();

    // 地図表示を初期化
    updateAreaMapPreview(null);

  } catch (err) {
    // データ読み込み失敗時のエラーハンドリング
    console.error(err);
    alert("データの読み込みに失敗しました。");
  }
}

// ============================================================
// 市町村選択 UI
// ============================================================
// 市町村選択用のセレクトボックスを動的に生成・初期化します。
// 1. プルダウンリストの初期化
// 2. 市町村名の選択肢を追加
// 3. 選択変更時のイベントリスナー登録
function setupCitySelect(cityMap) {
  const select = document.getElementById("city-select");
  const cities = Object.keys(cityMap.cities);

  // セレクトボックスの内容をクリア
  select.innerHTML = "";

  // プレースホルダー（未選択時の案内）を追加
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "市町村を選択してください";
  select.appendChild(placeholder);

  // 市町村ごとに選択肢を追加
  for (const city of cities) {
    const opt = document.createElement("option");
    opt.value = city;
    opt.textContent = city;
    select.appendChild(opt);
  }

  // 選択変更時の処理（onCityChange呼び出し）
  select.addEventListener("change", (e) => {
  const v = e.target.value;
  if (v) {
    // 選択時の処理
    onCityChange(v);
  } else {
    // 未選択時の処理
    onCityClear();
  }
});
}

// ============================================================
// 市町村選択時の処理
// ============================================================
// セレクトボックスで市町村が選択された際の処理をまとめています。
// 1. 選択された市町村の情報を取得
// 2. 各種グローバル状態を更新
// 3. 地図画像・星図のセンタリング
// 4. 地域情報・星座データの更新
// 5. 星図の再描画
function onCityChange(cityName) {
  const cityInfo = AINU_DATA.cityMap.cities[cityName];
  if (!cityInfo) return;

  // グローバル状態の更新
  CURRENT_CITY = cityName;
  CURRENT_FORECAST_AREA = cityInfo.forecast;
  CURRENT_AREA_KEY = AINU_DATA.cityMap.forecastToArea[cityInfo.forecast];

  // 地図画像を更新
  updateAreaMapPreview(CURRENT_AREA_KEY);

  // 星図の中心座標を市町村位置にセット
  Celestial.location([cityInfo.lon, cityInfo.lat]);
  setCelestialTimeToJST();

  // 地域情報・星座データの表示更新
  updateRegionInfo();
  updateAinuGeoJSON();
  updateAinuList();

  // 星図の再描画
  Celestial.redraw();
}

// 星図の時刻を日本標準時（JST）に設定
function setCelestialTimeToJST() {
  const now = new Date();
  const utc = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  Celestial.date(utc);
}

// ============================================================
// 右側の情報表示
// ============================================================
// 地域情報（市町村名・区分・文化地域）や、
// アイヌ民族星文化の一覧を画面右側に表示します。
// 選択された市町村に応じて内容を動的に更新します。

// 地域情報（市町村・区分・文化地域）の表示更新
function updateRegionInfo() {
  const div = document.getElementById("region-info");
  if (!div) return;

  // --- 未選択時 ---
  if (!CURRENT_CITY) {
    div.innerHTML = `
      <div><strong>市町村：</strong></div>
      <div><strong>地域区分：</strong></div>
      <div><strong>文化地域：</strong></div>
    `;
    return;
  }

  // --- 選択時 ---
  div.innerHTML = `
    <div><strong>市町村：</strong>${CURRENT_CITY}</div>
    <div><strong>地域区分：</strong>${CURRENT_FORECAST_AREA}</div>
    <div><strong>文化地域：</strong>${CURRENT_AREA_KEY}</div>
  `;
}

// アイヌ民族星文化一覧の表示更新
function updateAinuList() {
  const list = document.getElementById("ainu-list");
  list.innerHTML = "";

  // 対応する星文化がない場合は案内文を表示
  if (!AINU_GEOJSON?.features?.length) {
    list.innerHTML = "<li>この地域に対応するアイヌ民族の星文化はありません。</li>";
    return;
  }

  // 各星文化ごとにリスト項目を生成
  for (const f of AINU_GEOJSON.features) {
    const li = document.createElement("li");
    li.innerHTML = `
      <div class="name">${f.properties.n}</div>
      <div class="desc">${f.properties.desc || ""}</div>
    `;
    list.appendChild(li);
  }
}

// ============================================================
// Celestial 初期化
// ============================================================
// d3-celestialライブラリの初期化と、
// アイヌ民族星文化（カスタム星座）の描画設定を行います。
// 星座線・ラベルの描画ロジックもここで定義します。
function setupCelestial() {
  // カスタム星座（アイヌ民族星文化）の追加設定
  Celestial.add({
    type: "line", // 線描画タイプ

    // データバインド時のコールバック
    callback: () => {
      if (!AINU_GEOJSON) return;
      bindAinuFeatures();
    },

    // 星座線・ラベルの再描画処理
    redraw: () => {
      const ctx = Celestial.context;

      // 星座線（MultiLineString）の描画
      const sel = Celestial.container.selectAll(".ainu-constellation");
      sel.each(function (d) {
        Celestial.setStyle(AINU_LINE_STYLE);
        Celestial.map(d);
        ctx.fill();
        ctx.stroke();
      });

      // 星座名ラベルの描画
      if (!AINU_GEOJSON) return;
      const transformed = Celestial.getData(AINU_GEOJSON, CELESTIAL_CONFIG.transform);

      ctx.fillStyle = AINU_LINE_COLOR;
      ctx.font = AINU_FONT_SIZE;
      ctx.textAlign = "center";

      transformed.features.forEach(f => {
        const name = f.properties?.n;
        const loc = f.properties?.loc;
        if (!name || !loc) return;

        const xy = Celestial.mapProjection(loc);
        if (!xy) return;

        ctx.fillText(name, xy[0], xy[1]);
      });
    }
  });

  // 星図の表示開始
  Celestial.display(CELESTIAL_CONFIG);
}

// ============================================================
// GeoJSON → D3 反映
// ============================================================
function bindAinuFeatures() {
  if (!AINU_GEOJSON) return;

  const transformed = Celestial.getData(AINU_GEOJSON, CELESTIAL_CONFIG.transform);

  const sel = Celestial.container
    .selectAll(".ainu-constellation")
    .data(transformed.features, (d) => d.id);

  sel.exit().remove();
  sel.enter().append("path").attr("class", "ainu-constellation");
}

function updateAinuGeoJSON() {
  if (!CURRENT_AREA_KEY) return;

  AINU_GEOJSON = buildAinuGeoJSON(
    AINU_DATA.constellations,
    AINU_DATA.stars,
    CURRENT_AREA_KEY
  );

  bindAinuFeatures();
}

// ============================================================
// RA/Dec → lon/lat
// ============================================================
// 赤経（RA）・赤緯（Dec）を経度・緯度（lon/lat）に変換します。
// d3-celestialの座標系に合わせるため、RAが180度を超える場合は-180度〜180度に補正します。
function raDecToLonLat(raDeg, decDeg) {
  return [raDeg > 180 ? raDeg - 360 : raDeg, decDeg];
}

// ============================================================
// アイヌ民族星文化 → GeoJSON 生成
// ============================================================
// アイヌ民族星文化データ（constellations, stars, areaKey）から
// GeoJSON形式の星座データを生成します。
// 各星座ごとに線分（MultiLineString）とラベル座標を計算し、
// 地域ごとの説明文も付加します。
function buildAinuGeoJSON(constellations, stars, areaKey) {
  const features = [];

  for (const c of constellations) {
    // 地域ごとの星座名が存在する場合のみ処理
    const name = c.names?.[areaKey];
    if (!name) continue;

    // 地域ごとの説明文
    const desc = c.description?.[areaKey] || "";
    const lineSegments = [];
    const usedPoints = [];

    // 星座線（複数の線分）を生成
    for (const item of c.lines || []) {
      if (Array.isArray(item) && item.length === 2) {
        // 2点間の線分
        const s1 = stars[item[0]];
        const s2 = stars[item[1]];
        if (!s1 || !s2) continue;

        const p1 = raDecToLonLat(s1.ra, s1.dec);
        const p2 = raDecToLonLat(s2.ra, s2.dec);
        lineSegments.push([p1, p2]);
        usedPoints.push(p1, p2);

      } else if (typeof item === "string") {
        // 単独点（ラベル用）
        const s = stars[item];
        if (!s) continue;

        const p = raDecToLonLat(s.ra, s.dec);
        lineSegments.push([p, p]);
        usedPoints.push(p);
      }
    }

    if (!lineSegments.length) continue;

    // ラベル座標（星座を構成する点の重心）を計算
    const labelLon = usedPoints.reduce((a, p) => a + p[0], 0) / usedPoints.length;
    const labelLat = usedPoints.reduce((a, p) => a + p[1], 0) / usedPoints.length;

    // GeoJSONのFeatureとして追加
    features.push({
      type: "Feature",
      id: c.key,
      properties: { n: name, loc: [labelLon, labelLat], desc },
      geometry: { type: "MultiLineString", coordinates: lineSegments },
    });
  }

  return { type: "FeatureCollection", features };
}

// ============================================================
// 地図エリア切り替え用
// ============================================================
// 選択された文化地域（areaKey）に応じて、
// 地図画像（img/areaX.png）を表示・非表示に切り替えます。
// 地域未選択時は DEFAULT_AREA_IMAGE を表示にします。
function updateAreaMapPreview(areaKey) {
  const img = document.getElementById("area-map-preview");
  if (!img) return;

  // 地域未選択時はデフォルト画像を表示
  if (!areaKey) {
    img.src = DEFAULT_AREA_IMAGE;
    img.style.display = "block";
    return;
  }

  // 選択地域に対応する地図画像を表示
  img.src = `img/${areaKey}.png`;
  img.style.display = "block";
}

// ============================================================
// 市町村未選択時の処理
// ============================================================
// セレクトボックスで市町村が未選択になった際の処理をまとめています。
// 1. グローバル状態のリセット
// 2. 地域情報・星文化リストの初期化
// 3. 地図画像を初期状態（Area0）に戻す
// 4. アイヌ星座の描画パスを削除
// 5. 星図の再描画
function onCityClear() {
  CURRENT_CITY = null;
  CURRENT_AREA_KEY = null;
  CURRENT_FORECAST_AREA = null;
  AINU_GEOJSON = null;

  // 地域情報
  updateRegionInfo();

  // 星文化リスト
  const list = document.getElementById("ainu-list");
  list.innerHTML = "<li>……</li>";

  // 地図（Area0 に戻す）
  updateAreaMapPreview(null);

  // アイヌ星座のパスを削除
  Celestial.container.selectAll(".ainu-constellation").remove();

  // 星図を再描画
  Celestial.redraw();
}
