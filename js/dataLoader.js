// 複数のデータセットを扱う前提なので、個別ロード用の小さなヘルパーと
// それらをまとめて取得するラッパーだけに責務を絞っている。
// ここでは fetch 成否の検証と JSON 変換までを担い、利用側が例外処理を行う。

async function loadJSON(path) {
  // fetch で取得し、HTTP ステータスを検証してから JSON 化。
  // ここで例外を投げておくことで呼び出し元は try-catch で一括処理できる。
  const res = await fetch(path);
  if (!res.ok) {
    throw new Error(`JSONの読み込みに失敗しました: ${path} (${res.status})`);
  }
  return await res.json();
}

async function loadAllAinuData() {
  // 星データ・星座定義・市町村→エリア対応表を同時に読み込む。
  // Promise.all で並列化し、読み込み総時間を短縮する。
  const [stars, constellations, cityMap] = await Promise.all([
    loadJSON("data/stars_data.json"),
    loadJSON("data/constellation_data.json"),
    loadJSON("data/city_map.json"),
  ]);

  return {
    stars,           // { hipXXXX: { ra, dec, name }, ... }  Hipparcos 番号→位置・固有名
    constellations,  // [ { code, lines, names:{area1..}, description:{area1..} }, ... ] 地域別の線分情報
    cityMap,         // { cities:{...}, forecastToArea:{...} } 市町村→天気予報区→文化地域の対応
  };
}
