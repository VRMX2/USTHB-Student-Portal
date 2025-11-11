// routes/attendance.js - Attendance Management Routes
import express from 'express';
const  router = express.Router();
import Attendance from '../models/Attendance';
import Course from '../models/Course';
import { protect, authorize } from '../middleware/auth';

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
    if (req.query.date) {
      const date = new Date(req.query.date);
      query.date = {
        $gte: new Date(date.setHours(0, 0, 0, 0)),
        $lt: new Date(date.setHours(23, 59, 59, 999))
      };
    }

    const attendance = await Attendance.find(query)
      .populate('student', 'firstName lastName studentId')
      .populate('course', 'name code')
      .populate('recordedBy', 'firstName lastName')
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

// @route   GET /api/attendance/:id
// @desc    Get single attendance record
// @access  Private
router.get('/:id', protect, async (req, res) => {
  try {
    const attendance = await Attendance.findById(req.params.id)
      .populate('student', 'firstName lastName studentId email')
      .populate('course', 'name code')
      .populate('recordedBy', 'firstName lastName');

    if (!attendance) {
      return res.status(404).json({ error: 'Attendance record not found' });
    }

    // Check authorization
    if (req.user.role === 'student' && attendance.student._id.toString() !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    res.json({
      success: true,
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

    // Check if attendance already exists for this date
    const existingAttendance = await Attendance.findOne({
      student,
      course,
      date: {
        $gte: new Date(new Date(date).setHours(0, 0, 0, 0)),
        $lt: new Date(new Date(date).setHours(23, 59, 59, 999))
      },
      sessionType
    });

    if (existingAttendance) {
      return res.status(400).json({ 
        error: 'Attendance already marked for this student, course, and session' 
      });
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

    let query = { student: req.params.studentId };
    if (req.query.course) query.course = req.query.course;

    const attendance = await Attendance.find(query)
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

    // Get by course
    const byCourse = {};
    attendance.forEach(a => {
      const courseId = a.course._id.toString();
      if (!byCourse[courseId]) {
        byCourse[courseId] = {
          course: a.course,
          total: 0,
          present: 0,
          absent: 0,
          late: 0,
          excused: 0
        };
      }
      byCourse[courseId].total++;
      byCourse[courseId][a.status.toLowerCase()]++;
    });

    res.json({
      success: true,
      stats,
      byCourse: Object.values(byCourse),
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

    let query = { course: req.params.courseId };
    if (req.query.date) {
      const date = new Date(req.query.date);
      query.date = {
        $gte: new Date(date.setHours(0, 0, 0, 0)),
        $lt: new Date(date.setHours(23, 59, 59, 999))
      };
    }

    const attendance = await Attendance.find(query)
      .populate('student', 'firstName lastName studentId')
      .sort({ date: -1, 'student.lastName': 1 });

    // Calculate statistics
    const stats = {
      total: attendance.length,
      present: attendance.filter(a => a.status === 'Present').length,
      absent: attendance.filter(a => a.status === 'Absent').length,
      late: attendance.filter(a => a.status === 'Late').length,
      excused: attendance.filter(a => a.status === 'Excused').length,
      attendanceRate: 0
    };

    stats.attendanceRate = stats.total > 0
      ? ((stats.present + stats.late) / stats.total * 100).toFixed(2)
      : 0;

    res.json({
      success: true,
      stats,
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

// @route   DELETE /api/attendance/:id
// @desc    Delete attendance record
// @access  Private (Professor/Admin)
router.delete('/:id', protect, authorize('professor', 'admin'), async (req, res) => {
  try {
    const attendance = await Attendance.findById(req.params.id).populate('course');

    if (!attendance) {
      return res.status(404).json({ error: 'Attendance record not found' });
    }

    if (req.user.role === 'professor' && attendance.course.professor.toString() !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    await attendance.deleteOne();

    res.json({
      success: true,
      message: 'Attendance record deleted successfully'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// @route   GET /api/attendance/date/:date
// @desc    Get attendance for specific date
// @access  Private (Professor/Admin)
router.get('/date/:date', protect, authorize('professor', 'admin'), async (req, res) => {
  try {
    const date = new Date(req.params.date);
    const query = {
      date: {
        $gte: new Date(date.setHours(0, 0, 0, 0)),
        $lt: new Date(date.setHours(23, 59, 59, 999))
      }
    };

    if (req.query.course) {
      query.course = req.query.course;
    }

    const attendance = await Attendance.find(query)
      .populate('student', 'firstName lastName studentId')
      .populate('course', 'name code')
      .sort({ 'course.name': 1, 'student.lastName': 1 });

    res.json({
      success: true,
      date: req.params.date,
      count: attendance.length,
      attendance
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;