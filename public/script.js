
const socket = io();

// Elements
const usernameInput = document.getElementById('usernameInput');
const connectBtn = document.getElementById('connectBtn');
const disconnectBtn = document.getElementById('disconnectBtn');
const connectionStatus = document.getElementById('connectionStatus');
const viewerCount = document.getElementById('viewerCount');
const activeBalls = document.getElementById('activeBalls');
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// Game state
let isConnected = false;
let balls = [];
let effects = [];
let animationId;

// Canvas setup
function resizeCanvas() {
    const container = canvas.parentElement;
    const maxWidth = Math.min(800, container.clientWidth - 40);
    const maxHeight = 600;
    
    canvas.width = maxWidth;
    canvas.height = maxHeight;
}

resizeCanvas();
window.addEventListener('resize', resizeCanvas);

// Event listeners
connectBtn.addEventListener('click', connectToTikTok);
disconnectBtn.addEventListener('click', disconnectFromTikTok);
usernameInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        connectToTikTok();
    }
});

// Socket events
socket.on('tiktok_connected', (data) => {
    if (data.success) {
        isConnected = true;
        updateConnectionStatus('متصل بـ ' + data.username, true);
        connectBtn.disabled = true;
        disconnectBtn.disabled = false;
        usernameInput.disabled = true;
        startGameLoop();
    } else {
        updateConnectionStatus('فشل الاتصال: ' + data.error, false);
    }
});

socket.on('chat_message', (data) => {
    addChatBall(data);
});

socket.on('gift_received', (data) => {
    addGiftEffect(data);
});

socket.on('like_received', (data) => {
    addLikeEffect(data);
});

socket.on('social_event', (data) => {
    addSocialEffect(data);
});

socket.on('room_update', (data) => {
    viewerCount.textContent = data.viewerCount;
});

socket.on('stream_ended', () => {
    disconnectFromTikTok();
});

socket.on('tiktok_error', (error) => {
    console.error('TikTok Error:', error);
});

// Game functions
function connectToTikTok() {
    const username = usernameInput.value.trim();
    if (!username) {
        alert('يرجى إدخال اسم المستخدم');
        return;
    }
    
    updateConnectionStatus('جاري الاتصال...', false);
    connectBtn.disabled = true;
    
    socket.emit('connect_tiktok', username);
}

function disconnectFromTikTok() {
    socket.emit('disconnect_tiktok');
    isConnected = false;
    updateConnectionStatus('غير متصل', false);
    connectBtn.disabled = false;
    disconnectBtn.disabled = true;
    usernameInput.disabled = false;
    viewerCount.textContent = '0';
    stopGameLoop();
    balls = [];
    effects = [];
}

function updateConnectionStatus(message, connected) {
    connectionStatus.textContent = message;
    connectionStatus.className = connected ? 'status connected' : 'status disconnected';
}

function addChatBall(data) {
    const existingBall = balls.find(ball => ball.username === data.username);
    
    if (existingBall) {
        // Update existing ball
        existingBall.message = data.message;
        existingBall.lastActivity = Date.now();
        existingBall.scale = 1.2; // Bounce effect
        existingBall.energy = Math.min(existingBall.energy + 10, 100);
    } else {
        // Create new ball
        const ball = new ChatBall(
            Math.random() * (canvas.width - 120) + 60,
            Math.random() * (canvas.height - 120) + 60,
            data.username,
            data.nickname,
            data.message,
            data.profilePictureUrl
        );
        balls.push(ball);
    }
    
    updateActiveBalls();
}

function addGiftEffect(data) {
    const ball = balls.find(ball => ball.username === data.username);
    if (ball) {
        ball.energy = Math.min(ball.energy + 30, 100);
        ball.scale = 1.5;
        
        // Add gift particles
        for (let i = 0; i < 10; i++) {
            effects.push(new GiftParticle(ball.x, ball.y));
        }
    }
}

function addLikeEffect(data) {
    const ball = balls.find(ball => ball.username === data.username);
    if (ball) {
        ball.size = Math.min(ball.size + 2, 40);
        ball.energy = Math.min(ball.energy + 5, 100);
        
        // Add heart particles
        for (let i = 0; i < 5; i++) {
            effects.push(new HeartParticle(ball.x, ball.y));
        }
    }
}

function addSocialEffect(data) {
    const ball = balls.find(ball => ball.username === data.username);
    if (ball) {
        ball.energy = Math.min(ball.energy + 15, 100);
        effects.push(new SocialParticle(ball.x, ball.y, data.action));
    }
}

function updateActiveBalls() {
    activeBalls.textContent = balls.length;
}

