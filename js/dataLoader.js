// このモジュールは複数のデータセット（星文化定義、市町村→エリア対応表、星の座標情報など）を効率的かつ安全に取得するためのヘルパー関数群を提供します。
// 各関数は役割を明確に分離し、データ取得・検証・変換の責務を担います。
// fetchによるデータ取得時のエラー検証やJSON変換は本モジュールで行い、呼び出し元はtry-catchで例外処理を一括管理できます。

/**
 * 指定パスのJSONファイルをfetchで取得し、HTTPステータスを検証した上でJSONオブジェクトとして返します。
 * 取得失敗時は詳細なエラーメッセージを含む例外をthrowします。
 * @param {string} path - 取得対象のJSONファイルパス
 * @returns {Promise<Object>} - パース済みJSONデータ
 * @throws {Error} - 取得失敗時
 */
async function loadJSON(path) {
  // fetchでデータ取得し、HTTPステータスが正常でなければ例外をthrow。
  const res = await fetch(path);
  if (!res.ok) {
    throw new Error(`JSONの読み込みに失敗しました: ${path} (${res.status})`);
  }
  return await res.json();
}

/**
 * 星文化定義データ・市町村→エリア対応表・恒星座標を並列で取得します。
 * 取得した全データをオブジェクトでまとめて返します。
 * @returns {Promise<{stars: Object, constellations: Array, cityMap: Object}>}
 *   stars: Hipparcos番号→座標（赤経・赤緯）
 *   constellations: 地域別星文化定義
 *   cityMap: 市町村→文化地域と緯度経度の対応表
 * @throws {Error} - いずれかの取得失敗時
 */
async function loadAllAinuData() {
  // 星文化定義・市町村→エリア対応表・恒星座標を並列で取得
  const [constellations, cityList, stars] = await Promise.all([loadJSON("data/constellation.json"), loadJSON("data/city.json"), loadJSON("data/star.json")]);

  return {
    stars, // { HIP_xxxxx: { ra, dec }, ... }  Hipparcos番号→座標（赤経・赤緯）
    constellations, // [ { key, ra, dec, name, description, lines, ainu }, ... ] 地域別星文化定義
    cityMap: buildCityMap(cityList), // { 市町村名: { area | areas, lat?, lon?, forecast?, region?, bureau? } }
  };
}

/**
 * city.json を旧フォーマット互換のマップ形式へ変換します。
 * @param {Array} cityList - city.json の配列データ
 * @returns {Object} - { 市町村名: { area|areas, forecast, region, bureau, lat, lon } }
 */
function buildCityMap(cityList) {
  const map = {};
  if (!Array.isArray(cityList)) return map;

  for (const item of cityList) {
    if (!item?.city) continue;
    const areaKeys = ainuCodesToAreaKeys(item.ainu);
    const entry = {
      forecast: item.forecast,
      region: item.area,
      bureau: item.subprefecture,
      lat: item.lat,
      lon: item.lon,
    };

    if (areaKeys.length > 1) {
      entry.areas = areaKeys;
    } else if (areaKeys.length === 1) {
      entry.area = areaKeys[0];
    }

    map[item.city] = entry;
  }

  return map;
}

function ainuCodesToAreaKeys(codes) {
  // city.json 内のアイヌコードを星文化用のエリアキーへ変換（重複は1件にまとめる）
  const map = {
    ainu1: "area1",
    ainu2: "area2",
    ainu3: "area3",
    ainu4: "area4",
    ainu5: "area5",
  };

  if (!Array.isArray(codes)) return [];
  const keys = new Set();
  for (const code of codes) {
    const areaKey = map[code];
    // 不明なコードは無視し、Setで重複を除外
    if (areaKey) keys.add(areaKey);
  }
  return Array.from(keys);
}
