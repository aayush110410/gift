/**
 * STORY MODE — Exploring Shubhanshi's World (Dora-style)
 * - Level 0: Portal Hub
 * - Levels 1..15: short challenges per spec
 * Three.js r128 compatible, non-module.
 */

// ============================================
// GLOBAL STATE
// ============================================
let scene, camera, renderer, clock;

let isGameRunning = false;
let isPointerLocked = false;

// First-person look
let yaw = 0;
let pitch = 0;
const EYE_HEIGHT = 2.05;

// Movement
const keys = { forward: false, backward: false, left: false, right: false };
let isSprinting = false;
const BASE_SPEED = 10.5;
const SPRINT_MULT = 1.65;

// Player
const player = {
  position: new THREE.Vector3(0, 0, 0),
  radius: 0.65,
};

// Level / progress
const TOTAL_LEVELS = 15;
let currentLevel = 0; // 0 = hub, 1..15 = levels
let completedLevels = new Set();
let understandingBonus = 0; // Chai level extra

// Level-local objects
let interactables = []; // { id, name, x,z, radius, onInteract, message }
let hazards = []; // { mesh, velocity, kind, hitRadius, onHit, ttl }
let pickups = []; // { mesh, kind, pickRadius, float, baseY, seed, onPick }
let colliders = []; // wall AABBs: { minX,maxX,minZ,maxZ }
let clickables = []; // clickable root meshes for sleep level

// Level logic
let levelState = null;
let freezeUntil = 0;

// Overlay modes
let overlayMode = 'none'; // none | challenge | rhythm | sketch

// Bounds (XZ)
let bounds = { minX: -40, maxX: 40, minZ: -28, maxZ: 28 };

// Rhythm
let rhythm = null; // { speed, pos01, score }

// Utils
const tmpV = new THREE.Vector3();

// ============================================
// INIT
// ============================================
window.addEventListener('DOMContentLoaded', init);

function init() {
  setupCamera();
  setupRenderer();
  setupControls();
  setupUI();

  clock = new THREE.Clock();
  loadLevel(0);
  animate();
}

function setupCamera() {
  camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.1, 500);
  camera.position.set(0, EYE_HEIGHT, 10);
  camera.rotation.order = 'YXZ';
}

function setupRenderer() {
  const canvas = document.getElementById('game-canvas');
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.physicallyCorrectLights = true;
}

function setupLighting(theme) {
  const ambient = new THREE.AmbientLight(theme === 'cold' ? 0xddeeff : 0xffeedd, theme === 'cold' ? 0.65 : 0.6);
  scene.add(ambient);

  const sun = new THREE.DirectionalLight(theme === 'cold' ? 0xe6f3ff : 0xfff5e6, theme === 'cold' ? 1.05 : 1.0);
  sun.position.set(60, 100, -40);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 0.5;
  sun.shadow.camera.far = 250;
  sun.shadow.camera.left = -90;
  sun.shadow.camera.right = 90;
  sun.shadow.camera.top = 90;
  sun.shadow.camera.bottom = -90;
  scene.add(sun);

  const hemi = new THREE.HemisphereLight(
    theme === 'cold' ? 0xd9f2ff : 0xffeeb1,
    theme === 'cold' ? 0x334455 : 0x80a080,
    0.45
  );
  scene.add(hemi);
}

// ============================================
// CONTROLS
// ============================================
function setupControls() {
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('resize', onResize);

  const canvas = document.getElementById('game-canvas');
  const overlay = document.getElementById('click-overlay');

  function requestLock() {
    if (!isGameRunning) return;
    if (overlayMode !== 'none') return;
    if (isPointerLocked) return;
    try { canvas.requestPointerLock(); } catch (_) {}
  }

  canvas.addEventListener('click', requestLock);
  if (overlay) overlay.addEventListener('click', (e) => { e.preventDefault(); requestLock(); });
  document.addEventListener('click', requestLock);

  document.addEventListener('pointerlockchange', () => {
    isPointerLocked = document.pointerLockElement === canvas;
    const clickOverlay = document.getElementById('click-overlay');
    if (isGameRunning && !isPointerLocked && overlayMode === 'none') clickOverlay.classList.remove('hidden');
    else clickOverlay.classList.add('hidden');
  });

  document.addEventListener('mousemove', (e) => {
    if (!isPointerLocked || !isGameRunning) return;
    if (overlayMode !== 'none') return;
    yaw -= e.movementX * 0.003;
    pitch -= e.movementY * 0.003;
    pitch = Math.max(-0.85, Math.min(1.05, pitch));
  });

  document.addEventListener('mousedown', onMouseDown);
}

function onKeyDown(e) {
  if (!isGameRunning) return;

  const code = e.code;
  const key = (e.key || '').toLowerCase();

  if (code === 'ShiftLeft' || code === 'ShiftRight') {
    isSprinting = true;
    return;
  }

  if (code === 'KeyW' || code === 'ArrowUp' || key === 'w') { keys.forward = true; e.preventDefault(); }
  if (code === 'KeyS' || code === 'ArrowDown' || key === 's') { keys.backward = true; e.preventDefault(); }
  if (code === 'KeyA' || code === 'ArrowLeft' || key === 'a') { keys.left = true; e.preventDefault(); }
  if (code === 'KeyD' || code === 'ArrowRight' || key === 'd') { keys.right = true; e.preventDefault(); }

  if (code === 'Space' || key === ' ') {
    if (currentLevel === 7 && rhythm) {
      handleRhythmHit();
    } else {
      tryInteract();
    }
    e.preventDefault();
  }

  if (code === 'Escape') {
    hideOverlays();
    document.exitPointerLock();
  }

  if (code === 'KeyM') {
    // keep existing mini-map toggle (optional)
    const map = document.getElementById('mini-map');
    if (map) map.classList.toggle('hidden');
  }
}

