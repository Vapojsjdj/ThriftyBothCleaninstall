
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
      try {
        socket.emit('chat_message', {
          username: data.uniqueId || 'Unknown',
          nickname: data.nickname || 'Unknown',
          message: data.comment || '',
          profilePictureUrl: data.profilePictureUrl || '',
          timestamp: new Date().toLocaleTimeString()
        });
      } catch (err) {
        console.log('Chat event error handled:', err.message);
      }
    });

    // Gifts
    tiktokLiveConnection.on('gift', data => {
      try {
        socket.emit('gift_received', {
          username: data.uniqueId || 'Unknown',
          nickname: data.nickname || 'Unknown',
          giftName: data.giftName || 'Unknown Gift',
          giftType: data.giftType || 0,
          diamondCount: data.diamondCount || 0,
          profilePictureUrl: data.profilePictureUrl || '',
          timestamp: new Date().toLocaleTimeString()
        });
      } catch (err) {
        console.log('Gift event error handled:', err.message);
      }
    });

    // Likes
    tiktokLiveConnection.on('like', data => {
      try {
        socket.emit('like_received', {
          username: data.uniqueId || 'Unknown',
          nickname: data.nickname || 'Unknown',
          likeCount: data.likeCount || 1,
          totalLikeCount: data.totalLikeCount || 1,
          profilePictureUrl: data.profilePictureUrl || '',
          timestamp: new Date().toLocaleTimeString()
        });
      } catch (err) {
        console.log('Like event error handled:', err.message);
      }
    });

    // Social interactions
    tiktokLiveConnection.on('social', data => {
      try {
        socket.emit('social_event', {
          username: data.uniqueId || 'Unknown',
          nickname: data.nickname || 'Unknown',
          action: data.displayType || 'joined',
          profilePictureUrl: data.profilePictureUrl || '',
          timestamp: new Date().toLocaleTimeString()
        });
      } catch (err) {
        console.log('Social event error handled:', err.message);
      }
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
      // Don't disconnect on minor errors, just log them
      if (err && err.message) {
        console.log('TikTok error handled, connection continues');
      }
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
