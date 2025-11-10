const jwt = require('jsonwebtoken');
const User = require('../models/User');

const activeUsers = new Map();

const initializeSocket = (io) => {
  io.on('connection', async (socket) => {
    console.log('New socket connection:', socket.id);

    const token = socket.handshake.auth.token;
    
    if (!token) {
      console.log('No token provided');
      socket.disconnect();
      return;
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.id).select('-password');

      if (!user) {
        socket.disconnect();
        return;
      }

      socket.userId = user._id.toString();
      activeUsers.set(socket.userId, socket.id);

      socket.join(`user_${socket.userId}`);
      
      if (user.role === 'student') {
        socket.join(`student_${socket.userId}`);
      }

      console.log(`User ${user.firstName} ${user.lastName} connected`);

      io.emit('user_online', { userId: socket.userId });

      socket.on('send_message', async (data) => {
        const { receiverId, content, attachments } = data;
        io.to(`user_${receiverId}`).emit('receive_message', {
          senderId: socket.userId,
          content,
          attachments,
          timestamp: new Date()
        });
      });

      socket.on('typing', (data) => {
        const { receiverId } = data;
        io.to(`user_${receiverId}`).emit('user_typing', {
          userId: socket.userId,
          isTyping: true
        });
      });

      socket.on('stop_typing', (data) => {
        const { receiverId } = data;
        io.to(`user_${receiverId}`).emit('user_typing', {
          userId: socket.userId,
          isTyping: false
        });
      });

      socket.on('join_course', (courseId) => {
        socket.join(`course_${courseId}`);
        console.log(`User ${socket.userId} joined course ${courseId}`);
      });

      socket.on('leave_course', (courseId) => {
        socket.leave(`course_${courseId}`);
      });

      socket.on('join_club', (clubId) => {
        socket.join(`club_${clubId}`);
      });

      socket.on('leave_club', (clubId) => {
        socket.leave(`club_${clubId}`);
      });

      socket.on('disconnect', () => {
        console.log(`User ${socket.userId} disconnected`);
        activeUsers.delete(socket.userId);
        io.emit('user_offline', { userId: socket.userId });
      });

    } catch (error) {
      console.error('Socket authentication error:', error);
      socket.disconnect();
    }
  });

  io.emitToUser = (userId, event, data) => {
    const socketId = activeUsers.get(userId.toString());
    if (socketId) {
      io.to(`user_${userId}`).emit(event, data);
    }
  };

  io.isUserOnline = (userId) => {
    return activeUsers.has(userId.toString());
  };

  io.getOnlineUsers = () => {
    return Array.from(activeUsers.keys());
  };
};

module.exports = { initializeSocket };