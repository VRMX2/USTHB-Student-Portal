import express from 'express';
import Attendance from '../models/Attendance.js';
import Course from '../models/Course.js';
import { protect, authorize } from '../middleware/auth.js';

const router = express.Router();


// @route   GET /api/attendance
// @desc    Get attendance records
// @access  Private
router.get('/', protect, async (req, res) => {
  try {
    let query = {};

    if (req.user.role === 'student') {
      query.student = req.user.id;
    }

    if (req.query.course) query.course = req.query.course;
    if (req.query.student) query.student = req.query.student;
    if (req.query.status) query.status = req.query.status;

    const attendance = await Attendance.find(query)
      .populate('student', 'firstName lastName studentId')
      .populate('course', 'name code')
      .sort({ date: -1 });

    res.json({
      success: true,
      count: attendance.length,
      attendance
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// @route   POST /api/attendance
// @desc    Mark attendance
// @access  Private (Professor/Admin)
router.post('/', protect, authorize('professor', 'admin'), async (req, res) => {
  try {
    const { student, course, date, status, sessionType, remarks } = req.body;

    // Verify course belongs to professor
    if (req.user.role === 'professor') {
      const courseDoc = await Course.findById(course);
      if (!courseDoc || courseDoc.professor.toString() !== req.user.id) {
        return res.status(403).json({ error: 'Not authorized' });
      }
    }

    const attendance = await Attendance.create({
      student,
      course,
      date,
      status,
      sessionType,
      remarks,
      recordedBy: req.user.id
    });

    await attendance.populate('student', 'firstName lastName studentId');
    await attendance.populate('course', 'name code');

    // Emit socket event for real-time update
    const io = req.app.get('io');
    io.to(`student_${student}`).emit('attendance_marked', attendance);

    res.status(201).json({
      success: true,
      attendance
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// @route   POST /api/attendance/bulk
// @desc    Mark attendance for multiple students
// @access  Private (Professor/Admin)
router.post('/bulk', protect, authorize('professor', 'admin'), async (req, res) => {
  try {
    const { students, course, date, sessionType } = req.body;

    const courseDoc = await Course.findById(course);
    if (!courseDoc) {
      return res.status(404).json({ error: 'Course not found' });
    }

    if (req.user.role === 'professor' && courseDoc.professor.toString() !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const attendanceRecords = students.map(item => ({
      student: item.studentId,
      course,
      date,
      status: item.status,
      sessionType,
      recordedBy: req.user.id
    }));

    const attendance = await Attendance.insertMany(attendanceRecords);

    res.status(201).json({
      success: true,
      count: attendance.length,
      attendance
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// @route   GET /api/attendance/student/:studentId
// @desc    Get attendance for a specific student
// @access  Private
router.get('/student/:studentId', protect, async (req, res) => {
  try {
    if (req.user.role === 'student' && req.user.id !== req.params.studentId) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const attendance = await Attendance.find({ student: req.params.studentId })
      .populate('course', 'name code')
      .sort({ date: -1 });

    // Calculate statistics
    const stats = {
      total: attendance.length,
      present: attendance.filter(a => a.status === 'Present').length,
      absent: attendance.filter(a => a.status === 'Absent').length,
      late: attendance.filter(a => a.status === 'Late').length,
      excused: attendance.filter(a => a.status === 'Excused').length
    };

    stats.attendanceRate = stats.total > 0 
      ? ((stats.present + stats.late) / stats.total * 100).toFixed(2)
      : 0;

    res.json({
      success: true,
      stats,
      attendance
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// @route   GET /api/attendance/course/:courseId
// @desc    Get attendance for a course
// @access  Private (Professor/Admin)
router.get('/course/:courseId', protect, authorize('professor', 'admin'), async (req, res) => {
  try {
    const course = await Course.findById(req.params.courseId);

    if (!course) {
      return res.status(404).json({ error: 'Course not found' });
    }

    if (req.user.role === 'professor' && course.professor.toString() !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const attendance = await Attendance.find({ course: req.params.courseId })
      .populate('student', 'firstName lastName studentId')
      .sort({ date: -1 });

    res.json({
      success: true,
      count: attendance.length,
      attendance
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// @route   PUT /api/attendance/:id
// @desc    Update attendance record
// @access  Private (Professor/Admin)
router.put('/:id', protect, authorize('professor', 'admin'), async (req, res) => {
  try {
    let attendance = await Attendance.findById(req.params.id).populate('course');

    if (!attendance) {
      return res.status(404).json({ error: 'Attendance record not found' });
    }

    if (req.user.role === 'professor' && attendance.course.professor.toString() !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    attendance = await Attendance.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true
    })
      .populate('student', 'firstName lastName studentId')
      .populate('course', 'name code');

    res.json({
      success: true,
      attendance
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;