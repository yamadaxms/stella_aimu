// ---------------------------------------------------------
//  ver.0.0.2  main.js  (Celestial.jd対応 & 地方恒星時センタリング)
// ---------------------------------------------------------

// グローバル状態
let AINU_DATA = null;
let CURRENT_AREA_KEY = null;
let CURRENT_FORECAST_AREA = null;
let CURRENT_CITY = null;
let AINU_GEOJSON = null;

// Celestial の基本設定
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
    linestyle: {
      stroke: "#555555",
      width: 1,
      opacity: 0.7
    },
    bounds: false
  },
  mw: {
    show: true,
    style: { fill: "#ffffff", opacity: 0.04 }
  }
};

// アイヌ星座の描画スタイル
const AINU_LINE_STYLE = {
  stroke: "#ffcc33",
  fill: "rgba(255, 204, 0, 0.18)",
  width: 2
};

document.addEventListener("DOMContentLoaded", initApp);


// ---------------------------------------------------------
//   初期化
// ---------------------------------------------------------

async function initApp() {
  try {
    AINU_DATA = await loadAllAinuData();
    setupCitySelect(AINU_DATA.cityMap);
    setupCelestial();

    // 初期表示: 最初の市町村を選択
    const firstCity = Object.keys(AINU_DATA.cityMap.cityToForecastArea)
      .sort((a, b) => a.localeCompare(b, "ja"))[0];

    if (firstCity) {
      document.getElementById("city-select").value = firstCity;
      onCityChange(firstCity);
    }

  } catch (err) {
    console.error(err);
    alert("データの読み込みに失敗しました。コンソールを確認してください。");
  }
}


// ---------------------------------------------------------
//   市町村セレクト
// ---------------------------------------------------------

function setupCitySelect(cityMap) {
  const select = document.getElementById("city-select");
  select.innerHTML = "";

  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "市町村を選択してください";
  select.appendChild(placeholder);

  const cities = Object.keys(cityMap.cityToForecastArea)
    .sort((a, b) => a.localeCompare(b, "ja"));

  for (const city of cities) {
    const opt = document.createElement("option");
    opt.value = city;
    opt.textContent = city;
    select.appendChild(opt);
  }

  select.addEventListener("change", e => {
    if (e.target.value) onCityChange(e.target.value);
  });
}

function onCityChange(cityName) {
  const { cityMap } = AINU_DATA;
  const cityToForecast = cityMap.cityToForecastArea;
  const forecastToArea = cityMap.forecastAreaToArea;
  const cityLon = cityMap.cityLon;

  const forecastArea = cityToForecast[cityName];
  const areaKey = forecastToArea[forecastArea];

  CURRENT_CITY = cityName;
  CURRENT_FORECAST_AREA = forecastArea;
  CURRENT_AREA_KEY = areaKey;

  updateRegionInfo();
  updateAinuGeoJSON();
  updateAinuList();

  // ★ ver.0.0.2 新機能：地方恒星時（LST）からRA中心へ移動
  const lonDeg = cityLon[cityName] ?? 141.35; // デフォルト札幌
  moveToRegionCurrentRA(lonDeg);
}


// ---------------------------------------------------------
//   地域情報パネル & 星座一覧
// ---------------------------------------------------------

function updateRegionInfo() {
  const div = document.getElementById("region-info");
  if (!CURRENT_CITY) {
    div.textContent = "地域情報：まだ選択されていません";
    return;
  }

  div.innerHTML = `
    <div><strong>市町村：</strong>${CURRENT_CITY}</div>
    <div><strong>気象庁細分区域：</strong>${CURRENT_FORECAST_AREA}</div>
    <div><strong>アイヌ星座エリアキー：</strong>${CURRENT_AREA_KEY}</div>
  `;
}

