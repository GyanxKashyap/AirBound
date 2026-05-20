"use strict";

const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d", { alpha: false });

const ui = {
  shell: document.querySelector(".game-shell"),
  openingScreen: document.getElementById("openingScreen"),
  startScreen: document.getElementById("startScreen"),
  pauseScreen: document.getElementById("pauseScreen"),
  gameOverScreen: document.getElementById("gameOverScreen"),
  score: document.getElementById("scoreDisplay"),
  best: document.getElementById("bestDisplay"),
  finalScore: document.getElementById("finalScore"),
  finalBest: document.getElementById("finalBest"),
  finalCombo: document.getElementById("finalCombo"),
  resultTitle: document.getElementById("resultTitle"),
  unlockMessage: document.getElementById("unlockMessage"),
  heroBest: document.getElementById("heroBest"),
  heroSkins: document.getElementById("heroSkins"),
  heroCombo: document.getElementById("heroCombo"),
  skinList: document.getElementById("skinList"),
  achievements: document.getElementById("achievementList"),
  toast: document.getElementById("toast")
};

const STORAGE_KEY = "skyline-flap-save-v1";
const TAU = Math.PI * 2;

const skins = [
  { id: "classic", name: "Classic", unlockAt: 0, body: "#fff06a", wing: "#4dd7ff" },
  { id: "mint", name: "Mint Rush", unlockAt: 8, body: "#76ffbf", wing: "#ffffff" },
  { id: "sunset", name: "Sunset", unlockAt: 16, body: "#ff8a5c", wing: "#fff06a" },
  { id: "neon", name: "Neon Pop", unlockAt: 28, body: "#ff5ca8", wing: "#4dd7ff" },
  { id: "midnight", name: "Midnight", unlockAt: 40, body: "#17213b", wing: "#76ffbf" }
];

const allSkinIds = skins.map((skin) => skin.id);

const achievements = [
  { id: "rookie", title: "First Flight", description: "Play one game", test: (save) => save.games >= 1 },
  { id: "five", title: "Pipe Dodger", description: "Score 5", test: (save) => save.bestScore >= 5 },
  { id: "combo", title: "Combo Pilot", description: "Reach x4 combo", test: (save) => save.bestCombo >= 4 },
  { id: "twenty", title: "Arcade Ace", description: "Score 20", test: (save) => save.bestScore >= 20 },
  { id: "night", title: "Night Shift", description: "Survive into night mode", test: (save) => save.nightFlights >= 1 }
];

const defaultSave = {
  bestScore: 0,
  bestCombo: 1,
  games: 0,
  selectedSkin: "classic",
  unlockedSkins: allSkinIds,
  achievements: [],
  nightFlights: 0
};

let save = loadSave();
save.unlockedSkins = allSkinIds;
persist();
let dpr = 1;
let width = 1;
let height = 1;
let lastTime = 0;
let toastTimer = null;
let audioContext = null;

function createBird() {
  return {
    x: Math.max(92, width * 0.25),
    y: height * 0.42,
    radiusX: 22,
    radiusY: 17,
    velocityY: 0,
    rotation: 0,
    alive: true
  };
}

const game = {
  state: "opening",
  time: 0,
  ambientTime: 0,
  runTime: 0,
  score: 0,
  combo: 1,
  maxCombo: 1,
  lastPassTime: 0,
  speed: 205,
  gravity: 1550,
  jumpVelocity: -485,
  pipeTimer: 0,
  pipeGap: 182,
  groundOffset: 0,
  mode: "day",
  modeProgress: 0,
  difficulty: 0,
  shake: 0,
  flash: 0,
  bird: null,
  pipes: [],
  particles: [],
  clouds: [],
  stars: [],
  skyline: []
};

function loadSave() {
  try {
    return { ...defaultSave, ...(JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}) };
  } catch {
    return { ...defaultSave };
  }
}

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(save));
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

function currentSkin() {
  return skins.find((skin) => skin.id === save.selectedSkin) || skins[0];
}

