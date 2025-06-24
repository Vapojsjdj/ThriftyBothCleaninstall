
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
let guns = [];
let animationId;
let audioEnabled = true;

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
if (connectBtn) connectBtn.addEventListener('click', connectToTikTok);
if (disconnectBtn) disconnectBtn.addEventListener('click', disconnectFromTikTok);
if (usernameInput) {
    usernameInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            connectToTikTok();
        }
    });
}

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

// Enhanced auto-reconnect with retry logic
let reconnectAttempts = 0;
const maxReconnectAttempts = 5;

socket.on('disconnect', () => {
    if (isConnected) {
        console.log('Connection lost, attempting to reconnect...');
        updateConnectionStatus('انقطع الاتصال، جاري المحاولة مرة أخرى...', false);
        
        const attemptReconnect = () => {
            if (reconnectAttempts < maxReconnectAttempts && !socket.connected) {
                reconnectAttempts++;
                console.log(`Reconnection attempt ${reconnectAttempts}/${maxReconnectAttempts}`);
                
                setTimeout(() => {
                    if (!socket.connected) {
                        socket.connect();
                        setTimeout(attemptReconnect, 3000);
                    }
                }, 2000 * reconnectAttempts); // Exponential backoff
            } else if (reconnectAttempts >= maxReconnectAttempts) {
                updateConnectionStatus('فشل في الاتصال، يرجى إعادة تحميل الصفحة', false);
            }
        };
        
        attemptReconnect();
    }
});

// Handle successful reconnection
socket.on('connect', () => {
    reconnectAttempts = 0; // Reset attempts on successful connection
    
    if (isConnected && usernameInput.value.trim()) {
        console.log('Reconnected, restoring TikTok connection...');
        updateConnectionStatus('جاري إعادة الاتصال...', false);
        socket.emit('connect_tiktok', usernameInput.value.trim());
    }
});

// Handle TikTok-specific errors
socket.on('tiktok_error', (error) => {
    console.log('TikTok Error:', error);
    updateConnectionStatus('خطأ في الاتصال: ' + (error.message || 'Unknown error'), false);
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
        playSound('new_chat');
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
        playSound('new_chat');
    }
    
    updateActiveBalls();
}

function spawnGun() {
    if (guns.length < 3) { // Maximum 3 guns at once
        const gun = new Gun(
            Math.random() * (canvas.width - 60) + 30,
            Math.random() * (canvas.height - 60) + 30
        );
        guns.push(gun);
        playSound('spawn_gun');
    }
}

function playSound(type) {
    if (!audioEnabled) return;
    
    try {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        switch(type) {
            case 'shoot':
                oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
                oscillator.frequency.exponentialRampToValueAtTime(200, audioContext.currentTime + 0.1);
                gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
                gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1);
                oscillator.start();
                oscillator.stop(audioContext.currentTime + 0.1);
                break;
            case 'pickup':
                oscillator.frequency.setValueAtTime(440, audioContext.currentTime);
                oscillator.frequency.exponentialRampToValueAtTime(880, audioContext.currentTime + 0.1);
                gainNode.gain.setValueAtTime(0.2, audioContext.currentTime);
                gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1);
                oscillator.start();
                oscillator.stop(audioContext.currentTime + 0.1);
                break;
            case 'hit':
                oscillator.frequency.setValueAtTime(300, audioContext.currentTime);
                oscillator.frequency.exponentialRampToValueAtTime(100, audioContext.currentTime + 0.2);
                gainNode.gain.setValueAtTime(0.4, audioContext.currentTime);
                gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.2);
                oscillator.start();
                oscillator.stop(audioContext.currentTime + 0.2);
                break;
            case 'collision':
                oscillator.frequency.setValueAtTime(150, audioContext.currentTime);
                oscillator.frequency.exponentialRampToValueAtTime(50, audioContext.currentTime + 0.15);
                gainNode.gain.setValueAtTime(0.2, audioContext.currentTime);
                gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.15);
                oscillator.start();
                oscillator.stop(audioContext.currentTime + 0.15);
                break;
            case 'spawn_gun':
                oscillator.frequency.setValueAtTime(200, audioContext.currentTime);
                oscillator.frequency.exponentialRampToValueAtTime(400, audioContext.currentTime + 0.3);
                gainNode.gain.setValueAtTime(0.15, audioContext.currentTime);
                gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
                oscillator.start();
                oscillator.stop(audioContext.currentTime + 0.3);
                break;
            case 'new_chat':
                oscillator.frequency.setValueAtTime(523, audioContext.currentTime); // C5
                oscillator.frequency.setValueAtTime(659, audioContext.currentTime + 0.1); // E5
                gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
                gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.2);
                oscillator.start();
                oscillator.stop(audioContext.currentTime + 0.2);
                break;
            case 'gift':
                // Play a nice gift sound
                oscillator.frequency.setValueAtTime(523, audioContext.currentTime); // C5
                oscillator.frequency.setValueAtTime(659, audioContext.currentTime + 0.1); // E5
                oscillator.frequency.setValueAtTime(784, audioContext.currentTime + 0.2); // G5
                gainNode.gain.setValueAtTime(0.2, audioContext.currentTime);
                gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
                oscillator.start();
                oscillator.stop(audioContext.currentTime + 0.3);
                break;
            case 'like':
                oscillator.frequency.setValueAtTime(600, audioContext.currentTime);
                oscillator.frequency.setValueAtTime(800, audioContext.currentTime + 0.05);
                gainNode.gain.setValueAtTime(0.15, audioContext.currentTime);
                gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1);
                oscillator.start();
                oscillator.stop(audioContext.currentTime + 0.1);
                break;
            case 'death':
                oscillator.frequency.setValueAtTime(400, audioContext.currentTime);
                oscillator.frequency.exponentialRampToValueAtTime(50, audioContext.currentTime + 0.5);
                gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
                gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
                oscillator.start();
                oscillator.stop(audioContext.currentTime + 0.5);
                break;
        }
    } catch (e) {
        console.log('Audio not supported');
    }
}

