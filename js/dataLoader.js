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
  // 星座定義・市町村→エリア対応表を並列で読み込み、星の座標は SIMBAD から動的取得する。
  const [constellations, cityMap] = await Promise.all([
    loadJSON("data/constellation_data.json"),
    loadJSON("data/city_map.json"),
  ]);

  // constellation_data.json 内で使われている Hipparcos 番号を抽出し、SIMBAD の TAP API から
  // 赤経・赤緯をまとめて取得する。 (座標のみ必要なため名前は取得しない)
  const hipIds = collectHipIds(constellations);
  const stars = await fetchHipPositionsFromSimbad(hipIds);

  return {
    stars,           // { HIP_xxxxx: { ra, dec }, ... }  Hipparcos 番号→位置
    constellations,  // [ { code, lines, names:{area1..}, description:{area1..} }, ... ] 地域別の線分情報
    cityMap,         // { cities:{...}, forecastToArea:{...} } 市町村→天気予報区→文化地域の対応
  };
}

// fetch 失敗時にもテキストを安全に取り出すユーティリティ。
async function safeReadText(res) {
  try {
    return await res.text();
  } catch (_) {
    return "no detail";
  }
}

// constellation_data.json 内から HIP 番号を抜き出す。
function collectHipIds(constellations) {
  const hipIds = new Set();

  const addIfHip = (raw) => {
    if (typeof raw !== "string") return;
    if (!raw.startsWith("HIP_")) return;
    const num = raw.slice(4).replace(/^0+/, ""); // 先頭ゼロは削除して検索用に寄せる
    if (num) hipIds.add(num);
  };

  for (const c of constellations) {
    for (const item of c.lines || []) {
      if (Array.isArray(item)) {
        for (const raw of item) addIfHip(raw);
      } else {
        addIfHip(item);
      }
    }
  }

  return Array.from(hipIds);
}

// SIMBAD (CDS Strasbourg) の TAP API を使って Hipparcos 番号→赤経・赤緯を取得する。
async function fetchHipPositionsFromSimbad(hipIds) {
  if (!hipIds.length) return {};

  const SIMBAD_TAP_URL = "https://simbad.cds.unistra.fr/simbad/sim-tap/sync";
  const CHUNK_SIZE = 20; // URL 長すぎ・400 回避のため控えめに分割
  const stars = {};
  const missing = [];

  const chunks = [];
  for (let i = 0; i < hipIds.length; i += CHUNK_SIZE) {
    chunks.push(hipIds.slice(i, i + CHUNK_SIZE));
  }

  for (const chunk of chunks) {
    const idList = chunk.map((id) => `'HIP ${id}'`).join(", ");
    const query = `
      SELECT i.id AS hip_id, b.ra AS ra_deg, b.dec AS dec_deg
      FROM ident AS i
      JOIN basic AS b ON b.oid = i.oid
      WHERE i.id IN (${idList})
    `;

    const params = new URLSearchParams({
      request: "doQuery",
      lang: "ADQL",
      format: "json",
      query,
    });

    // POST で送ることで長いクエリでも安定させる。
    const res = await fetch(SIMBAD_TAP_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });
    if (!res.ok) {
      // エラー内容を取得してメッセージに含める（TAP は 400 時に詳細を返す）
      const detail = await safeReadText(res);
      throw new Error(`SIMBAD から座標を取得できませんでした (${res.status}): ${detail}`);
    }

    const json = await res.json();
    const fields = json?.metadata || json?.fields || [];

    const hipIdx = fields.findIndex((f) => (f?.name || "").toLowerCase() === "hip_id");
    const raIdx = fields.findIndex((f) => (f?.name || "").toLowerCase() === "ra_deg");
    const decIdx = fields.findIndex((f) => (f?.name || "").toLowerCase() === "dec_deg");

    if (hipIdx === -1 || raIdx === -1 || decIdx === -1) {
      throw new Error("SIMBAD 応答の形式が想定と異なります (必要な列が見つかりません)");
    }

    for (const row of json.data || []) {
      const rawId = row[hipIdx];
      const ra = row[raIdx];
      const dec = row[decIdx];
      if (rawId == null || ra == null || dec == null) continue;

      const num = String(rawId).replace(/hip\s*/i, "").trim();
      const key = `HIP_${num}`;
      stars[key] = { ra: Number(ra), dec: Number(dec) };
    }
  }

  // 不足分をメモしておき、呼び出し側でエラーにする。
  for (const id of hipIds) {
    if (!stars[`HIP_${id}`]) {
      missing.push(id);
    }
  }

  if (missing.length) {
    throw new Error(`SIMBAD に見つからない HIP 番号があります: ${missing.join(", ")}`);
  }

  return stars;
}