function resizeCanvas() {
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  width = window.innerWidth;
  height = window.innerHeight;
  canvas.width = Math.floor(width * dpr);
  canvas.height = Math.floor(height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  seedBackground();
}

function seedBackground() {
  game.clouds = Array.from({ length: Math.ceil(width / 140) + 6 }, () => ({
    x: randomBetween(0, width),
    y: randomBetween(60, height * 0.5),
    size: randomBetween(44, 92),
    speed: randomBetween(8, 24),
    alpha: randomBetween(0.18, 0.42)
  }));

  game.stars = Array.from({ length: 72 }, () => ({
    x: randomBetween(0, width),
    y: randomBetween(20, height * 0.58),
    size: randomBetween(0.8, 2.2),
    alpha: randomBetween(0.25, 0.95)
  }));

  game.skyline = Array.from({ length: Math.ceil(width / 48) + 8 }, (_, index) => ({
    x: index * 48 + randomBetween(-12, 12),
    width: randomBetween(32, 58),
    height: randomBetween(74, 190),
    lit: Math.random() > 0.4
  }));
}

function resetGame() {
  game.state = "playing";
  game.time = 0;
  game.runTime = 0;
  game.score = 0;
  game.combo = 1;
  game.maxCombo = 1;
  game.lastPassTime = 0;
  game.speed = 205;
  game.pipeGap = clamp(height * 0.27, 176, 218);
  game.pipeTimer = 0;
  game.groundOffset = 0;
  game.mode = "day";
  game.modeProgress = 0;
  game.difficulty = 0;
  game.shake = 0;
  game.flash = 0;
  game.pipes = [];
  game.particles = [];
  game.bird = createBird();
  spawnPipe();
  hideScreens();
  updateScoreUi();
}

function showScreen(screen) {
  ui.shell.classList.remove("is-playing");
  [ui.openingScreen, ui.startScreen, ui.pauseScreen, ui.gameOverScreen].forEach((element) => element.classList.remove("is-visible"));
  screen.classList.add("is-visible");
}

function hideScreens() {
  ui.shell.classList.add("is-playing");
  [ui.openingScreen, ui.startScreen, ui.pauseScreen, ui.gameOverScreen].forEach((element) => element.classList.remove("is-visible"));
}

function pauseGame() {
  if (game.state !== "playing") return;
  game.state = "paused";
  showScreen(ui.pauseScreen);
}

function resumeGame() {
  if (game.state !== "paused") return;
  game.state = "playing";
  hideScreens();
  lastTime = performance.now();
}

function flap() {
  if (game.state === "opening") {
    finishOpening();
    return;
  }
  if (game.state === "start") {
    startGame();
    return;
  }
  if (game.state !== "playing") return;
  unlockAudio();
  game.bird.velocityY = game.jumpVelocity;
  addParticles(game.bird.x - 14, game.bird.y + 8, currentSkin().wing, 14, 180);
  playSound("jump");
}

function startGame() {
  unlockAudio();
  resetGame();
}

function finishOpening() {
  if (game.state !== "opening") return;
  game.state = "start";
  renderMeta();
  showScreen(ui.startScreen);
}

function spawnPipe() {
  const groundHeight = getGroundHeight();
  const safeTop = clamp(height * 0.12, 82, 122);
  const bottomBuffer = clamp(height * 0.2, 128, 176);
  const safeBottom = height - groundHeight - bottomBuffer;
  const minCenter = safeTop + game.pipeGap / 2;
  const maxCenter = Math.max(minCenter + 24, safeBottom - game.pipeGap / 2);
  const center = randomBetween(minCenter, maxCenter);
  const pipeWidth = clamp(width * 0.095, 58, 88);
  game.pipes.push({
    x: width + pipeWidth,
    width: pipeWidth,
    gapCenter: center,
    gapHeight: game.pipeGap,
    passed: false,
    wobble: Math.random() > 0.72,
    phase: Math.random() * TAU
  });
}

function update(dt) {
  game.time += dt;
  game.shake = Math.max(0, game.shake - dt * 22);
  game.flash = Math.max(0, game.flash - dt * 4);
  if (game.state !== "playing") return;

  game.runTime += dt;
  game.difficulty = Math.min(1, game.runTime / 75);
  game.speed = 205 + game.difficulty * 92;
  game.pipeGap = clamp(height * 0.27 - game.difficulty * 42, 158, 218);
  game.modeProgress = (game.runTime % 42) / 42;
  game.mode = game.modeProgress < 0.5 ? "day" : "night";
  game.groundOffset = (game.groundOffset + game.speed * dt) % 48;

  if (game.mode === "night" && !game.countedNight) {
    save.nightFlights += 1;
    game.countedNight = true;
    checkAchievements();
  }
  if (game.mode === "day") game.countedNight = false;

  updateBird(dt);
  updatePipes(dt);
  updateParticles(dt);
  updateClouds(dt);
  checkCollisions();
}

function updateBird(dt) {
  const bird = game.bird;
  bird.velocityY += game.gravity * dt;
  bird.velocityY = clamp(bird.velocityY, -680, 900);
  bird.y += bird.velocityY * dt;
  bird.rotation += (clamp(bird.velocityY / 620, -0.75, 1.25) - bird.rotation) * 0.16;
}

function updatePipes(dt) {
  const spacing = clamp(1.52 - game.difficulty * 0.32, 1.05, 1.52);
  game.pipeTimer -= dt;
  if (game.pipeTimer <= 0) {
    spawnPipe();
    game.pipeTimer = spacing;
  }

  for (const pipe of game.pipes) {
    pipe.x -= game.speed * dt;
    if (pipe.wobble) {
      pipe.phase += dt * 2.2;
      pipe.gapCenter += Math.sin(pipe.phase) * 10 * dt;
    }

    if (!pipe.passed && pipe.x + pipe.width < game.bird.x - game.bird.radiusX) {
      pipe.passed = true;
      awardPoint();
    }
  }

  game.pipes = game.pipes.filter((pipe) => pipe.x + pipe.width > -40);
}

function awardPoint() {
  const now = game.runTime;
  game.combo = now - game.lastPassTime < 1.65 ? game.combo + 1 : 1;
  game.lastPassTime = now;
  game.maxCombo = Math.max(game.maxCombo, game.combo);

  const bonus = game.combo >= 4 ? Math.floor(game.combo / 4) : 0;
  game.score += 1 + bonus;
  addParticles(game.bird.x, game.bird.y, "#fff06a", 18, 220);
  game.flash = Math.max(game.flash, 0.18);
  playSound("score");
  updateScoreUi();

  if (game.combo === 4) showToast("Combo x4");
}

function updateParticles(dt) {
  for (const particle of game.particles) {
    particle.x += particle.vx * dt;
    particle.y += particle.vy * dt;
    particle.vy += 260 * dt;
    particle.life -= dt;
  }
  game.particles = game.particles.filter((particle) => particle.life > 0);
}

function updateClouds(dt) {
  for (const cloud of game.clouds) {
    cloud.x -= cloud.speed * dt;
    if (cloud.x < -cloud.size * 2) {
      cloud.x = width + cloud.size;
      cloud.y = randomBetween(60, height * 0.5);
    }
  }
}

function addParticles(x, y, color, amount, power) {
  for (let i = 0; i < amount; i += 1) {
    const angle = Math.random() * TAU;
    const speed = randomBetween(power * 0.35, power);
    game.particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      size: randomBetween(2, 5),
      color,
      life: randomBetween(0.28, 0.75),
      maxLife: 0.75
    });
  }
}

