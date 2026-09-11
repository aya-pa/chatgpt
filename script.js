const canvas = document.querySelector("#game");
const ctx = canvas.getContext("2d");
const coinCount = document.querySelector("#coin-count");
const lifeCount = document.querySelector("#life-count");
const invincibilityCount = document.querySelector("#invincibility-count");
const stageCount = document.querySelector("#stage-count");
const message = document.querySelector("#message");
const messageTitle = document.querySelector("#message-title");
const messageText = document.querySelector("#message-text");
const restartButton = document.querySelector("#restart-button");
const musicButton = document.querySelector("#music-button");

const W = 960;
const H = 540;
const worldWidth = 4200;
const gravity = 0.65;
const keys = new Set();
let jumpQueued = false;

let player;
let cameraX;
let coins;
let lives;
let state;
let stage = 1;
let lastTime = 0;
let audioContext;
let musicTimer;
let musicStep = 0;
let musicOn = false;
const INVINCIBILITY_DURATION = 300;

const platforms = [
  { x: 0, y: 440, w: 820, h: 100 }, { x: 930, y: 390, w: 300, h: 150 },
  { x: 1360, y: 440, w: 520, h: 100 }, { x: 2020, y: 350, w: 320, h: 190 },
  { x: 2500, y: 440, w: 600, h: 100 }, { x: 3300, y: 390, w: 360, h: 150 },
  { x: 3800, y: 440, w: 400, h: 100 },
  { x: 490, y: 330, w: 160, h: 24 }, { x: 1040, y: 250, w: 150, h: 24 },
  { x: 1510, y: 300, w: 160, h: 24 }, { x: 2140, y: 220, w: 150, h: 24 },
  { x: 2740, y: 300, w: 150, h: 24 }, { x: 3380, y: 230, w: 150, h: 24 },
];
const enemySpawns = [
  [650, 404, 560, 780], [1050, 354, 950, 1180], [1580, 404, 1400, 1800],
  [2150, 314, 2040, 2300], [2780, 404, 2520, 3050], [3440, 354, 3320, 3620],
];
const stageLayouts = [
  { platforms, enemySpawns },
  {
    platforms: platforms.map((platform, i) => ({
      ...platform,
      y: Math.max(190, platform.y - (i % 3) * 25),
    })),
    enemySpawns: enemySpawns.map(([x, y, left, right], i) => [x, Math.max(170, y - (i % 2) * 35), left, right]),
  },
  {
    platforms: platforms.map((platform, i) => ({
      ...platform,
      y: Math.max(160, platform.y - 20 + (i % 2) * 30),
    })),
    enemySpawns: enemySpawns.map(([x, y, left, right], i) => [x, Math.max(140, y - 45 + (i % 3) * 20), left, right]),
  },
];
let enemies;
let goal;
let currentPlatforms;
let currentEnemySpawns;

function reset(startFromBeginning = true) {
  if (startFromBeginning) stage = 1;
  const layout = stageLayouts[stage - 1];
  currentPlatforms = layout.platforms;
  currentEnemySpawns = layout.enemySpawns;
  player = { x: 100, y: 380, w: 30, h: 60, vx: 0, vy: 0, grounded: false, jumps: 0, invincible: 0, facing: 1, attackTimer: 0 };
  jumpQueued = false;
  cameraX = 0; coins = 0; lives = 3; state = "playing";
  enemies = currentEnemySpawns.map(([x, y, left, right], i) => ({
    x, y, w: 34 + (i % 3) * 4, h: 36 + (i % 2) * 8,
    vx: 1.1 + i * 0.15, left, right, alive: true,
    type: i % 2 === 0 ? 3 : (i % 3),
  }));
  goal = { x: 4040, y: 350, w: 20, h: 90 };
  const positions = [220, 370, 550, 730, 1010, 1120, 1450, 1590, 1770, 2090, 2210, 2600, 2780, 2950, 3370, 3510, 3860, 3990];
  coins = 0;
  window.coinItems = positions.map((x, i) => ({ x, y: i % 3 === 0 ? 280 : 350, taken: false }));
  window.fruit = { x: 2860, y: 245, taken: false };
  updateHud();
  message.classList.add("hidden");
  restartButton.textContent = "もう一度遊ぶ";
}

