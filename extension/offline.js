const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const scoreEl = document.getElementById('score');
const scoreContainer = document.getElementById('scoreContainer');
const instructions = document.getElementById('instructions');
const gameOverEl = document.getElementById('gameOver');
const finalScoreEl = document.getElementById('finalScore');
const restartBtn = document.getElementById('restartBtn');

// Game Settings
const CONFIG = {
    gravity: 0.18,
    floatStrength: -4.5,
    cloudSpeed: 2.5,
    spawnRate: 1500, // ms
    gapSize: 280,
    orbRadius: 10,
    particleCount: 15
};

// State
let gameActive = false;
let score = 0;
let animationId;
let lastTime = 0;
let spawnTimer = 0;

// Player
const player = {
    x: 150,
    y: 0,
    velocity: 0,
    targetY: 0,
    particles: []
};

// Obstacles
let clouds = [];

function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    if (!gameActive) player.y = canvas.height / 2;
}

window.addEventListener('resize', resize);
resize();

// Particle System for the Orb
class Particle {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.size = Math.random() * 3 + 1;
        this.speedX = Math.random() * -2 - 1;
        this.speedY = (Math.random() - 0.5) * 1;
        this.opacity = 1;
    }
    update() {
        this.x += this.speedX;
        this.y += this.speedY;
        this.opacity -= 0.02;
    }
    draw() {
        ctx.fillStyle = `rgba(255, 255, 255, ${this.opacity})`;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fill();
    }
}

function handleInput() {
    if (!gameActive && gameOverEl.style.display !== 'block') {
        startGame();
    } else if (gameActive) {
        player.velocity = CONFIG.floatStrength;
        // Add burst of particles on jump
        for (let i = 0; i < 5; i++) {
            player.particles.push(new Particle(player.x, player.y));
        }
    }
}

window.addEventListener('keydown', (e) => {
    if (e.code === 'Space') {
        e.preventDefault();
        handleInput();
    }
});

window.addEventListener('mousedown', (e) => {
    if (e.target.tagName !== 'BUTTON') {
        handleInput();
    }
});

function startGame() {
    gameActive = true;
    score = 0;
    clouds = [];
    player.y = canvas.height / 2;
    player.velocity = 0;
    player.particles = [];

    instructions.classList.add('hidden');
    scoreContainer.style.display = 'block';
    gameOverEl.style.display = 'none';

    lastTime = performance.now();
    animate();
}

function stopGame() {
    gameActive = false;
    cancelAnimationFrame(animationId);
    finalScoreEl.textContent = Math.floor(score);
    gameOverEl.style.display = 'block';
    scoreContainer.style.display = 'none';
}

function createCloud() {
    const minHeight = 100;
    const maxHeight = canvas.height - CONFIG.gapSize - minHeight;
    const topHeight = Math.random() * (maxHeight - minHeight) + minHeight;

    clouds.push({
        x: canvas.width + 100,
        topHeight: topHeight,
        bottomY: topHeight + CONFIG.gapSize,
        passed: false,
        noise: Math.random() * 50 // Adds organic variation to the shape
    });
}

function update(deltaTime) {
    // Player physics
    player.velocity += CONFIG.gravity;
    player.y += player.velocity;

    // Bounds check
    if (player.y + CONFIG.orbRadius > canvas.height || player.y - CONFIG.orbRadius < 0) {
        stopGame();
    }

    // Spawn obstacles
    spawnTimer += deltaTime;
    if (spawnTimer > CONFIG.spawnRate) {
        createCloud();
        spawnTimer = 0;
    }

    // Update Particles
    if (Math.random() > 0.5) {
        player.particles.push(new Particle(player.x, player.y));
    }
    player.particles.forEach((p, i) => {
        p.update();
        if (p.opacity <= 0) player.particles.splice(i, 1);
    });

    // Update Clouds
    clouds.forEach((cloud, index) => {
        cloud.x -= CONFIG.cloudSpeed;

        // collision detection (refined with padding)
        const hitPadding = 5;
        if (
            player.x + CONFIG.orbRadius - hitPadding > cloud.x &&
            player.x - CONFIG.orbRadius + hitPadding < cloud.x + 80
        ) {
            if (player.y - CONFIG.orbRadius + hitPadding < cloud.topHeight ||
                player.y + CONFIG.orbRadius - hitPadding > cloud.bottomY) {
                stopGame();
            }
        }

        // Score
        if (!cloud.passed && cloud.x + 40 < player.x) {
            cloud.passed = true;
            score += 1;
            scoreEl.textContent = score;
        }

        // Remove offscreen
        if (cloud.x < -200) {
            clouds.splice(index, 1);
        }
    });
}

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw Particles
    player.particles.forEach(p => p.draw());

    // Draw Organic Obstacles (Soft blurred shapes)
    ctx.shadowBlur = 40;
    clouds.forEach(cloud => {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
        ctx.shadowColor = 'rgba(255, 255, 255, 0.1)';

        // Organic top part
        drawOrganicCloud(cloud.x, 0, 80, cloud.topHeight, true);

        // Organic bottom part
        drawOrganicCloud(cloud.x, cloud.bottomY, 80, canvas.height - cloud.bottomY, false);
    });
    ctx.shadowBlur = 0;

    // Draw Player (The Orb)
    const gradient = ctx.createRadialGradient(player.x, player.y, 0, player.x, player.y, CONFIG.orbRadius * 2);
    gradient.addColorStop(0, '#fff');
    gradient.addColorStop(0.3, 'rgba(255,255,255,0.8)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');

    ctx.beginPath();
    ctx.arc(player.x, player.y, CONFIG.orbRadius * 2.5, 0, Math.PI * 2);
    ctx.fillStyle = gradient;
    ctx.fill();

    // Solid core
    ctx.beginPath();
    ctx.arc(player.x, player.y, CONFIG.orbRadius, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.fill();
}

function drawOrganicCloud(x, y, w, h, isTop) {
    const radius = 40;
    ctx.beginPath();
    if (isTop) {
        ctx.roundRect(x, y - 50, w, h + 50, [0, 0, radius, radius]);
    } else {
        ctx.roundRect(x, y, w, h + 50, [radius, radius, 0, 0]);
    }
    ctx.fill();
}

function animate(time = 0) {
    if (!gameActive) return;
    const deltaTime = time - lastTime;
    lastTime = time;

    update(deltaTime);
    draw();
    animationId = requestAnimationFrame(animate);
}

restartBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    startGame();
});

// Initial screen draw
ctx.fillStyle = '#fff';
ctx.textAlign = 'center';
ctx.font = '200 14px Inter';
draw();
