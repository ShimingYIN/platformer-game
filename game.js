// Enhanced mobile platformer game with health, boss attacks, and improved visuals
(() => {
  // DOM references
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

  // World dimensions
  const WORLD_WIDTH = 3500;
  const WORLD_HEIGHT = canvas.height;
  // Raise the ground baseline so that the bottom of the game remains visible
  // when playing on a vertical mobile screen.  We define a constant ground
  // height and compute the Y coordinate of the top of the ground.  All
  // platforms, blocks, monsters and the player are positioned relative to
  // this baseline.  Increasing GROUND_HEIGHT moves the ground upward.
  const GROUND_HEIGHT = 180;
  const GROUND_Y = WORLD_HEIGHT - GROUND_HEIGHT;

  // Game state variables
  let input = { left:false, right:false, jump:false, shoot:false };
  let shootCooldown = 0;
  let cameraX = 0;
  let charSelected = false;
  let gameOver = false;

  // Data collections
  const platforms = [];
  const blocks = [];
  const monsters = [];
  const bullets = [];
  const powerups = [];
  const flames = [];
  let boss;
  let player;

  // Player class
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
      this.direction = 1;
      this.lives = 3;
      this.health = 100;
      this.invincibleTime = 0;
      this.hasGun = false;
      this.wingTime = 0;
    }
    update() {
      // Horizontal move
      const speed = 2.5;
      if (input.left) { this.vx = -speed; this.direction = -1; }
      else if (input.right) { this.vx = speed; this.direction = 1; }
      else this.vx = 0;
      // Jump
      if (input.jump) {
        if (this.onGround) {
          this.vy = -9;
          this.onGround = false;
        } else if (this.wingTime > 0) {
          this.vy = -9;
        }
        input.jump = false;
      }
      // Gravity
      const gravity = this.wingTime > 0 ? 0.15 : 0.3;
      this.vy += gravity;
      if (this.vy > 8) this.vy = 8;
      // Apply velocity
      this.x += this.vx;
      this.y += this.vy;
      // World bounds
      if (this.x < 0) this.x = 0;
      if (this.x + this.width > WORLD_WIDTH) this.x = WORLD_WIDTH - this.width;
      // Platform collisions (landing)
      this.onGround = false;
      for (const p of platforms) {
        if (this.x + this.width > p.x && this.x < p.x + p.w) {
          if (this.vy >= 0 && this.y + this.height <= p.y + this.vy && this.y + this.height + this.vy >= p.y) {
            this.y = p.y - this.height;
            this.vy = 0;
            this.onGround = true;
          }
        }
      }
      // Hit blocks from below
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
      // Ground collision
      // If the player falls below the top of the ground, clamp to the ground.
      // Use GROUND_Y rather than WORLD_HEIGHT so the ground can be raised.
      if (this.y + this.height > GROUND_Y) {
        this.y = GROUND_Y - this.height;
        this.vy = 0;
        this.onGround = true;
      }
      // Decrement timers
      if (this.wingTime > 0) this.wingTime--;
      if (this.invincibleTime > 0) this.invincibleTime--;
    }
    draw(offsetY=0) {
      // Blinking effect when invincible
      if (this.invincibleTime > 0 && Math.floor(this.invincibleTime/5) % 2 === 0) return;
      ctx.drawImage(this.img, this.x - cameraX, this.y + offsetY, this.width, this.height);
    }
    shoot() {
      if (!this.hasGun) return;
      const bulletSpeed = this.hasGun ? 6 : 4;
      const bulletSize = this.hasGun ? 10 : 6;
      const bx = this.direction === 1 ? this.x + this.width : this.x - bulletSize;
      const by = this.y + this.height - bulletSize - 10;
      bullets.push(new Bullet(bx, by, this.direction * bulletSpeed, 0, bulletSize, bulletSize));
    }
  }

  // Bullet class
  class Bullet {
    constructor(x,y,vx,vy,w,h) {
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
      // Collisions with monsters
      for (const m of monsters) {
        if (!m.alive) continue;
        if (rectIntersect(this,m)) {
          m.alive = false;
          this.alive = false;
          break;
        }
      }
      // Collisions with boss
      if (boss && boss.alive && rectIntersect(this,boss)) {
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

  // Monster class with circular body and eyes
  class Monster {
    constructor(x,y) {
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
      // If the monster falls below the ground level, clamp it back onto
      // the ground.  Use GROUND_Y instead of WORLD_HEIGHT to respect the
      // raised baseline.
      if (this.y + this.h > GROUND_Y) {
        this.y = GROUND_Y - this.h;
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
      // Bounce horizontally at platform edges
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
      // Draw a cute monster with horns and arms using primitive shapes.
      const cx = this.x - cameraX + this.w / 2;
      const cy = this.y + this.h / 2;
      const radius = this.w / 2;
      // body: yellow circle
      ctx.fillStyle = '#f1c40f';
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fill();
      // horns
      ctx.fillStyle = '#e74c3c';
      ctx.beginPath();
      ctx.moveTo(cx - radius * 0.6, cy - radius * 0.8);
      ctx.lineTo(cx - radius * 0.4, cy - radius * 1.4);
      ctx.lineTo(cx - radius * 0.2, cy - radius * 0.8);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(cx + radius * 0.2, cy - radius * 0.8);
      ctx.lineTo(cx + radius * 0.4, cy - radius * 1.4);
      ctx.lineTo(cx + radius * 0.6, cy - radius * 0.8);
      ctx.fill();
      // eyes
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(cx - radius * 0.3, cy - radius * 0.2, radius * 0.18, 0, Math.PI * 2);
      ctx.arc(cx + radius * 0.3, cy - radius * 0.2, radius * 0.18, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#2c3e50';
      ctx.beginPath();
      ctx.arc(cx - radius * 0.3, cy - radius * 0.2, radius * 0.08, 0, Math.PI * 2);
      ctx.arc(cx + radius * 0.3, cy - radius * 0.2, radius * 0.08, 0, Math.PI * 2);
      ctx.fill();
      // mouth
      ctx.strokeStyle = '#e67e22';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy + radius * 0.2, radius * 0.4, 0, Math.PI);
      ctx.stroke();
      // arms
      ctx.strokeStyle = '#f1c40f';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(cx - radius * 0.9, cy);
      ctx.lineTo(cx - radius * 1.2, cy + radius * 0.3);
      ctx.moveTo(cx + radius * 0.9, cy);
      ctx.lineTo(cx + radius * 1.2, cy + radius * 0.3);
      ctx.stroke();
    }
  }

  // Flame projectile from boss
  class Flame {
    constructor(x,y,vx,vy) {
      this.x = x;
      this.y = y;
      this.vx = vx;
      this.vy = vy;
      this.w = 12;
      this.h = 12;
      this.alive = true;
    }
    update() {
      this.x += this.vx;
      this.y += this.vy;
      // simple gravity for flame
      this.vy += 0.05;
      if (this.x < 0 || this.x > WORLD_WIDTH) this.alive = false;
      if (this.y > WORLD_HEIGHT) this.alive = false;
      // collision with player
      if (rectIntersect(this, player)) {
        this.alive = false;
        damagePlayer(20);
      }
    }
    draw() {
      const cx = this.x - cameraX;
      const cy = this.y;
      ctx.fillStyle = '#e74c3c';
      ctx.beginPath();
      ctx.arc(cx + this.w/2, cy + this.h/2, this.w/2, 0, Math.PI*2);
      ctx.fill();
    }
  }

  // PowerUp class (including mushroom)
  class PowerUp {
    constructor(x,y,type) {
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
      if (this.type === 'life') color = '#9b59b6';
      else if (this.type === 'wings') color = '#3498db';
      else if (this.type === 'mushroom') color = '#e74c3c';
      else color = '#f39c12';
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(this.x - cameraX + this.w/2, this.y + this.h/2, this.w/2, 0, Math.PI*2);
      ctx.fill();
      if (this.type === 'mushroom') {
        // add dots to mushroom
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(this.x - cameraX + this.w/2 - 7, this.y + this.h/2 - 5, 3, 0, Math.PI*2);
        ctx.arc(this.x - cameraX + this.w/2 + 5, this.y + this.h/2 + 2, 3, 0, Math.PI*2);
        ctx.fill();
      }
    }
  }

  // Boss class with attack
  class Boss {
    constructor() {
      this.x = 3100;
      // Position the boss so that its bottom rests on the ground.  Use
      // GROUND_Y and its own height to compute y.
      this.w = 160;
      this.h = 200;
      this.y = GROUND_Y - this.h;
      this.health = 30;
      this.alive = false;
      this.attackCooldown = 120;
    }
    update() {
      if (!this.alive) return;
      // Attack: shoot flame periodically
      this.attackCooldown--;
      if (this.attackCooldown <= 0) {
        this.attackCooldown = 80 + Math.floor(Math.random()*40);
        // spawn flame aimed roughly toward player
        const fx = this.x;
        const fy = this.y + this.h/3;
        const dir = player.x > this.x ? 1 : -1;
        const speed = 3;
        flames.push(new Flame(fx, fy, -speed, 0));
        // spawn additional flames upward
        flames.push(new Flame(fx, fy, -speed, -1.5));
      }
    }
    draw() {
      if (!this.alive) return;
      const bx = this.x - cameraX;
      const by = this.y;
      const w = this.w;
      const h = this.h;
      // Body: draw a big red oval to make the boss feel more organic
      ctx.fillStyle = '#c0392b';
      ctx.beginPath();
      ctx.ellipse(bx + w / 2, by + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
      ctx.fill();
      // Wings: triangles extending from sides
      ctx.fillStyle = '#e74c3c';
      ctx.beginPath();
      ctx.moveTo(bx - 40, by + h * 0.4);
      ctx.lineTo(bx - 100, by + h * 0.1);
      ctx.lineTo(bx - 80, by + h * 0.6);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(bx + w + 40, by + h * 0.4);
      ctx.lineTo(bx + w + 100, by + h * 0.1);
      ctx.lineTo(bx + w + 80, by + h * 0.6);
      ctx.fill();
      // Horns: big horns at the top
      ctx.fillStyle = '#a93226';
      ctx.beginPath();
      ctx.moveTo(bx + w * 0.2, by);
      ctx.lineTo(bx + w * 0.35, by - 60);
      ctx.lineTo(bx + w * 0.5, by);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(bx + w * 0.5, by);
      ctx.lineTo(bx + w * 0.65, by - 60);
      ctx.lineTo(bx + w * 0.8, by);
      ctx.fill();
      // Eyes
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.ellipse(bx + w * 0.35, by + h * 0.35, 12, 8, 0, 0, Math.PI * 2);
      ctx.ellipse(bx + w * 0.65, by + h * 0.35, 12, 8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#2c3e50';
      ctx.beginPath();
      ctx.ellipse(bx + w * 0.35, by + h * 0.35, 6, 4, 0, 0, Math.PI * 2);
      ctx.ellipse(bx + w * 0.65, by + h * 0.35, 6, 4, 0, 0, Math.PI * 2);
      ctx.fill();
      // Mouth
      ctx.fillStyle = '#e74c3c';
      ctx.beginPath();
      ctx.moveTo(bx + w * 0.3, by + h * 0.6);
      ctx.bezierCurveTo(bx + w * 0.4, by + h * 0.8, bx + w * 0.6, by + h * 0.8, bx + w * 0.7, by + h * 0.6);
      ctx.lineTo(bx + w * 0.3, by + h * 0.6);
      ctx.fill();
    }
  }

  // Utility: rectangle intersection
  function rectIntersect(a,b) {
    const aw = a.w || a.width;
    const ah = a.h || a.height;
    const bw = b.w || b.width;
    const bh = b.h || b.height;
    return a.x < b.x + bw && a.x + aw > b.x && a.y < b.y + bh && a.y + ah > b.y;
  }

  // Damage player and handle lives
  function damagePlayer(amount) {
    if (player.invincibleTime > 0) return;
    player.health -= amount;
    player.invincibleTime = 60;
    if (player.health <= 0) {
      player.lives--;
      player.health = 100;
      // Reset player position
      player.x = 50;
      // Respawn the player just above the ground after losing a life
      player.y = GROUND_Y - player.height - 20;
      cameraX = 0;
      if (player.lives <= 0) {
        gameOver = true;
        showLose();
      }
    }
  }

  // Spawn power-ups from blocks
  function spawnPowerUp(blk) {
    let type;
    if (blk.powerType) {
      type = blk.powerType;
    } else {
      const types = ['life','wings'];
      type = types[Math.floor(Math.random()*types.length)];
    }
    powerups.push(new PowerUp(blk.x + blk.w/2 - 15, blk.y - 40, type));
  }

  // Apply power-up
  function applyPowerUp(type) {
    if (type === 'mushroom' || type === 'gun') {
      player.hasGun = true;
    } else if (type === 'life') {
      player.lives++;
    } else if (type === 'wings') {
      player.wingTime = 800;
    }
  }

  // Setup level: ground, platforms, blocks, monsters
  function setupLevel() {
    // Ground and platforms
    // The ground occupies the full width and sits at GROUND_Y, with height
    // GROUND_HEIGHT.  By positioning the ground relative to GROUND_Y we
    // ensure that the bottom of the scene remains visible even when the
    // mobile browser hides part of the canvas behind UI chrome.
    platforms.push({ x: 0, y: GROUND_Y, w: WORLD_WIDTH, h: GROUND_HEIGHT });
    // Mid-level platforms spaced upwards from the ground.  These serve as
    // stepping stones for the player to reach the high platforms and make
    // better use of vertical screen space.
    platforms.push({ x: 300, y: GROUND_Y - 130, w: 200, h: 20 });
    platforms.push({ x: 650, y: GROUND_Y - 210, w: 200, h: 20 });
    platforms.push({ x: 1000, y: GROUND_Y - 280, w: 200, h: 20 });
    platforms.push({ x: 1400, y: GROUND_Y - 180, w: 200, h: 20 });
    platforms.push({ x: 1800, y: GROUND_Y - 330, w: 200, h: 20 });
    platforms.push({ x: 2200, y: GROUND_Y - 230, w: 200, h: 20 });
    platforms.push({ x: 2600, y: GROUND_Y - 380, w: 200, h: 20 });
    // High platforms near the top of the screen.  These encourage players to
    // explore vertically and fill empty space on tall mobile displays.
    platforms.push({ x: 600, y: GROUND_Y - 480, w: 200, h: 20 });
    platforms.push({ x: 1600, y: GROUND_Y - 540, w: 200, h: 20 });
    platforms.push({ x: 2400, y: GROUND_Y - 600, w: 200, h: 20 });
    platforms.push({ x: 3000, y: GROUND_Y - 680, w: 200, h: 20 });
    // Even higher platforms to challenge players and reduce empty top space
    platforms.push({ x: 1200, y: GROUND_Y - 720, w: 200, h: 20 });
    platforms.push({ x: 2000, y: GROUND_Y - 800, w: 200, h: 20 });
    // Blocks that release power-ups.  Their positions are anchored off the
    // ground so they remain visible on tall mobile screens.  The first
    // block always spawns a mushroom that grants the gun ability.
    blocks.push({ x: 350,  y: GROUND_Y - 160, w: 40, h: 40, active: true, powerType: 'mushroom' });
    blocks.push({ x: 700,  y: GROUND_Y - 240, w: 40, h: 40, active: true });
    blocks.push({ x: 1050, y: GROUND_Y - 310, w: 40, h: 40, active: true });
    blocks.push({ x: 1750, y: GROUND_Y - 260, w: 40, h: 40, active: true });
    blocks.push({ x: 2100, y: GROUND_Y - 410, w: 40, h: 40, active: true });
    blocks.push({ x: 2500, y: GROUND_Y - 480, w: 40, h: 40, active: true });
    // Monsters spawn primarily on the ground.  Additional monsters are placed
    // on some of the mid platforms to increase challenge.  Feel free to
    // modify this list to adjust difficulty.
    const monsterPositions = [400, 550, 700, 850, 1000, 1150, 1300, 1450, 1600, 1750, 1900, 2050, 2200, 2350, 2500, 2700, 2900];
    monsterPositions.forEach(x => {
      monsters.push(new Monster(x, GROUND_Y - 40));
    });
    // Additional monsters on elevated platforms
    monsters.push(new Monster(600,  GROUND_Y - 130 - 40));
    monsters.push(new Monster(1600, GROUND_Y - 210 - 40));
    monsters.push(new Monster(2400, GROUND_Y - 280 - 40));
    // Initialize boss
    boss = new Boss();
  }

  // Start game after character selection
  function startGame(img) {
    player = new Player(img);
    player.x = 50;
    // Spawn the player slightly above the ground so they land smoothly on
    // game start.  Use GROUND_Y to position relative to the raised baseline.
    player.y = GROUND_Y - player.height - 20;
    player.hasGun = false;
    setupLevel();
    charSelected = true;
    startScreen.style.display = 'none';
    canvas.style.display = 'block';
    controls.style.display = 'flex';
    bossBar.style.display = 'none';
    victory.style.display = 'none';
    requestAnimationFrame(gameLoop);
  }

  // Character selection handlers
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

  // Touch controls
  function bindBtn(btn,key) {
    const tap = key === 'jump' || key === 'shoot';
    btn.addEventListener('touchstart',(e) => { e.preventDefault(); input[key] = true; });
    btn.addEventListener('touchend',(e) => { e.preventDefault(); if (!tap) input[key] = false; });
    btn.addEventListener('mousedown',(e) => { e.preventDefault(); input[key] = true; });
    btn.addEventListener('mouseup',(e) => { e.preventDefault(); if (!tap) input[key] = false; });
    btn.addEventListener('mouseleave',(e) => { if (!tap) input[key] = false; });
  }
  bindBtn(leftBtn,'left');
  bindBtn(rightBtn,'right');
  bindBtn(jumpBtn,'jump');
  bindBtn(shootBtn,'shoot');

  // Game loop
  function gameLoop() {
    if (!charSelected) return;
    update();
    draw();
    if (!gameOver) requestAnimationFrame(gameLoop);
  }

  function update() {
    player.update();
    // Camera follow horizontally
    const margin = canvas.width/3;
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
    // Flames (boss attacks)
    for (let i = flames.length-1; i>=0; i--) {
      flames[i].update();
      if (!flames[i].alive) flames.splice(i,1);
    }
    // Monsters
    for (const m of monsters) {
      if (m.alive) m.update();
    }
    // Collision with monsters
    for (const m of monsters) {
      if (!m.alive) continue;
      if (rectIntersect(player, m)) {
        damagePlayer(20);
        // small knockback
        player.vx = -player.direction * 2;
        break;
      }
    }
    // Collision with boss
    if (boss && boss.alive && rectIntersect(player, boss)) {
      damagePlayer(40);
    }
    // Powerups
    for (let i = powerups.length-1; i>=0; i--) {
      powerups[i].update();
      if (!powerups[i].alive) powerups.splice(i,1);
    }
    // Boss spawn and update
    if (!boss.alive && player.x > 3000) {
      boss.alive = true;
      bossBar.style.display = 'block';
    }
    if (boss && boss.alive) {
      boss.update();
      // Update boss health bar based on current health (30 is max health)
      const ratio = Math.max(0, boss.health / 30);
      bossBarInner.style.width = (ratio * 100) + '%';
    }
    // Shooting
    if (input.shoot && shootCooldown <= 0) {
      player.shoot();
      shootCooldown = player.hasGun ? 10 : 20;
    }
    if (shootCooldown > 0) shootCooldown--;
  }

  function draw() {
    ctx.clearRect(0,0,canvas.width,canvas.height);
    // Sky
    const grad = ctx.createLinearGradient(0,0,0,canvas.height);
    grad.addColorStop(0,'#b5dfff');
    grad.addColorStop(1,'#e0f7ff');
    ctx.fillStyle = grad;
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
    ctx.fillRect(3050 - cameraX, WORLD_HEIGHT - 250, 200, 250);
    ctx.fillStyle = '#2c3e50';
    ctx.fillRect(3125 - cameraX, WORLD_HEIGHT - 300, 50, 50);
    // Powerups
    for (const pu of powerups) pu.draw();
    // Monsters
    for (const m of monsters) if (m.alive) m.draw();
    // Flames
    for (const fl of flames) fl.draw();
    // Boss
    if (boss) boss.draw();
    // Bullets
    for (const b of bullets) b.draw();
    // Player
    player.draw();
    // UI: health bar and lives
    ctx.fillStyle = '#000';
    ctx.font = '16px sans-serif';
    ctx.fillText('Lives: ' + player.lives, 10, 20);
    // Health bar background
    const barX = 10;
    const barY = 35;
    const barW = 120;
    const barH = 10;
    ctx.fillStyle = '#ccc';
    ctx.fillRect(barX, barY, barW, barH);
    ctx.fillStyle = '#e74c3c';
    ctx.fillRect(barX, barY, (player.health/100)*barW, barH);
    ctx.strokeStyle = '#000';
    ctx.strokeRect(barX, barY, barW, barH);
    // Other statuses
    if (player.hasGun) ctx.fillText('Gun: ON', 10, 60);
    if (player.wingTime > 0) ctx.fillText('Wings: ' + Math.ceil(player.wingTime/60), 10, 80);
  }

  // Game over win
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

  // Fireworks and celebration with jumping player animation
  const particles = [];
  let winAnimTime = 0;
  function startFireworks() {
    const spawn = () => {
      for (let i=0; i<30; i++) particles.push(createParticle());
    };
    spawn();
    const interval = setInterval(spawn, 800);
    setTimeout(() => clearInterval(interval), 5000);
    winAnimTime = 0;
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
    // draw dark overlay
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.fillRect(0,0,canvas.width,canvas.height);
    // draw world below faintly
    // optional: just draw background
    // update particles
    for (let i=particles.length-1; i>=0; i--) {
      const p = particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.05;
      p.life--;
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x, p.y, 3,3);
      if (p.life <= 0) particles.splice(i,1);
    }
    // animate player jumping
    winAnimTime += 0.05;
    const jumpOffset = Math.sin(winAnimTime * Math.PI) * 20;
    player.draw(jumpOffset);
    if (particles.length > 0 || winAnimTime < 6) {
      requestAnimationFrame(animateFireworks);
    }
  }
})();
