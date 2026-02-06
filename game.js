/**
 * EXPLORING SHUBHANSHI'S WORLD FROM THE EYES OF AAYUSH
 * A warm, peaceful, magical 3D exploration game
 * Fully functional with all 10 zones
 */

// ============================================
// GAME STATE & VARIABLES
// ============================================
let scene, camera, renderer, clock;
let player, playerGroup;
let isGameRunning = false;
let isPointerLocked = false;

// Camera controls
let cameraYaw = 0;
let cameraPitch = 0.3;
const CAMERA_DISTANCE = 12;
const CAMERA_HEIGHT = 6;

// View mode
const FIRST_PERSON_VIEW = true;
const FP_EYE_HEIGHT = 2.15;

// Movement
const keys = {
    forward: false,
    backward: false,
    left: false,
    right: false
};
const MOVE_SPEED = 12;

// Game data
let zones = [];
let animatedObjects = [];
let currentZone = null;
let visitedZones = new Set();
let currentInteractable = null;
let showMiniMap = false;
let totalZones = 9;
let finalMessageShown = false;
let victoryFlagGroup = null;
let victoryFlagActive = false;

// Building collision data
let buildingColliders = []; // Array of {x, z, w, d, doorX, doorZ, doorW} for collision

// Per-level movement bounds
let levelBounds = { minX: -95, maxX: 95, minZ: -95, maxZ: 95 };

// Levels
let currentLevelIndex = 1;
let currentLevelId = 'shubhanshi-world';

// Preserve main world progress when entering challenge worlds
let mainWorldVisitedZones = new Set();
let mainWorldReturnPos = null; // { x, z }

// Challenge state
let challengeState = null;
let challengeProjectiles = [];
let challengeVillain = null;

// Mobile controls state
let isMobile = false;
let joystickActive = false;
let joystickData = { x: 0, y: 0 };
let lookTouchId = null;
let lookLastPos = { x: 0, y: 0 };

// Performance mode
let lowPerformance = false;
let pendingSpawnOverride = null; // { x, z }

// Stall portals -> challenges
let completedStallChallenges = new Set();
let activeStallId = null;

// Generic challenge helpers
let challengePickups = [];
let challengeClickables = [];
let rhythmState = null;
let overlayMode = 'none'; // 'none' | 'challenge' | 'rhythm' | 'sketch'

// ============================================
// COMPAT HELPERS (r128-safe)
// ============================================

// Performance helper: only enable shadows on desktop
function setShadow(mesh, cast = true, receive = false) {
    if (!lowPerformance) {
        mesh.castShadow = cast;
        mesh.receiveShadow = receive;
    }
}

// Get geometry segments based on performance
function getSegments(highDetail, lowDetail) {
    return lowPerformance ? lowDetail : highDetail;
}

function roundedRectPath(ctx, x, y, w, h, r) {
    const radius = Math.max(0, Math.min(r, Math.min(w, h) / 2));
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
}

function makeCapsuleGroup(radius, cylinderHeight, material) {
    // Three.js r128 doesn't include THREE.CapsuleGeometry in core.
    // Build a capsule from a cylinder + two spheres.
    const group = new THREE.Group();

    const cyl = new THREE.Mesh(
        new THREE.CylinderGeometry(radius, radius, cylinderHeight, 12),
        material
    );
    cyl.castShadow = true;
    cyl.receiveShadow = true;
    group.add(cyl);

    const sphereTop = new THREE.Mesh(new THREE.SphereGeometry(radius, 12, 12), material);
    sphereTop.position.y = cylinderHeight / 2;
    sphereTop.castShadow = true;
    sphereTop.receiveShadow = true;
    group.add(sphereTop);

    const sphereBottom = new THREE.Mesh(new THREE.SphereGeometry(radius, 12, 12), material);
    sphereBottom.position.y = -cylinderHeight / 2;
    sphereBottom.castShadow = true;
    sphereBottom.receiveShadow = true;
    group.add(sphereBottom);

    return group;
}

// ============================================
// INITIALIZATION
// ============================================
window.addEventListener('DOMContentLoaded', init);

function init() {
    console.log('🌸 Initializing Shubhanshi\'s World...');
    
    // Setup core Three.js (camera/renderer persist across levels)
    setupCamera();
    setupRenderer();
    setupControls();
    setupUI();

    // Create player once, re-add to scene on each level load
    createPlayer();

    // Load main world
    loadLevel(1);
    
    // Start game loop
    clock = new THREE.Clock();
    animate();
    
    console.log('✅ World ready! Click "Begin Exploration" to start.');
}

// ============================================
// SCENE SETUP
// ============================================
function setupScene() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xffecd2);
    scene.fog = new THREE.Fog(0xffecd2, 50, 180);
}

function setupCamera() {
    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 500);
    camera.position.set(0, 10, 25);
}

function setupRenderer() {
    // Detect low performance devices (mobile, low GPU, small screens)
    isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) 
        || (navigator.maxTouchPoints > 0 && window.matchMedia('(hover: none)').matches);
    
    // Low performance mode for weaker devices
    lowPerformance = isMobile || window.innerWidth < 768 || (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4);
    
    console.log(lowPerformance ? '📱 Low performance mode enabled' : '💻 High performance mode');
    
    const canvas = document.getElementById('game-canvas');
    renderer = new THREE.WebGLRenderer({ 
        canvas: canvas, 
        antialias: !lowPerformance, // Disable antialiasing on low-end
        powerPreference: lowPerformance ? 'low-power' : 'high-performance',
        precision: lowPerformance ? 'mediump' : 'highp'
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    
    // Lower pixel ratio on mobile (huge performance boost)
    const maxPixelRatio = lowPerformance ? 1.0 : 2.0;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, maxPixelRatio));
    
    // Shadows: disable on very low-end, reduce quality on mobile
    if (lowPerformance) {
        renderer.shadowMap.enabled = false; // Disable shadows entirely on mobile
    } else {
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    }

    // Better default look (Three r128)
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = lowPerformance ? THREE.LinearToneMapping : THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.physicallyCorrectLights = !lowPerformance;
}

function setupLighting(theme) {
    // Warm ambient light (increase on mobile since no shadows)
    const ambientColor = theme === 'cold' ? 0xddeeff : 0xffeedd;
    const ambientIntensity = lowPerformance ? 0.85 : (theme === 'cold' ? 0.65 : 0.6);
    const ambient = new THREE.AmbientLight(ambientColor, ambientIntensity);
    scene.add(ambient);
    
    // Main sun light
    const sunColor = theme === 'cold' ? 0xe6f3ff : 0xfff5e6;
    const sunIntensity = theme === 'cold' ? 1.05 : 1.0;
    const sun = new THREE.DirectionalLight(sunColor, sunIntensity);
    sun.position.set(60, 100, -40);
    
    // Only setup shadows if not in low performance mode
    if (!lowPerformance) {
        sun.castShadow = true;
        sun.shadow.mapSize.width = 1024; // Reduced from 2048
        sun.shadow.mapSize.height = 1024;
        sun.shadow.camera.near = 0.5;
        sun.shadow.camera.far = 250;
        sun.shadow.camera.left = -80;
        sun.shadow.camera.right = 80;
        sun.shadow.camera.top = 80;
        sun.shadow.camera.bottom = -80;
    }
    scene.add(sun);
    
    // Hemisphere light for natural feel
    const hemiSky = theme === 'cold' ? 0xd9f2ff : 0xffeeb1;
    const hemiGround = theme === 'cold' ? 0x334455 : 0x80a080;
    const hemi = new THREE.HemisphereLight(hemiSky, hemiGround, lowPerformance ? 0.6 : 0.45);
    scene.add(hemi);
}

// ============================================
// LEVELS
// ============================================

function loadLevel(levelIndex) {
    currentLevelIndex = levelIndex;
    currentLevelId =
        levelIndex === 1 ? 'shubhanshi-world' :
        levelIndex === 2 ? 'challenge-curd' :
        levelIndex === 3 ? 'challenge-bottles' :
        levelIndex === 4 ? 'challenge-garden' :
        levelIndex === 5 ? 'challenge-horror-quiz' :
        levelIndex === 6 ? 'challenge-library' :
        levelIndex === 7 ? 'challenge-dance' :
        levelIndex === 8 ? 'challenge-chai' :
        levelIndex === 9 ? 'challenge-art' :
        levelIndex === 10 ? 'challenge-sleep' :
        'shubhanshi-world';

    // Reset per-level state
    zones = [];
    buildingColliders = []; // Clear building collision data
    // Keep main-world exploration progress persistent.
    if (levelIndex === 1) {
        visitedZones = mainWorldVisitedZones;
    } else {
        visitedZones = new Set();
    }
    currentZone = null;
    currentInteractable = null;
    animatedObjects = [];

    // Fresh scene
    scene = new THREE.Scene();

    // Reset challenge objects
    challengeState = null;
    challengeProjectiles = [];
    challengeVillain = null;
    challengePickups = [];
    challengeClickables = [];
    rhythmState = null;
    overlayMode = 'none';

    if (levelIndex === 1) {
        scene.fog = new THREE.FogExp2(0xffdfd2, 0.009);
        renderer.setClearColor(0xffe9df, 1);
        setupLighting('warm');
        buildMainWorldLevel();
        player.position.set(0, 0, 15);
        levelBounds = { minX: -95, maxX: 95, minZ: -95, maxZ: 95 };
    } else if (levelIndex === 2) {
        scene.fog = new THREE.FogExp2(0xeaf6ff, 0.02);
        renderer.setClearColor(0xd7f1ff, 1);
        setupLighting('cold');
        buildCurdThrowChallenge();
        player.position.set(0, 0, 12);
        levelBounds = { minX: -36, maxX: 36, minZ: -28, maxZ: 28 };
    } else if (levelIndex === 3) {
        scene.fog = new THREE.FogExp2(0xffefe6, 0.02);
        renderer.setClearColor(0xffead9, 1);
        setupLighting('warm');
        buildBottleDodgeChallenge();
        player.position.set(0, 0, 12);
        levelBounds = { minX: -36, maxX: 36, minZ: -28, maxZ: 28 };
    } else if (levelIndex === 4) {
        scene.fog = new THREE.FogExp2(0xe9fff0, 0.02);
        renderer.setClearColor(0xdff7e4, 1);
        setupLighting('warm');
        buildPeaceGardenChallenge();
        player.position.set(0, 0, 12);
        levelBounds = { minX: -36, maxX: 36, minZ: -28, maxZ: 28 };
    } else if (levelIndex === 5) {
        scene.fog = new THREE.FogExp2(0x101015, 0.028);
        renderer.setClearColor(0x0b0b10, 1);
        setupLighting('cold');
        buildHorrorQuizChallenge();
        player.position.set(0, 0, 12);
        levelBounds = { minX: -36, maxX: 36, minZ: -28, maxZ: 28 };
    } else if (levelIndex === 6) {
        scene.fog = new THREE.FogExp2(0xfff2e0, 0.02);
        renderer.setClearColor(0xffead3, 1);
        setupLighting('warm');
        buildLibraryChallenge();
        player.position.set(0, 0, 12);
        levelBounds = { minX: -36, maxX: 36, minZ: -28, maxZ: 28 };
    } else if (levelIndex === 7) {
        scene.fog = new THREE.FogExp2(0xf6e8ff, 0.02);
        renderer.setClearColor(0xf3ddff, 1);
        setupLighting('warm');
        buildDanceRhythmChallenge();
        player.position.set(0, 0, 12);
        levelBounds = { minX: -36, maxX: 36, minZ: -28, maxZ: 28 };
    } else if (levelIndex === 8) {
        scene.fog = new THREE.FogExp2(0xffefe6, 0.02);
        renderer.setClearColor(0xffead9, 1);
        setupLighting('warm');
        buildChaiChallenge();
        player.position.set(0, 0, 12);
        levelBounds = { minX: -36, maxX: 36, minZ: -28, maxZ: 28 };
    } else if (levelIndex === 9) {
        scene.fog = new THREE.FogExp2(0xfff5ee, 0.02);
        renderer.setClearColor(0xffefe6, 1);
        setupLighting('warm');
        buildArtSketchChallenge();
        player.position.set(0, 0, 12);
        levelBounds = { minX: -36, maxX: 36, minZ: -28, maxZ: 28 };
    } else if (levelIndex === 10) {
        scene.fog = new THREE.FogExp2(0xececff, 0.02);
        renderer.setClearColor(0xe6e6fa, 1);
        setupLighting('cold');
        buildDreamAlarmChallenge();
        player.position.set(0, 0, 12);
        levelBounds = { minX: -36, maxX: 36, minZ: -28, maxZ: 28 };
    }

    if (pendingSpawnOverride) {
        player.position.set(pendingSpawnOverride.x, 0, pendingSpawnOverride.z);
        pendingSpawnOverride = null;
    }

    // Add player group to the new scene
    if (playerGroup) scene.add(playerGroup);
    playerGroup.position.copy(player.position);

    // Update UI
    const levelEl = document.getElementById('level-indicator');
    if (levelEl) {
        if (levelIndex === 1) levelEl.textContent = "Shubhanshi's World";
        else levelEl.textContent = 'Challenge World';
    }
    document.getElementById('current-zone').textContent =
        levelIndex === 1 ? "Shubhanshi's World" :
        'Challenge';

    updateProgress();
}

function buildMainWorldLevel() {
    createGround();
    createSkybox();
    createAllZones();
    createAmbientParticles();
    createDecorations();
    totalZones = 9;
}

function buildCurdThrowChallenge() {
    totalZones = 18; // target dodges
    createChallengeArena(0xe6fbff, 0xb7def3);
    challengeVillain = createVillainMesh(0x2d3440);
    challengeVillain.position.set(0, 0, -16);
    scene.add(challengeVillain);

    challengeState = {
        type: 'curd',
        hits: 0,
        dodges: 0,
        throws: 0,
        nextThrowAt: 0,
        lastHitAt: -999
    };

    zones.push({
        id: 'exit-challenge',
        name: 'Exit Portal',
        x: 0,
        z: 22,
        radius: 6,
        color: 0x7bd6ff,
        interactable: true,
        onInteract: () => leaveChallengeToMainWorld()
    });

    showPopup('Challenge: Curd Throwing — dodge the curd! (18 dodges to win)');
}

function buildBottleDodgeChallenge() {
    totalZones = 18; // target dodges
    createChallengeArena(0xfff2e6, 0xffd3b0);
    challengeVillain = createVillainMesh(0x5a2a00);
    challengeVillain.position.set(0, 0, -16);
    scene.add(challengeVillain);

    challengeState = {
        type: 'bottles',
        hits: 0,
        dodges: 0,
        throws: 0,
        nextThrowAt: 0,
        lastHitAt: -999
    };

    zones.push({
        id: 'exit-challenge',
        name: 'Exit Portal',
        x: 0,
        z: 22,
        radius: 6,
        color: 0xffaa66,
        interactable: true,
        onInteract: () => leaveChallengeToMainWorld()
    });

    showPopup('Challenge: Bottle Dodge — dodge the bottles! (18 dodges to win)');
}

// ============================================
// STALL CHALLENGES (OPEN WORLD PORTALS)
// ============================================

function buildPeaceGardenChallenge() {
    totalZones = 1;
    createChallengeArena(0xe9fff0, 0x7fbf7f);

    // Simple maze walls inside arena
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x4d8a4d, roughness: 0.9, metalness: 0.0 });
    const segs = [
        { x: 0, z: -8, w: 52, d: 1.2 },
        { x: 0, z: 8, w: 52, d: 1.2 },
        { x: -14, z: 0, w: 1.2, d: 40 },
        { x: 14, z: 0, w: 1.2, d: 40 },
        { x: 0, z: 0, w: 1.2, d: 24 },
        { x: -7, z: -2, w: 24, d: 1.2 },
        { x: 7, z: 2, w: 24, d: 1.2 },
    ];
    segs.forEach(s => {
        const wall = new THREE.Mesh(new THREE.BoxGeometry(s.w, 3.2, s.d), wallMat);
        wall.position.set(s.x, 1.6, s.z);
        wall.castShadow = true;
        wall.receiveShadow = true;
        scene.add(wall);
    });

    // Exit portal interaction
    zones.push({
        id: 'exit-challenge',
        name: 'Exit Gate',
        x: 0,
        z: 22,
        radius: 6,
        color: 0x7bd6ff,
        interactable: true,
        onInteract: () => completeActiveStallChallenge('You moved with peace. Path unlocked.')
    });

    showPopup('Peace Garden Challenge: find the exit gate and press SPACE.');
}

function buildHorrorQuizChallenge() {
    totalZones = 1;
    createChallengeArena(0x0f0f16, 0x2a2a3b);
    challengeState = { type: 'quiz' };

    showChallengeOverlay(
        'Horror Night',
        'What movie genre is playing at 1AM?',
        [
            { label: 'Romance', onSelect: () => showPopup('Wrong. Try again.') },
            { label: 'Horror', onSelect: () => { hideChallengeOverlay(); completeActiveStallChallenge('Brave companion unlocked.'); } },
            { label: 'Action', onSelect: () => showPopup('Wrong. Try again.') }
        ]
    );
}

function buildLibraryChallenge() {
    totalZones = 8;
    createChallengeArena(0xfff2e0, 0xffd3b0);
    challengeState = { type: 'collect', kind: 'book', collected: 0, goal: 8 };

    // Spawn 8 collectible books
    for (let i = 0; i < 10; i++) {
        const book = new THREE.Mesh(
            new THREE.BoxGeometry(0.9, 0.35, 1.2),
            new THREE.MeshStandardMaterial({ color: 0x8b5a2b, roughness: 0.75, metalness: 0.05 })
        );
        book.position.set((Math.random() - 0.5) * 60, 1.7 + Math.random() * 2.5, (Math.random() - 0.5) * 45);
        book.userData.baseY = book.position.y;
        book.userData.offset = Math.random() * 10;
        book.castShadow = true;
        scene.add(book);
        animatedObjects.push({ obj: book, type: 'float' });

        challengePickups.push({
            mesh: book,
            radius: 1.2,
            onPick: () => {
                challengeState.collected += 1;
                playSound(660, 0.12, 0.08);
                updateProgress();
                if (challengeState.collected >= challengeState.goal) {
                    completeActiveStallChallenge('Bookworm energy detected.');
                }
            }
        });
    }

    showPopup('Library Challenge: collect 8 books.');
}

function buildDanceRhythmChallenge() {
    totalZones = 6;
    createChallengeArena(0xf6e8ff, 0xbda4d8);
    challengeState = { type: 'rhythm', score: 0 };
    rhythmState = { pos: 0, dir: 1, speed: 1.35 };
    showRhythmOverlay();
    showPopup('Dance Challenge: press SPACE on the beat (6 perfect hits).');
}

function buildChaiChallenge() {
    totalZones = 1;
    createChallengeArena(0xffefe6, 0xffd3b0);
    challengeState = { type: 'pickup', kind: 'chai' };

    const cup = new THREE.Mesh(
        new THREE.CylinderGeometry(0.7, 0.8, 1.1, 14),
        new THREE.MeshStandardMaterial({ color: 0x8b4513, roughness: 0.7, metalness: 0.05, emissive: 0x402010, emissiveIntensity: 0.2 })
    );
    cup.position.set(0, 0.7, 0);
    cup.castShadow = true;
    scene.add(cup);
    challengePickups.push({
        mesh: cup,
        radius: 1.6,
        onPick: () => {
            showWarmFlash();
            completeActiveStallChallenge('Chai acquired. Mood and motivation restored.');
        }
    });

    showPopup('Chai Challenge: touch the chai cup.');
}

function buildArtSketchChallenge() {
    totalZones = 1;
    createChallengeArena(0xfff5ee, 0xffd3b0);
    challengeState = { type: 'sketch' };
    showSketchOverlay();
    showPopup('Sketch Challenge: complete the drag puzzle.');
}

function buildDreamAlarmChallenge() {
    totalZones = 8;
    createChallengeArena(0xececff, 0xb7b7d8);
    challengeState = { type: 'alarms', goal: 8, remaining: 8, cleared: 0 };

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
        // add root group for removal + clickable parts
        challengeClickables.push(body, bell, bell2);
    }

    showPopup('Sleep Alarm Challenge: click alarm clocks to turn them off.');
    updateProgress();
}

function updateStallChallenges(delta) {
    // Book/collect style
    if (challengeState && challengeState.type === 'collect') {
        for (let i = challengePickups.length - 1; i >= 0; i--) {
            const p = challengePickups[i];
            const dx = p.mesh.position.x - player.position.x;
            const dz = p.mesh.position.z - player.position.z;
            if (Math.sqrt(dx * dx + dz * dz) < p.radius) {
                scene.remove(p.mesh);
                challengePickups.splice(i, 1);
                p.onPick();
            }
        }
    }

    // Simple pickup (chai)
    if (challengeState && challengeState.type === 'pickup') {
        for (let i = challengePickups.length - 1; i >= 0; i--) {
            const p = challengePickups[i];
            const dx = p.mesh.position.x - player.position.x;
            const dz = p.mesh.position.z - player.position.z;
            if (Math.sqrt(dx * dx + dz * dz) < p.radius) {
                scene.remove(p.mesh);
                challengePickups.splice(i, 1);
                p.onPick();
            }
        }
    }

    // Rhythm UI movement
    if (challengeState && challengeState.type === 'rhythm' && rhythmState) {
        rhythmState.pos += rhythmState.dir * rhythmState.speed * delta;
        if (rhythmState.pos > 1) { rhythmState.pos = 1; rhythmState.dir = -1; }
        if (rhythmState.pos < 0) { rhythmState.pos = 0; rhythmState.dir = 1; }
        const hit = document.getElementById('rhythm-hit');
        if (hit) hit.style.left = `${rhythmState.pos * 100}%`;
    }
}

function rhythmHit() {
    if (!challengeState || challengeState.type !== 'rhythm' || !rhythmState) return;
    const ok = rhythmState.pos >= 0.65 && rhythmState.pos <= 0.77;
    if (ok) {
        challengeState.score = (challengeState.score || 0) + 1;
        const scoreEl = document.getElementById('rhythm-score');
        if (scoreEl) scoreEl.textContent = String(challengeState.score);
        playSound(660, 0.12, 0.08);
        updateProgress();
        if (challengeState.score >= totalZones) {
            hideRhythmOverlay();
            completeActiveStallChallenge('Daily dance streak respected.');
        }
    } else {
        challengeState.score = 0;
        const scoreEl = document.getElementById('rhythm-score');
        if (scoreEl) scoreEl.textContent = '0';
        playSound(180, 0.12, 0.08);
    }
}

// Overlays (reuse HTML already present)
function showChallengeOverlay(title, text, options) {
    overlayMode = 'challenge';
    const overlay = document.getElementById('challenge-overlay');
    const titleEl = document.getElementById('challenge-title');
    const textEl = document.getElementById('challenge-text');
    const optionsEl = document.getElementById('challenge-options');
    if (!overlay || !titleEl || !textEl || !optionsEl) return;
    titleEl.textContent = title;
    textEl.textContent = text;
    optionsEl.innerHTML = '';
    options.forEach(opt => {
        const btn = document.createElement('button');
        btn.textContent = opt.label;
        btn.addEventListener('click', opt.onSelect);
        optionsEl.appendChild(btn);
    });
    const closeBtn = document.getElementById('challenge-close');
    if (closeBtn) closeBtn.classList.add('hidden');
    overlay.classList.remove('hidden');
}

