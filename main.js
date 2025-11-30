// ============================================================
// ver.0.0.1 + 「選択地域の現在 RA へ自動センタリング」
// Celestial.jd / gst を使用しない安全版
// ============================================================

// ----------------------------
// グローバル状態
// ----------------------------
let AINU_DATA = null;
let CURRENT_AREA_KEY = null;
let CURRENT_FORECAST_AREA = null;
let CURRENT_CITY = null;
let AINU_GEOJSON = null;

// ----------------------------
// Celestial 設定（ver.0.0.1そのまま）
// ----------------------------
const CELESTIAL_CONFIG = {
  width: 0,
  projection: "aitoff",
  transform: "equatorial",
  center: null,
  orientationfixed: true,
  geopos: null,
  follow: "",
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
    bounds: false
  },
  mw: { show: true, style: { fill: "#ffffff", opacity: 0.04 } }
};

// アイヌ星座ラインの style
const AINU_LINE_STYLE = {
  stroke: "#ffcc33",
  fill: "rgba(255, 204, 0, 0.18)",
  width: 2
};

document.addEventListener("DOMContentLoaded", initApp);


// ============================================================
// 初期化
// ============================================================
async function initApp() {
  try {
    AINU_DATA = await loadAllAinuData();

    setupCitySelect(AINU_DATA.cityMap);
    setupCelestial();

    // 初期表示
    const firstCity = Object.keys(AINU_DATA.cityMap.cityToForecastArea)
      .sort((a,b)=>a.localeCompare(b, "ja"))[0];

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
// 市町村セレクト
// ============================================================
function setupCitySelect(cityMap) {
  const select = document.getElementById("city-select");
  select.innerHTML = "";

  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "市町村を選択してください";
  select.appendChild(placeholder);

  const cities = Object.keys(cityMap.cityToForecastArea).sort((a,b)=>a.localeCompare(b,"ja"));

  cities.forEach(c => {
    const opt = document.createElement("option");
    opt.value = c;
    opt.textContent = c;
    select.appendChild(opt);
  });

  select.addEventListener("change", e => {
    if (e.target.value) onCityChange(e.target.value);
  });
}

function onCityChange(cityName) {
  const { cityMap } = AINU_DATA;
  const cityToForecast = cityMap.cityToForecastArea;
  const forecastToArea = cityMap.forecastAreaToArea;
  const cityLon = cityMap.cityLon;

  CURRENT_CITY = cityName;
  CURRENT_FORECAST_AREA = cityToForecast[cityName];
  CURRENT_AREA_KEY = forecastToArea[CURRENT_FORECAST_AREA];

  updateRegionInfo();
  updateAinuGeoJSON();
  updateAinuList();

  // ★ ver.0.0.1 → LST計算で RA センタリング追加
  const lonDeg = cityLon[cityName] ?? 141.35; // デフォルト札幌
  moveToRegionCurrentRA(lonDeg);
}


// ============================================================
// 地域情報
// ============================================================
function updateRegionInfo() {
  const div = document.getElementById("region-info");
  if (!CURRENT_CITY) {
    div.textContent = "地域情報：まだ選択されてません";
    return;
  }
  div.innerHTML = `
    <div><strong>市町村：</strong>${CURRENT_CITY}</div>
    <div><strong>気象庁細分区域：</strong>${CURRENT_FORECAST_AREA}</div>
    <div><strong>エリアキー：</strong>${CURRENT_AREA_KEY}</div>
  `;
}


// ============================================================
// アイヌ星座 list
// ============================================================
function updateAinuList() {
  const list = document.getElementById("ainu-list");
  list.innerHTML = "";

  if (!AINU_GEOJSON || !AINU_GEOJSON.features.length) {
    list.innerHTML = "<li>この地域に対応する星座は登録されていません</li>";
    return;
  }

  AINU_GEOJSON.features.forEach(f => {
    const li = document.createElement("li");
    li.innerHTML = `
      <div class="name">${f.properties.n}</div>
      <div class="code">コード: ${f.id}</div>
      <div class="desc">${f.properties.desc ?? ""}</div>
    `;
    list.appendChild(li);
  });
}


// ============================================================
// Celestial 初期化
// ============================================================
function setupCelestial() {
  Celestial.add({
    type: "line",
    callback: () => {
      if (!AINU_GEOJSON) return;
      bindAinuFeatures();
      Celestial.redraw();
    },
    redraw: () => {
      Celestial.container.selectAll(".ainu-constellation")
        .each(function(d){
          Celestial.setStyle(AINU_LINE_STYLE);
          Celestial.map(d);
          Celestial.context.fill();
          Celestial.context.stroke();
        });
    }
  });

  Celestial.display(CELESTIAL_CONFIG);
}

function bindAinuFeatures() {
  if (!AINU_GEOJSON) return;

  const converted = Celestial.getData(AINU_GEOJSON, CELESTIAL_CONFIG.transform);

  const sel = Celestial.container
      .selectAll(".ainu-constellation")
      .data(converted.features, d => d.id);

  sel.exit().remove();
  sel.enter().append("path").attr("class", "ainu-constellation");
}


// ============================================================
// ★ ver.0.0.1 → 追加：地方恒星時(LST)に応じて RA センタリング
//   Celestial.jd を使わず安全
// ============================================================

// ユリウス日
function toJulian(date) {
  return date / 86400000 + 2440587.5;
}

// GMST 計算（hours）
function gmst(jd) {
  const T = (jd - 2451545.0) / 36525.0;
  return (18.697374558 + 24.06570982441908 * T) % 24;
}

// LST → RA 度
function getLocalRaForRegion(date, lonDeg) {
  const jd = toJulian(date);
  const lstHour = (gmst(jd) + lonDeg / 15 + 24) % 24;
  return lstHour * 15; // degrees
}

function moveToRegionCurrentRA(lonDeg) {
  const now = new Date();
  const raDeg = getLocalRaForRegion(now, lonDeg);

  Celestial.skyview({
    center: [raDeg, 0]
  });
  Celestial.redraw();
}


// ============================================================
// アイヌ星座 → GeoJSON
// ============================================================
function raDecToLonLat(raDeg, decDeg) {
  let lon = raDeg;
  if (lon > 180) lon -= 360;
  return [lon, decDeg];
}

function buildAinuGeoJSON(constellations, stars, areaKey) {
  const features = [];

  for (const c of constellations) {
    const name = c.names?.[areaKey];
    const desc = c.description?.[areaKey] ?? "";
    if (!name) continue;

    const lines = c.lines;
    const segments = [];
    const points = [];

    for (const ln of lines) {
      if (Array.isArray(ln)) {
        const s1 = stars[ln[0]];
        const s2 = stars[ln[1]];
        if (!s1 || !s2) continue;

        const p1 = raDecToLonLat(s1.ra, s1.dec);
        const p2 = raDecToLonLat(s2.ra, s2.dec);
        segments.push([p1, p2]);
        points.push(p1, p2);

      } else if (typeof ln === "string") {
        const s = stars[ln];
        if (!s) continue;
        const p = raDecToLonLat(s.ra, s.dec);
        segments.push([p, p]);
        points.push(p);
      }
    }

    if (!segments.length) continue;

    // ラベル位置（平均値）
    const lon = points.reduce((a,p)=>a+p[0],0) / points.length;
    const lat = points.reduce((a,p)=>a+p[1],0) / points.length;

    features.push({
      type: "Feature",
      id: c.code,
      properties: { n: name, desc: desc, loc: [lon, lat] },
      geometry: { type: "MultiLineString", coordinates: segments }
    });
  }

  return { type: "FeatureCollection", features };
}