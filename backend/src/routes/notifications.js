// routes/notifications.js - Notification Management Routes
import express from 'express';
const router = express.Router();
import Notification from '../models/Notification';
import { protect } from '../middleware/auth';

// @route   GET /api/notifications
// @desc    Get user's notifications
// @access  Private
router.get('/', protect, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    let query = { recipient: req.user.id };

    // Filter by read status
    if (req.query.isRead !== undefined) {
      query.isRead = req.query.isRead === 'true';
    }

    // Filter by type
    if (req.query.type) {
      query.type = req.query.type;
    }

    const notifications = await Notification.find(query)
      .populate('sender', 'firstName lastName profileImage')
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip(skip);

    const total = await Notification.countDocuments(query);

    res.json({
      success: true,
      count: notifications.length,
      total,
      page,
      pages: Math.ceil(total / limit),
      notifications
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// @route   GET /api/notifications/unread
// @desc    Get unread notifications
// @access  Private
router.get('/unread', protect, async (req, res) => {
  try {
    const notifications = await Notification.find({
      recipient: req.user.id,
      isRead: false
    })
      .populate('sender', 'firstName lastName profileImage')
      .sort({ createdAt: -1 })
      .limit(50);

    res.json({
      success: true,
      count: notifications.length,
      notifications
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// @route   GET /api/notifications/unread/count
// @desc    Get unread notification count
// @access  Private
router.get('/unread/count', protect, async (req, res) => {
  try {
    const count = await Notification.countDocuments({
      recipient: req.user.id,
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

// @route   GET /api/notifications/:id
// @desc    Get single notification
// @access  Private
router.get('/:id', protect, async (req, res) => {
  try {
    const notification = await Notification.findOne({
      _id: req.params.id,
      recipient: req.user.id
    }).populate('sender', 'firstName lastName profileImage');

    if (!notification) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    res.json({
      success: true,
      notification
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// @route   PUT /api/notifications/:id/read
// @desc    Mark notification as read
// @access  Private
router.put('/:id/read', protect, async (req, res) => {
  try {
    const notification = await Notification.findOne({
      _id: req.params.id,
      recipient: req.user.id
    });

    if (!notification) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    notification.isRead = true;
    notification.readAt = new Date();
    await notification.save();

    res.json({
      success: true,
      notification
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// @route   PUT /api/notifications/read-all
// @desc    Mark all notifications as read
// @access  Private
router.put('/read-all', protect, async (req, res) => {
  try {
    const result = await Notification.updateMany(
      { recipient: req.user.id, isRead: false },
      { isRead: true, readAt: new Date() }
    );

    res.json({
      success: true,
      message: 'All notifications marked as read',
      updated: result.modifiedCount
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// @route   DELETE /api/notifications/:id
// @desc    Delete notification
// @access  Private
router.delete('/:id', protect, async (req, res) => {
  try {
    const notification = await Notification.findOne({
      _id: req.params.id,
      recipient: req.user.id
    });

    if (!notification) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    await notification.deleteOne();

    res.json({
      success: true,
      message: 'Notification deleted'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// @route   DELETE /api/notifications/clear-all
// @desc    Clear all read notifications
// @access  Private
router.delete('/clear-all', protect, async (req, res) => {
  try {
    const result = await Notification.deleteMany({
      recipient: req.user.id,
      isRead: true
    });

    res.json({
      success: true,
      message: `${result.deletedCount} notifications cleared`
    });
	} catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// @route   DELETE /api/notifications/clear-old
// @desc    Clear notifications older than 30 days
// @access  Private
router.delete('/clear-old', protect, async (req, res) => {
  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const result = await Notification.deleteMany({
      recipient: req.user.id,
      createdAt: { $lt: thirtyDaysAgo }
    });

    res.json({
      success: true,
      message: `${result.deletedCount} old notifications cleared`
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// @route   GET /api/notifications/by-type/:type
// @desc    Get notifications by type
// @access  Private
router.get('/by-type/:type', protect, async (req, res) => {
  try {
    const validTypes = [
      'new_message',
      'new_grade',
      'new_announcement',
      'exam_reminder',
      'attendance_marked',
      'course_update',
      'club_invite',
      'deadline_reminder',
      'system'
    ];

    if (!validTypes.includes(req.params.type)) {
      return res.status(400).json({ error: 'Invalid notification type' });
    }

    const notifications = await Notification.find({
      recipient: req.user.id,
      type: req.params.type
    })
      .populate('sender', 'firstName lastName profileImage')
      .sort({ createdAt: -1 })
      .limit(50);

    res.json({
      success: true,
      type: req.params.type,
      count: notifications.length,
      notifications
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// @route   GET /api/notifications/priority/:priority
// @desc    Get notifications by priority
// @access  Private
router.get('/priority/:priority', protect, async (req, res) => {
  try {
    const validPriorities = ['low', 'normal', 'high', 'urgent'];

    if (!validPriorities.includes(req.params.priority)) {
      return res.status(400).json({ error: 'Invalid priority level' });
    }

    const notifications = await Notification.find({
      recipient: req.user.id,
      priority: req.params.priority
    })
      .populate('sender', 'firstName lastName profileImage')
      .sort({ createdAt: -1 })
      .limit(50);

    res.json({
      success: true,
      priority: req.params.priority,
      count: notifications.length,
      notifications
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;