function onKeyUp(e) {
  const code = e.code;
  const key = (e.key || '').toLowerCase();

  if (code === 'KeyW' || code === 'ArrowUp' || key === 'w') keys.forward = false;
  if (code === 'KeyS' || code === 'ArrowDown' || key === 's') keys.backward = false;
  if (code === 'KeyA' || code === 'ArrowLeft' || key === 'a') keys.left = false;
  if (code === 'KeyD' || code === 'ArrowRight' || key === 'd') keys.right = false;

  if (code === 'ShiftLeft' || code === 'ShiftRight') isSprinting = false;
}

function onMouseDown() {
  if (!isGameRunning) return;
  if (overlayMode !== 'none') return;
  if (!(currentLevel === 10 && levelState && levelState.type === 'sleep')) return;

  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
  const hits = raycaster.intersectObjects(clickables, true);
  if (!hits.length) return;

  const hit = hits[0].object;
  const root = hit.userData.root || hit;
  if (!root.userData || root.userData.kind !== 'alarm') return;

  scene.remove(root);
  clickables = clickables.filter(o => o !== root);
  levelState.remaining -= 1;
  playSound(520, 0.12, 0.12);
  updateUnderstanding();
  if (levelState.remaining <= 0) {
    completeLevel(10, 'Sleep is sacred here.');
  }
}

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

// ============================================
// UI
// ============================================
function setupUI() {
  const startBtn = document.getElementById('start-button');
  startBtn.addEventListener('click', () => {
    isGameRunning = true;
    document.getElementById('start-screen').style.display = 'none';
    document.getElementById('hud').classList.remove('hidden');
    document.getElementById('click-overlay').classList.remove('hidden');
    playSound(440, 0.15, 0.12);

    setTimeout(() => {
      try { document.getElementById('game-canvas').requestPointerLock(); } catch (_) {}
    }, 200);
  });

  const continueBtn = document.getElementById('continue-button');
  if (continueBtn) {
    continueBtn.addEventListener('click', () => {
      showPopup('Go complete the mission in real life.');
    });
  }

  const challengeClose = document.getElementById('challenge-close');
  if (challengeClose) {
    challengeClose.addEventListener('click', hideChallengeOverlay);
  }

  setupSketchUI();
  updateUnderstanding();
}

function showPopup(text) {
  const popup = document.getElementById('popup-container');
  const p = document.getElementById('popup-text');
  p.textContent = text;
  popup.classList.remove('hidden');
  setTimeout(() => popup.classList.add('hidden'), 4200);
}

function showZoneAlert(text) {
  const alert = document.getElementById('zone-alert');
  const t = document.getElementById('alert-text');
  t.textContent = text;
  alert.classList.remove('hidden');
  setTimeout(() => alert.classList.add('hidden'), 2400);
}

function updateUnderstanding() {
  const totalEl = document.getElementById('zones-total');
  if (totalEl) totalEl.textContent = String(TOTAL_LEVELS);

  const val = Math.min(TOTAL_LEVELS, completedLevels.size + understandingBonus);
  document.getElementById('zones-discovered').textContent = String(val);
  document.getElementById('progress-fill').style.width = `${(val / TOTAL_LEVELS) * 100}%`;
}

function showFinal() {
  document.getElementById('hud').classList.add('hidden');
  document.getElementById('popup-container').classList.add('hidden');
  document.getElementById('mini-map').classList.add('hidden');
  document.getElementById('final-message').classList.remove('hidden');
  document.exitPointerLock();
}

function showWarmFlash() {
  const el = document.getElementById('warm-flash');
  if (!el) return;
  el.classList.remove('hidden');
  void el.offsetWidth;
  setTimeout(() => el.classList.add('hidden'), 1200);
}

// Challenge overlay
function showChallengeOverlay(title, text, options) {
  overlayMode = 'challenge';
  const overlay = document.getElementById('challenge-overlay');
  document.getElementById('challenge-title').textContent = title;
  document.getElementById('challenge-text').textContent = text;
  const optionsEl = document.getElementById('challenge-options');
  optionsEl.innerHTML = '';
  options.forEach(opt => {
    const btn = document.createElement('button');
    btn.textContent = opt.label;
    btn.addEventListener('click', opt.onSelect);
    optionsEl.appendChild(btn);
  });
  overlay.classList.remove('hidden');
}

function hideChallengeOverlay() {
  overlayMode = 'none';
  const overlay = document.getElementById('challenge-overlay');
  if (overlay) overlay.classList.add('hidden');
}

function showRhythmOverlay() {
  overlayMode = 'rhythm';
  document.getElementById('rhythm-overlay').classList.remove('hidden');
  document.getElementById('rhythm-score').textContent = '0';
}

function hideRhythmOverlay() {
  overlayMode = 'none';
  document.getElementById('rhythm-overlay').classList.add('hidden');
}

