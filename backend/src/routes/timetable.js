import express from 'express';
import Course from '../models/Course.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

// @route   GET /api/timetable
// @desc    Get user's timetable
// @access  Private
router.get('/', protect, async (req, res) => {
  try {
    let courses;

    if (req.user.role === 'student') {
      // Get student's enrolled courses
      courses = await Course.find({ enrolledStudents: req.user.id })
        .populate('professor', 'firstName lastName email')
        .select('name code schedule');
    } else if (req.user.role === 'professor') {
      // Get professor's teaching courses
      courses = await Course.find({ professor: req.user.id })
        .select('name code schedule enrolledStudents');
    }

    // Organize schedule by day
    const timetable = {
      Sunday: [],
      Monday: [],
      Tuesday: [],
      Wednesday: [],
      Thursday: [],
      Friday: [],
      Saturday: []
    };

    courses.forEach(course => {
      course.schedule.forEach(session => {
        timetable[session.day].push({
          courseId: course._id,
          courseName: course.name,
          courseCode: course.code,
          startTime: session.startTime,
          endTime: session.endTime,
          room: session.room,
          type: session.type,
          professor: course.professor
        });
      });
    });

    // Sort each day by start time
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
    res.status(500).json({ error: error.message });
  }
});

// @route   GET /api/timetable/today
// @desc    Get today's schedule
// @access  Private
router.get('/today', protect, async (req, res) => {
  try {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const today = days[new Date().getDay()];

    let courses;

	if (req.user.role === 'student') {
      courses = await Course.find({ enrolledStudents: req.user.id })
        .populate('professor', 'firstName lastName email');
    } else if (req.user.role === 'professor') {
      courses = await Course.find({ professor: req.user.id });
    }

    const todaySchedule = [];

    courses.forEach(course => {
      const todaySessions = course.schedule.filter(s => s.day === today);
      todaySessions.forEach(session => {
        todaySchedule.push({
          courseId: course._id,
          courseName: course.name,
          courseCode: course.code,
          startTime: session.startTime,
          endTime: session.endTime,
          room: session.room,
          type: session.type,
          professor: course.professor
        });
      });
    });

    todaySchedule.sort((a, b) => a.startTime.localeCompare(b.startTime));

    res.json({
      success: true,
      day: today,
      schedule: todaySchedule
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// @route   GET /api/timetable/week
// @desc    Get current week's schedule
// @access  Private
router.get('/week', protect, async (req, res) => {
  try {
    let courses;

    if (req.user.role === 'student') {
      courses = await Course.find({ enrolledStudents: req.user.id })
        .populate('professor', 'firstName lastName email');
    } else if (req.user.role === 'professor') {
      courses = await Course.find({ professor: req.user.id });
    }

    const weekSchedule = {
      Monday: [],
      Tuesday: [],
      Wednesday: [],
      Thursday: [],
      Friday: []
    };

    courses.forEach(course => {
      course.schedule.forEach(session => {
        if (weekSchedule[session.day]) {
          weekSchedule[session.day].push({
            courseId: course._id,
            courseName: course.name,
            courseCode: course.code,
            startTime: session.startTime,
            endTime: session.endTime,
            room: session.room,
            type: session.type,
            professor: course.professor
          });
        }
      });
    });

    // Sort each day
    Object.keys(weekSchedule).forEach(day => {
      weekSchedule[day].sort((a, b) => a.startTime.localeCompare(b.startTime));
    });

    res.json({
      success: true,
      weekSchedule
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// @route   GET /api/timetable/day/:day
// @desc    Get schedule for specific day
// @access  Private
router.get('/day/:day', protect, async (req, res) => {
  try {
    const validDays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const day = req.params.day;

    if (!validDays.includes(day)) {
      return res.status(400).json({ error: 'Invalid day' });
    }

    let courses;

    if (req.user.role === 'student') {
      courses = await Course.find({ enrolledStudents: req.user.id })
        .populate('professor', 'firstName lastName email');
    } else if (req.user.role === 'professor') {
      courses = await Course.find({ professor: req.user.id });
    }

    const daySchedule = [];

    courses.forEach(course => {
      const daySessions = course.schedule.filter(s => s.day === day);
      daySessions.forEach(session => {
        daySchedule.push({
          courseId: course._id,
          courseName: course.name,
          courseCode: course.code,
          startTime: session.startTime,
          endTime: session.endTime,
          room: session.room,
          type: session.type,
          professor: course.professor
        });
      });
    });

    daySchedule.sort((a, b) => a.startTime.localeCompare(b.startTime));

    res.json({
      success: true,
      day,
      schedule: daySchedule
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// @route   GET /api/timetable/conflicts
// @desc    Check for schedule conflicts
// @access  Private
router.get('/conflicts', protect, async (req, res) => {
  try {
    let courses;

    if (req.user.role === 'student') {
      courses = await Course.find({ enrolledStudents: req.user.id });
    } else if (req.user.role === 'professor') {
      courses = await Course.find({ professor: req.user.id });
    }

    const conflicts = [];
    const sessions = [];

    // Collect all sessions
    courses.forEach(course => {
      course.schedule.forEach(session => {
        sessions.push({
          courseId: course._id,
          courseName: course.name,
          day: session.day,
          startTime: session.startTime,
          endTime: session.endTime,
          room: session.room
        });
      });
    });

    // Check for conflicts
    for (let i = 0; i < sessions.length; i++) {
      for (let j = i + 1; j < sessions.length; j++) {
        if (sessions[i].day === sessions[j].day) {
          const start1 = sessions[i].startTime;
          const end1 = sessions[i].endTime;
          const start2 = sessions[j].startTime;
          const end2 = sessions[j].endTime;

          // Check if times overlap
          if ((start1 < end2 && end1 > start2) || (start2 < end1 && end2 > start1)) {
            conflicts.push({
              day: sessions[i].day,
              course1: {
                name: sessions[i].courseName,
                time: `${start1} - ${end1}`,
                room: sessions[i].room
              },
              course2: {
                name: sessions[j].courseName,
                time: `${start2} - ${end2}`,
                room: sessions[j].room
              }
            });
          }
        }
      }
    }

    res.json({
      success: true,
      hasConflicts: conflicts.length > 0,
      count: conflicts.length,
      conflicts
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// @route   GET /api/timetable/next-class
// @desc    Get next upcoming class
// @access  Private
router.get('/next-class', protect, async (req, res) => {
  try {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const now = new Date();
    const currentDay = days[now.getDay()];
    const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    let courses;

    if (req.user.role === 'student') {
      courses = await Course.find({ enrolledStudents: req.user.id })
        .populate('professor', 'firstName lastName email');
    } else if (req.user.role === 'professor') {
      courses = await Course.find({ professor: req.user.id });
    }

    const allSessions = [];

    courses.forEach(course => {
      course.schedule.forEach(session => {
        allSessions.push({
          courseId: course._id,
          courseName: course.name,
          courseCode: course.code,
          day: session.day,
          startTime: session.startTime,
          endTime: session.endTime,
          room: session.room,
          type: session.type,
          professor: course.professor
        });
      });
    });

    // Find next class today or in upcoming days
    let nextClass = null;

    // First check today
    const todaySessions = allSessions
      .filter(s => s.day === currentDay && s.startTime > currentTime)
      .sort((a, b) => a.startTime.localeCompare(b.startTime));

    if (todaySessions.length > 0) {
      nextClass = todaySessions[0];
      nextClass.isToday = true;
    } else {
      // Check upcoming days
      const currentDayIndex = days.indexOf(currentDay);
      for (let i = 1; i <= 7; i++) {
        const nextDayIndex = (currentDayIndex + i) % 7;
        const nextDay = days[nextDayIndex];
        const nextDaySessions = allSessions
          .filter(s => s.day === nextDay)
          .sort((a, b) => a.startTime.localeCompare(b.startTime));

        if (nextDaySessions.length > 0) {
          nextClass = nextDaySessions[0];
          nextClass.isToday = false;
          nextClass.daysUntil = i;
          break;
        }
      }
    }

    res.json({
      success: true,
      currentTime,
      currentDay,
      nextClass
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;