import express from 'express';
import Attendance from '../models/Attendance.js';
import Course from '../models/Course.js';
import { protect, authorize } from '../middleware/auth.js';
import { 
  createAttendanceValidation, 
  validateMongoId, 
  validate 
} from '../middleware/validation.js';

const router = express.Router();

// @route   GET /api/attendance
// @desc    Get attendance records
// @access  Private
router.get('/', protect, async (req, res) => {
  try {
    const { course, student, startDate, endDate, status } = req.query;
    
    let query = {};

    // Role-based filtering
    if (req.user.role === 'student') {
      query.student = req.user._id;
    } else if (req.user.role === 'professor') {
      const courses = await Course.find({ professor: req.user._id });
      const courseIds = courses.map(c => c._id);
      query.course = { $in: courseIds };
    }

    // Additional filters
    if (course) query.course = course;
    if (student && req.user.role !== 'student') query.student = student;
    if (status) query.status = status;
    
    if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = new Date(startDate);
      if (endDate) query.date.$lte = new Date(endDate);
    }

    const attendance = await Attendance.find(query)
      .populate('student', 'firstName lastName studentId profileImage')
      .populate('course', 'code name')
      .populate('recordedBy', 'firstName lastName')
      .sort({ date: -1 });

    res.json({
      success: true,
      count: attendance.length,
      attendance
    });
  } catch (error) {
    console.error('Get attendance error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// @route   GET /api/attendance/my-attendance
// @desc    Get logged in student's attendance
// @access  Private (Student)
router.get('/my-attendance', protect, authorize('student'), async (req, res) => {
  try {
    const { course, startDate, endDate } = req.query;
    
    let query = { student: req.user._id };

    if (course) query.course = course;
    
    if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = new Date(startDate);
      if (endDate) query.date.$lte = new Date(endDate);
    }

    const attendance = await Attendance.find(query)
      .populate('course', 'code name credits')
      .sort({ date: -1 });

    // Calculate statistics
    const total = attendance.length;
    const present = attendance.filter(a => a.status === 'Present').length;
    const absent = attendance.filter(a => a.status === 'Absent').length;
    const late = attendance.filter(a => a.status === 'Late').length;
    const excused = attendance.filter(a => a.status === 'Excused').length;

    const attendanceRate = total > 0 
      ? ((present + late) / total * 100).toFixed(2) 
      : 0;

    res.json({
      success: true,
      count: total,
      statistics: {
        total,
        present,
        absent,
        late,
        excused,
        attendanceRate
      },
      attendance
    });
  } catch (error) {
    console.error('Get my attendance error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// @route   GET /api/attendance/:id
// @desc    Get single attendance record
// @access  Private
router.get('/:id', protect, validateMongoId, validate, async (req, res) => {
  try {
    const attendance = await Attendance.findById(req.params.id)
      .populate('student', 'firstName lastName studentId email')
      .populate('course', 'code name professor')
      .populate('recordedBy', 'firstName lastName');

    if (!attendance) {
      return res.status(404).json({ error: 'Attendance record not found' });
    }

    // Check authorization
    if (
      req.user.role === 'student' &&
      attendance.student._id.toString() !== req.user._id.toString()
    ) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    if (req.user.role === 'professor') {
      const course = await Course.findById(attendance.course._id);
      if (course.professor.toString() !== req.user._id.toString()) {
        return res.status(403).json({ error: 'Not authorized' });
      }
    }

    res.json({
      success: true,
      attendance
    });
  } catch (error) {
    console.error('Get attendance error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// @route   POST /api/attendance
// @desc    Create attendance record
// @access  Private (Professor, Admin)
router.post(
  '/',
  protect,
  authorize('professor', 'admin'),
  createAttendanceValidation,
  validate,
  async (req, res) => {
    try {
      const {
        student,
        course,
        date,
        status,
        sessionType,
        remarks
      } = req.body;

      // Verify course
      const courseData = await Course.findById(course);
      if (!courseData) {
        return res.status(404).json({ error: 'Course not found' });
      }

      // Check authorization for professor
      if (
        req.user.role === 'professor' &&
        courseData.professor.toString() !== req.user._id.toString()
      ) {
        return res.status(403).json({ error: 'Not authorized for this course' });
      }

      // Check if attendance already recorded
      const existingAttendance = await Attendance.findOne({
        student,
        course,
        date: new Date(date),
        sessionType
      });

      if (existingAttendance) {
        return res.status(400).json({ 
          error: 'Attendance already recorded for this session' 
        });
      }

      const attendance = await Attendance.create({
        student,
        course,
        date: new Date(date),
        status,
        sessionType,
        remarks,
        recordedBy: req.user._id
      });

      const populatedAttendance = await Attendance.findById(attendance._id)
        .populate('student', 'firstName lastName studentId')
        .populate('course', 'code name')
        .populate('recordedBy', 'firstName lastName');

      res.status(201).json({
		success: true,
        attendance: populatedAttendance
      });
    } catch (error) {
      console.error('Create attendance error:', error);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// @route   POST /api/attendance/bulk
// @desc    Create multiple attendance records
// @access  Private (Professor, Admin)
router.post(
  '/bulk',
  protect,
  authorize('professor', 'admin'),
  async (req, res) => {
    try {
      const { course, date, sessionType, students } = req.body;

      if (!course || !date || !sessionType || !students || !Array.isArray(students)) {
        return res.status(400).json({ 
          error: 'Please provide course, date, sessionType, and students array' 
        });
      }

      // Verify course
      const courseData = await Course.findById(course);
      if (!courseData) {
        return res.status(404).json({ error: 'Course not found' });
      }

      // Check authorization
      if (
        req.user.role === 'professor' &&
        courseData.professor.toString() !== req.user._id.toString()
      ) {
        return res.status(403).json({ error: 'Not authorized for this course' });
      }

      const attendanceRecords = students.map(item => ({
        student: item.studentId,
        course,
        date: new Date(date),
        status: item.status,
        sessionType,
        remarks: item.remarks,
        recordedBy: req.user._id
      }));

      const result = await Attendance.insertMany(attendanceRecords);

      res.status(201).json({
        success: true,
        count: result.length,
        message: `${result.length} attendance records created`
      });
    } catch (error) {
      console.error('Bulk create attendance error:', error);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// @route   PUT /api/attendance/:id
// @desc    Update attendance record
// @access  Private (Professor, Admin)
router.put(
  '/:id',
  protect,
  authorize('professor', 'admin'),
  validateMongoId,
  validate,
  async (req, res) => {
    try {
      let attendance = await Attendance.findById(req.params.id).populate('course');

      if (!attendance) {
        return res.status(404).json({ error: 'Attendance record not found' });
      }

      // Check authorization
      if (req.user.role === 'professor') {
        const course = await Course.findById(attendance.course._id);
        if (course.professor.toString() !== req.user._id.toString()) {
          return res.status(403).json({ error: 'Not authorized' });
        }
      }

      const { status, remarks } = req.body;

      if (status) attendance.status = status;
      if (remarks !== undefined) attendance.remarks = remarks;

      await attendance.save();

      attendance = await Attendance.findById(attendance._id)
        .populate('student', 'firstName lastName studentId')
        .populate('course', 'code name')
        .populate('recordedBy', 'firstName lastName');

      res.json({
        success: true,
        attendance
      });
    } catch (error) {
      console.error('Update attendance error:', error);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// @route   DELETE /api/attendance/:id
// @desc    Delete attendance record
// @access  Private (Admin)
router.delete(
  '/:id',
  protect,
  authorize('admin'),
  validateMongoId,
  validate,
  async (req, res) => {
    try {
      const attendance = await Attendance.findById(req.params.id);

      if (!attendance) {
        return res.status(404).json({ error: 'Attendance record not found' });
      }

      await attendance.deleteOne();

      res.json({
        success: true,
        message: 'Attendance record deleted successfully'
      });
    } catch (error) {
      console.error('Delete attendance error:', error);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// @route   GET /api/attendance/course/:courseId/stats
// @desc    Get attendance statistics for a course
// @access  Private (Professor, Admin)
router.get(
  '/course/:courseId/stats',
  protect,
  authorize('professor', 'admin'),
  validateMongoId,
  validate,
  async (req, res) => {
    try {
      const course = await Course.findById(req.params.courseId);

      if (!course) {
        return res.status(404).json({ error: 'Course not found' });
      }

      // Check authorization
      if (
        req.user.role === 'professor' &&
        course.professor.toString() !== req.user._id.toString()
      ) {
        return res.status(403).json({ error: 'Not authorized' });
      }

      const attendance = await Attendance.find({ course: req.params.courseId })
        .populate('student', 'firstName lastName studentId');

      // Calculate statistics per student
      const studentStats = {};

      attendance.forEach(record => {
        const studentId = record.student._id.toString();
        
        if (!studentStats[studentId]) {
          studentStats[studentId] = {
            student: record.student,
            total: 0,
            present: 0,
            absent: 0,
            late: 0,
            excused: 0
          };
        }

        studentStats[studentId].total++;
        studentStats[studentId][record.status.toLowerCase()]++;
      });

      // Calculate attendance rate for each student
      const stats = Object.values(studentStats).map(stat => ({
        ...stat,
        attendanceRate: stat.total > 0 
          ? ((stat.present + stat.late) / stat.total * 100).toFixed(2)
          : 0
      }));

      res.json({
        success: true,
        stats
      });
    } catch (error) {
      console.error('Get course attendance stats error:', error);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

export default router;