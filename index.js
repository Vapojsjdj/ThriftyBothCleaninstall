
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
      reconnectAttempts = 0; // Reset attempts on successful connection
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

    // Gifts with enhanced validation
    tiktokLiveConnection.on('gift', data => {
      try {
        // Skip if data is null/undefined or missing required fields
        if (!data || !data.uniqueId) {
          console.log('Gift data missing required fields, skipping...');
          return;
        }

        // Safe gift name extraction with multiple fallbacks
        let giftName = 'Unknown Gift';
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
        console.log('Gift event error handled safely:', err?.message || 'Unknown gift error');
        // Don't re-throw the error to prevent disconnection
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

    // Enhanced error handling with auto-reconnection
    let reconnectAttempts = 0;
    const maxReconnectAttempts = 2; // Reduce attempts to prevent spam
    let isReconnecting = false;
    
    tiktokLiveConnection.on('error', err => {
      console.log('TikTok connection error:', err?.message || 'Unknown error');
      
      // Skip reconnection if already reconnecting or if it's a data parsing error
      if (isReconnecting || (err?.message && err.message.includes('giftImage'))) {
        console.log('Skipping reconnection for this error type');
        return;
      }
      
      // Attempt auto-reconnection
      if (reconnectAttempts < maxReconnectAttempts) {
        isReconnecting = true;
        reconnectAttempts++;
        console.log(`Auto-reconnection attempt ${reconnectAttempts}/${maxReconnectAttempts}`);
        
        setTimeout(() => {
          // Check if still connected before attempting reconnection
          try {
            const currentState = tiktokLiveConnection.getState ? tiktokLiveConnection.getState() : 'unknown';
            if (currentState === 'connected') {
              console.log('Already connected, skipping reconnection');
              isReconnecting = false;
              return;
            }
          } catch (stateErr) {
            console.log('Could not check connection state');
          }
          
          tiktokLiveConnection.connect().then(state => {
            console.log(`Auto-reconnected to roomId ${state.roomId}`);
            socket.emit('tiktok_reconnected', { 
              success: true, 
              roomId: state.roomId,
              attempt: reconnectAttempts 
            });
            reconnectAttempts = 0; // Reset on success
            isReconnecting = false;
          }).catch((reconnectErr) => {
            console.error(`Auto-reconnection attempt ${reconnectAttempts} failed:`, reconnectErr?.message);
            isReconnecting = false;
            if (reconnectAttempts >= maxReconnectAttempts) {
              socket.emit('tiktok_error', { 
                message: 'فشل في إعادة الاتصال، يرجى المحاولة يدوياً',
                needsManualReconnect: true 
              });
            }
          });
        }, 5000); // Fixed 5 second delay
      }
    });

    // Add connection monitoring
    tiktokLiveConnection.on('disconnected', () => {
      console.log('TikTok connection lost for user:', username);
      socket.emit('tiktok_error', { 
        message: 'انقطع الاتصال، جاري إعادة المحاولة...',
        isReconnecting: true 
      });
    });

    // Monitor connection health with improved stability
    const healthCheck = setInterval(() => {
      try {
        // Check if connection exists and is active
        if (tiktokLiveConnection && typeof tiktokLiveConnection.getState === 'function') {
          const state = tiktokLiveConnection.getState();
          if (state !== 'connected') {
            console.log('Connection health check - state:', state, 'for user:', username);
          }
        } else if (tiktokLiveConnection) {
          // Alternative check if getState is not available
          console.log('Connection health check - monitoring connection for user:', username);
        }
      } catch (healthErr) {
        console.log('Health check error (handled):', healthErr?.message);
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
