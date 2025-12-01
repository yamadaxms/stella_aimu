// ============================================================
// グローバル状態
// ============================================================

let AINU_DATA = null;
let CURRENT_AREA_KEY = null;      // "area1" 〜 "area5"
let CURRENT_FORECAST_AREA = null; // 気象庁の細分区分（例: "石狩中部"）
let CURRENT_CITY = null;          // 市町村名
let AINU_GEOJSON = null;          // 現在の地域に対応した GeoJSON

// ============================================================
// スタイル設定
// ============================================================

const AINU_LINE_STYLE = {
  stroke: "#ee82ee",
  fill: "rgba(255, 204, 0, 0.18)",
  width: 2,
};

// ============================================================
// Celestial 設定
// ============================================================

const CELESTIAL_CONFIG = {
  width: 0,
  projection: "aitoff",
  transform: "equatorial",
  center: null,
  orientationfixed: true,
  geopos: null,
  follow: "zenith",
  zoomlevel: null,
  zoomextend: 10,
  adaptable: true,
  interactive: true,
  form: false,
  controls: true,
  lang: "ja",
  culture: "iau",
  container: "celestial-map",

  datapath: "https://cdn.jsdelivr.net/npm/d3-celestial@0.7.35/data/",

  stars: {
    show: true,
    limit: 6,
    colors: true,
    style: { fill: "#ffffff", opacity: 1 },
    designation: false,
    propername: false,
    size: 7,
    exponent: -0.28,
    data: "stars.6.json",
  },

  dsos: { show: false },

  constellations: {
    show: true,
    names: true,
    desig: false,
    lines: true,
    linestyle: { stroke: "#555555", width: 1, opacity: 0.7 },
    bounds: false,
  },

  mw: {
    show: true,
    style: { fill: "#ffffff", opacity: 0.04 },
  },
};


// ============================================================
// アプリ初期化
// ============================================================

document.addEventListener("DOMContentLoaded", initApp);

async function initApp() {
  try {
    AINU_DATA = await loadAllAinuData();

    setupCitySelect(AINU_DATA.cityMap);
    setupCelestial();

    // ▼ 初期選択：JSON の最初
    const firstCity = Object.keys(AINU_DATA.cityMap.cities)[0];
    if (firstCity) {
      document.getElementById("city-select").value = firstCity;
      onCityChange(firstCity);
    }
  } catch (err) {
    console.error(err);
    alert("データの読み込みに失敗しました。");
  }
}


// ============================================================
// 市町村選択 UI
// ============================================================

function setupCitySelect(cityMap) {
  const select = document.getElementById("city-select");
  const cities = Object.keys(cityMap.cities);

  select.innerHTML = "";

  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "市町村を選択してください";
  select.appendChild(placeholder);

  for (const city of cities) {
    const opt = document.createElement("option");
    opt.value = city;
    opt.textContent = city;
    select.appendChild(opt);
  }

  select.addEventListener("change", (e) => {
    if (e.target.value) onCityChange(e.target.value);
  });
}


// ============================================================
// 市町村選択時の処理
// ============================================================

function onCityChange(cityName) {
  const cityInfo = AINU_DATA.cityMap.cities[cityName];
  if (!cityInfo) return;

  CURRENT_CITY = cityName;
  CURRENT_FORECAST_AREA = cityInfo.forecast;
  CURRENT_AREA_KEY = AINU_DATA.cityMap.forecastAreaToArea[cityInfo.forecast];

  // 地図画像を更新する
  updateAreaMapPreview(CURRENT_AREA_KEY);
	
	// ▼ 星図センタリング
  Celestial.location([cityInfo.lon, cityInfo.lat]);
  setCelestialTimeToJST();

  // ▼ データ更新
  updateRegionInfo();
  updateAinuGeoJSON();
  updateAinuList();

  // ▼ redraw
  Celestial.redraw();
}

function setCelestialTimeToJST() {
  const now = new Date();
  const utc = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  Celestial.date(utc);
}


// ============================================================
// 右側の情報表示
// ============================================================

function updateRegionInfo() {
  const div = document.getElementById("region-info");

  if (!CURRENT_CITY) {
    div.textContent = "地域情報：未選択";
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
    list.innerHTML = "<li>この地域に対応するアイヌ民族の星文化はありません。</li>";
    return;
  }

  for (const f of AINU_GEOJSON.features) {
    const li = document.createElement("li");
    li.innerHTML = `
      <div class="name">${f.properties.n}</div>
//      <div class="code">コード: ${f.id}</div>
      <div class="desc">${f.properties.desc || ""}</div>
    `;
    list.appendChild(li);
  }
}


// ============================================================
// Celestial 初期化
// ============================================================

function setupCelestial() {

  // ▼ カスタムアイヌ星座の追加（線＋ラベル）
  Celestial.add({
    type: "line",

    callback: () => {
      if (!AINU_GEOJSON) return;
      bindAinuFeatures();
    },

    redraw: () => {
      const ctx = Celestial.context;

      // --- 線描画 ---
      const sel = Celestial.container.selectAll(".ainu-constellation");
      sel.each(function (d) {
        Celestial.setStyle(AINU_LINE_STYLE);
        Celestial.map(d);
        ctx.fill();
        ctx.stroke();
      });

      // --- ★ 星座名（ラベル）描画 ★ ---
      if (!AINU_GEOJSON) return;
      const transformed = Celestial.getData(AINU_GEOJSON, CELESTIAL_CONFIG.transform);

      ctx.fillStyle = "#ee82ee";
      ctx.font = "bold 14px sans-serif";
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

function raDecToLonLat(raDeg, decDeg) {
  return [raDeg > 180 ? raDeg - 360 : raDeg, decDeg];
}


// ============================================================
// アイヌ星座 → GeoJSON 生成
// ============================================================

function buildAinuGeoJSON(constellations, stars, areaKey) {
  const features = [];

  for (const c of constellations) {
    const name = c.names?.[areaKey];
    if (!name) continue;

    const desc = c.description?.[areaKey] || "";
    const lineSegments = [];
    const usedPoints = [];

    for (const item of c.lines || []) {
      if (Array.isArray(item) && item.length === 2) {
        const s1 = stars[item[0]];
        const s2 = stars[item[1]];
        if (!s1 || !s2) continue;

        const p1 = raDecToLonLat(s1.ra, s1.dec);
        const p2 = raDecToLonLat(s2.ra, s2.dec);
        lineSegments.push([p1, p2]);
        usedPoints.push(p1, p2);

      } else if (typeof item === "string") {
        const s = stars[item];
        if (!s) continue;

        const p = raDecToLonLat(s.ra, s.dec);
        lineSegments.push([p, p]);
        usedPoints.push(p);
      }
    }

    if (!lineSegments.length) continue;

    const labelLon = usedPoints.reduce((a, p) => a + p[0], 0) / usedPoints.length;
    const labelLat = usedPoints.reduce((a, p) => a + p[1], 0) / usedPoints.length;

    features.push({
      type: "Feature",
      id: c.code,
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
