const socket = io();

// Game elements
const playerSelection = document.getElementById('playerSelection');
const gameContent = document.getElementById('gameContent');
const gameOverScreen = document.getElementById('gameOverScreen');
const usernameInput = document.getElementById('usernameInput');
const connectBtn = document.getElementById('connectBtn');
const disconnectBtn = document.getElementById('disconnectBtn');
const connectionStatus = document.getElementById('connectionStatus');
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// Game state
let isConnected = false;
let gameTimer = 60;
let gameInterval;
let gameActive = false;
let yamalHealth = 100;
let ronaldoHealth = 100;
let yamalVotes = 0;
let ronaldoVotes = 0;
let gameSettings = {
    duration: 60,
    damage: 10,
    ballSpeed: 3
};

// Ball physics
let ball = {
    x: canvas.width / 2,
    y: canvas.height / 2,
    vx: 3,
    vy: 2,
    radius: 15
};

// Players (paddles)
let yamalPaddle = {
    x: 20,
    y: canvas.height / 2 - 40,
    width: 20,
    height: 80,
    speed: 5
};

let ronaldoPaddle = {
    x: canvas.width - 40,
    y: canvas.height / 2 - 40,
    width: 20,
    height: 80,
    speed: 5
};

// Event listeners
connectBtn.addEventListener('click', connectToTikTok);
disconnectBtn.addEventListener('click', disconnectFromTikTok);
usernameInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') connectToTikTok();
});

// Settings controls
document.getElementById('gameDuration').addEventListener('input', (e) => {
    gameSettings.duration = parseInt(e.target.value);
    document.getElementById('durationValue').textContent = e.target.value + 's';
});

document.getElementById('damageAmount').addEventListener('input', (e) => {
    gameSettings.damage = parseInt(e.target.value);
    document.getElementById('damageValue').textContent = e.target.value;
});

document.getElementById('ballSpeed').addEventListener('input', (e) => {
    gameSettings.ballSpeed = parseInt(e.target.value);
    document.getElementById('speedValue').textContent = e.target.value;
});

// Socket events
socket.on('tiktok_connected', (data) => {
    if (data.success) {
        isConnected = true;
        updateConnectionStatus('متصل بـ ' + data.username, true);
        connectBtn.disabled = true;
        disconnectBtn.disabled = false;
        usernameInput.disabled = true;
        startGame();
    } else {
        updateConnectionStatus('فشل الاتصال: ' + data.error, false);
    }
});

socket.on('chat_message', (data) => {
    handleChatVote(data);
});

socket.on('gift_received', (data) => {
    // Gifts add bonus damage
    handleGiftBonus(data);
});

socket.on('like_received', (data) => {
    // Likes add small health boost
    handleLikeBonus(data);
});

socket.on('tiktok_error', (error) => {
    if (!error || error === null || error === undefined) {
        return;
    }

    if (error.message && (
        error.message.includes('giftImage') || 
        error.message.includes('data-converter') ||
        error.message.includes('Cannot read properties')
    )) {
        return;
    }

    console.log('TikTok Error:', error);
});

socket.on('stream_ended', () => {
    disconnectFromTikTok();
});

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
    gameActive = false;
    updateConnectionStatus('غير متصل', false);
    connectBtn.disabled = false;
    disconnectBtn.disabled = true;
    usernameInput.disabled = false;
    showPlayerSelection();
    if (gameInterval) clearInterval(gameInterval);
}

function updateConnectionStatus(message, connected) {
    connectionStatus.textContent = message;
    connectionStatus.style.color = connected ? '#4CAF50' : '#F44336';
}

function handleChatVote(data) {
    const message = data.message.toLowerCase().trim();

    // Check for Yamal votes
    if (message.includes('يامال') || message.includes('yamal') || message.includes('lamine')) {
        yamalVotes++;
        applyDamage('ronaldo', gameSettings.damage);
        showVoteEffect(data.nickname || data.username, 'يامال', 'yamal');
    }
    // Check for Ronaldo votes
    else if (message.includes('رونالدو') || message.includes('ronaldo') || message.includes('cristiano')) {
        ronaldoVotes++;
        applyDamage('yamal', gameSettings.damage);
        showVoteEffect(data.nickname || data.username, 'رونالدو', 'ronaldo');
    }
}