function hideChallengeOverlay() {
    overlayMode = 'none';
    const overlay = document.getElementById('challenge-overlay');
    if (overlay) overlay.classList.add('hidden');
}

function showRhythmOverlay() {
    overlayMode = 'rhythm';
    const overlay = document.getElementById('rhythm-overlay');
    if (overlay) overlay.classList.remove('hidden');
    const scoreEl = document.getElementById('rhythm-score');
    if (scoreEl) scoreEl.textContent = '0';
}

function hideRhythmOverlay() {
    overlayMode = 'none';
    const overlay = document.getElementById('rhythm-overlay');
    if (overlay) overlay.classList.add('hidden');
}

function showWarmFlash() {
    const el = document.getElementById('warm-flash');
    if (!el) return;
    el.classList.remove('hidden');
    void el.offsetWidth;
    setTimeout(() => el.classList.add('hidden'), 1100);
}

function showSketchOverlay() {
    overlayMode = 'sketch';
    const overlay = document.getElementById('sketch-overlay');
    if (!overlay) return;
    overlay.classList.remove('hidden');
    resetSketchPieces();
}

function hideSketchOverlay() {
    overlayMode = 'none';
    const overlay = document.getElementById('sketch-overlay');
    if (overlay) overlay.classList.add('hidden');
}

function hideAllChallengeOverlays() {
    hideChallengeOverlay();
    hideRhythmOverlay();
    hideSketchOverlay();
}

function setupSketchUI() {
    const overlay = document.getElementById('sketch-overlay');
    if (!overlay) return;
    const pieces = overlay.querySelectorAll('.piece');
    const slots = overlay.querySelectorAll('.slot');
    const doneBtn = document.getElementById('sketch-done');
    if (!doneBtn) return;

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
        completeActiveStallChallenge('Art side remembered.');
    });
}

function resetSketchPieces() {
    const overlay = document.getElementById('sketch-overlay');
    if (!overlay) return;
    const doneBtn = document.getElementById('sketch-done');
    if (doneBtn) doneBtn.classList.add('hidden');
    overlay.querySelectorAll('.piece').forEach(p => p.classList.remove('hidden'));
    overlay.querySelectorAll('.slot').forEach(s => {
        s.textContent = '';
        delete s.dataset.filled;
    });
}

function createChallengeArena(floorColor, wallColor) {
    // Floor
    const floor = new THREE.Mesh(
        new THREE.PlaneGeometry(90, 70, 10, 10),
        new THREE.MeshStandardMaterial({ color: floorColor, roughness: 0.9, metalness: 0.05 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    // Walls
    const wallMat = new THREE.MeshStandardMaterial({ color: wallColor, roughness: 0.85, metalness: 0.0 });
    const wallH = 6;
    const wallT = 1.2;

    const wall1 = new THREE.Mesh(new THREE.BoxGeometry(90, wallH, wallT), wallMat);
    wall1.position.set(0, wallH / 2, -30);
    wall1.castShadow = true;
    wall1.receiveShadow = true;
    scene.add(wall1);

    const wall2 = new THREE.Mesh(new THREE.BoxGeometry(90, wallH, wallT), wallMat);
    wall2.position.set(0, wallH / 2, 30);
    wall2.castShadow = true;
    wall2.receiveShadow = true;
    scene.add(wall2);

    const wall3 = new THREE.Mesh(new THREE.BoxGeometry(wallT, wallH, 70), wallMat);
    wall3.position.set(-45, wallH / 2, 0);
    wall3.castShadow = true;
    wall3.receiveShadow = true;
    scene.add(wall3);

    const wall4 = new THREE.Mesh(new THREE.BoxGeometry(wallT, wallH, 70), wallMat);
    wall4.position.set(45, wallH / 2, 0);
    wall4.castShadow = true;
    wall4.receiveShadow = true;
    scene.add(wall4);

    // Exit portal visual
    const ringMat = new THREE.MeshStandardMaterial({
        color: 0x7bd6ff,
        roughness: 0.25,
        metalness: 0.5,
        emissive: 0x7bd6ff,
        emissiveIntensity: 0.6
    });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(4.0, 0.35, 14, 44), ringMat);
    ring.position.set(0, 3.5, 22);
    ring.castShadow = true;
    scene.add(ring);
    animatedObjects.push({ obj: ring, type: 'portalRing' });

    const innerMat = new THREE.MeshStandardMaterial({
        color: 0x113355,
        roughness: 0.1,
        metalness: 0.0,
        transparent: true,
        opacity: 0.6,
        emissive: 0x7bd6ff,
        emissiveIntensity: 0.15
    });
    const inner = new THREE.Mesh(new THREE.CircleGeometry(3.5, 32), innerMat);
    inner.position.set(0, 3.5, 22);
    inner.rotation.y = Math.PI;
    scene.add(inner);
    animatedObjects.push({ obj: inner, type: 'portalInner' });

    const light = new THREE.PointLight(0x7bd6ff, 0.9, 26);
    light.position.set(0, 5.5, 22);
    scene.add(light);
}

function createVillainMesh(color) {
    const g = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0.05 });
    const body = makeCapsuleGroup(0.6, 1.6, bodyMat);
    body.position.y = 1.3;
    g.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.5, 16, 16), new THREE.MeshStandardMaterial({ color: 0xffd1b3 }));
    head.position.y = 2.65;
    head.castShadow = true;
    g.add(head);

    const eyeMat = new THREE.MeshStandardMaterial({ color: 0x111111 });
    const e1 = new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 10), eyeMat);
    e1.position.set(-0.16, 2.7, 0.45);
    const e2 = new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 10), eyeMat);
    e2.position.set(0.16, 2.7, 0.45);
    g.add(e1);
    g.add(e2);

    g.traverse((o) => {
        if (o.isMesh) {
            o.castShadow = true;
            o.receiveShadow = true;
        }
    });
    return g;
}

function enterStallChallenge(zone, challengeLevelIndex, enteringText) {
    if (!zone) return;
    activeStallId = zone.id;
    mainWorldVisitedZones = visitedZones;
    mainWorldReturnPos = { x: zone.x, z: zone.z + 10 };
    showPopup(enteringText || 'Entering a new world...');
    playSound(740, 0.12, 0.14);
    setTimeout(() => loadLevel(challengeLevelIndex), 250);
}

function completeActiveStallChallenge(successText) {
    if (activeStallId) completedStallChallenges.add(activeStallId);
    updateProgress();
    leaveChallengeToMainWorld((successText ? successText + ' ' : '') + 'Challenge cleared!');
}

function leaveChallengeToMainWorld(message) {
    // Return back to the main world near the stall we entered from.
    const returnPos = mainWorldReturnPos || { x: 0, z: 15 };
    pendingSpawnOverride = { x: returnPos.x, z: returnPos.z };
    const prevStall = activeStallId;
    activeStallId = null;
    loadLevel(1);
    if (message) {
        showPopup(message);
    } else {
        showPopup('Back to Shubhanshi\'s World.');
    }

    // Small status update in stats panel if opened
    if (prevStall) {
        const status = document.getElementById('player-status');
        if (status) status.textContent = 'Back in the open world';
    }
}

function createChatBubbleMesh(text) {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.strokeStyle = 'rgba(160,200,255,0.9)';
    ctx.lineWidth = 6;
    ctx.beginPath();
    if (typeof ctx.roundRect === 'function') {
        ctx.roundRect(12, 18, 232, 86, 28);
    } else {
        roundedRectPath(ctx, 12, 18, 232, 86, 28);
    }
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#1b2b3a';
    ctx.font = 'bold 42px system-ui, -apple-system, Segoe UI, Roboto, Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 128, 62);

    const tex = new THREE.CanvasTexture(canvas);
    tex.encoding = THREE.sRGBEncoding;
    tex.needsUpdate = true;

    const mat = new THREE.MeshStandardMaterial({
        map: tex,
        transparent: true,
        roughness: 0.55,
        metalness: 0.0,
        emissive: 0x1a2f4a,
        emissiveIntensity: 0.12
    });
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 1.8), mat);
    plane.rotation.y = Math.PI;
    return plane;
}

// ============================================
// WORLD CREATION
// ============================================
function createGround() {
    // Main ground (lower segments on mobile)
    const segments = getSegments(50, 10);
    const groundGeo = new THREE.PlaneGeometry(250, 250, segments, segments);
    const groundMat = new THREE.MeshStandardMaterial({ 
        color: 0x7cb342,
        roughness: 0.9,
        metalness: 0.0
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    if (!lowPerformance) ground.receiveShadow = true;
    scene.add(ground);
    
    // Decorative paths (fewer on mobile)
    const pathMat = new THREE.MeshStandardMaterial({ color: 0xf5e6d3, roughness: 1 });
    const allPathPositions = [
        [0, 10], [20, 5], [40, 0], [-20, 10], [-40, 0],
        [0, 30], [20, 45], [-20, 45], [50, -20], [-30, -30],
        [30, 30], [-40, -20], [0, -20], [50, 20], [-50, 10]
    ];
    
    const pathPositions = lowPerformance ? allPathPositions.slice(0, 5) : allPathPositions;
    const pathSegments = getSegments(16, 8);
    
    pathPositions.forEach(([x, z]) => {
        const path = new THREE.Mesh(
            new THREE.CircleGeometry(3 + Math.random() * 2, pathSegments),
            pathMat
        );
        path.rotation.x = -Math.PI / 2;
        path.position.set(x, 0.02, z);
        scene.add(path);
    });
}

function createSkybox() {
    // Sky dome (lower segments on mobile)
    const skySegments = getSegments(32, 16);
    const skyGeo = new THREE.SphereGeometry(200, skySegments, skySegments);
    const skyMat = new THREE.MeshBasicMaterial({
        color: 0xffd1dc,
        side: THREE.BackSide
    });
    scene.add(new THREE.Mesh(skyGeo, skyMat));
    
    // Glowing sun
    const sunGroup = new THREE.Group();
    const sunSegments = getSegments(32, 12);
    const sunCore = new THREE.Mesh(
        new THREE.SphereGeometry(12, sunSegments, sunSegments),
        new THREE.MeshBasicMaterial({ color: 0xfffacd })
    );
    sunGroup.add(sunCore);
    
    // Skip sun glow on mobile
    if (!lowPerformance) {
        const sunGlow = new THREE.Mesh(
            new THREE.SphereGeometry(18, 16, 16),
            new THREE.MeshBasicMaterial({ 
                color: 0xfff5cc, 
                transparent: true, 
                opacity: 0.3 
            })
        );
        sunGroup.add(sunGlow);
    }
    sunGroup.position.set(80, 120, -80);
    scene.add(sunGroup);
    
    // Fluffy clouds (fewer on mobile)
    const cloudCount = lowPerformance ? 5 : 15;
    for (let i = 0; i < cloudCount; i++) {
        createCloud(
            Math.random() * 200 - 100,
            55 + Math.random() * 35,
            Math.random() * 200 - 100
        );
    }
}

function createCloud(x, y, z) {
    const group = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ 
        color: 0xffffff, 
        roughness: 1,
        transparent: true,
        opacity: 0.95
    });
    
    const puffCount = lowPerformance ? 2 : (4 + Math.floor(Math.random() * 3));
    const puffSegments = getSegments(12, 6);
    for (let i = 0; i < puffCount; i++) {
        const puff = new THREE.Mesh(
            new THREE.SphereGeometry(3 + Math.random() * 3, puffSegments, puffSegments),
            mat
        );
        puff.position.set(
            (i - puffCount/2) * 2.5,
            Math.random() * 1.5,
            Math.random() * 2
        );
        group.add(puff);
    }
    
    group.position.set(x, y, z);
    group.userData = { speed: 0.008 + Math.random() * 0.015, startX: x };
    animatedObjects.push({ obj: group, type: 'cloud' });
    scene.add(group);
}

function createDecorations() {
    // Scattered trees around the world (fewer on mobile)
    const allTreePositions = [
        [-70, 30], [-75, -20], [75, 40], [70, -35],
        [-65, 60], [65, 60], [-80, 0], [80, -10],
        [0, -60], [-50, -50], [50, -55], [0, 70]
    ];
    
    // Use half the trees on mobile
    const treePositions = lowPerformance ? allTreePositions.slice(0, 6) : allTreePositions;
    
    treePositions.forEach(([x, z]) => {
        createRandomTree(x, z);
    });
    
    // Scattered flowers (much fewer on mobile)
    const flowerCount = lowPerformance ? 15 : 60;
    for (let i = 0; i < flowerCount; i++) {
        const x = Math.random() * 180 - 90;
        const z = Math.random() * 180 - 90;
        // Avoid placing on zones
        const nearZone = zones.some(zone => {
            const dx = x - zone.x;
            const dz = z - zone.z;
            return Math.sqrt(dx*dx + dz*dz) < zone.radius + 3;
        });
        if (!nearZone) {
            createFlower(x, z);
        }
    }
}

function createRandomTree(x, z) {
    const colors = [0x228b22, 0x2e8b57, 0x32cd32, 0x3cb371];
    const color = colors[Math.floor(Math.random() * colors.length)];
    const scale = 0.8 + Math.random() * 0.6;
    
    const group = new THREE.Group();
    
    // Trunk
    const trunk = new THREE.Mesh(
        new THREE.CylinderGeometry(0.4 * scale, 0.6 * scale, 3 * scale, 8),
        new THREE.MeshStandardMaterial({ color: 0x8b4513 })
    );
    trunk.position.y = 1.5 * scale;
    trunk.castShadow = true;
    group.add(trunk);
    
    // Foliage layers
    const foliageMat = new THREE.MeshStandardMaterial({ color: color });
    
    const f1 = new THREE.Mesh(
        new THREE.SphereGeometry(2.5 * scale, 12, 12),
        foliageMat
    );
    f1.position.y = 4 * scale;
    f1.castShadow = true;
    group.add(f1);
    
    const f2 = new THREE.Mesh(
        new THREE.SphereGeometry(1.8 * scale, 12, 12),
        foliageMat
    );
    f2.position.set(1.2 * scale, 5 * scale, 0.5 * scale);
    f2.castShadow = true;
    group.add(f2);
    
    group.position.set(x, 0, z);
    scene.add(group);
}

// ============================================
// ZONE CREATION
// ============================================
function createAllZones() {
    const zoneData = [
        { 
            id: 'peace-garden', 
            name: '🌿 Peace Garden', 
            x: 40, z: 0, 
            radius: 16, 
            message: '"She likes peace, greenery, and calm spaces. This is her sanctuary."',
            color: 0x7cb342
        },
        { 
            id: 'horror-corner', 
            name: '🎬 Movie Theatre', 
            x: -45, z: 25, 
            radius: 14, 
            message: '"Don\'t be scared Shubhanshi, Its all in the brain. plus I\'m here."',
            color: 0x2d2d2d
        },
        { 
            id: 'book-library', 
            name: '📚 Books & Manga Building', 
            x: 0, z: 50, 
            radius: 15, 
            message: '"Shubhanshi loves mangas and books. She is not a book worm, she is my sweet reader."',
            color: 0xdeb887
        },
        { 
            id: 'dance-platform', 
            name: '💃 Dance Platform', 
            x: 50, z: -35, 
            radius: 13, 
            message: '"Daily dance energy unlocked. She moves like nobody\'s watching."',
            color: 0x7b1fa2
        },
        { 
            id: 'chai-stall', 
            name: '☕ Chai Building', 
            x: -35, z: -40, 
            radius: 11, 
            message: '"I\'ll make you chai even in the sleep just cuz you want it."',
            color: 0x8b4513,
            interactable: true
        },
        { 
            id: 'art-zone', 
            name: '🎨 Art & Sketch Zone', 
            x: -55, z: -5, 
            radius: 13, 
            message: '"She sketches. Creativity flows through her veins."',
            color: 0xf5f5dc
        },
        { 
            id: 'shopping-street', 
            name: '🛍️ Shopping Area', 
            x: 60, z: 30, 
            radius: 15, 
            message: '"Western. Traditional. Jhumkas. Bangles. Purses. Skincare."',
            color: 0xffb6c1,
            interactable: true
        },
        { 
            id: 'food-corner', 
            name: '🍝 Food Building', 
            x: -25, z: 55, 
            radius: 11, 
            message: '"Buffet of favourites: Chinese, North Indian, South Indian."',
            color: 0xff6347,
            interactable: true
        },
        { 
            id: 'dream-cloud', 
            name: '😴 Dream Cloud Area', 
            x: 35, z: 55, 
            radius: 14, 
            message: '"Sleep > Everything. Dreams are where magic happens."',
            color: 0xe6e6fa
        },
        { 
            id: 'victory-flag',
            name: '🏁 Victory Flag', 
            x: 0, z: 0, 
            radius: 8,
            message: '',
            isFinal: true,
            color: 0xffd700
        }
    ];
    
    zoneData.forEach(zone => {
        zones.push(zone);
        buildZone(zone);
    });
}

function buildZone(zone) {
    // Calculate face angle to point door towards center (0, 0)
    const faceAngle = Math.atan2(-zone.x, -zone.z);
    
    // Build zone-specific content (as actual buildings)
    switch(zone.id) {
        case 'peace-garden': buildPeaceGarden(zone.x, zone.z); break;
        case 'horror-corner': buildMovieTheatreBuilding(zone.x, zone.z, faceAngle); break;
        case 'book-library': buildBookMangaBuilding(zone.x, zone.z, faceAngle); break;
        case 'dance-platform': buildDancePlatform(zone.x, zone.z); break;
        case 'chai-stall': buildChaiBuilding(zone.x, zone.z, faceAngle); break;
        case 'art-zone': buildSketchBuilding(zone.x, zone.z, faceAngle); break;
        case 'shopping-street': buildShoppingMarket(zone.x, zone.z); break;
        case 'food-corner': buildFoodBuilding(zone.x, zone.z, faceAngle); break;
        case 'dream-cloud': buildDreamCloud(zone.x, zone.z); break;
        case 'victory-flag': buildVictoryFlag(zone.x, zone.z); break;
    }
}

function makeWallPoster(text, w, h, options = {}) {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = options.bg || 'rgba(255,255,255,0.95)';
    ctx.strokeStyle = options.border || 'rgba(196,69,105,0.85)';
    ctx.lineWidth = 10;
    ctx.beginPath();
    if (typeof ctx.roundRect === 'function') ctx.roundRect(24, 24, 464, 464, 28);
    else {
        ctx.moveTo(52, 24);
        ctx.arcTo(488, 24, 488, 488, 28);
        ctx.arcTo(488, 488, 24, 488, 28);
        ctx.arcTo(24, 488, 24, 24, 28);
        ctx.arcTo(24, 24, 488, 24, 28);
    }
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = options.fg || '#2d3440';
    ctx.font = `600 ${options.size || 30}px system-ui, -apple-system, Segoe UI, Roboto, Arial`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

    const pad = 52;
    const maxW = 512 - pad * 2;
    const lines = wrapText(ctx, text, maxW);
    let y = 58;
    const lh = (options.lineHeight || 38);
    for (const line of lines.slice(0, 12)) {
        ctx.fillText(line, pad, y);
        y += lh;
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.encoding = THREE.sRGBEncoding;
    tex.needsUpdate = true;
    const mat = new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.75, metalness: 0.0 });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    return mesh;
}

// Fancy restaurant menu board
function makeMenuBoard(title, items, w, h, bgColor = '#1a1a2e') {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');

    // Background - chalkboard style
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, 512, 512);
    
    // Wooden frame
    ctx.strokeStyle = '#8b5a2b';
    ctx.lineWidth = 20;
    ctx.strokeRect(10, 10, 492, 492);
    ctx.strokeStyle = '#5d4e37';
    ctx.lineWidth = 8;
    ctx.strokeRect(18, 18, 476, 476);
    
    // Title
    ctx.fillStyle = '#ffd700';
    ctx.font = 'bold 42px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.fillText(title, 256, 60);
    
    // Decorative line
    ctx.strokeStyle = '#ffd700';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(80, 80);
    ctx.lineTo(432, 80);
    ctx.stroke();
    
    // Menu items
    ctx.fillStyle = '#ffffff';
    ctx.font = '22px Georgia, serif';
    ctx.textAlign = 'left';
    
    let y = 110;
    for (const item of items.slice(0, 10)) {
        if (item.startsWith('---')) {
            // Section divider
            ctx.fillStyle = '#ffd700';
            ctx.font = 'bold 26px Georgia, serif';
            ctx.fillText(item.replace('---', ''), 50, y);
            ctx.fillStyle = '#ffffff';
            ctx.font = '22px Georgia, serif';
            y += 10;
        } else {
            ctx.fillText('• ' + item, 55, y);
        }
        y += 36;
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.encoding = THREE.sRGBEncoding;
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85 });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    return mesh;
}

// Movie poster
function makeMoviePoster(title, subtitle, w, h, posterColor = '#2d0a0a') {
    const canvas = document.createElement('canvas');
    canvas.width = 400;
    canvas.height = 600;
    const ctx = canvas.getContext('2d');

    // Poster background gradient
    const grad = ctx.createLinearGradient(0, 0, 0, 600);
    grad.addColorStop(0, posterColor);
    grad.addColorStop(1, '#000000');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 400, 600);
    
    // Decorative border
    ctx.strokeStyle = '#ffd700';
    ctx.lineWidth = 8;
    ctx.strokeRect(15, 15, 370, 570);
    
    // Movie title
    ctx.fillStyle = '#ff0000';
    ctx.font = 'bold 48px Impact, sans-serif';
    ctx.textAlign = 'center';
    ctx.shadowColor = '#000';
    ctx.shadowBlur = 10;
    
    // Word wrap title
    const words = title.split(' ');
    let line = '';
    let y = 450;
    ctx.font = 'bold 38px Impact, sans-serif';
    for (const word of words) {
        const testLine = line + word + ' ';
        if (ctx.measureText(testLine).width > 350 && line !== '') {
            ctx.fillText(line, 200, y);
            line = word + ' ';
            y += 45;
        } else {
            line = testLine;
        }
    }
    ctx.fillText(line, 200, y);
    
    // Subtitle
    if (subtitle) {
        ctx.fillStyle = '#ffffff';
        ctx.font = '22px Arial, sans-serif';
        ctx.fillText(subtitle, 200, 550);
    }
    
    // Spooky element (for horror)
    ctx.fillStyle = 'rgba(255,0,0,0.3)';
    ctx.beginPath();
    ctx.arc(200, 200, 80, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.shadowBlur = 0;

    const tex = new THREE.CanvasTexture(canvas);
    tex.encoding = THREE.sRGBEncoding;
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7 });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    return mesh;
}