function checkCollisions() {
  const bird = game.bird;
  const groundY = height - getGroundHeight();

  if (bird.y + bird.radiusY >= groundY || bird.y - bird.radiusY <= 0) {
    endGame();
    return;
  }

  for (const pipe of game.pipes) {
    const topRect = { x: pipe.x, y: 0, w: pipe.width, h: pipe.gapCenter - pipe.gapHeight / 2 };
    const bottomY = pipe.gapCenter + pipe.gapHeight / 2;
    const bottomRect = { x: pipe.x, y: bottomY, w: pipe.width, h: groundY - bottomY };

    if (ellipseRectCollision(bird, topRect) || ellipseRectCollision(bird, bottomRect)) {
      endGame();
      return;
    }
  }
}

// Tight ellipse-vs-rectangle collision keeps the hitbox aligned to the drawn bird within a few pixels.
function ellipseRectCollision(ellipse, rect) {
  const closestX = clamp(ellipse.x, rect.x, rect.x + rect.w);
  const closestY = clamp(ellipse.y, rect.y, rect.y + rect.h);
  const dx = (closestX - ellipse.x) / ellipse.radiusX;
  const dy = (closestY - ellipse.y) / ellipse.radiusY;
  return dx * dx + dy * dy <= 1;
}

function endGame() {
  if (game.state !== "playing") return;
  game.state = "gameover";
  game.shake = 13;
  game.flash = 0.55;
  addParticles(game.bird.x, game.bird.y, "#ff5ca8", 34, 300);
  playSound("hit");

  save.games += 1;
  save.bestScore = Math.max(save.bestScore, game.score);
  save.bestCombo = Math.max(save.bestCombo, game.maxCombo);

  const unlocks = updateUnlockedSkins();
  const newAchievements = checkAchievements();
  persist();
  renderMeta();

  ui.finalScore.textContent = game.score;
  ui.finalBest.textContent = save.bestScore;
  ui.finalCombo.textContent = `x${game.maxCombo}`;
  ui.resultTitle.textContent = game.score >= save.bestScore && game.score > 0 ? "New Best" : "Nice Run";
  ui.unlockMessage.textContent = [...unlocks, ...newAchievements].join("  ");
  showScreen(ui.gameOverScreen);
}

