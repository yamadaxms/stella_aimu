// ============================================================
// グローバル状態
// ============================================================
// 選択された市町村や地域を覚えておき、UI や描画処理から参照する。
// AINU_DATA だけは初期ロード後に固定で、それ以外は選択変更のたび更新。

let AINU_DATA = null;
let CURRENT_AREA_KEY = null;
let CURRENT_FORECAST_AREA = null;
let CURRENT_CITY = null;
let AINU_GEOJSON = null;

// ============================================================
// スタイル設定
// ============================================================
// Celestial.js で描くアイヌ星座ライン用の色・太さなど。

const AINU_LINE_STYLE = {
  stroke: "#ee66ee",                  // 星座の線色
  fill: "rgba(240, 102, 240, 0.18)",  // 線で囲んだ領域の塗り色（半透明）
  width: 2,                           // 線幅
};

// ============================================================
// Celestial 設定
// ============================================================
// d3-celestial の設定。投影法や中心、星の描画ルールなどをまとめて定義。

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
  culture: "iau",                   // 既定の星座文化
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
// アプリ初期化
// ============================================================
// データロード → 市町村プルダウン生成 → Celestial 初期化 → 初期表示。

document.addEventListener("DOMContentLoaded", initApp);

async function initApp() {
  try {
    // 必要な JSON をまとめて取得し、以降の UI 更新に使う。
    AINU_DATA = await loadAllAinuData();

    // 市町村リストをプルダウンに並べる。
    setupCitySelect(AINU_DATA.cityMap);
    // 天球図を初期化し、独自レイヤーを登録。
    setupCelestial();

    // 初期状態は市町村未選択のまま、全体マップ(Area0)を表示
    updateAreaMapPreview("Area0");
    updateRegionInfo();
  } catch (err) {
    console.error(err);
    alert("データの読み込みに失敗しました。");
  }
}


// ============================================================
// 市町村選択 UI
// ============================================================
// city_map.json をもとにプルダウンを構築し、選択時に onCityChange を起動。

