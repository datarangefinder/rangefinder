/**
 * HUD.js
 * ヘッドアップディスプレイ
 * - 移動/端末/年表 モード切り替え
 * - 時代インジケーター
 * - 検索
 * - カテゴリフィルタ
 * - 時代ジャンプ
 * - 詳細パネル
 */

import { yearToLabel } from '../core/TimeScale.js';
import { state } from '../core/StateManager.js';
import {
  MIN_TIMELINE_SPAN, MAX_TIMELINE_SPAN, DAYS_PER_YEAR,
  formatTimelineSpan, formatTimelineFocus,
  getTimelineWindow, timelineYearAtPosition,
} from '../core/TimelineViewport.js';

const CAT_LABEL = {
  astronomy: '宇宙', geology: '地質', biology: '生物',
  civilization: '文明', technology: '技術', japan: '日本',
  culture: '文化', future: '未来',
};

/** The DOM side panel belongs to the flat 2D timeline, not the 3D terminal. */
export function shouldShowDetailPanel(mode) {
  return mode === '2d';
}

/** Read the actual, boundary-clamped range used by the timeline renderer. */
export function getTimelineRangeReadout(centerYear, spanYears) {
  const viewport = getTimelineWindow(centerYear, spanYears);
  return ['left', 'center', 'right'].map((position, index) => {
    const year = timelineYearAtPosition(index / 2, viewport);
    const text = viewport.spanYears > 1 && year >= 0
      ? `西暦${Math.max(1, Math.floor(year))}年`
      : formatTimelineFocus(year, viewport.spanYears);
    return { position, year, text };
  });
}

export class HUD {
  constructor(dataEngine) {
    this.db = dataEngine;
    this._onModeChange = null;
    this._onJump = null;
    this._searchTimeout = null;
    this._init();
  }

  /**
   * モード切り替えコールバック登録
   * @param {Function} fn (mode: 'move'|'3d'|'2d') => void
   */
  onModeChange(fn) { this._onModeChange = fn; }

  setMode(mode) { this._setMode(mode); }

  /**
   * 年ジャンプコールバック登録
   * @param {Function} fn (year: number) => void
   */
  onJump(fn) { this._onJump = fn; }

