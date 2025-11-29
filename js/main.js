let engine;
let loaded = {};

// ページロード時に実行
window.onload = async () => {
  loaded = await loadAllData();
  initCitySelector();
  initStellarium();

  // 初期地域を札幌に
  const defaultCity = "札幌市";
  const defaultArea = getAreaFromCity(defaultCity);
  drawConstellations(defaultArea);
};

// Stellarium Web Engine 初期化
function initStellarium() {
  engine = new S.WebEngine({
    container: document.getElementById("stellarium-container"),
    latitude: 43.06,
    longitude: 141.35,
  });
}

// 市町村 → area1〜5 に変換
function getAreaFromCity(city) {
  const { cityToForecastArea, forecastAreaToArea } = loaded.citymap;

  const forecast = cityToForecastArea[city];
  if (!forecast) return "area1";

  return forecastAreaToArea[forecast];
}

// 市町村セレクトボックス作成
function initCitySelector() {
  const citySelect = document.getElementById("citySelect");
  const cities = Object.keys(loaded.citymap.cityToForecastArea).sort();

  cities.forEach(city => {
    const opt = document.createElement("option");
    opt.value = city;
    opt.textContent = city;
    citySelect.appendChild(opt);
  });

  citySelect.value = "札幌市";

  citySelect.addEventListener("change", () => {
    const area = getAreaFromCity(citySelect.value);
    drawConstellations(area);
  });
}

// 星座を Stellarium Web 上に描画
function drawConstellations(area) {
  engine.removeAllCustomObjects();

  const stars = loaded.stars;
  const constellations = loaded.constellations;

  constellations.forEach(con => {
    const name = con.names[area];
    const desc = con.description[area];

    // 地域にデータがない場合はスキップ
    if (!name) return;

    const lines = [];

    con.lines.forEach(line => {
      if (Array.isArray(line)) {
        // [hipXXXX, hipYYYY]
        const a = stars[line[0]];
        const b = stars[line[1]];
        if (a && b) {
          lines.push([[a.ra, a.dec], [b.ra, b.dec]]);
        }
      } else {
        // 単独 star（点として描画）
        const s = stars[line];
        if (s) {
          lines.push([[s.ra, s.dec], [s.ra, s.dec]]);
        }
      }
    });

    // Stellarium にカスタム星座登録
    engine.addObject({
      type: "constellation",
      id: con.code,
      name: name,
      description: desc,
      lines: lines
    });
  });
}