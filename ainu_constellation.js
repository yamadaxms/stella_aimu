// --- データ定義（JSONから読み込むため初期値は空） ---
// 星データ（HIP番号→座標等）
let stars = {};
// アイヌ民族星座定義（星座線やラベル情報を含む）
let folkloreConstellations = [];
// 市町村→予報区マッピング
let cityToForecastArea = {};
// 予報区→エリアマッピング
let forecastAreaToArea = {};

// Stellarium Web Engine用グローバル変数
let sweViewer = null;

// --- データ一括ロード関数 ---
// stars_data.json, constellation_data.json, city_to_forecast_area.json を並列fetchし、各変数に格納する
async function loadData() {
  try {
    // 3つのJSONファイルを同時に取得
    const [starsRes, constRes, cityRes] = await Promise.all([
      fetch('stars_data.json'),
      fetch('constellation_data.json'),
      fetch('city_to_forecast_area.json')
    ]);
    // 星データを格納
    stars = await starsRes.json();
    // 星座定義データを格納
    folkloreConstellations = await constRes.json();
    // 市町村・予報区データを格納
    const cityData = await cityRes.json();
    cityToForecastArea = cityData.cityToForecastArea;
    forecastAreaToArea = cityData.forecastAreaToArea;
  } catch (e) {
    alert('データの読み込みに失敗しました。ページを再読み込みしてください。');
    throw e;
  }
}

