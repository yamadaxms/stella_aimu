async function loadJSON(path) {
  const res = await fetch(path);
  return await res.json();
}

async function loadAllData() {
  const stars = await loadJSON("data/stars_data.json");
  const constellations = await loadJSON("data/constellation_data.json");
  const citymap = await loadJSON("data/city_to_forecast_area.json");

  return { stars, constellations, citymap };
}