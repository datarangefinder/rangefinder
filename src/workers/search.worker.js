/**
 * search.worker.js
 * 全文検索をバックグラウンドスレッドで実行
 * UIブロックなしで 100K件検索対応
 */

/** @type {Array} */
let events = [];
/** 転置インデックス: token → [eventId] */
const index = new Map();

/**
 * イベントをトークナイズしてインデックス構築
 */
function buildIndex(evs) {
  index.clear();
  for (const ev of evs) {
    const tokens = tokenize(ev.title + ' ' + ev.description + ' ' + (ev.tags || []).join(' '));
    for (const tok of tokens) {
      if (!index.has(tok)) index.set(tok, []);
      index.get(tok).push(ev.id);
    }
  }
}

function tokenize(text) {
  // 日本語は文字単位、アルファベットは単語単位
  const tokens = new Set();
  const lower = text.toLowerCase();

  // 2〜4文字のサブストリング (n-gram)
  for (let n = 2; n <= 4; n++) {
    for (let i = 0; i <= lower.length - n; i++) {
      tokens.add(lower.slice(i, i + n));
    }
  }
  return tokens;
}

/**
 * クエリ文字列で検索
 * @param {string} query
 * @returns {Array<{id:string}>}
 */
function search(query) {
  if (!query || query.length < 1) return [];

  const q = query.toLowerCase();

  // クエリのn-gram
  const qTokens = [...tokenize(q)];
  if (qTokens.length === 0) return [];

  // 各トークンにマッチするIDを集める
  const scores = new Map();
  for (const tok of qTokens) {
    const ids = index.get(tok);
    if (!ids) continue;
    for (const id of ids) {
      scores.set(id, (scores.get(id) || 0) + 1);
    }
  }

  // スコア降順でソート、最大20件返す
  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([id]) => ({ id }));
}

self.onmessage = (e) => {
  const { type, id, query, events: evData } = e.data;

  if (type === 'load') {
    events = evData;
    buildIndex(events);
    self.postMessage({ type: 'ready', count: events.length });
  } else if (type === 'search') {
    const results = search(query);
    self.postMessage({ type: 'result', id, results });
  }
};
