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
        error: err?.message || 'فشل في الاتصال بـ TikTok'
      });
    });

    // Chat messages - look for votes
    tiktokLiveConnection.on('chat', data => {
      try {
        if (data && data.uniqueId && data.comment) {
          socket.emit('chat_message', {
            username: data.uniqueId || 'Unknown',
            nickname: data.nickname || data.uniqueId || 'Unknown',
            message: data.comment || '',
            profilePictureUrl: data.profilePictureUrl || '',
            timestamp: new Date().toLocaleTimeString()
          });
        }
      } catch (err) {
        // Silently handle errors
        return;
      }
    });

    // Gifts - provide bonus damage
    tiktokLiveConnection.on('gift', data => {
      try {
        if (!data || !data.uniqueId) {
          return;
        }

        let giftName = 'Unknown Gift';
        try {
          if (data.giftName) {
            giftName = data.giftName;
          } else if (data.giftDetails && typeof data.giftDetails === 'object') {
            if (data.giftDetails.giftName) {
              giftName = data.giftDetails.giftName;
            } else if (data.giftDetails.name) {
              giftName = data.giftDetails.name;
            }
          } else if (data.gift && data.gift.name) {
            giftName = data.gift.name;
          }
        } catch (giftNameErr) {
          giftName = 'Gift';
        }

        socket.emit('gift_received', {
          username: data.uniqueId || 'Unknown',
          nickname: data.nickname || data.uniqueId || 'Unknown',
          giftName: giftName,
          giftType: data.giftType || 0,
          diamondCount: data.diamondCount || data.coins || 0,
          profilePictureUrl: data.profilePictureUrl || '',
          timestamp: new Date().toLocaleTimeString()
        });
      } catch (err) {
        return;
      }
    });

    // Likes - provide health bonus
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
        return;
      }
    });

    // Social interactions
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
        return;
      }
    });

    // Room user updates
    tiktokLiveConnection.on('roomUser', data => {
      try {
        if (data && typeof data.viewerCount === 'number') {
          socket.emit('room_update', {
            viewerCount: data.viewerCount,
            timestamp: new Date().toLocaleTimeString()
          });
        }
      } catch (err) {
        return;
      }
    });

    // Stream end
    tiktokLiveConnection.on('streamEnd', () => {
      try {
        socket.emit('stream_ended');
        console.log('Stream ended for user:', username);
      } catch (err) {
        return;
      }
    });

    // Enhanced error handling - ignore data parsing errors completely
    tiktokLiveConnection.on('error', err => {
      // Completely ignore all data parsing errors from tiktok-live-connector
      if (err?.message && (
        err.message.includes('giftImage') || 
        err.message.includes('Cannot read properties') ||
        err.message.includes('giftDetails') ||
        err.message.includes('data-converter') ||
        err.message.includes('TypeError') ||
        err.message.includes('undefined')
      )) {
        // Silently skip these errors to prevent disconnection
        return;
      }

      // Only log actual connection errors
      if (err?.message && !err.message.includes('data-converter')) {
        console.log('TikTok connection error:', err.message);
        socket.emit('tiktok_error', { 
          message: err.message || 'خطأ في الاتصال'
        });
      }
    });

    // Add connection monitoring
    tiktokLiveConnection.on('disconnected', () => {
      console.log('TikTok connection lost for user:', username);
      socket.emit('tiktok_error', { 
        message: 'انقطع الاتصال'
      });
    });
  });

  socket.on('disconnect_tiktok', () => {
    const connection = tiktokConnections.get(socket.id);

    if (connection) {
      try {
        connection.disconnect();
      } catch (err) {
        console.log('Error disconnecting TikTok connection:', err.message);
      }
      tiktokConnections.delete(socket.id);
    }

    console.log('TikTok connection disconnected for:', socket.id);
  });

  socket.on('disconnect', () => {
    const connection = tiktokConnections.get(socket.id);

    if (connection) {
      try {
        connection.disconnect();
      } catch (err) {
        console.log('Error disconnecting TikTok connection:', err.message);
      }
      tiktokConnections.delete(socket.id);
    }

    console.log('User disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});