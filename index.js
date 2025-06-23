
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const { WebcastPushConnection } = require('tiktok-live-connector');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Serve static files
app.use(express.static('public'));

// Main route
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/public/index.html');
});

// Chat balls game route
app.get('/chat-balls', (req, res) => {
  res.sendFile(__dirname + '/public/chat-balls.html');
});

// Store active connections
const tiktokConnections = new Map();

// Socket.IO connection
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('connect_tiktok', (username) => {
    console.log(`Attempting to connect to TikTok user: ${username}`);
    
    // Create TikTok connection
    const tiktokLiveConnection = new WebcastPushConnection(username);
    
    // Store connection
    tiktokConnections.set(socket.id, tiktokLiveConnection);

    // TikTok events
    tiktokLiveConnection.connect().then(state => {
      console.log(`Connected to roomId ${state.roomId}`);
      socket.emit('tiktok_connected', { 
        success: true, 
        roomId: state.roomId,
        username: username 
      });
    }).catch((err) => {
      console.error('Failed to connect', err);
      socket.emit('tiktok_connected', { 
        success: false, 
        error: err.message 
      });
    });

    // Chat messages
    tiktokLiveConnection.on('chat', data => {
      socket.emit('chat_message', {
        username: data.uniqueId,
        nickname: data.nickname,
        message: data.comment,
        timestamp: new Date().toLocaleTimeString()
      });
    });

    // Gifts
    tiktokLiveConnection.on('gift', data => {
      socket.emit('gift_received', {
        username: data.uniqueId,
        nickname: data.nickname,
        giftName: data.giftName,
        giftType: data.giftType,
        diamondCount: data.diamondCount,
        timestamp: new Date().toLocaleTimeString()
      });
    });

    // Likes
    tiktokLiveConnection.on('like', data => {
      socket.emit('like_received', {
        username: data.uniqueId,
        nickname: data.nickname,
        likeCount: data.likeCount,
        totalLikeCount: data.totalLikeCount,
        timestamp: new Date().toLocaleTimeString()
      });
    });

    // Social interactions
    tiktokLiveConnection.on('social', data => {
      socket.emit('social_event', {
        username: data.uniqueId,
        nickname: data.nickname,
        action: data.displayType,
        timestamp: new Date().toLocaleTimeString()
      });
    });

    // Room user updates
    tiktokLiveConnection.on('roomUser', data => {
      socket.emit('room_update', {
        viewerCount: data.viewerCount,
        timestamp: new Date().toLocaleTimeString()
      });
    });

    // Stream end
    tiktokLiveConnection.on('streamEnd', () => {
      socket.emit('stream_ended');
    });

    // Connection errors
    tiktokLiveConnection.on('error', err => {
      console.error('TikTok connection error:', err);
      socket.emit('tiktok_error', err.message);
    });
  });

  socket.on('disconnect_tiktok', () => {
    const connection = tiktokConnections.get(socket.id);
    if (connection) {
      connection.disconnect();
      tiktokConnections.delete(socket.id);
      console.log('TikTok connection disconnected for:', socket.id);
    }
  });

  socket.on('disconnect', () => {
    const connection = tiktokConnections.get(socket.id);
    if (connection) {
      connection.disconnect();
      tiktokConnections.delete(socket.id);
    }
    console.log('User disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});