// Shop branding sign
function makeShopSign(name, tagline, w, h, brandColor = '#ff69b4') {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');

    // Background with brand color
    ctx.fillStyle = brandColor;
    ctx.fillRect(0, 0, 512, 256);
    
    // Inner panel
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.fillRect(15, 15, 482, 226);
    
    // Brand name
    ctx.fillStyle = brandColor;
    ctx.font = 'bold 52px "Segoe UI", Helvetica, Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(name, 256, 100);
    
    // Tagline
    if (tagline) {
        ctx.fillStyle = '#333';
        ctx.font = '24px "Segoe UI", Helvetica, Arial, sans-serif';
        ctx.fillText(tagline, 256, 160);
    }
    
    // Decorative corners
    ctx.strokeStyle = brandColor;
    ctx.lineWidth = 4;
    const corners = [[20,20], [492,20], [20,236], [492,236]];
    for (const [cx, cy] of corners) {
        ctx.beginPath();
        ctx.arc(cx, cy, 8, 0, Math.PI * 2);
        ctx.stroke();
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.encoding = THREE.sRGBEncoding;
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    return mesh;
}

function wrapText(ctx, text, maxWidth) {
    const words = String(text).split(/\s+/g);
    const lines = [];
    let line = '';
    for (const w of words) {
        const test = line ? (line + ' ' + w) : w;
        if (ctx.measureText(test).width > maxWidth && line) {
            lines.push(line);
            line = w;
        } else {
            line = test;
        }
    }
    if (line) lines.push(line);
    return lines;
}

function buildSimpleBuildingShell(x, z, options = {}) {
    const w = options.w || 18;
    const d = options.d || 14;
    const h = options.h || 8;
    const roofH = options.roofH || 3;
    const color = options.color || 0xffe7ef;
    const accent = options.accent || 0xc44569;
    const label = options.label || '';
    const doorW = options.doorW || 4;
    const doorH = options.doorH || 5;
    const faceAngle = options.faceAngle || 0; // Angle to rotate building (door faces this direction)

    const g = new THREE.Group();

    // Floor with tiles effect
    const floorMat = new THREE.MeshStandardMaterial({ color: 0xf7f0e6, roughness: 0.85, metalness: 0.0 });
    const floor = new THREE.Mesh(new THREE.BoxGeometry(w - 1, 0.4, d - 1), floorMat);
    floor.position.set(0, 0.2, 0);
    floor.receiveShadow = true;
    g.add(floor);
    
    // Floor tiles decoration
    const tileMat = new THREE.MeshStandardMaterial({ color: 0xe8dcc8, roughness: 0.9 });
    for (let tx = -Math.floor(w/4); tx <= Math.floor(w/4); tx++) {
        for (let tz = -Math.floor(d/4); tz <= Math.floor(d/4); tz++) {
            if ((tx + tz) % 2 === 0) {
                const tile = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.05, 2.8), tileMat);
                tile.position.set(tx * 3, 0.43, tz * 3);
                tile.receiveShadow = true;
                g.add(tile);
            }
        }
    }

    const wallMat = new THREE.MeshStandardMaterial({ color, roughness: 0.9, metalness: 0.0 });
    const wallT = 0.5;
    const wallH = h;
    
    // Back wall
    const back = new THREE.Mesh(new THREE.BoxGeometry(w, wallH, wallT), wallMat);
    back.position.set(0, wallH / 2, -d / 2 + wallT / 2);
    back.castShadow = true;
    back.receiveShadow = true;
    g.add(back);

    // Left wall with window
    const left = new THREE.Mesh(new THREE.BoxGeometry(wallT, wallH, d), wallMat);
    left.position.set(-w / 2 + wallT / 2, wallH / 2, 0);
    left.castShadow = true;
    left.receiveShadow = true;
    g.add(left);
    
    // Left window frame
    const leftWinFrame = new THREE.Mesh(
        new THREE.BoxGeometry(0.3, 2.5, 3),
        new THREE.MeshStandardMaterial({ color: 0x5d4e37, roughness: 0.7 })
    );
    leftWinFrame.position.set(-w / 2 + 0.2, wallH / 2 + 0.5, 0);
    g.add(leftWinFrame);
    const leftWinGlass = new THREE.Mesh(
        new THREE.BoxGeometry(0.15, 2, 2.4),
        new THREE.MeshStandardMaterial({ color: 0xaaddff, transparent: true, opacity: 0.5, roughness: 0.1 })
    );
    leftWinGlass.position.set(-w / 2 + 0.3, wallH / 2 + 0.5, 0);
    g.add(leftWinGlass);

    // Right wall with window
    const right = new THREE.Mesh(new THREE.BoxGeometry(wallT, wallH, d), wallMat);
    right.position.set(w / 2 - wallT / 2, wallH / 2, 0);
    right.castShadow = true;
    right.receiveShadow = true;
    g.add(right);
    
    // Right window frame
    const rightWinFrame = new THREE.Mesh(
        new THREE.BoxGeometry(0.3, 2.5, 3),
        new THREE.MeshStandardMaterial({ color: 0x5d4e37, roughness: 0.7 })
    );
    rightWinFrame.position.set(w / 2 - 0.2, wallH / 2 + 0.5, 0);
    g.add(rightWinFrame);
    const rightWinGlass = new THREE.Mesh(
        new THREE.BoxGeometry(0.15, 2, 2.4),
        new THREE.MeshStandardMaterial({ color: 0xaaddff, transparent: true, opacity: 0.5, roughness: 0.1 })
    );
    rightWinGlass.position.set(w / 2 - 0.3, wallH / 2 + 0.5, 0);
    g.add(rightWinGlass);

    // Front wall with door opening (two wall sections on sides of door)
    const frontWallSideW = (w - doorW) / 2;
    const frontLeftWall = new THREE.Mesh(new THREE.BoxGeometry(frontWallSideW, wallH, wallT), wallMat);
    frontLeftWall.position.set(-w / 2 + frontWallSideW / 2, wallH / 2, d / 2 - wallT / 2);
    frontLeftWall.castShadow = true;
    g.add(frontLeftWall);
    
    const frontRightWall = new THREE.Mesh(new THREE.BoxGeometry(frontWallSideW, wallH, wallT), wallMat);
    frontRightWall.position.set(w / 2 - frontWallSideW / 2, wallH / 2, d / 2 - wallT / 2);
    frontRightWall.castShadow = true;
    g.add(frontRightWall);
    
    // Above door section
    const aboveDoorH = wallH - doorH;
    if (aboveDoorH > 0) {
        const aboveDoor = new THREE.Mesh(new THREE.BoxGeometry(doorW, aboveDoorH, wallT), wallMat);
        aboveDoor.position.set(0, doorH + aboveDoorH / 2, d / 2 - wallT / 2);
        aboveDoor.castShadow = true;
        g.add(aboveDoor);
    }
    
    // Door frame
    const doorFrameMat = new THREE.MeshStandardMaterial({ color: 0x5d4e37, roughness: 0.7 });
    const doorFrameL = new THREE.Mesh(new THREE.BoxGeometry(0.3, doorH, 0.4), doorFrameMat);
    doorFrameL.position.set(-doorW / 2, doorH / 2, d / 2 - wallT / 2);
    g.add(doorFrameL);
    const doorFrameR = new THREE.Mesh(new THREE.BoxGeometry(0.3, doorH, 0.4), doorFrameMat);
    doorFrameR.position.set(doorW / 2, doorH / 2, d / 2 - wallT / 2);
    g.add(doorFrameR);
    const doorFrameTop = new THREE.Mesh(new THREE.BoxGeometry(doorW + 0.6, 0.3, 0.4), doorFrameMat);
    doorFrameTop.position.set(0, doorH, d / 2 - wallT / 2);
    g.add(doorFrameTop);

    // Ceiling
    const ceiling = new THREE.Mesh(
        new THREE.BoxGeometry(w - 0.6, 0.3, d - 0.6),
        new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 })
    );
    ceiling.position.set(0, wallH - 0.15, 0);
    ceiling.receiveShadow = true;
    g.add(ceiling);

    // Roof
    const roof = new THREE.Mesh(
        new THREE.ConeGeometry(Math.max(w, d) * 0.62, roofH, 4),
        new THREE.MeshStandardMaterial({ color: accent, roughness: 0.75, metalness: 0.05 })
    );
    roof.position.set(0, wallH + roofH * 0.45, 0);
    roof.rotation.y = Math.PI / 4;
    roof.castShadow = true;
    g.add(roof);
    
    // Interior light
    const interiorLight = new THREE.PointLight(0xffffee, 0.8, 20);
    interiorLight.position.set(0, wallH - 1, 0);
    g.add(interiorLight);

    if (label) {
        const sign = makeWallPoster(label, w * 0.55, 2.1, { size: 38, lineHeight: 44 });
        sign.position.set(0, wallH - 0.8, d / 2 + 0.02);
        sign.rotation.y = Math.PI;
        g.add(sign);
    }

    g.position.set(x, 0, z);
    g.rotation.y = faceAngle;
    scene.add(g);
    
    // Register collision - store original dimensions and rotation
    // Make door opening wider for collision to ensure easy entry
    buildingColliders.push({
        x: x,
        z: z,
        origW: w,
        origD: d,
        doorW: doorW + 4, // Extra wide for easy entry
        faceAngle: faceAngle
    });
    
    return g;
}

function buildBookMangaBuilding(x, z, faceAngle = 0) {
    const g = buildSimpleBuildingShell(x, z, { 
        label: '📚 Books & Manga', 
        color: 0xfff4e6, 
        accent: 0x8b5a2b,
        faceAngle: faceAngle
    });

    // Interior elements - use local coordinates (relative to building center)
    // Bookshelves on left wall (in local coords, left is -x)
    const shelfMat = new THREE.MeshStandardMaterial({ color: 0x8b5a2b, roughness: 0.8 });
    for (let row = 0; row < 3; row++) {
        const shelf = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.15, 5), shelfMat);
        shelf.position.set(-7.8, 1.5 + row * 1.8, -1);
        shelf.castShadow = true;
        g.add(shelf);
        
        const bookColors = [0xc44569, 0x3498db, 0x27ae60, 0x9b59b6, 0xe74c3c, 0xf39c12, 0x1abc9c];
        for (let b = 0; b < 6; b++) {
            const bookH = 0.8 + Math.random() * 0.5;
            const book = new THREE.Mesh(
                new THREE.BoxGeometry(0.5, bookH, 0.15 + Math.random() * 0.1),
                new THREE.MeshStandardMaterial({ color: bookColors[b % bookColors.length], roughness: 0.7 })
            );
            book.position.set(-7.8, 1.65 + row * 1.8 + bookH / 2, -3.2 + b * 0.7);
            book.rotation.y = (Math.random() - 0.5) * 0.1;
            book.castShadow = true;
            g.add(book);
        }
    }
    
    // Bookshelves on right wall
    for (let row = 0; row < 3; row++) {
        const shelf = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.15, 5), shelfMat);
        shelf.position.set(7.8, 1.5 + row * 1.8, -1);
        shelf.castShadow = true;
        g.add(shelf);
        
        const bookColors = [0xe74c3c, 0x2ecc71, 0x3498db, 0xf1c40f, 0x9b59b6, 0xe67e22, 0x1abc9c];
        for (let b = 0; b < 6; b++) {
            const bookH = 0.8 + Math.random() * 0.5;
            const book = new THREE.Mesh(
                new THREE.BoxGeometry(0.5, bookH, 0.15 + Math.random() * 0.1),
                new THREE.MeshStandardMaterial({ color: bookColors[b % bookColors.length], roughness: 0.7 })
            );
            book.position.set(7.8, 1.65 + row * 1.8 + bookH / 2, -3.2 + b * 0.7);
            book.rotation.y = (Math.random() - 0.5) * 0.1;
            book.castShadow = true;
            g.add(book);
        }
    }
    
    // Reading table in center  
    const tableMat = new THREE.MeshStandardMaterial({ color: 0xdeb887, roughness: 0.7 });
    const tableTop = new THREE.Mesh(new THREE.BoxGeometry(4, 0.15, 2.5), tableMat);
    tableTop.position.set(0, 1.3, 1);
    tableTop.castShadow = true;
    tableTop.receiveShadow = true;
    g.add(tableTop);
    
    for (let lx of [-1.7, 1.7]) {
        for (let lz of [-1, 1]) {
            const leg = new THREE.Mesh(new THREE.BoxGeometry(0.15, 1.3, 0.15), tableMat);
            leg.position.set(lx, 0.65, 1 + lz * 1);
            leg.castShadow = true;
            g.add(leg);
        }
    }
    
    // Chairs
    const chairMat = new THREE.MeshStandardMaterial({ color: 0xcd853f, roughness: 0.75 });
    for (let side = -1; side <= 1; side += 2) {
        const seat = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.12, 1.2), chairMat);
        seat.position.set(side * 2.8, 0.9, 1);
        seat.castShadow = true;
        g.add(seat);
        
        const backrest = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.2, 1.2), chairMat);
        backrest.position.set(side * 3.3, 1.5, 1);
        backrest.castShadow = true;
        g.add(backrest);
    }
    
    // Open book on table
    const openBook = new THREE.Mesh(
        new THREE.BoxGeometry(1.2, 0.08, 0.9),
        new THREE.MeshStandardMaterial({ color: 0xfff8dc, roughness: 0.6 })
    );
    openBook.position.set(0, 1.42, 1);
    openBook.rotation.y = Math.PI / 8;
    g.add(openBook);
    
    // Manga display on back wall
    const mangaColors = [0xff6b9d, 0x4169e1, 0xffd700, 0x32cd32, 0xff4500];
    for (let m = 0; m < 5; m++) {
        const manga = new THREE.Mesh(
            new THREE.BoxGeometry(1.4, 2.0, 0.08),
            new THREE.MeshStandardMaterial({ color: mangaColors[m], roughness: 0.6 })
        );
        manga.position.set(-5 + m * 2.5, 5.8, -6.2);
        manga.castShadow = true;
        g.add(manga);
    }
    
    // Message poster
    const msg = "Shubhanshi loves mangas and books.\nShe is not a book worm,\nshe is my sweet reader.";
    const poster = makeWallPoster(msg, 7.2, 4.2, { size: 28, lineHeight: 36 });
    poster.position.set(0, 3.8, -6.4);
    g.add(poster);
}

function buildChaiBuilding(x, z, faceAngle = 0) {
    const g = buildSimpleBuildingShell(x, z, { label: '☕ Chai', color: 0xfff1e6, accent: 0x8b4513, faceAngle: faceAngle });

    const msg = "I'll make you chai even in the sleep just cuz you want it.";
    const poster = makeWallPoster(msg, 7.4, 4.2, { size: 28, lineHeight: 36 });
    poster.position.set(0, 3.8, -6.4);
    g.add(poster);

    // Counter at back
    const counterMat = new THREE.MeshStandardMaterial({ color: 0x8b4513, roughness: 0.7 });
    const counter = new THREE.Mesh(new THREE.BoxGeometry(10, 1.2, 1.5), counterMat);
    counter.position.set(0, 0.6, -5);
    counter.castShadow = true;
    counter.receiveShadow = true;
    g.add(counter);
    
    // Counter top surface
    const counterTop = new THREE.Mesh(
        new THREE.BoxGeometry(10.2, 0.15, 1.7),
        new THREE.MeshStandardMaterial({ color: 0xdeb887, roughness: 0.5 })
    );
    counterTop.position.set(0, 1.25, -5);
    counterTop.receiveShadow = true;
    g.add(counterTop);
    
    // Chai cups on counter display
    const cupMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 });
    for (let c = 0; c < 6; c++) {
        const displayCup = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.3, 0.6, 12), cupMat);
        displayCup.position.set(-4 + c * 1.6, 1.65, -5);
        displayCup.castShadow = true;
        g.add(displayCup);
        
        // Tea inside cup
        const tea = new THREE.Mesh(
            new THREE.CylinderGeometry(0.22, 0.22, 0.1, 12),
            new THREE.MeshStandardMaterial({ color: 0xd4a574, roughness: 0.3 })
        );
        tea.position.set(-4 + c * 1.6, 1.85, -5);
        g.add(tea);
    }
    
    // Kettle on counter
    const kettleBody = new THREE.Mesh(
        new THREE.SphereGeometry(0.6, 12, 12),
        new THREE.MeshStandardMaterial({ color: 0x404040, roughness: 0.3, metalness: 0.8 })
    );
    kettleBody.position.set(3.5, 1.9, -5);
    kettleBody.castShadow = true;
    g.add(kettleBody);
    const kettleSpout = new THREE.Mesh(
        new THREE.CylinderGeometry(0.08, 0.12, 0.5, 8),
        new THREE.MeshStandardMaterial({ color: 0x404040, roughness: 0.3, metalness: 0.8 })
    );
    kettleSpout.position.set(4, 2.0, -5);
    kettleSpout.rotation.z = Math.PI / 4;
    g.add(kettleSpout);
    
    // Stools at counter
    const stoolMat = new THREE.MeshStandardMaterial({ color: 0xcd853f, roughness: 0.75 });
    for (let s = 0; s < 4; s++) {
        const stoolSeat = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.15, 16), stoolMat);
        stoolSeat.position.set(-3.5 + s * 2.3, 1.0, -3);
        stoolSeat.castShadow = true;
        g.add(stoolSeat);
        
        const stoolLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 1.0, 8), stoolMat);
        stoolLeg.position.set(-3.5 + s * 2.3, 0.5, -3);
        g.add(stoolLeg);
    }
    
    // Small round tables with chairs
    for (let t = 0; t < 2; t++) {
        const tableX = (t === 0 ? -4 : 4);
        const tableZ = 2;
        
        // Round table
        const tableTop = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 0.12, 16), 
            new THREE.MeshStandardMaterial({ color: 0xdeb887, roughness: 0.6 }));
        tableTop.position.set(tableX, 1.2, tableZ);
        tableTop.castShadow = true;
        tableTop.receiveShadow = true;
        g.add(tableTop);
        
        const tableLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.15, 1.2, 8),
            new THREE.MeshStandardMaterial({ color: 0x8b4513, roughness: 0.7 }));
        tableLeg.position.set(tableX, 0.6, tableZ);
        g.add(tableLeg);
        
        // Cup on table
        const tableCup = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.25, 0.5, 12), cupMat);
        tableCup.position.set(tableX + 0.3, 1.55, tableZ);
        tableCup.castShadow = true;
        g.add(tableCup);
    }

    // Drinkable chai cup interactable (special large cup)
    const cup = new THREE.Mesh(
        new THREE.CylinderGeometry(0.7, 0.8, 1.1, 14),
        new THREE.MeshStandardMaterial({ color: 0x8b4513, roughness: 0.7, metalness: 0.05, emissive: 0x402010, emissiveIntensity: 0.2 })
    );
    cup.position.set(0, 1.95, -5);
    cup.castShadow = true;
    g.add(cup);
    
    // Glow effect on special cup
    const cupGlow = new THREE.PointLight(0xffaa55, 0.5, 3);
    cupGlow.position.set(0, 2.2, -5);
    g.add(cupGlow);

    zones.push({
        id: 'chai-drink',
        name: 'Drink Chai',
        x: x,
        z: z,
        radius: 5,
        color: 0x8b4513,
        interactable: true,
        onInteract: () => {
            showWarmFlash();
            showPopup('Hope boosted. ☕');
            playSound(660, 0.12, 0.12);
            g.remove(cup);
            g.remove(cupGlow);
            visitedZones.add('chai-drink');
            updateProgress();
        }
    });
}

function buildFoodBuilding(x, z, faceAngle = 0) {
    const g = buildSimpleBuildingShell(x, z, { 
        label: '🍝 Restaurant', 
        color: 0xffefe6, 
        accent: 0xff6347, 
        w: 20, 
        d: 16,
        faceAngle: faceAngle 
    });

    // Menu boards on back wall - chalkboard style
    const chineseMenu = makeMenuBoard('🥡 CHINESE', [
        '---STARTERS',
        'Chilli Potato',
        'Momos (Steamed/Fried)',
        '---MAINS',
        'Hakka Noodles',
        'Manchurian (Dry/Gravy)',
        'Chilli Paneer',
        'Egg Fried Rice'
    ], 4.5, 5, '#1a2a1a');
    chineseMenu.position.set(-5.5, 4.5, -7.2);
    g.add(chineseMenu);
    
    const indianMenu = makeMenuBoard('🍛 NORTH INDIAN', [
        '---CURRIES',
        'Palak Paneer',
        'Aloo Matar',
        'Soya Bean Curry',
        '---BREADS',
        'Butter Naan',
        'Tandoori Roti',
        'Garlic Naan'
    ], 4.5, 5, '#2a1a1a');
    indianMenu.position.set(0, 4.5, -7.2);
    g.add(indianMenu);
    
    const southMenu = makeMenuBoard('🥘 SOUTH INDIAN', [
        '---DOSAS',
        'Masala Dosa',
        'Plain Dosa',
        '---SNACKS',
        'Idli (3 pcs)',
        'Medu Vada',
        'Uttapam',
        '---SIDES',
        'Coconut Chutney',
        'Sambhar'
    ], 4.5, 5, '#1a1a2a');
    southMenu.position.set(5.5, 4.5, -7.2);
    g.add(southMenu);

    // Buffet tables with steel tops
    const tableMat = new THREE.MeshStandardMaterial({ color: 0xc0c0c0, roughness: 0.3, metalness: 0.7 });
    const tableBaseMat = new THREE.MeshStandardMaterial({ color: 0x404040, roughness: 0.7 });
    
    // Chinese section (left)
    const chineseTable = new THREE.Mesh(new THREE.BoxGeometry(5.5, 0.15, 2.5), tableMat);
    chineseTable.position.set(-5.5, 1.15, -4.5);
    g.add(chineseTable);
    const chineseTableBase = new THREE.Mesh(new THREE.BoxGeometry(5.3, 1, 2.3), tableBaseMat);
    chineseTableBase.position.set(-5.5, 0.55, -4.5);
    g.add(chineseTableBase);
    
    // Chinese dishes - Momos
    const momoPlate = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.8, 0.12, 16), 
        new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 }));
    momoPlate.position.set(-6.8, 1.28, -4.5);
    g.add(momoPlate);
    for (let m = 0; m < 5; m++) {
        const momo = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 8),
            new THREE.MeshStandardMaterial({ color: 0xfff8dc, roughness: 0.6 }));
        momo.position.set(-6.8 + (m % 3 - 1) * 0.25, 1.45, -4.5 + (m < 3 ? -0.15 : 0.15));
        momo.scale.y = 0.7;
        g.add(momo);
    }
    
    // Noodles bowl
    const noodleBowl = new THREE.Mesh(new THREE.SphereGeometry(0.55, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2),
        new THREE.MeshStandardMaterial({ color: 0x8b4513, roughness: 0.5 }));
    noodleBowl.position.set(-5.5, 1.28, -4.5);
    noodleBowl.rotation.x = Math.PI;
    g.add(noodleBowl);
    const noodles = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.08, 6, 12),
        new THREE.MeshStandardMaterial({ color: 0xf5deb3, roughness: 0.5 }));
    noodles.position.set(-5.5, 1.55, -4.5);
    noodles.rotation.x = Math.PI / 2;
    g.add(noodles);
    
    // Manchurian bowl
    const manchBowl = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.4, 0.4, 12),
        new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 }));
    manchBowl.position.set(-4.2, 1.35, -4.5);
    g.add(manchBowl);
    const manchurian = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 8),
        new THREE.MeshStandardMaterial({ color: 0x8b0000, roughness: 0.5 }));
    manchurian.position.set(-4.2, 1.55, -4.5);
    manchurian.scale.y = 0.5;
    g.add(manchurian);
    
    // North Indian section (center)
    const indianTable = new THREE.Mesh(new THREE.BoxGeometry(5.5, 0.15, 2.5), tableMat);
    indianTable.position.set(0, 1.15, -4.5);
    g.add(indianTable);
    const indianTableBase = new THREE.Mesh(new THREE.BoxGeometry(5.3, 1, 2.3), tableBaseMat);
    indianTableBase.position.set(0, 0.55, -4.5);
    g.add(indianTableBase);
    
    // Palak Paneer
    const palakBowl = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.5, 0.35, 12),
        new THREE.MeshStandardMaterial({ color: 0xcd853f, roughness: 0.5 }));
    palakBowl.position.set(-1.2, 1.32, -4.5);
    g.add(palakBowl);
    const palak = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.2, 12),
        new THREE.MeshStandardMaterial({ color: 0x228b22, roughness: 0.6 }));
    palak.position.set(-1.2, 1.55, -4.5);
    g.add(palak);
    for (let p = 0; p < 4; p++) {
        const paneer = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.12, 0.15),
            new THREE.MeshStandardMaterial({ color: 0xfffaf0, roughness: 0.5 }));
        paneer.position.set(-1.2 + (p % 2 - 0.5) * 0.2, 1.68, -4.5 + (p < 2 ? -0.1 : 0.1));
        g.add(paneer);
    }
    
    // South Indian section (right)
    const southTable = new THREE.Mesh(new THREE.BoxGeometry(5.5, 0.15, 2.5), tableMat);
    southTable.position.set(5.5, 1.15, -4.5);
    g.add(southTable);
    const southTableBase = new THREE.Mesh(new THREE.BoxGeometry(5.3, 1, 2.3), tableBaseMat);
    southTableBase.position.set(5.5, 0.55, -4.5);
    g.add(southTableBase);
    
    // Dosa
    const dosaPlate = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.85, 0.08, 16),
        new THREE.MeshStandardMaterial({ color: 0x90ee90, roughness: 0.3 }));
    dosaPlate.position.set(4.2, 1.26, -4.5);
    g.add(dosaPlate);
    const dosa = new THREE.Mesh(new THREE.ConeGeometry(0.6, 0.5, 16),
        new THREE.MeshStandardMaterial({ color: 0xf4a460, roughness: 0.6 }));
    dosa.position.set(4.2, 1.55, -4.5);
    dosa.rotation.x = -Math.PI / 6;
    g.add(dosa);
    
    // Idli plate
    const idliPlate = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.75, 0.08, 16),
        new THREE.MeshStandardMaterial({ color: 0xc0c0c0, roughness: 0.3, metalness: 0.4 }));
    idliPlate.position.set(5.5, 1.26, -4.5);
    g.add(idliPlate);
    for (let i = 0; i < 3; i++) {
        const idli = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.22, 0.15, 12),
            new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7 }));
        idli.position.set(5.2 + i * 0.3, 1.4, -4.5);
        g.add(idli);
    }
    
    // Sambhar bowl
    const sambharBowl = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.35, 0.3, 12),
        new THREE.MeshStandardMaterial({ color: 0x8b4513, roughness: 0.5 }));
    sambharBowl.position.set(6.8, 1.35, -4.5);
    g.add(sambharBowl);
    const sambhar = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.1, 12),
        new THREE.MeshStandardMaterial({ color: 0xff8c00, roughness: 0.4 }));
    sambhar.position.set(6.8, 1.52, -4.5);
    g.add(sambhar);
    
    // Dining tables (use local coords)
    const diningMat = new THREE.MeshStandardMaterial({ color: 0xdeb887, roughness: 0.6 });
    for (let row = 0; row < 2; row++) {
        for (let col = 0; col < 2; col++) {
            const dtX = -4 + col * 8;
            const dtZ = 2 + row * 4;
            
            const dTable = new THREE.Mesh(new THREE.BoxGeometry(3, 0.12, 2), diningMat);
            dTable.position.set(dtX, 1.1, dtZ);
            g.add(dTable);
            
            const dLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.25, 1.1, 8), diningMat);
            dLeg.position.set(dtX, 0.55, dtZ);
            g.add(dLeg);
            
            const chairMat = new THREE.MeshStandardMaterial({ color: 0xcd853f, roughness: 0.7 });
            for (let side of [-1.8, 1.8]) {
                const chair = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.1, 0.8), chairMat);
                chair.position.set(dtX + side, 0.8, dtZ);
                g.add(chair);
            }
            
            const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.38, 0.05, 12),
                new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 }));
            plate.position.set(dtX, 1.2, dtZ);
            g.add(plate);
        }
    }
}