function showSketchOverlay() {
  overlayMode = 'sketch';
  document.getElementById('sketch-overlay').classList.remove('hidden');
  document.getElementById('sketch-done').classList.add('hidden');
  resetSketchPieces();
}

function hideSketchOverlay() {
  overlayMode = 'none';
  document.getElementById('sketch-overlay').classList.add('hidden');
}

function hideOverlays() {
  hideChallengeOverlay();
  hideRhythmOverlay();
  hideSketchOverlay();
}

// Sketch drag/drop
function setupSketchUI() {
  const overlay = document.getElementById('sketch-overlay');
  if (!overlay) return;

  const pieces = overlay.querySelectorAll('.piece');
  const slots = overlay.querySelectorAll('.slot');
  const doneBtn = document.getElementById('sketch-done');

  pieces.forEach(p => {
    p.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/plain', p.dataset.piece);
    });
  });

  slots.forEach(s => {
    s.addEventListener('dragover', (e) => e.preventDefault());
    s.addEventListener('drop', (e) => {
      e.preventDefault();
      const pieceId = e.dataTransfer.getData('text/plain');
      if (!pieceId) return;
      const piece = overlay.querySelector(`.piece[data-piece="${pieceId}"]`);
      if (!piece) return;

      s.textContent = piece.textContent;
      s.dataset.filled = pieceId;
      piece.classList.add('hidden');

      const ok = Array.from(slots).every(slot => slot.dataset.filled === slot.dataset.slot);
      if (ok) doneBtn.classList.remove('hidden');
    });
  });

  doneBtn.addEventListener('click', () => {
    hideSketchOverlay();
    completeLevel(14, 'Art side remembered.');
  });
}

function resetSketchPieces() {
  const overlay = document.getElementById('sketch-overlay');
  if (!overlay) return;
  overlay.querySelectorAll('.piece').forEach(p => p.classList.remove('hidden'));
  overlay.querySelectorAll('.slot').forEach(s => {
    s.textContent = '';
    delete s.dataset.filled;
  });
}

// ============================================
// AUDIO
// ============================================
function playSound(freq, vol, dur) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(vol, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + dur);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + dur);
  } catch (_) {}
}

// ============================================
// GAME LOOP
// ============================================
function animate() {
  requestAnimationFrame(animate);

  const delta = clock.getDelta();
  const t = clock.getElapsedTime();

  if (isGameRunning) {
    updateMovement(delta, t);
    updateLevel(delta, t);
    updateCamera();
  }

  renderer.render(scene, camera);

  if (currentLevel === 7 && rhythm) {
    updateRhythmUI(delta);
  }
}

function updateCamera() {
  camera.position.set(player.position.x, player.position.y + EYE_HEIGHT, player.position.z);
  camera.rotation.y = yaw;
  camera.rotation.x = pitch;
}

function updateMovement(delta, t) {
  if (t < freezeUntil) return;
  if (overlayMode !== 'none' && overlayMode !== 'rhythm') {
    // allow looking with pointer lock only when no overlay
    return;
  }

  const forward = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
  const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), forward);

  const dir = new THREE.Vector3();
  if (keys.forward) dir.add(forward);
  if (keys.backward) dir.sub(forward);
  if (keys.left) dir.sub(right);
  if (keys.right) dir.add(right);

  if (dir.lengthSq() > 0) {
    dir.normalize();
    let speed = BASE_SPEED * (isSprinting ? SPRINT_MULT : 1);

    // Garden level: too much chaos if sprinting
    if (currentLevel === 8 && isSprinting) {
      if (!levelState) {
        // nothing
      } else {
        if (!levelState.lastChaosAt || (t - levelState.lastChaosAt) > 1.0) {
          levelState.lastChaosAt = t;
          showPopup('Too much chaos. Slow down.');
        }
      }
      speed = BASE_SPEED * 1.05;
    }

    player.position.addScaledVector(dir, speed * delta);
  }

  // bounds
  player.position.x = Math.max(bounds.minX, Math.min(bounds.maxX, player.position.x));
  player.position.z = Math.max(bounds.minZ, Math.min(bounds.maxZ, player.position.z));

  // maze wall collision
  if (colliders.length) resolveCollisions();
}

function resolveCollisions() {
  for (const c of colliders) {
    const closestX = Math.max(c.minX, Math.min(c.maxX, player.position.x));
    const closestZ = Math.max(c.minZ, Math.min(c.maxZ, player.position.z));
    const dx = player.position.x - closestX;
    const dz = player.position.z - closestZ;
    const distSq = dx * dx + dz * dz;
    const r = player.radius;
    if (distSq < r * r && distSq > 1e-6) {
      const dist = Math.sqrt(distSq);
      const push = (r - dist) / dist;
      player.position.x += dx * push;
      player.position.z += dz * push;
    }
  }
}