function handleGiftBonus(data) {
    const message = data.giftName.toLowerCase();
    let bonusDamage = 20;

    // Different gifts cause different damage
    if (data.diamondCount > 100) bonusDamage = 50;
    else if (data.diamondCount > 50) bonusDamage = 30;

    // Apply bonus damage based on last vote pattern (simplified)
    if (Math.random() > 0.5) {
        applyDamage('ronaldo', bonusDamage);
        showGiftEffect(data.nickname || data.username, bonusDamage, 'yamal');
    } else {
        applyDamage('yamal', bonusDamage);
        showGiftEffect(data.nickname || data.username, bonusDamage, 'ronaldo');
    }
}

function handleLikeBonus(data) {
    // Likes restore small amount of health to random player
    const healAmount = 5;
    if (Math.random() > 0.5 && yamalHealth < 100) {
        yamalHealth = Math.min(yamalHealth + healAmount, 100);
        updateHealthBar('yamal');
    } else if (ronaldoHealth < 100) {
        ronaldoHealth = Math.min(ronaldoHealth + healAmount, 100);
        updateHealthBar('ronaldo');
    }
}

function applyDamage(target, damage) {
    if (!gameActive) return;

    if (target === 'yamal') {
        yamalHealth = Math.max(yamalHealth - damage, 0);
        updateHealthBar('yamal');
        if (yamalHealth <= 0) endGame('رونالدو');
    } else {
        ronaldoHealth = Math.max(ronaldoHealth - damage, 0);
        updateHealthBar('ronaldo');
        if (ronaldoHealth <= 0) endGame('يامال');
    }
}

function updateHealthBar(player) {
    if (player === 'yamal') {
        document.getElementById('yamalHealth').style.width = yamalHealth + '%';
        document.getElementById('yamalHealthText').textContent = yamalHealth;
    } else {
        document.getElementById('ronaldoHealth').style.width = ronaldoHealth + '%';
        document.getElementById('ronaldoHealthText').textContent = ronaldoHealth;
    }
}

function showVoteEffect(username, choice, team) {
    const result = document.getElementById('predictionResult');
    result.style.display = 'block';
    result.innerHTML = `🗳️ ${username} صوت لـ ${choice}!`;
    result.className = `prediction-result ${team === 'yamal' ? 'prediction-correct' : 'prediction-wrong'}`;

    setTimeout(() => {
        result.style.display = 'none';
    }, 3000);
}

function showGiftEffect(username, damage, team) {
    const result = document.getElementById('predictionResult');
    result.style.display = 'block';
    result.innerHTML = `🎁 ${username} أرسل هدية! ضرر إضافي: ${damage}`;
    result.className = `prediction-result ${team === 'yamal' ? 'prediction-correct' : 'prediction-wrong'}`;

    setTimeout(() => {
        result.style.display = 'none';
    }, 3000);
}

function startGame() {
    gameActive = true;
    gameTimer = gameSettings.duration;
    yamalHealth = 100;
    ronaldoHealth = 100;
    yamalVotes = 0;
    ronaldoVotes = 0;

    updateHealthBar('yamal');
    updateHealthBar('ronaldo');

    showGameContent();
    startGameTimer();
    startGameLoop();
}

function startGameTimer() {
    if (gameInterval) clearInterval(gameInterval);

    gameInterval = setInterval(() => {
        gameTimer--;
        document.getElementById('gameTimer').textContent = gameTimer;

        if (gameTimer <= 0) {
            // Game ends, winner based on health
            if (yamalHealth > ronaldoHealth) {
                endGame('يامال');
            } else if (ronaldoHealth > yamalHealth) {
                endGame('رونالدو');
            } else {
                endGame('تعادل');
            }
        }
    }, 1000);
}

function startGameLoop() {
    function gameLoop() {
        if (!gameActive) return;

        updateGame();
        drawGame();
        requestAnimationFrame(gameLoop);
    }
    gameLoop();
}

