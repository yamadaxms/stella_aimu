// グローバル状態
let AINU_DATA = null;
let CURRENT_AREA_KEY = null;      // "area1" 〜 "area5"
let CURRENT_FORECAST_AREA = null; // 気象庁の細分区分（例: "石狩中部"）
let CURRENT_CITY = null;          // 市町村名
let AINU_GEOJSON = null;          // 現在の地域に対応した GeoJSON

// ラインの描画スタイル（アイヌ星座）
const AINU_LINE_STYLE = {
  stroke: "#ffcc33",
  fill: "rgba(255, 204, 0, 0.18)",
  width: 2,
};

// Celestial の設定
const CELESTIAL_CONFIG = {
  width: 0,                 // 親要素いっぱい
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
  form: false,              // 右側の標準フォームは使わない
  controls: true,           // 拡大縮小ボタン
  lang: "ja",
  culture: "iau",
  container: "celestial-map",

  // d3-celestial 標準データのパス（CDN）
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

  dsos: {
    show: false,
  },

  constellations: {
    show: true,
    names: true,
    desig: false,
    lines: true,
    linestyle: {
      stroke: "#555555",
      width: 1,
      opacity: 0.7,
    },
    bounds: false,
  },

  mw: {
    show: true,
    style: { fill: "#ffffff", opacity: 0.04 },
  },
};

document.addEventListener("DOMContentLoaded", initApp);

async function initApp() {
  try {
    AINU_DATA = await loadAllAinuData();

    setupCitySelect(AINU_DATA.cityMap);
    setupCelestial();

    // 初期表示：最初の市町村
    const firstCity =
      Object.keys(AINU_DATA.cityMap.cityToForecastArea).sort()[0];
    if (firstCity) {
      document.getElementById("city-select").value = firstCity;
      onCityChange(firstCity);
    }
  } catch (err) {
    console.error(err);
    alert("データの読み込みに失敗しました。コンソールを確認してください。");
  }
}

/* ──────────────────────────────────────────────
 *  地域選択 UI
 * ────────────────────────────────────────────── */

function setupCitySelect(cityMap) {
  const select = document.getElementById("city-select");
  const cityToForecast = cityMap.cityToForecastArea;

  // 一旦クリア
  select.innerHTML = "";

  // プレースホルダ
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "市町村を選択してください";
  select.appendChild(placeholder);

  // 市町村名でソートして追加
  const cities = Object.keys(cityToForecast).sort(
    (a, b) => a.localeCompare(b, "ja")
  );

  for (const city of cities) {
    const opt = document.createElement("option");
    opt.value = city;
    opt.textContent = city;
    select.appendChild(opt);
  }

  select.addEventListener("change", (e) => {
    const value = e.target.value;
    if (!value) return;
    onCityChange(value);
  });
}

function onCityChange(cityName) {
  const { cityMap } = AINU_DATA;
  const cityToForecast = cityMap.cityToForecastArea;
  const forecastToArea = cityMap.forecastAreaToArea;

  const forecastArea = cityToForecast[cityName];
  const areaKey = forecastToArea[forecastArea]; // "area1" など

  CURRENT_CITY = cityName;
  CURRENT_FORECAST_AREA = forecastArea;
  CURRENT_AREA_KEY = areaKey;

  updateRegionInfo();
  updateAinuGeoJSON();
  updateAinuList();
}

/* ──────────────────────────────────────────────
 *  Region info / Ainu list
 * ────────────────────────────────────────────── */

function updateRegionInfo() {
  const regionDiv = document.getElementById("region-info");

  if (!CURRENT_CITY || !CURRENT_FORECAST_AREA || !CURRENT_AREA_KEY) {
    regionDiv.textContent = "地域情報：まだ選択されていません";
    return;
  }

  regionDiv.innerHTML = `
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

/* ──────────────────────────────────────────────
 *  Celestial 初期化 & アイヌ星座描画
 * ────────────────────────────────────────────── */

function setupCelestial() {
  // d3-celestial に「アイヌ星座レイヤー」を登録
  Celestial.add({
    type: "line",
    // 初回ロード時に呼ばれる
    callback: function () {
      if (!AINU_GEOJSON) return;
      bindAinuFeatures();
      Celestial.redraw();
    },
    // 再描画時に呼ばれる
    redraw: function () {
      const sel = Celestial.container.selectAll(".ainu-constellation");
      sel.each(function (d) {
        Celestial.setStyle(AINU_LINE_STYLE);
        Celestial.map(d);              // ラインを投影
        Celestial.context.fill();
        Celestial.context.stroke();
      });
    },
  });

  // 星図を表示
  Celestial.display(CELESTIAL_CONFIG);
}

function bindAinuFeatures() {
  if (!AINU_GEOJSON) return;

  const transformed = Celestial.getData(AINU_GEOJSON, CELESTIAL_CONFIG.transform);

  // .ainu-constellation を更新（enter/exit 対応）
  const sel = Celestial.container
    .selectAll(".ainu-constellation")
    .data(transformed.features, (d) => d.id);

  sel.exit().remove();

  sel.enter()
    .append("path")
    .attr("class", "ainu-constellation");
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

/* ──────────────────────────────────────────────
 *  アイヌ星座 → GeoJSON 変換
 * ────────────────────────────────────────────── */

/**
 * RA/Dec（0〜360度の RA）を d3-celestial 用の [lon, lat] に変換
 *  - lon は -180〜180 度に正規化
 */
function raDecToLonLat(raDeg, decDeg) {
  let lon = raDeg;
  if (lon > 180) lon -= 360;
  const lat = decDeg;
  return [lon, lat];
}

/**
 * constellation_data.json + stars_data.json から
 * 指定 areaKey ("area1" 〜 "area5") のみを GeoJSON にまとめる
 */
function buildAinuGeoJSON(constellations, stars, areaKey) {
  const features = [];

  for (const c of constellations) {
    const name = c.names?.[areaKey] || "";
    const desc = c.description?.[areaKey] || "";

    if (!name) continue; // この地域には存在しない星座

    const lines = c.lines;
    const lineSegments = [];
    const usedPoints = [];

    if (Array.isArray(lines)) {
      for (const item of lines) {
        if (Array.isArray(item) && item.length === 2) {
          // ["hip24436", "hip25336"] のような線分
          const [id1, id2] = item;
          const s1 = stars[id1];
          const s2 = stars[id2];
          if (!s1 || !s2) continue;

          const p1 = raDecToLonLat(s1.ra, s1.dec);
          const p2 = raDecToLonLat(s2.ra, s2.dec);
          lineSegments.push([p1, p2]);
          usedPoints.push(p1, p2);
        } else if (typeof item === "string") {
          // ["hip32349"] のような点だけ（シリウスなど）
          const s = stars[item];
          if (!s) continue;
          const p = raDecToLonLat(s.ra, s.dec);
          // 点でも MultiLineString として扱うため、同じ点を2回入れる
          lineSegments.push([p, p]);
          usedPoints.push(p);
        }
      }
    }

    if (!lineSegments.length) continue;

    // ラベル表示用の位置：使用した点の平均
    let labelLon = 0;
    let labelLat = 0;
    for (const p of usedPoints) {
      labelLon += p[0];
      labelLat += p[1];
    }
    labelLon /= usedPoints.length;
    labelLat /= usedPoints.length;

    features.push({
      type: "Feature",
      id: c.code,
      properties: {
        n: name,
        loc: [labelLon, labelLat],
        desc: desc,
      },
      geometry: {
        type: "MultiLineString",
        coordinates: lineSegments,
      },
    });
  }

  return {
    type: "FeatureCollection",
    features,
  };
}