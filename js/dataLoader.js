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
 * 星文化定義データ・市町村→エリア対応表を並列で取得し、
 * constellation_data.json内で使用されているHipparcos番号の恒星座標をSIMBADのTAP APIから動的に取得します。
 * 取得した全データをオブジェクトでまとめて返します。
 * @returns {Promise<{stars: Object, constellations: Array, cityMap: Object}>}
 *   stars: Hipparcos番号→座標（赤経・赤緯）
 *   constellations: 地域別星文化定義
 *   cityMap: 市町村→地域→文化地域の対応表
 * @throws {Error} - いずれかの取得失敗時
 */
async function loadAllAinuData() {
  // 星文化定義・市町村→エリア対応表を並列で取得
  const [constellations, cityMap] = await Promise.all([
    loadJSON("data/constellation_data.json"),
    loadJSON("data/city_map.json"),
  ]);

  // constellation_data.json内で使用されているHipparcos番号を抽出し、SIMBADのTAP APIから座標情報を取得
  const hipIds = collectHipIds(constellations);
  const stars = await fetchHipPositionsFromSimbad(hipIds);

  return {
    stars,           // { HIP_xxxxx: { ra, dec }, ... }  Hipparcos番号→座標（赤経・赤緯）
    constellations,  // [ { code, lines, namesPos, names:{area1..}, description:{area1..} }, ... ] 地域別星文化定義
    cityMap,         // { cities:{...}, regionToArea:{...} } 市町村→地域→文化地域の対応表
  };
}

/**
 * fetch失敗時にもレスポンスのテキスト内容を安全に取得するユーティリティ関数。
 * 例外発生時は"no detail"を返します。
 * @param {Response} res - fetchのレスポンスオブジェクト
 * @returns {Promise<string>} - レスポンステキストまたは"no detail"
 */
async function safeReadText(res) {
  try {
    return await res.text();
  } catch (_) {
    return "no detail";
  }
}

/**
 * constellation_data.json内の星文化定義からHipparcos番号（"HIP_"で始まる文字列）を抽出します。
 * 先頭ゼロは除去し、重複を排除した番号リストを返します。
 * @param {Array} constellations - 星文化定義データ
 * @returns {Array<string>} - Hipparcos番号リスト
 */
function collectHipIds(constellations) {
  const hipIds = new Set();

  const addIfHip = (raw) => {
    if (typeof raw !== "string") return;
    if (!raw.startsWith("HIP_")) return;
    const num = raw.slice(4).replace(/^0+/, ""); // 先頭ゼロを除去
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

/**
 * SIMBAD (CDS Strasbourg) のTAP APIを利用し、Hipparcos番号リストに対応する星の赤経・赤緯座標をまとめて取得します。
 * APIの仕様上、クエリは20件ずつ分割してPOST送信し、取得結果を統合します。
 * 取得できなかった番号はmissingとして記録し、エラーとしてthrowします。
 * @param {Array<string>} hipIds - Hipparcos番号リスト
 * @returns {Promise<Object>} - { HIP_xxxxx: { ra, dec }, ... } 形式の座標データ
 * @throws {Error} - API取得失敗時や必要な列が見つからない場合
 */
async function fetchHipPositionsFromSimbad(hipIds) {
  if (!hipIds.length) return {};

  const SIMBAD_TAP_URL = "https://simbad.cds.unistra.fr/simbad/sim-tap/sync";
  const CHUNK_SIZE = 20; // クエリ長制限回避のため20件ずつ分割
  const stars = {};
  const missing = [];

  const chunks = [];
  for (let i = 0; i < hipIds.length; i += CHUNK_SIZE) {
    chunks.push(hipIds.slice(i, i + CHUNK_SIZE));
  }

  for (const chunk of chunks) {
    // ADQLクエリを生成し、POSTで送信
    const idList = chunk.map((id) => `'HIP ${id}'`).join(", ");
    const query = `
      SELECT i.id AS hip_id, b.ra AS ra_deg, b.dec AS dec_deg
      FROM ident AS i
      JOIN basic AS b ON b.oid = i.oidref
      WHERE i.id IN (${idList})
    `;

    const params = new URLSearchParams({
      request: "doQuery",
      lang: "ADQL",
      format: "json",
      query,
    });

    // 長いクエリでも安定して送信できるようPOSTを利用
    const res = await fetch(SIMBAD_TAP_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });
    if (!res.ok) {
      // TAP APIは400時に詳細エラーを返すため、内容を取得して例外に含める
      const detail = await safeReadText(res);
      throw new Error(`SIMBAD から座標を取得できませんでした (${res.status}): ${detail}`);
    }

    const json = await res.json();
    const fields = json?.metadata || json?.fields || [];

    // 必要な列（hip_id, ra_deg, dec_deg）が存在するか検証
    const hipIdx = fields.findIndex((f) => (f?.name || "").toLowerCase() === "hip_id");
    const raIdx = fields.findIndex((f) => (f?.name || "").toLowerCase() === "ra_deg");
    const decIdx = fields.findIndex((f) => (f?.name || "").toLowerCase() === "dec_deg");

    if (hipIdx === -1 || raIdx === -1 || decIdx === -1) {
      throw new Error("SIMBAD 応答の形式が想定と異なります (必要な列が見つかりません)");
    }

    // 取得した各行データから座標情報を抽出
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

  // 取得できなかったHipparcos番号をmissingとして記録
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