function addGiftEffect(data) {
    const ball = balls.find(ball => ball.username === data.username);
    if (ball) {
        ball.energy = Math.min(ball.energy + 30, 100);
        ball.scale = 1.5;
        playSound('gift');
        
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
        playSound('like');
        
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
    
    // Spawn guns randomly
    if (Math.random() < 0.003 && isConnected) {
        spawnGun();
    }
    
    // Update balls
    balls.forEach(ball => {
        ball.update(canvas.width, canvas.height);
        
        // Check gun pickup
        guns.forEach((gun, gunIndex) => {
            const dx = ball.x - gun.x;
            const dy = ball.y - gun.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance < ball.size + 15 && !ball.hasGun) {
                ball.hasGun = true;
                ball.gunCooldown = 0;
                guns.splice(gunIndex, 1);
                playSound('pickup');
                effects.push(new PickupEffect(gun.x, gun.y));
            }
        });
        
        // Auto-shoot at nearest ball
        if (ball.hasGun && ball.gunCooldown <= 0) {
            const nearestBall = findNearestBall(ball);
            if (nearestBall && getDistance(ball, nearestBall) < 200) {
                shootBullet(ball, nearestBall);
                ball.gunCooldown = 60; // 1 second cooldown at 60fps
                playSound('shoot');
            }
        }
        
        if (ball.gunCooldown > 0) {
            ball.gunCooldown--;
        }
        
        // Remove inactive balls after 30 seconds
        if (now - ball.lastActivity > 30000) {
            ball.active = false;
        }
        
        // Mark ball as inactive if energy reaches zero
        if (ball.energy <= 0) {
            ball.active = false;
        }
    });
    
    // Update bullets
    effects.forEach(effect => {
        effect.update();
        
        // Check bullet collisions
        if (effect instanceof Bullet) {
            balls.forEach(ball => {
                if (ball !== effect.shooter) {
                    const dx = ball.x - effect.x;
                    const dy = ball.y - effect.y;
                    const distance = Math.sqrt(dx * dx + dy * dy);
                    
                    if (distance < ball.size + 3) {
                        // Hit!
                        ball.energy = Math.max(ball.energy - 20, 0);
                        ball.scale = 1.3;
                        effect.active = false;
                        playSound('hit');
                        
                        // Add hit effect
                        effects.push(new HitEffect(ball.x, ball.y));
                        
                        // If ball dies, transfer gun to shooter
                        if (ball.energy <= 0) {
                            ball.active = false;
                            playSound('death');
                            if (!effect.shooter.hasGun) {
                                effect.shooter.hasGun = ball.hasGun;
                            }
                        }
                    }
                }
            });
        }
    });
    
    // Check ball collisions
    checkBallCollisions();
    
    // Remove inactive balls
    balls = balls.filter(ball => ball.active);
    
    // Update guns
    guns.forEach(gun => gun.update());
    
    // Update effects
    effects.forEach(effect => effect.update());
    effects = effects.filter(effect => effect.active);
    
    updateActiveBalls();
}

function findNearestBall(currentBall) {
    let nearest = null;
    let minDistance = Infinity;
    
    balls.forEach(ball => {
        if (ball !== currentBall && ball.active) {
            const distance = getDistance(currentBall, ball);
            if (distance < minDistance) {
                minDistance = distance;
                nearest = ball;
            }
        }
    });
    
    return nearest;
}

function getDistance(ball1, ball2) {
    const dx = ball1.x - ball2.x;
    const dy = ball1.y - ball2.y;
    return Math.sqrt(dx * dx + dy * dy);
}