function updateLevel(delta, t) {
  // Interactables
  const near = findNearbyInteractable();
  const prompt = document.getElementById('interaction-prompt');
  if (near) {
    prompt.classList.remove('hidden');
  } else {
    prompt.classList.add('hidden');
  }

  // Timed spawn (snow/books/dresses)
  if (levelState && levelState.spawn) {
    if (t >= levelState.spawn.nextAt) {
      levelState.spawn.nextAt = t + levelState.spawn.every;
      spawnHazardOrPickup(levelState.spawn.kind);
    }
  }

  // Extra low-budget spawns for level 11
  if (levelState && levelState.type === 'shopping' && levelState.low) {
    if (t >= levelState.low.nextAt) {
      levelState.low.nextAt = t + levelState.low.every;
      spawnHazardOrPickup('lowbudget');
    }
  }

  // Horizontal dahi spawns
  if (levelState && levelState.type === 'dahi' && levelState.horizontal) {
    if (t >= levelState.horizontal.nextAt) {
      levelState.horizontal.nextAt = t + levelState.horizontal.every;
      spawnHorizontalDahi();
    }
  }

  // Update hazards
  for (let i = hazards.length - 1; i >= 0; i--) {
    const h = hazards[i];
    h.mesh.position.addScaledVector(h.velocity, delta);
    if (h.spin) {
      h.mesh.rotation.x += h.spin.x * delta;
      h.mesh.rotation.y += h.spin.y * delta;
      h.mesh.rotation.z += h.spin.z * delta;
    }

    // hit player
    const dx = h.mesh.position.x - player.position.x;
    const dz = h.mesh.position.z - player.position.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist < (h.hitRadius || 1.05)) {
      if (h.onHit) h.onHit();
      scene.remove(h.mesh);
      hazards.splice(i, 1);
      continue;
    }

    // ttl/cleanup
    if (h.ttl) {
      h.ttl -= delta;
      if (h.ttl <= 0) {
        scene.remove(h.mesh);
        hazards.splice(i, 1);
        continue;
      }
    }

    if (h.mesh.position.y < -2 || h.mesh.position.x < bounds.minX - 20 || h.mesh.position.x > bounds.maxX + 20 || h.mesh.position.z < bounds.minZ - 30 || h.mesh.position.z > bounds.maxZ + 30) {
      scene.remove(h.mesh);
      hazards.splice(i, 1);
    }
  }

  // Update pickups
  for (let i = pickups.length - 1; i >= 0; i--) {
    const p = pickups[i];
    if (p.float) {
      p.mesh.position.y = p.baseY + Math.sin(t * 2 + p.seed) * 0.25;
      p.mesh.lookAt(camera.position);
    }

    const dx = p.mesh.position.x - player.position.x;
    const dz = p.mesh.position.z - player.position.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist < (p.pickRadius || 1.1)) {
      if (p.onPick) p.onPick();
      scene.remove(p.mesh);
      pickups.splice(i, 1);
      continue;
    }

    if (p.ttl) {
      p.ttl -= delta;
      if (p.ttl <= 0) {
        scene.remove(p.mesh);
        pickups.splice(i, 1);
      }
    }
  }

  // Timed success
  if (levelState && levelState.surviveUntil && t >= levelState.surviveUntil) {
    completeLevel(currentLevel, levelState.success);
  }
}

function findNearbyInteractable() {
  for (const it of interactables) {
    const dx = player.position.x - it.x;
    const dz = player.position.z - it.z;
    if (Math.sqrt(dx * dx + dz * dz) <= it.radius) return it;
  }
  return null;
}

function tryInteract() {
  const it = findNearbyInteractable();
  if (!it) return;
  if (it.message) showPopup(it.message);
  if (it.onInteract) it.onInteract();
}

// ============================================
// LEVEL LOADING
// ============================================
function loadLevel(levelNumber) {
  currentLevel = levelNumber;
  hideOverlays();
  freezeUntil = 0;

  // reset containers
  interactables = [];
  hazards = [];
  pickups = [];
  colliders = [];
  clickables = [];
  levelState = null;
  rhythm = null;

  // scene
  scene = new THREE.Scene();

  // UI
  const levelEl = document.getElementById('level-indicator');
  if (levelEl) levelEl.textContent = levelNumber === 0 ? 'Portal Hub' : `Level ${levelNumber} / ${TOTAL_LEVELS}`;
  document.getElementById('current-zone').textContent = levelNumber === 0 ? 'Portal Hub' : `Level ${levelNumber}`;

  // build
  if (levelNumber === 0) buildHub();
  else buildLevel(levelNumber);

  // place player
  player.position.set(0, 0, 14);
  yaw = 0;
  pitch = 0.1;

  updateUnderstanding();
}