function buildMovieTheatreBuilding(x, z, faceAngle = 0) {
    const g = buildSimpleBuildingShell(x, z, { 
        label: '🎬 Movie Tickets', 
        color: 0x232333, 
        accent: 0x7b1fa2, 
        w: 22, 
        d: 14,
        faceAngle: faceAngle 
    });

    // Ticket counter
    const counterMat = new THREE.MeshStandardMaterial({ color: 0x4a0a4a, roughness: 0.5 });
    const counter = new THREE.Mesh(new THREE.BoxGeometry(14, 1.2, 2), counterMat);
    counter.position.set(0, 0.6, -4);
    counter.castShadow = true;
    g.add(counter);
    
    // Counter top (glass/marble effect)
    const counterTop = new THREE.Mesh(
        new THREE.BoxGeometry(14.2, 0.15, 2.2),
        new THREE.MeshStandardMaterial({ color: 0x1a1a2e, roughness: 0.2, metalness: 0.5 })
    );
    counterTop.position.set(0, 1.25, -4);
    g.add(counterTop);
    
    // Computer monitors at counter
    for (let m = -2; m <= 2; m += 2) {
        const monitorScreen = new THREE.Mesh(
            new THREE.BoxGeometry(1.2, 0.9, 0.08),
            new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0x003366, emissiveIntensity: 0.3 })
        );
        monitorScreen.position.set(m * 2.5, 1.9, -4.5);
        g.add(monitorScreen);
        
        const monitorStand = new THREE.Mesh(
            new THREE.BoxGeometry(0.3, 0.5, 0.3),
            new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.5 })
        );
        monitorStand.position.set(m * 2.5, 1.4, -4.5);
        g.add(monitorStand);
    }
    
    // Movie posters on back wall (the main attraction!)
    const movies = [
        { title: 'THE CONJURING', color: '#2d0a0a' },
        { title: 'STREE 2', color: '#0a2d0a' },
        { title: 'VERONICA', color: '#0a0a2d' },
        { title: 'EVIL DEAD RISE', color: '#2d2d0a' },
        { title: 'RAAZ', color: '#2d0a2d' }
    ];
    
    for (let i = 0; i < 5; i++) {
        const poster = makeMoviePoster(movies[i].title, 'NOW SHOWING', 2.5, 3.8, movies[i].color);
        poster.position.set(-7 + i * 3.5, 4.5, -6.3);
        g.add(poster);
        
        // Poster frame
        const frame = new THREE.Mesh(
            new THREE.BoxGeometry(2.7, 4, 0.15),
            new THREE.MeshStandardMaterial({ color: 0x8b4513, roughness: 0.6 })
        );
        frame.position.set(-7 + i * 3.5, 4.5, -6.5);
        g.add(frame);
    }
    
    // Velvet rope barriers
    const ropeMat = new THREE.MeshStandardMaterial({ color: 0x8b0000, roughness: 0.7 });
    const postMat = new THREE.MeshStandardMaterial({ color: 0xffd700, roughness: 0.3, metalness: 0.8 });
    
    for (let r = -2; r <= 2; r++) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 1.2, 12), postMat);
        post.position.set(r * 3, 0.6, 1);
        post.castShadow = true;
        g.add(post);
        
        const postTop = new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 12), postMat);
        postTop.position.set(r * 3, 1.25, 1);
        g.add(postTop);
        
        if (r < 2) {
            const rope = new THREE.Mesh(
                new THREE.CylinderGeometry(0.05, 0.05, 2.8, 8),
                ropeMat
            );
            rope.position.set(r * 3 + 1.5, 1, 1);
            rope.rotation.z = Math.PI / 2;
            g.add(rope);
        }
    }
    
    // Popcorn machine
    const popcornBase = new THREE.Mesh(
        new THREE.BoxGeometry(1.5, 1.5, 1.5),
        new THREE.MeshStandardMaterial({ color: 0xff0000, roughness: 0.6 })
    );
    popcornBase.position.set(8, 1.0, -2);
    popcornBase.castShadow = true;
    g.add(popcornBase);
    
    const popcornGlass = new THREE.Mesh(
        new THREE.BoxGeometry(1.3, 1.2, 1.3),
        new THREE.MeshStandardMaterial({ color: 0xffffee, transparent: true, opacity: 0.3, roughness: 0.1 })
    );
    popcornGlass.position.set(8, 2.4, -2);
    g.add(popcornGlass);
    
    // Popcorn inside
    for (let p = 0; p < 8; p++) {
        const corn = new THREE.Mesh(
            new THREE.SphereGeometry(0.15, 6, 6),
            new THREE.MeshStandardMaterial({ color: 0xfff8dc, roughness: 0.8 })
        );
        corn.position.set(8 + (Math.random() - 0.5) * 0.8, 2.0 + Math.random() * 0.5, -2 + (Math.random() - 0.5) * 0.8);
        g.add(corn);
    }
    
    // Sign above popcorn
    const popcornSign = makeShopSign('POPCORN', '₹50', 1.5, 0.6, '#ff6600');
    popcornSign.position.set(8, 3.3, -2);
    g.add(popcornSign);
    
    // Soda machine
    const sodaMachine = new THREE.Mesh(
        new THREE.BoxGeometry(1.2, 2.5, 1),
        new THREE.MeshStandardMaterial({ color: 0x003399, roughness: 0.5 })
    );
    sodaMachine.position.set(-8, 1.25, -2);
    sodaMachine.castShadow = true;
    g.add(sodaMachine);
    
    const sodaSign = makeShopSign('DRINKS', '₹40', 1.2, 0.5, '#0066cc');
    sodaSign.position.set(-8, 2.7, -1.4);
    g.add(sodaSign);
    
    // Horror atmosphere lights
    const light1 = new THREE.PointLight(0x7b1fa2, 0.6, 15);
    light1.position.set(-5, 5, 0);
    g.add(light1);
    const light2 = new THREE.PointLight(0x7b1fa2, 0.6, 15);
    light2.position.set(5, 5, 0);
    g.add(light2);

    // Sweet message
    const msg = makeWallPoster("Don't be scared Shubhanshi,\nAayush will be there :)", 7, 2.2, { size: 26, lineHeight: 34, bg: 'rgba(255,230,240,0.95)' });
    msg.position.set(0, 2.5, 6.3);
    msg.rotation.y = Math.PI;
    g.add(msg);
}

function buildShoppingMarket(x, z) {
    // Outdoor market area with stalls facing INWARD toward center
    const base = new THREE.Mesh(
        new THREE.CircleGeometry(22, 32),
        new THREE.MeshStandardMaterial({ color: 0xfff2f6, roughness: 0.95, metalness: 0.0 })
    );
    base.rotation.x = -Math.PI / 2;
    base.position.set(x, 0.02, z);
    base.receiveShadow = true;
    scene.add(base);
    
    // Decorative pathways from center to each stall
    for (let i = 0; i < 6; i++) {
        const angle = (i / 6) * Math.PI * 2;
        const path = new THREE.Mesh(
            new THREE.BoxGeometry(1.5, 0.05, 10),
            new THREE.MeshStandardMaterial({ color: 0xdda0dd, roughness: 0.8 })
        );
        path.position.set(x + Math.cos(angle) * 7, 0.025, z + Math.sin(angle) * 7);
        path.rotation.y = angle + Math.PI / 2;
        path.receiveShadow = true;
        scene.add(path);
    }

    const sections = [
        { name: 'Western Dresses', color: 0xff69b4, items: 'bodycon' },
        { name: 'Traditional', color: 0xff8c00, items: 'saree' },
        { name: 'Jhumkas', color: 0xffd700, items: 'jewelry' },
        { name: 'Bangles', color: 0x32cd32, items: 'bangles' },
        { name: 'Purses', color: 0x9370db, items: 'purse' },
        { name: 'Skincare', color: 0xffb6c1, items: 'skincare' }
    ];

    for (let i = 0; i < sections.length; i++) {
        const angle = (i / sections.length) * Math.PI * 2;
        const stallRadius = 16;
        const sx = x + Math.cos(angle) * stallRadius;
        const sz = z + Math.sin(angle) * stallRadius;
        const section = sections[i];
        
        // Create stall group and rotate to face center
        const stallGroup = new THREE.Group();
        stallGroup.position.set(sx, 0, sz);
        // Rotate stall to face inward (toward x, z center)
        stallGroup.rotation.y = angle + Math.PI;
        scene.add(stallGroup);

        const stallMat = new THREE.MeshStandardMaterial({ color: section.color, roughness: 0.85 });
        
        // Back wall (at +z in local coords, which faces outward after rotation)
        const backWall = new THREE.Mesh(new THREE.BoxGeometry(6, 4, 0.3), stallMat);
        backWall.position.set(0, 2, 2.5);
        backWall.castShadow = true;
        stallGroup.add(backWall);
        
        // Side walls
        for (let side of [-1, 1]) {
            const sideWall = new THREE.Mesh(new THREE.BoxGeometry(0.3, 4, 5), stallMat);
            sideWall.position.set(side * 3, 2, 0);
            sideWall.castShadow = true;
            stallGroup.add(sideWall);
        }
        
        // Counter at front (facing center)
        const counter = new THREE.Mesh(
            new THREE.BoxGeometry(5.5, 1.1, 1.2),
            new THREE.MeshStandardMaterial({ color: 0x8b4513, roughness: 0.7 })
        );
        counter.position.set(0, 0.55, -2);
        counter.castShadow = true;
        counter.receiveShadow = true;
        stallGroup.add(counter);
        
        // Counter top
        const counterTop = new THREE.Mesh(
            new THREE.BoxGeometry(5.7, 0.1, 1.4),
            new THREE.MeshStandardMaterial({ color: 0xdeb887, roughness: 0.5 })
        );
        counterTop.position.set(0, 1.15, -2);
        stallGroup.add(counterTop);
        
        // Roof/awning tilted forward
        const awning = new THREE.Mesh(
            new THREE.BoxGeometry(7, 0.2, 6),
            new THREE.MeshStandardMaterial({ color: section.color, roughness: 0.7 })
        );
        awning.position.set(0, 4.2, 0);
        awning.rotation.x = -0.15; // Tilt forward toward customer
        awning.castShadow = true;
        stallGroup.add(awning);
        
        // Add section-specific items (all in local coords)
        if (section.items === 'bodycon' || section.items === 'saree') {
            // Mannequins at back
            for (let m = 0; m < 2; m++) {
                const mannequinBody = new THREE.Mesh(
                    new THREE.CylinderGeometry(0.25, 0.35, 1.8, 12),
                    new THREE.MeshStandardMaterial({ color: 0xffe4c4, roughness: 0.6 })
                );
                mannequinBody.position.set(-1.5 + m * 3, 1.4, 1.2);
                mannequinBody.castShadow = true;
                stallGroup.add(mannequinBody);
                
                const head = new THREE.Mesh(
                    new THREE.SphereGeometry(0.2, 12, 12),
                    new THREE.MeshStandardMaterial({ color: 0xffe4c4, roughness: 0.6 })
                );
                head.position.set(-1.5 + m * 3, 2.5, 1.2);
                stallGroup.add(head);
                
                const dress = new THREE.Mesh(
                    new THREE.CylinderGeometry(0.3, 0.5, 1.2, 12),
                    new THREE.MeshStandardMaterial({ color: section.items === 'bodycon' ? 0x000000 : 0xff6347, roughness: 0.5 })
                );
                dress.position.set(-1.5 + m * 3, 1.2, 1.2);
                stallGroup.add(dress);
            }
            
            // Clothing rack
            const rack = new THREE.Mesh(
                new THREE.CylinderGeometry(0.05, 0.05, 4, 8),
                new THREE.MeshStandardMaterial({ color: 0x808080, metalness: 0.8, roughness: 0.2 })
            );
            rack.position.set(0, 2.5, 0);
            rack.rotation.z = Math.PI / 2;
            stallGroup.add(rack);
            
            for (let h = 0; h < 5; h++) {
                const hanger = new THREE.Mesh(
                    new THREE.BoxGeometry(0.6, 0.05, 0.02),
                    new THREE.MeshStandardMaterial({ color: 0x808080, metalness: 0.6 })
                );
                hanger.position.set(-1.5 + h * 0.75, 2.35, 0);
                stallGroup.add(hanger);
                
                const cloth = new THREE.Mesh(
                    new THREE.BoxGeometry(0.5, 0.8, 0.05),
                    new THREE.MeshStandardMaterial({ color: [0xff69b4, 0x4169e1, 0xff6347, 0x32cd32, 0x9370db][h] })
                );
                cloth.position.set(-1.5 + h * 0.75, 1.9, 0);
                stallGroup.add(cloth);
            }
        } else if (section.items === 'jewelry' || section.items === 'bangles') {
            // Display stands on counter
            for (let d = 0; d < 3; d++) {
                const stand = new THREE.Mesh(
                    new THREE.CylinderGeometry(0.3, 0.4, 0.8, 12),
                    new THREE.MeshStandardMaterial({ color: 0x800020, roughness: 0.5 })
                );
                stand.position.set(-1.5 + d * 1.5, 1.55, -2);
                stand.castShadow = true;
                stallGroup.add(stand);
                
                if (section.items === 'jewelry') {
                    const jhumka = new THREE.Mesh(
                        new THREE.ConeGeometry(0.15, 0.25, 12),
                        new THREE.MeshStandardMaterial({ color: 0xffd700, metalness: 0.9, roughness: 0.1 })
                    );
                    jhumka.position.set(-1.5 + d * 1.5, 2.1, -2);
                    jhumka.rotation.x = Math.PI;
                    stallGroup.add(jhumka);
                } else {
                    for (let b = 0; b < 4; b++) {
                        const bangle = new THREE.Mesh(
                            new THREE.TorusGeometry(0.15 + b * 0.03, 0.02, 8, 24),
                            new THREE.MeshStandardMaterial({ color: [0xff0000, 0x00ff00, 0xffd700, 0xff69b4][b], metalness: 0.7, roughness: 0.2 })
                        );
                        bangle.position.set(-1.5 + d * 1.5, 2.0 + b * 0.08, -2);
                        bangle.rotation.x = Math.PI / 2;
                        stallGroup.add(bangle);
                    }
                }
            }
        } else if (section.items === 'purse') {
            // Shelves on back wall
            for (let shelf = 0; shelf < 2; shelf++) {
                const shelfBoard = new THREE.Mesh(
                    new THREE.BoxGeometry(4, 0.1, 0.8),
                    new THREE.MeshStandardMaterial({ color: 0x8b4513, roughness: 0.7 })
                );
                shelfBoard.position.set(0, 1.5 + shelf * 1.2, 1.8);
                stallGroup.add(shelfBoard);
                
                for (let p = 0; p < 4; p++) {
                    const purse = new THREE.Mesh(
                        new THREE.BoxGeometry(0.5, 0.4, 0.2),
                        new THREE.MeshStandardMaterial({ color: [0x8b4513, 0x000000, 0xff69b4, 0x800020][p], roughness: 0.4 })
                    );
                    purse.position.set(-1.2 + p * 0.8, 1.75 + shelf * 1.2, 1.8);
                    purse.castShadow = true;
                    stallGroup.add(purse);
                    
                    const strap = new THREE.Mesh(
                        new THREE.TorusGeometry(0.15, 0.02, 6, 12, Math.PI),
                        new THREE.MeshStandardMaterial({ color: [0x8b4513, 0x000000, 0xff69b4, 0x800020][p] })
                    );
                    strap.position.set(-1.2 + p * 0.8, 1.95 + shelf * 1.2, 1.8);
                    stallGroup.add(strap);
                }
            }
        } else if (section.items === 'skincare') {
            // Glass display case
            const glassCase = new THREE.Mesh(
                new THREE.BoxGeometry(4, 1.5, 1.5),
                new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.3, roughness: 0.05 })
            );
            glassCase.position.set(0, 1.85, 0.5);
            stallGroup.add(glassCase);
            
            for (let row = 0; row < 2; row++) {
                for (let col = 0; col < 4; col++) {
                    const isBottle = (row + col) % 2 === 0;
                    const product = new THREE.Mesh(
                        isBottle ? new THREE.CylinderGeometry(0.12, 0.12, 0.5, 12) : new THREE.CylinderGeometry(0.18, 0.18, 0.25, 12),
                        new THREE.MeshStandardMaterial({ 
                            color: [0xffb6c1, 0xe6e6fa, 0x98fb98, 0xffdab9][col], 
                            roughness: 0.2,
                            transparent: true,
                            opacity: 0.8
                        })
                    );
                    product.position.set(-1.2 + col * 0.7, 1.4 + row * 0.5, 0.5);
                    stallGroup.add(product);
                }
            }
        }
        
        // Sign above awning - face inward
        const sign = makeWallPoster(section.name, 4.5, 1.2, { size: 28, lineHeight: 34 });
        sign.position.set(0, 4.8, -1);
        stallGroup.add(sign);
        
        // Light for stall
        const stallLight = new THREE.PointLight(0xffffff, 0.4, 8);
        stallLight.position.set(0, 3.5, 0);
        stallGroup.add(stallLight);
    }

    // Central fountain
    const fountain = new THREE.Mesh(
        new THREE.CylinderGeometry(2.5, 3, 1, 24),
        new THREE.MeshStandardMaterial({ color: 0xc0c0c0, roughness: 0.3, metalness: 0.5 })
    );
    fountain.position.set(x, 0.5, z);
    fountain.castShadow = true;
    fountain.receiveShadow = true;
    scene.add(fountain);
    
    const water = new THREE.Mesh(
        new THREE.CylinderGeometry(2.2, 2.2, 0.6, 24),
        new THREE.MeshStandardMaterial({ color: 0x4169e1, transparent: true, opacity: 0.6, roughness: 0.1 })
    );
    water.position.set(x, 1.05, z);
    scene.add(water);
    
    // Water jet in center
    const jet = new THREE.Mesh(
        new THREE.CylinderGeometry(0.1, 0.15, 1.5, 12),
        new THREE.MeshStandardMaterial({ color: 0x87ceeb, transparent: true, opacity: 0.5 })
    );
    jet.position.set(x, 1.6, z);
    scene.add(jet);

    const title = makeWallPoster('🛍️ Shopping Area', 7.0, 2.4, { size: 40, lineHeight: 46 });
    title.position.set(x, 6, z);
    scene.add(title);
}