function updateGame() {
    // Update ball position
    ball.x += ball.vx * gameSettings.ballSpeed;
    ball.y += ball.vy * gameSettings.ballSpeed;

    // Ball collision with top/bottom walls
    if (ball.y <= ball.radius || ball.y >= canvas.height - ball.radius) {
        ball.vy = -ball.vy;
    }

    // Ball collision with paddles
    if (ball.x <= yamalPaddle.x + yamalPaddle.width && 
        ball.y >= yamalPaddle.y && 
        ball.y <= yamalPaddle.y + yamalPaddle.height) {
        ball.vx = Math.abs(ball.vx);
    }

    if (ball.x >= ronaldoPaddle.x && 
        ball.y >= ronaldoPaddle.y && 
        ball.y <= ronaldoPaddle.y + ronaldoPaddle.height) {
        ball.vx = -Math.abs(ball.vx);
    }

    // Ball goes out of bounds
    if (ball.x < 0) {
        // Ronaldo scores
        applyDamage('yamal', 15);
        resetBall();
    } else if (ball.x > canvas.width) {
        // Yamal scores
        applyDamage('ronaldo', 15);
        resetBall();
    }

    // AI for paddles (simple following)
    if (yamalPaddle.y + yamalPaddle.height/2 < ball.y) {
        yamalPaddle.y += yamalPaddle.speed;
    } else {
        yamalPaddle.y -= yamalPaddle.speed;
    }

    if (ronaldoPaddle.y + ronaldoPaddle.height/2 < ball.y) {
        ronaldoPaddle.y += ronaldoPaddle.speed;
    } else {
        ronaldoPaddle.y -= ronaldoPaddle.speed;
    }

    // Keep paddles in bounds
    yamalPaddle.y = Math.max(0, Math.min(canvas.height - yamalPaddle.height, yamalPaddle.y));
    ronaldoPaddle.y = Math.max(0, Math.min(canvas.height - ronaldoPaddle.height, ronaldoPaddle.y));
}

function resetBall() {
    ball.x = canvas.width / 2;
    ball.y = canvas.height / 2;
    ball.vx = (Math.random() > 0.5 ? 1 : -1) * 3;
    ball.vy = (Math.random() - 0.5) * 4;
}

function drawGame() {
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw field background
    ctx.fillStyle = 'rgba(0, 100, 0, 0.3)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw center line
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(canvas.width / 2, 0);
    ctx.lineTo(canvas.width / 2, canvas.height);
    ctx.stroke();
    ctx.setLineDash([]);

    // Draw paddles
    ctx.fillStyle = '#4CAF50'; // Yamal's color
    ctx.fillRect(yamalPaddle.x, yamalPaddle.y, yamalPaddle.width, yamalPaddle.height);

    ctx.fillStyle = '#2196F3'; // Ronaldo's color
    ctx.fillRect(ronaldoPaddle.x, ronaldoPaddle.y, ronaldoPaddle.width, ronaldoPaddle.height);

    // Draw ball
    ctx.fillStyle = '#FFD700';
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
    ctx.fill();

    // Draw ball trail
    ctx.strokeStyle = 'rgba(255, 215, 0, 0.3)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, ball.radius + 5, 0, Math.PI * 2);
    ctx.stroke();

    // Draw score
    ctx.fillStyle = 'white';
    ctx.font = '20px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(`${yamalVotes}`, canvas.width / 4, 30);
    ctx.fillText(`${ronaldoVotes}`, 3 * canvas.width / 4, 30);
}

function endGame(winner) {
    gameActive = false;
    if (gameInterval) clearInterval(gameInterval);

    let winnerText = '';
    if (winner === 'تعادل') {
        winnerText = '🤝 تعادل! 🤝';
    } else {
        winnerText = `🏆 ${winner} فاز! 🏆`;
    }

    document.getElementById('winnerText').textContent = winnerText;
    gameOverScreen.style.display = 'block';
}

function restartGame() {
    gameOverScreen.style.display = 'none';
    if (isConnected) {
        startGame();
    } else {
        showPlayerSelection();
    }
}

function showPlayerSelection() {
    playerSelection.style.display = 'flex';
    gameContent.style.display = 'none';
    gameOverScreen.style.display = 'none';
}

function showGameContent() {
    playerSelection.style.display = 'none';
    gameContent.style.display = 'flex';
    gameOverScreen.style.display = 'none';
}

function toggleSettings() {
    const panel = document.getElementById('settingsPanel');
    panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
}

// Initialize
showPlayerSelection();
updateConnectionStatus('غير متصل', false);