function buildHub() {
  scene.fog = new THREE.FogExp2(0xffdfd2, 0.012);
  renderer.setClearColor(0xffe9df, 1);
  setupLighting('warm');

  bounds = { minX: -48, maxX: 48, minZ: -48, maxZ: 48 };

  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(48, 50),
    new THREE.MeshStandardMaterial({ color: 0xfff2f6, roughness: 0.95, metalness: 0.0 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(180, 32, 24),
    new THREE.MeshBasicMaterial({ color: 0xffd1dc, side: THREE.BackSide })
  );
  scene.add(sky);

  const ringR = 33;
  for (let i = 1; i <= TOTAL_LEVELS; i++) {
    const angle = (i / TOTAL_LEVELS) * Math.PI * 2;
    const x = Math.cos(angle) * ringR;
    const z = Math.sin(angle) * ringR;

    const unlocked = isUnlocked(i);
    const portal = makePortal(unlocked ? 0xff6b9d : 0x777777);
    portal.position.set(x, 4.2, z);
    portal.rotation.y = -angle + Math.PI;
    scene.add(portal);

    const label = makeBillboard(`Level ${i}`);
    label.position.set(x, 2.1, z);
    label.userData.baseY = 2.1;
    label.userData.seed = i * 0.7;
    scene.add(label);
    pickups.push({ mesh: label, float: true, baseY: 2.1, seed: label.userData.seed, pickRadius: 999, onPick: null });

    interactables.push({
      id: `portal-${i}`,
      name: `Portal Level ${i}`,
      x,
      z,
      radius: 6,
      message: unlocked ? 'Press SPACE to enter.' : 'Locked. Complete previous level first.',
      onInteract: () => {
        if (!unlocked) {
          playSound(180, 0.12, 0.12);
          return;
        }
        playSound(440, 0.14, 0.12);
        loadLevel(i);
      }
    });
  }

  showPopup('Enter portals in order. Each completion gives the key for the next.');
}

function isUnlocked(levelNumber) {
  if (levelNumber === 1) return true;
  return completedLevels.has(levelNumber - 1);
}

function completeLevel(levelNumber, successText) {
  completedLevels.add(levelNumber);
  updateUnderstanding();

  showPopup(`${successText} Key acquired.`);
  playSound(784, 0.12, 0.16);

  if (levelNumber >= TOTAL_LEVELS) {
    setTimeout(showFinal, 900);
    return;
  }

  setTimeout(() => loadLevel(0), 900);
}

function buildLevel(n) {
  // base arena
  const cold = (n === 1 || n === 2);
  scene.fog = new THREE.FogExp2(cold ? 0xeaf6ff : 0xffefe6, 0.02);
  renderer.setClearColor(cold ? 0xd7f1ff : 0xffead9, 1);
  setupLighting(cold ? 'cold' : 'warm');

  bounds = { minX: -38, maxX: 38, minZ: -28, maxZ: 28 };

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(90, 70, 10, 10),
    new THREE.MeshStandardMaterial({ color: cold ? 0xe6fbff : 0xfff2e6, roughness: 0.9, metalness: 0.05 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  const wallMat = new THREE.MeshStandardMaterial({ color: cold ? 0xb7def3 : 0xffd3b0, roughness: 0.85, metalness: 0.0 });
  addWall(0, -30, 90, 1.2, wallMat);
  addWall(0, 30, 90, 1.2, wallMat);
  addWall(-45, 0, 1.2, 70, wallMat);
  addWall(45, 0, 1.2, 70, wallMat);

  // per-level
  if (n === 1) return level1();
  if (n === 2) return level2();
  if (n === 3) return level3();
  if (n === 4) return level4();
  if (n === 5) return level5();
  if (n === 6) return level6();
  if (n === 7) return level7();
  if (n === 8) return level8();
  if (n === 9) return level9();
  if (n === 10) return level10();
  if (n === 11) return level11();
  if (n === 12) return level12();
  if (n === 13) return level13();
  if (n === 14) return level14();
  if (n === 15) return level15();
}

function addWall(x, z, w, d, mat) {
  const wallH = 6;
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, wallH, d), mat);
  m.position.set(x, wallH / 2, z);
  m.castShadow = true;
  m.receiveShadow = true;
  scene.add(m);
  colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
}

// ============================================
// LEVELS (1..15)
// ============================================

// Level 1 – Introvert Ice Storm
function level1() {
  levelState = {
    type: 'ice',
    spawn: { kind: 'snowball', every: 0.35, nextAt: clock.getElapsedTime() + 0.25 },
    surviveUntil: clock.getElapsedTime() + 12,
    success: 'Introvert mode active. Approach gently.'
  };
  showPopup('Level 1 – Introvert Ice Storm: Dodge falling snowballs.');
}

// Level 2 – Dahi Dodge Dimension
function level2() {
  levelState = {
    type: 'dahi',
    horizontal: { every: 0.5, nextAt: clock.getElapsedTime() + 0.35 },
    surviveUntil: clock.getElapsedTime() + 12,
    success: 'You survived the Dahi Dimension.'
  };
  showPopup('Level 2 – Dahi Dodge Dimension: Dodge horizontal curd blobs.');
}

// Level 3 – Horror Night (Quiz)
function level3() {
  levelState = { type: 'quiz' };
  showChallengeOverlay(
    'Horror Night',
    'What movie genre is playing at 1AM?',
    [
      { label: 'Romance', onSelect: () => showPopup('Wrong. Try again.') },
      { label: 'Horror', onSelect: () => { hideChallengeOverlay(); completeLevel(3, 'Brave companion unlocked.'); } },
      { label: 'Action', onSelect: () => showPopup('Wrong. Try again.') }
    ]
  );
}

// Level 4 – Book Rain
function level4() {
  levelState = {
    type: 'bookRain',
    spawn: { kind: 'book', every: 0.42, nextAt: clock.getElapsedTime() + 0.2 },
    goal: 8,
    collected: 0,
    success: 'Bookworm energy detected.'
  };
  showPopup('Level 4 – Book Rain: Collect 8 falling books.');
}

// Level 5 – Manga Portal
function level5() {
  levelState = { type: 'manga', goal: 6, collected: 0, success: 'You remembered the manga obsession.' };
  showPopup('Level 5 – Manga Portal: Catch only those labeled “Manga”.');

  for (let i = 0; i < 10; i++) {
    const isManga = i < 6;
    const bb = makeBillboard(isManga ? 'Manga' : 'Book');
    bb.position.set((Math.random() - 0.5) * 60, 2.8 + Math.random() * 2.8, (Math.random() - 0.5) * 45);
    bb.userData.baseY = bb.position.y;
    bb.userData.seed = Math.random() * 10;
    scene.add(bb);

    pickups.push({
      mesh: bb,
      kind: isManga ? 'manga' : 'other',
      pickRadius: 1.2,
      float: true,
      baseY: bb.userData.baseY,
      seed: bb.userData.seed,
      onPick: () => {
        if (isManga) {
          levelState.collected += 1;
          playSound(660, 0.12, 0.09);
          if (levelState.collected >= levelState.goal) completeLevel(5, levelState.success);
        } else {
          levelState.collected = Math.max(0, levelState.collected - 1);
          playSound(150, 0.12, 0.1);
          showPopup('Not Manga. Avoid others.');
        }
      }
    });
  }
}

// Level 6 – Old Songs Galaxy
function level6() {
  levelState = { type: 'songs', goal: 10, collected: 0, success: 'Classic music compatibility +1' };
  showPopup('Level 6 – Old Songs Galaxy: Collect golden notes, avoid DJ speakers.');

  for (let i = 0; i < 12; i++) {
    const note = new THREE.Mesh(
      new THREE.TetrahedronGeometry(0.45, 0),
      new THREE.MeshStandardMaterial({ color: 0xffd700, roughness: 0.35, metalness: 0.25, emissive: 0xffd700, emissiveIntensity: 0.25 })
    );
    note.position.set((Math.random() - 0.5) * 60, 2.5 + Math.random() * 2.2, (Math.random() - 0.5) * 45);
    note.userData.baseY = note.position.y;
    note.userData.seed = Math.random() * 10;
    note.castShadow = true;
    scene.add(note);

    pickups.push({
      mesh: note,
      kind: 'note',
      float: true,
      baseY: note.userData.baseY,
      seed: note.userData.seed,
      pickRadius: 1.1,
      onPick: () => {
        levelState.collected += 1;
        playSound(740, 0.12, 0.09);
        if (levelState.collected >= levelState.goal) completeLevel(6, levelState.success);
      }
    });
  }

  for (let i = 0; i < 3; i++) {
    const sp = new THREE.Mesh(
      new THREE.BoxGeometry(2.4, 3.2, 1.6),
      new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.85, metalness: 0.1 })
    );
    sp.position.set((Math.random() - 0.5) * 55, 1.6, (Math.random() - 0.5) * 40);
    sp.castShadow = true;
    scene.add(sp);

    hazards.push({
      mesh: sp,
      velocity: new THREE.Vector3(0, 0, 0),
      hitRadius: 2.1,
      onHit: () => {
        levelState.collected = Math.max(0, levelState.collected - 2);
        showPopup('Avoid large DJ speakers!');
        playSound(110, 0.12, 0.12);
      }
    });
  }
}