function updateHud() {
  stageCount.textContent = stage;
  coinCount.textContent = coins;
  lifeCount.textContent = lives;
  invincibilityCount.textContent = player?.invincible > 0
    ? `${Math.ceil(player.invincible / 60)}秒`
    : "--";
}
function down(...names) { return names.some((name) => keys.has(name)); }
function overlaps(a, b) { return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y; }

function update(dt) {
  if (state !== "playing") return;
  const speed = 0.65;
  if (down("ArrowLeft", "a")) player.vx -= speed * dt;
  if (down("ArrowRight", "d")) player.vx += speed * dt;
  if (player.vx !== 0) player.facing = Math.sign(player.vx);
  player.vx *= Math.pow(0.82, dt);
  player.vx = Math.max(-5, Math.min(5, player.vx));
  if (jumpQueued) {
    if (player.jumps < 2) {
      player.vy = -13;
      player.grounded = false;
      player.jumps += 1;
    }
    jumpQueued = false;
  }
  player.vy += gravity * dt;
  const oldBottom = player.y + player.h;
  player.x += player.vx * dt;
  player.y += player.vy * dt;
  player.grounded = false;
  for (const platform of currentPlatforms) {
    if (player.vy >= 0 && oldBottom <= platform.y && player.y + player.h >= platform.y &&
        player.x + player.w > platform.x && player.x < platform.x + platform.w) {
      player.y = platform.y - player.h; player.vy = 0; player.grounded = true; player.jumps = 0;
    }
  }
  player.x = Math.max(0, Math.min(worldWidth - player.w, player.x));
  for (const enemy of enemies) {
    if (!enemy.alive) continue;
    enemy.x += enemy.vx * dt;
    if (enemy.x < enemy.left || enemy.x + enemy.w > enemy.right) enemy.vx *= -1;
    if (overlaps(player, enemy) && player.invincible <= 0) {
      if (player.vy > 0 && player.y + player.h - enemy.y < 20) {
        enemy.alive = false;
        player.vy = -8;
        playEnemyDefeatSound();
      }
      else hitPlayer();
    }
  }
  for (const coin of window.coinItems) {
    const item = { x: coin.x - 11, y: coin.y - 11, w: 22, h: 22 };
    if (!coin.taken && overlaps(player, item)) {
      coin.taken = true;
      coins += 1;
      playCoinSound();
      updateHud();
    }
  }
  const fruitItem = { x: window.fruit.x - 14, y: window.fruit.y - 14, w: 28, h: 28 };
  if (!window.fruit.taken && overlaps(player, fruitItem)) {
    window.fruit.taken = true;
    player.invincible = Math.max(player.invincible, INVINCIBILITY_DURATION);
    playInvincibilitySound();
    updateHud();
  }
  player.invincible = Math.max(0, player.invincible - dt);
  player.attackTimer = Math.max(0, player.attackTimer - dt);
  updateHud();
  cameraX += (player.x - cameraX - W * 0.35) * 0.1;
  cameraX = Math.max(0, Math.min(worldWidth - W, cameraX));
  if (overlaps(player, goal)) finish();
  if (player.y > H + 100) hitPlayer();
}

function attack() {
  if (state !== "playing" || player.attackTimer > 0) return;
  player.attackTimer = 18;
  playTone(520, 0.08, "square", 0.04);
  const slash = {
    x: player.facing > 0 ? player.x + player.w - 2 : player.x - 44,
    y: player.y + 12, w: 46, h: 38,
  };
  for (const enemy of enemies) {
    if (enemy.alive && overlaps(slash, enemy)) {
      enemy.alive = false;
      playEnemyDefeatSound();
    }
  }
}

function hitPlayer() {
  if (player.invincible > 0) return;
  lives -= 1;
  playPlayerDefeatSound();
  updateHud();
  if (lives <= 0) { state = "lost"; showMessage("ゲームオーバー", "もう一度走り出そう。"); return; }
  player.x = Math.max(100, player.x - 260); player.y = 250; player.vx = 0; player.vy = 0; player.invincible = 100;
}
function finish() {
  if (stage < stageLayouts.length) {
    state = "stage-clear";
    restartButton.textContent = "次のステージへ";
    showMessage(`ステージ ${stage} クリア！`, `コインを ${coins} 枚集めました。`);
  } else {
    state = "won";
    showMessage("ゲームクリア！", `全ステージ制覇。コインを ${coins} 枚集めました。`);
  }
}
function showMessage(title, text) { messageTitle.textContent = title; messageText.textContent = text; message.classList.remove("hidden"); }

