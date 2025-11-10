import express from 'express';
import Announcement from '../models/Announcement.js';
import Course from '../models/Course.js';
import User from '../models/User.js';
import { protect, authorize } from '../middleware/auth.js';
import { 
  createAnnouncementValidation, 
  validateMongoId, 
  validate 
} from '../middleware/validation.js';
import { uploadToCloudinary, upload } from '../config/cloudinary.js';
import { createBulkNotifications } from '../utils/notificationService.js';

const router = express.Router();

// @route   GET /api/announcements
// @desc    Get all announcements (filtered by role and target)
// @access  Private
router.get('/', protect, async (req, res) => {
  try {
    const { priority, targetAudience, course, isActive } = req.query;
    
    let query = {};

    // Build query based on user role
    if (req.user.role === 'student') {
      query.$or = [
        { targetAudience: 'All' },
        { targetAudience: 'Faculty', 'targetDetails.faculty': req.user.faculty },
        { targetAudience: 'Department', 'targetDetails.department': req.user.department },
        { targetAudience: 'Level', 'targetDetails.level': req.user.level },
        { course: { $in: req.user.enrolledCourses } }
      ];
      query.isActive = true;
    } else if (req.user.role === 'professor') {
      const courses = await Course.find({ professor: req.user._id });
      const courseIds = courses.map(c => c._id);
      
      query.$or = [
        { targetAudience: 'All' },
        { author: req.user._id },
        { course: { $in: courseIds } }
      ];
    }

    // Additional filters
    if (priority) query.priority = priority;
    if (targetAudience) query.targetAudience = targetAudience;
    if (course) query.course = course;
    if (isActive !== undefined) query.isActive = isActive === 'true';

    // Filter out expired announcements for students
    if (req.user.role === 'student') {
      query.$and = [
        {
          $or: [
            { expiryDate: { $exists: false } },
            { expiryDate: null },
            { expiryDate: { $gte: new Date() } }
          ]
        }
      ];
    }

    const announcements = await Announcement.find(query)
      .populate('author', 'firstName lastName profileImage role')
      .populate('course', 'code name')
      .sort({ priority: -1, createdAt: -1 });

    res.json({
      success: true,
      count: announcements.length,
      announcements
    });
  } catch (error) {
    console.error('Get announcements error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// @route   GET /api/announcements/:id
// @desc    Get single announcement
// @access  Private
router.get('/:id', protect, validateMongoId, validate, async (req, res) => {
  try {
    const announcement = await Announcement.findById(req.params.id)
      .populate('author', 'firstName lastName profileImage role email')
      .populate('course', 'code name professor');

    if (!announcement) {
      return res.status(404).json({ error: 'Announcement not found' });
    }

    // Check if student is authorized to view
    if (req.user.role === 'student') {
      if (!announcement.isActive) {
        return res.status(403).json({ error: 'Announcement not available' });
      }

      // Check expiry
      if (announcement.expiryDate && announcement.expiryDate < new Date()) {
        return res.status(403).json({ error: 'Announcement expired' });
      }

      // Check target audience
      const canView =
        announcement.targetAudience === 'All' ||
        (announcement.targetAudience === 'Faculty' && 
         announcement.targetDetails?.faculty === req.user.faculty) ||
        (announcement.targetAudience === 'Department' && 
         announcement.targetDetails?.department === req.user.department) ||
        (announcement.targetAudience === 'Level' && 
         announcement.targetDetails?.level === req.user.level) ||
        (announcement.course && 
         req.user.enrolledCourses.some(c => c.toString() === announcement.course._id.toString()));

      if (!canView) {
        return res.status(403).json({ error: 'Not authorized to view this announcement' });
      }
    }

    res.json({
      success: true,
      announcement
    });
  } catch (error) {
    console.error('Get announcement error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// @route   POST /api/announcements
// @desc    Create new announcement
// @access  Private (Professor, Admin)
router.post(
  '/',
  protect,
  authorize('professor', 'admin'),
  createAnnouncementValidation,
  validate,
  async (req, res) => {
    try {
      const {
        title,
        content,
        course,
        priority,
        targetAudience,
        targetDetails,
        expiryDate
      } = req.body;

      // If course-specific, verify authorization
      if (course) {
        const courseData = await Course.findById(course);
        if (!courseData) {
          return res.status(404).json({ error: 'Course not found' });
        }

        if (
          req.user.role === 'professor' &&
          courseData.professor.toString() !== req.user._id.toString()
        ) {
          return res.status(403).json({ error: 'Not authorized for this course' });
        }
      }

      const announcement = await Announcement.create({
        title,
        content,
        author: req.user._id,
        course: course || undefined,
        priority: priority || 'Normal',
        targetAudience,
        targetDetails,
        expiryDate: expiryDate ? new Date(expiryDate) : undefined
      });

      const populatedAnnouncement = await Announcement.findById(announcement._id)
        .populate('author', 'firstName lastName profileImage')
        .populate('course', 'code name');

      // Send notifications to target audience
      let recipients = [];

      if (targetAudience === 'All') {
        recipients = await User.find({ role: 'student', isActive: true });
      } else if (targetAudience === 'Faculty' && targetDetails?.faculty) {
        recipients = await User.find({ 
          role: 'student', 
          faculty: targetDetails.faculty,
          isActive: true 
        });
      } else if (targetAudience === 'Department' && targetDetails?.department) {
        recipients = await User.find({ 
          role: 'student', 
          department: targetDetails.department,
          isActive: true 
        });
      } else if (targetAudience === 'Level' && targetDetails?.level) {
        recipients = await User.find({ 
          role: 'student', 
          level: targetDetails.level,
          isActive: true 
        });
      } else if (targetAudience === 'Course' && course) {
        const courseData = await Course.findById(course);
        recipients = await User.find({ 
          _id: { $in: courseData.enrolledStudents },
          isActive: true 
        });
      }

      // Create notifications
      if (recipients.length > 0) {
        const notifications = recipients.map(user => ({
          recipient: user._id,
          sender: req.user._id,
          type: 'new_announcement',
          title: 'New Announcement',
          message: title,
          priority: priority?.toLowerCase() || 'normal',
          link: `/announcements/${announcement._id}`
        }));

        await createBulkNotifications(notifications);
      }

      res.status(201).json({
        success: true,
        announcement: populatedAnnouncement
      });
    } catch (error) {
      console.error('Create announcement error:', error);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// @route   POST /api/announcements/:id/attachments
// @desc    Add attachment to announcement
// @access  Private (Author, Admin)
router.post(
  '/:id/attachments',
  protect,
  authorize('professor', 'admin'),
  upload.single('file'),
  async (req, res) => {
    try {
      const announcement = await Announcement.findById(req.params.id);

      if (!announcement) {
        return res.status(404).json({ error: 'Announcement not found' });
      }

      // Check authorization
      if (
        req.user.role !== 'admin' &&
        announcement.author.toString() !== req.user._id.toString()
      ) {
        return res.status(403).json({ error: 'Not authorized' });
      }

      if (!req.file) {
        return res.status(400).json({ error: 'Please upload a file' });
      }

      const result = await uploadToCloudinary(req.file.buffer, 'announcements');

      const attachment = {
        url: result.secure_url,
        type: req.file.mimetype,
        name: req.body.name || req.file.originalname
      };

      announcement.attachments.push(attachment);
      await announcement.save();

      res.json({
        success: true,
        message: 'Attachment added successfully',
        attachment
      });
    } catch (error) {
      console.error('Add attachment error:', error);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// @route   PUT /api/announcements/:id
// @desc    Update announcement
// @access  Private (Author, Admin)
router.put(
  '/:id',
  protect,
  authorize('professor', 'admin'),
  validateMongoId,
  validate,
  async (req, res) => {
    try {
      let announcement = await Announcement.findById(req.params.id);

      if (!announcement) {
        return res.status(404).json({ error: 'Announcement not found' });
      }

      // Check authorization
      if (
        req.user.role !== 'admin' &&
        announcement.author.toString() !== req.user._id.toString()
      ) {
        return res.status(403).json({ error: 'Not authorized' });
      }

      const allowedUpdates = [
        'title',
        'content',
        'priority',
        'expiryDate',
        'isActive'
      ];

      const updates = {};
      Object.keys(req.body).forEach(key => {
        if (allowedUpdates.includes(key)) {
          updates[key] = req.body[key];
        }
      });

      announcement = await Announcement.findByIdAndUpdate(
        req.params.id,
        updates,
        { new: true, runValidators: true }
      )
        .populate('author', 'firstName lastName profileImage')
        .populate('course', 'code name');

      res.json({
        success: true,
        announcement
      });
    } catch (error) {
      console.error('Update announcement error:', error);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// @route   DELETE /api/announcements/:id
// @desc    Delete announcement (soft delete)
// @access  Private (Author, Admin)
router.delete(
  '/:id',
  protect,
  authorize('professor', 'admin'),
  validateMongoId,
  validate,
  async (req, res) => {
    try {
      const announcement = await Announcement.findById(req.params.id);

      if (!announcement) {
        return res.status(404).json({ error: 'Announcement not found' });
      }

      // Check authorization
      if (
        req.user.role !== 'admin' &&
        announcement.author.toString() !== req.user._id.toString()
      ) {
        return res.status(403).json({ error: 'Not authorized' });
      }

      announcement.isActive = false;
      await announcement.save();

      res.json({
        success: true,
        message: 'Announcement deactivated successfully'
      });
    } catch (error) {
      console.error('Delete announcement error:', error);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

export default router;