// --- 逆ジオコーディングAPIで市町村名を取得 ---
// Nominatim(OpenStreetMap)を利用し、緯度経度から市町村名を取得する
// lat: 緯度, lng: 経度
// 戻り値: 市町村名（市・町・村・郡の順で最初に見つかったもの）
async function reverseGeocode(lat, lng) {
  // Nominatim APIのURLを生成
  const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=10&addressdetails=1`;
  // APIリクエスト
  const res = await fetch(url);
  const data = await res.json();
  // 市・町・村・郡の順で最初に見つかったものを返す
  return data.address.city || data.address.town || data.address.village || data.address.county || '';
}

// --- Stellarium Web Engineの初期化 ---
// Stellarium Web EngineのViewerを初期化し、グローバル変数sweViewerに格納する
async function initStellariumWebEngine() {
  return new Promise((resolve) => {
    if (window.StellariumWebEngine) {
      sweViewer = new window.StellariumWebEngine.Viewer({
        container: document.getElementById('stellarium-container'),
        baseUrl: 'https://unpkg.com/stellarium-web-engine/dist/',
        // 必要に応じて初期設定
        // fov: 60,
        // ra: 90,
        // dec: 0,
      });
      // 少し待ってからresolve（canvasサイズ確定のため）
      setTimeout(resolve, 1000);
    } else {
      // スクリプトロード待ち
      setTimeout(() => initStellariumWebEngine().then(resolve), 200);
    }
  });
}

// --- SVGでアイヌ民族の星文化を描画（Stellarium Web Engine連動） ---
// 指定された予報区（forecastArea）に対応するエリアの星座をSVGで描画する
function drawFolkloreConstellations(forecastArea) {
  // 予報区からエリア名を取得
  const area = forecastAreaToArea[forecastArea] || '';
  const svg = document.getElementById('star-svg');
  const stellariumDiv = document.getElementById('stellarium-container');
  // SVGサイズをStellarium表示領域に合わせる
  svg.setAttribute('width', stellariumDiv.offsetWidth);
  svg.setAttribute('height', stellariumDiv.offsetHeight);
  svg.innerHTML = '';

  // 赤経・赤緯(ra/dec)を画面座標に変換する関数
  function eqToScreen(ra, dec) {
    if (!sweViewer) return { x: -1000, y: -1000 };
    // ra/decは度単位
    const pt = sweViewer.equatorialToScreen(ra, dec);
    return { x: pt[0], y: pt[1] };
  }

  // 視野角（FOV）に応じて星座線やラベルのサイズを調整
  const fov = sweViewer && sweViewer.getFov ? sweViewer.getFov() : 60;
  const baseStroke = 3;
  const strokeWidth = Math.max(1, baseStroke * (60 / fov));
  const baseFontSize = 20;
  const fontSize = Math.max(10, baseFontSize * (60 / fov));

  // 各星座定義ごとに描画処理
  folkloreConstellations.forEach(folklore => {
    // このエリアで表示対象かどうか判定
    let show = false;
    if (folklore.names && folklore.names[area]) show = true;
    if (folklore.description && typeof folklore.description === 'object' && folklore.description[area]) show = true;
    if (folklore.description && typeof folklore.description === 'string') show = true;
    if (!area) show = false;
    if (!show) return;

    // --- 星座線の描画 ---
    folklore.lines.forEach(line => {
      // 配列（2星を結ぶ線）の場合のみ描画
      if (Array.isArray(line) && line.length === 2 && stars[line[0]] && stars[line[1]]) {
        const s1 = eqToScreen(stars[line[0]].ra, stars[line[0]].dec);
        const s2 = eqToScreen(stars[line[1]].ra, stars[line[1]].dec);
        svg.innerHTML += `<line x1="${s1.x}" y1="${s1.y}" x2="${s2.x}" y2="${s2.y}" stroke="orange" stroke-width="${strokeWidth}" />`;
      }
      // 単一恒星（点のみ）は線としては描画しない
    });

    // --- ラベル位置の決定 ---
    let labelPos = null;
    if (folklore.lines && folklore.lines.length > 0) {
      if (folklore.lines.length === 1) {
        // linesが1つだけの場合
        const line = folklore.lines[0];
        if (Array.isArray(line) && line.length === 2 && stars[line[0]] && stars[line[1]]) {
          // 2つの星を結ぶ線の中点にラベル
          const ra1 = stars[line[0]].ra;
          const dec1 = stars[line[0]].dec;
          const ra2 = stars[line[1]].ra;
          const dec2 = stars[line[1]].dec;
          const centerRa = (ra1 + ra2) / 2;
          const centerDec = (dec1 + dec2) / 2;
          labelPos = eqToScreen(centerRa, centerDec);
        } else if (typeof line === 'string' && stars[line]) {
          // 単一恒星の場合はその恒星の位置にラベル
          labelPos = eqToScreen(stars[line].ra, stars[line].dec);
        }
      } else {
        // 複数linesの場合は、全ての星の重心にラベル
        const starSet = new Set();
        folklore.lines.forEach(line => {
          if (Array.isArray(line)) {
            starSet.add(line[0]);
            starSet.add(line[1]);
          } else if (typeof line === 'string') {
            starSet.add(line);
          }
        });
        let sumRa = 0, sumDec = 0, count = 0;
        starSet.forEach(starId => {
          if (stars[starId]) {
            sumRa += stars[starId].ra;
            sumDec += stars[starId].dec;
            count++;
          }
        });
        if (count > 0) {
          const centerRa = sumRa / count;
          const centerDec = sumDec / count;
          labelPos = eqToScreen(centerRa, centerDec);
        }
      }
    }

    // --- ラベル描画 ---
    if (labelPos) {
      const name = folklore.names[area] || '';
      svg.innerHTML += `<text x="${labelPos.x + 10}" y="${labelPos.y - 10}" fill="orange" font-size="${fontSize}" data-constellation="${folklore.code || ''}" style="cursor:pointer;">${name}</text>`;
    }
  });

  // --- 星座名クリック時の詳細表示イベント設定 ---
  svg.querySelectorAll('text[data-constellation]').forEach(el => {
    el.addEventListener('click', function(e) {
      const id = this.getAttribute('data-constellation');
      const cons = folkloreConstellations.find(f => (f.code || '') === id);
      if (!cons) return;
      const name = cons.names[area] || '';
      let desc = '';
      if (typeof cons.description === 'object' && cons.description[area]) desc = cons.description[area];
      else if (typeof cons.description === 'string') desc = cons.description;
      document.getElementById('detail-content').innerHTML =
        `<b>星座名:</b> ${name}<br>` + (desc ? `<b>説明:</b> ${desc}` : '');
    });
  });
}

// --- 地域選択・GPS判定時の描画処理 ---
// 予報区名を受け取り、星座描画関数を呼び出す
function updateFolkloreConstellations(area) {
  drawFolkloreConstellations(area);
}

// --- 初期化処理 ---
// データロード後、ボタン・セレクトボックスのイベント設定と初期描画を行う
async function init() {
  await loadData();
  await initStellariumWebEngine();

  // 予報区リストをcity_to_forecast_area.jsonから動的生成
  const areaSelect = document.getElementById('area-select');
  // 既存option（初期値）以外をクリア
  areaSelect.innerHTML = '<option value="">地域を選択</option>';
  Object.keys(forecastAreaToArea).forEach(forecastArea => {
    const opt = document.createElement('option');
    opt.value = forecastArea;
    opt.textContent = forecastArea;
    areaSelect.appendChild(opt);
  });

  // Stellariumの視野移動・ズーム時にSVG再描画
  if (sweViewer) {
    sweViewer.on('viewChange', () => {
      const area = document.getElementById('area-select').value;
      updateFolkloreConstellations(area);
    });
  }

  // ウィンドウリサイズ時にもSVGサイズを再調整
  window.addEventListener('resize', () => {
    // 現在選択中のエリアで再描画
    const area = document.getElementById('area-select').value;
    updateFolkloreConstellations(area);
  });

  // GPSボタン押下時の処理
  document.getElementById('gps-btn').onclick = async function() {
    if (!navigator.geolocation) {
      alert('Geolocation APIが利用できません');
      return;
    }
    // 位置情報取得
    navigator.geolocation.getCurrentPosition(async pos => {
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      // 逆ジオコーディングで市町村名取得
      const city = await reverseGeocode(lat, lng); // 市町村名取得
      // 市町村名から予報区名を取得
      const forecastArea = cityToForecastArea[city] || '';
      if (!forecastArea) {
        alert('対応する地域が見つかりませんでした（市町村名: ' + city + '）');
        return;
      }
      // 市町村名を画面に表示
      let cityInfo = document.getElementById('city-info');
      if (!cityInfo) {
        cityInfo = document.createElement('div');
        cityInfo.id = 'city-info';
        cityInfo.style.margin = '0.5em 0 1em 0';
        document.getElementById('area-select').insertAdjacentElement('beforebegin', cityInfo);
      }
      cityInfo.textContent = `現在地の市町村: ${city}`;
      // セレクトボックスの値を更新
      document.getElementById('area-select').value = forecastArea;
      // 星座描画を更新
      updateFolkloreConstellations(forecastArea);
    }, err => {
      alert('位置情報の取得に失敗しました');
    });
  };

  // 地域セレクトボックス変更時の処理
  document.getElementById('area-select').onchange = function() {
    updateFolkloreConstellations(this.value);
  };

  // ページ初期表示時の描画（空で初期化）
  updateFolkloreConstellations('');
}

// --- ページロード時に初期化 ---

init();