function setupCitySelect(cityMap) {
  const select = document.getElementById("city-select");
  const cities = Object.keys(cityMap.cities);

  // 既存の option をクリアしてからプレースホルダーを追加。
  select.innerHTML = "";

  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "市町村を選択してください";
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
// 市町村 → 予報区 → 文化地域を解決し、地図と星座の描画条件を更新する。

function onCityChange(cityName) {
  const cityInfo = AINU_DATA.cityMap.cities[cityName];
  if (!cityInfo) return;

  // 選択された市町村から、予報区と文化地域を特定する。
  CURRENT_CITY = cityName;
  CURRENT_FORECAST_AREA = cityInfo.forecast;
  CURRENT_AREA_KEY = AINU_DATA.cityMap.forecastToArea[cityInfo.forecast];

  // 対応エリアの地図プレビューを差し替え。
  updateAreaMapPreview(CURRENT_AREA_KEY);
	
  // 天球図の中心位置を市町村の座標に設定し、時間を JST に揃える。
  Celestial.location([cityInfo.lon, cityInfo.lat]);
  setCelestialTimeToJST();

  // UI と描画レイヤーを選択内容で更新。
  updateRegionInfo();
  updateAinuGeoJSON();
  updateAinuList();

  // 変更を反映するために再描画をトリガー。
  Celestial.redraw();
}

function setCelestialTimeToJST() {
  // ブラウザのローカルタイムから UTC を導出し、Celestial に渡す。
  // Celestial は内部で経度を考慮してローカル時間表示を行う。
  const now = new Date();
  const utc = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  Celestial.date(utc);
}

function resetSelection() {
  // 選択状態をリセットし、未選択に戻す。
  CURRENT_CITY = null;
  CURRENT_FORECAST_AREA = null;
  CURRENT_AREA_KEY = null;
  AINU_GEOJSON = null;

  // clear drawn features and reset UI to initial state
  Celestial.container?.selectAll(".ainu-constellation").remove();
  updateAreaMapPreview("Area0");
  updateRegionInfo();
  updateAinuList();
  Celestial.redraw();
}


// ============================================================
// 右側の情報表示
// ============================================================
// 選択状態に応じて地域名などを置き換える。未選択時はプレースホルダー文言。

function updateRegionInfo() {
  const div = document.getElementById("region-info");

  if (!CURRENT_CITY) {
    // 未選択時はダミー文言を表示。
    div.innerHTML = `
      <div><strong>市町村：</strong>未選択</div>
      <div><strong>地域区分：</strong>未選択</div>
      <div><strong>文化地域：</strong>未選択</div>
    `;
    return;
  }

  div.innerHTML = `
    <div><strong>市町村：</strong>${CURRENT_CITY}</div>
    <div><strong>地域区分：</strong>${CURRENT_FORECAST_AREA}</div>
    <div><strong>文化地域：</strong>${CURRENT_AREA_KEY}</div>
  `;
}

function updateAinuList() {
  const list = document.getElementById("ainu-list");
  list.innerHTML = "";

  if (!AINU_GEOJSON?.features?.length) {
    // 該当地域がなければメッセージだけ表示。
    list.innerHTML = "<li>この地域に対応するアイヌ民族の星文化はありません。</li>";
    return;
  }

  // 各星座をリストアイテムとして描画。
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
// 独自レイヤーを追加し、描画コールバックで GeoJSON を線とラベルに変換する。

function setupCelestial() {

  Celestial.add({
    type: "line",

    // GeoJSON が揃ったタイミングで path 要素を作成。
    callback: () => {
      if (!AINU_GEOJSON) return;
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
      if (!AINU_GEOJSON) return;
      const transformed = Celestial.getData(AINU_GEOJSON, CELESTIAL_CONFIG.transform);

      ctx.fillStyle = "#ee82ee";
      ctx.font = "bold 14px sans-serif";
      ctx.textAlign = "center";

      transformed.features.forEach(f => {
        const name = f.properties?.n;
        const loc = f.properties?.loc;
        if (!name || !loc) return;

        // 投影座標が得られる場合のみ描画。
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
// GeoJSON → D3 反映
// ============================================================
// GeoJSON を Celestial の内部座標に投影し、path 要素へデータバインドする。

function bindAinuFeatures() {
  if (!AINU_GEOJSON) return;

  // GeoJSON を現在の投影設定に合わせて変換。
  const transformed = Celestial.getData(AINU_GEOJSON, CELESTIAL_CONFIG.transform);

  // Feature ごとに path を紐づけ。id をキーに差分更新する。
  const sel = Celestial.container
    .selectAll(".ainu-constellation")
    .data(transformed.features, (d) => d.id);

  sel.exit().remove();
  sel.enter().append("path").attr("class", "ainu-constellation");
}

function updateAinuGeoJSON() {
  if (!CURRENT_AREA_KEY) return;

  // 現在の文化地域キーで GeoJSON を再生成。
  AINU_GEOJSON = buildAinuGeoJSON(
    AINU_DATA.constellations,
    AINU_DATA.stars,
    CURRENT_AREA_KEY
  );

  // path 要素とデータの紐付けを更新。
  bindAinuFeatures();
}


// ============================================================
// RA/Dec → lon/lat
// ============================================================
// 赤経は 0-360 のうち 180 を跨ぐ場合があるため、360-180 部分を負側に反転する。

function raDecToLonLat(raDeg, decDeg) {
  return [raDeg > 180 ? raDeg - 360 : raDeg, decDeg];
}


// ============================================================
// アイヌ星座 → GeoJSON 生成
// ============================================================
// 地域に紐づく星座だけを抽出し、線分を MultiLineString としてまとめる。
// ラベル位置は使用した点の平均座標から近似的に算出する。

function buildAinuGeoJSON(constellations, stars, areaKey) {
  const features = [];

  for (const c of constellations) {
    const name = c.names?.[areaKey];
    if (!name) continue;

    const desc = c.description?.[areaKey] || "";
    const lineSegments = [];
    const usedPoints = [];

    // `lines` の各要素は「線分の両端」または「ポリライン」のどちらか。
    // Hipparcos 番号を実際の赤経・赤緯座標に置き換える。
    for (const item of c.lines || []) {
      if (Array.isArray(item)) {
        if (item.length === 2) {
          const s1 = stars[item[0]];
          const s2 = stars[item[1]];
          if (!s1 || !s2) continue;
          const p1 = raDecToLonLat(s1.ra, s1.dec);
          const p2 = raDecToLonLat(s2.ra, s2.dec);
          lineSegments.push([p1, p2]);
          usedPoints.push(p1, p2);
        }
        else if (item.length > 2) {
          for (let i = 0; i < item.length - 1; i++) {
            const s1 = stars[item[i]];
            const s2 = stars[item[i + 1]];
            if (!s1 || !s2) continue;
            const p1 = raDecToLonLat(s1.ra, s1.dec);
            const p2 = raDecToLonLat(s2.ra, s2.dec);
            lineSegments.push([p1, p2]);
            usedPoints.push(p1, p2);
          }
        }
      } else if (typeof item === "string") {
        // 単一点だけを示す場合は、退避のため lineSegments に点線分で追加。
        const s = stars[item];
        if (!s) continue;

        const p = raDecToLonLat(s.ra, s.dec);
        lineSegments.push([p, p]);
        usedPoints.push(p);
      }
    }

    // 描く線分が一つもない場合はスキップ。
    if (!lineSegments.length) continue;

    // ラベル表示用に、使用した点の平均を「おおよその中心」として使う。
    const labelLon = usedPoints.reduce((a, p) => a + p[0], 0) / usedPoints.length;
    const labelLat = usedPoints.reduce((a, p) => a + p[1], 0) / usedPoints.length;

    // `constellation_data.json` uses `key` as the identifier (not `code`), so use that to avoid duplicate/undefined IDs
    const featureId = c.key || c.code || name;

    features.push({
      type: "Feature",
      id: featureId,
      properties: { n: name, loc: [labelLon, labelLat], desc },
      geometry: { type: "MultiLineString", coordinates: lineSegments },
    });
  }

  return { type: "FeatureCollection", features };
}

// ============================================================
// 地図エリア切り替え用
// ============================================================

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
