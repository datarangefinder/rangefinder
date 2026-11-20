/**
 * TimeScale.js
 * 宇宙誕生〜西暦3000年の時間軸を3D座標・2D座標に変換するエンジン
 *
 * 設計:
 *   - 宇宙誕生から未来まで、一貫した線形スケール
 */

// === 定数 ===
export const YEAR_MIN = -13_800_000_000; // 宇宙誕生（ビッグバン）
export const YEAR_MAX = 3_000;            // 西暦3000年

// 3D Z座標の範囲 (大きいほど奥 = 未来側)
const Z_MIN = 0;
const Z_MAX = 1200;

/**
 * 年 → 3D Z座標
 * @param {number} year  実年 (負=過去)
 * @returns {number} Three.js Z値
 */
export function yearToZ(year) {
  const clamped = Math.max(YEAR_MIN, Math.min(YEAR_MAX, year));
  const t = (clamped - YEAR_MIN) / (YEAR_MAX - YEAR_MIN);
  return Z_MIN + t * (Z_MAX - Z_MIN);
}

/**
 * 3D Z座標 → 年
 * @param {number} z
 * @returns {number}
 */
export function zToYear(z) {
  const clamped = Math.max(Z_MIN, Math.min(Z_MAX, z));
  const t = (clamped - Z_MIN) / (Z_MAX - Z_MIN);
  return YEAR_MIN + t * (YEAR_MAX - YEAR_MIN);
}

/**
 * 年 → 表示文字列
 * @param {number} year
 * @returns {string}
 */
export function yearToLabel(year) {
  const abs = Math.abs(year);
  const suffix = year < 0 ? '前' : (year === 0 ? '' : '');

  if (abs >= 1_000_000_000) {
    const oku = abs / 100_000_000;
    return `${Number.isInteger(oku) ? oku : oku.toFixed(1)}億年${suffix}`;
  } else if (abs >= 10_000_000) {
    return `${Math.round(abs / 1_000_000)}百万年${suffix}`;
  } else if (abs >= 1_000_000) {
    return `${(abs / 1_000_000).toFixed(1)}百万年${suffix}`;
  } else if (abs >= 10_000) {
    return `${Math.round(abs / 10_000)}万年${suffix}`;
  } else if (abs >= 1_000) {
    return `${Math.round(abs / 1_000)}千年${suffix}`;
  } else if (year < 0) {
    return `紀元前${abs}年`;
  } else if (year === 0) {
    return '西暦1年';
  } else {
    return `西暦${year}年`;
  }
}

/**
 * 年から時代名を返す
 * @param {number} year
 * @returns {{ name: string, color: string }}
 */
export function getEra(year) {
  year = Math.floor(year);
  if (year < -4_600_000_000)  return { name: '宇宙誕生', color: '#7257ff' };
  if (year <= -4_000_000_000) return { name: '冥王代', color: '#ff2200' };
  if (year <= -2_500_000_000) return { name: '始生代', color: '#cc4400' };
  if (year <= -541_000_000)   return { name: '原生代', color: '#886600' };
  if (year <= -485_000_000)   return { name: 'カンブリア紀', color: '#44aa44' };
  if (year <= -419_000_000)   return { name: 'オルドビス紀〜シルル紀', color: '#33bb55' };
  if (year <= -359_000_000)   return { name: 'デボン紀', color: '#22cc66' };
  if (year <= -299_000_000)   return { name: '石炭紀', color: '#11aa77' };
  if (year <= -252_000_000)   return { name: 'ペルム紀', color: '#009988' };
  if (year <= -201_000_000)   return { name: '三畳紀', color: '#ddaa00' };
  if (year <= -145_000_000)   return { name: 'ジュラ紀', color: '#cc8800' };
  if (year <= -66_000_000)    return { name: '白亜紀', color: '#bb7700' };
  if (year <= -23_000_000)    return { name: '古第三紀', color: '#3388cc' };
  if (year <= -2_600_000)     return { name: '新第三紀', color: '#2266bb' };
  if (year <= -11_700)        return { name: '更新世（氷河期）', color: '#1155aa' };
  if (year <= -3_500)         return { name: '完新世・先史', color: '#7755cc' };
  if (year <= 476)            return { name: '古代', color: '#8866dd' };
  if (year <= 1500)           return { name: '中世', color: '#6677cc' };
  if (year <= 1800)           return { name: '近世', color: '#5588dd' };
  if (year <= 1945)           return { name: '近代', color: '#4499ee' };
  if (year <= 2024)           return { name: '現代', color: '#00e5ff' };
  return { name: '未来', color: '#7fff00' };
}

/**
 * 2Dタイムライン用: 年 → キャンバスX座標
 * @param {number} year
 * @param {number} viewCenterYear  現在の中心年
 * @param {number} pxPerUnit       1単位(linearity)あたりのピクセル
 * @param {number} canvasWidth
 * @returns {number}
 */
export function yearToCanvasX(year, viewCenterYear, pxPerUnit, canvasWidth) {
  const centerZ = yearToZ(viewCenterYear);
  const z = yearToZ(year);
  return canvasWidth / 2 + (z - centerZ) * pxPerUnit;
}

/**
 * キャンバスX → 年
 */
export function canvasXToYear(x, viewCenterYear, pxPerUnit, canvasWidth) {
  const centerZ = yearToZ(viewCenterYear);
  const z = centerZ + (x - canvasWidth / 2) / pxPerUnit;
  return zToYear(z);
}