function draw() {
  const gradient = ctx.createLinearGradient(0, 0, 0, H);
  gradient.addColorStop(0, "#5fc9f3"); gradient.addColorStop(1, "#f6b6d6");
  ctx.fillStyle = gradient; ctx.fillRect(0, 0, W, H);
  ctx.save(); ctx.translate(-cameraX * 0.25, 0);
  ctx.fillStyle = "#25265d";
  for (let x = -100; x < worldWidth; x += 260) { ctx.beginPath(); ctx.moveTo(x, 440); ctx.lineTo(x + 130, 245); ctx.lineTo(x + 310, 440); ctx.fill(); }
  ctx.restore(); ctx.save(); ctx.translate(-cameraX, 0);
  drawChristmasDecorations();
  drawStreetLamps();
  drawSantaSleigh();
  for (const platform of currentPlatforms) { ctx.fillStyle = "#343875"; ctx.fillRect(platform.x, platform.y, platform.w, platform.h); ctx.fillStyle = "#67d0a1"; ctx.fillRect(platform.x, platform.y, platform.w, 10); }
  for (const coin of window.coinItems) if (!coin.taken) { ctx.fillStyle = "#ffd166"; ctx.beginPath(); ctx.arc(coin.x, coin.y, 10, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = "#fff1a8"; ctx.beginPath(); ctx.arc(coin.x - 3, coin.y - 3, 3, 0, Math.PI * 2); ctx.fill(); }
  if (!window.fruit.taken) {
    ctx.fillStyle = "#ef6f6c";
    ctx.beginPath();
    ctx.arc(window.fruit.x, window.fruit.y + 2, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#67d0a1";
    ctx.fillRect(window.fruit.x + 2, window.fruit.y - 13, 4, 7);
    ctx.beginPath();
    ctx.ellipse(window.fruit.x + 9, window.fruit.y - 11, 7, 3, -0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#fff1a8";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(window.fruit.x, window.fruit.y + 2, 16, 0, Math.PI * 2);
    ctx.stroke();
  }
  for (const enemy of enemies) if (enemy.alive) {
    drawSnowman(enemy);
  }
  if (player.attackTimer > 0) {
    ctx.strokeStyle = "#fff1a8"; ctx.lineWidth = 7; ctx.lineCap = "round";
    ctx.beginPath();
    const handX = player.facing > 0 ? player.x + player.w : player.x;
    ctx.arc(handX + player.facing * 20, player.y + 30, 25, player.facing > 0 ? -0.9 : Math.PI + 0.9, player.facing > 0 ? 0.9 : Math.PI - 0.9, player.facing < 0);
    ctx.stroke();
  }
  ctx.fillStyle = "#d9f0ff"; ctx.fillRect(goal.x, goal.y, goal.w, goal.h); ctx.fillStyle = "#ffd166"; ctx.beginPath(); ctx.moveTo(goal.x + 18, goal.y); ctx.lineTo(goal.x + 75, goal.y + 18); ctx.lineTo(goal.x + 18, goal.y + 36); ctx.fill();
  if (player.invincible % 10 < 5) {
    const centerX = player.x + player.w / 2;
    const headY = player.y + 12;
    const legY = player.y + player.h - 18;
    ctx.strokeStyle = "#25265d";
    ctx.lineWidth = 6;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(centerX - 6, player.y + 39);
    ctx.lineTo(centerX - 9, legY);
    ctx.moveTo(centerX + 6, player.y + 39);
    ctx.lineTo(centerX + 9, legY);
    ctx.stroke();
    ctx.fillStyle = "#e63946";
    ctx.fillRect(player.x + 7, player.y + 27, player.w - 14, 25);
    ctx.fillStyle = "#fff";
    ctx.fillRect(player.x + 7, player.y + 27, player.w - 14, 5);
    ctx.fillRect(player.x + 7, player.y + 48, player.w - 14, 4);
    ctx.fillStyle = "#2d3142";
    ctx.fillRect(centerX - 2, player.y + 32, 4, 18);
    ctx.fillStyle = "#ffd166";
    ctx.fillRect(centerX - 9, player.y + 38, 18, 4);
    ctx.strokeStyle = "#e63946";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(player.x + 8, player.y + 31);
    ctx.lineTo(player.x - 1, player.y + 45);
    ctx.moveTo(player.x + player.w - 8, player.y + 31);
    ctx.lineTo(player.x + player.w + 1, player.y + 45);
    ctx.stroke();
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(player.x - 1, player.y + 45, 4, 0, Math.PI * 2);
    ctx.arc(player.x + player.w + 1, player.y + 45, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ffd6b3";
    ctx.beginPath();
    ctx.arc(centerX, headY, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#e63946";
    ctx.beginPath();
    ctx.arc(centerX, headY - 3, 13, Math.PI, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(centerX - 12, headY - 4);
    ctx.lineTo(centerX + 8, headY - 19);
    ctx.lineTo(centerX + 12, headY - 4);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.fillRect(centerX - 12, headY - 6, 24, 5);
    ctx.beginPath();
    ctx.arc(centerX + 8, headY - 19, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(centerX, headY + 7, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#25265d";
    ctx.fillRect(centerX + player.facing * 4 - 2, headY - 1, 4, 5);
  }
  ctx.restore();
  drawSnow();
}

function drawChristmasDecorations() {
  const firTrees = [180, 860, 1280, 1940, 2420, 3150, 3700];
  for (const x of firTrees) {
    const baseY = 440;
    const topY = 245;
    ctx.fillStyle = "#704d4d";
    ctx.fillRect(x - 9, baseY - 34, 18, 34);
    ctx.fillStyle = "#2f9e62";
    for (let layer = 0; layer < 5; layer += 1) {
      const layerTop = topY + layer * 29;
      const halfWidth = 19 + layer * 16;
      ctx.beginPath();
      ctx.moveTo(x, layerTop - 24);
      ctx.lineTo(x - halfWidth, layerTop + 43);
      ctx.quadraticCurveTo(x, layerTop + 31, x + halfWidth, layerTop + 43);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "#67d0a1";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x, layerTop - 12);
      ctx.lineTo(x - halfWidth + 8, layerTop + 34);
      ctx.moveTo(x, layerTop - 12);
      ctx.lineTo(x + halfWidth - 8, layerTop + 34);
      ctx.stroke();
    }
    ctx.fillStyle = "#fff";
    for (let snow = 0; snow < 4; snow += 1) {
      const snowY = topY + 35 + snow * 34;
      const snowWidth = 15 + snow * 12;
      ctx.beginPath();
      ctx.moveTo(x - snowWidth, snowY);
      ctx.quadraticCurveTo(x, snowY + 10, x + snowWidth, snowY);
      ctx.lineTo(x + snowWidth - 5, snowY + 5);
      ctx.quadraticCurveTo(x, snowY + 16, x - snowWidth + 5, snowY + 5);
      ctx.closePath();
      ctx.fill();
    }
    const ornaments = [
      [-24, 347, "#e63946"], [22, 347, "#ffd166"],
      [-40, 388, "#8ee4ff"], [4, 380, "#e63946"], [38, 394, "#ffd166"],
    ];
    for (const [offsetX, y, color] of ornaments) {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x + offsetX, y, 5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = "#ffd166";
    ctx.beginPath();
    ctx.moveTo(x, topY - 35);
    ctx.lineTo(x - 7, topY - 17);
    ctx.lineTo(x - 20, topY - 17);
    ctx.lineTo(x - 10, topY - 8);
    ctx.lineTo(x - 14, topY + 5);
    ctx.lineTo(x, topY - 2);
    ctx.lineTo(x + 14, topY + 5);
    ctx.lineTo(x + 10, topY - 8);
    ctx.lineTo(x + 20, topY - 17);
    ctx.lineTo(x + 7, topY - 17);
    ctx.closePath();
    ctx.fill();
  }
  const gifts = [
    [165, 414, "#e63946", "#ffd166"], [205, 406, "#315b91", "#fff"],
    [845, 414, "#2f9e62", "#e63946"], [1260, 409, "#e63946", "#8ee4ff"],
    [1920, 414, "#795b9f", "#ffd166"], [2395, 410, "#f4a261", "#315b91"],
    [3130, 414, "#e63946", "#fff"], [3680, 409, "#2f9e62", "#ffd166"],
  ];
  for (const [x, y, boxColor, ribbonColor] of gifts) {
    ctx.fillStyle = boxColor;
    ctx.fillRect(x - 13, y - 18, 26, 18);
    ctx.fillStyle = ribbonColor;
    ctx.fillRect(x - 3, y - 18, 6, 18);
    ctx.fillRect(x - 13, y - 12, 26, 5);
    ctx.strokeStyle = ribbonColor;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x - 4, y - 20, 5, Math.PI, 0);
    ctx.arc(x + 4, y - 20, 5, Math.PI, 0);
    ctx.stroke();
  }
  const markets = [300, 1080, 1660, 2380, 2860, 3460, 3890];
  markets.forEach((x, i) => drawMarket(x, i));
}

function drawSantaSleigh() {
  const x = cameraX + 650;
  const y = 112;
  ctx.save();
  ctx.globalAlpha = 0.88;
  ctx.strokeStyle = "#25265d";
  ctx.fillStyle = "#25265d";
  ctx.lineWidth = 4;
  ctx.lineCap = "round";
  // Sleigh runners and curved body.
  ctx.beginPath();
  ctx.moveTo(x - 62, y + 25);
  ctx.quadraticCurveTo(x - 27, y + 37, x + 23, y + 23);
  ctx.quadraticCurveTo(x + 39, y + 18, x + 47, y + 5);
  ctx.lineTo(x + 36, y + 10);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x - 52, y + 24);
  ctx.quadraticCurveTo(x - 25, y + 49, x + 30, y + 27);
  ctx.stroke();
  ctx.fillRect(x - 38, y - 4, 58, 26);
  ctx.fillStyle = "#e63946";
  ctx.fillRect(x - 34, y - 1, 50, 5);
  ctx.fillStyle = "#25265d";
  // Santa's legs, coat, belt, arm and sack.
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(x - 13, y - 2);
  ctx.lineTo(x - 17, y - 23);
  ctx.moveTo(x + 1, y - 2);
  ctx.lineTo(x + 5, y - 23);
  ctx.moveTo(x - 17, y - 13);
  ctx.lineTo(x + 4, y - 13);
  ctx.moveTo(x + 4, y - 15);
  ctx.lineTo(x + 18, y - 4);
  ctx.stroke();
  ctx.fillStyle = "#25265d";
  ctx.beginPath();
  ctx.arc(x + 30, y - 2, 12, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#e63946";
  ctx.beginPath();
  ctx.arc(x - 13, y - 34, 10, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(x - 23, y - 27, 25, 17);
  ctx.fillStyle = "#fff";
  ctx.fillRect(x - 23, y - 28, 25, 5);
  ctx.beginPath();
  ctx.moveTo(x - 22, y - 39);
  ctx.lineTo(x - 3, y - 55);
  ctx.lineTo(x + 2, y - 35);
  ctx.closePath();
  ctx.fillStyle = "#e63946";
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.arc(x - 3, y - 55, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x - 13, y - 34, 10, Math.PI, Math.PI * 2);
  ctx.fillStyle = "#fff";
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x - 16, y - 34, 2, 0, Math.PI * 2);
  ctx.arc(x - 9, y - 34, 2, 0, Math.PI * 2);
  ctx.fillStyle = "#25265d";
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x - 1, y + 5, 5, 0, Math.PI * 2);
  ctx.fillStyle = "#e63946";
  ctx.fill();
  const reindeerX = x + 82;
  const reindeerY = y - 2;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(x + 29, y + 9);
  ctx.lineTo(reindeerX - 18, reindeerY + 2);
  ctx.moveTo(reindeerX - 11, reindeerY + 7);
  ctx.lineTo(reindeerX - 15, reindeerY + 28);
  ctx.moveTo(reindeerX + 5, reindeerY + 7);
  ctx.lineTo(reindeerX + 11, reindeerY + 28);
  ctx.stroke();
  ctx.fillRect(reindeerX - 17, reindeerY - 7, 39, 18);
  ctx.beginPath();
  ctx.arc(reindeerX + 26, reindeerY - 5, 10, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#25265d";
  ctx.beginPath();
  ctx.moveTo(reindeerX + 24, reindeerY - 14);
  ctx.lineTo(reindeerX + 17, reindeerY - 29);
  ctx.moveTo(reindeerX + 29, reindeerY - 14);
  ctx.lineTo(reindeerX + 38, reindeerY - 28);
  ctx.stroke();
  ctx.fillStyle = "#e63946";
  ctx.beginPath();
  ctx.arc(reindeerX + 33, reindeerY - 5, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawStreetLamps() {
  const lamps = [420, 980, 1510, 2240, 3020, 3590, 3970];
  for (const x of lamps) {
    const y = 430;
    const lightY = 292;
    ctx.save();
    ctx.globalAlpha = 0.22;
    const glow = ctx.createRadialGradient(x, lightY + 7, 2, x, lightY + 7, 65);
    glow.addColorStop(0, "#fff1a8");
    glow.addColorStop(1, "transparent");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(x, lightY + 7, 65, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = "#25265d";
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x, lightY + 10);
    ctx.quadraticCurveTo(x, lightY - 3, x - 13, lightY - 3);
    ctx.lineTo(x - 20, lightY + 5);
    ctx.stroke();
    ctx.fillStyle = "#fff1a8";
    ctx.beginPath();
    ctx.arc(x - 20, lightY + 6, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#e63946";
    ctx.fillRect(x - 27, lightY - 5, 14, 4);
    ctx.restore();
  }
}

function drawMarket(x, type) {
  const colors = [
    ["#704d4d", "#e63946", "#fff1a8"],
    ["#315b91", "#ffd166", "#8ee4ff"],
    ["#2f9e62", "#e63946", "#fff"],
    ["#795b9f", "#8ee4ff", "#ffd166"],
    ["#9b644f", "#67d0a1", "#fff"],
    ["#454979", "#e63946", "#ffd166"],
    ["#7c6a3d", "#f4a261", "#8ee4ff"],
  ];
  const [wall, roof, trim] = colors[type % colors.length];
  ctx.fillStyle = wall;
  ctx.fillRect(x, 350, 130, 80);
  ctx.fillStyle = roof;
  ctx.beginPath();
  if (type === 1) {
    ctx.roundRect(x - 8, 302, 146, 48, 10);
  } else if (type === 2) {
    ctx.moveTo(x - 12, 350);
    ctx.lineTo(x + 65, 292);
    ctx.lineTo(x + 142, 350);
  } else {
    ctx.moveTo(x - 10, 350);
    ctx.lineTo(x + 65, type === 3 ? 310 : 300);
    ctx.lineTo(x + 140, 350);
  }
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = trim;
  if (type === 0) {
    ctx.fillRect(x + 12, 365, 28, 20);
    ctx.fillRect(x + 52, 365, 28, 20);
    ctx.fillRect(x + 92, 365, 24, 40);
  } else if (type === 1) {
    ctx.fillRect(x + 18, 362, 94, 9);
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(x + 40, 395, 12, 0, Math.PI * 2);
    ctx.arc(x + 75, 395, 12, 0, Math.PI * 2);
    ctx.arc(x + 105, 395, 12, 0, Math.PI * 2);
    ctx.fill();
  } else if (type === 2 || type === 5) {
    ctx.fillRect(x + 15, 370, 100, 12);
    ctx.fillStyle = "#ffd166";
    ctx.fillRect(x + 23, 395, 84, 8);
  } else if (type === 3 || type === 6) {
    ctx.fillRect(x + 15, 365, 32, 38);
    ctx.fillRect(x + 57, 365, 56, 38);
    ctx.fillStyle = "#e63946";
    ctx.fillRect(x + 65, 374, 40, 8);
  } else if (type === 4) {
    ctx.fillRect(x + 15, 366, 100, 7);
    ctx.fillStyle = "#e63946";
    ctx.beginPath();
    ctx.arc(x + 35, 393, 10, 0, Math.PI * 2);
    ctx.arc(x + 65, 393, 10, 0, Math.PI * 2);
    ctx.arc(x + 95, 393, 10, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = "#fff1a8";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x + 8, 343);
  ctx.lineTo(x + 122, 343);
  ctx.stroke();
  for (let light = 0; light < 6; light += 1) {
    ctx.fillStyle = (light + type) % 2 ? "#ffd166" : "#8ee4ff";
    ctx.beginPath();
    ctx.arc(x + 18 + light * 20, 337, 3, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawSnowman(enemy) {
  if (enemy.type === 3) {
    drawGingerbreadMan(enemy);
    return;
  }
  const x = enemy.x + enemy.w / 2;
  const bottom = enemy.y + enemy.h;
  const scale = enemy.w / 34;
  const bottomRadius = 17 * scale;
  const topRadius = 12 * scale;
  const bodyY = bottom - bottomRadius;
  const headY = bodyY - bottomRadius - topRadius + 5;
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.arc(x, bodyY, bottomRadius, 0, Math.PI * 2);
  ctx.arc(x, headY, topRadius, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#25265d";
  ctx.beginPath();
  ctx.arc(x - 4 * scale, headY - 2, 2.5 * scale, 0, Math.PI * 2);
  ctx.arc(x + 4 * scale, headY - 2, 2.5 * scale, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#e88b54";
  ctx.beginPath();
  ctx.moveTo(x, headY + 2);
  ctx.lineTo(x + (enemy.type === 1 ? 9 : 7) * scale, headY + 5);
  ctx.lineTo(x, headY + 7);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = enemy.type === 0 ? "#e63946" : enemy.type === 1 ? "#c77dff" : "#4cc9f0";
  ctx.fillRect(x - 13 * scale, bodyY - 3, 26 * scale, 6 * scale);
  ctx.fillStyle = "#704d4d";
  ctx.strokeStyle = "#704d4d";
  ctx.lineWidth = 3 * scale;
  ctx.beginPath();
  ctx.moveTo(x - bottomRadius + 3, bodyY - 2);
  ctx.lineTo(x - bottomRadius - (enemy.type === 2 ? 8 : 3), bodyY - 10);
  ctx.moveTo(x + bottomRadius - 3, bodyY - 2);
  ctx.lineTo(x + bottomRadius + (enemy.type === 0 ? 8 : 3), bodyY - 10);
  ctx.stroke();
  ctx.fillStyle = enemy.type === 2 ? "#e63946" : "#2d3142";
  if (enemy.type === 0) {
    ctx.fillRect(x - 12 * scale, headY - 16 * scale, 24 * scale, 5 * scale);
    ctx.fillRect(x - 8 * scale, headY - 23 * scale, 16 * scale, 8 * scale);
  } else if (enemy.type === 1) {
    ctx.beginPath();
    ctx.arc(x, headY - 13 * scale, 9 * scale, Math.PI, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.beginPath();
    ctx.moveTo(x - 10 * scale, headY - 11 * scale);
    ctx.lineTo(x, headY - 27 * scale);
    ctx.lineTo(x + 10 * scale, headY - 11 * scale);
    ctx.closePath();
    ctx.fill();
  }
}

function drawGingerbreadMan(enemy) {
  const x = enemy.x + enemy.w / 2;
  const y = enemy.y + enemy.h / 2;
  const scale = enemy.w / 34;
  ctx.strokeStyle = "#8b5e3c";
  ctx.fillStyle = "#b86f3c";
  ctx.lineWidth = 7 * scale;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(x, y - 2);
  ctx.lineTo(x, y + 14 * scale);
  ctx.moveTo(x, y + 3);
  ctx.lineTo(x - 15 * scale, y - 5);
  ctx.moveTo(x, y + 3);
  ctx.lineTo(x + 15 * scale, y - 5);
  ctx.moveTo(x, y + 13 * scale);
  ctx.lineTo(x - 10 * scale, y + 25 * scale);
  ctx.moveTo(x, y + 13 * scale);
  ctx.lineTo(x + 10 * scale, y + 25 * scale);
  ctx.stroke();
  ctx.fillStyle = "#b86f3c";
  ctx.beginPath();
  ctx.arc(x, y - 12 * scale, 12 * scale, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.fillRect(x - 10 * scale, y - 1 * scale, 20 * scale, 3 * scale);
  ctx.fillRect(x - 3 * scale, y + 5 * scale, 6 * scale, 3 * scale);
  ctx.beginPath();
  ctx.arc(x - 5 * scale, y - 14 * scale, 2 * scale, 0, Math.PI * 2);
  ctx.arc(x + 5 * scale, y - 14 * scale, 2 * scale, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#e63946";
  ctx.beginPath();
  ctx.arc(x, y + 10 * scale, 3 * scale, 0, Math.PI * 2);
  ctx.fill();
}

function drawSnow() {
  ctx.fillStyle = "#fff";
  for (let i = 0; i < 70; i += 1) {
    const x = (i * 137 + cameraX * 0.18) % W;
    const y = (i * 83 + performance.now() * 0.025) % H;
    ctx.globalAlpha = 0.45 + (i % 3) * 0.15;
    ctx.beginPath();
    ctx.arc(x, y, 1 + (i % 3), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function loop(time) { const dt = Math.min((time - lastTime) / 16.67 || 1, 2); lastTime = time; update(dt); draw(); requestAnimationFrame(loop); }
function playTone(frequency, duration, type = "triangle", volume = 0.03, delay = 0) {
  if (!audioContext || audioContext.state !== "running") return;
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  oscillator.type = type; oscillator.frequency.value = frequency;
  const startTime = audioContext.currentTime + delay;
  gain.gain.setValueAtTime(0.001, startTime);
  gain.gain.exponentialRampToValueAtTime(volume, startTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
  oscillator.connect(gain).connect(audioContext.destination);
  oscillator.start(startTime); oscillator.stop(startTime + duration);
}

function playCoinSound() {
  playTone(880, 0.08, "square", 0.04);
  playTone(1320, 0.12, "square", 0.035, 0.07);
}

function playEnemyDefeatSound() {
  playTone(220, 0.1, "sawtooth", 0.04);
  playTone(110, 0.16, "square", 0.03, 0.08);
}

function playPlayerDefeatSound() {
  playTone(180, 0.18, "sawtooth", 0.05);
  playTone(90, 0.3, "triangle", 0.04, 0.12);
}

function playInvincibilitySound() {
  playTone(523, 0.1, "triangle", 0.04);
  playTone(659, 0.1, "triangle", 0.04, 0.08);
  playTone(784, 0.18, "triangle", 0.04, 0.16);
}

function startMusic() {
  if (musicOn) return;
  audioContext ??= new AudioContext();
  audioContext.resume();
  musicOn = true; musicButton.textContent = "♪ BGM OFF";
  const melody = [
    523, 587, 659, 784, 659, 587, 523, 440,
    494, 587, 698, 880, 784, 698, 587, 494,
    523, 659, 784, 659, 587, 523, 440, 494,
    587, 698, 784, 880, 784, 698, 587, 523,
  ];
  const tick = () => { playTone(melody[musicStep++ % melody.length], 0.22, "triangle", 0.1); };
  tick(); musicTimer = window.setInterval(tick, 240);
}

function stopMusic() {
  musicOn = false; musicButton.textContent = "♪ BGM ON";
  if (musicTimer) { clearInterval(musicTimer); musicTimer = undefined; }
}

window.addEventListener("keydown", (event) => {
  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(event.key)) event.preventDefault();
  startMusic();
  if (["ArrowUp", "w", " "].includes(event.key) && !event.repeat) jumpQueued = true;
  if ((event.key === "Enter" || event.code === "Enter") && !event.repeat) attack();
  keys.add(event.key);
});
window.addEventListener("keyup", (event) => keys.delete(event.key));
restartButton.addEventListener("click", () => {
  if (state === "stage-clear") {
    stage += 1;
    reset(false);
  } else {
    reset();
  }
});
musicButton.addEventListener("click", () => musicOn ? stopMusic() : startMusic());
canvas.width = W; canvas.height = H; reset(); requestAnimationFrame(loop);
