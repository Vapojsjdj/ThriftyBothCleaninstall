
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

    // Chat messages - create enemies from comments
    tiktokLiveConnection.on('chat', data => {
      try {
        if (data && data.uniqueId && data.comment) {
          console.log(`New comment from ${data.uniqueId}: ${data.comment}`);
          socket.emit('chat_message', {
            username: data.uniqueId || 'Unknown',
            nickname: data.nickname || data.uniqueId || 'Unknown',
            message: data.comment || '',
            profilePictureUrl: data.profilePictureUrl || '',
            timestamp: new Date().toLocaleTimeString()
          });
        }
      } catch (err) {
        console.log('Error processing chat message:', err.message);
      }
    });

    // Gifts - provide bonus power
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

        console.log(`Gift from ${data.uniqueId}: ${giftName}`);
        socket.emit('gift_received', {
          username: data.uniqueId || 'Unknown',
          nickname: data.nickname || data.uniqueId || 'Unknown',
          giftName: giftName,
          giftType: data.giftType || 0,
          diamondCount: data.diamondCount || data.coins || 1,
          profilePictureUrl: data.profilePictureUrl || '',
          timestamp: new Date().toLocaleTimeString()
        });
      } catch (err) {
        console.log('Error processing gift:', err.message);
      }
    });

    // Likes - provide health bonus
    tiktokLiveConnection.on('like', data => {
      try {
        if (data && data.uniqueId) {
          console.log(`Like from ${data.uniqueId}`);
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
        console.log('Error processing like:', err.message);
      }
    });

    // Social interactions
    tiktokLiveConnection.on('social', data => {
      try {
        if (data && data.uniqueId) {
          console.log(`Social event from ${data.uniqueId}: ${data.displayType}`);
          socket.emit('social_event', {
            username: data.uniqueId || 'Unknown',
            nickname: data.nickname || data.uniqueId || 'Unknown',
            action: data.displayType || 'joined',
            profilePictureUrl: data.profilePictureUrl || '',
            timestamp: new Date().toLocaleTimeString()
          });
        }
      } catch (err) {
        console.log('Error processing social event:', err.message);
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
        console.log('Error processing room update:', err.message);
      }
    });

    // Stream end
    tiktokLiveConnection.on('streamEnd', () => {
      try {
        socket.emit('stream_ended');
        console.log('Stream ended for user:', username);
      } catch (err) {
        console.log('Error processing stream end:', err.message);
      }
    });

    // Enhanced error handling
    tiktokLiveConnection.on('error', err => {
      // Skip common data parsing errors
      if (err?.message && (
        err.message.includes('giftImage') || 
        err.message.includes('Cannot read properties') ||
        err.message.includes('giftDetails') ||
        err.message.includes('data-converter') ||
        err.message.includes('TypeError') ||
        err.message.includes('undefined')
      )) {
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

    // Connection monitoring
    tiktokLiveConnection.on('disconnected', () => {
      console.log('TikTok connection lost for user:', username);
      socket.emit('tiktok_error', { 
        message: 'انقطع الاتصال - يرجى المحاولة مرة أخرى'
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
  console.log(`3D Warrior Game Server running on port ${PORT}`);
  console.log('🎮 Ready for TikTok Live connections!');
});
