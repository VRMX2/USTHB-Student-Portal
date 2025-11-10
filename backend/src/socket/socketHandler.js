import jwt from 'jsonwebtoken';
import User from '../models/User.js';

// Store active users
const activeUsers = new Map();

const initializeSocket = (io) => {
  io.on('connection', async (socket) => {
    console.log('New socket connection:', socket.id);

    // Authenticate socket connection
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

      // Store user socket
      socket.userId = user._id.toString();
      activeUsers.set(socket.userId, socket.id);

      // Join user-specific room
      socket.join(`user_${socket.userId}`);
      
      // Join student-specific room if student
      if (user.role === 'student') {
        socket.join(`student_${socket.userId}`);
      }

      console.log(`User ${user.firstName} ${user.lastName} connected`);

      // Emit user online status
      io.emit('user_online', { userId: socket.userId });

      // Handle private messages
      socket.on('send_message', async (data) => {
        const { receiverId, content, attachments } = data;
        
        // Emit to receiver
        io.to(`user_${receiverId}`).emit('receive_message', {
          senderId: socket.userId,
          content,
          attachments,
          timestamp: new Date()
        });
      });

      // Handle typing indicator
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

      // Handle course chat rooms
      socket.on('join_course', (courseId) => {
        socket.join(`course_${courseId}`);
        console.log(`User ${socket.userId} joined course ${courseId}`);
      });

      socket.on('leave_course', (courseId) => {
        socket.leave(`course_${courseId}`);
        console.log(`User ${socket.userId} left course ${courseId}`);
      });

      // Handle club chat rooms
      socket.on('join_club', (clubId) => {
        socket.join(`club_${clubId}`);
        console.log(`User ${socket.userId} joined club ${clubId}`);
      });

      socket.on('leave_club', (clubId) => {
        socket.leave(`club_${clubId}`);
        console.log(`User ${socket.userId} left club ${clubId}`);
      });

      // Handle disconnect
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

  // Helper function to emit to specific users
  io.emitToUser = (userId, event, data) => {
    const socketId = activeUsers.get(userId.toString());
    if (socketId) {
      io.to(`user_${userId}`).emit(event, data);
    }
  };

  // Helper function to check if user is online
  io.isUserOnline = (userId) => {
    return activeUsers.has(userId.toString());
  };

  // Get all online users
  io.getOnlineUsers = () => {
    return Array.from(activeUsers.keys());
  };
};

module.exports = { initializeSocket };