// Level 7 – Dance Mode
function level7() {
  levelState = { type: 'rhythm', success: 'Daily dance streak respected.' };
  rhythm = { speed: 1.35, pos01: 0, dir: 1, score: 0 };
  showRhythmOverlay();
}

function updateRhythmUI(delta) {
  const hit = document.getElementById('rhythm-hit');
  if (!hit || !rhythm) return;
  rhythm.pos01 += rhythm.dir * rhythm.speed * delta;
  if (rhythm.pos01 > 1) { rhythm.pos01 = 1; rhythm.dir = -1; }
  if (rhythm.pos01 < 0) { rhythm.pos01 = 0; rhythm.dir = 1; }
  hit.style.left = `${rhythm.pos01 * 100}%`;
}

function handleRhythmHit() {
  if (!rhythm) return;
  const ok = rhythm.pos01 >= 0.65 && rhythm.pos01 <= 0.77;
  if (ok) {
    rhythm.score += 1;
    document.getElementById('rhythm-score').textContent = String(rhythm.score);
    playSound(660, 0.12, 0.08);
    if (rhythm.score >= 6) {
      hideRhythmOverlay();
      completeLevel(7, 'Daily dance streak respected.');
    }
  } else {
    rhythm.score = 0;
    document.getElementById('rhythm-score').textContent = '0';
    playSound(180, 0.12, 0.08);
  }
}

// Level 8 – Garden Exploration Zone
function level8() {
  levelState = { type: 'garden', lastChaosAt: 0, success: 'You moved with peace. Path unlocked.' };
  showPopup('Level 8 – Garden Maze: Walk slowly and find the hidden exit.');

  // Build maze walls (simple)
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x5aa05a, roughness: 0.9, metalness: 0.0 });
  const walls = [
    { x: 0, z: -10, w: 52, d: 1.4 },
    { x: -10, z: 2, w: 52, d: 1.4 },
    { x: 10, z: 14, w: 52, d: 1.4 },
    { x: -18, z: -2, w: 1.4, d: 40 },
    { x: 18, z: 6, w: 1.4, d: 40 },
    { x: 0, z: 6, w: 1.4, d: 26 }
  ];
  walls.forEach(seg => {
    const w = new THREE.Mesh(new THREE.BoxGeometry(seg.w, 3.0, seg.d), wallMat);
    w.position.set(seg.x, 1.5, seg.z);
    w.castShadow = true;
    w.receiveShadow = true;
    scene.add(w);
    colliders.push({ minX: seg.x - seg.w / 2, maxX: seg.x + seg.w / 2, minZ: seg.z - seg.d / 2, maxZ: seg.z + seg.d / 2 });
  });

  // Exit
  interactables.push({
    id: 'maze-exit',
    name: 'Hidden Exit',
    x: 32,
    z: -22,
    radius: 5,
    message: 'Press SPACE to exit the maze.',
    onInteract: () => completeLevel(8, levelState.success)
  });

  // Make exit visible
  const marker = new THREE.Mesh(
    new THREE.TorusGeometry(2.8, 0.18, 10, 36),
    new THREE.MeshStandardMaterial({ color: 0xff6b9d, roughness: 0.25, metalness: 0.3, emissive: 0xff6b9d, emissiveIntensity: 0.4 })
  );
  marker.position.set(32, 0.8, -22);
  marker.rotation.x = Math.PI / 2;
  scene.add(marker);
}

