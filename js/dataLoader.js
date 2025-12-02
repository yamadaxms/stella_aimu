// dataLoader.js - 星図アプリ用データローダーユーティリティ
// 3種類のJSONデータ（星データ・アイヌ民族星文化データ・地名マップ）をまとめて非同期で読み込む関数を提供します。

/**
 * 指定したパスのJSONファイルを非同期で取得し、パースして返す関数
 * @param {string} path - 読み込むJSONファイルのパス
 * @returns {Promise<Object>} パース済みのJSONオブジェクト
 * @throws {Error} 読み込み失敗時はエラーを投げる
 */
async function loadJSON(path) {
  const res = await fetch(path); // fetch APIでファイル取得
  if (!res.ok) {
    // HTTPステータスが正常でない場合はエラー
    throw new Error(`JSONの読み込みに失敗しました: ${path} (${res.status})`);
  }
  return await res.json(); // レスポンスをJSONとしてパース
}

/**
 * 星データ・アイヌ民族星文化データ・地名マップの3つのJSONを並列で読み込む関数
 * @returns {Promise<{stars: Object, constellations: Array, cityMap: Object}>}
 *   stars: 星データ（hip番号ごとの座標・名前など）
 *   constellations: アイヌ民族星文化データ（星座コード・線情報・各地域名・説明など）
 *   cityMap: 地名マップ（都市→予報エリア、予報エリア→地域の対応表）
 */
async function loadAllAinuData() {
  // Promise.allで3つのJSONを同時に取得
  const [stars, constellations, cityMap] = await Promise.all([
    loadJSON("data/stars_data.json"),         // 星データ
    loadJSON("data/constellation_data.json"), // アイヌ民族星文化データ
    loadJSON("data/city_map.json"),           // 地名マップ
  ]);

  // 取得したデータをオブジェクトでまとめて返す
  return {
    stars,           // { hipXXXX: { ra, dec, name }, ... } 星ごとの座標・名前
    constellations,  // [ { key, lines, names:{area1..}, description:{area1..} }, ... ] アイヌ民族星文化情報
    cityMap,         // { cityToForecastArea:{}, forecastToArea:{} } 地名対応表
  };
}