function buildSketchBuilding(x, z, faceAngle = 0) {
    const g = buildSimpleBuildingShell(x, z, { label: '🎨 Sketching', color: 0xf5f5dc, accent: 0xc44569, w: 20, d: 16, faceAngle: faceAngle });

    const msg = 'The queen is sketching don\'t move.';
    const poster = makeWallPoster(msg, 7.8, 3.8, { size: 32, lineHeight: 40 });
    poster.position.set(0, 5.5, -7.2);
    g.add(poster);
    
    // Main sketch frame on back wall - loads image from file
    const frameW = 6;
    const frameH = 8;
    const frameBorder = new THREE.Mesh(
        new THREE.BoxGeometry(frameW + 0.6, frameH + 0.6, 0.2),
        new THREE.MeshStandardMaterial({ color: 0x5d4e37, roughness: 0.7 })
    );
    frameBorder.position.set(0, 4.8, -7.3);
    frameBorder.castShadow = true;
    g.add(frameBorder);
    
    // Try to load sketch image, fallback to white canvas
    const loader = new THREE.TextureLoader();
    const sketchMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85 });
    
    // Attempt to load sketch.jpg or sketch.png
    loader.load('sketch.jpg', 
        (texture) => {
            sketchMat.map = texture;
            sketchMat.needsUpdate = true;
        },
        undefined,
        () => {
            // Try PNG if JPG fails
            loader.load('sketch.png',
                (texture) => {
                    sketchMat.map = texture;
                    sketchMat.needsUpdate = true;
                },
                undefined,
                () => {
                    console.log('Sketch image not found. Place sketch.jpg or sketch.png in the game folder.');
                }
            );
        }
    );
    
    const sketchCanvas = new THREE.Mesh(
        new THREE.BoxGeometry(frameW, frameH, 0.08),
        sketchMat
    );
    sketchCanvas.position.set(0, 4.8, -7.15);
    g.add(sketchCanvas);
    
    // Easel
    const easelMat = new THREE.MeshStandardMaterial({ color: 0x8b4513, roughness: 0.7 });
    // Main easel board
    const easelBoard = new THREE.Mesh(new THREE.BoxGeometry(3.5, 4.5, 0.15), 
        new THREE.MeshStandardMaterial({ color: 0xfff8dc, roughness: 0.85 }));
    easelBoard.position.set(-5, 3.2, -2);
    easelBoard.rotation.x = -0.15;
    easelBoard.castShadow = true;
    g.add(easelBoard);
    
    // Easel frame (A-frame legs)
    const easelLeg1 = new THREE.Mesh(new THREE.BoxGeometry(0.12, 5, 0.12), easelMat);
    easelLeg1.position.set(-5.8, 2.2, -1.2);
    easelLeg1.rotation.x = 0.2;
    easelLeg1.rotation.z = 0.15;
    g.add(easelLeg1);
    
    const easelLeg2 = new THREE.Mesh(new THREE.BoxGeometry(0.12, 5, 0.12), easelMat);
    easelLeg2.position.set(-4.2, 2.2, -1.2);
    easelLeg2.rotation.x = 0.2;
    easelLeg2.rotation.z = -0.15;
    g.add(easelLeg2);
    
    const easelLeg3 = new THREE.Mesh(new THREE.BoxGeometry(0.12, 4.5, 0.12), easelMat);
    easelLeg3.position.set(-5, 2.0, -3);
    easelLeg3.rotation.x = -0.3;
    g.add(easelLeg3);
    
    // Sketch in progress on easel (smaller version)
    const sketchInProgress = new THREE.Mesh(
        new THREE.BoxGeometry(2.8, 3.8, 0.05),
        new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 })
    );
    sketchInProgress.position.set(-5, 3.3, -1.9);
    sketchInProgress.rotation.x = -0.15;
    g.add(sketchInProgress);
    
    // Art supply table
    const artTable = new THREE.Mesh(
        new THREE.BoxGeometry(4, 0.12, 2.5),
        new THREE.MeshStandardMaterial({ color: 0xdeb887, roughness: 0.6 })
    );
    artTable.position.set(4, 1.1, -3);
    artTable.castShadow = true;
    artTable.receiveShadow = true;
    g.add(artTable);
    
    // Table legs
    const tableLegMat = new THREE.MeshStandardMaterial({ color: 0x8b4513, roughness: 0.7 });
    for (let lx of [-1.7, 1.7]) {
        for (let lz of [-1, 1]) {
            const leg = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.1, 0.12), tableLegMat);
            leg.position.set(4 + lx, 0.55, -3 + lz);
            g.add(leg);
        }
    }
    
    // Pencils on table
    const pencilColors = [0x2f4f4f, 0x8b0000, 0x006400, 0x00008b, 0x8b4513];
    for (let p = 0; p < 5; p++) {
        const pencil = new THREE.Mesh(
            new THREE.CylinderGeometry(0.03, 0.03, 0.8, 8),
            new THREE.MeshStandardMaterial({ color: pencilColors[p], roughness: 0.5 })
        );
        pencil.position.set(2.8 + p * 0.25, 1.3, -3.5);
        pencil.rotation.z = Math.PI / 2;
        pencil.rotation.y = 0.1 * (p - 2);
        g.add(pencil);
        
        // Pencil tip
        const tip = new THREE.Mesh(
            new THREE.ConeGeometry(0.03, 0.1, 8),
            new THREE.MeshStandardMaterial({ color: 0xf5deb3, roughness: 0.6 })
        );
        tip.position.set(2.4 + p * 0.25, 1.3, -3.5);
        tip.rotation.z = -Math.PI / 2;
        g.add(tip);
    }
    
    // Pencil holder
    const holder = new THREE.Mesh(
        new THREE.CylinderGeometry(0.35, 0.4, 0.8, 12),
        new THREE.MeshStandardMaterial({ color: 0x4a4a4a, roughness: 0.5, metalness: 0.3 })
    );
    holder.position.set(5, 1.55, -3);
    holder.castShadow = true;
    g.add(holder);
    
    // Pencils in holder
    for (let p = 0; p < 6; p++) {
        const angle = (p / 6) * Math.PI * 2;
        const pencilInHolder = new THREE.Mesh(
            new THREE.CylinderGeometry(0.025, 0.025, 0.6, 6),
            new THREE.MeshStandardMaterial({ color: [0xff6347, 0x4169e1, 0x32cd32, 0xffd700, 0x9370db, 0xff69b4][p] })
        );
        pencilInHolder.position.set(5 + Math.cos(angle) * 0.15, 1.95, -3 + Math.sin(angle) * 0.15);
        g.add(pencilInHolder);
    }
    
    // Sketchbook on table
    const sketchbook = new THREE.Mesh(
        new THREE.BoxGeometry(1.5, 0.08, 2),
        new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 })
    );
    sketchbook.position.set(4, 1.2, -2.5);
    sketchbook.rotation.y = 0.2;
    g.add(sketchbook);
    
    // Sketchbook cover
    const sketchbookCover = new THREE.Mesh(
        new THREE.BoxGeometry(1.55, 0.03, 2.05),
        new THREE.MeshStandardMaterial({ color: 0x2f4f4f, roughness: 0.7 })
    );
    sketchbookCover.position.set(4, 1.15, -2.5);
    sketchbookCover.rotation.y = 0.2;
    g.add(sketchbookCover);
    
    // Eraser
    const eraser = new THREE.Mesh(
        new THREE.BoxGeometry(0.4, 0.15, 0.25),
        new THREE.MeshStandardMaterial({ color: 0xffb6c1, roughness: 0.8 })
    );
    eraser.position.set(3.2, 1.22, -2.3);
    g.add(eraser);
    
    // Stool for artist
    const stoolSeat = new THREE.Mesh(
        new THREE.CylinderGeometry(0.6, 0.6, 0.12, 16),
        new THREE.MeshStandardMaterial({ color: 0xcd853f, roughness: 0.7 })
    );
    stoolSeat.position.set(-5, 1.1, 1);
    stoolSeat.castShadow = true;
    g.add(stoolSeat);
    
    const stoolLeg = new THREE.Mesh(
        new THREE.CylinderGeometry(0.08, 0.12, 1.1, 8),
        new THREE.MeshStandardMaterial({ color: 0x8b4513, roughness: 0.7 })
    );
    stoolLeg.position.set(-5, 0.55, 1);
    g.add(stoolLeg);
    
    // Small gallery of other sketches on wall
    const sketchFrameColors = [0xffffff, 0xfff8dc, 0xf5f5dc];
    for (let s = 0; s < 3; s++) {
        const smallFrame = new THREE.Mesh(
            new THREE.BoxGeometry(0.15, 2.5, 1.8),
            new THREE.MeshStandardMaterial({ color: 0x5d4e37, roughness: 0.7 })
        );
        smallFrame.position.set(9.2, 3.5, -4 + s * 2.5);
        g.add(smallFrame);
        
        const smallSketch = new THREE.Mesh(
            new THREE.BoxGeometry(0.08, 2.1, 1.4),
            new THREE.MeshStandardMaterial({ color: sketchFrameColors[s], roughness: 0.85 })
        );
        smallSketch.position.set(9.1, 3.5, -4 + s * 2.5);
        g.add(smallSketch);
    }
    
    // Inspirational quote poster
    const quote = makeWallPoster('✨ Art is not what you see,\nbut what you make\nothers see. ✨', 5.5, 3, { size: 24, lineHeight: 32 });
    quote.position.set(-9.2, 4, -2);
    quote.rotation.y = Math.PI / 2;
    g.add(quote);
}

// ============================================
// ZONE BUILDERS
// ============================================
function buildPeaceGarden(x, z) {
    // Beautiful trees
    const treePositions = [
        [-7, 5], [7, -4], [0, -9], [-5, 9], [6, 7], [-9, -3]
    ];
    treePositions.forEach(([dx, dz]) => {
        createGardenTree(x + dx, z + dz);
    });
    
    // Flowers everywhere
    for (let i = 0; i < 25; i++) {
        const angle = Math.random() * Math.PI * 2;
        const dist = 3 + Math.random() * 10;
        createFlower(x + Math.cos(angle) * dist, z + Math.sin(angle) * dist);
    }
    
    // Cozy bench
    createBench(x, z + 4);
    
    // Butterflies
    for (let i = 0; i < 5; i++) {
        createButterfly(x + (Math.random() - 0.5) * 20, z + (Math.random() - 0.5) * 20, i);
    }
    
    // Soft ambient light
    const light = new THREE.PointLight(0xaaffaa, 0.5, 25);
    light.position.set(x, 8, z);
    scene.add(light);
}

function createGardenTree(x, z) {
    const group = new THREE.Group();
    const colors = [0x228b22, 0x2e8b57, 0x3cb371];
    const color = colors[Math.floor(Math.random() * colors.length)];
    
    const trunk = new THREE.Mesh(
        new THREE.CylinderGeometry(0.35, 0.5, 2.8, 8),
        new THREE.MeshStandardMaterial({ color: 0x8b4513 })
    );
    trunk.position.y = 1.4;
    trunk.castShadow = true;
    group.add(trunk);
    
    const foliageMat = new THREE.MeshStandardMaterial({ color: color });
    
    const f1 = new THREE.Mesh(new THREE.SphereGeometry(2.2, 16, 16), foliageMat);
    f1.position.y = 4;
    f1.castShadow = true;
    group.add(f1);
    
    const f2 = new THREE.Mesh(new THREE.SphereGeometry(1.6, 16, 16), foliageMat);
    f2.position.set(1.2, 4.8, 0.6);
    f2.castShadow = true;
    group.add(f2);
    
    const f3 = new THREE.Mesh(new THREE.SphereGeometry(1.3, 16, 16), foliageMat);
    f3.position.set(-0.8, 4.5, -0.8);
    f3.castShadow = true;
    group.add(f3);
    
    group.position.set(x, 0, z);
    scene.add(group);
}

function createFlower(x, z) {
    const colors = [0xff69b4, 0xffb6c1, 0xffd700, 0xff6347, 0x9370db, 0xff1493, 0xffaa00];
    const color = colors[Math.floor(Math.random() * colors.length)];
    
    const group = new THREE.Group();
    
    // Stem
    const stem = new THREE.Mesh(
        new THREE.CylinderGeometry(0.025, 0.03, 0.4 + Math.random() * 0.3, 6),
        new THREE.MeshStandardMaterial({ color: 0x228b22 })
    );
    stem.position.y = 0.2;
    group.add(stem);
    
    // Petals
    const petalMat = new THREE.MeshStandardMaterial({ color: color });
    const petalCount = 5 + Math.floor(Math.random() * 3);
    for (let i = 0; i < petalCount; i++) {
        const petal = new THREE.Mesh(
            new THREE.SphereGeometry(0.08 + Math.random() * 0.04, 8, 8),
            petalMat
        );
        const angle = (i / petalCount) * Math.PI * 2;
        petal.position.set(Math.cos(angle) * 0.1, 0.45, Math.sin(angle) * 0.1);
        group.add(petal);
    }
    
    // Center
    const center = new THREE.Mesh(
        new THREE.SphereGeometry(0.06, 8, 8),
        new THREE.MeshStandardMaterial({ color: 0xffd700 })
    );
    center.position.y = 0.45;
    group.add(center);
    
    group.position.set(x, 0, z);
    scene.add(group);
}

function createBench(x, z) {
    const group = new THREE.Group();
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x8b4513 });
    
    // Seat
    const seat = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.12, 0.8), woodMat);
    seat.position.y = 0.55;
    seat.castShadow = true;
    group.add(seat);
    
    // Backrest
    const back = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.6, 0.1), woodMat);
    back.position.set(0, 0.9, -0.35);
    back.castShadow = true;
    group.add(back);
    
    // Legs
    for (let i = -1; i <= 1; i += 2) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.55, 0.7), woodMat);
        leg.position.set(i * 1.2, 0.28, 0);
        leg.castShadow = true;
        group.add(leg);
    }
    
    group.position.set(x, 0, z);
    scene.add(group);
}

function createButterfly(x, z, i) {
    const colors = [0xff69b4, 0xffb6c1, 0x87ceeb, 0xffd700, 0xdda0dd];
    const color = colors[i % colors.length];
    
    const group = new THREE.Group();
    const wingMat = new THREE.MeshStandardMaterial({ 
        color: color, 
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.8
    });
    
    // Wings
    const wingGeo = new THREE.CircleGeometry(0.2, 8);
    const leftWing = new THREE.Mesh(wingGeo, wingMat);
    leftWing.position.x = -0.15;
    leftWing.rotation.y = 0.3;
    group.add(leftWing);
    
    const rightWing = new THREE.Mesh(wingGeo, wingMat);
    rightWing.position.x = 0.15;
    rightWing.rotation.y = -0.3;
    group.add(rightWing);
    
    // Body
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x333333 });
    const body = makeCapsuleGroup(0.03, 0.15, bodyMat);
    body.rotation.x = Math.PI / 2;
    group.add(body);
    
    group.position.set(x, 1.5 + Math.random() * 2, z);
    group.userData = { 
        centerX: x, 
        centerZ: z, 
        radius: 3 + Math.random() * 4,
        speed: 0.3 + Math.random() * 0.3,
        offset: Math.random() * Math.PI * 2,
        baseY: group.position.y
    };
    animatedObjects.push({ obj: group, type: 'butterfly' });
    scene.add(group);
}

function buildHorrorCorner(x, z) {
    // Spooky dead trees
    const treePositions = [[-6, 5], [7, -4], [-4, -7], [5, 7], [-8, 0]];
    treePositions.forEach(([dx, dz]) => {
        createDeadTree(x + dx, z + dz);
    });
    
    // Eerie moon
    const moonGroup = new THREE.Group();
    const moon = new THREE.Mesh(
        new THREE.SphereGeometry(3.5, 32, 32),
        new THREE.MeshBasicMaterial({ color: 0xfffff0 })
    );
    moonGroup.add(moon);
    
    const moonGlow = new THREE.Mesh(
        new THREE.SphereGeometry(5, 32, 32),
        new THREE.MeshBasicMaterial({ 
            color: 0xfffff0, 
            transparent: true, 
            opacity: 0.2 
        })
    );
    moonGroup.add(moonGlow);
    moonGroup.position.set(x, 22, z - 8);
    scene.add(moonGroup);
    
    // Glowing pumpkins
    createPumpkin(x + 4, z);
    createPumpkin(x - 5, z + 3);
    createPumpkin(x + 2, z - 5);
    
    // Floating ghosts
    for (let i = 0; i < 3; i++) {
        createGhost(x + (Math.random() - 0.5) * 15, z + (Math.random() - 0.5) * 15, i);
    }
    
    // Eerie purple light
    const light = new THREE.PointLight(0x6666ff, 0.8, 22);
    light.position.set(x, 6, z);
    scene.add(light);
    
    // Additional spooky atmosphere
    const fogLight = new THREE.PointLight(0x9999ff, 0.4, 18);
    fogLight.position.set(x, 1, z);
    scene.add(fogLight);
}

function createDeadTree(x, z) {
    const group = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0x2d2d2d });
    
    const trunk = new THREE.Mesh(
        new THREE.CylinderGeometry(0.2, 0.4, 4.5, 6),
        mat
    );
    trunk.position.y = 2.25;
    trunk.castShadow = true;
    group.add(trunk);
    
    // Twisted branches
    for (let i = 0; i < 5; i++) {
        const branch = new THREE.Mesh(
            new THREE.CylinderGeometry(0.04, 0.1, 1.2 + Math.random() * 0.8, 5),
            mat
        );
        const angle = (i / 5) * Math.PI * 2 + Math.random() * 0.5;
        branch.position.set(
            Math.cos(angle) * 0.3,
            3.5 + Math.random() * 1,
            Math.sin(angle) * 0.3
        );
        branch.rotation.x = (Math.random() - 0.5) * 0.8;
        branch.rotation.z = (Math.random() - 0.5) * 1.2;
        branch.castShadow = true;
        group.add(branch);
    }
    
    group.position.set(x, 0, z);
    scene.add(group);
}

function createPumpkin(x, z) {
    const group = new THREE.Group();
    
    // Body
    const body = new THREE.Mesh(
        new THREE.SphereGeometry(0.55, 16, 16),
        new THREE.MeshStandardMaterial({ color: 0xff6600 })
    );
    body.scale.y = 0.75;
    body.position.y = 0.42;
    body.castShadow = true;
    group.add(body);
    
    // Stem
    const stem = new THREE.Mesh(
        new THREE.CylinderGeometry(0.06, 0.1, 0.25, 6),
        new THREE.MeshStandardMaterial({ color: 0x228b22 })
    );
    stem.position.y = 0.85;
    group.add(stem);
    
    // Inner glow
    const glow = new THREE.PointLight(0xffaa00, 0.8, 3);
    glow.position.y = 0.4;
    group.add(glow);
    
    // Face glow effect
    const faceGlow = new THREE.Mesh(
        new THREE.SphereGeometry(0.45, 16, 16),
        new THREE.MeshBasicMaterial({ 
            color: 0xffaa00, 
            transparent: true, 
            opacity: 0.4 
        })
    );
    faceGlow.position.y = 0.42;
    group.add(faceGlow);
    
    group.position.set(x, 0, z);
    scene.add(group);
}

function createGhost(x, z, i) {
    const group = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ 
        color: 0xffffff, 
        transparent: true, 
        opacity: 0.7,
        emissive: 0xffffff,
        emissiveIntensity: 0.2
    });
    
    // Body
    const body = makeCapsuleGroup(0.4, 0.8, mat);
    body.position.y = 0.6;
    group.add(body);
    
    // Eyes
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
    const leftEye = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 8), eyeMat);
    leftEye.position.set(-0.15, 0.9, 0.35);
    group.add(leftEye);
    
    const rightEye = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 8), eyeMat);
    rightEye.position.set(0.15, 0.9, 0.35);
    group.add(rightEye);
    
    group.position.set(x, 2 + Math.random() * 2, z);
    group.userData = {
        baseY: group.position.y,
        offset: i * 1.5,
        startX: x,
        startZ: z
    };
    animatedObjects.push({ obj: group, type: 'ghost' });
    scene.add(group);
}

function buildLibrary(x, z) {
    // Floating magical bookshelves
    createBookshelf(x - 6, 3.5, z - 5);
    createBookshelf(x + 6, 4, z + 4);
    createBookshelf(x, 4.5, z - 7);
    
    // Cozy reading chair
    createReadingChair(x, z + 2);
    
    // Floating books around the area
    for (let i = 0; i < 8; i++) {
        createFloatingBook(x, z, i);
    }
    
    // Magical reading lamp light
    const light = new THREE.PointLight(0xffd280, 1, 22);
    light.position.set(x, 6, z);
    scene.add(light);
    
    // Glowing orbs
    for (let i = 0; i < 4; i++) {
        createMagicOrb(x + (Math.random() - 0.5) * 16, 3 + Math.random() * 3, z + (Math.random() - 0.5) * 16, i);
    }
}

function createBookshelf(x, y, z) {
    const group = new THREE.Group();
    
    // Shelf
    const shelf = new THREE.Mesh(
        new THREE.BoxGeometry(4, 0.15, 0.8),
        new THREE.MeshStandardMaterial({ color: 0x8b4513 })
    );
    shelf.castShadow = true;
    group.add(shelf);
    
    // Books
    const bookColors = [0xff6b6b, 0x4ecdc4, 0x45b7d1, 0x96ceb4, 0xfeca57, 0xff9ff3, 0x54a0ff, 0x5f27cd];
    for (let i = 0; i < 10; i++) {
        const book = new THREE.Mesh(
            new THREE.BoxGeometry(0.12 + Math.random() * 0.08, 0.4 + Math.random() * 0.25, 0.5),
            new THREE.MeshStandardMaterial({ color: bookColors[i % bookColors.length] })
        );
        book.position.set(-1.6 + i * 0.32, 0.32, 0);
        book.rotation.z = (Math.random() - 0.5) * 0.08;
        book.castShadow = true;
        group.add(book);
    }
    
    group.position.set(x, y, z);
    group.userData = { baseY: y, offset: Math.random() * Math.PI * 2 };
    animatedObjects.push({ obj: group, type: 'float' });
    scene.add(group);
}

function createReadingChair(x, z) {
    const group = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0x8b0000 });
    
    // Seat
    const seat = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.35, 1.2), mat);
    seat.position.y = 0.5;
    seat.castShadow = true;
    group.add(seat);
    
    // Backrest
    const back = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.1, 0.25), mat);
    back.position.set(0, 1.1, -0.5);
    back.castShadow = true;
    group.add(back);
    
    // Arms
    for (let i = -1; i <= 1; i += 2) {
        const arm = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.5, 1), mat);
        arm.position.set(i * 0.65, 0.85, -0.1);
        arm.castShadow = true;
        group.add(arm);
    }
    
    group.position.set(x, 0, z);
    scene.add(group);
}

function createFloatingBook(cx, cz, i) {
    const colors = [0xff6b6b, 0x4ecdc4, 0x45b7d1, 0xfeca57, 0xff9ff3, 0x54a0ff];
    
    const book = new THREE.Mesh(
        new THREE.BoxGeometry(0.9, 0.1, 0.65),
        new THREE.MeshStandardMaterial({ color: colors[i % colors.length] })
    );
    
    const angle = (i / 8) * Math.PI * 2;
    const radius = 7 + Math.random() * 4;
    book.position.set(
        cx + Math.cos(angle) * radius,
        2.5 + Math.random() * 2.5,
        cz + Math.sin(angle) * radius
    );
    book.rotation.set(Math.random() * 0.4, Math.random() * Math.PI, Math.random() * 0.4);
    book.userData = { baseY: book.position.y, offset: Math.random() * Math.PI * 2 };
    animatedObjects.push({ obj: book, type: 'float' });
    scene.add(book);
}