// Level 9 – Chai Power-Up Station
function level9() {
  levelState = { type: 'chai', success: 'Chai acquired. Mood and motivation restored.' };
  showPopup('Level 9 – Chai Power-Up: Touch the chai cup.');

  const cup = new THREE.Mesh(
    new THREE.CylinderGeometry(0.7, 0.8, 1.1, 14),
    new THREE.MeshStandardMaterial({ color: 0x8b4513, roughness: 0.7, metalness: 0.05, emissive: 0x402010, emissiveIntensity: 0.2 })
  );
  cup.position.set(0, 0.7, 0);
  cup.castShadow = true;
  scene.add(cup);

  pickups.push({
    mesh: cup,
    kind: 'chai',
    pickRadius: 1.5,
    onPick: () => {
      showWarmFlash();
      understandingBonus = Math.min(3, understandingBonus + 1);
      updateUnderstanding();
      completeLevel(9, levelState.success);
    }
  });
}

// Level 10 – Sleep Boss Level
function level10() {
  levelState = { type: 'sleep', remaining: 8, success: 'Sleep is sacred here.' };
  showPopup('Level 10 – Sleep Boss: Click alarm clocks to turn them off.');

  for (let i = 0; i < 8; i++) {
    const alarm = new THREE.Group();
    alarm.userData.kind = 'alarm';

    const body = new THREE.Mesh(
      new THREE.BoxGeometry(1.4, 1.0, 0.5),
      new THREE.MeshStandardMaterial({ color: 0xffcc66, roughness: 0.75, metalness: 0.05 })
    );
    body.position.y = 1.0;
    body.castShadow = true;
    body.userData.root = alarm;
    alarm.add(body);

    const bell = new THREE.Mesh(
      new THREE.SphereGeometry(0.25, 10, 10),
      new THREE.MeshStandardMaterial({ color: 0xffaa00, roughness: 0.5, metalness: 0.2 })
    );
    bell.position.set(-0.55, 1.55, 0);
    bell.castShadow = true;
    bell.userData.root = alarm;
    alarm.add(bell);

    const bell2 = bell.clone();
    bell2.position.x = 0.55;
    bell2.userData.root = alarm;
    alarm.add(bell2);

    alarm.position.set((Math.random() - 0.5) * 65, 0, (Math.random() - 0.5) * 45);
    scene.add(alarm);

    clickables.push(body, bell, bell2);
  }

  updateUnderstanding();
}

// Level 11 – Shopping Side Quest
function level11() {
  levelState = {
    type: 'shopping',
    spawn: { kind: 'dress', every: 0.42, nextAt: clock.getElapsedTime() + 0.2 },
    low: { every: 0.9, nextAt: clock.getElapsedTime() + 0.6 },
    goal: 8,
    collected: 0,
    success: 'Shopping stamina unlocked.'
  };
  showPopup('Level 11 – Shopping Side Quest: Collect dresses, avoid Low Budget icons.');
}

// Level 12 – Pasta Quest (Quiz)
function level12() {
  levelState = { type: 'quiz' };
  showChallengeOverlay(
    'Pasta Quest',
    'Which pasta should be chosen?',
    [
      { label: 'White Sauce', onSelect: () => showPopup('Wrong. Try again.') },
      { label: 'Red Sauce', onSelect: () => { hideChallengeOverlay(); completeLevel(12, 'Correct order. Chef respects this.'); } },
      { label: 'Pesto', onSelect: () => showPopup('Wrong. Try again.') }
    ]
  );
}

// Level 13 – Random Fact Machine
function level13() {
  levelState = { type: 'choice' };
  showChallengeOverlay(
    'Random Fact Machine',
    'Button appears: “Deep Dive” or “Ignore”',
    [
      { label: 'Deep Dive', onSelect: () => { hideChallengeOverlay(); completeLevel(13, 'Curiosity level matched.'); } },
      { label: 'Ignore', onSelect: () => showPopup('Wrong. Try again.') }
    ]
  );
}

// Level 14 – Sketch Comeback
function level14() {
  levelState = { type: 'sketch' };
  showSketchOverlay();
}

// Level 15 – Solo Date Simulator
function level15() {
  levelState = { type: 'choice' };
  showChallengeOverlay(
    'Solo Date Simulator',
    'Character sits alone on a bench. What do you do?',
    [
      { label: 'Disturb', onSelect: () => showPopup('Wrong. Try again.') },
      { label: 'Sit quietly nearby', onSelect: () => { hideChallengeOverlay(); completeLevel(15, 'You understand space. Understanding Level MAX.'); } }
    ]
  );
}