function updateAinuList() {
  const list = document.getElementById("ainu-list");
  list.innerHTML = "";

  if (!AINU_GEOJSON || !AINU_GEOJSON.features.length) {
    const li = document.createElement("li");
    li.textContent = "この地域に対応するアイヌ星座は登録されていません。";
    list.appendChild(li);
    return;
  }

  for (const f of AINU_GEOJSON.features) {
    const li = document.createElement("li");

    const nameEl = document.createElement("div");
    nameEl.className = "name";
    nameEl.textContent = f.properties.n;

    const codeEl = document.createElement("div");
    codeEl.className = "code";
    codeEl.textContent = `コード: ${f.id}`;

    const descEl = document.createElement("div");
    descEl.className = "desc";
    descEl.textContent = f.properties.desc || "";

    li.appendChild(nameEl);
    li.appendChild(codeEl);
    li.appendChild(descEl);
    list.appendChild(li);
  }
}


// ---------------------------------------------------------
//  Celestial 初期化
// ---------------------------------------------------------

function setupCelestial() {
  // 独自レイヤー（アイヌ星座）
  Celestial.add({
    type: "line",
    callback: function () {
      if (!AINU_GEOJSON) return;
      bindAinuFeatures();
      Celestial.redraw();
    },
    redraw: function () {
      const sel = Celestial.container.selectAll(".ainu-constellation");
      sel.each(function (d) {
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

  const transformed = Celestial.getData(
    AINU_GEOJSON,
    CELESTIAL_CONFIG.transform
  );

  const sel = Celestial.container
    .selectAll(".ainu-constellation")
    .data(transformed.features, d => d.id);

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
  Celestial.redraw();
}


// ---------------------------------------------------------
//   ★ ver.0.0.2 地方恒星時から RA を求めて星図中央へ
// ---------------------------------------------------------

function getLocalRaForRegion(date, lonDeg) {
  // タイムゾーン補正（JSTなら+9h）
  const tzHours = -date.getTimezoneOffset() / 60;

  // Celestial.jd(date) はローカル時刻の JD なので UTC に補正
  const jdLocal = Celestial.jd(date);
  const jdUTC = jdLocal - tzHours / 24;

  // UTC の GST（hours）
  const gstUTC = Celestial.gst(jdUTC);

  // LST = GST + 経度（hours）
  const lst = (gstUTC + lonDeg / 15 + 24) % 24;

  return lst * 15; // RA 度
}

function moveToRegionCurrentRA(lonDeg) {
  const now = new Date();
  const raDeg = getLocalRaForRegion(now, lonDeg);

  Celestial.skyview({
    center: [raDeg, 0] // Dec は 0 度固定
  });

  Celestial.redraw();
}


// ---------------------------------------------------------
//   アイヌ星座データ → GeoJSON 変換
// ---------------------------------------------------------

function raDecToLonLat(raDeg, decDeg) {
  let lon = raDeg;
  if (lon > 180) lon -= 360;
  return [lon, decDeg];
}

function buildAinuGeoJSON(constellations, stars, areaKey) {
  const features = [];

  for (const c of constellations) {
    const name = c.names?.[areaKey] || "";
    const desc = c.description?.[areaKey] || "";
    if (!name) continue;

    const lines = c.lines;
    const lineSegments = [];
    const usedPoints = [];

    for (const ln of lines) {
      if (Array.isArray(ln) && ln.length === 2) {
        const s1 = stars[ln[0]];
        const s2 = stars[ln[1]];
        if (!s1 || !s2) continue;

        const p1 = raDecToLonLat(s1.ra, s1.dec);
        const p2 = raDecToLonLat(s2.ra, s2.dec);

        lineSegments.push([p1, p2]);
        usedPoints.push(p1, p2);

      } else if (typeof ln === "string") {
        const s = stars[ln];
        if (!s) continue;

        const p = raDecToLonLat(s.ra, s.dec);
        lineSegments.push([p, p]);
        usedPoints.push(p);
      }
    }

    if (!lineSegments.length) continue;

    // ラベル位置 = 中心
    let lonSum = 0, latSum = 0;
    for (const p of usedPoints) {
      lonSum += p[0];
      latSum += p[1];
    }
    const labelLon = lonSum / usedPoints.length;
    const labelLat = latSum / usedPoints.length;

    features.push({
      type: "Feature",
      id: c.code,
      properties: {
        n: name,
        desc: desc,
        loc: [labelLon, labelLat]
      },
      geometry: {
        type: "MultiLineString",
        coordinates: lineSegments
      }
    });
  }

  return {
    type: "FeatureCollection",
    features
  };
}