function createMagicOrb(x, y, z, i) {
    const colors = [0xffd700, 0xff69b4, 0x00ffff, 0xaa55ff];
    
    const orb = new THREE.Mesh(
        new THREE.SphereGeometry(0.2, 16, 16),
        new THREE.MeshBasicMaterial({ 
            color: colors[i % colors.length],
            transparent: true,
            opacity: 0.8
        })
    );
    orb.position.set(x, y, z);
    
    // Glow
    const glow = new THREE.PointLight(colors[i % colors.length], 0.5, 5);
    orb.add(glow);
    
    orb.userData = { baseY: y, offset: i * 0.8 };
    animatedObjects.push({ obj: orb, type: 'orb' });
    scene.add(orb);
}

function buildDancePlatform(x, z) {
    // Disco floor tiles
    const tileColors = [0xff69b4, 0x00bfff, 0x32cd32, 0xffd700, 0xff6347, 0x9370db, 0x00ffff, 0xff00ff];
    for (let i = 0; i < 10; i++) {
        const angle = (i / 10) * Math.PI * 2;
        const tile = new THREE.Mesh(
            new THREE.CylinderGeometry(1.8, 1.8, 0.15, 6),
            new THREE.MeshStandardMaterial({ 
                color: tileColors[i % tileColors.length],
                emissive: tileColors[i % tileColors.length],
                emissiveIntensity: 0.3
            })
        );
        tile.position.set(x + Math.cos(angle) * 6, 0.35, z + Math.sin(angle) * 6);
        tile.userData = { pulseOffset: i * 0.4 };
        animatedObjects.push({ obj: tile, type: 'danceTile' });
        scene.add(tile);
    }
    
    // Music notes
    for (let i = 0; i < 6; i++) {
        createMusicNote(
            x + (Math.random() - 0.5) * 14,
            3 + Math.random() * 3,
            z + (Math.random() - 0.5) * 14,
            i
        );
    }
    
    // Disco ball
    createDiscoBall(x, 8, z);
    
    // Disco lights
    const lightColors = [0xff0066, 0x00ffff, 0xffff00, 0xff00ff, 0x00ff00];
    lightColors.forEach((col, i) => {
        const light = new THREE.PointLight(col, 0.6, 18);
        const angle = (i / lightColors.length) * Math.PI * 2;
        light.position.set(x + Math.cos(angle) * 7, 6, z + Math.sin(angle) * 7);
        light.userData = { baseY: 6, idx: i };
        animatedObjects.push({ obj: light, type: 'discoLight' });
        scene.add(light);
    });
}

function createMusicNote(x, y, z, i) {
    const group = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ 
        color: 0xffd700, 
        emissive: 0xffd700, 
        emissiveIntensity: 0.5 
    });
    
    // Note head
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 16, 16), mat);
    head.scale.set(1, 0.65, 0.3);
    group.add(head);
    
    // Stem
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.2, 8), mat);
    stem.position.set(0.26, 0.6, 0);
    group.add(stem);
    
    // Flag
    const flag = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.08, 0.1), mat);
    flag.position.set(0.4, 1.1, 0);
    group.add(flag);
    
    group.position.set(x, y, z);
    group.userData = { baseY: y, offset: i * 0.6 };
    animatedObjects.push({ obj: group, type: 'musicNote' });
    scene.add(group);
}

function createDiscoBall(x, y, z) {
    const group = new THREE.Group();
    
    const ball = new THREE.Mesh(
        new THREE.SphereGeometry(1.2, 32, 32),
        new THREE.MeshStandardMaterial({ 
            color: 0xcccccc, 
            metalness: 0.9, 
            roughness: 0.1 
        })
    );
    group.add(ball);
    
    // Hanging wire
    const wire = new THREE.Mesh(
        new THREE.CylinderGeometry(0.03, 0.03, 3, 8),
        new THREE.MeshStandardMaterial({ color: 0x333333 })
    );
    wire.position.y = 2.5;
    group.add(wire);
    
    group.position.set(x, y, z);
    animatedObjects.push({ obj: group, type: 'discoBall' });
    scene.add(group);
}

function buildChaiStall(x, z) {
    // Stall structure
    const counter = new THREE.Mesh(
        new THREE.BoxGeometry(5.5, 1.2, 1.4),
        new THREE.MeshStandardMaterial({ color: 0x8b4513 })
    );
    counter.position.set(x, 0.6, z - 1.5);
    counter.castShadow = true;
    scene.add(counter);
    
    // Counter top
    const counterTop = new THREE.Mesh(
        new THREE.BoxGeometry(5.8, 0.1, 1.7),
        new THREE.MeshStandardMaterial({ color: 0xf5f5dc })
    );
    counterTop.position.set(x, 1.22, z - 1.5);
    scene.add(counterTop);
    
    // Roof
    const roof = new THREE.Mesh(
        new THREE.ConeGeometry(5.5, 3, 4),
        new THREE.MeshStandardMaterial({ color: 0x8b0000 })
    );
    roof.position.set(x, 5, z);
    roof.rotation.y = Math.PI / 4;
    roof.castShadow = true;
    scene.add(roof);
    
    // Support poles
    for (let i = -1; i <= 1; i += 2) {
        for (let j = -1; j <= 1; j += 2) {
            const pole = new THREE.Mesh(
                new THREE.CylinderGeometry(0.1, 0.1, 3.5, 8),
                new THREE.MeshStandardMaterial({ color: 0x8b4513 })
            );
            pole.position.set(x + i * 2.2, 1.75, z + j * 2.2);
            pole.castShadow = true;
            scene.add(pole);
        }
    }
    
    // Chai cups on counter
    createChaiCup(x - 1.8, z - 1.5);
    createChaiCup(x - 0.6, z - 1.5);
    createChaiCup(x + 0.6, z - 1.5);
    createChaiCup(x + 1.8, z - 1.5);
    
    // Lanterns
    createLantern(x - 2.8, 3.2, z + 2.5);
    createLantern(x + 2.8, 3.2, z + 2.5);
    
    // Sign
    createSign(x, 3.8, z - 3, 'CHAI ☕');
    
    // Warm ambient light
    const light = new THREE.PointLight(0xffaa55, 1.2, 18);
    light.position.set(x, 3.5, z);
    scene.add(light);
}

function createChaiCup(x, z) {
    const group = new THREE.Group();
    
    // Cup
    const cup = new THREE.Mesh(
        new THREE.CylinderGeometry(0.16, 0.12, 0.28, 16),
        new THREE.MeshStandardMaterial({ color: 0xffffff })
    );
    cup.position.y = 1.36;
    group.add(cup);
    
    // Tea inside
    const tea = new THREE.Mesh(
        new THREE.CylinderGeometry(0.13, 0.1, 0.05, 16),
        new THREE.MeshStandardMaterial({ color: 0x8b4513 })
    );
    tea.position.y = 1.47;
    group.add(tea);
    
    // Steam
    createSteam(group);
    
    group.position.set(x, 0, z);
    scene.add(group);
}

function createSteam(parent) {
    const steamMat = new THREE.MeshBasicMaterial({ 
        color: 0xffffff, 
        transparent: true, 
        opacity: 0.3 
    });
    
    for (let i = 0; i < 3; i++) {
        const steam = new THREE.Mesh(
            new THREE.SphereGeometry(0.05, 8, 8),
            steamMat
        );
        steam.position.set((Math.random() - 0.5) * 0.1, 1.55 + i * 0.1, (Math.random() - 0.5) * 0.1);
        steam.userData = { baseY: steam.position.y, offset: i * 0.5 };
        animatedObjects.push({ obj: steam, type: 'steam' });
        parent.add(steam);
    }
}

function createLantern(x, y, z) {
    const group = new THREE.Group();
    
    const body = new THREE.Mesh(
        new THREE.CylinderGeometry(0.28, 0.32, 0.65, 8),
        new THREE.MeshStandardMaterial({ 
            color: 0xff6600, 
            transparent: true, 
            opacity: 0.85,
            emissive: 0xff4400,
            emissiveIntensity: 0.6
        })
    );
    group.add(body);
    
    const cap = new THREE.Mesh(
        new THREE.ConeGeometry(0.32, 0.22, 8),
        new THREE.MeshStandardMaterial({ color: 0x222222 })
    );
    cap.position.y = 0.43;
    group.add(cap);
    
    const light = new THREE.PointLight(0xff6600, 0.6, 7);
    group.add(light);
    
    group.position.set(x, y, z);
    animatedObjects.push({ obj: group, type: 'lantern' });
    scene.add(group);
}

function createSign(x, y, z, text) {
    const group = new THREE.Group();
    
    // Sign board
    const board = new THREE.Mesh(
        new THREE.BoxGeometry(2.5, 0.8, 0.1),
        new THREE.MeshStandardMaterial({ color: 0xf5f5dc })
    );
    group.add(board);
    
    // Text (using canvas texture)
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 80;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#8b4513';
    ctx.font = 'bold 40px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(text, 128, 55);
    
    const texture = new THREE.CanvasTexture(canvas);
    const textMat = new THREE.MeshBasicMaterial({ map: texture, transparent: true });
    const textMesh = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.75), textMat);
    textMesh.position.z = 0.06;
    group.add(textMesh);
    
    group.position.set(x, y, z);
    scene.add(group);
}

function buildArtZone(x, z) {
    // Giant floating sketchbook
    const book = new THREE.Group();
    const cover = new THREE.Mesh(
        new THREE.BoxGeometry(3, 0.15, 3.5),
        new THREE.MeshStandardMaterial({ color: 0x8b4513 })
    );
    book.add(cover);
    
    const pages = new THREE.Mesh(
        new THREE.BoxGeometry(2.8, 0.12, 3.3),
        new THREE.MeshStandardMaterial({ color: 0xfff8dc })
    );
    pages.position.y = 0.12;
    book.add(pages);
    
    book.position.set(x, 2.8, z);
    book.rotation.x = -0.25;
    book.userData = { baseY: 2.8, offset: 0 };
    animatedObjects.push({ obj: book, type: 'float' });
    scene.add(book);
    
    // Floating colored pencils
    const pencilColors = [0xff0000, 0xff8800, 0xffff00, 0x00ff00, 0x0088ff, 0xff00ff, 0x8800ff, 0xff0088];
    pencilColors.forEach((col, i) => {
        createPencil(x, z, col, i);
    });
    
    // Easel with canvas
    createEasel(x - 6, z);
    createEasel(x + 6, z + 2);
    
    // Paint palette floating
    createPalette(x + 4, 3, z - 4);
    
    // Soft natural light
    const light = new THREE.PointLight(0xfff5e6, 0.9, 20);
    light.position.set(x, 7, z);
    scene.add(light);
}

function createPencil(cx, cz, color, i) {
    const group = new THREE.Group();
    
    const body = new THREE.Mesh(
        new THREE.CylinderGeometry(0.07, 0.07, 1.4, 6),
        new THREE.MeshStandardMaterial({ color: color })
    );
    group.add(body);
    
    const tip = new THREE.Mesh(
        new THREE.ConeGeometry(0.07, 0.25, 6),
        new THREE.MeshStandardMaterial({ color: 0xffd700 })
    );
    tip.position.y = -0.8;
    tip.rotation.x = Math.PI;
    group.add(tip);
    
    const angle = (i / 8) * Math.PI * 2;
    group.position.set(
        cx + Math.cos(angle) * 6,
        2.8 + Math.sin(i * 0.7) * 0.6,
        cz + Math.sin(angle) * 6
    );
    group.rotation.z = Math.PI / 5;
    group.userData = { baseY: group.position.y, offset: i * 0.6 };
    animatedObjects.push({ obj: group, type: 'float' });
    scene.add(group);
}

function createEasel(x, z) {
    const group = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0x8b4513 });
    
    // Legs
    for (let i = -1; i <= 1; i++) {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 3.5, 8), mat);
        leg.position.set(i * 0.55, 1.75, i === 0 ? -0.5 : 0.4);
        leg.rotation.x = i === 0 ? 0.25 : -0.12;
        group.add(leg);
    }
    
    // Canvas
    const canvas = new THREE.Mesh(
        new THREE.BoxGeometry(2, 1.6, 0.08),
        new THREE.MeshStandardMaterial({ color: 0xffffff })
    );
    canvas.position.y = 2.5;
    group.add(canvas);
    
    // Shelf
    const shelf = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.1, 0.3), mat);
    shelf.position.set(0, 1.6, 0.2);
    group.add(shelf);
    
    group.position.set(x, 0, z);
    scene.add(group);
}

function createPalette(x, y, z) {
    const group = new THREE.Group();
    
    // Palette base
    const palette = new THREE.Mesh(
        new THREE.CylinderGeometry(0.8, 0.8, 0.08, 16),
        new THREE.MeshStandardMaterial({ color: 0xdeb887 })
    );
    group.add(palette);
    
    // Paint blobs
    const paintColors = [0xff0000, 0xffff00, 0x0000ff, 0x00ff00, 0xff00ff, 0xffffff];
    paintColors.forEach((col, i) => {
        const blob = new THREE.Mesh(
            new THREE.SphereGeometry(0.12, 8, 8),
            new THREE.MeshStandardMaterial({ color: col })
        );
        const angle = (i / paintColors.length) * Math.PI * 2;
        blob.position.set(Math.cos(angle) * 0.5, 0.08, Math.sin(angle) * 0.5);
        blob.scale.y = 0.4;
        group.add(blob);
    });
    
    group.position.set(x, y, z);
    group.rotation.x = 0.3;
    group.userData = { baseY: y, offset: 1.5 };
    animatedObjects.push({ obj: group, type: 'float' });
    scene.add(group);
}

function buildShoppingStreet(x, z) {
    // Row of colorful shops
    const shopColors = [0xff69b4, 0x87ceeb, 0x98fb98, 0xdda0dd, 0xffd700, 0xffa07a, 0xff6b6b, 0x87ceeb];
    
    for (let i = 0; i < 4; i++) {
        createShop(x - 9 + i * 6, z - 5, shopColors[i]);
    }
    for (let i = 0; i < 4; i++) {
        createShop(x - 9 + i * 6, z + 5, shopColors[i + 4]);
    }
    
    // Floating shopping bags
    for (let i = 0; i < 6; i++) {
        createShoppingBag(
            x + (Math.random() - 0.5) * 22,
            3 + Math.random() * 2.5,
            z + (Math.random() - 0.5) * 10,
            i
        );
    }
    
    // String lights between shops
    createStringLights(x, 4.5, z);
    
    // Ambient shopping street light
    for (let i = -12; i <= 12; i += 6) {
        const light = new THREE.PointLight(0xfff5e6, 0.4, 12);
        light.position.set(x + i, 5, z);
        scene.add(light);
    }
}

function createShop(x, z, color) {
    const group = new THREE.Group();
    
    // Building
    const building = new THREE.Mesh(
        new THREE.BoxGeometry(4.5, 4.5, 3),
        new THREE.MeshStandardMaterial({ color: color })
    );
    building.position.y = 2.25;
    building.castShadow = true;
    group.add(building);
    
    // Awning
    const awning = new THREE.Mesh(
        new THREE.BoxGeometry(5, 0.15, 1.4),
        new THREE.MeshStandardMaterial({ color: 0xffffff })
    );
    awning.position.set(0, 4, z > 0 ? -1.5 : 1.5);
    awning.rotation.x = z > 0 ? -0.2 : 0.2;
    group.add(awning);
    
    // Door
    const door = new THREE.Mesh(
        new THREE.BoxGeometry(1.2, 2.2, 0.12),
        new THREE.MeshStandardMaterial({ color: 0x8b4513 })
    );
    door.position.set(0, 1.1, z > 0 ? -1.55 : 1.55);
    group.add(door);
    
    // Window
    const window1 = new THREE.Mesh(
        new THREE.BoxGeometry(1, 1.2, 0.1),
        new THREE.MeshStandardMaterial({ 
            color: 0x87ceeb, 
            transparent: true, 
            opacity: 0.6 
        })
    );
    window1.position.set(1.3, 2.8, z > 0 ? -1.55 : 1.55);
    group.add(window1);
    
    const window2 = window1.clone();
    window2.position.x = -1.3;
    group.add(window2);
    
    group.position.set(x, 0, z);
    scene.add(group);
}

function createShoppingBag(x, y, z, i) {
    const colors = [0xff69b4, 0xffd700, 0x87ceeb, 0x98fb98, 0xff6b6b, 0xdda0dd];
    const group = new THREE.Group();
    
    const bag = new THREE.Mesh(
        new THREE.BoxGeometry(0.55, 0.7, 0.3),
        new THREE.MeshStandardMaterial({ color: colors[i % colors.length] })
    );
    group.add(bag);
    
    const handle = new THREE.Mesh(
        new THREE.TorusGeometry(0.18, 0.025, 8, 16, Math.PI),
        new THREE.MeshStandardMaterial({ color: 0x333333 })
    );
    handle.position.y = 0.35;
    handle.rotation.z = Math.PI;
    group.add(handle);
    
    group.position.set(x, y, z);
    group.userData = { baseY: y, offset: Math.random() * Math.PI * 2 };
    animatedObjects.push({ obj: group, type: 'float' });
    scene.add(group);
}

function createStringLights(x, y, z) {
    const wireGeo = new THREE.BufferGeometry();
    const points = [];
    const bulbPositions = [];
    
    for (let i = -12; i <= 12; i += 0.5) {
        const py = y + Math.sin(i * 0.3) * 0.5;
        points.push(new THREE.Vector3(x + i, py, z));
        if (i % 2 === 0) {
            bulbPositions.push({ x: x + i, y: py - 0.3, z: z });
        }
    }
    
    wireGeo.setFromPoints(points);
    const wire = new THREE.Line(
        wireGeo,
        new THREE.LineBasicMaterial({ color: 0x333333 })
    );
    scene.add(wire);
    
    // Bulbs
    const bulbColors = [0xffd700, 0xff69b4, 0x00ffff, 0xff6600, 0x00ff00];
    bulbPositions.forEach((pos, i) => {
        const bulb = new THREE.Mesh(
            new THREE.SphereGeometry(0.12, 8, 8),
            new THREE.MeshBasicMaterial({ color: bulbColors[i % bulbColors.length] })
        );
        bulb.position.set(pos.x, pos.y, pos.z);
        bulb.userData = { twinkleOffset: i * 0.3 };
        animatedObjects.push({ obj: bulb, type: 'bulb' });
        scene.add(bulb);
    });
}

function buildFoodCorner(x, z) {
    // Cute cafe table
    const tableTop = new THREE.Mesh(
        new THREE.CylinderGeometry(1.3, 1.3, 0.1, 32),
        new THREE.MeshStandardMaterial({ color: 0xffffff })
    );
    tableTop.position.set(x, 0.95, z);
    tableTop.castShadow = true;
    scene.add(tableTop);
    
    const tableLeg = new THREE.Mesh(
        new THREE.CylinderGeometry(0.1, 0.15, 0.95, 8),
        new THREE.MeshStandardMaterial({ color: 0x333333 })
    );
    tableLeg.position.set(x, 0.48, z);
    scene.add(tableLeg);
    
    // Red sauce pasta dish
    createPastaDish(x, z);
    
    // Cafe chairs
    createCafeChair(x, z + 1.5);
    createCafeChair(x + 1.3, z - 0.8);
    createCafeChair(x - 1.3, z - 0.8);
    
    // Potted plants for ambiance
    createPotPlant(x + 4, z);
    createPotPlant(x - 4, z);
    createPotPlant(x, z - 4);
    
    // Menu board
    createSign(x + 5, 2, z - 2, '🍝 PASTA');
    
    // Warm cafe light
    const light = new THREE.PointLight(0xffcc88, 1, 16);
    light.position.set(x, 6, z);
    scene.add(light);
}

function createPastaDish(x, z) {
    const group = new THREE.Group();
    
    // Plate
    const plate = new THREE.Mesh(
        new THREE.CylinderGeometry(0.45, 0.4, 0.06, 32),
        new THREE.MeshStandardMaterial({ color: 0xffffff })
    );
    plate.position.y = 1.03;
    group.add(plate);
    
    // Pasta
    const pasta = new THREE.Mesh(
        new THREE.SphereGeometry(0.32, 16, 16),
        new THREE.MeshStandardMaterial({ color: 0xffd700 })
    );
    pasta.position.y = 1.15;
    pasta.scale.y = 0.45;
    group.add(pasta);
    
    // Red sauce on top
    const sauce = new THREE.Mesh(
        new THREE.SphereGeometry(0.25, 16, 16),
        new THREE.MeshStandardMaterial({ color: 0xff3300 })
    );
    sauce.position.y = 1.2;
    sauce.scale.set(1.3, 0.25, 1.3);
    group.add(sauce);
    
    // Basil leaf
    const basil = new THREE.Mesh(
        new THREE.SphereGeometry(0.06, 8, 8),
        new THREE.MeshStandardMaterial({ color: 0x228b22 })
    );
    basil.position.set(0.1, 1.25, 0.05);
    basil.scale.set(1.5, 0.3, 1);
    group.add(basil);
    
    group.position.set(x, 0, z);
    scene.add(group);
}

function createCafeChair(x, z) {
    const group = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.6 });
    
    // Seat
    const seat = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.06, 16), mat);
    seat.position.y = 0.55;
    group.add(seat);
    
    // Legs
    for (let i = 0; i < 4; i++) {
        const angle = (i / 4) * Math.PI * 2;
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.55, 8), mat);
        leg.position.set(Math.cos(angle) * 0.28, 0.275, Math.sin(angle) * 0.28);
        group.add(leg);
    }
    
    group.position.set(x, 0, z);
    scene.add(group);
}

function createPotPlant(x, z) {
    const group = new THREE.Group();
    
    // Pot
    const pot = new THREE.Mesh(
        new THREE.CylinderGeometry(0.4, 0.3, 0.55, 16),
        new THREE.MeshStandardMaterial({ color: 0xcd853f })
    );
    pot.position.y = 0.28;
    group.add(pot);
    
    // Plant leaves
    for (let i = 0; i < 6; i++) {
        const leaf = new THREE.Mesh(
            new THREE.SphereGeometry(0.28, 8, 8),
            new THREE.MeshStandardMaterial({ color: 0x228b22 })
        );
        const angle = (i / 6) * Math.PI * 2;
        leaf.position.set(Math.cos(angle) * 0.2, 0.8 + Math.random() * 0.3, Math.sin(angle) * 0.2);
        leaf.scale.set(1, 1.6, 0.5);
        leaf.rotation.z = (Math.random() - 0.5) * 0.4;
        group.add(leaf);
    }
    
    group.position.set(x, 0, z);
    scene.add(group);
}

function buildDreamCloud(x, z) {
    // Floating dream clouds
    for (let i = 0; i < 10; i++) {
        createDreamCloudPuff(x, z, i);
    }
    
    // Cozy bed
    createBed(x, z);
    
    // Twinkling stars
    for (let i = 0; i < 20; i++) {
        createStar(
            x + (Math.random() - 0.5) * 28,
            6 + Math.random() * 10,
            z + (Math.random() - 0.5) * 28,
            i
        );
    }
    
    // ZZZ letters
    createZZZ(x + 3, 3.5, z - 2);
    
    // Soft dreamy light
    const light = new THREE.PointLight(0xe6e6fa, 0.8, 22);
    light.position.set(x, 10, z);
    scene.add(light);
    
    const moonLight = new THREE.PointLight(0xffffcc, 0.5, 18);
    moonLight.position.set(x + 8, 12, z - 8);
    scene.add(moonLight);
}