function shootBullet(shooter, target) {
    const dx = target.x - shooter.x;
    const dy = target.y - shooter.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    const bullet = new Bullet(
        shooter.x,
        shooter.y,
        (dx / distance) * 8,
        (dy / distance) * 8,
        shooter
    );
    
    effects.push(bullet);
    effects.push(new MuzzleFlash(shooter.x, shooter.y));
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
                playSound('collision');
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
    
    // Draw guns
    guns.forEach(gun => gun.draw(ctx));
    
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
        this.hasGun = false;
        this.gunCooldown = 0;
        
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
        
        // Gun indicator
        if (this.hasGun) {
            ctx.fillStyle = '#FFD700';
            ctx.font = '16px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('🔫', this.x + this.size, this.y - this.size);
            
            // Cooldown indicator
            if (this.gunCooldown > 0) {
                ctx.fillStyle = 'rgba(255, 0, 0, 0.5)';
                ctx.beginPath();
                ctx.arc(this.x, this.y, this.size * this.scale + 5, 0, Math.PI * 2 * (this.gunCooldown / 60));
                ctx.stroke();
            }
        }
        
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

// Gun class
class Gun {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.rotation = 0;
        this.bobOffset = 0;
        this.active = true;
        this.life = 600; // 10 seconds at 60fps
    }
    
    update() {
        this.rotation += 0.05;
        this.bobOffset += 0.1;
        this.life--;
        if (this.life <= 0) {
            this.active = false;
        }
    }
    
    draw(ctx) {
        ctx.save();
        ctx.translate(this.x, this.y + Math.sin(this.bobOffset) * 3);
        ctx.rotate(this.rotation);
        
        // Gun shadow
        ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
        ctx.fillRect(-12, -5, 24, 10);
        
        // Gun body
        ctx.fillStyle = '#444';
        ctx.fillRect(-10, -4, 20, 8);
        
        // Gun barrel
        ctx.fillStyle = '#222';
        ctx.fillRect(8, -2, 8, 4);
        
        // Gun grip
        ctx.fillStyle = '#8B4513';
        ctx.fillRect(-8, 2, 6, 8);
        
        // Highlight
        ctx.fillStyle = '#666';
        ctx.fillRect(-8, -3, 16, 2);
        
        ctx.restore();
        
        // Pickup glow
        ctx.save();
        ctx.globalAlpha = 0.3 + Math.sin(this.bobOffset) * 0.2;
        ctx.strokeStyle = '#FFD700';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(this.x, this.y, 25, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
    }
}

// Bullet class
class Bullet {
    constructor(x, y, vx, vy, shooter) {
        this.x = x;
        this.y = y;
        this.vx = vx;
        this.vy = vy;
        this.shooter = shooter;
        this.life = 120; // 2 seconds
        this.active = true;
        this.trail = [];
    }
    
    update() {
        this.x += this.vx;
        this.y += this.vy;
        
        // Add trail
        this.trail.push({x: this.x, y: this.y});
        if (this.trail.length > 5) {
            this.trail.shift();
        }
        
        this.life--;
        if (this.life <= 0) {
            this.active = false;
        }
        
        // Boundary check
        if (this.x < 0 || this.x > canvas.width || this.y < 0 || this.y > canvas.height) {
            this.active = false;
        }
    }
    
    draw(ctx) {
        // Draw trail
        ctx.strokeStyle = 'rgba(255, 255, 0, 0.5)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        this.trail.forEach((point, index) => {
            if (index === 0) {
                ctx.moveTo(point.x, point.y);
            } else {
                ctx.lineTo(point.x, point.y);
            }
        });
        ctx.stroke();
        
        // Draw bullet
        ctx.fillStyle = '#FFD700';
        ctx.beginPath();
        ctx.arc(this.x, this.y, 3, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.strokeStyle = '#FFA500';
        ctx.lineWidth = 1;
        ctx.stroke();
    }
}

// Muzzle flash effect
class MuzzleFlash {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.life = 5;
        this.maxLife = 5;
        this.active = true;
        this.size = 20;
    }
    
    update() {
        this.life--;
        if (this.life <= 0) {
            this.active = false;
        }
    }
    
    draw(ctx) {
        const alpha = this.life / this.maxLife;
        ctx.save();
        ctx.globalAlpha = alpha;
        
        // Flash
        const gradient = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, this.size);
        gradient.addColorStop(0, '#FFFF00');
        gradient.addColorStop(0.5, '#FF6600');
        gradient.addColorStop(1, 'transparent');
        
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.restore();
    }
}

// Hit effect
class HitEffect {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.particles = [];
        this.life = 30;
        this.active = true;
        
        for (let i = 0; i < 6; i++) {
            this.particles.push({
                x: x,
                y: y,
                vx: (Math.random() - 0.5) * 8,
                vy: (Math.random() - 0.5) * 8,
                life: 30,
                size: Math.random() * 4 + 2
            });
        }
    }
    
    update() {
        this.particles.forEach(particle => {
            particle.x += particle.vx;
            particle.y += particle.vy;
            particle.vx *= 0.95;
            particle.vy *= 0.95;
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
            ctx.fillStyle = '#FF0000';
            ctx.beginPath();
            ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        });
    }
}

// Pickup effect
class PickupEffect {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.life = 30;
        this.maxLife = 30;
        this.active = true;
        this.size = 0;
    }
    
    update() {
        this.size += 2;
        this.life--;
        if (this.life <= 0) {
            this.active = false;
        }
    }
    
    draw(ctx) {
        const alpha = this.life / this.maxLife;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = '#00FF00';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
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
