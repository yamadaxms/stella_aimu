// 3つの JSON をまとめて読み込むユーティリティ

async function loadJSON(path) {
  const res = await fetch(path);
  if (!res.ok) {
    throw new Error(`JSONの読み込みに失敗しました: ${path} (${res.status})`);
  }
  return await res.json();
}

async function loadAllAinuData() {
  const [stars, constellations, cityMap] = await Promise.all([
    loadJSON("data/stars_data.json"),
    loadJSON("data/constellation_data.json"),
    loadJSON("data/city_to_forecast_area.json"),
  ]);

  return {
    stars,           // { hipXXXX: { ra, dec, name }, ... }
    constellations,  // [ { code, lines, names:{area1..}, description:{area1..} }, ... ]
    cityMap,         // { cityToForecastArea:{}, forecastAreaToArea:{} }
  };
}