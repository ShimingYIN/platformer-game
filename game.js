// Game logic for the side‑scrolling platformer
(() => {
  // DOM elements
  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d');
  const startScreen = document.getElementById('start-screen');
  const controls = document.getElementById('controls');
  const leftBtn = document.getElementById('leftBtn');
  const rightBtn = document.getElementById('rightBtn');
  const jumpBtn = document.getElementById('jumpBtn');
  const shootBtn = document.getElementById('shootBtn');
  const bossBar = document.getElementById('boss-bar');
  const bossBarInner = document.getElementById('boss-bar-inner');
  const victory = document.getElementById('victory');

  // Offscreen world dimensions
  const WORLD_WIDTH = 3500;
  const WORLD_HEIGHT = canvas.height;

  // Input state
  let input = {
    left: false,
    right: false,
    jump: false,
    shoot: false
  };

  // Timing for shoot cooldown
  let shootCooldown = 0;

  // Game state
  let charSelected = false;
  let gameOver = false;

  // Camera
  let cameraX = 0;

  // Classes
  class Player {
    constructor(img) {
      this.img = img;
      this.width = 60;
      this.height = 90;
      this.x = 50;
      this.y = 0;
      this.vx = 0;
      this.vy = 0;
      this.onGround = false;
      this.direction = 1; // 1 right, -1 left
      this.lives = 3;
      this.hasGun = false;
      this.wingTime = 0;
    }
    update() {
      // Horizontal movement
      const speed = 2.5;
      if (input.left) {
        this.vx = -speed;
        this.direction = -1;
      } else if (input.right) {
        this.vx = speed;
        this.direction = 1;
      } else {
        this.vx = 0;
      }
      // Jump
      if (input.jump) {
        if (this.onGround) {
          this.vy = -9;
          this.onGround = false;
        } else if (this.wingTime > 0) {
          // allow double jump when wings active
          this.vy = -9;
        }
        input.jump = false; // consume
      }
      // Gravity
      const gravity = this.wingTime > 0 ? 0.15 : 0.3;
      this.vy += gravity;
      if (this.vy > 8) this.vy = 8;
      // Update position
      this.x += this.vx;
      this.y += this.vy;
      // Keep within world
      if (this.x < 0) this.x = 0;
      if (this.x + this.width > WORLD_WIDTH) this.x = WORLD_WIDTH - this.width;
      // Collisions with platforms
      this.onGround = false;
      for (const p of platforms) {
        if (this.x + this.width > p.x && this.x < p.x + p.w) {
          // Land on platform
          if (this.vy >= 0 && this.y + this.height <= p.y + this.vy && this.y + this.height + this.vy >= p.y) {
            this.y = p.y - this.height;
            this.vy = 0;
            this.onGround = true;
          }
        }
      }
      // Collisions with blocks from below
      for (const blk of blocks) {
        if (!blk.active) continue;
        if (this.x + this.width > blk.x && this.x < blk.x + blk.w) {
          if (this.vy < 0 && this.y <= blk.y + blk.h && this.y >= blk.y + blk.h + this.vy) {
            this.vy = 1;
            blk.active = false;
            spawnPowerUp(blk);
          }
        }
      }
      // Ground
      if (this.y + this.height > WORLD_HEIGHT) {
        this.y = WORLD_HEIGHT - this.height;
        this.vy = 0;
        this.onGround = true;
      }
      // Decay wing time
      if (this.wingTime > 0) this.wingTime--;
    }
    draw() {
      ctx.drawImage(this.img, this.x - cameraX, this.y, this.width, this.height);
    }
    shoot() {
      const bulletSpeed = this.hasGun ? 6 : 4;
      const bulletSize = this.hasGun ? 10 : 6;
      const bx = this.direction === 1 ? this.x + this.width : this.x - bulletSize;
      const by = this.y + this.height - bulletSize - 10;
      bullets.push(new Bullet(bx, by, this.direction * bulletSpeed, 0, bulletSize, bulletSize));
    }
  }

  class Bullet {
    constructor(x, y, vx, vy, w, h) {
      this.x = x;
      this.y = y;
      this.vx = vx;
      this.vy = vy;
      this.w = w;
      this.h = h;
      this.alive = true;
    }
    update() {
      this.x += this.vx;
      this.y += this.vy;
      if (this.x < 0 || this.x > WORLD_WIDTH) this.alive = false;
      // collide with monsters
      for (const m of monsters) {
        if (!m.alive) continue;
        if (rectIntersect(this, m)) {
          m.alive = false;
          this.alive = false;
          break;
        }
      }
      // collide with boss
      if (boss.alive && rectIntersect(this, boss)) {
        boss.health--;
        this.alive = false;
        if (boss.health <= 0) {
          boss.alive = false;
          onWin();
        }
      }
    }
    draw() {
      ctx.fillStyle = '#f00';
      ctx.fillRect(this.x - cameraX, this.y, this.w, this.h);
    }
  }

  class Monster {
    constructor(x, y) {
      this.x = x;
      this.y = y;
      this.w = 40;
      this.h = 40;
      this.vx = Math.random() < 0.5 ? 1 : -1;
      this.vy = 0;
      this.alive = true;
    }
    update() {
      this.x += this.vx;
      this.vy += 0.3;
      this.y += this.vy;
      // Land on ground or platforms
      if (this.y + this.h > WORLD_HEIGHT) {
        this.y = WORLD_HEIGHT - this.h;
        this.vy = 0;
      }
      for (const p of platforms) {
        if (this.x + this.w > p.x && this.x < p.x + p.w) {
          if (this.vy >= 0 && this.y + this.h <= p.y + this.vy && this.y + this.h + this.vy >= p.y) {
            this.y = p.y - this.h;
            this.vy = 0;
          }
        }
      }
      // bounce off edges of platforms
      let onPlatform = false;
      for (const p of platforms) {
        if (Math.abs(this.y + this.h - p.y) < 2) {
          if (this.x + this.w > p.x && this.x < p.x + p.w) {
            onPlatform = true;
            if (this.x <= p.x) this.vx = Math.abs(this.vx);
            if (this.x + this.w >= p.x + p.w) this.vx = -Math.abs(this.vx);
          }
        }
      }
      if (!onPlatform) {
        if (this.x <= 0) this.vx = Math.abs(this.vx);
        if (this.x + this.w >= WORLD_WIDTH) this.vx = -Math.abs(this.vx);
      }
    }
    draw() {
      ctx.fillStyle = '#2ecc71';
      ctx.fillRect(this.x - cameraX, this.y, this.w, this.h);
    }
  }

  class PowerUp {
    constructor(x, y, type) {
      this.x = x;
      this.y = y;
      this.w = 30;
      this.h = 30;
      this.vy = -3;
      this.type = type;
      this.alive = true;
    }
    update() {
      this.vy += 0.2;
      this.y += this.vy;
      if (this.y + this.h > WORLD_HEIGHT) {
        this.y = WORLD_HEIGHT - this.h;
        this.vy = 0;
      }
      if (rectIntersect(this, player)) {
        applyPowerUp(this.type);
        this.alive = false;
      }
    }
    draw() {
      let color;
      if (this.type === 'gun') color = '#f39c12';
      else if (this.type === 'life') color = '#9b59b6';
      else if (this.type === 'wings') color = '#3498db';
      ctx.fillStyle = color;
      ctx.fillRect(this.x - cameraX, this.y, this.w, this.h);
    }
  }

  class Boss {
    constructor() {
      this.x = 3100;
      this.y = WORLD_HEIGHT - 200;
      this.w = 160;
      this.h = 160;
      this.health = 20;
      this.alive = false;
    }
    update() {
      if (!this.alive) return;
      // optional movement or attacks can be added here
    }
    draw() {
      if (!this.alive) return;
      ctx.fillStyle = '#8e44ad';
      ctx.fillRect(this.x - cameraX, this.y, this.w, this.h);
    }
  }

  // Collections
  const platforms = [];
  const blocks = [];
  const monsters = [];
  const bullets = [];
  const powerups = [];
  const boss = new Boss();
  let player;

  function rectIntersect(a, b) {
    return a.x < b.x + b.w && a.x + (a.w || a.width) > b.x && a.y < b.y + b.h && a.y + (a.h || a.height) > b.y;
  }

  function spawnPowerUp(blk) {
    const types = ['gun','life','wings'];
    const type = types[Math.floor(Math.random()*types.length)];
    powerups.push(new PowerUp(blk.x + blk.w/2 - 15, blk.y - 35, type));
  }

  function applyPowerUp(type) {
    if (type === 'gun') player.hasGun = true;
    else if (type === 'life') player.lives++;
    else if (type === 'wings') player.wingTime = 800;
  }

  function setupLevel() {
    platforms.push({ x: 0, y: WORLD_HEIGHT - 50, w: WORLD_WIDTH, h: 50 });
    platforms.push({ x: 300, y: WORLD_HEIGHT - 140, w: 200, h: 20 });
    platforms.push({ x: 650, y: WORLD_HEIGHT - 200, w: 200, h: 20 });
    platforms.push({ x: 1000, y: WORLD_HEIGHT - 260, w: 200, h: 20 });
    platforms.push({ x: 1350, y: WORLD_HEIGHT - 180, w: 200, h: 20 });
    platforms.push({ x: 1700, y: WORLD_HEIGHT - 240, w: 200, h: 20 });
    platforms.push({ x: 2000, y: WORLD_HEIGHT - 300, w: 200, h: 20 });
    platforms.push({ x: 2400, y: WORLD_HEIGHT - 200, w: 200, h: 20 });
    blocks.push({ x: 350, y: WORLD_HEIGHT - 180, w: 40, h: 40, active: true });
    blocks.push({ x: 700, y: WORLD_HEIGHT - 240, w: 40, h: 40, active: true });
    blocks.push({ x: 1050, y: WORLD_HEIGHT - 300, w: 40, h: 40, active: true });
    blocks.push({ x: 1750, y: WORLD_HEIGHT - 280, w: 40, h: 40, active: true });
    blocks.push({ x: 2050, y: WORLD_HEIGHT - 340, w: 40, h: 40, active: true });
    [600,900,1200,1500,1800,2100,2500].forEach(x => {
      monsters.push(new Monster(x, WORLD_HEIGHT - 90));
    });
  }

  function startGame(img) {
    player = new Player(img);
    player.x = 50;
    player.y = WORLD_HEIGHT - player.height - 50;
    setupLevel();
    charSelected = true;
    startScreen.style.display = 'none';
    canvas.style.display = 'block';
    controls.style.display = 'flex';
    requestAnimationFrame(gameLoop);
  }

  // Character selection
  document.getElementById('char1').addEventListener('click', () => {
    const img = new Image();
    img.src = 'character1.png';
    img.onload = () => startGame(img);
  });
  document.getElementById('char2').addEventListener('click', () => {
    const img = new Image();
    img.src = 'character2.png';
    img.onload = () => startGame(img);
  });

  // Keyboard input
  document.addEventListener('keydown', (e) => {
    if (!charSelected) return;
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') input.left = true;
    if (e.code === 'ArrowRight' || e.code === 'KeyD') input.right = true;
    if (e.code === 'ArrowUp' || e.code === 'Space') input.jump = true;
    if (e.code === 'KeyX' || e.code === 'KeyF') input.shoot = true;
  });
  document.addEventListener('keyup', (e) => {
    if (!charSelected) return;
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') input.left = false;
    if (e.code === 'ArrowRight' || e.code === 'KeyD') input.right = false;
    if (e.code === 'KeyX' || e.code === 'KeyF') input.shoot = false;
  });

  // Touch/mouse controls
  function bindBtn(btn, key) {
    const isTap = key === 'jump' || key === 'shoot';
    btn.addEventListener('touchstart', (e) => {
      e.preventDefault();
      input[key] = true;
    });
    btn.addEventListener('touchend', (e) => {
      e.preventDefault();
      if (!isTap) input[key] = false;
    });
    btn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      input[key] = true;
    });
    btn.addEventListener('mouseup', (e) => {
      e.preventDefault();
      if (!isTap) input[key] = false;
    });
    btn.addEventListener('mouseleave', (e) => {
      if (!isTap) input[key] = false;
    });
  }
  bindBtn(leftBtn,'left');
  bindBtn(rightBtn,'right');
  bindBtn(jumpBtn,'jump');
  bindBtn(shootBtn,'shoot');

  function gameLoop() {
    if (!charSelected) return;
    update();
    draw();
    if (!gameOver) requestAnimationFrame(gameLoop);
  }

  function update() {
    player.update();
    // Camera follow
    const margin = canvas.width / 3;
    const playerScreenX = player.x - cameraX;
    if (playerScreenX > canvas.width - margin) {
      cameraX = Math.min(WORLD_WIDTH - canvas.width, player.x - (canvas.width - margin));
    } else if (playerScreenX < margin) {
      cameraX = Math.max(0, player.x - margin);
    }
    // Bullets
    for (let i = bullets.length-1; i>=0; i--) {
      bullets[i].update();
      if (!bullets[i].alive) bullets.splice(i,1);
    }
    // Monsters
    for (const m of monsters) {
      if (m.alive) m.update();
    }
    // Player collision with monsters
    for (const m of monsters) {
      if (!m.alive) continue;
      if (rectIntersect(player, m)) {
        player.lives--;
        player.x = 50;
        player.y = WORLD_HEIGHT - player.height - 50;
        player.vx = 0;
        player.vy = 0;
        cameraX = 0;
        if (player.lives <= 0) {
          gameOver = true;
          showLose();
        }
        break;
      }
    }
    // Powerups
    for (let i = powerups.length-1; i>=0; i--) {
      powerups[i].update();
      if (!powerups[i].alive) powerups.splice(i,1);
    }
    // Boss spawn
    if (!boss.alive && player.x > 3000) {
      boss.alive = true;
      bossBar.style.display = 'block';
    }
    // Update boss health bar
    if (boss.alive) {
      bossBarInner.style.width = Math.max(0, (boss.health / 20) * 100) + '%';
    }
    // Shooting
    if (input.shoot && shootCooldown <= 0) {
      player.shoot();
      shootCooldown = player.hasGun ? 10 : 20;
    }
    if (shootCooldown > 0) shootCooldown--;
    // Boss update
    boss.update();
  }

  function draw() {
    ctx.clearRect(0,0,canvas.width,canvas.height);
    // Sky gradient
    const sky = ctx.createLinearGradient(0,0,0,canvas.height);
    sky.addColorStop(0,'#b5dfff');
    sky.addColorStop(1,'#e0f7ff');
    ctx.fillStyle = sky;
    ctx.fillRect(0,0,canvas.width,canvas.height);
    // Blocks
    ctx.fillStyle = '#d35400';
    for (const blk of blocks) {
      if (!blk.active) continue;
      ctx.fillRect(blk.x - cameraX, blk.y, blk.w, blk.h);
    }
    // Platforms
    ctx.fillStyle = '#7f8c8d';
    for (const p of platforms) {
      ctx.fillRect(p.x - cameraX, p.y, p.w, p.h);
    }
    // Castle
    ctx.fillStyle = '#95a5a6';
    ctx.fillRect(3050 - cameraX, WORLD_HEIGHT - 150, 200, 150);
    ctx.fillStyle = '#2c3e50';
    ctx.fillRect(3125 - cameraX, WORLD_HEIGHT - 200, 50, 50);
    // Powerups
    for (const pu of powerups) pu.draw();
    // Monsters
    for (const m of monsters) if (m.alive) m.draw();
    // Boss
    boss.draw();
    // Bullets
    for (const b of bullets) b.draw();
    // Player
    player.draw();
    // UI
    ctx.fillStyle = '#000';
    ctx.font = '16px sans-serif';
    ctx.fillText('Lives: ' + player.lives, 10, 20);
    if (player.hasGun) ctx.fillText('Gun: ON', 10, 40);
    if (player.wingTime > 0) ctx.fillText('Wings: ' + Math.ceil(player.wingTime/60), 10, 60);
  }

  function onWin() {
    gameOver = true;
    controls.style.display = 'none';
    bossBar.style.display = 'none';
    victory.style.display = 'flex';
    startFireworks();
  }

  function showLose() {
    victory.style.display = 'flex';
    victory.innerHTML = '<div style="color:#fff;font-size:32px;text-align:center;">Game Over<br/>Refresh the page to try again.</div>';
    controls.style.display = 'none';
  }

  // Fireworks
  const particles = [];
  function startFireworks() {
    const spawn = () => {
      for (let i=0; i<30; i++) particles.push(createParticle());
    };
    spawn();
    const interval = setInterval(spawn, 800);
    setTimeout(() => clearInterval(interval), 5000);
    animateFireworks();
  }
  function createParticle() {
    const angle = Math.random() * Math.PI * 2;
    const speed = Math.random() * 3 + 2;
    return {
      x: canvas.width/2,
      y: canvas.height/2,
      vx: Math.cos(angle)*speed,
      vy: Math.sin(angle)*speed,
      life: 60,
      color: `hsl(${Math.floor(Math.random()*360)},80%,60%)`
    };
  }
  function animateFireworks() {
    if (!gameOver) return;
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.fillRect(0,0,canvas.width,canvas.height);
    for (let i=particles.length-1; i>=0; i--) {
      const p=particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.05;
      p.life--;
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x, p.y, 3,3);
      if (p.life <= 0) particles.splice(i,1);
    }
    if (particles.length > 0) requestAnimationFrame(animateFireworks);
  }
})();
