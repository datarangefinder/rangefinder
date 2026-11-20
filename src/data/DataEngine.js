/**
 * DataEngine.js
 * 100K件対応のイベントデータ管理エンジン
 * - ソート済み配列 + バイナリサーチで O(log n) 範囲クエリ
 * - カテゴリ・重要度フィルタ
 * - WebWorker 連携検索
 */

import { yearToZ } from '../core/TimeScale.js';

export class DataEngine {
  constructor() {
    /** @type {Array} ソート済み全イベント (year昇順) */
    this._events = [];

    /** カテゴリ別インデックス */
    this._byCat = {};

    /** id → event マップ */
    this._byId = new Map();

    /** 検索Worker */
    this._worker = null;
    this._pendingSearches = new Map();
    this._searchIdCounter = 0;
  }

  /**
   * イベント配列を登録
   * @param {Array} events
   */
  load(events) {
    // year 昇順でソート
    this._events = [...events].sort((a, b) => a.year - b.year);

    // カテゴリ・idインデックス構築
    this._byCat = {};
    this._byId.clear();
    for (const ev of this._events) {
      if (!this._byCat[ev.category]) this._byCat[ev.category] = [];
      this._byCat[ev.category].push(ev);
      this._byId.set(ev.id, ev);

      // Z座標を事前計算してキャッシュ
      ev._z = yearToZ(ev.year);
    }

    // Worker 初期化
    this._initWorker();

    console.log(`[DataEngine] ${this._events.length}件ロード完了`);
    return this;
  }

  /** 追加ロード (100K件対応: 分割ロードに使用) */
  append(events) {
    for (const ev of events) {
      ev._z = yearToZ(ev.year);
      this._byId.set(ev.id, ev);
      if (!this._byCat[ev.category]) this._byCat[ev.category] = [];
      this._byCat[ev.category].push(ev);
    }
    // 再ソート (追加頻度が低い前提でシンプルに)
    this._events = [...this._byId.values()].sort((a, b) => a.year - b.year);
    return this;
  }

  get totalCount() { return this._events.length; }

  /**
   * 年の範囲 + カテゴリでイベントを取得
   * @param {number} yearStart
   * @param {number} yearEnd
   * @param {Set<string>} categories  null=全て
   * @param {number} maxCount
   * @param {number} minImportance
   * @returns {Array}
   */
  query(yearStart, yearEnd, categories = null, maxCount = 500, minImportance = 1) {
    const lo = this._lowerBound(yearStart);
    const hi = this._upperBound(yearEnd);

    const result = [];
    for (let i = lo; i < hi && result.length < maxCount; i++) {
      const ev = this._events[i];
      if (ev.importance < minImportance) continue;
      if (categories && !categories.has(ev.category)) continue;
      result.push(ev);
    }
    return result;
  }

  /**
   * Z座標範囲でイベントを取得 (3D描画用)
   * @param {number} zMin
   * @param {number} zMax
   * @param {Set<string>} categories
   * @param {number} maxCount
   * @param {number} minImportance
   * @returns {Array}
   */
  queryByZ(zMin, zMax, categories = null, maxCount = 500, minImportance = 1) {
    const result = [];
    for (const ev of this._events) {
      if (ev._z < zMin || ev._z > zMax) continue;
      if (ev.importance < minImportance) continue;
      if (categories && !categories.has(ev.category)) continue;
      result.push(ev);
      if (result.length >= maxCount) break;
    }
    return result;
  }

  /** id でイベント取得 */
  getById(id) { return this._byId.get(id); }

  /**
   * 全文検索 (WebWorker経由)
   * @param {string} query
   * @returns {Promise<Array>}
   */
  search(query) {
    if (!query || query.length < 1) return Promise.resolve([]);
    if (!this._worker) return Promise.resolve(this._localSearch(query));

    return new Promise((resolve) => {
      const id = ++this._searchIdCounter;
      this._pendingSearches.set(id, resolve);
      this._worker.postMessage({ type: 'search', id, query });
    });
  }

  /** Worker なしのフォールバック検索 */
  _localSearch(query) {
    const q = query.toLowerCase();
    const results = [];
    for (const ev of this._events) {
      if (
        ev.title.includes(query) ||
        ev.description.includes(query) ||
        (ev.tags && ev.tags.some(t => t.includes(query)))
      ) {
        results.push(ev);
        if (results.length >= 20) break;
      }
    }
    return results;
  }

  /** Worker 初期化 */
  _initWorker() {
    try {
      const workerUrl = new URL('../workers/search.worker.js', import.meta.url);
      this._worker = new Worker(workerUrl, { type: 'module' });
      this._worker.postMessage({ type: 'load', events: this._events });
      this._worker.onmessage = (e) => {
        const { id, results } = e.data;
        const resolve = this._pendingSearches.get(id);
        if (resolve) {
          this._pendingSearches.delete(id);
          resolve(results.map(r => this._byId.get(r.id)).filter(Boolean));
        }
      };
    } catch (err) {
      console.warn('[DataEngine] Worker初期化失敗、ローカル検索にフォールバック:', err);
      this._worker = null;
    }
  }

  // === バイナリサーチ ===
  _lowerBound(year) {
    let lo = 0, hi = this._events.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (this._events[mid].year < year) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }
  _upperBound(year) {
    let lo = 0, hi = this._events.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (this._events[mid].year <= year) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }
}
