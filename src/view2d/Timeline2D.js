/**
 * Timeline2D.js
 * Canvas 2D 横スクロール年表
 * - 線形スケール対応
 * - ピン描画 (カテゴリ色)
 * - ミニマップ
 * - ドラッグ/ズーム操作
 */

import {
  yearToZ, zToYear, yearToLabel, getEra,
  YEAR_MIN, YEAR_MAX,
} from '../core/TimeScale.js';
import {
  getTimelineWindow, getTimelineTicks, timelineYearPosition, timelineYearAtPosition,
} from '../core/TimelineViewport.js';
import { state } from '../core/StateManager.js';

const CAT_COLORS = {
  astronomy:    '#ffd700',
  geology:      '#ff6b35',
  biology:      '#00ff7f',
  civilization: '#4a9eff',
  technology:   '#00e5ff',
  japan:        '#ff6eb4',
  culture:      '#da70d6',
  future:       '#7fff00',
};

const CAT_EMOJI = {
  astronomy: '🌌', geology: '🌋', biology: '🦕',
  civilization: '🏛️', technology: '⚡', japan: '⛩️',
  culture: '🎨', future: '🚀',
};

export class Timeline2D {
  constructor(canvas, dataEngine) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.db = dataEngine;

    this.width = canvas.width;
    this.height = canvas.height;

    // ビュー状態
    this.viewCenterYear = state.state.currentYear;
    this.viewSpanYears = state.state.timelineSpanYears;
    state.on('change:timelineSpanYears', (event) => {
      this.viewSpanYears = event.detail.value;
    });
    state.on('change:currentYear', (event) => {
      this.viewCenterYear = event.detail.value;
    });

    // ドラッグ
    this.isDragging = false;
    this.activePointerId = null;
    this.dragMode = null;
    this.dragMoved = false;
    this.dragStartX = 0;
    this.dragStartY = 0;
    this.dragStartCenterYear = 0;

    // ミニマップ
    this.MM_H = 60;
    this.MM_Y = this.height - this.MM_H - 10;
    this.minimapHovered = false;

    // アニメーション
    this._running = false;
    this._animId = null;
    this._pinOpacity = 0;

    // ホバー
    this.hoveredEvent = null;
    this.pinRects = []; // クリック判定用 [{ev, x, y, r}]

