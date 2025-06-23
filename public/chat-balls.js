const socket = io();

// Elements
const usernameInput = document.getElementById('usernameInput');
const connectBtn = document.getElementById('connectBtn');
const disconnectBtn = document.getElementById('disconnectBtn');
const connectionStatus = document.getElementById('connectionStatus');
const viewerCount = document.getElementById('viewerCount');
const activeBalls = document.getElementById('activeBalls');
const gameArea = document.getElementById('gameArea');
const clearBallsBtn = document.getElementById('clearBalls');
const pauseAnimationBtn = document.getElementById('pauseAnimation');

// Game state
let isConnected = false;
let ballCount = 0;
const activeBallsList = new Set();

// Animation patterns
const animationPatterns = [
    'floatAcross',
    'floatUp', 
    'diagonal'
];

// Color schemes for different users
const colorSchemes = [
    'linear-gradient(135deg, #ff6b6b, #4ecdc4)',
    'linear-gradient(135deg, #a8edea, #fed6e3)',
    'linear-gradient(135deg, #ffecd2, #fcb69f)',
    'linear-gradient(135deg, #ff9a9e, #fecfef)',
    'linear-gradient(135deg, #a8caba, #5d4e75)',
    'linear-gradient(135deg, #667eea, #764ba2)',
    'linear-gradient(135deg, #ffd89b, #19547b)',
    'linear-gradient(135deg, #c471f5, #fa71cd)'
];

// Event listeners
connectBtn.addEventListener('click', connectToTikTok);
disconnectBtn.addEventListener('click', disconnectFromTikTok);
clearBallsBtn.addEventListener('click', clearAllBalls);
pauseAnimationBtn.addEventListener('click', toggleAnimations);

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
    } else {
        updateConnectionStatus('فشل الاتصال: ' + data.error, false);
    }
});

socket.on('chat_message', (data) => {
    createChatBall(data);
});

socket.on('gift_received', (data) => {
    createChatBall({
        ...data,
        message: `🎁 ${data.giftName}`
    });
});

socket.on('like_received', (data) => {
    createChatBall({
        ...data,
        message: `❤️ ${data.likeCount} إعجاب`
    });
});

socket.on('social_event', (data) => {
    createChatBall({
        ...data,
        message: `⚡ ${data.action}`
    });
});

socket.on('room_update', (data) => {
    viewerCount.textContent = data.viewerCount;
});

socket.on('stream_ended', () => {
    createSystemMessage('⛔ انتهى البث المباشر');
    disconnectFromTikTok();
});

socket.on('tiktok_error', (error) => {
    createSystemMessage('❌ خطأ: ' + error);
});

// Functions
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
}

function updateConnectionStatus(message, connected) {
    connectionStatus.textContent = message;
    connectionStatus.className = connected ? 'status connected' : 'status disconnected';
}

function createChatBall(data) {
    const ball = document.createElement('div');
    ball.className = 'chat-ball';
    ball.id = `ball-${ballCount++}`;

    // Set random color
    const randomColor = colorSchemes[Math.floor(Math.random() * colorSchemes.length)];
    ball.style.background = randomColor;

    // Create avatar (profile picture or first letter)
    const avatar = document.createElement('div');
    avatar.className = 'ball-avatar';

    if (data.profilePictureUrl) {
        const img = document.createElement('img');
        img.src = data.profilePictureUrl;
        img.className = 'profile-pic';
        img.onerror = function() {
            avatar.innerHTML = data.nickname ? data.nickname.charAt(0).toUpperCase() : '👤';
        };
        avatar.appendChild(img);
    } else {
        avatar.textContent = data.nickname ? data.nickname.charAt(0).toUpperCase() : '👤';
    }

    // Create username display
    const username = document.createElement('div');
    username.className = 'ball-username';
    username.textContent = data.nickname || data.username || 'مجهول';

    // Create message tooltip
    const message = document.createElement('div');
    message.className = 'ball-message';
    message.textContent = data.message || data.comment || '';

    ball.appendChild(avatar);
    ball.appendChild(username);
    ball.appendChild(message);

    // Set random starting position and animation
    setRandomAnimation(ball);

    // Add to game area
    gameArea.appendChild(ball);
    activeBallsList.add(ball.id);
    updateActiveBallsCount();

    // Remove ball after animation completes
    setTimeout(() => {
        if (ball.parentNode) {
            ball.parentNode.removeChild(ball);
            activeBallsList.delete(ball.id);
            updateActiveBallsCount();
        }
    }, 10000); // 10 seconds

    // Add click interaction
    ball.addEventListener('click', () => {
        ball.style.transform = 'scale(1.3)';
        setTimeout(() => {
            ball.style.transform = 'scale(1)';
        }, 200);
    });
}

function setRandomAnimation(ball) {
    const pattern = animationPatterns[Math.floor(Math.random() * animationPatterns.length)];
    const duration = Math.random() * 3 + 7; // 7-10 seconds
    const delay = Math.random() * 2; // 0-2 seconds delay

    // Set starting position based on animation pattern
    switch (pattern) {
        case 'floatAcross':
            ball.style.left = '-100px';
            ball.style.top = Math.random() * (window.innerHeight - 200) + 100 + 'px';
            break;
        case 'floatUp':
            ball.style.left = Math.random() * (window.innerWidth - 100) + 'px';
            ball.style.top = window.innerHeight + 'px';
            break;
        case 'diagonal':
            ball.style.left = '-100px';
            ball.style.top = window.innerHeight + 'px';
            break;
    }

    ball.style.animationName = pattern;
    ball.style.animationDuration = duration + 's';
    ball.style.animationDelay = delay + 's';
    ball.style.animationTimingFunction = 'linear';
    ball.style.animationFillMode = 'forwards';
}

function createSystemMessage(message) {
    createChatBall({
        nickname: 'النظام',
        username: 'system',
        message: message
    });
}

function clearAllBalls() {
    const balls = document.querySelectorAll('.chat-ball');
    balls.forEach(ball => {
        ball.style.animation = 'none';
        ball.style.transform = 'scale(0)';
        setTimeout(() => {
            if (ball.parentNode) {
                ball.parentNode.removeChild(ball);
            }
        }, 300);
    });
    activeBallsList.clear();
    updateActiveBallsCount();
}

function toggleAnimations() {
    animationsPaused = !animationsPaused;
    const balls = document.querySelectorAll('.chat-ball');
    
    balls.forEach(ball => {
        ball.style.animationPlayState = animationsPaused ? 'paused' : 'running';
    });
    
    pauseAnimationBtn.textContent = animationsPaused ? 'تشغيل الحركة' : 'إيقاف الحركة';
}

function updateActiveBallsCount() {
    activeBalls.textContent = activeBallsList.size;
}

// Initialize
updateConnectionStatus('غير متصل', false);
updateActiveBallsCount();

// Clean up disconnected balls periodically
setInterval(() => {
    const balls = document.querySelectorAll('.chat-ball');
    balls.forEach(ball => {
        if (!ball.parentNode) {
            activeBallsList.delete(ball.id);
        }
    });
    updateActiveBallsCount();
}, 5000);