  _init() {
    // モード切り替え
    document.getElementById('btn-move').addEventListener('click', () => {
      this._setMode('move');
    });
    document.getElementById('btn-3d').addEventListener('click', () => {
      this._setMode('3d');
    });
    document.getElementById('btn-2d').addEventListener('click', () => {
      this._setMode('2d');
    });

    const zoomSelect = document.getElementById('timeline-span');
    const zoomLabel = document.getElementById('timeline-span-label');
    const zoomIn = document.getElementById('timeline-zoom-in');
    const zoomOut = document.getElementById('timeline-zoom-out');
    const spans = new Map([
      ['full', MAX_TIMELINE_SPAN], ['billion', 1e9], ['million', 1e6],
      ['ten-thousand', 1e4], ['century', 100], ['year', 1], ['month', 1 / 12],
      ['week', 7 / DAYS_PER_YEAR], ['two-days', MIN_TIMELINE_SPAN],
    ]);
    const updateZoom = () => {
      const span = state.state.timelineSpanYears;
      zoomLabel.textContent = formatTimelineSpan(span);
      zoomSelect.querySelector('[value="current"]').textContent = formatTimelineSpan(span);
      zoomSelect.value = [...spans].find(([, value]) => Math.abs(value - span) <= value * 1e-10)?.[0] ?? 'current';
      zoomIn.disabled = span <= MIN_TIMELINE_SPAN * 1.00001;
      zoomOut.disabled = span >= MAX_TIMELINE_SPAN;
      this._updateEraIndicator(state.state.currentYear);
    };
    zoomSelect.addEventListener('change', () => {
      const span = spans.get(zoomSelect.value);
      if (span !== undefined) state.setTimelineSpan(span);
    });
    zoomIn.addEventListener('click', () => state.setTimelineSpan(state.state.timelineSpanYears / 2));
    zoomOut.addEventListener('click', () => state.setTimelineSpan(state.state.timelineSpanYears * 2));
    state.on('change:timelineSpanYears', updateZoom);
    updateZoom();

    // 検索
    const searchInput = document.getElementById('search-input');
    searchInput.addEventListener('input', (e) => {
      clearTimeout(this._searchTimeout);
      this._searchTimeout = setTimeout(() => {
        this._handleSearch(e.target.value.trim());
      }, 200);
    });
    searchInput.addEventListener('blur', () => {
      setTimeout(() => this._hideSearch(), 200);
    });

    // カテゴリフィルタ
    document.querySelectorAll('.filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const cat = btn.dataset.cat;
        state.toggleCategory(cat);
        this._updateFilterButtons();
      });
    });

    // 時代ジャンプ
    document.querySelectorAll('.era-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const year = parseFloat(btn.dataset.year);
        if (this._onJump) this._onJump(year);
        state.setYear(year);
      });
    });

    // 詳細パネルを閉じる
    document.getElementById('detail-close').addEventListener('click', () => {
      this.closeDetailPanel();
      state.selectEvent(null);
    });

    // 状態変化を購読
    state.on('change:currentYear', (e) => {
      this._updateEraIndicator(e.detail.value);
    });
    state.on('change:movementFocusYear', () => this._updateEraIndicator(state.state.currentYear));
    state.on('change:selectedEvent', (e) => {
      const ev = e.detail.value;
      if (ev && shouldShowDetailPanel(state.state.mode)) this.showDetailPanel(ev);
      else this.closeDetailPanel();
    });
    state.on('change:mode', () => {
      const { mode, selectedEvent } = state.state;
      if (selectedEvent && shouldShowDetailPanel(mode)) this.showDetailPanel(selectedEvent);
      else this.closeDetailPanel();
      this._updateEraIndicator(state.state.currentYear);
    });
    state.on('change:visibleEvents', (e) => {
      this._updateEventCount(e.detail.value);
    });

    // 初期状態
    this._updateEraIndicator(state.state.currentYear);
  }

  _setMode(mode) {
    document.getElementById('btn-move').classList.toggle('active', mode === 'move');
    document.getElementById('btn-3d').classList.toggle('active', mode === '3d');
    document.getElementById('btn-2d').classList.toggle('active', mode === '2d');

    if (this._onModeChange) this._onModeChange(mode);
  }

  _updateEraIndicator(year) {
    const { mode, timelineSpanYears, movementFocusYear } = state.state;
    for (let { position, text } of getTimelineRangeReadout(year, timelineSpanYears)) {
      if (position === 'center' && mode === 'move' && Number.isFinite(movementFocusYear)) {
        text = movementFocusYear >= 0 ? `西暦${Math.max(1, movementFocusYear)}年`
          : movementFocusYear <= -1_000_000 ? `${Math.abs(movementFocusYear).toLocaleString('ja-JP')}年前`
          : `紀元前${Math.abs(movementFocusYear)}年`;
      }
      const value = document.getElementById(`era-year-${position}`);
      if (value.textContent !== text) value.textContent = text;
      value.title = text;
    }
  }

  _updateEventCount(count) {
    const el = document.getElementById('event-count');
    el.textContent = `表示: ${count.toLocaleString()}件`;
  }

  async _handleSearch(query) {
    if (!query) { this._hideSearch(); return; }
    const results = await this.db.search(query);
    this._showSearchResults(results.slice(0, 8));
  }

  _showSearchResults(results) {
    const container = document.getElementById('search-results');
    container.innerHTML = '';
    if (results.length === 0) {
      container.classList.remove('visible');
      return;
    }
    for (const ev of results) {
      const item = document.createElement('div');
      item.className = 'search-item';
      item.innerHTML = `
        <div class="search-item-title">${ev.title}</div>
        <div class="search-item-year">${yearToLabel(ev.year)}</div>
      `;
      item.addEventListener('click', () => {
        state.setYear(ev.year);
        state.selectEvent(ev);
        if (this._onJump) this._onJump(ev.year);
        this._hideSearch();
        document.getElementById('search-input').value = '';
      });
      container.appendChild(item);
    }
    container.classList.add('visible');
  }

  _hideSearch() {
    document.getElementById('search-results').classList.remove('visible');
  }

  _updateFilterButtons() {
    const { activeCategories } = state.state;
    document.querySelectorAll('.filter-btn').forEach(btn => {
      const cat = btn.dataset.cat;
      if (cat === 'all') {
        btn.classList.toggle('active', activeCategories.size === 8);
      } else {
        btn.classList.toggle('active', activeCategories.has(cat));
      }
    });
  }

  // ==============================
  // 詳細パネル (2Dモード用)
  // ==============================
  showDetailPanel(ev) {
    const panel = document.getElementById('detail-panel');
    const catEl = document.getElementById('detail-category');
    const yearEl = document.getElementById('detail-year');
    const titleEl = document.getElementById('detail-title');
    const descEl = document.getElementById('detail-desc');
    const tagsEl = document.getElementById('detail-tags');

    const catColors = {
      astronomy: '#ffd700', geology: '#ff6b35', biology: '#00ff7f',
      civilization: '#4a9eff', technology: '#00e5ff', japan: '#ff6eb4',
      culture: '#da70d6', future: '#7fff00',
    };
    const color = catColors[ev.category] || '#00e5ff';

    catEl.textContent = `${this._getCatEmoji(ev.category)} ${CAT_LABEL[ev.category] || ev.category}`;
    catEl.style.color = color;
    catEl.style.borderColor = color + '80';
    catEl.style.background = color + '1a';

    yearEl.textContent = yearToLabel(ev.year);
    titleEl.textContent = ev.title;
    descEl.textContent = ev.description || '';

    tagsEl.innerHTML = (ev.tags || []).map(t =>
      `<span class="detail-tag">${t}</span>`
    ).join('');

    panel.classList.add('open');
  }

  closeDetailPanel() {
    document.getElementById('detail-panel').classList.remove('open');
  }

  _getCatEmoji(cat) {
    const em = { astronomy:'🌌', geology:'🌋', biology:'🦕', civilization:'🏛️',
                  technology:'⚡', japan:'⛩️', culture:'🎨', future:'🚀' };
    return em[cat] || '◈';
  }
}
