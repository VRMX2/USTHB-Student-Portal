// routes/analytics.js - Analytics & Statistics Routes
import express from 'express';
const router = express.Router();
import { protect, authorize } from '../middleware/auth';
import {
  calculateStudentAnalytics,
  calculateCourseAnalytics
} from '../utils/analytics';
import User from '../models/User';
import Course from '../models/Course';
import Grade from '../models/Grade';
import Attendance from '../models/Attendance';

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
    const course = await Course.findById(req.params.id);
    
    if (!course) {
      return res.status(404).json({ error: 'Course not found' });
    }

    // Check if professor owns the course
    if (req.user.role === 'professor' && course.professor.toString() !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized' });
    }

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

    // Get all courses taught by professor
    const courses = await Course.find({ professor: req.params.id })
      .populate('enrolledStudents');

    const totalStudents = courses.reduce((sum, course) => sum + course.enrolledStudents.length, 0);

    // Get all grades for professor's courses
    const courseIds = courses.map(c => c._id);
    const grades = await Grade.find({ course: { $in: courseIds } });

    const gradeValues = grades.map(g => g.finalGrade).filter(g => g !== undefined);
    const averageGrade = gradeValues.length > 0
      ? (gradeValues.reduce((sum, g) => sum + g, 0) / gradeValues.length).toFixed(2)
      : 0;

    // Get attendance for all courses
    const attendance = await Attendance.find({ course: { $in: courseIds } });
    const attendanceRate = attendance.length > 0
      ? ((attendance.filter(a => a.status === 'Present' || a.status === 'Late').length / attendance.length) * 100).toFixed(2)
      : 0;

    // Course performance
    const coursePerformance = await Promise.all(
      courses.map(async course => {
        const courseGrades = await Grade.find({ course: course._id });
        const courseGradeValues = courseGrades.map(g => g.finalGrade).filter(g => g !== undefined);
        
        return {
          courseName: course.name,
          courseCode: course.code,
          enrolledStudents: course.enrolledStudents.length,
          averageGrade: courseGradeValues.length > 0
            ? (courseGradeValues.reduce((sum, g) => sum + g, 0) / courseGradeValues.length).toFixed(2)
            : 0
        };
      })
    );

    const analytics = {
      totalCourses: courses.length,
      totalStudents,
      averageGrade,
      attendanceRate,
      coursePerformance
    };

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
    const [
      totalUsers,
      totalStudents,
      totalProfessors,
      totalCourses,
      activeCourses
    ] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ role: 'student' }),
      User.countDocuments({ role: 'professor' }),
      Course.countDocuments(),
      Course.countDocuments({ isActive: true })
    ]);

    // Faculty distribution
    const facultyDistribution = await User.aggregate([
      { $match: { role: 'student' } },
      { $group: { _id: '$faculty', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);

    // Level distribution
    const levelDistribution = await User.aggregate([
      { $match: { role: 'student' } },
      { $group: { _id: '$level', count: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ]);

    // Recent activity (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const recentUsers = await User.countDocuments({
      createdAt: { $gte: thirtyDaysAgo }
    });

    // Average GPA
    const allGrades = await Grade.find().populate('course', 'credits');
    let totalCredits = 0;
    let weightedGrades = 0;
    
    allGrades.forEach(grade => {
      if (grade.finalGrade && grade.course.credits) {
        totalCredits += grade.course.credits;
        weightedGrades += grade.finalGrade * grade.course.credits;
      }
    });

    const systemGPA = totalCredits > 0 ? (weightedGrades / totalCredits).toFixed(2) : 0;

    // Overall attendance rate
    const allAttendance = await Attendance.find();
    const systemAttendanceRate = allAttendance.length > 0
      ? ((allAttendance.filter(a => a.status === 'Present' || a.status === 'Late').length / allAttendance.length) * 100).toFixed(2)
      : 0;

    const analytics = {
      overview: {
        totalUsers,
        totalStudents,
        totalProfessors,
        totalCourses,
        activeCourses,
        systemGPA,
        systemAttendanceRate
      },
      facultyDistribution,
      levelDistribution,
      recentActivity: {
        newUsers: recentUsers
      }
    };

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
      // Get professor analytics
      const courses = await Course.find({ professor: req.user.id })
        .populate('enrolledStudents');

      const totalStudents = courses.reduce((sum, course) => sum + course.enrolledStudents.length, 0);

      const courseIds = courses.map(c => c._id);
      const grades = await Grade.find({ course: { $in: courseIds } });

      const gradeValues = grades.map(g => g.finalGrade).filter(g => g !== undefined);
      const averageGrade = gradeValues.length > 0
        ? (gradeValues.reduce((sum, g) => sum + g, 0) / gradeValues.length).toFixed(2)
        : 0;

      analytics = {
        totalCourses: courses.length,
        totalStudents,
        averageGrade
      };
    } else if (req.user.role === 'admin') {
      // Get system analytics
      const totalStudents = await User.countDocuments({ role: 'student' });
      const totalProfessors = await User.countDocuments({ role: 'professor' });
      const totalCourses = await Course.countDocuments();

      analytics = {
        totalStudents,
        totalProfessors,
        totalCourses
      };
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

// @route   GET /api/analytics/comparison/students
// @desc    Compare multiple students
// @access  Private (Professor/Admin)
router.get('/comparison/students', protect, authorize('professor', 'admin'), async (req, res) => {
  try {
    const { studentIds } = req.query;

    if (!studentIds) {
      return res.status(400).json({ error: 'Student IDs are required' });
    }

    const ids = studentIds.split(',');
    
    const comparisons = await Promise.all(
      ids.map(async id => {
        const student = await User.findById(id).select('firstName lastName studentId');
        const analytics = await calculateStudentAnalytics(id);
        
        return {
          student,
          analytics
        };
      })
    );

    res.json({
      success: true,
      count: comparisons.length,
      comparisons
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// @route   GET /api/analytics/department/:department
// @desc    Get analytics for a department
// @access  Private (Admin)
router.get('/department/:department', protect, authorize('admin'), async (req, res) => {
  try {
    const students = await User.countDocuments({
      role: 'student',
      department: req.params.department
    });

    const professors = await User.countDocuments({
      role: 'professor',
      department: req.params.department
    });

    const courses = await Course.countDocuments({
      department: req.params.department
    });

    res.json({
      success: true,
      department: req.params.department,
      analytics: {
        totalStudents: students,
        totalProfessors: professors,
        totalCourses: courses
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;