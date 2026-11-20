/**
 * main.js
 * アプリケーションエントリポイント
 * - ローディング
 * - DataEngine 初期化
 * - 3D/2Dビュー 初期化・切り替え
 * - HUD 連携
 */

import './style.css';
import { EVENTS } from './data/events.js';
import { DataEngine } from './data/DataEngine.js';
import { Scene3D } from './view3d/Scene3D.js';
import { Timeline2D } from './view2d/Timeline2D.js';
import { HUD } from './ui/HUD.js';
import { state } from './core/StateManager.js';
import { yearToZ } from './core/TimeScale.js';

// ==============================
// ローディングUI
// ==============================
function setLoading(text) {
  document.getElementById('loading-text').textContent = text;
}

function hideLoading() {
  const screen = document.getElementById('loading-screen');
  // Reveal the first growing monitor frame directly after the name, without an intervening line.
  requestAnimationFrame(() => screen.remove());
}

// ==============================
// メイン
// ==============================
let scene3d = null;
let timeline2d = null;
let hud = null;
let currentMode = '3d';

async function main() {
  const splashStartedAt = performance.now();
  setLoading('イベントデータを読み込み中...');

  // DataEngine 初期化
  const db = new DataEngine();
  await new Promise(r => setTimeout(r, 50)); // DOM更新待ち
  db.load(EVENTS);

  setLoading('3Dシーンを構築中...');
  state.update({ totalEvents: db.totalCount });

  // キャンバス取得
  const canvas3d = document.getElementById('canvas-3d');
  const canvas2d = document.getElementById('canvas-2d');

  canvas2d.width = window.innerWidth;
  canvas2d.height = window.innerHeight;

  // 3D シーン初期化
  scene3d = new Scene3D(canvas3d, db);
  await scene3d.init();

  setLoading('UIを初期化中...');

  // HUD 初期化
  hud = new HUD(db);

  // 2Dタイムライン (遅延初期化)
  timeline2d = new Timeline2D(canvas2d, db);

  setLoading('画面を準備中...');

  // HUDのコールバック設定
  hud.onModeChange(async (mode) => {
    await switchMode(mode);
  });
  scene3d.onRequest2D(() => {
    if (currentMode !== '2d') hud.setMode('2d');
  });
  scene3d.onRequestMode((mode) => {
    if (currentMode !== mode) hud.setMode(mode);
  });
  hud.onJump((year) => {
    if (currentMode === '3d' && scene3d) {
      scene3d.jumpToYear(year);
    } else if (currentMode === '2d' && timeline2d) {
      timeline2d.viewCenterYear = year;
    }
  });

  // 状態変化でイベントカウント更新
  state.on('change:totalEvents', (e) => {
    document.getElementById('event-count').textContent =
      `全${e.detail.value.toLocaleString()}件`;
  });

  setLoading('完了');
  // Show the name briefly, then leave the monitor's own opening animation unobscured.
  await new Promise(r => setTimeout(r, Math.max(0, 500 - (performance.now() - splashStartedAt))));

  // 3Dモードで起動
  currentMode = '3d';
  document.getElementById('app').dataset.mode = currentMode;
  canvas3d.style.display = 'block';
  canvas2d.style.display = 'none';
  scene3d.start();

  hideLoading();
}

// ==============================
// モード切り替え
// ==============================
async function switchMode(mode) {
  if (mode === currentMode) return;

  const overlay = document.getElementById('transition-overlay');
  const canvas3d = document.getElementById('canvas-3d');
  const canvas2d = document.getElementById('canvas-2d');

  // フェードアウト
  overlay.classList.add('active');
  await new Promise(r => setTimeout(r, 350));

  const isImmersiveMode = (value) => value === '3d' || value === 'move';
  const wasImmersive = isImmersiveMode(currentMode);
  const willBeImmersive = isImmersiveMode(mode);

  if (willBeImmersive && !wasImmersive) {
    // 2D → 端末／移動
    timeline2d.stop();
    canvas2d.style.display = 'none';
    canvas3d.style.display = 'block';

    if (timeline2d.viewCenterYear !== undefined) {
      scene3d.jumpToYear(timeline2d.viewCenterYear);
    }

    hud.closeDetailPanel();
    scene3d.start();
  } else if (!willBeImmersive && wasImmersive) {
    // 3D → 2D
    scene3d.stop();
    canvas3d.style.display = 'none';
    canvas2d.style.display = 'block';
    canvas2d.width = window.innerWidth;
    canvas2d.height = window.innerHeight;

    // 3Dの中心年を引き継ぎ
    timeline2d.viewCenterYear = state.state.currentYear;

    timeline2d.start();
  }

  if (willBeImmersive) {
    scene3d.setInteractionMode(mode === 'move' ? 'move' : 'timeline');
  }

  currentMode = mode;
  document.getElementById('app').dataset.mode = currentMode;
  state.setMode(mode);

  // フェードイン
  overlay.classList.remove('active');
}

// ==============================
// キーボードショートカット
// ==============================
document.addEventListener('keydown', (e) => {
  if (e.key === 'Tab') {
    e.preventDefault();
    const modes = ['move', '3d', '2d'];
    switchMode(modes[(modes.indexOf(currentMode) + 1) % modes.length]);
  }
  if (e.key === 'Escape') {
    if (scene3d) scene3d._closeHologram();
    hud.closeDetailPanel();
    state.selectEvent(null);
    document.getElementById('search-input').blur();
  }
});

// ==============================
// 起動
// ==============================
main().catch(err => {
  console.error('起動エラー:', err);
  document.getElementById('loading-screen')?.classList.add('has-error');
  document.getElementById('loading-text').textContent = 'エラーが発生しました: ' + err.message;
});
