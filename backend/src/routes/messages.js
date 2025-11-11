// routes/messages.js - Messaging System Routes
import express from 'express';
const router = express.Router();
import Message from '../models/Message';
import User from '../models/User';
import { protect } from '../middleware/auth';

// @route   GET /api/messages/conversations
// @desc    Get all conversations for current user
// @access  Private
router.get('/conversations', protect, async (req, res) => {
  try {
    const userId = req.user.id;

    // Get all unique users the current user has communicated with
    const messages = await Message.find({
      $or: [{ sender: userId }, { receiver: userId }]
    })
      .populate('sender', 'firstName lastName profileImage role')
      .populate('receiver', 'firstName lastName profileImage role')
      .sort({ createdAt: -1 });

    // Create conversations map
    const conversationsMap = new Map();

    messages.forEach(msg => {
      const otherUserId = msg.sender._id.toString() === userId 
        ? msg.receiver._id.toString()
        : msg.sender._id.toString();

      if (!conversationsMap.has(otherUserId)) {
        const otherUser = msg.sender._id.toString() === userId ? msg.receiver : msg.sender;
        conversationsMap.set(otherUserId, {
          user: otherUser,
          lastMessage: msg,
          unreadCount: 0
        });
      }

      // Count unread messages
      if (msg.receiver._id.toString() === userId && !msg.isRead) {
        const conv = conversationsMap.get(otherUserId);
        conv.unreadCount++;
      }
    });

    const conversations = Array.from(conversationsMap.values());

    res.json({
      success: true,
      count: conversations.length,
      conversations
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// @route   GET /api/messages/:userId
// @desc    Get messages between current user and another user
// @access  Private
router.get('/:userId', protect, async (req, res) => {
  try {
    const currentUserId = req.user.id;
    const otherUserId = req.params.userId;

    const messages = await Message.find({
      $or: [
        { sender: currentUserId, receiver: otherUserId },
        { sender: otherUserId, receiver: currentUserId }
      ]
    })
      .populate('sender', 'firstName lastName profileImage')
      .populate('receiver', 'firstName lastName profileImage')
      .sort({ createdAt: 1 });

    // Mark messages as read
    await Message.updateMany(
      { sender: otherUserId, receiver: currentUserId, isRead: false },
      { isRead: true, readAt: new Date() }
    );

    res.json({
      success: true,
      count: messages.length,
      messages
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// @route   GET /api/messages/conversation/:userId/paginated
// @desc    Get paginated messages between users
// @access  Private
router.get('/conversation/:userId/paginated', protect, async (req, res) => {
  try {
    const currentUserId = req.user.id;
    const otherUserId = req.params.userId;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;

    const messages = await Message.find({
      $or: [
        { sender: currentUserId, receiver: otherUserId },
        { sender: otherUserId, receiver: currentUserId }
      ]
    })
      .populate('sender', 'firstName lastName profileImage')
      .populate('receiver', 'firstName lastName profileImage')
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip(skip);

    const total = await Message.countDocuments({
      $or: [
        { sender: currentUserId, receiver: otherUserId },
        { sender: otherUserId, receiver: currentUserId }
      ]
    });

    // Reverse to show oldest first
    messages.reverse();

    res.json({
      success: true,
      count: messages.length,
      total,
      page,
      pages: Math.ceil(total / limit),
      messages
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// @route   POST /api/messages
// @desc    Send a message
// @access  Private
router.post('/', protect, async (req, res) => {
  try {
    const { receiver, content, attachments } = req.body;

    const message = await Message.create({
      sender: req.user.id,
      receiver,
      content,
      attachments
    });

    await message.populate('sender', 'firstName lastName profileImage');
    await message.populate('receiver', 'firstName lastName profileImage');

    // Emit socket event for real-time messaging
    const io = req.app.get('io');
    io.to(`user_${receiver}`).emit('new_message', message);

    res.status(201).json({
      success: true,
      message
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// @route   PUT /api/messages/:id/read
// @desc    Mark message as read
// @access  Private
router.put('/:id/read', protect, async (req, res) => {
  try {
    const message = await Message.findById(req.params.id);

    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }

    if (message.receiver.toString() !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    message.isRead = true;
    message.readAt = new Date();
    await message.save();

    res.json({
      success: true,
      message
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// @route   PUT /api/messages/conversation/:userId/read-all
// @desc    Mark all messages from a user as read
// @access  Private
router.put('/conversation/:userId/read-all', protect, async (req, res) => {
  try {
    const result = await Message.updateMany(
      { 
        sender: req.params.userId, 
        receiver: req.user.id, 
        isRead: false 
      },
      { isRead: true, readAt: new Date() }
    );

    res.json({
      success: true,
      message: 'All messages marked as read',
      updated: result.modifiedCount
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// @route   DELETE /api/messages/:id
// @desc    Delete a message
// @access  Private
router.delete('/:id', protect, async (req, res) => {
  try {
    const message = await Message.findById(req.params.id);

    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }

    if (message.sender.toString() !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    await message.deleteOne();

    res.json({
      success: true,
      message: 'Message deleted successfully'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// @route   DELETE /api/messages/conversation/:userId
// @desc    Delete entire conversation with a user
// @access  Private
router.delete('/conversation/:userId', protect, async (req, res) => {
  try {
    const result = await Message.deleteMany({
      $or: [
        { sender: req.user.id, receiver: req.params.userId },
        { sender: req.params.userId, receiver: req.user.id }
      ]
    });

    res.json({
      success: true,
      message: 'Conversation deleted successfully',
      deleted: result.deletedCount
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// @route   GET /api/messages/search/users
// @desc    Search for users (professors/students) to message
// @access  Private
router.get('/search/users', protect, async (req, res) => {
  try {
    const { query, role } = req.query;

    if (!query) {
      return res.status(400).json({ error: 'Search query is required' });
    }

    const searchRegex = new RegExp(query, 'i');

    let searchQuery = {
      _id: { $ne: req.user.id },
      $or: [
        { firstName: searchRegex },
        { lastName: searchRegex },
        { email: searchRegex },
        { studentId: searchRegex }
      ]
    };

    if (role) {
      searchQuery.role = role;
    }

    const users = await User.find(searchQuery)
      .select('firstName lastName email studentId role profileImage department')
      .limit(20);

    res.json({
      success: true,
      count: users.length,
      users
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// @route   GET /api/messages/unread/count
// @desc    Get unread message count
// @access  Private
router.get('/unread/count', protect, async (req, res) => {
  try {
    const count = await Message.countDocuments({
      receiver: req.user.id,
      isRead: false
    });

    res.json({
      success: true,
      unreadCount: count
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// @route   GET /api/messages/unread/all
// @desc    Get all unread messages
// @access  Private
router.get('/unread/all', protect, async (req, res) => {
  try {
    const messages = await Message.find({
      receiver: req.user.id,
      isRead: false
    })
      .populate('sender', 'firstName lastName profileImage')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      count: messages.length,
      messages
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// @route   GET /api/messages/recent/all
// @desc    Get recent messages from all conversations
// @access  Private
router.get('/recent/all', protect, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;

    const messages = await Message.find({
      $or: [{ sender: req.user.id }, { receiver: req.user.id }]
    })
      .populate('sender', 'firstName lastName profileImage')
      .populate('receiver', 'firstName lastName profileImage')
      .sort({ createdAt: -1 })
      .limit(limit);

    res.json({
      success: true,
      count: messages.length,
      messages
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;