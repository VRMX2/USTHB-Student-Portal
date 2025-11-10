import express from 'express';
import Course from '../models/Course.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

// @route   GET /api/timetable
// @desc    Get user's timetable
// @access  Private
router.get('/', protect, async (req, res) => {
  try {
    let courses;

    if (req.user.role === 'student') {
      courses = await Course.find({
        enrolledStudents: req.user._id,
        isActive: true
      })
        .populate('professor', 'firstName lastName email')
        .select('code name schedule professor');
    } else if (req.user.role === 'professor') {
      courses = await Course.find({
        professor: req.user._id,
        isActive: true
      }).select('code name schedule');
    } else {
      return res.status(403).json({
        message: 'Only students and professors can view timetables'
      });
    }

    // Organize schedule by day
    const timetable = {};
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    days.forEach(day => {
      timetable[day] = [];
    });

    courses.forEach(course => {
      course.schedule.forEach(session => {
        timetable[session.day].push({
          course: {
            id: course._id,
            code: course.code,
            name: course.name
          },
          professor: course.professor,
          startTime: session.startTime,
          endTime: session.endTime,
          room: session.room,
          type: session.type
        });
      });
    });

    // Sort sessions by start time for each day
    Object.keys(timetable).forEach(day => {
      timetable[day].sort((a, b) => {
        return a.startTime.localeCompare(b.startTime);
      });
    });

    res.json({
      success: true,
      timetable
    });
  } catch (error) {
    console.error('Get timetable error:', error);
    res.status(500).json({
      message: 'Error fetching timetable',
      error: error.message
    });
  }
});

export default router;