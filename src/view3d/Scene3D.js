/**
 * Scene3D.js
 * Dead Spaceスタイルの3D年表シーン
 * - 観測室と常時表示のホログラム年表
 * - CanvasTexture による立体UIレイヤー
 * - 3Dキャラクター
 * - 肩越しカメラ
 */

import * as THREE from 'three';
import { yearToZ, zToYear, yearToLabel, getEra, YEAR_MIN, YEAR_MAX } from '../core/TimeScale.js';
import { state } from '../core/StateManager.js';
import { buildSmileyHead } from './helmetModels.js';
import { HologramBeacons } from './HologramBeacons.js';
import { MovementMonitor } from './MovementMonitor.js';
import { calibrateMoveTimelineWidth, getArchiveFocusYear, getArchiveStrafeBounds, getVisibleArchiveWindow, remapArchiveStrafe } from './moveArchiveScale.js';
import {
  getTimelineWindow, getTimelineTicks, timelineYearAtPosition, timelineYearPosition,
  formatTimelineFocus, MAX_TIMELINE_SPAN,
} from '../core/TimelineViewport.js';
import {
  buildHologramTimelineModel,
  getCharacterRimLightProgress,
  getCharacterRimLightSpec,
  getObserverLightingSpec,
  getHologramBootPresentation,
  getHologramIlluminationProgress,
  getHologramOpeningProgress,
  getHologramBrightnessPulse,
  getHologramMarkerY,
  getHologramPanelLayout,
  getHologramPanelOptics,
  getHologramStagePose,
  getModeViewYawBias,
  getTerminalStageZ,
  getTerminalTravelState,
  getCloseTpsCameraSpec,
  getMoveTpsCameraSpec,
  getMonitorInteractionControls,
  getObservationBaySpec,
  getWheelInteraction,
  adjustObserverTravel,
  getObserverFollowStep,
  getObserverStrafeOffset,
  adjustNeckLook,
  getTpsHeadTracking,
  getWalkHeadMotion,
  getMoveCameraBlend,
  supportsNeckLook,
  shouldMirrorSelectionToHologram,
  shouldRefreshHologram,
} from './holoTimelineLayout.js';

// カテゴリ別カラー
const CAT_COLORS = {
  astronomy:    0xffd700,
  geology:      0xff6b35,
  biology:      0x00ff7f,
  civilization: 0x4a9eff,
  technology:   0x00e5ff,
  japan:        0xff6eb4,
  culture:      0xda70d6,
  future:       0x7fff00,
};

const CATEGORIES = Object.keys(CAT_COLORS);
const HOLOGRAM_EXPANSION_SECONDS = 1.1;
const MOVEMENT_ARROW_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

function isTypingTarget(target) {
  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName)
    || target?.isContentEditable
    || target?.getAttribute?.('role') === 'textbox';
}

export class Scene3D {
  constructor(canvas, dataEngine) {
    this.canvas = canvas;
    this.db = dataEngine;

    // Three.js コア
    this.renderer = null;
    this.scene = null;
    this.camera = null;
    this.clock = new THREE.Clock();

    // シーンオブジェクト
    this.tunnel = null;
    this.pins = {};          // 旧トンネル表示との互換用
    this.pinData = {};
    this.hologram = null;
    this.holoMarkerGroup = null;
    this.holoTimelineModel = null;
    this.character = null;
    this.particles = null;

    // カメラ制御
    this.camTargetZ = yearToZ(YEAR_MIN);
    this.camCurrentZ = this.camTargetZ;
    this.terminalStageZ = this.camCurrentZ;
    this.camAngleX = 0.15;  // 仰角
    this.camAngleY = 0.0;   // 水平回転
    this.camDist = getHologramStagePose().cameraDistance; // キャラの右肩からの距離
    this.isDragging = false;
    this.movementKeys = new Set();
    this.movementShift = false;
    this.smileyShiftPressed = false;
    this.smileyFlashElapsed = 0;
    this.keyboardTravelDirection = 0;
    this.keyboardRepeatTime = 0;
    this.keyboardStrafeDirection = 0;
    this.keyboardStrafeRepeatTime = 0;
    this.lastMouse = { x: 0, y: 0 };
    this.dragStartMouse = { x: 0, y: 0 };
    this.interactionMode = 'timeline';
    this.observerTravel = 0;
    this.cameraTravel = 0;
    this.observerTravelTarget = 0;
    this.observerStrafe = 0;
    this.observerStrafeTarget = 0;
    this.moveSurfaceExpanded = false;
    this.holoExpansionElapsed = 0;
    this.moveTimelineWidth = 55_960;
    this.moveTravelMin = -300;
    this.observerLighting = getObserverLightingSpec();
    this.tpsHeadTracking = getTpsHeadTracking(this.camAngleY, this.camAngleX);
    this._onRequest2D = null;
    this._onRequestMode = null;

    // レイキャスト
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();

    // ホバー/選択
    this.hoveredPin = null;
    this.selectedEvent = null;
    this.pointerInsideCanvas = false;
    this.headHovered = false;
    this.headHoverBlend = 0;
    this._headLookPosition = new THREE.Vector3();
    this._headLookEuler = new THREE.Euler(0, 0, 0, 'YXZ');
    this._headLookRotation = new THREE.Quaternion();

    // 可視範囲
    this.visibleZRange = 130;
    this._lastHologramRenderZ = null;

    this._running = false;
    this._animId = null;
  }

  // ==============================
  // 初期化
  // ==============================
  async init() {
    this._setupRenderer();
    this._setupScene();
    this._setupCamera();
    this._setupLights();
    this._buildTunnel();
    this._buildCharacter();
    if (this.observerLighting.hasRimLight) this._buildCharacterRimLight();
    this._buildHologram();
    this.beacons = new HologramBeacons(
      this.canvas.parentElement, event => this._selectEvent(event), CAT_COLORS, event => this._handleWheel(event),
    );
    this._buildParticles();
    this._bindEvents();

    state.on('change:activeCategories', () => this._updateVisiblePins());
    state.on('change:timelineSpanYears', () => this._updateVisiblePins());
    state.on('change:currentYear', (event) => {
      this.camTargetZ = yearToZ(event.detail.value);
      this._updateVisiblePins();
    });
    state.on('change:selectedEvent', (e) => {
      const event = e.detail.value;
      if (shouldMirrorSelectionToHologram(state.state.mode, event) && event !== this.selectedEvent) {
        this._selectEvent(event, false);
      } else if (state.state.mode !== '2d' && !event && this.selectedEvent) {
        this._closeHologram(false);
      }
    });
    state.on('change:mode', (e) => {
      const event = state.state.selectedEvent;
      if (shouldMirrorSelectionToHologram(e.detail.value, event) && event !== this.selectedEvent) {
        this._selectEvent(event, false);
      } else if (e.detail.value === '2d') {
        this._detailTargetOpacity = 0;
      }
    });

    // 初期ホログラム年表を描画
    this._updateVisiblePins();

    return this;
  }

  onRequest2D(handler) {
    this._onRequest2D = handler;
  }

  onRequestMode(handler) {
    this._onRequestMode = handler;
  }

  setInteractionMode(mode) {
    this._clearMovementKeys();
    if (state.state.movementFocusYear !== null) state.update({ movementFocusYear: null });
    const nextMode = mode === 'move' ? 'move' : 'timeline';
    this.interactionMode = nextMode;
    const look = adjustNeckLook({ yaw: this.camAngleY, pitch: this.camAngleX }, 0, 0, nextMode);
    this.camAngleY = look.yaw;
    this.camAngleX = look.pitch;
    if (nextMode === 'timeline') {
      this.terminalStageZ = this.camCurrentZ;
    }
    // Both modes enter at the same terminal size and shoulder-camera distance.
    // Movement opens the wider archive only after actual forward/back input.
    Object.assign(this, getTerminalTravelState());
    this.moveCameraBlend = 0;
    this.moveSurfaceExpanded = false;
    this.holoExpansionElapsed = 0;
    this._setHologramLayout('timeline');
    if (this.holoTimelineModel) this._updateVisiblePins();
  }

  _setupRenderer() {
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: false,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.2;
  }

