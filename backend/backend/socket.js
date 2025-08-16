const socketIo = require('socket.io');
const jwt = require('jsonwebtoken');
const User = require('./models/User');
const Alert = require('./models/Alert');
const Vital = require('./models/Vital');

// Socket authentication middleware
const authenticateSocket = async (socket, next) => {
  try {
    const token = socket.handshake.auth.token || socket.handshake.headers.authorization;
    
    if (!token) {
      return next(new Error('Authentication token required'));
    }

    // Remove 'Bearer ' prefix if present
    const cleanToken = token.replace('Bearer ', '');
    
    // Verify JWT token
    const decoded = jwt.verify(cleanToken, process.env.JWT_SECRET);
    
    // Get user details
    const user = await User.findById(decoded.id);
    if (!user) {
      return next(new Error('User not found'));
    }

    // Attach user info to socket
    socket.userId = user.id;
    socket.userEmail = user.email;
    socket.userRole = user.role;
    socket.userName = user.name;
    
    next();
  } catch (error) {
    console.error('Socket authentication error:', error.message);
    next(new Error('Invalid authentication token'));
  }
};

// Initialize socket server
const initializeSocket = (server) => {
  const io = socketIo(server, {
    cors: {
      origin: process.env.FRONTEND_URL || "http://localhost:3000",
      methods: ["GET", "POST"],
      credentials: true
    },
    pingTimeout: 60000,
    pingInterval: 25000
  });

  // Apply authentication middleware
  io.use(authenticateSocket);

  // Handle connections
  io.on('connection', (socket) => {
    console.log(`User connected: ${socket.userName} (ID: ${socket.userId}, Role: ${socket.userRole})`);

    // Join user-specific room
    socket.join(`user_${socket.userId}`);
    
    // Join role-specific rooms
    if (socket.userRole === 'supervisor') {
      socket.join('supervisors');
      console.log(`Supervisor ${socket.userName} joined supervisors room`);
    } else if (socket.userRole === 'employee') {
      socket.join('employees');
    }

    // Send welcome message with connection info
    socket.emit('connection_established', {
      userId: socket.userId,
      userName: socket.userName,
      userRole: socket.userRole,
      timestamp: new Date().toISOString(),
      rooms: Array.from(socket.rooms)
    });

    // Handle real-time vitals subscription
    socket.on('subscribe_vitals', (data) => {
      const { userId } = data;
      
      // Employees can only subscribe to their own vitals
      if (socket.userRole === 'employee' && userId !== socket.userId) {
        socket.emit('error', { message: 'Access denied: Can only subscribe to own vitals' });
        return;
      }
      
      // Supervisors can subscribe to any user's vitals
      if (socket.userRole === 'supervisor' || userId === socket.userId) {
        socket.join(`vitals_${userId}`);
        socket.emit('vitals_subscribed', { userId, timestamp: new Date().toISOString() });
        console.log(`User ${socket.userName} subscribed to vitals for user ${userId}`);
      }
    });

    // Handle unsubscribe from vitals
    socket.on('unsubscribe_vitals', (data) => {
      const { userId } = data;
      socket.leave(`vitals_${userId}`);
      socket.emit('vitals_unsubscribed', { userId, timestamp: new Date().toISOString() });
      console.log(`User ${socket.userName} unsubscribed from vitals for user ${userId}`);
    });

    // Handle alert acknowledgment
    socket.on('acknowledge_alert', async (data) => {
      try {
        const { alertId } = data;
        
        // Find the alert
        const alert = await Alert.findById(alertId);
        if (!alert) {
          socket.emit('error', { message: 'Alert not found' });
          return;
        }

        // Check permissions
        if (socket.userRole === 'employee' && alert.user_id !== socket.userId) {
          socket.emit('error', { message: 'Access denied: Can only acknowledge own alerts' });
          return;
        }

        // Acknowledge the alert
        const acknowledgedAlert = await Alert.acknowledge(alertId, socket.userId);
        
        if (acknowledgedAlert) {
          // Notify all supervisors
          io.to('supervisors').emit('alert_acknowledged', {
            alertId,
            alert: acknowledgedAlert,
            acknowledgedBy: socket.userId,
            acknowledgedByName: socket.userName,
            timestamp: new Date().toISOString()
          });

          // Notify the user who acknowledged
          socket.emit('alert_acknowledged_success', {
            alertId,
            alert: acknowledgedAlert,
            timestamp: new Date().toISOString()
          });

          console.log(`Alert ${alertId} acknowledged by ${socket.userName}`);
        }
      } catch (error) {
        console.error('Alert acknowledgment error:', error);
        socket.emit('error', { message: 'Failed to acknowledge alert' });
      }
    });

    // Handle bulk alert acknowledgment
    socket.on('acknowledge_alerts', async (data) => {
      try {
        const { alertIds } = data;
        
        if (!Array.isArray(alertIds) || alertIds.length === 0) {
          socket.emit('error', { message: 'Invalid alert IDs' });
          return;
        }

        // For employees, verify they own all alerts
        if (socket.userRole === 'employee') {
          for (const alertId of alertIds) {
            const alert = await Alert.findById(alertId);
            if (!alert || alert.user_id !== socket.userId) {
              socket.emit('error', { message: 'Access denied: Can only acknowledge own alerts' });
              return;
            }
          }
        }

        // Acknowledge alerts
        const acknowledgedAlerts = await Alert.bulkAcknowledge(alertIds, socket.userId);
        
        // Notify all supervisors
        io.to('supervisors').emit('alerts_acknowledged', {
          alertIds,
          alerts: acknowledgedAlerts,
          acknowledgedBy: socket.userId,
          acknowledgedByName: socket.userName,
          count: acknowledgedAlerts.length,
          timestamp: new Date().toISOString()
        });

        // Notify the user who acknowledged
        socket.emit('alerts_acknowledged_success', {
          alertIds,
          alerts: acknowledgedAlerts,
          count: acknowledgedAlerts.length,
          timestamp: new Date().toISOString()
        });

        console.log(`${acknowledgedAlerts.length} alerts acknowledged by ${socket.userName}`);
      } catch (error) {
        console.error('Bulk alert acknowledgment error:', error);
        socket.emit('error', { message: 'Failed to acknowledge alerts' });
      }
    });

    // Handle location sharing toggle
    socket.on('toggle_location_sharing', (data) => {
      const { enabled } = data;
      
      // Only employees can toggle their own location sharing
      if (socket.userRole === 'employee') {
        socket.locationSharingEnabled = enabled;
        
        // Notify supervisors about location sharing status change
        io.to('supervisors').emit('location_sharing_toggled', {
          userId: socket.userId,
          userName: socket.userName,
          enabled,
          timestamp: new Date().toISOString()
        });

        socket.emit('location_sharing_updated', {
          enabled,
          timestamp: new Date().toISOString()
        });

        console.log(`Location sharing ${enabled ? 'enabled' : 'disabled'} for ${socket.userName}`);
      } else {
        socket.emit('error', { message: 'Only employees can toggle location sharing' });
      }
    });

    // Handle heartbeat/keepalive
    socket.on('heartbeat', () => {
      socket.emit('heartbeat_ack', {
        timestamp: new Date().toISOString(),
        userId: socket.userId
      });
    });

    // Handle custom room joining (for specific features)
    socket.on('join_room', (data) => {
      const { room } = data;
      
      // Validate room name and permissions
      if (room && typeof room === 'string') {
        // Only allow certain room patterns
        if (room.startsWith('alerts_') || room.startsWith('vitals_') || room.startsWith('location_')) {
          socket.join(room);
          socket.emit('room_joined', { room, timestamp: new Date().toISOString() });
          console.log(`User ${socket.userName} joined room: ${room}`);
        } else {
          socket.emit('error', { message: 'Invalid room name' });
        }
      }
    });

    // Handle leaving custom rooms
    socket.on('leave_room', (data) => {
      const { room } = data;
      if (room) {
        socket.leave(room);
        socket.emit('room_left', { room, timestamp: new Date().toISOString() });
        console.log(`User ${socket.userName} left room: ${room}`);
      }
    });

    // Handle disconnection
    socket.on('disconnect', (reason) => {
      console.log(`User disconnected: ${socket.userName} (ID: ${socket.userId}) - Reason: ${reason}`);
      
      // Notify supervisors about employee disconnection
      if (socket.userRole === 'employee') {
        io.to('supervisors').emit('employee_disconnected', {
          userId: socket.userId,
          userName: socket.userName,
          disconnectReason: reason,
          timestamp: new Date().toISOString()
        });
      }
    });

    // Handle connection errors
    socket.on('error', (error) => {
      console.error(`Socket error for user ${socket.userName}:`, error);
    });
  });

  // Socket utility functions
  io.broadcastVitalAlert = (alert, vital) => {
    // Broadcast critical alerts to all supervisors
    if (alert.severity === 'critical') {
      io.to('supervisors').emit('critical_alert', {
        alert,
        vital,
        timestamp: new Date().toISOString(),
        requiresImmediate: true
      });
    }

    // Send alert to specific user
    io.to(`user_${alert.user_id}`).emit('new_alert', {
      alert,
      vital,
      timestamp: new Date().toISOString()
    });

    // Send to supervisors
    io.to('supervisors').emit('new_alert', {
      alert,
      vital,
      timestamp: new Date().toISOString()
    });
  };

  io.broadcastVitalUpdate = (vital, userId) => {
    // Send to subscribers of this user's vitals
    io.to(`vitals_${userId}`).emit('vital_update', {
      vital,
      userId,
      timestamp: new Date().toISOString()
    });

    // Send to supervisors
    io.to('supervisors').emit('vital_update', {
      vital,
      userId,
      timestamp: new Date().toISOString()
    });
  };

  io.broadcastLocationUpdate = (location, userId) => {
    // Send to supervisors
    io.to('supervisors').emit('location_update', {
      location,
      userId,
      timestamp: new Date().toISOString()
    });
  };

  io.broadcastAttendanceUpdate = (attendance, userId) => {
    // Send to specific user
    io.to(`user_${userId}`).emit('attendance_update', {
      attendance,
      timestamp: new Date().toISOString()
    });

    // Send to supervisors
    io.to('supervisors').emit('attendance_update', {
      attendance,
      userId,
      timestamp: new Date().toISOString()
    });
  };

  io.broadcastSystemMessage = (message, severity = 'info') => {
    io.emit('system_message', {
      message,
      severity,
      timestamp: new Date().toISOString()
    });
  };

  // Periodic cleanup of disconnected sockets
  setInterval(() => {
    const connectedSockets = io.sockets.sockets.size;
    console.log(`Connected sockets: ${connectedSockets}`);
  }, 30000); // Log every 30 seconds

  return io;
};

module.exports = { initializeSocket };