function updateUnlockedSkins() {
  const unlocked = [];
  for (const skin of skins) {
    if (save.bestScore >= skin.unlockAt && !save.unlockedSkins.includes(skin.id)) {
      save.unlockedSkins.push(skin.id);
      unlocked.push(`${skin.name} unlocked`);
    }
  }
  return unlocked;
}

function checkAchievements() {
  const unlocked = [];
  for (const achievement of achievements) {
    if (!save.achievements.includes(achievement.id) && achievement.test(save)) {
      save.achievements.push(achievement.id);
      unlocked.push(achievement.title);
      showToast(`Achievement: ${achievement.title}`);
    }
  }
  return unlocked;
}

function updateScoreUi() {
  ui.score.textContent = game.score;
  ui.best.textContent = save.bestScore;
}

function draw() {
  const shakeX = game.shake ? randomBetween(-game.shake, game.shake) : 0;
  const shakeY = game.shake ? randomBetween(-game.shake, game.shake) : 0;
  ctx.save();
  ctx.translate(shakeX, shakeY);
  drawBackground();
  drawClouds();
  drawSkyline();
  drawPipes();
  drawParticles();
  drawBird();
  drawGround();
  ctx.restore();

  if (game.flash > 0) {
    ctx.fillStyle = `rgba(255, 240, 106, ${game.flash * 0.12})`;
    ctx.fillRect(0, 0, width, height);
  }

  if (game.state === "paused") {
    ctx.fillStyle = "rgba(7, 17, 31, 0.24)";
    ctx.fillRect(0, 0, width, height);
  }
}