function createDreamCloudPuff(cx, cz, i) {
    const group = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ 
        color: 0xffffff, 
        transparent: true, 
        opacity: 0.9 
    });
    
    const puffCount = 3 + Math.floor(Math.random() * 2);
    for (let j = 0; j < puffCount; j++) {
        const puff = new THREE.Mesh(
            new THREE.SphereGeometry(1.2 + Math.random() * 0.6, 12, 12),
            mat
        );
        puff.position.set((j - 1) * 1.2, Math.random() * 0.3, Math.random() * 0.4);
        group.add(puff);
    }
    
    const angle = (i / 10) * Math.PI * 2;
    const radius = 5 + Math.random() * 5;
    group.position.set(
        cx + Math.cos(angle) * radius,
        3 + Math.random() * 4,
        cz + Math.sin(angle) * radius
    );
    group.userData = { baseY: group.position.y, offset: Math.random() * Math.PI * 2 };
    animatedObjects.push({ obj: group, type: 'dreamCloud' });
    scene.add(group);
}

function createBed(x, z) {
    const group = new THREE.Group();
    
    // Bed frame
    const frame = new THREE.Mesh(
        new THREE.BoxGeometry(3.2, 0.4, 4),
        new THREE.MeshStandardMaterial({ color: 0xdeb887 })
    );
    frame.position.y = 0.2;
    group.add(frame);
    
    // Mattress
    const mattress = new THREE.Mesh(
        new THREE.BoxGeometry(3, 0.5, 3.8),
        new THREE.MeshStandardMaterial({ color: 0xffc0cb })
    );
    mattress.position.y = 0.65;
    group.add(mattress);
    
    // Pillow
    const pillow = new THREE.Mesh(
        new THREE.BoxGeometry(2, 0.35, 0.8),
        new THREE.MeshStandardMaterial({ color: 0xffffff })
    );
    pillow.position.set(0, 1, -1.4);
    group.add(pillow);
    
    // Blanket
    const blanket = new THREE.Mesh(
        new THREE.BoxGeometry(2.9, 0.18, 2.5),
        new THREE.MeshStandardMaterial({ color: 0xe6e6fa })
    );
    blanket.position.set(0, 0.95, 0.5);
    group.add(blanket);
    
    // Headboard
    const headboard = new THREE.Mesh(
        new THREE.BoxGeometry(3.2, 1.5, 0.15),
        new THREE.MeshStandardMaterial({ color: 0xdeb887 })
    );
    headboard.position.set(0, 1.15, -2);
    group.add(headboard);
    
    group.position.set(x, 0, z);
    scene.add(group);
}

function createZZZ(x, y, z) {
    const group = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ 
        color: 0x9370db, 
        emissive: 0x9370db, 
        emissiveIntensity: 0.4 
    });
    
    for (let i = 0; i < 3; i++) {
        const zLetter = new THREE.Mesh(
            new THREE.BoxGeometry(0.45 - i * 0.1, 0.08, 0.08),
            mat
        );
        zLetter.position.set(i * 0.55, i * 0.7, 0);
        group.add(zLetter);
    }
    
    group.position.set(x, y, z);
    group.userData = { baseY: y, offset: 0 };
    animatedObjects.push({ obj: group, type: 'zzz' });
    scene.add(group);
}

function createStar(x, y, z, i) {
    const star = new THREE.Mesh(
        new THREE.SphereGeometry(0.1 + Math.random() * 0.08, 8, 8),
        new THREE.MeshBasicMaterial({ color: 0xfffacd })
    );
    star.position.set(x, y, z);
    star.userData = { twinkleOffset: i * 0.4 };
    animatedObjects.push({ obj: star, type: 'star' });
    scene.add(star);
}

function buildVictoryFlag(x, z) {
    victoryFlagGroup = new THREE.Group();
    victoryFlagGroup.position.set(x, 0, z);
    
    // Base platform (circular stone)
    const base = new THREE.Mesh(
        new THREE.CylinderGeometry(3, 3.5, 0.5, 32),
        new THREE.MeshStandardMaterial({ 
            color: 0x808080, 
            roughness: 0.8
        })
    );
    base.position.y = 0.25;
    victoryFlagGroup.add(base);
    
    // Flag pole
    const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.15, 0.2, 12, 16),
        new THREE.MeshStandardMaterial({ 
            color: 0x8B4513, 
            roughness: 0.6,
            metalness: 0.1
        })
    );
    pole.position.y = 6;
    victoryFlagGroup.add(pole);
    
    // Pole top ornament
    const topBall = new THREE.Mesh(
        new THREE.SphereGeometry(0.35, 16, 16),
        new THREE.MeshStandardMaterial({ 
            color: 0xffd700, 
            metalness: 0.8,
            roughness: 0.2
        })
    );
    topBall.position.y = 12.2;
    victoryFlagGroup.add(topBall);
    
    // Flag fabric (starts gray, turns golden when active)
    const flagGeometry = new THREE.PlaneGeometry(4, 2.5, 8, 5);
    const flagMaterial = new THREE.MeshStandardMaterial({ 
        color: 0x666666,
        side: THREE.DoubleSide,
        roughness: 0.7
    });
    const flag = new THREE.Mesh(flagGeometry, flagMaterial);
    flag.position.set(2.2, 10.5, 0);
    flag.userData.isFlag = true;
    victoryFlagGroup.add(flag);
    animatedObjects.push({ obj: flag, type: 'victoryFlag' });
    
    // Heart symbol on flag (hidden until active)
    const heartOnFlag = createFlagHeart();
    heartOnFlag.position.set(2.2, 10.5, 0.05);
    heartOnFlag.scale.set(0.8, 0.8, 0.8);
    heartOnFlag.visible = false;
    heartOnFlag.userData.isHeartSymbol = true;
    victoryFlagGroup.add(heartOnFlag);
    
    // Inactive indicator text
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#333';
    ctx.fillRect(0, 0, 256, 64);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 20px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('Explore all zones first!', 128, 40);
    
    const signTexture = new THREE.CanvasTexture(canvas);
    const sign = new THREE.Mesh(
        new THREE.PlaneGeometry(3, 0.8),
        new THREE.MeshBasicMaterial({ map: signTexture, transparent: true })
    );
    sign.position.set(0, 2, 1.5);
    sign.userData.isInactiveSign = true;
    victoryFlagGroup.add(sign);
    
    // Glow light (hidden until active)
    const flagLight = new THREE.PointLight(0xffd700, 0, 20);
    flagLight.position.set(x, 10, z);
    flagLight.userData.isFlagLight = true;
    scene.add(flagLight);
    victoryFlagGroup.userData.light = flagLight;
    
    scene.add(victoryFlagGroup);
}

function createFlagHeart() {
    const group = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ 
        color: 0xff1493, 
        emissive: 0xff69b4, 
        emissiveIntensity: 0.5 
    });
    
    const left = new THREE.Mesh(new THREE.SphereGeometry(0.4, 16, 16), mat);
    left.position.set(-0.3, 0.25, 0);
    group.add(left);
    
    const right = new THREE.Mesh(new THREE.SphereGeometry(0.4, 16, 16), mat);
    right.position.set(0.3, 0.25, 0);
    group.add(right);
    
    const bottom = new THREE.Mesh(
        new THREE.ConeGeometry(0.55, 0.8, 16),
        mat
    );
    bottom.rotation.z = Math.PI;
    bottom.position.y = -0.2;
    group.add(bottom);
    
    return group;
}

function activateVictoryFlag() {
    if (!victoryFlagGroup || victoryFlagActive) return;
    victoryFlagActive = true;
    
    // Find and update flag components
    victoryFlagGroup.traverse(child => {
        if (child.userData.isFlag && child.material) {
            // Change flag color to golden/pink gradient
            child.material.color.setHex(0xff69b4);
            child.material.emissive = new THREE.Color(0xff1493);
            child.material.emissiveIntensity = 0.4;
        }
        if (child.userData.isHeartSymbol) {
            child.visible = true;
        }
        if (child.userData.isInactiveSign) {
            child.visible = false;
        }
    });
    
    // Activate glow light
    if (victoryFlagGroup.userData.light) {
        victoryFlagGroup.userData.light.intensity = 2;
    }
    
    // Show notification
    showPopup('🏁 The Victory Flag is now ACTIVE! Go claim your prize! 🎉');
    showZoneAlert('Victory Flag Activated!');
}

function createHeart(x, y, z) {
    const group = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ 
        color: 0xff1493, 
        emissive: 0xff69b4, 
        emissiveIntensity: 0.6 
    });
    
    // Heart made of spheres and cone
    const left = new THREE.Mesh(new THREE.SphereGeometry(0.55, 16, 16), mat);
    left.position.set(-0.4, 0.35, 0);
    group.add(left);
    
    const right = new THREE.Mesh(new THREE.SphereGeometry(0.55, 16, 16), mat);
    right.position.set(0.4, 0.35, 0);
    group.add(right);
    
    const bottom = new THREE.Mesh(new THREE.ConeGeometry(0.8, 1.2, 16), mat);
    bottom.position.y = -0.35;
    bottom.rotation.x = Math.PI;
    group.add(bottom);
    
    group.position.set(x, y, z);
    animatedObjects.push({ obj: group, type: 'heart' });
    scene.add(group);
}

function createSparkle(cx, cz, i) {
    const sparkle = new THREE.Mesh(
        new THREE.SphereGeometry(0.08, 8, 8),
        new THREE.MeshBasicMaterial({ color: 0xffd700 })
    );
    
    const angle = (i / 15) * Math.PI * 2;
    const radius = 3.5 + Math.random() * 2;
    sparkle.position.set(
        cx + Math.cos(angle) * radius,
        2 + Math.random() * 5,
        cz + Math.sin(angle) * radius
    );
    sparkle.userData = { 
        centerX: cx, 
        centerZ: cz, 
        radius: radius,
        angleOffset: angle,
        baseY: sparkle.position.y,
        speed: 0.5 + Math.random() * 0.5
    };
    animatedObjects.push({ obj: sparkle, type: 'sparkle' });
    scene.add(sparkle);
}

// ============================================
// AMBIENT PARTICLES
// ============================================
function createAmbientParticles() {
    // Skip particles entirely on low performance mode
    if (lowPerformance) return;
    
    const geometry = new THREE.BufferGeometry();
    const count = 100; // Reduced from 200
    const positions = new Float32Array(count * 3);
    
    for (let i = 0; i < count; i++) {
        positions[i * 3] = (Math.random() - 0.5) * 200;
        positions[i * 3 + 1] = Math.random() * 50;
        positions[i * 3 + 2] = (Math.random() - 0.5) * 200;
    }
    
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    
    const particles = new THREE.Points(
        geometry,
        new THREE.PointsMaterial({ 
            color: 0xffffff, 
            size: 0.35, 
            transparent: true, 
            opacity: 0.5 
        })
    );
    animatedObjects.push({ obj: particles, type: 'ambient' });
    scene.add(particles);
}

// ============================================
// PLAYER
// ============================================
function createPlayer() {
    playerGroup = new THREE.Group();
    
    // Body (blue shirt)
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x4a90d9 });
    const body = makeCapsuleGroup(0.5, 1.3, bodyMat);
    body.position.y = 1.15;
    playerGroup.add(body);
    
    // Head
    const head = new THREE.Mesh(
        new THREE.SphereGeometry(0.45, 16, 16),
        new THREE.MeshStandardMaterial({ color: 0xffdbac })
    );
    head.position.y = 2.35;
    head.castShadow = true;
    playerGroup.add(head);
    
    // Hair
    const hair = new THREE.Mesh(
        new THREE.SphereGeometry(0.48, 16, 16, 0, Math.PI * 2, 0, Math.PI / 2),
        new THREE.MeshStandardMaterial({ color: 0x2c1810 })
    );
    hair.position.y = 2.45;
    playerGroup.add(hair);
    
    // Eyes
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0x2c1810 });
    const leftEye = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 8), eyeMat);
    leftEye.position.set(-0.16, 2.4, 0.38);
    playerGroup.add(leftEye);
    
    const rightEye = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 8), eyeMat);
    rightEye.position.set(0.16, 2.4, 0.38);
    playerGroup.add(rightEye);
    
    // Smile
    const smile = new THREE.Mesh(
        new THREE.TorusGeometry(0.14, 0.025, 8, 16, Math.PI),
        new THREE.MeshStandardMaterial({ color: 0xcc6666 })
    );
    smile.position.set(0, 2.15, 0.4);
    smile.rotation.x = Math.PI;
    playerGroup.add(smile);
    
    // Name tag above head
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
    ctx.beginPath();
    if (typeof ctx.roundRect === 'function') {
        ctx.roundRect(0, 0, 256, 64, 16);
    } else {
        roundedRectPath(ctx, 0, 0, 256, 64, 16);
    }
    ctx.fill();
    ctx.fillStyle = '#c44569';
    ctx.font = 'bold 30px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('Aayush', 128, 44);
    
    const texture = new THREE.CanvasTexture(canvas);
    const nameMat = new THREE.SpriteMaterial({ map: texture });
    const nameTag = new THREE.Sprite(nameMat);
    nameTag.position.y = 3.2;
    nameTag.scale.set(2.8, 0.7, 1);
    playerGroup.add(nameTag);
    
    // Initialize player state
    player = {
        group: playerGroup,
        position: new THREE.Vector3(0, 0, 15),
        velocity: new THREE.Vector3(),
        rotation: 0
    };
    
    playerGroup.position.copy(player.position);
}

// ============================================
// CONTROLS
// ============================================
function setupControls() {
    // Keyboard controls
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    
    // Mouse controls
    const canvas = document.getElementById('game-canvas');
    const overlay = document.getElementById('click-overlay');

    function requestMouseLock() {
        if (!isGameRunning || isPointerLocked) return;
        try {
            canvas.requestPointerLock();
        } catch (e) {
            // ignore
        }
    }
    
    canvas.addEventListener('click', () => {
        requestMouseLock();
    });

    // Overlay can cover the canvas; allow it to request pointer lock too.
    if (overlay) {
        overlay.addEventListener('click', (e) => {
            e.preventDefault();
            requestMouseLock();
        });
    }

    // Fallback: any click can request lock.
    document.addEventListener('click', () => {
        requestMouseLock();
    });
    
    document.addEventListener('pointerlockchange', () => {
        const canvas = document.getElementById('game-canvas');
        isPointerLocked = document.pointerLockElement === canvas;
        
        // Show/hide click overlay
        const overlay = document.getElementById('click-overlay');
        if (isGameRunning && !isPointerLocked) {
            overlay.classList.remove('hidden');
        } else {
            overlay.classList.add('hidden');
        }
    });

    document.addEventListener('pointerlockerror', () => {
        // Keep overlay visible; user can click again.
        const overlay = document.getElementById('click-overlay');
        if (overlay) overlay.classList.remove('hidden');
    });
    
    document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mousedown', handleMouseDown);
    
    // Window resize
    window.addEventListener('resize', handleResize);
    
    // Setup mobile controls
    setupMobileControls();
}

// ============================================
// MOBILE CONTROLS
// ============================================
function setupMobileControls() {
    // Detect mobile device
    isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) 
        || (navigator.maxTouchPoints > 0 && window.matchMedia('(hover: none)').matches);
    
    if (!isMobile) return;
    
    console.log('📱 Mobile device detected, enabling touch controls');
    
    const mobileControls = document.getElementById('mobile-controls');
    const joystickZone = document.getElementById('joystick-zone');
    const joystickBase = document.getElementById('joystick-base');
    const joystickThumb = document.getElementById('joystick-thumb');
    const lookZone = document.getElementById('look-zone');
    const interactBtn = document.getElementById('mobile-interact');
    const mapBtn = document.getElementById('mobile-map');
    
    if (!mobileControls) return;
    
    // Joystick touch handling
    let joystickTouchId = null;
    const joystickCenter = { x: 60, y: 60 }; // Center of base
    const maxDist = 35;
    
    joystickZone.addEventListener('touchstart', (e) => {
        e.preventDefault();
        if (joystickTouchId !== null) return;
        
        const touch = e.changedTouches[0];
        joystickTouchId = touch.identifier;
        joystickActive = true;
        joystickThumb.classList.add('active');
        updateJoystick(touch);
    }, { passive: false });
    
    joystickZone.addEventListener('touchmove', (e) => {
        e.preventDefault();
        for (const touch of e.changedTouches) {
            if (touch.identifier === joystickTouchId) {
                updateJoystick(touch);
                break;
            }
        }
    }, { passive: false });
    
    joystickZone.addEventListener('touchend', (e) => {
        for (const touch of e.changedTouches) {
            if (touch.identifier === joystickTouchId) {
                joystickTouchId = null;
                joystickActive = false;
                joystickData.x = 0;
                joystickData.y = 0;
                joystickThumb.classList.remove('active');
                joystickThumb.style.transform = 'translate(-50%, -50%)';
                break;
            }
        }
    });
    
    joystickZone.addEventListener('touchcancel', () => {
        joystickTouchId = null;
        joystickActive = false;
        joystickData.x = 0;
        joystickData.y = 0;
        joystickThumb.classList.remove('active');
        joystickThumb.style.transform = 'translate(-50%, -50%)';
    });
    
    function updateJoystick(touch) {
        const rect = joystickBase.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        
        let dx = touch.clientX - cx;
        let dy = touch.clientY - cy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        if (dist > maxDist) {
            dx = (dx / dist) * maxDist;
            dy = (dy / dist) * maxDist;
        }
        
        joystickThumb.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
        
        // Normalize to -1 to 1
        joystickData.x = dx / maxDist;
        joystickData.y = dy / maxDist;
    }
    
    // Look zone touch handling
    lookZone.addEventListener('touchstart', (e) => {
        e.preventDefault();
        if (lookTouchId !== null) return;
        
        const touch = e.changedTouches[0];
        lookTouchId = touch.identifier;
        lookLastPos.x = touch.clientX;
        lookLastPos.y = touch.clientY;
    }, { passive: false });
    
    lookZone.addEventListener('touchmove', (e) => {
        e.preventDefault();
        for (const touch of e.changedTouches) {
            if (touch.identifier === lookTouchId) {
                const dx = touch.clientX - lookLastPos.x;
                const dy = touch.clientY - lookLastPos.y;
                
                cameraYaw -= dx * 0.004;
                cameraPitch -= dy * 0.003;
                cameraPitch = Math.max(-0.6, Math.min(1.0, cameraPitch));
                
                lookLastPos.x = touch.clientX;
                lookLastPos.y = touch.clientY;
                break;
            }
        }
    }, { passive: false });
    
    lookZone.addEventListener('touchend', (e) => {
        for (const touch of e.changedTouches) {
            if (touch.identifier === lookTouchId) {
                lookTouchId = null;
                break;
            }
        }
    });
    
    lookZone.addEventListener('touchcancel', () => {
        lookTouchId = null;
    });
    
    // Action buttons
    interactBtn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        if (challengeState && challengeState.type === 'rhythm') {
            rhythmHit();
        } else {
            handleInteraction();
        }
    }, { passive: false });
    
    mapBtn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        toggleMiniMap();
    }, { passive: false });
    
    // Prevent default touch behaviors on game canvas
    const canvas = document.getElementById('game-canvas');
    canvas.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });
    canvas.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
}

function handleKeyDown(e) {
    if (!isGameRunning) return;
    
    const key = e.key.toLowerCase();
    const code = e.code;
    
    // Movement
    if (code === 'KeyW' || code === 'ArrowUp' || key === 'w') {
        keys.forward = true;
        e.preventDefault();
    }
    if (code === 'KeyS' || code === 'ArrowDown' || key === 's') {
        keys.backward = true;
        e.preventDefault();
    }
    if (code === 'KeyA' || code === 'ArrowLeft' || key === 'a') {
        keys.left = true;
        e.preventDefault();
    }
    if (code === 'KeyD' || code === 'ArrowRight' || key === 'd') {
        keys.right = true;
        e.preventDefault();
    }
    
    // Actions
    if (code === 'Space' || key === ' ') {
        if (challengeState && challengeState.type === 'rhythm') {
            rhythmHit();
        } else {
            handleInteraction();
        }
        e.preventDefault();
    }
    if (code === 'KeyI' || key === 'i') {
        toggleStats();
        e.preventDefault();
    }
    if (code === 'KeyM' || key === 'm') {
        toggleMiniMap();
        e.preventDefault();
    }
    if (code === 'Escape') {
        hideStats();
        hideAllChallengeOverlays();
        document.exitPointerLock();
    }
}

function handleMouseDown() {
    if (!isGameRunning) return;
    if (!challengeState || challengeState.type !== 'alarms') return;

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
    const hits = raycaster.intersectObjects(challengeClickables, true);
    if (!hits.length) return;

    const obj = hits[0].object;
    const root = (obj.userData && obj.userData.root) ? obj.userData.root : obj;
    if (!root.userData || root.userData.kind !== 'alarm') return;

    scene.remove(root);
    challengeClickables = challengeClickables.filter(o => o !== root);
    challengeState.remaining = Math.max(0, (challengeState.remaining || 0) - 1);
    challengeState.cleared = (challengeState.goal || 0) - challengeState.remaining;
    playSound(520, 0.12, 0.12);
    updateProgress();

    if (challengeState.remaining <= 0) {
        completeActiveStallChallenge('Sleep is sacred here.');
    }
}

function handleKeyUp(e) {
    const key = e.key.toLowerCase();
    const code = e.code;
    
    if (code === 'KeyW' || code === 'ArrowUp' || key === 'w') keys.forward = false;
    if (code === 'KeyS' || code === 'ArrowDown' || key === 's') keys.backward = false;
    if (code === 'KeyA' || code === 'ArrowLeft' || key === 'a') keys.left = false;
    if (code === 'KeyD' || code === 'ArrowRight' || key === 'd') keys.right = false;
}

function handleMouseMove(e) {
    if (!isPointerLocked || !isGameRunning) return;
    
    cameraYaw -= e.movementX * 0.003;
    cameraPitch -= e.movementY * 0.003;
    cameraPitch = Math.max(-0.6, Math.min(1.0, cameraPitch));
}

function handleResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// ============================================
// UI
// ============================================
function setupUI() {
    document.getElementById('start-button').addEventListener('click', startGame);
    document.getElementById('close-stats').addEventListener('click', hideStats);

    const continueBtn = document.getElementById('continue-button');
    if (continueBtn) {
        continueBtn.addEventListener('click', () => {
            showPopup('Go complete the mission in real life.');
        });
    }

    const challengeClose = document.getElementById('challenge-close');
    if (challengeClose) {
        challengeClose.addEventListener('click', () => {
            const overlay = document.getElementById('challenge-overlay');
            if (overlay) overlay.classList.add('hidden');
        });
    }

    if (typeof setupSketchUI === 'function') {
        setupSketchUI();
    }
}

function startGame() {
    console.log('🎮 Starting game!');
    isGameRunning = true;
    
    document.getElementById('start-screen').style.display = 'none';
    document.getElementById('hud').classList.remove('hidden');
    
    // Mobile: show touch controls, Desktop: show click overlay and request pointer lock
    if (isMobile) {
        document.getElementById('mobile-controls').classList.remove('hidden');
        document.getElementById('click-overlay').classList.add('hidden');
    } else {
        document.getElementById('click-overlay').classList.remove('hidden');
        // Auto-request pointer lock after small delay
        setTimeout(() => {
            const canvas = document.getElementById('game-canvas');
            canvas.requestPointerLock();
        }, 200);
    }
    
    playSound(440, 0.15, 0.2);
}

