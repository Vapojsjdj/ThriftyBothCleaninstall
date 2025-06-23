
const socket = io();

// Elements
const usernameInput = document.getElementById('usernameInput');
const connectBtn = document.getElementById('connectBtn');
const disconnectBtn = document.getElementById('disconnectBtn');
const connectionStatus = document.getElementById('connectionStatus');
const viewerCount = document.getElementById('viewerCount');
const roomId = document.getElementById('roomId');
const chatMessages = document.getElementById('chatMessages');
const giftMessages = document.getElementById('giftMessages');
const eventMessages = document.getElementById('eventMessages');

// State
let isConnected = false;

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
        roomId.textContent = data.roomId;
        connectBtn.disabled = true;
        disconnectBtn.disabled = false;
        usernameInput.disabled = true;
    } else {
        updateConnectionStatus('فشل الاتصال: ' + data.error, false);
    }
});

socket.on('chat_message', (data) => {
    addChatMessage(data);
});

socket.on('gift_received', (data) => {
    addGiftMessage(data);
});

socket.on('like_received', (data) => {
    addEventMessage(`❤️ ${data.nickname} أرسل ${data.likeCount} إعجاب`, data.timestamp);
});

socket.on('social_event', (data) => {
    let message = '';
    switch(data.action) {
        case 'follow':
            message = `👥 ${data.nickname} بدأ بالمتابعة`;
            break;
        case 'share':
            message = `📤 ${data.nickname} شارك البث`;
            break;
        default:
            message = `⚡ ${data.nickname} - ${data.action}`;
    }
    addEventMessage(message, data.timestamp);
});

socket.on('room_update', (data) => {
    viewerCount.textContent = data.viewerCount;
});

socket.on('stream_ended', () => {
    addEventMessage('⛔ انتهى البث المباشر', new Date().toLocaleTimeString());
    disconnectFromTikTok();
});

socket.on('tiktok_error', (error) => {
    addEventMessage('❌ خطأ: ' + error, new Date().toLocaleTimeString());
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
    roomId.textContent = '-';
    viewerCount.textContent = '0';
}

function updateConnectionStatus(message, connected) {
    connectionStatus.textContent = message;
    connectionStatus.className = connected ? 'status connected' : 'status disconnected';
}

function addChatMessage(data) {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message chat-message';
    messageDiv.innerHTML = `
        <div class="username">${data.nickname}</div>
        <div class="nickname">@${data.username}</div>
        <div class="message-content">${escapeHtml(data.message)}</div>
        <div class="timestamp">${data.timestamp}</div>
    `;
    
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    
    // Keep only last 50 messages
    while (chatMessages.children.length > 50) {
        chatMessages.removeChild(chatMessages.firstChild);
    }
}

function addGiftMessage(data) {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message gift-message';
    messageDiv.innerHTML = `
        <div class="username">${data.nickname}</div>
        <div class="nickname">@${data.username}</div>
        <div class="message-content">
            🎁 أرسل هدية: ${data.giftName}
            <div class="gift-info">💎 ${data.diamondCount} ماسة</div>
        </div>
        <div class="timestamp">${data.timestamp}</div>
    `;
    
    giftMessages.appendChild(messageDiv);
    giftMessages.scrollTop = giftMessages.scrollHeight;
    
    // Keep only last 30 messages
    while (giftMessages.children.length > 30) {
        giftMessages.removeChild(giftMessages.firstChild);
    }
}

function addEventMessage(message, timestamp) {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message event-message';
    messageDiv.innerHTML = `
        <div class="message-content">${message}</div>
        <div class="timestamp">${timestamp}</div>
    `;
    
    eventMessages.appendChild(messageDiv);
    eventMessages.scrollTop = eventMessages.scrollHeight;
    
    // Keep only last 30 messages
    while (eventMessages.children.length > 30) {
        eventMessages.removeChild(eventMessages.firstChild);
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Initialize
updateConnectionStatus('غير متصل', false);