// Game loop
function startGameLoop() {
    if (animationId) return;
    
    function gameLoop() {
        update();
        draw();
        animationId = requestAnimationFrame(gameLoop);
    }
    
    gameLoop();
}

function stopGameLoop() {
    if (animationId) {
        cancelAnimationFrame(animationId);
        animationId = null;
    }
}

function update() {
    const now = Date.now();
    
    // Update balls
    balls.forEach(ball => {
        ball.update(canvas.width, canvas.height);
        
        // Remove inactive balls after 30 seconds
        if (now - ball.lastActivity > 30000) {
            ball.active = false;
        }
    });
    
    // Check ball collisions
    checkBallCollisions();
    
    // Remove inactive balls
    balls = balls.filter(ball => ball.active);
    
    // Update effects
    effects.forEach(effect => effect.update());
    effects = effects.filter(effect => effect.active);
    
    updateActiveBalls();
}

function checkBallCollisions() {
    for (let i = 0; i < balls.length; i++) {
        for (let j = i + 1; j < balls.length; j++) {
            const ball1 = balls[i];
            const ball2 = balls[j];
            
            const dx = ball2.x - ball1.x;
            const dy = ball2.y - ball1.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance < ball1.size + ball2.size) {
                // Collision detected
                const angle = Math.atan2(dy, dx);
                const sin = Math.sin(angle);
                const cos = Math.cos(angle);
                
                // Separate balls
                const overlap = ball1.size + ball2.size - distance;
                ball1.x -= (overlap / 2) * cos;
                ball1.y -= (overlap / 2) * sin;
                ball2.x += (overlap / 2) * cos;
                ball2.y += (overlap / 2) * sin;
                
                // Exchange velocities
                const vx1 = ball1.vx * cos + ball1.vy * sin;
                const vy1 = ball1.vy * cos - ball1.vx * sin;
                const vx2 = ball2.vx * cos + ball2.vy * sin;
                const vy2 = ball2.vy * cos - ball2.vx * sin;
                
                ball1.vx = vx2 * cos - vy1 * sin;
                ball1.vy = vy1 * cos + vx2 * sin;
                ball2.vx = vx1 * cos - vy2 * sin;
                ball2.vy = vy2 * cos + vx1 * sin;
                
                // Add collision effect
                effects.push(new CollisionEffect((ball1.x + ball2.x) / 2, (ball1.y + ball2.y) / 2));
            }
        }
    }
}

function draw() {
    // Clear canvas with gradient
    const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    gradient.addColorStop(0, '#f8f9fa');
    gradient.addColorStop(0.5, '#e9ecef');
    gradient.addColorStop(1, '#dee2e6');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Draw grid
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.05)';
    ctx.lineWidth = 1;
    for (let i = 0; i < canvas.width; i += 30) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i, canvas.height);
        ctx.stroke();
    }
    for (let i = 0; i < canvas.height; i += 30) {
        ctx.beginPath();
        ctx.moveTo(0, i);
        ctx.lineTo(canvas.width, i);
        ctx.stroke();
    }
    
    // Draw effects (behind balls)
    effects.forEach(effect => effect.draw(ctx));
    
    // Draw balls
    balls.forEach(ball => ball.draw(ctx));
}

// ChatBall class
class ChatBall {
    constructor(x, y, username, nickname, message, profilePictureUrl) {
        this.x = x;
        this.y = y;
        this.username = username;
        this.nickname = nickname;
        this.message = message;
        this.profilePictureUrl = profilePictureUrl;
        this.size = 25;
        this.vx = (Math.random() - 0.5) * 2;
        this.vy = (Math.random() - 0.5) * 2;
        this.energy = 100;
        this.scale = 1;
        this.rotation = 0;
        this.lastActivity = Date.now();
        this.active = true;
        this.colors = this.generateColors();
        
        // Load profile image
        if (profilePictureUrl) {
            this.profileImage = new Image();
            this.profileImage.crossOrigin = 'anonymous';
            this.profileImage.src = profilePictureUrl;
        }
    }
    
    generateColors() {
        const colors = [
            '#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4', '#feca57',
            '#ff9ff3', '#54a0ff', '#5f27cd', '#00d2d3', '#ff9f43'
        ];
        return colors[Math.floor(Math.random() * colors.length)];
    }
    