    this._bindEvents();
  }

  resize(w, h) {
    this._cancelDrag();
    this.width = w;
    this.height = h;
    this.canvas.width = w;
    this.canvas.height = h;
    this.MM_Y = h - this.MM_H - 10;
  }

  // ==============================
  // 描画
  // ==============================
  draw() {
    const ctx = this.ctx;
    const W = this.width, H = this.height;
    this._viewWindow = getTimelineWindow(this.viewCenterYear, this.viewSpanYears);

    // 背景
    ctx.fillStyle = '#020408';
    ctx.fillRect(0, 0, W, H);

    // 時代ゾーン背景
    this._drawEraZones(ctx, W, H);

    // グリッド目盛り
    this._drawGrid(ctx, W, H);

    // イベントピン
    this._drawPins(ctx, W, H);

    // 中央ライン
    ctx.strokeStyle = '#00e5ff';
    ctx.globalAlpha = 0.3;
    ctx.lineWidth = 1;
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    ctx.moveTo(0, H / 2);
    ctx.lineTo(W, H / 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;

    // 現在位置インジケーター（中央）
    ctx.strokeStyle = '#00e5ff';
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.8;
    ctx.beginPath();
    ctx.moveTo(W / 2, H / 2 - 20);
    ctx.lineTo(W / 2, H / 2 + 20);
    ctx.stroke();
    ctx.globalAlpha = 1;

    // ミニマップ
    this._drawMinimap(ctx, W);
  }

  _drawEraZones(ctx, W, H) {
    const eras = [
      { year: YEAR_MIN,        color: 'rgba(114,87,255,0.07)' },
      { year: -4_600_000_000, color: 'rgba(255,34,0,0.06)' },
      { year: -2_500_000_000, color: 'rgba(180,60,0,0.06)' },
      { year: -541_000_000,   color: 'rgba(60,160,60,0.06)' },
      { year: -252_000_000,   color: 'rgba(200,150,0,0.06)' },
      { year: -66_000_000,    color: 'rgba(50,120,200,0.06)' },
      { year: -10_000,        color: 'rgba(100,80,180,0.06)' },
      { year: 1,              color: 'rgba(120,100,200,0.06)' },
      { year: 1500,           color: 'rgba(80,120,200,0.06)' },
      { year: 1868,           color: 'rgba(0,180,220,0.08)' },
      { year: 2025,           color: 'rgba(100,220,0,0.08)' },
      { year: YEAR_MAX,       color: 'transparent' },
    ];

    for (let i = 0; i < eras.length - 1; i++) {
      const x0 = this._xForYear(eras[i].year);
      const x1 = this._xForYear(eras[i + 1].year);
      if (x1 < 0 || x0 > W) continue;

      ctx.fillStyle = eras[i].color;
      ctx.fillRect(Math.max(0, x0), 0, Math.min(W, x1) - Math.max(0, x0), H - this.MM_H - 20);

      // 時代ラベル
      const mx = Math.max(0, x0) + 8;
      if (mx < W - 50) {
        ctx.font = '11px Orbitron, monospace';
        ctx.fillStyle = 'rgba(0,229,255,0.4)';
        ctx.fillText(getEra(eras[i].year).name, mx, 24);
      }
    }
  }

  _drawGrid(ctx, W, H) {
    // 表示中の年の範囲を計算
    const ticks = getTimelineTicks(this._viewWindow, this._getPlotBounds(W).width);

    ctx.lineWidth = 1;
    for (const { year, label, major } of ticks) {
      const x = this._xForYear(year);
      if (x < 0 || x > W) continue;

      ctx.strokeStyle = major ? 'rgba(0,229,255,0.25)' : 'rgba(0,229,255,0.08)';
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H - this.MM_H - 20);
      ctx.stroke();

      if (major && label) {
        ctx.font = '11px "Noto Sans JP", sans-serif';
        ctx.fillStyle = 'rgba(0,229,255,0.6)';
        ctx.fillText(label, x + 4, H - this.MM_H - 30);
      }
    }
  }

  _getPlotBounds(width = this.width) {
    const inset = Math.min(24, width / 4);
    return {
      left: inset, right: width - inset, width: Math.max(1, width - inset * 2),
      top: 24, bottom: Math.max(24, this.MM_Y - 24),
    };
  }

  _xForYear(year) {
    const bounds = this._getPlotBounds();
    return bounds.left + timelineYearPosition(year, this._viewWindow) * bounds.width;
  }

  _drawPins(ctx, W, H) {
    const { activeCategories } = state.state;
    const bounds = this._getPlotBounds(W);
    const { minYear: yearL, maxYear: yearR } = this._viewWindow;

    const events = this.db.query(yearL, yearR, activeCategories, 1000, 1);

    this.pinRects = [];

    // レーン割り当て（カテゴリごとにY位置を変える）
    const catLanes = {};
    let laneIdx = 0;
    for (const cat of activeCategories) {
      catLanes[cat] = laneIdx++;
    }
    const laneCount = Math.max(1, activeCategories.size);
    const baseY = Math.min(bounds.bottom, Math.max(bounds.top, 60));
    const laneH = (bounds.bottom - baseY) / laneCount;

    for (const ev of events) {
      const x = this._xForYear(ev.year);
      // Bound only the centers. Do not clip the round markers or their glow.
      if (x < bounds.left || x > bounds.right) continue;

      const lane = catLanes[ev.category] ?? 0;
      const y = baseY + lane * laneH + laneH / 2;
      const r = 4 + ev.importance * 2;
      const color = CAT_COLORS[ev.category] || '#00e5ff';

      // グロー
      ctx.shadowColor = color;
      ctx.shadowBlur = 10;

      // 縦ライン
      ctx.strokeStyle = color + '40';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, H / 2 - 5);
      ctx.lineTo(x, y);
      ctx.stroke();

      // ピン
      ctx.fillStyle = color;
      ctx.globalAlpha = this._pinOpacity;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;

      // ホバー時にラベル表示
      if (this.hoveredEvent === ev || ev.importance >= 4) {
        ctx.shadowBlur = 0;
        ctx.font = `${ev.importance >= 4 ? 'bold ' : ''}12px "Noto Sans JP", sans-serif`;
        ctx.fillStyle = '#e0f7fa';
        ctx.fillText(ev.title, x + r + 4, y + 4);
      }

      ctx.shadowBlur = 0;
      this.pinRects.push({ ev, x, y, r });
    }
  }

  _drawMinimap(ctx, W) {
    const mmX = 0, mmY = this.MM_Y, mmW = W, mmH = this.MM_H;

    // ミニマップ背景
    ctx.fillStyle = 'rgba(2,15,28,0.9)';
    ctx.fillRect(mmX, mmY, mmW, mmH);
    ctx.strokeStyle = 'rgba(0,229,255,0.2)';
    ctx.lineWidth = 1;
    ctx.strokeRect(mmX, mmY, mmW, mmH);

    // 全イベントをミニドット
    const allEvents = this.db.query(YEAR_MIN, YEAR_MAX, null, 5000, 3);
    for (const ev of allEvents) {
      const mmEvX = this._yearToMiniX(ev.year, mmW);
      const color = CAT_COLORS[ev.category] || '#00e5ff';
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.6;
      ctx.fillRect(mmX + mmEvX, mmY + mmH / 2 - 1, 2, 2);
    }
    ctx.globalAlpha = 1;

    // 現在ビュー範囲ハイライト
    const { minYear: yearL, maxYear: yearR } = this._viewWindow;
    const vx0 = this._yearToMiniX(yearL, mmW);
    const vx1 = this._yearToMiniX(yearR, mmW);
    const bounds = this._getPlotBounds(mmW);
    const handleWidth = Math.min(bounds.width, Math.max(12, vx1 - vx0));
    const handleX = Math.max(bounds.left, Math.min(bounds.right - handleWidth, (vx0 + vx1 - handleWidth) / 2));
    const active = this.dragMode === 'minimap' || this.minimapHovered;

    ctx.fillStyle = active ? 'rgba(0,229,255,0.2)' : 'rgba(0,229,255,0.1)';
    ctx.fillRect(mmX + handleX, mmY + 8, handleWidth, mmH - 16);
    ctx.strokeStyle = active ? 'rgba(132,244,255,0.95)' : 'rgba(0,229,255,0.6)';
    ctx.lineWidth = 1;
    ctx.strokeRect(mmX + handleX, mmY + 8, handleWidth, mmH - 16);
    ctx.fillStyle = 'rgba(132,244,255,0.65)';
    for (const offset of [-3, 2]) ctx.fillRect(mmX + handleX + handleWidth / 2 + offset, mmY + 25, 1, 12);

    // 凡例
    const cats = ['astronomy','biology','civilization','technology','japan','future'];
    let lx = this._getPlotBounds(mmW).left;
    ctx.font = '10px "Noto Sans JP", sans-serif';
    for (const cat of cats) {
      ctx.fillStyle = CAT_COLORS[cat];
      ctx.fillRect(mmX + lx, mmY + 4, 8, 8);
      ctx.fillStyle = 'rgba(224,247,250,0.5)';
      ctx.fillText(CAT_EMOJI[cat], mmX + lx + 10, mmY + 13);
      lx += 30;
    }
  }

  _yearToMiniX(year, mmW) {
    const bounds = this._getPlotBounds(mmW);
    const zY = yearToZ(year);
    const zMin = yearToZ(YEAR_MIN);
    const zMax = yearToZ(YEAR_MAX);
    return bounds.left + ((zY - zMin) / (zMax - zMin)) * bounds.width;
  }

  _miniXToYear(x) {
    const bounds = this._getPlotBounds();
    const ratio = Math.max(0, Math.min(1, (x - bounds.left) / bounds.width));
    const zMin = yearToZ(YEAR_MIN), zMax = yearToZ(YEAR_MAX);
    return zToYear(zMin + ratio * (zMax - zMin));
  }

  // ==============================
  // 操作イベント
  // ==============================
  _cancelDrag() {
    const pointerId = this.activePointerId;
    this.activePointerId = null;
    this.isDragging = false;
    this.dragMode = null;
    this.dragMoved = false;
    this.minimapHovered = false;
    this.canvas.title = '';
    this.canvas.style.cursor = 'grab';
    if (pointerId != null && this.canvas.hasPointerCapture?.(pointerId)) {
      this.canvas.releasePointerCapture(pointerId);
    }
  }

  _bindEvents() {
    const cv = this.canvas;

    cv.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || this.activePointerId != null) return;
      e.preventDefault();
      this.activePointerId = e.pointerId;
      this.isDragging = true;
      this.dragMode = e.clientY >= this.MM_Y ? 'minimap' : 'timeline';
      this.dragMoved = false;
      this.dragStartX = e.clientX;
      this.dragStartY = e.clientY;
      this.dragStartWindow = getTimelineWindow(this.viewCenterYear, this.viewSpanYears);
      this.dragStartCenterYear = this.dragStartWindow.centerYear;
      cv.setPointerCapture(e.pointerId);
      cv.style.cursor = 'grabbing';
    });

    const updateHover = (e) => {
      this.minimapHovered = e.clientY >= this.MM_Y;
      cv.title = this.minimapHovered ? 'ドラッグで表示範囲を大きく移動' : '';
      if (this.minimapHovered) {
        this.hoveredEvent = null;
        cv.style.cursor = 'grab';
        return;
      }
      let found = null;
      for (const p of this.pinRects) {
        const dist = Math.hypot(e.clientX - p.x, e.clientY - p.y);
        if (dist <= p.r + 5) { found = p.ev; break; }
      }
      this.hoveredEvent = found;
      cv.style.cursor = found ? 'pointer' : 'grab';
    };

    cv.addEventListener('pointermove', (e) => {
      if (!this.isDragging) { updateHover(e); return; }
      if (e.pointerId !== this.activePointerId) return;
      const dx = e.clientX - this.dragStartX;
      if (Math.hypot(dx, e.clientY - this.dragStartY) >= 4) this.dragMoved = true;
      if (!this.dragMoved) return;
      const width = this._getPlotBounds().width;
      const year = this.dragMode === 'minimap'
        ? this.dragStartCenterYear + dx / width * (YEAR_MAX - YEAR_MIN)
        : timelineYearAtPosition(0.5 - dx / width, this.dragStartWindow);
      this.viewCenterYear = getTimelineWindow(year, this.viewSpanYears).centerYear;
      state.setYear(this.viewCenterYear);
    });

    cv.addEventListener('pointerup', (e) => {
      if (e.pointerId !== this.activePointerId) return;
      const pinClick = this.dragMode === 'timeline' && !this.dragMoved
        && Math.hypot(e.clientX - this.dragStartX, e.clientY - this.dragStartY) < 5;
      this._cancelDrag();

      // Only the timeline's pins are clickable; a bare press on the bar never jumps.
      if (pinClick && e.clientY < this.MM_Y) {
        for (const p of this.pinRects) {
          if (Math.hypot(e.clientX - p.x, e.clientY - p.y) <= p.r + 5) {
            state.selectEvent(p.ev);
            break;
          }
        }
      }
      updateHover(e);
    });
    cv.addEventListener('pointercancel', (e) => {
      if (e.pointerId === this.activePointerId) this._cancelDrag();
    });
    cv.addEventListener('lostpointercapture', (e) => {
      if (e.pointerId === this.activePointerId) this._cancelDrag();
    });
    cv.addEventListener('pointerleave', () => {
      if (this.isDragging) return;
      this.hoveredEvent = null;
      this.minimapHovered = false;
      cv.title = '';
    });

    cv.addEventListener('wheel', (e) => {
      e.preventDefault();
      if (e.deltaY === 0) return;
      this._cancelDrag();
      const factor = Math.exp(Math.max(-1, Math.min(1, e.deltaY * 0.005)));
      state.setTimelineSpan(this.viewSpanYears * factor);
    }, { passive: false });

    window.addEventListener('resize', () => {
      this.resize(window.innerWidth, window.innerHeight);
    });
    window.addEventListener('blur', () => this._cancelDrag());
  }

  // ==============================
  // レンダリングループ
  // ==============================
  start() {
    this._running = true;
    this.canvas.style.cursor = 'grab';
    this._pinOpacity = 0;
    this._loop();
  }

  stop() {
    this._running = false;
    this._cancelDrag();
    if (this._animId) cancelAnimationFrame(this._animId);
  }

  _loop() {
    if (!this._running) return;
    this._animId = requestAnimationFrame(() => this._loop());

    // フェードイン
    this._pinOpacity = Math.min(1, this._pinOpacity + 0.03);

    this.draw();
  }

  dispose() {
    this.stop();
  }
}
