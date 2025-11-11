// routes/announcements.js - Announcement Management Routes
import express from 'express';
const router = express.Router();
import Announcement from '../models/Announcement';
import Course from '../models/Course';
import { protect, authorize } from '../middleware/auth';

// @route   GET /api/announcements
// @desc    Get announcements for user
// @access  Private
router.get('/', protect, async (req, res) => {
  try {
    let query = { isActive: true };

    // Filter expired announcements
    query.$or = [
      { expiryDate: { $exists: false } },
      { expiryDate: { $gte: new Date() } }
    ];

    // Filter by target audience
    if (req.user.role === 'student') {
      const courses = await Course.find({ enrolledStudents: req.user.id }).select('_id');
      
      query.$and = [{
        $or: [
          { targetAudience: 'All' },
          { targetAudience: 'Faculty', 'targetDetails.faculty': req.user.faculty },
          { targetAudience: 'Department', 'targetDetails.department': req.user.department },
          { targetAudience: 'Level', 'targetDetails.level': req.user.level },
          { targetAudience: 'Course', course: { $in: courses.map(c => c._id) } }
        ]
      }];
    }

    if (req.query.priority) query.priority = req.query.priority;

    const announcements = await Announcement.find(query)
      .populate('author', 'firstName lastName role')
      .populate('course', 'name code')
      .sort({ priority: -1, createdAt: -1 });

    res.json({
      success: true,
      count: announcements.length,
      announcements
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// @route   GET /api/announcements/:id
// @desc    Get single announcement
// @access  Private
router.get('/:id', protect, async (req, res) => {
  try {
    const announcement = await Announcement.findById(req.params.id)
      .populate('author', 'firstName lastName email role')
      .populate('course', 'name code');

    if (!announcement) {
      return res.status(404).json({ error: 'Announcement not found' });
    }

    res.json({
      success: true,
      announcement
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// @route   POST /api/announcements
// @desc    Create announcement
// @access  Private (Professor/Admin)
router.post('/', protect, authorize('professor', 'admin'), async (req, res) => {
  try {
    const announcementData = {
      ...req.body,
      author: req.user.id
    };

    // If course announcement, verify professor teaches it
    if (req.body.course && req.user.role === 'professor') {
      const course = await Course.findById(req.body.course);
      if (!course || course.professor.toString() !== req.user.id) {
        return res.status(403).json({ error: 'Not authorized to post to this course' });
      }
    }

    const announcement = await Announcement.create(announcementData);

    await announcement.populate('author', 'firstName lastName role');
    await announcement.populate('course', 'name code');

    // Emit socket event for real-time notifications
    const io = req.app.get('io');
    io.emit('new_announcement', announcement);

    res.status(201).json({
      success: true,
      announcement
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// @route   PUT /api/announcements/:id
// @desc    Update announcement
// @access  Private (Author/Admin)
router.put('/:id', protect, async (req, res) => {
  try {
    let announcement = await Announcement.findById(req.params.id);

    if (!announcement) {
      return res.status(404).json({ error: 'Announcement not found' });
    }

    // Check if user is author or admin
    if (announcement.author.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Not authorized' });
    }

    announcement = await Announcement.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true
    })
      .populate('author', 'firstName lastName role')
      .populate('course', 'name code');

    res.json({
      success: true,
      announcement
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// @route   DELETE /api/announcements/:id
// @desc    Delete announcement
// @access  Private (Author/Admin)
router.delete('/:id', protect, async (req, res) => {
  try {
    const announcement = await Announcement.findById(req.params.id);

    if (!announcement) {
      return res.status(404).json({ error: 'Announcement not found' });
    }

    if (announcement.author.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Not authorized' });
    }

    await announcement.deleteOne();

    res.json({
      success: true,
      message: 'Announcement deleted successfully'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// @route   PUT /api/announcements/:id/toggle
// @desc    Toggle announcement active status
// @access  Private (Author/Admin)
router.put('/:id/toggle', protect, async (req, res) => {
  try {
    const announcement = await Announcement.findById(req.params.id);

    if (!announcement) {
      return res.status(404).json({ error: 'Announcement not found' });
    }

    if (announcement.author.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Not authorized' });
    }

    announcement.isActive = !announcement.isActive;
    await announcement.save();

    res.json({
      success: true,
      announcement
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// @route   GET /api/announcements/course/:courseId
// @desc    Get announcements for a specific course
// @access  Private
router.get('/course/:courseId', protect, async (req, res) => {
  try {
    const announcements = await Announcement.find({
      course: req.params.courseId,
      isActive: true
    })
      .populate('author', 'firstName lastName role')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      count: announcements.length,
      announcements
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// @route   GET /api/announcements/my/posted
// @desc    Get announcements posted by current user
// @access  Private (Professor/Admin)
router.get('/my/posted', protect, authorize('professor', 'admin'), async (req, res) => {
  try {
    const announcements = await Announcement.find({
      author: req.user.id
    })
      .populate('course', 'name code')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      count: announcements.length,
      announcements
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// @route   GET /api/announcements/priority/:priority
// @desc    Get announcements by priority
// @access  Private
router.get('/priority/:priority', protect, async (req, res) => {
  try {
    const validPriorities = ['Low', 'Normal', 'High', 'Urgent'];
    
    if (!validPriorities.includes(req.params.priority)) {
      return res.status(400).json({ error: 'Invalid priority level' });
    }

    let query = {
      priority: req.params.priority,
      isActive: true
    };

    // Filter by target audience
    if (req.user.role === 'student') {
      const courses = await Course.find({ enrolledStudents: req.user.id }).select('_id');
      
      query.$or = [
        { targetAudience: 'All' },
        { targetAudience: 'Faculty', 'targetDetails.faculty': req.user.faculty },
        { targetAudience: 'Department', 'targetDetails.department': req.user.department },
        { targetAudience: 'Level', 'targetDetails.level': req.user.level },
        { targetAudience: 'Course', course: { $in: courses.map(c => c._id) } }
      ];
    }

    const announcements = await Announcement.find(query)
      .populate('author', 'firstName lastName role')
      .populate('course', 'name code')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      priority: req.params.priority,
      count: announcements.length,
      announcements
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// @route   GET /api/announcements/recent/all
// @desc    Get recent announcements (last 7 days)
// @access  Private
router.get('/recent/all', protect, async (req, res) => {
  try {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    let query = {
      isActive: true,
      createdAt: { $gte: sevenDaysAgo }
    };

    // Filter by target audience
    if (req.user.role === 'student') {
      const courses = await Course.find({ enrolledStudents: req.user.id }).select('_id');
      
      query.$or = [
        { targetAudience: 'All' },
        { targetAudience: 'Faculty', 'targetDetails.faculty': req.user.faculty },
        { targetAudience: 'Department', 'targetDetails.department': req.user.department },
        { targetAudience: 'Level', 'targetDetails.level': req.user.level },
        { targetAudience: 'Course', course: { $in: courses.map(c => c._id) } }
      ];
    }

    const announcements = await Announcement.find(query)
      .populate('author', 'firstName lastName role')
      .populate('course', 'name code')
      .sort({ priority: -1, createdAt: -1 });

    res.json({
      success: true,
      count: announcements.length,
      announcements
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;