// Book Rain / Shopping spawns + Snowballs
function spawnHazardOrPickup(kind) {
  const x = (Math.random() - 0.5) * 70;
  const z = (Math.random() - 0.5) * 50;

  if (kind === 'snowball') {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.55, 12, 12),
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, metalness: 0.05 })
    );
    mesh.position.set(x, 18 + Math.random() * 6, z);
    mesh.castShadow = true;
    scene.add(mesh);

    hazards.push({
      mesh,
      kind,
      velocity: new THREE.Vector3(0, -12 - Math.random() * 4, 0),
      hitRadius: 1.0,
      onHit: () => {
        freezeUntil = clock.getElapsedTime() + 2;
        showZoneAlert('Frozen for 2s');
        playSound(140, 0.12, 0.12);
      }
    });
    return;
  }

  if (kind === 'book') {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.9, 0.35, 1.2),
      new THREE.MeshStandardMaterial({ color: 0x8b5a2b, roughness: 0.75, metalness: 0.05 })
    );
    mesh.position.set(x, 16 + Math.random() * 6, z);
    mesh.castShadow = true;
    scene.add(mesh);

    // treat as pickup while falling
    pickups.push({
      mesh,
      kind,
      pickRadius: 1.0,
      ttl: 6,
      onPick: () => {
        if (levelState && levelState.type === 'bookRain') {
          levelState.collected += 1;
          playSound(660, 0.12, 0.08);
          if (levelState.collected >= levelState.goal) {
            completeLevel(4, levelState.success);
          }
        }
      }
    });

    hazards.push({
      mesh,
      kind,
      velocity: new THREE.Vector3(0, -10 - Math.random() * 3, 0),
      hitRadius: 0.9,
      onHit: null
    });
    return;
  }

  if (kind === 'dress') {
    const mesh = new THREE.Mesh(
      new THREE.ConeGeometry(0.6, 1.2, 10),
      new THREE.MeshStandardMaterial({ color: 0xff6b9d, roughness: 0.6, metalness: 0.05 })
    );
    mesh.position.set(x, 16 + Math.random() * 6, z);
    mesh.castShadow = true;
    scene.add(mesh);

    pickups.push({
      mesh,
      kind,
      pickRadius: 1.1,
      ttl: 6,
      onPick: () => {
        if (levelState && levelState.type === 'shopping') {
          levelState.collected += 1;
          playSound(740, 0.12, 0.08);
          if (levelState.collected >= levelState.goal) {
            completeLevel(11, levelState.success);
          }
        }
      }
    });

    hazards.push({ mesh, kind, velocity: new THREE.Vector3(0, -10 - Math.random() * 3, 0), hitRadius: 0.9 });
    return;
  }

  if (kind === 'lowbudget') {
    const mesh = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.55, 0),
      new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.8, metalness: 0.1 })
    );
    mesh.position.set(x, 16 + Math.random() * 6, z);
    mesh.castShadow = true;
    scene.add(mesh);

    hazards.push({
      mesh,
      kind,
      velocity: new THREE.Vector3(0, -11 - Math.random() * 3, 0),
      hitRadius: 1.0,
      onHit: () => {
        if (levelState && levelState.type === 'shopping') {
          levelState.collected = Math.max(0, levelState.collected - 2);
          showPopup('Avoid Low Budget icons!');
          playSound(150, 0.12, 0.1);
        }
      }
    });
    return;
  }
}

function spawnHorizontalDahi() {
  const fromLeft = Math.random() < 0.5;
  const x = fromLeft ? -52 : 52;
  const z = (Math.random() - 0.5) * 50;

  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.6, 12, 12),
    new THREE.MeshStandardMaterial({ color: 0xf6fbff, roughness: 0.75, metalness: 0.05 })
  );
  mesh.position.set(x, 1.2, z);
  mesh.castShadow = true;
  scene.add(mesh);

  hazards.push({
    mesh,
    kind: 'dahi',
    velocity: new THREE.Vector3(fromLeft ? 20 : -20, 0, 0),
    hitRadius: 1.0,
    onHit: () => {
      playSound(120, 0.12, 0.12);
      showZoneAlert('Hit! Keep dodging.');
    }
  });
}

// ============================================
// VISUAL HELPERS
// ============================================
function makePortal(color) {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.25, metalness: 0.5, emissive: color, emissiveIntensity: 0.65 });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(3.8, 0.32, 14, 44), mat);
  ring.castShadow = true;
  g.add(ring);
  return g;
}

function makeBillboard(text) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  ctx.strokeStyle = 'rgba(196,69,105,0.9)';
  ctx.lineWidth = 6;
  roundRect(ctx, 12, 18, 232, 86, 28);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#2d3440';
  ctx.font = 'bold 36px system-ui, -apple-system, Segoe UI, Roboto, Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 128, 62);

  const tex = new THREE.CanvasTexture(canvas);
  tex.encoding = THREE.sRGBEncoding;
  const mat = new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.55, metalness: 0.0, emissive: 0x1a2f4a, emissiveIntensity: 0.08 });
  return new THREE.Mesh(new THREE.PlaneGeometry(3.6, 1.8), mat);
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  const radius = Math.max(0, Math.min(r, Math.min(w, h) / 2));
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(x, y, w, h, radius);
    return;
  }
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
}
