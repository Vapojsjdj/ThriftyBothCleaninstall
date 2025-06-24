
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

    // Chat messages with enhanced error handling
    tiktokLiveConnection.on('chat', data => {
      try {
        if (data && data.uniqueId) {
          socket.emit('chat_message', {
            username: data.uniqueId || 'Unknown',
            nickname: data.nickname || data.uniqueId || 'Unknown',
            message: data.comment || '',
            profilePictureUrl: data.profilePictureUrl || '',
            timestamp: new Date().toLocaleTimeString()
          });
        }
      } catch (err) {
        console.log('Chat event error handled:', err.message);
      }
    });

    // Gifts with safe property access
    tiktokLiveConnection.on('gift', data => {
      try {
        if (data && data.uniqueId) {
          socket.emit('gift_received', {
            username: data.uniqueId || 'Unknown',
            nickname: data.nickname || data.uniqueId || 'Unknown',
            giftName: (data.giftDetails && data.giftDetails.giftName) || data.giftName || 'Unknown Gift',
            giftType: data.giftType || 0,
            diamondCount: data.diamondCount || 0,
            profilePictureUrl: data.profilePictureUrl || '',
            timestamp: new Date().toLocaleTimeString()
          });
        }
      } catch (err) {
        console.log('Gift event error handled:', err.message);
      }
    });

    // Likes with validation
    tiktokLiveConnection.on('like', data => {
      try {
        if (data && data.uniqueId) {
          socket.emit('like_received', {
            username: data.uniqueId || 'Unknown',
            nickname: data.nickname || data.uniqueId || 'Unknown',
            likeCount: data.likeCount || 1,
            totalLikeCount: data.totalLikeCount || 1,
            profilePictureUrl: data.profilePictureUrl || '',
            timestamp: new Date().toLocaleTimeString()
          });
        }
      } catch (err) {
        console.log('Like event error handled:', err.message);
      }
    });

    // Social interactions with validation
    tiktokLiveConnection.on('social', data => {
      try {
        if (data && data.uniqueId) {
          socket.emit('social_event', {
            username: data.uniqueId || 'Unknown',
            nickname: data.nickname || data.uniqueId || 'Unknown',
            action: data.displayType || 'joined',
            profilePictureUrl: data.profilePictureUrl || '',
            timestamp: new Date().toLocaleTimeString()
          });
        }
      } catch (err) {
        console.log('Social event error handled:', err.message);
      }
    });

    // Room user updates with validation
    tiktokLiveConnection.on('roomUser', data => {
      try {
        if (data && typeof data.viewerCount === 'number') {
          socket.emit('room_update', {
            viewerCount: data.viewerCount,
            timestamp: new Date().toLocaleTimeString()
          });
        }
      } catch (err) {
        console.log('Room user event error handled:', err.message);
      }
    });

    // Stream end
    tiktokLiveConnection.on('streamEnd', () => {
      try {
        socket.emit('stream_ended');
        console.log('Stream ended for user:', username);
      } catch (err) {
        console.log('Stream end event error handled:', err.message);
      }
    });

    // Enhanced error handling - prevent disconnections
    tiktokLiveConnection.on('error', err => {
      console.log('TikTok connection error handled (connection maintained):', err?.message || 'Unknown error');
      // Don't emit error to client to prevent disconnection
    });

    // Add connection monitoring
    tiktokLiveConnection.on('disconnected', () => {
      console.log('TikTok connection lost for user:', username);
      socket.emit('tiktok_error', { message: 'Connection lost, please try reconnecting' });
    });

    // Monitor connection health
    const healthCheck = setInterval(() => {
      if (tiktokLiveConnection && tiktokLiveConnection.getState() !== 'connected') {
        console.log('Connection health check failed, attempting reconnect...');
        clearInterval(healthCheck);
      }
    }, 30000); // Check every 30 seconds

    // Store health check interval for cleanup
    tiktokConnections.set(socket.id + '_health', healthCheck);
  });

  socket.on('disconnect_tiktok', () => {
    const connection = tiktokConnections.get(socket.id);
    const healthCheck = tiktokConnections.get(socket.id + '_health');
    
    if (connection) {
      try {
        connection.disconnect();
      } catch (err) {
        console.log('Error disconnecting TikTok connection:', err.message);
      }
      tiktokConnections.delete(socket.id);
    }
    
    if (healthCheck) {
      clearInterval(healthCheck);
      tiktokConnections.delete(socket.id + '_health');
    }
    
    console.log('TikTok connection disconnected for:', socket.id);
  });

  socket.on('disconnect', () => {
    const connection = tiktokConnections.get(socket.id);
    const healthCheck = tiktokConnections.get(socket.id + '_health');
    
    if (connection) {
      try {
        connection.disconnect();
      } catch (err) {
        console.log('Error disconnecting TikTok connection:', err.message);
      }
      tiktokConnections.delete(socket.id);
    }
    
    if (healthCheck) {
      clearInterval(healthCheck);
      tiktokConnections.delete(socket.id + '_health');
    }
    
    console.log('User disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});