  _setupScene() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x000000);
    this.scene.fog = new THREE.FogExp2(0x000000, 0.012);
  }

  _setupCamera() {
    this.camera = new THREE.PerspectiveCamera(
      55, window.innerWidth / window.innerHeight, 0.1, 2000
    );
    this._updateCamera();
  }

  _setupLights() {
    // 環境光
    this.ambientLight = new THREE.AmbientLight(0x0a1a2a, 2.0);
    this.scene.add(this.ambientLight);

    // メインのシアン方向光
    this.dirLight = new THREE.DirectionalLight(0x00e5ff, 1.5);
    this.dirLight.position.set(10, 20, 10);
    this.dirLight.castShadow = true;
    this.dirLight.shadow.mapSize.set(1024, 1024);
    this.scene.add(this.dirLight);

    // 補助光（暖色）
    this.fillLight = new THREE.DirectionalLight(0x334466, 0.8);
    this.fillLight.position.set(-10, 5, -10);
    this.scene.add(this.fillLight);

    // 折り畳まれた端末そのものを、観測室に光を広げる唯一の主光源にする。
    this.hologramLight = new THREE.PointLight(0x00d9ff, 0, 6, 2);
    this.scene.add(this.hologramLight);
  }

  // ==============================
  // 観測室: 年表UIを浮かせるための控えめな空間
  // ==============================
  _buildTunnel() {
    const group = new THREE.Group();

    // 床グリッド（光る格子）
    const observationBay = getObservationBaySpec();
    const gridHelper = new THREE.GridHelper(
      observationBay.gridSize,
      observationBay.gridDivisions,
      observationBay.primaryGridColor,
      observationBay.secondaryGridColor,
    );
    gridHelper.position.y = observationBay.floorY;
    group.add(gridHelper);
    this.floorGridMaterials = Array.isArray(gridHelper.material)
      ? gridHelper.material
      : [gridHelper.material];
    for (const material of this.floorGridMaterials) {
      material.transparent = true;
      material.opacity = 0;
    }

    // 暗い背面パネルで投影UIの輪郭を確保
    const backMaterial = new THREE.MeshBasicMaterial({
      color: 0x020914, transparent: true, opacity: 0, side: THREE.DoubleSide,
    });
    const back = new THREE.Mesh(
      new THREE.PlaneGeometry(52, 18),
      backMaterial,
    );
    back.position.set(0, 5, 600);
    back.rotation.y = Math.PI;
    group.add(back);

    this.tunnel = group;
    this.observationBackMaterial = backMaterial;
    this.scene.add(group);
  }

  _buildEraZones(parent) {
    const eras = [
      { year: YEAR_MIN,        label: '宇宙誕生', color: 0x7257ff },
      { year: -4_600_000_000, label: '冥王代', color: 0xff2200 },
      { year: -2_500_000_000, label: '始生代', color: 0xcc4400 },
      { year: -541_000_000,   label: '原生代 → 古生代', color: 0x44aa44 },
      { year: -252_000_000,   label: '中生代（恐竜）', color: 0xddaa00 },
      { year: -66_000_000,    label: '新生代', color: 0x3388cc },
      { year: -10_000,        label: '先史時代', color: 0x7755cc },
      { year: 1,              label: '古代〜中世', color: 0x8866dd },
      { year: 1500,           label: '近世〜近代', color: 0x5588dd },
      { year: 1868,           label: '現代', color: 0x00e5ff },
      { year: 2025,           label: '未来', color: 0x7fff00 },
    ];

    for (let i = 0; i < eras.length - 1; i++) {
      const z0 = yearToZ(eras[i].year);
      const z1 = yearToZ(eras[i + 1].year);
      const len = z1 - z0;
      const color = new THREE.Color(eras[i].color);

      // 床ゾーン（半透明プレート）
      const geo = new THREE.PlaneGeometry(30, len);
      const mat = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.04,
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(0, -3.95, z0 + len / 2);
      parent.add(mesh);
    }
  }

  _buildWalls(parent) {
    // 左右に薄い壁（遠くほど消える）
    for (const side of [-1, 1]) {
      const geo = new THREE.PlaneGeometry(1200, 20);
      const mat = new THREE.MeshBasicMaterial({
        color: 0x003355,
        transparent: true,
        opacity: 0.08,
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(side * 15, 6, 600);
      mesh.rotation.y = side * Math.PI / 2;
      parent.add(mesh);
    }
  }

  // ==============================
  // InstancedMesh ピン
  // ==============================
  _buildPins() {
    const MAX_INSTANCES = 2000; // 一度に表示する最大ピン数/カテゴリ

    // ピンジオメトリ: 茎 + ヘッド（マージ）
    const stemGeo = new THREE.CylinderGeometry(0.08, 0.08, 3.5, 6);
    stemGeo.translate(0, 1.75, 0);
    const headGeo = new THREE.SphereGeometry(0.35, 8, 8);
    headGeo.translate(0, 3.7, 0);

    // マージ
    const pinGeo = this._mergeGeometries([stemGeo, headGeo]);

    for (const cat of CATEGORIES) {
      const color = new THREE.Color(CAT_COLORS[cat]);
      const mat = new THREE.MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: 0.4,
        metalness: 0.3,
        roughness: 0.4,
      });

      const mesh = new THREE.InstancedMesh(pinGeo, mat, MAX_INSTANCES);
      mesh.count = 0;
      mesh.name = `pin_${cat}`;
      mesh.userData.category = cat;
      mesh.castShadow = true;
      mesh.receiveShadow = false;

      this.scene.add(mesh);
      this.pins[cat] = mesh;
      this.pinData[cat] = [];
    }
  }

  /** シンプルなジオメトリマージ（BufferGeometryUtils不要） */
  _mergeGeometries(geos) {
    const positions = [];
    const normals = [];
    const uvs = [];
    let indexOffset = 0;
    const indices = [];

    for (const geo of geos) {
      const pos = geo.attributes.position;
      const nrm = geo.attributes.normal;
      const uv = geo.attributes.uv;
      const idx = geo.index;

      for (let i = 0; i < pos.count; i++) {
        positions.push(pos.getX(i), pos.getY(i), pos.getZ(i));
        normals.push(nrm.getX(i), nrm.getY(i), nrm.getZ(i));
        if (uv) uvs.push(uv.getX(i), uv.getY(i));
      }
      if (idx) {
        for (let i = 0; i < idx.count; i++) indices.push(idx.getX(i) + indexOffset);
      }
      indexOffset += pos.count;
    }

    const result = new THREE.BufferGeometry();
    result.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    result.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    if (uvs.length) result.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    result.setIndex(indices);
    return result;
  }

  /**
   * 現在の視野範囲でピンを更新
   */
  _updateVisiblePins() {
    const camZ = this.camCurrentZ;
    const { activeCategories, currentYear, timelineSpanYears } = state.state;
    const viewport = getTimelineWindow(currentYear, timelineSpanYears);

    const maxEvents = this.interactionMode === 'move' ? 300 : 30;
    const events = this.db.query(
      viewport.minYear,
      viewport.maxYear,
      activeCategories,
      this.interactionMode === 'move' ? 800 : 80,
      this._getMinImportance(),
    );
    const model = buildHologramTimelineModel(events, camZ, {
      viewport,
      maxEvents,
      selectedEventId: this.selectedEvent?.id,
    });

    this.holoTimelineModel = model;
    this._renderHologramTimeline(model);
    this._rebuildHologramMarkers(model.rows);
    this._lastHologramRenderZ = camZ;

    if (
      this.selectedEvent
      && !model.rows.some(row => row.isSelected)
      && Math.abs(this.camTargetZ - this.camCurrentZ) <= 0.15
    ) {
      this._detailTargetOpacity = 0;
      this.selectedEvent = null;
      state.selectEvent(null);
    }

    state.update({ visibleEvents: events.length });
  }

  _getPinX(ev) {
    // カテゴリ別に左右に散布
    const catIdx = CATEGORIES.indexOf(ev.category);
    const baseX = (catIdx - 3.5) * 1.5;
    // IDハッシュで微小ランダム
    const jitter = ((ev.id.charCodeAt(ev.id.length - 1) % 10) - 5) * 0.3;
    return baseX + jitter;
  }

  _getPinScale(ev) {
    return 0.5 + (ev.importance - 1) * 0.2; // 重要度 1→0.5, 5→1.3
  }

  _getMinImportance() {
    // 広い範囲を見ているときは重要度高いものだけ表示
    return 1; // TODO: ズームレベルに応じて調整
  }

  // ==============================
  // 3Dキャラクター (プロシージャル)
  // ==============================
  _buildCharacter() {
    const group = new THREE.Group();
    const upperBody = new THREE.Group();
    upperBody.scale.x = 0.56;
    group.add(upperBody);

    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0x1a3a5a,
      emissive: 0x002244,
      emissiveIntensity: 0,
      metalness: 0.7,
      roughness: 0.3,
    });
    const suitMat = new THREE.MeshStandardMaterial({
      color: 0x2a4a7a,
      metalness: 0.8,
      roughness: 0.2,
    });
    const glowMat = new THREE.MeshStandardMaterial({
      color: 0x00e5ff,
      emissive: 0x00e5ff,
      emissiveIntensity: 0,
    });

    // 胴体
    const torso = new THREE.Mesh(new THREE.BoxGeometry(1.45, 1.6, 0.7), bodyMat);
    torso.position.y = 0.8;
    upperBody.add(torso);

    // 年表へ向く頭の支点に、正面に笑顔がある立体の頭を取り付ける。
    const head = new THREE.Group();
    head.position.y = 2.02;
    head.scale.setScalar(0.3528);
    group.add(head);
    head.add(buildSmileyHead());

    // 左腕
    const lArm = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.2, 1.4, 8), bodyMat);
    lArm.position.set(-0.98, 0.8, 0);
    lArm.rotation.z = 0.2;
    upperBody.add(lArm);

    // 右腕
    const rArm = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.2, 1.4, 8), bodyMat);
    rArm.position.set(0.98, 0.8, 0);
    rArm.rotation.z = -0.2;
    upperBody.add(rArm);

    // 左脚
    const lLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.22, 1.5, 8), suitMat);
    lLeg.position.set(-0.35, -0.75, 0);
    group.add(lLeg);

    // 右脚
    const rLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.22, 1.5, 8), suitMat);
    rLeg.position.set(0.35, -0.75, 0);
    group.add(rLeg);

    // スーツのアクセントライン
    for (const [x, y, w, h] of [[-0.62, 1.2, 0.08, 0.6], [0.62, 1.2, 0.08, 0.6]]) {
      const accent = new THREE.Mesh(
        new THREE.BoxGeometry(w, h, 0.75),
        glowMat
      );
      accent.position.set(x, y, 0);
      upperBody.add(accent);
    }

    // バックパック (ホログラムエミッタ)
    const pack = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.9, 0.4), suitMat);
    pack.position.set(0, 0.9, -0.55);
    upperBody.add(pack);

    const stagePose = getHologramStagePose();
    const closeRig = getCloseTpsCameraSpec();
    // Bring the observer one current helmet height toward the neutral camera.
    // Keep this offset independent of the camera anchor and walking travel.
    const cameraApproach = new THREE.Vector3(closeRig.sideOffset, 0, -closeRig.behindHelmet)
      .normalize().multiplyScalar(0.9);
    this.characterZOffset = stagePose.characterZOffset + cameraApproach.z;
    group.position.set(stagePose.characterX + cameraApproach.x, stagePose.characterY, this.characterZOffset);
    this.characterBaseX = group.position.x;
    group.scale.setScalar(1.55);

    this.character = group;
    this.charGroup = group;
    this.characterMaterials = { bodyMat, glowMat };

    // アニメーション用参照
    this.charParts = { lArm, rArm, lLeg, rLeg, head };

    this.scene.add(group);
  }

  _buildCharacterRimLight() {
    const spec = getCharacterRimLightSpec();
    const group = new THREE.Group();
    const emitterMaterial = new THREE.MeshBasicMaterial({
      color: 0x82f4ff,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const emitter = new THREE.Mesh(
      new THREE.BoxGeometry(spec.width, spec.height, 0.08),
      emitterMaterial,
    );
    group.add(emitter);

    const light = new THREE.PointLight(0x42dfff, 0, 14, 2);
    group.add(light);

    this.characterRimLightSpec = spec;
    this.characterRimEmitter = group;
    this.characterRimMaterial = emitterMaterial;
    this.characterRimPointLight = light;
    this.scene.add(group);
  }

  // ==============================
  // 常時表示のホログラム年表
  // ==============================
  _buildHologram() {
    const group = new THREE.Group();
    const panelOptics = getHologramPanelOptics();
    const panelLayout = getHologramPanelLayout();
    this.holoPanelLayout = panelLayout;
    this.holoStorageLayout = panelLayout;
    this.holoInteractionControls = getMonitorInteractionControls(panelLayout);
    const surface = new THREE.Group();
    surface.position.x = panelLayout.panelOffsetX;
    group.add(surface);
    this.holoSurface = surface;
    const makeMaterial = (texture, opacity) => new THREE.ShaderMaterial({
      uniforms: {
        time: { value: 0 },
        brightness: { value: 1 },
        edgeWidthX: { value: 0.025 },
        map: { value: texture },
        holoColor: { value: new THREE.Color(0x00e5ff) },
        opacity: { value: opacity },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float time;
        uniform float brightness;
        uniform float edgeWidthX;
        uniform sampler2D map;
        uniform vec3 holoColor;
        uniform float opacity;
        varying vec2 vUv;
        void main() {
          vec4 tex = texture2D(map, vUv);
          float scan = sin(vUv.y * 160.0) * 0.018;
          float edgeX = smoothstep(0.0, edgeWidthX, vUv.x) * smoothstep(1.0, 1.0 - edgeWidthX, vUv.x);
          float edgeY = smoothstep(0.0, 0.035, vUv.y) * smoothstep(1.0, 0.965, vUv.y);
          float edge = 1.0 - edgeX * edgeY;
          vec3 color = (tex.rgb * holoColor + scan + holoColor * edge * 0.7) * brightness;
          float alpha = (tex.a * 0.98 + edge * 0.68) * brightness * opacity;
          gl_FragColor = vec4(color, alpha);
        }
      `,
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    this.holoCanvas = document.createElement('canvas');
    this.holoCanvas.width = panelLayout.canvasWidth;
    this.holoCanvas.height = panelLayout.canvasHeight;
    this.holoTexture = new THREE.CanvasTexture(this.holoCanvas);
    this.holoMat = makeMaterial(this.holoTexture, panelOptics.canvasOpacity);
    this.holoMat.uniforms.edgeWidthX.value = 0.025 * 1440 / panelLayout.canvasWidth;

    // 端末そのものの面だけを青白く投影し、背後に別の投影板は作らない。
    this.holoBackplate = new THREE.Mesh(
      new THREE.PlaneGeometry(panelLayout.panelWidth + 0.08, panelLayout.panelHeight + 0.08),
      new THREE.MeshBasicMaterial({
        color: 0x063a55,
        transparent: false,
        opacity: panelOptics.backplateOpacity,
        depthWrite: true,
        side: THREE.DoubleSide,
      }),
    );
    this.holoBackplate.position.z = -0.045;
    surface.add(this.holoBackplate);

    this.holoMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(panelLayout.panelWidth, panelLayout.panelHeight),
      this.holoMat,
    );
    surface.add(this.holoMesh);

    const frame = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(panelLayout.panelWidth + 0.15, panelLayout.panelHeight + 0.15, 0.05)),
      new THREE.LineBasicMaterial({ color: 0x00e5ff, transparent: true, opacity: 0.92 }),
    );
    surface.add(frame);
    this.holoFrame = frame;

    this.holoMarkerGroup = new THREE.Group();
    this.holoMarkerGroup.position.z = 0.12;
    surface.add(this.holoMarkerGroup);
    this.holoMarkerGeo = new THREE.SphereGeometry(0.13, 12, 12);
    this.holoMarkerMaterials = Object.fromEntries(CATEGORIES.map(cat => [
      cat,
      new THREE.MeshBasicMaterial({ color: CAT_COLORS[cat], transparent: true, opacity: 0.98 }),
    ]));

    // 選択した出来事だけが前にせり出す独立レイヤー
    this.detailGroup = new THREE.Group();
    this.detailGroup.position.set(-0.45, -1.55, 0.36);
    this.detailGroup.visible = false;
    surface.add(this.detailGroup);

    this.detailCanvas = document.createElement('canvas');
    this.detailCanvas.width = 1024;
    this.detailCanvas.height = 420;
    this.detailTexture = new THREE.CanvasTexture(this.detailCanvas);
    this.detailMat = makeMaterial(this.detailTexture, 0);
    this.detailGroup.add(new THREE.Mesh(new THREE.PlaneGeometry(8.3, 2.45), this.detailMat));
    this.detailGroup.add(new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(8.42, 2.57, 0.05)),
      new THREE.LineBasicMaterial({ color: 0x8cf5ff, transparent: true, opacity: 0.7 }),
    ));

    const stagePose = getHologramStagePose();
    group.position.set(stagePose.panelX, stagePose.panelY, stagePose.panelZOffset);
    this.holoBaseScale = stagePose.panelScale;
    group.scale.set(this.holoBaseScale, this.holoBaseScale * 0.018, this.holoBaseScale);
    this.holoBaseY = stagePose.panelY;
    this.holoZOffset = stagePose.panelZOffset;
    this.holoBaseRotationY = stagePose.panelRotationY;
    group.rotation.y = this.holoBaseRotationY;
    this.hologram = group;
    this._hologramOpenElapsed = 0;
    this._detailTargetOpacity = 0;
    this.scene.add(group);
    this.moveMonitor = new MovementMonitor(this.scene);
  }

  /** Allocate the destination surface once; animate its visible layout without reallocations. */
  _setHologramLayout(mode, expansionProgress = 1) {
    if (!this.hologram) return;
    const layout = getHologramPanelLayout(mode, expansionProgress, this.moveTimelineWidth);
    const storage = getHologramPanelLayout(mode, 1, this.moveTimelineWidth);
    if (this.camera) {
      this.camera.far = mode === 'move' ? Math.max(2000, -this.moveTravelMin * 2) : 2000;
      this.camera.updateProjectionMatrix();
    }
    if (mode === 'move' && this.moveMonitor) {
      this._applyHologramLayout(layout);
      return;
    }
    const previousStorage = this.holoStorageLayout ?? this.holoPanelLayout;
    if (storage.canvasWidth === previousStorage.canvasWidth
      && storage.canvasHeight === previousStorage.canvasHeight) {
      this._applyHologramLayout(layout);
      return;
    }
    this.holoStorageLayout = storage;

    this.holoMesh.geometry.dispose();
    this.holoMesh.geometry = new THREE.PlaneGeometry(storage.panelWidth, storage.panelHeight);
    this.holoBackplate.geometry.dispose();
    this.holoBackplate.geometry = new THREE.PlaneGeometry(storage.panelWidth + 0.08, storage.panelHeight + 0.08);
    this.holoFrame.geometry.dispose();
    const frameBox = new THREE.BoxGeometry(storage.panelWidth + 0.15, storage.panelHeight + 0.15, 0.05);
    this.holoFrame.geometry = new THREE.EdgesGeometry(frameBox);
    frameBox.dispose();


    this.holoTexture.dispose();
    this.holoCanvas.width = Math.min(storage.canvasWidth, this.renderer.capabilities.maxTextureSize);
    this.holoCanvas.height = storage.canvasHeight;
    this.holoTexture = new THREE.CanvasTexture(this.holoCanvas);
    this.holoMat.uniforms.map.value = this.holoTexture;
    this._applyHologramLayout(layout);
  }

  _applyHologramLayout(layout) {
    const storage = this.holoStorageLayout ?? this.holoPanelLayout;
    this.holoPanelLayout = layout;
    this.holoInteractionControls = getMonitorInteractionControls(layout);
    this.holoSurface.position.x = layout.panelOffsetX;
    if (this.interactionMode === 'move' && this.moveMonitor) return;
    this.holoMesh.scale.x = layout.panelWidth / storage.panelWidth;
    this.holoBackplate.scale.x = (layout.panelWidth + 0.08) / (storage.panelWidth + 0.08);
    this.holoFrame.scale.x = (layout.panelWidth + 0.15) / (storage.panelWidth + 0.15);
    this.holoMat.uniforms.edgeWidthX.value = 0.025 * 1440 / layout.canvasWidth;
  }

  _updateHologramExpansion(dt) {
    if (this.interactionMode !== 'move' || !this.moveSurfaceExpanded
      || this.holoExpansionElapsed >= HOLOGRAM_EXPANSION_SECONDS) return;
    const step = Math.min(0.1, Math.max(0, dt));
    if (step === 0) return;
    this.holoExpansionElapsed = Math.min(HOLOGRAM_EXPANSION_SECONDS, this.holoExpansionElapsed + step);
    const progress = this.holoExpansionElapsed / HOLOGRAM_EXPANSION_SECONDS;
    const eased = progress * progress * (3 - 2 * progress);
    this._applyHologramLayout(getHologramPanelLayout('move', eased, this.moveTimelineWidth));
    // Reflow into the current width so glyphs and markers keep their proportions.
    if (this.holoTimelineModel) this._renderHologramTimeline(this.holoTimelineModel);
  }

  _calibrateMoveArchiveScale() {
    if (!this.camera) return;
    const pose = getHologramStagePose();
    const camera = this.camera.clone();
    // Measure the full-open, neutral closest view, independent of the current glance or boot animation.
    Scene3D.prototype._updateCamera.call({ camera, interactionMode: 'move', cameraTravel: 7,
      camCurrentZ: this.camCurrentZ, terminalStageZ: this.terminalStageZ,
      camAngleY: 0, camAngleX: 0.15 });
    const surface = new THREE.Group();
    surface.position.set(pose.panelX, pose.panelY, this.camCurrentZ + pose.panelZOffset);
    surface.rotation.y = pose.panelRotationY;
    surface.scale.setScalar(pose.panelScale);
    const layout = getHologramPanelLayout('move');
    this.moveTimelineWidth = calibrateMoveTimelineWidth(camera, surface, layout);
    const expanded = getHologramPanelLayout('move', 1, this.moveTimelineWidth);
    this.moveTravelMin = -Math.max(300, expanded.panelWidth * pose.panelScale * 1.5);
  }

  _setHologramBootPresentation(presentation, illumination, rimLightProgress) {
    const flatMovement = this.interactionMode === 'move' && !!this.moveMonitor;
    this.holoBackplate.visible = presentation.showTerminal && !flatMovement;
    this.holoMesh.visible = presentation.showTerminal && !flatMovement;
    this.holoFrame.visible = presentation.showTerminal && !flatMovement;
    this.holoMarkerGroup.visible = presentation.showTerminal && !flatMovement;
    this.moveMonitor?.setVisible(presentation.showTerminal && flatMovement);

    if (this.tunnel) this.tunnel.visible = presentation.showEnvironment;
    if (this.character) this.character.visible = presentation.showEnvironment;
    if (this.particles) this.particles.visible = presentation.showEnvironment;

    this.ambientLight.intensity = 0.6 * illumination;
    this.dirLight.intensity = 0.9 * illumination;
    this.fillLight.intensity = 0.25 * illumination;
    this.hologramLight.intensity = 3.5 * illumination;
    this.hologramLight.distance = 6 + 32 * illumination;
    this.floorGridMaterials.forEach((material) => { material.opacity = 0.72 * illumination; });
    this.observationBackMaterial.opacity = 0.38 * illumination;
    this.particles.material.opacity = 0.6 * illumination;
    this.characterMaterials.bodyMat.emissiveIntensity = 0.2 * illumination;
    this.characterMaterials.glowMat.emissiveIntensity = 0.7 * illumination;

    if (this.characterRimEmitter) {
      this.characterRimEmitter.visible = presentation.showEnvironment;
      this.characterRimMaterial.opacity = 0.82 * rimLightProgress;
      this.characterRimPointLight.intensity = this.characterRimLightSpec.intensity * rimLightProgress;
    }

    document.getElementById('hud')?.classList.toggle('boot-hidden', !presentation.showHud);

  }

  /**
   * メイン面の年表・ステータス・イベントカードを1枚の投影面に描く。
   */
  _renderHologramTimeline(model) {
    if (this.interactionMode === 'move' && this.moveMonitor) return;
    const ctx = this.holoCanvas.getContext('2d');
    const W = this.holoPanelLayout.canvasWidth;
    const H = this.holoPanelLayout.canvasHeight;
    ctx.setTransform(this.holoCanvas.width / W, 0, 0, this.holoCanvas.height / H, 0, 0);
    const {
      timelineLeft, timelineWidth, statusLeft, statusWidth, dividerX, gridTop, gridBottom, axisY,
    } = this.holoPanelLayout;
    ctx.clearRect(0, 0, W, H);

    const bg = ctx.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, 'rgba(3, 35, 54, 0.99)');
    bg.addColorStop(0.7, 'rgba(2, 29, 48, 0.98)');
    bg.addColorStop(1, 'rgba(1, 24, 42, 0.96)');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    const viewport = model.range.viewport;
    const focusYear = state.state.currentYear;
    const era = getEra(focusYear);

    ctx.strokeStyle = 'rgba(106, 231, 255, 0.16)';
    ctx.lineWidth = 1;
    const ticks = getTimelineTicks(viewport, timelineWidth);
    for (const tick of ticks) {
      const x = timelineLeft + tick.position * timelineWidth;
      ctx.beginPath();
      ctx.moveTo(x, gridTop);
      ctx.lineTo(x, gridBottom);
      ctx.stroke();
    }
    for (let y = 125; y <= gridBottom; y += 72) {
      ctx.beginPath();
      ctx.moveTo(timelineLeft, y);
      ctx.lineTo(timelineLeft + timelineWidth, y);
      ctx.stroke();
    }

    ctx.fillStyle = '#b8f8ff';
    ctx.font = '700 30px Orbitron, monospace';
    ctx.fillText('DataRangeFinder', 70, 65);

    const { expand2d } = this.holoInteractionControls;
    ctx.fillStyle = 'rgba(0, 36, 57, 0.94)';
    ctx.fillRect(expand2d.x, expand2d.y, expand2d.width, expand2d.height);
    ctx.strokeStyle = 'rgba(122, 239, 255, 0.8)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(expand2d.x, expand2d.y, expand2d.width, expand2d.height);
    ctx.fillStyle = '#b8f8ff';
    ctx.font = 'bold 21px Orbitron, monospace';
    ctx.fillText('↗', expand2d.x + 18, expand2d.y + 40);
    ctx.font = 'bold 18px "Noto Sans JP", sans-serif';
    ctx.fillText('拡大', expand2d.x + 56, expand2d.y + 40);

    ctx.strokeStyle = 'rgba(0, 229, 255, 0.86)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(timelineLeft, axisY);
    ctx.lineTo(timelineLeft + timelineWidth, axisY);
    ctx.stroke();
    ctx.fillStyle = '#71f4ff';
    ctx.font = 'bold 18px Orbitron, monospace';
    ctx.font = '14px "Noto Sans JP", sans-serif';
    if (this.interactionMode !== 'move') {
      for (const tick of ticks) {
        const x = timelineLeft + tick.position * timelineWidth;
        const labelWidth = ctx.measureText(tick.label).width;
        ctx.fillText(tick.label, Math.min(x + 4, timelineLeft + timelineWidth - labelWidth), axisY + 45);
      }
    }
    for (const row of model.rows) {
      if (this.interactionMode === 'move') {
        // Movement uses screen-sized beacons; retain their exact time-axis footprints.
        ctx.fillStyle = row.isSelected ? '#ecfdff' : '#72dbe9';
        ctx.fillRect(timelineLeft + row.position * timelineWidth - 2, axisY - 4, 4, 8);
        continue;
      }

      // Terminal mode keeps the original round markers and in-monitor event cards.
      const { event, lane, position, isSelected } = row;
      const colorValue = CAT_COLORS[event.category] ?? 0x00e5ff;
      const color = `#${colorValue.toString(16).padStart(6, '0')}`;
      const x = timelineLeft + position * timelineWidth;
      const y = axisY - (lane - 1) * 105;
      const cardX = Math.min(Math.max(x - 100, timelineLeft), timelineLeft + timelineWidth - 200);
      const cardY = y - 75;

      ctx.strokeStyle = color;
      ctx.globalAlpha = isSelected ? 1 : 0.72;
      ctx.lineWidth = isSelected ? 3 : 1.5;
      ctx.beginPath();
      ctx.moveTo(x, axisY);
      ctx.lineTo(x, y);
      ctx.stroke();
      ctx.fillStyle = isSelected ? `${color}4d` : 'rgba(0, 25, 42, 0.72)';
      ctx.fillRect(cardX, cardY, 200, 52);
      ctx.strokeRect(cardX, cardY, 200, 52);
      ctx.beginPath();
      ctx.arc(x, y, isSelected ? 12 : 8, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.fillStyle = '#e8fcff';
      ctx.font = 'bold 16px "Noto Sans JP", sans-serif';
      ctx.fillText(event.title.slice(0, 12), cardX + 11, cardY + 22);
      ctx.fillStyle = color;
      ctx.font = '14px Orbitron, monospace';
      ctx.fillText(yearToLabel(event.year), cardX + 11, cardY + 43);
      ctx.globalAlpha = 1;
    }

    ctx.strokeStyle = 'rgba(0, 229, 255, 0.5)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(dividerX, 60);
    ctx.lineTo(dividerX, H - 55);
    ctx.stroke();
    ctx.font = '15px Orbitron, monospace';
    ctx.fillStyle = 'rgba(189, 247, 255, 0.8)';
    ctx.fillText('時代', statusLeft, 145);
    ctx.fillStyle = '#e8fdff';
    ctx.font = 'bold 21px "Noto Sans JP", sans-serif';
    ctx.fillText(era.name, statusLeft, 178);
    ctx.fillStyle = 'rgba(189, 247, 255, 0.8)';
    ctx.font = '15px Orbitron, monospace';
    ctx.fillText('焦点', statusLeft, 242);
    ctx.fillStyle = '#e8fdff';
    ctx.font = `${viewport.spanYears <= 1 ? 13 : 18}px "Noto Sans JP", sans-serif`;
    ctx.fillText(formatTimelineFocus(focusYear, viewport.spanYears), statusLeft, 274, statusWidth);
    ctx.fillStyle = 'rgba(189, 247, 255, 0.8)';
    ctx.font = '15px Orbitron, monospace';
    ctx.fillText('表示ノード', statusLeft, 340);
    ctx.fillStyle = '#e8fdff';
    ctx.font = 'bold 42px Orbitron, monospace';
    ctx.fillText(String(model.rows.length).padStart(2, '0'), statusLeft, 390);
    ctx.strokeStyle = era.color;
    ctx.lineWidth = 3;
    ctx.strokeRect(statusLeft, 420, statusWidth, 58);
    ctx.fillStyle = '#e8fdff';
    ctx.font = 'bold 12px Orbitron, monospace';
    ctx.fillText('アーカイブ接続: 安定', statusLeft + 10, 454);

    for (let y = 0; y < H; y += 5) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.055)';
      ctx.fillRect(0, y, W, 2);
    }

    this.holoTexture.needsUpdate = true;
  }

  _renderHologramContent(ev) {
    const ctx = this.detailCanvas.getContext('2d');
    const W = this.detailCanvas.width;
    const H = this.detailCanvas.height;
    const colorValue = CAT_COLORS[ev.category] ?? 0x00e5ff;
    const color = `#${colorValue.toString(16).padStart(6, '0')}`;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(1, 18, 32, 0.86)';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = color;
    ctx.font = 'bold 18px Orbitron, monospace';
    ctx.fillText(`出来事ログ // ${yearToLabel(ev.year)}`, 42, 52);
    ctx.fillStyle = '#ecfdff';
    ctx.font = 'bold 36px "Noto Sans JP", sans-serif';
    this._wrapText(ctx, ev.title, 42, 104, W - 84, 44);
    ctx.strokeStyle = `${color}99`;
    ctx.beginPath();
    ctx.moveTo(42, 178);
    ctx.lineTo(W - 42, 178);
    ctx.stroke();
    ctx.fillStyle = '#a9eefa';
    ctx.font = '21px "Noto Sans JP", sans-serif';
    this._wrapText(ctx, ev.description || '', 42, 220, W - 84, 30);
    this.detailTexture.needsUpdate = true;
  }

  _rebuildHologramMarkers(rows) {
    if (!this.holoMarkerGroup) return;
    this.holoMarkerGroup.clear();
    if (this.interactionMode === 'move') return;
    const {
      canvasWidth, canvasHeight, panelWidth, panelHeight, timelineLeft, timelineWidth, axisY,
    } = this.holoPanelLayout;
    for (const row of rows) {
      const canvasX = timelineLeft + row.position * timelineWidth;
      const canvasY = axisY - (row.lane - 1) * 105;
      const marker = new THREE.Mesh(
        this.holoMarkerGeo,
        this.holoMarkerMaterials[row.event.category] || this.holoMarkerMaterials.technology,
      );
      marker.position.set(
        -panelWidth / 2 + canvasX / canvasWidth * panelWidth,
        panelHeight * (0.5 - canvasY / canvasHeight),
        0,
      );
      marker.scale.setScalar(row.isSelected ? 1.55 : 1);
      marker.userData.event = row.event;
      this.holoMarkerGroup.add(marker);
    }
  }

  _updateHologramBeacons(visible) {
    visible = visible && this.interactionMode === 'move';
    this.beacons.setVisible(visible);
    if (!visible || !this.holoTimelineModel) return;
    this.holoSurface.updateWorldMatrix(true, false);
    this.camera.updateMatrixWorld();
    const {
      canvasWidth, canvasHeight, panelWidth, panelHeight, timelineLeft, timelineWidth, axisY,
    } = this.holoPanelLayout;
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    const projectAxis = (canvasX) => {
      const anchor = new THREE.Vector3(
        -panelWidth / 2 + canvasX / canvasWidth * panelWidth,
        panelHeight * (0.5 - axisY / canvasHeight),
        0.14,
      ).applyMatrix4(this.holoSurface.matrixWorld).project(this.camera);
      return {
        x: (anchor.x + 1) / 2 * width,
        y: (1 - anchor.y) / 2 * height,
        visible: anchor.z >= -1 && anchor.z <= 1,
      };
    };
    const projected = this.holoTimelineModel.rows.map(row => ({
      event: row.event,
      isSelected: row.isSelected,
      ...projectAxis(timelineLeft + row.position * timelineWidth),
    }));
    this.beacons.update(projected, { width, height });
    const archive = this.holoTimelineModel.range.viewport;
    const visibleWindow = getVisibleArchiveWindow(this.camera, this.holoSurface, this.holoPanelLayout, archive);
    this.beacons.updateAxis((visibleWindow ? getTimelineTicks(visibleWindow, width) : []).map(tick => ({
      key: String(tick.year),
      label: tick.label,
      ...projectAxis(timelineLeft + timelineYearPosition(tick.year, archive) * timelineWidth),
    })), { width, height });
  }

  _wrapText(ctx, text, x, y, maxWidth, lineHeight) {
    if (!text) return;
    const chars = [...text];
    let line = '';
    let cy = y;
    for (let i = 0; i < chars.length; i++) {
      const test = line + chars[i];
      if (ctx.measureText(test).width > maxWidth && line !== '') {
        ctx.fillText(line, x, cy);
        line = chars[i];
        cy += lineHeight;
        if (cy > ctx.canvas.height - 34) break;
      } else {
        line = test;
      }
    }
    if (line) ctx.fillText(line, x, cy);
  }

  _getCatLabel(cat) {
    const labels = {
      astronomy: '🌌 宇宙・天文', geology: '🌋 地質', biology: '🦕 生物',
      civilization: '🏛️ 文明・歴史', technology: '⚡ 科学技術',
      japan: '⛩️ 日本史', culture: '🎨 文化・芸術', future: '🚀 未来',
    };
    return labels[cat] || cat;
  }

  // ==============================
  // パーティクル（宇宙塵）
  // ==============================
  _buildParticles() {
    const count = 3000;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      pos[i * 3]     = (Math.random() - 0.5) * 100;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 60;
      pos[i * 3 + 2] = Math.random() * 1200;
    }

    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));

    const mat = new THREE.PointsMaterial({
      color: 0x4488aa,
      size: 0.1,
      transparent: true,
      opacity: 0.6,
      sizeAttenuation: true,
    });

    this.particles = new THREE.Points(geo, mat);
    this.scene.add(this.particles);
  }

  // ==============================
  // カメラ制御
  // ==============================
  _updateCamera() {
    if (!this.camera) return;

    const stagePose = getHologramStagePose();
    const closeRig = getCloseTpsCameraSpec();
    const rearRig = getMoveTpsCameraSpec();
    const moveBlend = this.moveCameraBlend ?? 0;
    const cameraRig = {
      sideOffset: closeRig.sideOffset + (rearRig.sideOffset - closeRig.sideOffset) * moveBlend,
      behindHelmet: closeRig.behindHelmet + (rearRig.behindHelmet - closeRig.behindHelmet) * moveBlend,
      headHeight: closeRig.headHeight + (rearRig.headHeight - closeRig.headHeight) * moveBlend,
      pitchLift: closeRig.pitchLift + (rearRig.pitchLift - closeRig.pitchLift) * moveBlend,
    };
    const walkMotion = this.walkHeadMotion ?? { cameraOffset: 0, bodyOffset: 0 };
    const characterBaseY = stagePose.characterY;
    const stageZ = getTerminalStageZ(this.interactionMode, this.camCurrentZ, this.terminalStageZ);
    const cameraAnchorZ = stageZ + this.cameraTravel + stagePose.characterZOffset;
    const baseCameraX = stagePose.characterX + cameraRig.sideOffset;
    const cameraZ = cameraAnchorZ - cameraRig.behindHelmet;
    const neutralPitch = 0.15;
    const cameraY = characterBaseY + cameraRig.headHeight
      + (this.camAngleX - neutralPitch) * cameraRig.pitchLift
      + walkMotion.bodyOffset + walkMotion.cameraOffset;
    const panelY = this.holoBaseY ?? stagePose.panelY;
    const panelZ = stageZ + (this.holoZOffset ?? stagePose.panelZOffset);
    const panelDistance = Math.hypot(stagePose.panelX - baseCameraX, panelZ - cameraZ);
    const terminalViewYawBias = getModeViewYawBias(
      this.interactionMode,
      stagePose.terminalViewYawBias,
      moveBlend,
    );
    const baseYaw = Math.atan2(stagePose.panelX - baseCameraX, panelZ - cameraZ)
      + terminalViewYawBias;
    const basePitch = Math.atan2(panelY - cameraY, panelDistance);

    // ヘルメット脇に近接したまま、顔と同じ照準方向へ追従する。
    const tracking = getTpsHeadTracking(this.camAngleY, this.camAngleX, baseYaw, basePitch);
    this.tpsHeadTracking = tracking;
    const strafe = getObserverStrafeOffset(this.interactionMode === 'move' ? this.observerStrafe : 0);

    this.camera.position.set(
      baseCameraX + tracking.cameraStrafe + strafe.x,
      cameraY,
      cameraZ + tracking.cameraAdvance + strafe.z,
    );
    const viewDistance = Math.max(18, panelDistance + 3);
    this.camera.lookAt(
      this.camera.position.x + Math.sin(tracking.viewYaw) * viewDistance,
      this.camera.position.y + tracking.viewPitch * viewDistance,
      this.camera.position.z + Math.cos(tracking.viewYaw) * viewDistance,
    );
  }

  _updateCharacterPosition(stageZ) {
    const strafe = getObserverStrafeOffset(this.interactionMode === 'move' ? this.observerStrafe : 0);
    this.character.position.x = this.characterBaseX + strafe.x;
    this.character.position.z = stageZ + this.observerTravel + this.characterZOffset + strafe.z;
    if (this.characterRimEmitter) {
      this.characterRimEmitter.position.set(
        this.character.position.x + this.characterRimLightSpec.offsetX,
        this.character.position.y + this.characterRimLightSpec.offsetY,
        this.character.position.z + this.characterRimLightSpec.offsetZ,
      );
    }
  }

  // ==============================
  // イベントバインド
  // ==============================
  _bindEvents() {
    const cv = this.canvas;

    const setPointer = (event) => {
      this.pointerInsideCanvas = true;
      this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
      this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    };

    cv.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      setPointer(e);
      this.isDragging = true;
      this.lastMouse = { x: e.clientX, y: e.clientY };
      this.dragStartMouse = { x: e.clientX, y: e.clientY };
    });

    cv.addEventListener('mousemove', (e) => {
      setPointer(e);
      if (!this.isDragging || !supportsNeckLook(this.interactionMode)) return;

      const look = adjustNeckLook(
        { yaw: this.camAngleY, pitch: this.camAngleX },
        e.clientX - this.lastMouse.x,
        e.clientY - this.lastMouse.y,
        this.interactionMode,
      );
      this.camAngleY = look.yaw;
      this.camAngleX = look.pitch;
      this.lastMouse = { x: e.clientX, y: e.clientY };
    });

    window.addEventListener('mouseup', () => {
      this.isDragging = false;
    });

    cv.addEventListener('mouseleave', () => {
      this.pointerInsideCanvas = false;
      this.headHovered = false;
    });
    window.addEventListener('blur', () => {
      this.pointerInsideCanvas = false;
      this.headHovered = false;
      this.isDragging = false;
      this._clearMovementKeys();
      this._resetSmileyFlash();
    });

    cv.addEventListener('wheel', event => this._handleWheel(event), { passive: false });

    cv.addEventListener('click', (e) => {
      if (Math.abs(e.clientX - this.dragStartMouse.x) > 5) return; // ドラッグ後のクリック無視
      setPointer(e);
      this._handleClick();
    });

    window.addEventListener('resize', () => this._handleResize());
    window.addEventListener('keydown', event => {
      this._handleSmileyShiftKey(event, true);
      this._handleMovementKey(event, true);
    });
    window.addEventListener('keyup', event => {
      this._handleSmileyShiftKey(event, false);
      this._handleMovementKey(event, false);
    });
    document.addEventListener('focusin', event => {
      if (isTypingTarget(event.target)) {
        this._clearMovementKeys();
        this._resetSmileyFlash();
      }
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this._clearMovementKeys();
        this._resetSmileyFlash();
      }
    });
  }

  _handleSmileyShiftKey(event, pressed) {
    const held = event.key === 'Shift' ? pressed : !!event.shiftKey;
    this.smileyShiftPressed = this._running && !isTypingTarget(event.target) && held;
    if (!this.smileyShiftPressed) this._resetSmileyFlash();
  }

  _resetSmileyFlash() {
    this.smileyShiftPressed = false;
    this.smileyFlashElapsed = 0;
    this.charParts?.head.getObjectByName('smiley-shell')?.material.color.setRGB(1, 1, 1);
  }

  _clearMovementKeys() {
    this.movementKeys.clear();
    this.movementShift = false;
    this.keyboardTravelDirection = 0;
    this.keyboardRepeatTime = 0;
    this.keyboardStrafeDirection = 0;
    this.keyboardStrafeRepeatTime = 0;
  }

  _handleMovementKey(event, pressed) {
    if (!pressed) {
      this.movementKeys.delete(event.key);
      this.movementShift = event.key === 'Shift' ? false : !!event.shiftKey;
      if (MOVEMENT_ARROW_KEYS.has(event.key)) this._updateKeyboardMovement(0);
      return;
    }
    if (this.interactionMode !== 'move' || !this._running) return;
    if (isTypingTarget(event.target)) { this._clearMovementKeys(); return; }
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    this.movementShift = event.key === 'Shift' || !!event.shiftKey;
    if (!MOVEMENT_ARROW_KEYS.has(event.key)) return;
    event.preventDefault();
    const alreadyPressed = this.movementKeys.has(event.key);
    this.movementKeys.add(event.key);
    if (!alreadyPressed) this._updateKeyboardMovement(0);
  }

  _updateKeyboardMovement(dt) {
    if (this.interactionMode !== 'move' || !this._running) {
      this._clearMovementKeys();
      return;
    }
    const step = Math.max(0, Math.min(0.1, dt));
    const direction = Number(this.movementKeys.has('ArrowDown')) - Number(this.movementKeys.has('ArrowUp'));
    if (direction !== this.keyboardTravelDirection) {
      this.keyboardTravelDirection = direction;
      this.keyboardRepeatTime = 0;
      if (direction) this._moveObserver(direction * 120, this.movementShift);
    } else if (direction) {
      this.keyboardRepeatTime += step;
      // Repeat wheel-sized steps at a fixed rate, independent of display refresh rate.
      while (this.keyboardRepeatTime >= 0.18) {
        this.keyboardRepeatTime -= 0.18;
        this._moveObserver(direction * 120, this.movementShift);
      }
    }
    const strafe = Number(this.movementKeys.has('ArrowRight')) - Number(this.movementKeys.has('ArrowLeft'));
    if (strafe !== this.keyboardStrafeDirection) {
      this.keyboardStrafeDirection = strafe;
      this.keyboardStrafeRepeatTime = 0;
      if (strafe) this._strafeObserver(strafe * 120, this.movementShift);
    } else if (strafe) {
      this.keyboardStrafeRepeatTime += step;
      while (this.keyboardStrafeRepeatTime >= 0.18) {
        this.keyboardStrafeRepeatTime -= 0.18;
        this._strafeObserver(strafe * 120, this.movementShift);
      }
    }
  }

  _expandMovementArchive() {
    if (this.moveSurfaceExpanded) return;
    this.moveSurfaceExpanded = true;
    this.holoExpansionElapsed = 0;
    this._setHologramLayout('move', 0);
    state.setTimelineSpan(MAX_TIMELINE_SPAN);
    if (this.holoTimelineModel) this._updateVisiblePins();
  }

  _strafeObserver(delta, fast = false) {
    if (!delta) return;
    if (!this.moveSurfaceExpanded) this._calibrateMoveArchiveScale();
    const distanceSpeed = Math.max(1, (7 - this.observerTravelTarget) / 40);
    this.observerStrafeTarget += delta * 0.012 * distanceSpeed * (fast ? 100 : 1);
    this._expandMovementArchive();
    this._constrainObserverStrafe();
  }

  _getObserverForwardView(travel, strafe = 0) {
    if (!this.camera || !this.holoPanelLayout) return null;
    const pose = getHologramStagePose();
    const camera = this._observerForwardCamera ??= this.camera.clone();
    camera.copy(this.camera, false);
    // Neck rotation must not change the walkable range or drag the observer sideways.
    Scene3D.prototype._updateCamera.call({ camera, interactionMode: 'move', cameraTravel: travel, observerStrafe: strafe,
      camCurrentZ: this.camCurrentZ, terminalStageZ: this.terminalStageZ,
      camAngleY: 0, camAngleX: 0.15 });
    const surface = this._observerForwardSurface ??= new THREE.Group();
    const offset = getObserverStrafeOffset(this.holoPanelLayout.panelOffsetX * pose.panelScale);
    surface.position.set(pose.panelX + offset.x, pose.panelY,
      this.camCurrentZ + pose.panelZOffset + offset.z);
    surface.rotation.y = pose.panelRotationY;
    surface.scale.setScalar(pose.panelScale);
    return { camera, surface };
  }

  _getObserverStrafeBounds(travel) {
    const forward = this._getObserverForwardView(travel);
    return forward ? getArchiveStrafeBounds(forward.camera, forward.surface, this.holoPanelLayout) : null;
  }

  _updateMovementFocusYear() {
    let year = null;
    const archive = this.holoTimelineModel?.range.viewport;
    if (this.interactionMode === 'move' && archive) {
      const forward = this._getObserverForwardView(this.observerTravel, this.observerStrafe);
      const focus = forward && getArchiveFocusYear(forward.camera, forward.surface, this.holoPanelLayout, archive);
      // Publish whole years so floating-point noise and walking motion do not flicker the readout.
      if (Number.isFinite(focus)) year = Math.floor(focus + 0.00001);
    }
    if (state.state.movementFocusYear !== year) state.update({ movementFocusYear: year });
  }

  _constrainObserverStrafe() {
    if (this.interactionMode !== 'move') return;
    for (const [key, travel] of [
      ['observerStrafeTarget', this.observerTravelTarget],
      ['observerStrafe', this.observerTravel],
    ]) {
      const bounds = this._getObserverStrafeBounds(travel);
      if (bounds) this[key] = Math.max(bounds.min, Math.min(bounds.max, this[key]));
    }
  }

  _moveObserver(delta, fast = false) {
    if (!this.moveSurfaceExpanded && delta !== 0) this._calibrateMoveArchiveScale();
    const nextTravelTarget = adjustObserverTravel(this.observerTravelTarget, delta,
      { fast, minTravel: this.moveTravelMin });
    if (!this.moveSurfaceExpanded && nextTravelTarget !== this.observerTravelTarget) {
      this._expandMovementArchive();
    }
    this.observerTravelTarget = nextTravelTarget;
    this._constrainObserverStrafe();
  }

  _handleWheel(event) {
    event.preventDefault();
    if (getWheelInteraction(this.interactionMode) === 'travel') {
      const travelDelta = event.deltaY || (event.shiftKey ? event.deltaX || 0 : 0);
      this._moveObserver(travelDelta, event.shiftKey);
      return;
    }
    const { currentYear, timelineSpanYears } = state.state;
    if (event.shiftKey) {
      state.setTimelineSpan(timelineSpanYears * Math.exp(Math.max(-1, Math.min(1, event.deltaY * 0.005))));
      return;
    }
    const viewport = getTimelineWindow(currentYear, timelineSpanYears);
    const position = timelineYearPosition(currentYear, viewport) + event.deltaY / 600;
    const year = timelineYearAtPosition(position, viewport);
    state.setYear(Math.max(YEAR_MIN, Math.min(YEAR_MAX, year)));
  }

  _handleClick() {
    this.raycaster.setFromCamera(this.mouse, this.camera);

    const characterHits = this.character
      ? this.raycaster.intersectObject(this.character, true)
      : [];
    if (characterHits.length > 0) {
      const nextMode = this.interactionMode === 'move' ? '3d' : 'move';
      if (this._onRequestMode) this._onRequestMode(nextMode);
      else this.setInteractionMode(nextMode);
      return;
    }

    const screenHit = this.holoMesh
      ? this.raycaster.intersectObject(this.holoMesh, false)[0]
      : null;
    if (screenHit && this._hitsExpand2DControl(screenHit.uv)) {
      this._onRequest2D?.();
      return;
    }

    const intersects = this.holoMarkerGroup
      ? this.raycaster.intersectObjects(this.holoMarkerGroup.children, true)
      : [];

    if (intersects.length > 0) {
      const ev = intersects[0].object.userData.event;
      if (ev) {
        this._selectEvent(ev);
      }
    } else {
      // クリックがピンに当たらなかった → 選択解除
      this._closeHologram();
    }
  }

  _hitsExpand2DControl(uv) {
    const { expand2d } = this.holoInteractionControls;
    const x = uv.x * this.holoPanelLayout.canvasWidth;
    const y = (1 - uv.y) * this.holoPanelLayout.canvasHeight;
    return x >= expand2d.x
      && x <= expand2d.x + expand2d.width
      && y >= expand2d.y
      && y <= expand2d.y + expand2d.height;
  }

  _selectEvent(ev, synchronizeState = true) {
    this.selectedEvent = ev;
    if (Number.isFinite(ev._z)) this.camTargetZ = ev._z;
    if (synchronizeState) state.selectEvent(ev);

    // 選択情報だけを前方レイヤーに展開する
    this._renderHologramContent(ev);
    this.detailGroup.visible = true;
    this._detailTargetOpacity = 1.0;
    this._updateVisiblePins();
  }

  _closeHologram(synchronizeState = true) {
    this._detailTargetOpacity = 0;
    this.selectedEvent = null;
    if (synchronizeState) state.selectEvent(null);
    this._updateVisiblePins();
  }

  _handleResize() {
    const oldMoveLayout = this.interactionMode === 'move' && this.moveSurfaceExpanded
      ? getHologramPanelLayout('move', 1, this.moveTimelineWidth) : null;
    const w = window.innerWidth, h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    if (this.interactionMode === 'move' && this.moveSurfaceExpanded) {
      this._calibrateMoveArchiveScale();
      const newMoveLayout = getHologramPanelLayout('move', 1, this.moveTimelineWidth);
      const scale = getHologramStagePose().panelScale;
      this.observerStrafe = remapArchiveStrafe(this.observerStrafe, oldMoveLayout, newMoveLayout, scale);
      this.observerStrafeTarget = remapArchiveStrafe(this.observerStrafeTarget, oldMoveLayout, newMoveLayout, scale);
      this.observerTravel = Math.max(this.moveTravelMin, this.observerTravel);
      this.cameraTravel = this.observerTravel;
      this.observerTravelTarget = Math.max(this.moveTravelMin, this.observerTravelTarget);
      const progress = Math.min(1, this.holoExpansionElapsed / HOLOGRAM_EXPANSION_SECONDS);
      this._setHologramLayout('move', progress * progress * (3 - 2 * progress));
      this._constrainObserverStrafe();
      this._updateVisiblePins();
    }
  }

  // ==============================
  // 時代ジャンプ
  // ==============================
  jumpToYear(year) {
    this.camTargetZ = yearToZ(year);
    state.setYear(year);
  }

  // ==============================
  // レンダリングループ
  // ==============================
  start() {
    this._running = true;
    this._loop();
  }

  stop() {
    this._running = false;
    this._clearMovementKeys();
    this._resetSmileyFlash();
    this.pointerInsideCanvas = false;
    this.headHovered = false;
    this.headHoverBlend = 0;
    this.beacons?.setVisible(false);
    if (this._animId) cancelAnimationFrame(this._animId);
  }

  _loop() {
    if (!this._running) return;
    this._animId = requestAnimationFrame(() => this._loop());

    const dt = this.clock.getDelta();
    const t = this.clock.getElapsedTime();
    this._updateKeyboardMovement(dt);

    // カメラZ スムーズ移動
    this.camCurrentZ += (this.camTargetZ - this.camCurrentZ) * Math.min(1, dt * 5);
    const travelStep = getObserverFollowStep(
      this.observerTravel,
      this.cameraTravel,
      this.observerTravelTarget,
      dt,
    );
    this.observerTravel = travelStep.observerTravel;
    this.cameraTravel = travelStep.cameraTravel;
    this._updateHologramExpansion(dt);
    this.observerStrafe = getObserverFollowStep(this.observerStrafe, this.observerStrafe,
      this.observerStrafeTarget, dt).observerTravel;
    this._constrainObserverStrafe();
    const travelGap = this.interactionMode === 'move'
      ? this.observerTravelTarget - this.observerTravel
      : 0;
    this.moveCameraBlend = getMoveCameraBlend(this.observerTravel - this.cameraTravel);
    const strafeGap = this.interactionMode === 'move' ? this.observerStrafeTarget - this.observerStrafe : 0;
    this.walkHeadMotion = getWalkHeadMotion(t, Math.hypot(travelGap, strafeGap));
    this._updateCamera();
    this._updateMovementFocusYear();

    // 観測者と肩越しカメラだけを前後させ、端末は年代位置に残す。
    const stageZ = getTerminalStageZ(this.interactionMode, this.camCurrentZ, this.terminalStageZ);
    this._updateCharacterPosition(stageZ);

    // 端末は固定された観測位置に留まり、内容だけが年代とともに切り替わる。
    this.hologram.position.z = stageZ + this.holoZOffset;
    this.hologramLight.position.set(
      this.hologram.position.x,
      this.hologram.position.y,
      this.hologram.position.z - 0.8,
    );

    // ホログラムシェーダー時間
    this.holoMat.uniforms.time.value = t;
    this.detailMat.uniforms.time.value = t;
    const brightness = getHologramBrightnessPulse(t);
    this.holoMat.uniforms.brightness.value = brightness;
    this.detailMat.uniforms.brightness.value = brightness;

    // 選択した出来事だけを前方レイヤーとして開閉する
    const curDetailOpacity = this.detailMat.uniforms.opacity.value;
    const nextDetailOpacity = curDetailOpacity
      + (this._detailTargetOpacity - curDetailOpacity) * Math.min(1, dt * 7);
    this.detailMat.uniforms.opacity.value = nextDetailOpacity;

    // Keep the monitor growth after the brief name splash, without a separate boot line.
    this._hologramOpenElapsed += dt;
    const openProgress = getHologramOpeningProgress(this._hologramOpenElapsed);
    const presentation = getHologramBootPresentation(openProgress);
    const illumination = getHologramIlluminationProgress(openProgress);
    const rimLightProgress = getCharacterRimLightProgress(this._hologramOpenElapsed);
    const panelScale = this.holoBaseScale;
    this.hologram.scale.set(panelScale, panelScale * Math.max(0.018, openProgress), panelScale);
    this._setHologramBootPresentation(presentation, illumination, rimLightProgress);
    this.detailGroup.visible = presentation.showTerminal
      && (nextDetailOpacity > 0.01 || this._detailTargetOpacity > 0.01);

    // モニターは固定し、幾何の揺れではなく明るさだけで生体感を出す。
    this.hologram.position.y = this.holoBaseY;
    this.hologram.rotation.y = this.holoBaseRotationY;

    // 移動中だけ、頭とカメラに小さな歩行リズムを与える。
    this._animateCharacter(dt);

    // 大きな移動ごと、または到着直後に年表の表示を同期する
    if (shouldRefreshHologram(this.camCurrentZ, this._lastHologramRenderZ, this.camTargetZ)) {
      this._updateVisiblePins();
    }

    if (this.interactionMode === 'move' && presentation.showTerminal) {
      this.moveMonitor?.update(this.camera, this.holoSurface, this.holoPanelLayout);
    }
    this._updateHologramBeacons(presentation.showHud);
    this.renderer.render(this.scene, this.camera);
  }

  _updateHeadHover() {
    this.headHovered = false;
    if (!this.pointerInsideCanvas || this.isDragging || !this.camera || !this.character) return;
    const shell = this.charParts?.head.getObjectByName('smiley-shell');
    if (!shell) return;
    this.camera.updateMatrixWorld();
    this.character.updateWorldMatrix(true, true);
    this.raycaster.setFromCamera(this.mouse, this.camera);
    // The sphere remains a stable target while the face and glasses turn.
    // Transparent corners of the facial texture must not count as the head.
    this.headHovered = this.raycaster.intersectObject(shell, false).length > 0;
  }

  _animateCharacter(dt = 1 / 60) {
    if (!this.charParts) return;
    const { lArm, rArm, lLeg, rLeg, head } = this.charParts;
    const walkMotion = this.walkHeadMotion ?? { headOffset: 0, bodyOffset: 0 };
    const characterScale = this.character?.scale.y ?? 1;

    // Idle view remains still; movement mode gets a restrained head rise/fall.
    lArm.rotation.x = 0.1;
    rArm.rotation.x = -0.1;
    lLeg.rotation.x = 0;
    rLeg.rotation.x = 0;
    head.position.y = 2.02 + walkMotion.headOffset / characterScale;
    this.character.position.y = getHologramStagePose().characterY + walkMotion.bodyOffset;

    // Tint the continuous yellow gradient; facial marks and glasses retain their colors.
    if (this.smileyShiftPressed) {
      this.smileyFlashElapsed += Math.min(0.1, Math.max(0, dt));
      const pulse = (1 - Math.cos(this.smileyFlashElapsed * Math.PI * 4)) / 2;
      head.getObjectByName('smiley-shell')?.material.color.setRGB(1, 1 - 0.88 * pulse, 1 - 0.94 * pulse);
    }

    this._updateHeadHover();
    const hoverTarget = this.headHovered ? 1 : 0;
    const blendStep = 1 - Math.exp(-Math.min(0.1, Math.max(0, dt)) * 8);
    this.headHoverBlend += (hoverTarget - this.headHoverBlend) * blendStep;
    if (Math.abs(hoverTarget - this.headHoverBlend) < 0.001) this.headHoverBlend = hoverTarget;
    head.rotation.set(-this.tpsHeadTracking.headPitch, this.tpsHeadTracking.headYaw, 0, 'YXZ');
    if (this.headHoverBlend > 0) {
      this.camera.getWorldPosition(this._headLookPosition);
      this.character.worldToLocal(this._headLookPosition);
      this._headLookPosition.sub(head.position);
      const yaw = Math.atan2(this._headLookPosition.x, this._headLookPosition.z);
      const pitch = Math.atan2(this._headLookPosition.y,
        Math.hypot(this._headLookPosition.x, this._headLookPosition.z));
      this._headLookEuler.set(-pitch, yaw, 0, 'YXZ');
      this._headLookRotation.setFromEuler(this._headLookEuler);
      head.quaternion.slerp(this._headLookRotation, this.headHoverBlend);
    }
  }

  dispose() {
    this.stop();
    this.beacons?.dispose();
    this.moveMonitor?.dispose();
    this.renderer.dispose();
  }
}