function restartGame() {
    // Reset game state
    visitedZones.clear();
    mainWorldVisitedZones.clear();
    currentZone = null;
    loadLevel(1);
    player.position.set(0, 0, 15);
    playerGroup.position.copy(player.position);
    cameraYaw = 0;
    cameraPitch = 0.3;
    
    // Reset UI
    document.getElementById('final-message').classList.add('hidden');
    document.getElementById('hud').classList.remove('hidden');
    document.getElementById('zones-discovered').textContent = '0';
    document.getElementById('progress-fill').style.width = '0%';
    document.getElementById('current-zone').textContent = "Shubhanshi's World";
    
    // Request pointer lock
    setTimeout(() => {
        document.getElementById('game-canvas').requestPointerLock();
    }, 200);
}

function toggleStats() {
    const panel = document.getElementById('stat-panel');
    panel.classList.toggle('hidden');
    if (!panel.classList.contains('hidden')) {
        playSound(660, 0.1, 0.15);
    }
}

function hideStats() {
    document.getElementById('stat-panel').classList.add('hidden');
}

function toggleMiniMap() {
    const map = document.getElementById('mini-map');
    showMiniMap = !showMiniMap;
    if (showMiniMap) {
        map.classList.remove('hidden');
        updateMiniMap();
    } else {
        map.classList.add('hidden');
    }
}

function showPopup(message) {
    const popup = document.getElementById('popup-container');
    document.getElementById('popup-text').textContent = message;
    popup.classList.remove('hidden');
    
    playChime();
    
    setTimeout(() => popup.classList.add('hidden'), 4500);
}

function showZoneAlert(zoneName) {
    const alert = document.getElementById('zone-alert');
    const suffix = zoneName && (zoneName.includes('!') || zoneName.includes('(') || zoneName.includes('Frozen') || zoneName.includes('HIT'))
        ? ''
        : ' Discovered!';
    document.getElementById('alert-text').textContent = zoneName + suffix;
    alert.classList.remove('hidden');
    
    setTimeout(() => alert.classList.add('hidden'), 2500);
}

function showFinalMessage() {
    if (finalMessageShown) return;
    finalMessageShown = true;
    
    document.getElementById('hud').classList.add('hidden');
    document.getElementById('popup-container').classList.add('hidden');
    document.getElementById('mini-map').classList.add('hidden');
    document.getElementById('final-message').classList.remove('hidden');
    document.exitPointerLock();
    
    playFinalChime();
}

function handleInteraction() {
    if (currentInteractable) {
        if (typeof currentInteractable.onInteract === 'function') {
            currentInteractable.onInteract();
            return;
        } else {
            showPopup('☕ Chai mode activated! +100 mood boost! 🌟');
            playChime();

            // Update status
            document.getElementById('player-status').textContent = 'Enjoying chai ☕';
        }
    }
}

function updateProgress() {
    const totalEl = document.getElementById('zones-total');
    if (totalEl) totalEl.textContent = String(totalZones);

    if (challengeState && (currentLevelIndex === 2 || currentLevelIndex === 3)) {
        document.getElementById('zones-discovered').textContent = String(challengeState.dodges);
        document.getElementById('progress-fill').style.width = (Math.min(1, challengeState.dodges / totalZones) * 100) + '%';
        return;
    }

    if (challengeState && currentLevelIndex >= 4) {
        let done = 0;
        if (challengeState.type === 'collect') done = challengeState.collected || 0;
        else if (challengeState.type === 'rhythm') done = challengeState.score || 0;
        else if (challengeState.type === 'alarms') done = challengeState.cleared || 0;
        else done = 0;
        document.getElementById('zones-discovered').textContent = String(done);
        document.getElementById('progress-fill').style.width = (Math.min(1, done / totalZones) * 100) + '%';
        return;
    }

    // Count only non-final zones (exploration zones)
    let discovered = 0;
    visitedZones.forEach(id => {
        const zone = zones.find(z => z.id === id);
        if (zone && !zone.isFinal) discovered++;
    });
    document.getElementById('zones-discovered').textContent = String(discovered);
    document.getElementById('progress-fill').style.width = (Math.min(1, discovered / totalZones) * 100) + '%';
}

function updateMiniMap() {
    if (!showMiniMap) return;
    
    const canvas = document.getElementById('map-canvas');
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    
    // Clear and draw background
    ctx.fillStyle = '#e8f5e9';
    ctx.fillRect(0, 0, w, h);
    
    // Draw zones
    zones.forEach(zone => {
        const mx = (zone.x / 100 + 0.5) * w;
        const my = (zone.z / 100 + 0.5) * h;
        
        ctx.beginPath();
        ctx.arc(mx, my, zone.radius * 0.8, 0, Math.PI * 2);
        
        const isVisited = visitedZones.has(zone.id);

        if (isVisited) {
            ctx.fillStyle = '#44bb44';
        } else if (zone.isFinal) {
            ctx.fillStyle = '#ffd700';
        } else {
            ctx.fillStyle = '#ffaa00';
        }
        ctx.fill();
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 1;
        ctx.stroke();
    });
    
    // Draw player
    const px = (player.position.x / 100 + 0.5) * w;
    const py = (player.position.z / 100 + 0.5) * h;
    
    ctx.fillStyle = '#ff4444';
    ctx.beginPath();
    ctx.arc(px, py, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.stroke();
    
    // Draw direction indicator
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px + Math.sin(cameraYaw) * 12, py + Math.cos(cameraYaw) * 12);
    ctx.strokeStyle = '#ff4444';
    ctx.lineWidth = 2;
    ctx.stroke();
}

// ============================================
// SOUND EFFECTS
// ============================================
function playSound(freq, vol, dur) {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(vol, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + dur);
        osc.start();
        osc.stop(ctx.currentTime + dur);
    } catch(e) {}
}

function playChime() {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        [523, 659, 784].forEach((freq, i) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.frequency.value = freq;
            const t = ctx.currentTime + i * 0.1;
            gain.gain.setValueAtTime(0.12, t);
            gain.gain.exponentialRampToValueAtTime(0.01, t + 0.35);
            osc.start(t);
            osc.stop(t + 0.35);
        });
    } catch(e) {}
}

function playFinalChime() {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        [392, 523, 659, 784, 1047].forEach((freq, i) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.frequency.value = freq;
            const t = ctx.currentTime + i * 0.15;
            gain.gain.setValueAtTime(0.15, t);
            gain.gain.exponentialRampToValueAtTime(0.01, t + 0.5);
            osc.start(t);
            osc.stop(t + 0.5);
        });
    } catch(e) {}
}

// ============================================
// GAME LOOP
// ============================================
function animate() {
    requestAnimationFrame(animate);
    
    const delta = clock.getDelta();
    const elapsed = clock.getElapsedTime();
    
    if (isGameRunning) {
        updatePlayer(delta);
        checkZones();
        updateMiniMap();
        updateChallenge(delta, elapsed);
        updateStallChallenges(delta);
    }
    
    updateAnimations(elapsed);
    updateCamera();
    
    renderer.render(scene, camera);
}

function updateChallenge(delta, t) {
    if (!challengeState || !challengeVillain) return;

    // Villain faces the player
    const dx = player.position.x - challengeVillain.position.x;
    const dz = player.position.z - challengeVillain.position.z;
    challengeVillain.rotation.y = Math.atan2(dx, dz);

    // Throw timing
    if (t >= challengeState.nextThrowAt) {
        challengeState.nextThrowAt = t + (challengeState.type === 'bottles' ? 0.85 : 0.95);
        challengeState.throws += 1;
        spawnProjectileTowardPlayer(challengeState.type);
    }

    // Update projectiles
    for (let i = challengeProjectiles.length - 1; i >= 0; i--) {
        const p = challengeProjectiles[i];
        p.mesh.position.addScaledVector(p.velocity, delta);

        // Rotate bottles a bit
        if (p.spin) {
            p.mesh.rotation.x += p.spin.x * delta;
            p.mesh.rotation.y += p.spin.y * delta;
            p.mesh.rotation.z += p.spin.z * delta;
        }

        // Collision with player
        const px = p.mesh.position.x - player.position.x;
        const pz = p.mesh.position.z - player.position.z;
        const dist = Math.sqrt(px * px + pz * pz);
        if (dist < 1.05) {
            scene.remove(p.mesh);
            challengeProjectiles.splice(i, 1);
            challengeState.hits += 1;
            challengeState.lastHitAt = t;
            showZoneAlert(`HIT! (${challengeState.hits}/3)`);
            playSound(160, 0.15, 0.12);

            if (challengeState.hits >= 3) {
                showPopup('You got hit too many times. Try again!');
                setTimeout(() => loadLevel(currentLevelIndex), 450);
                return;
            }
            continue;
        }

        // Out of arena bounds => counted as dodge
        const out =
            p.mesh.position.x < levelBounds.minX - 10 ||
            p.mesh.position.x > levelBounds.maxX + 10 ||
            p.mesh.position.z < levelBounds.minZ - 10 ||
            p.mesh.position.z > levelBounds.maxZ + 10;
        if (out) {
            scene.remove(p.mesh);
            challengeProjectiles.splice(i, 1);
            challengeState.dodges += 1;
            updateProgress();

            if (challengeState.dodges >= totalZones) {
                showPopup('Challenge complete! Returning to the main world...');
                playSound(880, 0.18, 0.2);
                setTimeout(() => leaveChallengeToMainWorld(), 650);
                return;
            }
        }
    }
}

function spawnProjectileTowardPlayer(type) {
    if (!challengeVillain) return;

    const start = new THREE.Vector3(
        challengeVillain.position.x,
        2.2,
        challengeVillain.position.z + 1.2
    );
    const target = new THREE.Vector3(player.position.x, player.position.y + FP_EYE_HEIGHT, player.position.z);
    const dir = target.clone().sub(start);
    dir.y = 0;
    if (dir.lengthSq() < 0.0001) dir.z = 1;
    dir.normalize();

    const speed = type === 'bottles' ? 24 : 20;
    const velocity = dir.multiplyScalar(speed);

    let mesh;
    if (type === 'bottles') {
        const bottleMat = new THREE.MeshStandardMaterial({
            color: 0x2db55d,
            roughness: 0.35,
            metalness: 0.15,
            emissive: 0x0a1a10,
            emissiveIntensity: 0.12
        });
        mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.24, 1.0, 10), bottleMat);
        mesh.position.copy(start);
        mesh.castShadow = true;
    } else {
        const curdMat = new THREE.MeshStandardMaterial({
            color: 0xf6fbff,
            roughness: 0.8,
            metalness: 0.05,
            emissive: 0x112233,
            emissiveIntensity: 0.05
        });
        mesh = new THREE.Mesh(new THREE.SphereGeometry(0.45, 14, 14), curdMat);
        mesh.position.copy(start);
        mesh.castShadow = true;
    }

    scene.add(mesh);
    challengeProjectiles.push({
        mesh,
        velocity,
        spin: type === 'bottles'
            ? { x: (Math.random() - 0.5) * 8, y: (Math.random() - 0.5) * 8, z: (Math.random() - 0.5) * 8 }
            : null
    });
}

// Check if player position collides with any building walls
function checkBuildingCollision(px, pz) {
    const playerRadius = 0.5;
    
    for (const b of buildingColliders) {
        // Transform player position into building's local coordinate system
        const dx = px - b.x;
        const dz = pz - b.z;
        const cos = Math.cos(b.faceAngle);
        const sin = Math.sin(b.faceAngle);
        // Correct inverse rotation: world to local
        const localX = dx * cos - dz * sin;
        const localZ = dx * sin + dz * cos;
        
        const halfW = (b.origW || 18) / 2;
        const halfD = (b.origD || 14) / 2;
        const doorHalfW = (b.doorW || 8) / 2;
        
        // First check: if in doorway zone, always allow (generous zone)
        // Door is at +Z side (front) of building in local coords
        if (Math.abs(localX) < doorHalfW && localZ > halfD - 5) {
            continue; // In or approaching doorway, allow
        }
        
        // Check if player is fully inside the building interior - allow
        if (Math.abs(localX) < halfW - 1 && Math.abs(localZ) < halfD - 1) {
            continue; // Inside building, allow free movement
        }
        
        // Now check wall collisions only if not in door or interior
        // Expanded bounding box check
        const margin = 0.8;
        if (Math.abs(localX) < halfW + margin && Math.abs(localZ) < halfD + margin) {
            // Near/touching walls - block unless in doorway (already checked above)
            // Only block if we're on a wall edge
            if (Math.abs(localX) > halfW - margin || 
                localZ < -halfD + margin || 
                (localZ > halfD - margin && Math.abs(localX) > doorHalfW)) {
                return true; // Hitting a wall
            }
        }
    }
    return false;
}

function updatePlayer(delta) {
    if (!player) return;
    
    // Calculate movement direction based on camera facing direction
    // When cameraYaw = 0, camera looks down -Z axis, so forward = -Z
    const forward = new THREE.Vector3(-Math.sin(cameraYaw), 0, -Math.cos(cameraYaw));
    // Right vector: forward × up gives the right direction
    const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0));
    
    const moveDir = new THREE.Vector3();
    
    // Keyboard input
    if (keys.forward) moveDir.add(forward);
    if (keys.backward) moveDir.sub(forward);
    if (keys.left) moveDir.sub(right);
    if (keys.right) moveDir.add(right);
    
    // Mobile joystick input (joystickData.y is inverted: negative = forward)
    if (isMobile && joystickActive) {
        moveDir.addScaledVector(forward, -joystickData.y);
        moveDir.addScaledVector(right, joystickData.x);
    }
    
    if (moveDir.length() > 0) {
        moveDir.normalize();
        
        // Calculate new position
        const newPos = player.position.clone();
        newPos.x += moveDir.x * MOVE_SPEED * delta;
        newPos.z += moveDir.z * MOVE_SPEED * delta;
        
        // Collision detection with buildings
        if (!checkBuildingCollision(newPos.x, newPos.z)) {
            player.position.copy(newPos);
        } else {
            // Try sliding along walls
            const slideX = player.position.clone();
            slideX.x += moveDir.x * MOVE_SPEED * delta;
            if (!checkBuildingCollision(slideX.x, slideX.z)) {
                player.position.x = slideX.x;
            }
            
            const slideZ = player.position.clone();
            slideZ.z += moveDir.z * MOVE_SPEED * delta;
            if (!checkBuildingCollision(slideZ.x, slideZ.z)) {
                player.position.z = slideZ.z;
            }
        }
        
        // In first-person, face the look direction
        player.rotation = FIRST_PERSON_VIEW ? cameraYaw : Math.atan2(moveDir.x, moveDir.z);
    }
    
    // World bounds
    player.position.x = Math.max(levelBounds.minX, Math.min(levelBounds.maxX, player.position.x));
    player.position.z = Math.max(levelBounds.minZ, Math.min(levelBounds.maxZ, player.position.z));
    
    // Update visual
    playerGroup.position.copy(player.position);
    playerGroup.rotation.y = player.rotation;
}

function updateCamera() {
    if (!player) return;

    if (FIRST_PERSON_VIEW) {
        // First-person: camera sits at player eye height and uses yaw/pitch directly.
        camera.position.set(player.position.x, player.position.y + FP_EYE_HEIGHT, player.position.z);
        camera.rotation.order = 'YXZ';
        camera.rotation.y = cameraYaw;
        camera.rotation.x = cameraPitch;
        // Hide the player mesh so we don't see inside it.
        if (playerGroup) playerGroup.visible = false;
        return;
    }

    // Third-person chase (kept for easy toggle)
    const targetX = player.position.x - Math.sin(cameraYaw) * CAMERA_DISTANCE * Math.cos(cameraPitch);
    const targetY = player.position.y + CAMERA_HEIGHT + Math.sin(cameraPitch) * CAMERA_DISTANCE;
    const targetZ = player.position.z - Math.cos(cameraYaw) * CAMERA_DISTANCE * Math.cos(cameraPitch);
    camera.position.lerp(new THREE.Vector3(targetX, targetY, targetZ), 0.1);
    camera.lookAt(player.position.x, player.position.y + 1.5, player.position.z);
}

function checkZones() {
    if (!player) return;
    
    let inZone = null;
    currentInteractable = null;
    
    for (const zone of zones) {
        const dx = player.position.x - zone.x;
        const dz = player.position.z - zone.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        
        if (dist < zone.radius) {
            inZone = zone;
            
            if (zone.interactable) {
                currentInteractable = zone;
                document.getElementById('interaction-prompt').classList.remove('hidden');
            }
            break;
        }
    }
    
    // Hide interaction prompt if not near interactable
    if (!currentInteractable) {
        document.getElementById('interaction-prompt').classList.add('hidden');
    }
    
    // Zone discovery logic
    if (inZone && inZone !== currentZone) {
        currentZone = inZone;
        document.getElementById('current-zone').textContent = inZone.name;
        
        if (!visitedZones.has(inZone.id)) {
            visitedZones.add(inZone.id);
            updateProgress();
            
            if (inZone.isFinal) {
                // At the Victory Flag
                if (victoryFlagActive) {
                    // All zones discovered, show final message
                    setTimeout(showFinalMessage, 1500);
                } else {
                    showPopup('🏁 The Victory Flag is inactive. Explore all other zones first! 🌸');
                }
            } else {
                showZoneAlert(inZone.name);
                if (inZone.message) {
                    setTimeout(() => showPopup(inZone.message), 500);
                }
                
                // Check if all non-final zones are now discovered
                const allOtherZonesDiscovered = zones.every(z => z.isFinal || visitedZones.has(z.id));
                if (allOtherZonesDiscovered && !victoryFlagActive) {
                    setTimeout(activateVictoryFlag, 1000);
                }
            }
        } else if (inZone.isFinal && victoryFlagActive) {
            // Re-entering Victory Flag when active
            setTimeout(showFinalMessage, 1000);
        }
    } else if (!inZone) {
        currentZone = null;
        document.getElementById('current-zone').textContent = "Shubhanshi's World";
    }
}

function updateAnimations(t) {
    animatedObjects.forEach(item => {
        const obj = item.obj;
        
        switch(item.type) {
            case 'cloud':
                obj.position.x += obj.userData.speed;
                if (obj.position.x > 110) obj.position.x = -110;
                break;
                
            case 'float':
            case 'dreamCloud':
                if (obj.userData.baseY !== undefined) {
                    obj.position.y = obj.userData.baseY + Math.sin(t * 1.2 + obj.userData.offset) * 0.35;
                }
                break;
                
            case 'musicNote':
                obj.position.y = obj.userData.baseY + Math.sin(t * 2.5 + obj.userData.offset) * 0.5;
                obj.rotation.z = Math.sin(t * 1.8) * 0.25;
                break;
                
            case 'danceTile':
                obj.material.emissiveIntensity = 0.2 + Math.sin(t * 5 + obj.userData.pulseOffset) * 0.35;
                break;
                
            case 'discoLight':
                obj.position.y = obj.userData.baseY + Math.sin(t * 2.5 + obj.userData.idx) * 0.6;
                break;
                
            case 'discoBall':
                obj.rotation.y += 0.008;
                break;
                
            case 'star':
            case 'bulb':
                obj.material.opacity = 0.4 + Math.sin(t * 3.5 + obj.userData.twinkleOffset) * 0.6;
                break;
                
            case 'portalRing':
                obj.rotation.z += 0.012;
                break;
                
            case 'portalInner':
                obj.material.opacity = 0.4 + Math.sin(t * 2.5) * 0.25;
                obj.rotation.z += 0.006;
                break;
                
            case 'victoryFlag':
                // Wave the flag - modify vertices for waving effect
                if (obj.geometry && obj.geometry.attributes && obj.geometry.attributes.position) {
                    const positions = obj.geometry.attributes.position.array;
                    const waveIntensity = victoryFlagActive ? 0.3 : 0.1;
                    for (let i = 0; i < positions.length; i += 3) {
                        const x = positions[i];
                        positions[i + 2] = Math.sin(t * 3 + x * 2) * waveIntensity * (x + 2);
                    }
                    obj.geometry.attributes.position.needsUpdate = true;
                }
                break;
                
            case 'heart':
                obj.rotation.y += 0.025;
                obj.position.y = 6.5 + Math.sin(t * 2.2) * 0.25;
                const scale = 1 + Math.sin(t * 3) * 0.08;
                obj.scale.set(scale, scale, scale);
                break;
                
            case 'zzz':
                obj.position.y = obj.userData.baseY + Math.sin(t * 1.2) * 0.15;
                obj.position.x += 0.002;
                if (obj.position.x > obj.userData.baseY + 5) obj.position.x = obj.userData.baseY;
                break;
                
            case 'orb':
                obj.position.y = obj.userData.baseY + Math.sin(t * 1.5 + obj.userData.offset) * 0.4;
                break;
                
            case 'butterfly':
                const bAngle = t * obj.userData.speed + obj.userData.offset;
                obj.position.x = obj.userData.centerX + Math.cos(bAngle) * obj.userData.radius;
                obj.position.z = obj.userData.centerZ + Math.sin(bAngle) * obj.userData.radius;
                obj.position.y = obj.userData.baseY + Math.sin(t * 3) * 0.3;
                obj.rotation.y = bAngle + Math.PI / 2;
                break;
                
            case 'ghost':
                obj.position.y = obj.userData.baseY + Math.sin(t * 1.5 + obj.userData.offset) * 0.5;
                obj.position.x = obj.userData.startX + Math.sin(t * 0.8 + obj.userData.offset) * 2;
                break;
                
            case 'steam':
                obj.position.y = obj.userData.baseY + (t * 0.5 % 0.5);
                obj.material.opacity = 0.3 - (t * 0.5 % 0.5) * 0.6;
                break;
                
            case 'lantern':
                obj.children.forEach(child => {
                    if (child.type === 'Mesh' && child.material.emissive) {
                        child.material.emissiveIntensity = 0.5 + Math.sin(t * 3) * 0.15;
                    }
                });
                break;
                
            case 'sparkle':
                const sAngle = t * obj.userData.speed + obj.userData.angleOffset;
                obj.position.x = obj.userData.centerX + Math.cos(sAngle) * obj.userData.radius;
                obj.position.z = obj.userData.centerZ + Math.sin(sAngle) * obj.userData.radius;
                obj.position.y = obj.userData.baseY + Math.sin(t * 2 + obj.userData.angleOffset) * 1;
                obj.material.opacity = 0.5 + Math.sin(t * 4 + obj.userData.angleOffset) * 0.5;
                break;
                
            case 'ambient':
                const positions = obj.geometry.attributes.position.array;
                for (let i = 0; i < positions.length / 3; i++) {
                    positions[i * 3 + 1] += 0.018;
                    if (positions[i * 3 + 1] > 50) positions[i * 3 + 1] = 0;
                }
                obj.geometry.attributes.position.needsUpdate = true;
                break;

            case 'snow': {
                const p = obj.geometry.attributes.position.array;
                const sp = obj.geometry.userData.speeds;
                for (let i = 0; i < p.length / 3; i++) {
                    p[i * 3 + 1] -= 0.04 * sp[i];
                    if (p[i * 3 + 1] < 0) p[i * 3 + 1] = 60;
                }
                obj.geometry.attributes.position.needsUpdate = true;
                break;
            }
        }
    });
}

console.log('💕 Shubhanshi\'s World loaded! Ready to explore.');
