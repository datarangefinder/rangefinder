import { YEAR_MIN } from './TimeScale.js';
import { DEFAULT_TIMELINE_SPAN, clampTimelineSpan } from './TimelineViewport.js';

/**
 * StateManager.js
 * アプリ全体の状態を管理するシングルトン
 * EventEmitter パターンで変化を通知
 */

class StateManager extends EventTarget {
  constructor() {
    super();

    this._state = {
      mode: '3d',                    // 'move' | '3d' | '2d'
      currentYear: YEAR_MIN,          // 現在フォーカス中の年
      movementFocusYear: null,        // 移動モードでモニター正面にある年（年表の焦点とは独立）
      selectedEvent: null,           // 選択中のイベント
      zoomLevel: 1.0,                // ズームレベル (2D)
      timelineSpanYears: DEFAULT_TIMELINE_SPAN,
      activeCategories: new Set([    // 表示中カテゴリ
        'astronomy', 'geology', 'biology',
        'civilization', 'technology', 'japan',
        'culture', 'future'
      ]),
      searchQuery: '',
      isTransitioning: false,
      totalEvents: 0,
      visibleEvents: 0,
    };
  }

  get state() { return { ...this._state }; }

  /**
   * 状態を更新してイベントを発火
   * @param {Partial<typeof this._state>} patch
   */
  update(patch) {
    const prev = { ...this._state };
    Object.assign(this._state, patch);

    // 変化したキーごとにイベント発火
    for (const key of Object.keys(patch)) {
      this.dispatchEvent(new CustomEvent('change:' + key, {
        detail: { value: this._state[key], prev: prev[key] }
      }));
    }

    // 汎用変更イベント
    this.dispatchEvent(new CustomEvent('change', {
      detail: { patch, prev }
    }));
  }

  /** 購読ショートカット */
  on(eventName, handler) {
    this.addEventListener(eventName, handler);
    return () => this.removeEventListener(eventName, handler);
  }

  /** モード切り替え */
  setMode(mode) {
    if (this._state.mode === mode) return;
    this.update({ mode, isTransitioning: true });
  }

  /** 年をフォーカス */
  setYear(year) {
    this.update({ currentYear: year });
  }

  setTimelineSpan(span) {
    this.update({ timelineSpanYears: clampTimelineSpan(span) });
  }

  /** イベント選択 */
  selectEvent(ev) {
    this.update({ selectedEvent: ev });
  }

  /** カテゴリトグル */
  toggleCategory(cat) {
    const cats = new Set(this._state.activeCategories);
    if (cat === 'all') {
      if (cats.size === 8) {
        cats.clear();
      } else {
        ['astronomy','geology','biology','civilization','technology','japan','culture','future'].forEach(c => cats.add(c));
      }
    } else {
      cats.has(cat) ? cats.delete(cat) : cats.add(cat);
    }
    this.update({ activeCategories: cats });
  }
}

// シングルトンエクスポート
export const state = new StateManager();
