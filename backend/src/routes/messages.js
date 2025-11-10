import express from 'express';
import Message from '../models/Message.js';
import User from '../models/User.js';
import { protect } from '../middleware/auth.js';
import { 
  sendMessageValidation, 
  validateMongoId, 
  validate 
} from '../middleware/validation.js';
import { messageLimiter } from '../middleware/rateLimiter.js';
import { uploadToCloudinary, upload } from '../config/cloudinary.js';
import { notificationHelpers } from '../utils/notificationService.js';

const router = express.Router();

// @route   GET /api/messages
// @desc    Get all messages for logged in user
// @access  Private
router.get('/', protect, async (req, res) => {
  try {
    const messages = await Message.find({
      $or: [
        { sender: req.user._id },
        { receiver: req.user._id }
      ]
    })
      .populate('sender', 'firstName lastName profileImage studentId')
      .populate('receiver', 'firstName lastName profileImage studentId')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      count: messages.length,
      messages
    });
  } catch (error) {
    console.error('Get messages error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// @route   GET /api/messages/conversations
// @desc    Get all conversations
// @access  Private
router.get('/conversations', protect, async (req, res) => {
  try {
    const messages = await Message.aggregate([
      {
        $match: {
          $or: [
            { sender: req.user._id },
            { receiver: req.user._id }
          ]
        }
      },
      {
        $sort: { createdAt: -1 }
      },
      {
        $group: {
          _id: {
            $cond: [
              { $eq: ['$sender', req.user._id] },
              '$receiver',
              '$sender'
            ]
          },
          lastMessage: { $first: '$$ROOT' },
          unreadCount: {
            $sum: {
              $cond: [
                { 
                  $and: [
                    { $eq: ['$receiver', req.user._id] },
                    { $eq: ['$isRead', false] }
                  ]
                },
                1,
                0
              ]
            }
          }
        }
      },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'otherUser'
        }
      },
      {
        $unwind: '$otherUser'
      },
      {
        $project: {
          otherUser: {
            _id: 1,
            firstName: 1,
            lastName: 1,
            profileImage: 1,
            studentId: 1,
            role: 1
          },
          lastMessage: 1,
          unreadCount: 1
        }
      },
      {
        $sort: { 'lastMessage.createdAt': -1 }
      }
    ]);

    res.json({
      success: true,
      count: messages.length,
      conversations: messages
    });
  } catch (error) {
    console.error('Get conversations error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// @route   GET /api/messages/conversation/:userId
// @desc    Get conversation with specific user
// @access  Private
router.get(
  '/conversation/:userId',
  protect,
  validateMongoId,
  validate,
  async (req, res) => {
    try {
      const messages = await Message.find({
        $or: [
          { sender: req.user._id, receiver: req.params.userId },
          { sender: req.params.userId, receiver: req.user._id }
        ]
      })
        .populate('sender', 'firstName lastName profileImage studentId')
        .populate('receiver', 'firstName lastName profileImage studentId')
        .sort({ createdAt: 1 });

      // Mark messages as read
      await Message.updateMany(
        {
          sender: req.params.userId,
          receiver: req.user._id,
          isRead: false
        },
        {
          isRead: true,
          readAt: new Date()
        }
      );

      res.json({
        success: true,
        count: messages.length,
        messages
      });
    } catch (error) {
      console.error('Get conversation error:', error);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// @route   GET /api/messages/unread
// @desc    Get unread messages count
// @access  Private
router.get('/unread', protect, async (req, res) => {
  try {
    const count = await Message.countDocuments({
      receiver: req.user._id,
      isRead: false
    });

    res.json({
      success: true,
      unreadCount: count
    });
  } catch (error) {
    console.error('Get unread count error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// @route   GET /api/messages/:id
// @desc    Get single message
// @access  Private
router.get('/:id', protect, validateMongoId, validate, async (req, res) => {
  try {
    const message = await Message.findById(req.params.id)
      .populate('sender', 'firstName lastName profileImage studentId')
      .populate('receiver', 'firstName lastName profileImage studentId');

    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }

    // Check authorization
    if (
      message.sender._id.toString() !== req.user._id.toString() &&
      message.receiver._id.toString() !== req.user._id.toString()
    ) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    // Mark as read if receiver is viewing
    if (
      message.receiver._id.toString() === req.user._id.toString() &&
      !message.isRead
    ) {
      message.isRead = true;
      message.readAt = new Date();
      await message.save();
    }

    res.json({
      success: true,
      message
    });
  } catch (error) {
    console.error('Get message error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// @route   POST /api/messages
// @desc    Send a new message
// @access  Private
router.post(
  '/',
  protect,
  messageLimiter,
  sendMessageValidation,
  validate,
  async (req, res) => {
    try {
      const { receiver, content } = req.body;

      // Check if receiver exists
      const receiverUser = await User.findById(receiver);
      if (!receiverUser) {
        return res.status(404).json({ error: 'Receiver not found' });
      }

      // Can't send message to self
      if (receiver === req.user._id.toString()) {
        return res.status(400).json({ error: 'Cannot send message to yourself' });
      }

      const message = await Message.create({
        sender: req.user._id,
        receiver,
        content
      });

      const populatedMessage = await Message.findById(message._id)
        .populate('sender', 'firstName lastName profileImage studentId')
        .populate('receiver', 'firstName lastName profileImage studentId');

      // Create notification for receiver
      await notificationHelpers.newMessage(
        receiver,
        req.user._id,
        content.substring(0, 50)
      );

      res.status(201).json({
        success: true,
        message: populatedMessage
      });
    } catch (error) {
      console.error('Send message error:', error);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// @route   POST /api/messages/with-attachment
// @desc    Send message with attachment
// @access  Private
router.post(
  '/with-attachment',
  protect,
  messageLimiter,
  upload.single('attachment'),
  async (req, res) => {
    try {
      const { receiver, content } = req.body;

      if (!receiver || !content) {
        return res.status(400).json({ 
          error: 'Please provide receiver and content' 
        });
      }

      // Check if receiver exists
      const receiverUser = await User.findById(receiver);
      if (!receiverUser) {
        return res.status(404).json({ error: 'Receiver not found' });
      }

      let attachments = [];

      if (req.file) {
        const result = await uploadToCloudinary(req.file.buffer, 'message-attachments');
        attachments.push({
          url: result.secure_url,
          type: req.file.mimetype,
          name: req.file.originalname
        });
      }

      const message = await Message.create({
        sender: req.user._id,
        receiver,
        content,
        attachments
      });

      const populatedMessage = await Message.findById(message._id)
        .populate('sender', 'firstName lastName profileImage studentId')
        .populate('receiver', 'firstName lastName profileImage studentId');

      // Create notification
      await notificationHelpers.newMessage(
        receiver,
        req.user._id,
        content.substring(0, 50)
      );

      res.status(201).json({
        success: true,
        message: populatedMessage
      });
    } catch (error) {
      console.error('Send message with attachment error:', error);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// @route   PUT /api/messages/:id/read
// @desc    Mark message as read
// @access  Private
router.put('/:id/read', protect, validateMongoId, validate, async (req, res) => {
  try {
    const message = await Message.findById(req.params.id);

    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }

    // Check if user is the receiver
    if (message.receiver.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    message.isRead = true;
    message.readAt = new Date();
    await message.save();

    res.json({
      success: true,
      message: 'Message marked as read'
    });
  } catch (error) {
    console.error('Mark message as read error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// @route   DELETE /api/messages/:id
// @desc    Delete message
// @access  Private
router.delete('/:id', protect, validateMongoId, validate, async (req, res) => {
  try {
    const message = await Message.findById(req.params.id);

    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }

    // Check if user is the sender
    if (message.sender.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    await message.deleteOne();

    res.json({
      success: true,
      message: 'Message deleted successfully'
    });
  } catch (error) {
    console.error('Delete message error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// @route   POST /api/messages/mark-all-read
// @desc    Mark all messages from a user as read
// @access  Private
router.post('/mark-all-read/:userId', protect, async (req, res) => {
  try {
    await Message.updateMany(
      {
        sender: req.params.userId,
        receiver: req.user._id,
        isRead: false
      },
      {
        isRead: true,
        readAt: new Date()
      }
    );

    res.json({
      success: true,
      message: 'All messages marked as read'
    });
  } catch (error) {
    console.error('Mark all read error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;