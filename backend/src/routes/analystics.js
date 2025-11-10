s // routes/analytics.js
const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const {
  calculateStudentAnalytics,
  calculateCourseAnalytics,
  calculateProfessorAnalytics,
  calculateSystemAnalytics
} = require('../utils/analytics');

// @route   GET /api/analytics/student/:id
// @desc    Get student analytics
// @access  Private (Student themselves or Professor/Admin)
router.get('/student/:id', protect, async (req, res) => {
  try {
    // Students can only view their own analytics
    if (req.user.role === 'student' && req.user.id !== req.params.id) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const analytics = await calculateStudentAnalytics(req.params.id);

    if (!analytics) {
      return res.status(404).json({ error: 'Analytics not found' });
    }

    res.json({
      success: true,
      analytics
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// @route   GET /api/analytics/course/:id
// @desc    Get course analytics
// @access  Private (Professor/Admin)
router.get('/course/:id', protect, authorize('professor', 'admin'), async (req, res) => {
  try {
    const analytics = await calculateCourseAnalytics(req.params.id);

    if (!analytics) {
      return res.status(404).json({ error: 'Analytics not found' });
    }

    res.json({
      success: true,
      analytics
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// @route   GET /api/analytics/professor/:id
// @desc    Get professor analytics
// @access  Private (Professor themselves or Admin)
router.get('/professor/:id', protect, async (req, res) => {
  try {
    // Professors can only view their own analytics unless admin
    if (req.user.role === 'professor' && req.user.id !== req.params.id) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    if (req.user.role === 'student') {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const analytics = await calculateProfessorAnalytics(req.params.id);

    if (!analytics) {
      return res.status(404).json({ error: 'Analytics not found' });
    }

    res.json({
      success: true,
      analytics
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// @route   GET /api/analytics/system
// @desc    Get system-wide analytics
// @access  Private (Admin only)
router.get('/system', protect, authorize('admin'), async (req, res) => {
  try {
    const analytics = await calculateSystemAnalytics();

    if (!analytics) {
      return res.status(404).json({ error: 'Analytics not found' });
    }

    res.json({
      success: true,
      analytics
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// @route   GET /api/analytics/my-analytics
// @desc    Get analytics for current user
// @access  Private
router.get('/my-analytics', protect, async (req, res) => {
  try {
    let analytics;

    if (req.user.role === 'student') {
      analytics = await calculateStudentAnalytics(req.user.id);
    } else if (req.user.role === 'professor') {
      analytics = await calculateProfessorAnalytics(req.user.id);
    } else {
      analytics = await calculateSystemAnalytics();
    }

    if (!analytics) {
      return res.status(404).json({ error: 'Analytics not found' });
    }

    res.json({
      success: true,
      role: req.user.role,
      analytics
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;