    update(canvasWidth, canvasHeight) {
        // Update position
        this.x += this.vx;
        this.y += this.vy;
        
        // Bounce off walls
        if (this.x - this.size <= 0 || this.x + this.size >= canvasWidth) {
            this.vx = -this.vx;
            this.x = Math.max(this.size, Math.min(canvasWidth - this.size, this.x));
        }
        
        if (this.y - this.size <= 0 || this.y + this.size >= canvasHeight) {
            this.vy = -this.vy;
            this.y = Math.max(this.size, Math.min(canvasHeight - this.size, this.y));
        }
        
        // Update scale (bounce effect)
        if (this.scale > 1) {
            this.scale -= 0.02;
        }
        this.scale = Math.max(1, this.scale);
        
        // Update rotation
        this.rotation += 0.01;
        
        // Decrease energy over time
        this.energy -= 0.1;
        if (this.energy <= 0) {
            this.active = false;
        }
    }
    
    draw(ctx) {
        ctx.save();
        
        // Shadow
        ctx.beginPath();
        ctx.arc(this.x + 3, this.y + 3, this.size * this.scale, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
        ctx.fill();
        
        // Main ball with gradient
        const gradient = ctx.createRadialGradient(
            this.x - this.size/3, this.y - this.size/3, 0,
            this.x, this.y, this.size * this.scale
        );
        gradient.addColorStop(0, this.colors);
        gradient.addColorStop(0.7, this.colors);
        gradient.addColorStop(1, this.colors + '80');
        
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size * this.scale, 0, Math.PI * 2);
        ctx.fillStyle = gradient;
        ctx.fill();
        
        // Profile picture or avatar
        if (this.profileImage && this.profileImage.complete) {
            ctx.save();
            ctx.beginPath();
            ctx.arc(this.x, this.y, (this.size - 5) * this.scale, 0, Math.PI * 2);
            ctx.clip();
            
            const imgSize = (this.size - 5) * 2 * this.scale;
            ctx.drawImage(
                this.profileImage,
                this.x - imgSize/2, this.y - imgSize/2,
                imgSize, imgSize
            );
            ctx.restore();
        } else {
            // Fallback: show first letter
            ctx.fillStyle = 'white';
            ctx.font = `bold ${this.size * this.scale * 0.8}px Cairo`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(
                this.nickname ? this.nickname.charAt(0).toUpperCase() : '👤',
                this.x, this.y
            );
        }
        
        // Border
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size * this.scale, 0, Math.PI * 2);
        ctx.stroke();
        
        // Username
        ctx.fillStyle = '#333';
        ctx.font = 'bold 12px Cairo';
        ctx.textAlign = 'center';
        ctx.fillText(this.nickname || this.username, this.x, this.y - this.size * this.scale - 15);
        
        // Message bubble
        if (this.message) {
            const maxWidth = 100;
            const lines = this.wrapText(ctx, this.message, maxWidth);
            const lineHeight = 14;
            const bubbleHeight = lines.length * lineHeight + 10;
            const bubbleY = this.y + this.size * this.scale + 10;
            
            // Bubble background
            ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
            ctx.beginPath();
            ctx.roundRect(this.x - maxWidth/2, bubbleY, maxWidth, bubbleHeight, 8);
            ctx.fill();
            
            // Bubble border
            ctx.strokeStyle = this.colors;
            ctx.lineWidth = 1;
            ctx.stroke();
            
            // Message text
            ctx.fillStyle = '#333';
            ctx.font = '10px Cairo';
            ctx.textAlign = 'center';
            lines.forEach((line, index) => {
                ctx.fillText(line, this.x, bubbleY + 15 + index * lineHeight);
            });
        }
        
        // Energy bar
        const barWidth = this.size * 2 * this.scale;
        const barHeight = 4;
        const barX = this.x - barWidth / 2;
        const barY = this.y + this.size * this.scale + 5;
        
        // Energy bar background
        ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
        ctx.fillRect(barX, barY, barWidth, barHeight);
        
        // Energy bar fill
        const energyPercent = this.energy / 100;
        ctx.fillStyle = energyPercent > 0.5 ? '#4CAF50' : energyPercent > 0.25 ? '#FFC107' : '#F44336';
        ctx.fillRect(barX, barY, barWidth * energyPercent, barHeight);
        
        ctx.restore();
    }
    
    wrapText(ctx, text, maxWidth) {
        const words = text.split(' ');
        const lines = [];
        let currentLine = words[0];
        
        for (let i = 1; i < words.length; i++) {
            const word = words[i];
            const width = ctx.measureText(currentLine + " " + word).width;
            if (width < maxWidth) {
                currentLine += " " + word;
            } else {
                lines.push(currentLine);
                currentLine = word;
            }
        }
        lines.push(currentLine);
        return lines;
    }
}