function drawBackground() {
  const nightBlend = game.mode === "night" ? 1 : 0;
  const sky = ctx.createLinearGradient(0, 0, 0, height);
  sky.addColorStop(0, mixColor("#78d6ff", "#091327", nightBlend));
  sky.addColorStop(0.56, mixColor("#c7efff", "#14365c", nightBlend));
  sky.addColorStop(1, mixColor("#85ddff", "#07111f", nightBlend));
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, width, height);

  const celestialX = width * (0.78 - nightBlend * 0.56);
  const celestialY = height * 0.18;
  ctx.save();
  ctx.globalAlpha = 0.74;
  ctx.shadowBlur = 36;
  ctx.shadowColor = nightBlend > 0 ? "#f8fbff" : "#fff06a";
  ctx.fillStyle = nightBlend > 0 ? "#f8fbff" : "#fff06a";
  ctx.beginPath();
  ctx.arc(celestialX, celestialY, 34, 0, TAU);
  ctx.fill();
  if (nightBlend > 0.5) {
    ctx.shadowBlur = 0;
    ctx.fillStyle = mixColor("#78d6ff", "#091327", nightBlend);
    ctx.beginPath();
    ctx.arc(celestialX + 13, celestialY - 9, 34, 0, TAU);
    ctx.fill();
  }
  ctx.restore();

  if (nightBlend > 0) {
    ctx.globalAlpha = nightBlend;
    ctx.fillStyle = "#f8fbff";
    for (const star of game.stars) {
        ctx.globalAlpha = nightBlend * star.alpha * (0.65 + Math.sin(game.ambientTime * 2 + star.x) * 0.35);
      ctx.beginPath();
      ctx.arc(star.x, star.y, star.size, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
}

function drawClouds() {
  for (const cloud of game.clouds) {
    ctx.fillStyle = `rgba(255,255,255,${cloud.alpha})`;
    drawCloud(cloud.x, cloud.y, cloud.size);
  }
}

function drawSkyline() {
  const groundY = height - getGroundHeight();
  const offset = (game.groundOffset * 0.18) % 48;
  ctx.save();
  ctx.translate(-offset, 0);
  for (let repeat = 0; repeat < 3; repeat += 1) {
    for (const building of game.skyline) {
      const x = building.x + repeat * width;
      const y = groundY - building.height;
      const gradient = ctx.createLinearGradient(0, y, 0, groundY);
      gradient.addColorStop(0, "rgba(14, 35, 58, 0.72)");
      gradient.addColorStop(1, "rgba(6, 17, 34, 0.88)");
      ctx.fillStyle = gradient;
      ctx.fillRect(x, y, building.width, building.height);
      if (building.lit) {
        ctx.fillStyle = "rgba(255, 240, 106, 0.32)";
        for (let wy = y + 18; wy < groundY - 10; wy += 28) {
          ctx.fillRect(x + 9, wy, 5, 10);
          ctx.fillRect(x + building.width - 15, wy + 8, 5, 10);
        }
      }
    }
  }
  ctx.restore();
}

function drawCloud(x, y, size) {
  ctx.beginPath();
  ctx.arc(x, y, size * 0.34, 0, TAU);
  ctx.arc(x + size * 0.32, y - size * 0.18, size * 0.42, 0, TAU);
  ctx.arc(x + size * 0.78, y, size * 0.34, 0, TAU);
  ctx.rect(x, y, size * 0.78, size * 0.32);
  ctx.fill();
}

function drawPipes() {
  const groundY = height - getGroundHeight();
  for (const pipe of game.pipes) {
    const topHeight = pipe.gapCenter - pipe.gapHeight / 2;
    const bottomY = pipe.gapCenter + pipe.gapHeight / 2;
    drawPipeSegment(pipe.x, 0, pipe.width, topHeight, true);
    drawPipeSegment(pipe.x, bottomY, pipe.width, groundY - bottomY, false);
  }
}

function drawPipeSegment(x, y, w, h, top) {
  if (h <= 0) return;
  const gradient = ctx.createLinearGradient(x, 0, x + w, 0);
  gradient.addColorStop(0, "#078a62");
  gradient.addColorStop(0.46, "#21d68f");
  gradient.addColorStop(1, "#04684d");
  ctx.shadowColor = "rgba(0, 0, 0, 0.26)";
  ctx.shadowBlur = 18;
  ctx.shadowOffsetX = 8;
  ctx.shadowOffsetY = 8;
  ctx.fillStyle = gradient;
  ctx.fillRect(x, y, w, h);
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;

  const capHeight = 18;
  const capY = top ? y + h - capHeight : y;
  ctx.fillStyle = "#fff06a";
  roundRect(x - 8, capY, w + 16, capHeight, 7);
  ctx.fill();

  ctx.fillStyle = "rgba(255,255,255,0.23)";
  ctx.fillRect(x + w * 0.22, y + 10, 6, Math.max(0, h - 20));
}

function drawBird() {
  if (!game.bird) game.bird = createBird();
  const bird = game.bird;
  const skin = currentSkin();
  ctx.save();
  ctx.translate(bird.x, bird.y);
  ctx.rotate(bird.rotation);
  ctx.globalAlpha = game.state === "gameover" ? 0.78 : 1;
  ctx.fillStyle = "rgba(77, 215, 255, 0.22)";
  ctx.beginPath();
  ctx.ellipse(-20, 5, 26, 8, 0, 0, TAU);
  ctx.fill();
  ctx.shadowColor = skin.body;
  ctx.shadowBlur = 18;
  ctx.fillStyle = skin.body;
  ctx.beginPath();
  ctx.ellipse(0, 0, bird.radiusX, bird.radiusY, 0, 0, TAU);
  ctx.fill();

  ctx.fillStyle = skin.wing;
  ctx.beginPath();
  ctx.ellipse(-7, 5 + Math.sin(game.ambientTime * 18) * 4, 10, 7, -0.35, 0, TAU);
  ctx.fill();

  ctx.fillStyle = "#ff9f43";
  ctx.beginPath();
  ctx.moveTo(17, -2);
  ctx.lineTo(34, 4);
  ctx.lineTo(17, 10);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(9, -7, 5, 0, TAU);
  ctx.fill();
  ctx.fillStyle = "#07111f";
  ctx.beginPath();
  ctx.arc(11, -7, 2, 0, TAU);
  ctx.fill();
  ctx.restore();
}

function drawParticles() {
  for (const particle of game.particles) {
    const alpha = clamp(particle.life / particle.maxLife, 0, 1);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = particle.color;
    ctx.shadowColor = particle.color;
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(particle.x, particle.y, particle.size, 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;
}

function drawGround() {
  const groundHeight = getGroundHeight();
  const y = height - groundHeight;
  ctx.fillStyle = "#07111f";
  ctx.fillRect(0, y, width, groundHeight);

  ctx.fillStyle = "#21d68f";
  ctx.shadowColor = "#21d68f";
  ctx.shadowBlur = 18;
  ctx.fillRect(0, y, width, 4);
  ctx.shadowBlur = 0;

  for (let x = -game.groundOffset; x < width + 48; x += 48) {
    ctx.fillStyle = "rgba(77, 215, 255, 0.28)";
    ctx.fillRect(x, y + 22, 26, 3);
    ctx.fillStyle = "rgba(255, 240, 106, 0.24)";
    ctx.fillRect(x + 22, y + 40, 18, 3);
  }
}

function getGroundHeight() {
  return clamp(height * 0.12, 64, 92);
}

function roundRect(x, y, w, h, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function mixColor(a, b, amount) {
  const ca = hexToRgb(a);
  const cb = hexToRgb(b);
  return `rgb(${Math.round(ca.r + (cb.r - ca.r) * amount)}, ${Math.round(ca.g + (cb.g - ca.g) * amount)}, ${Math.round(ca.b + (cb.b - ca.b) * amount)})`;
}

function hexToRgb(hex) {
  const value = Number.parseInt(hex.slice(1), 16);
  return { r: value >> 16, g: (value >> 8) & 255, b: value & 255 };
}

function unlockAudio() {
  if (!audioContext) audioContext = new AudioContext();
  if (audioContext.state === "suspended") audioContext.resume();
}

function playSound(type) {
  if (!audioContext) return;
  const now = audioContext.currentTime;
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  const settings = {
    jump: [520, 820, 0.08, "square", 0.035],
    score: [760, 1180, 0.12, "triangle", 0.045],
    hit: [180, 70, 0.2, "sawtooth", 0.075]
  }[type];

  oscillator.type = settings[3];
  oscillator.frequency.setValueAtTime(settings[0], now);
  oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, settings[1]), now + settings[2]);
  gain.gain.setValueAtTime(settings[4], now);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + settings[2]);
  oscillator.connect(gain).connect(audioContext.destination);
  oscillator.start(now);
  oscillator.stop(now + settings[2]);
}

function showToast(message) {
  clearTimeout(toastTimer);
  ui.toast.textContent = message;
  ui.toast.classList.add("is-visible");
  toastTimer = window.setTimeout(() => ui.toast.classList.remove("is-visible"), 1700);
}

function renderMeta() {
  updateScoreUi();
  ui.heroBest.textContent = save.bestScore;
  ui.heroSkins.textContent = `${save.unlockedSkins.length}/${skins.length}`;
  ui.heroCombo.textContent = `x${save.bestCombo}`;
  ui.skinList.innerHTML = skins.map((skin) => {
    const unlocked = save.unlockedSkins.includes(skin.id) || save.bestScore >= skin.unlockAt;
    const selected = save.selectedSkin === skin.id;
    return `
      <button class="skin-button ${selected ? "is-selected" : ""} ${unlocked ? "" : "is-locked"}" data-skin="${skin.id}">
        <span class="skin-dot" style="background:${skin.body}; color:${skin.body}"></span>
        <span>
          <span class="skin-name">${skin.name}</span>
          <span class="skin-requirement">${unlocked ? "Ready to fly" : `Unlock at ${skin.unlockAt} points`}</span>
        </span>
        <span class="skin-score">${unlocked ? (selected ? "On" : "Use") : skin.unlockAt}</span>
      </button>
    `;
  }).join("");

  ui.achievements.innerHTML = achievements.map((achievement) => {
    const earned = save.achievements.includes(achievement.id);
    return `
      <div class="achievement ${earned ? "is-earned" : ""}">
        <span class="achievement-status">${earned ? "Done" : "Open"}</span>
        <span class="achievement-title">${achievement.title}</span>
        <span class="achievement-text">${achievement.description}</span>
      </div>
    `;
  }).join("");
}

function selectSkin(id) {
  const skin = skins.find((item) => item.id === id);
  if (!skin) return;
  const unlocked = save.unlockedSkins.includes(id) || save.bestScore >= skin.unlockAt;
  if (!unlocked) {
    showToast(`Unlock at ${skin.unlockAt} points`);
    return;
  }
  if (!save.unlockedSkins.includes(id)) save.unlockedSkins.push(id);
  save.selectedSkin = id;
  persist();
  renderMeta();
  showToast(`${skin.name} equipped`);
}

function bindEvents() {
  document.getElementById("enterBtn").addEventListener("click", finishOpening);
  document.getElementById("startBtn").addEventListener("click", startGame);
  document.getElementById("restartBtn").addEventListener("click", startGame);
  document.getElementById("restartFromPauseBtn").addEventListener("click", startGame);
  document.getElementById("resumeBtn").addEventListener("click", resumeGame);
  document.getElementById("homeBtn").addEventListener("click", () => {
    game.shake = 0;
    game.flash = 0;
    game.state = "start";
    showScreen(ui.startScreen);
  });
  document.getElementById("pauseBtn").addEventListener("click", () => {
    if (game.state === "playing") pauseGame();
    else if (game.state === "paused") resumeGame();
  });

  window.addEventListener("keydown", (event) => {
    if (event.repeat) return;
    if (["Space", "ArrowUp", "KeyW"].includes(event.code)) {
      event.preventDefault();
      flap();
    }
    if (["KeyP", "Escape"].includes(event.code)) {
      if (game.state === "playing") pauseGame();
      else if (game.state === "paused") resumeGame();
    }
  });

  window.addEventListener("pointerdown", (event) => {
    if (event.target.closest("button")) return;
    if (game.state === "opening") {
      finishOpening();
      return;
    }
    flap();
  });

  ui.skinList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-skin]");
    if (button) selectSkin(button.dataset.skin);
  });

  window.addEventListener("resize", resizeCanvas);
}

function gameLoop(time) {
  const dt = Math.min(0.033, (time - lastTime) / 1000 || 0.016);
  lastTime = time;
  game.ambientTime += dt;
  update(dt);
  draw();
  requestAnimationFrame(gameLoop);
}

resizeCanvas();
bindEvents();
renderMeta();
showScreen(ui.openingScreen);
requestAnimationFrame(gameLoop);