// Particle effects
class GiftParticle {
    constructor(x, y) {
        this.x = x + (Math.random() - 0.5) * 20;
        this.y = y + (Math.random() - 0.5) * 20;
        this.vx = (Math.random() - 0.5) * 4;
        this.vy = (Math.random() - 0.5) * 4 - 2;
        this.size = Math.random() * 8 + 4;
        this.life = 60;
        this.maxLife = 60;
        this.active = true;
        this.rotation = 0;
    }
    
    update() {
        this.x += this.vx;
        this.y += this.vy;
        this.vy += 0.1; // gravity
        this.rotation += 0.1;
        this.life--;
        if (this.life <= 0) this.active = false;
    }
    
    draw(ctx) {
        const alpha = this.life / this.maxLife;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(this.x, this.y);
        ctx.rotate(this.rotation);
        
        // Draw gift box
        ctx.fillStyle = '#FFD700';
        ctx.fillRect(-this.size/2, -this.size/2, this.size, this.size);
        ctx.fillStyle = '#FF6B6B';
        ctx.fillRect(-this.size/2, -2, this.size, 4);
        ctx.fillRect(-2, -this.size/2, 4, this.size);
        
        ctx.restore();
    }
}

class HeartParticle {
    constructor(x, y) {
        this.x = x + (Math.random() - 0.5) * 20;
        this.y = y + (Math.random() - 0.5) * 20;
        this.vx = (Math.random() - 0.5) * 2;
        this.vy = -Math.random() * 3 - 1;
        this.size = Math.random() * 6 + 4;
        this.life = 90;
        this.maxLife = 90;
        this.active = true;
    }
    
    update() {
        this.x += this.vx;
        this.y += this.vy;
        this.vy += 0.05; // slight gravity
        this.life--;
        if (this.life <= 0) this.active = false;
    }
    
    draw(ctx) {
        const alpha = this.life / this.maxLife;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = '#FF69B4';
        ctx.font = `${this.size}px Arial`;
        ctx.textAlign = 'center';
        ctx.fillText('❤️', this.x, this.y);
        ctx.restore();
    }
}

class SocialParticle {
    constructor(x, y, action) {
        this.x = x;
        this.y = y;
        this.vx = 0;
        this.vy = -1;
        this.life = 120;
        this.maxLife = 120;
        this.active = true;
        this.text = this.getActionText(action);
    }
    
    getActionText(action) {
        switch(action) {
            case 'follow': return '👥';
            case 'share': return '📤';
            default: return '⚡';
        }
    }
    
    update() {
        this.x += this.vx;
        this.y += this.vy;
        this.life--;
        if (this.life <= 0) this.active = false;
    }
    
    draw(ctx) {
        const alpha = this.life / this.maxLife;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.font = '20px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(this.text, this.x, this.y);
        ctx.restore();
    }
}

class CollisionEffect {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.particles = [];
        this.life = 30;
        this.maxLife = 30;
        this.active = true;
        
        for (let i = 0; i < 8; i++) {
            this.particles.push({
                x: x,
                y: y,
                vx: (Math.random() - 0.5) * 6,
                vy: (Math.random() - 0.5) * 6,
                size: Math.random() * 4 + 2,
                life: 30,
                color: `hsl(${Math.random() * 360}, 70%, 60%)`
            });
        }
    }
    
    update() {
        this.particles.forEach(particle => {
            particle.x += particle.vx;
            particle.y += particle.vy;
            particle.vx *= 0.95;
            particle.vy *= 0.95;
            particle.size *= 0.98;
            particle.life--;
        });
        
        this.particles = this.particles.filter(p => p.life > 0);
        this.life--;
        if (this.life <= 0 || this.particles.length === 0) {
            this.active = false;
        }
    }
    
    draw(ctx) {
        this.particles.forEach(particle => {
            const alpha = particle.life / 30;
            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.fillStyle = particle.color;
            ctx.beginPath();
            ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        });
    }
}

// Add CanvasRenderingContext2D.roundRect polyfill for older browsers
if (!CanvasRenderingContext2D.prototype.roundRect) {
    CanvasRenderingContext2D.prototype.roundRect = function(x, y, width, height, radius) {
        this.beginPath();
        this.moveTo(x + radius, y);
        this.lineTo(x + width - radius, y);
        this.quadraticCurveTo(x + width, y, x + width, y + radius);
        this.lineTo(x + width, y + height - radius);
        this.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
        this.lineTo(x + radius, y + height);
        this.quadraticCurveTo(x, y + height, x, y + height - radius);
        this.lineTo(x, y + radius);
        this.quadraticCurveTo(x, y, x + radius, y);
        this.closePath();
        return this;
    };
}

// Initialize
updateConnectionStatus('غير متصل', false);
