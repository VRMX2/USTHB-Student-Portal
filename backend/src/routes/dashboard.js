// routes/dashboard.js - Dashboard Data Routes
import express from 'express';
const router = express.Router();
import User from '../models/User';
import Course from '../models/Course';
import Grade from '../models/Grade';
import Attendance from '../models/Attendance';
import Exam from '../models/Exam';
import Club from '../models/Club';
import Announcement from '../models/Announcement';
import { protect, authorize } from '../middleware/auth';

// @route   GET /api/dashboard/student
// @desc    Get student dashboard data
// @access  Private (Student)
router.get('/student', protect, authorize('student'), async (req, res) => {
  try {
    const studentId = req.user.id;

    // Get enrolled courses
    const courses = await Course.find({ enrolledStudents: studentId })
      .populate('professor', 'firstName lastName')
      .select('name code credits');

    // Get recent grades
    const recentGrades = await Grade.find({ student: studentId })
      .populate('course', 'name code')
      .sort({ createdAt: -1 })
      .limit(5);

    // Calculate GPA
    const allGrades = await Grade.find({ student: studentId })
      .populate('course', 'credits');
    
    let totalCredits = 0;
    let weightedGrades = 0;
    allGrades.forEach(grade => {
      if (grade.finalGrade && grade.course.credits) {
        totalCredits += grade.course.credits;
        weightedGrades += grade.finalGrade * grade.course.credits;
      }
    });
    const gpa = totalCredits > 0 ? (weightedGrades / totalCredits).toFixed(2) : 0;

    // Get attendance statistics
    const attendanceRecords = await Attendance.find({ student: studentId });
    const attendanceStats = {
      total: attendanceRecords.length,
      present: attendanceRecords.filter(a => a.status === 'Present').length,
      absent: attendanceRecords.filter(a => a.status === 'Absent').length,
      late: attendanceRecords.filter(a => a.status === 'Late').length,
      rate: 0
    };
    attendanceStats.rate = attendanceStats.total > 0 
      ? ((attendanceStats.present + attendanceStats.late) / attendanceStats.total * 100).toFixed(2)
      : 0;

    // Get upcoming exams
    const upcomingExams = await Exam.find({
      course: { $in: courses.map(c => c._id) },
      date: { $gte: new Date() },
      isPublished: true
    })
      .populate('course', 'name code')
      .sort({ date: 1 })
      .limit(5);

    // Get today's schedule
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const today = days[new Date().getDay()];
    
    const todaySchedule = [];
    courses.forEach(course => {
      const todaySessions = course.schedule?.filter(s => s.day === today) || [];
      todaySessions.forEach(session => {
        todaySchedule.push({
          courseId: course._id,
          courseName: course.name,
          courseCode: course.code,
          startTime: session.startTime,
          endTime: session.endTime,
          room: session.room,
          type: session.type
        });
      });
    });
    todaySchedule.sort((a, b) => a.startTime.localeCompare(b.startTime));

    // Get recent announcements
    const recentAnnouncements = await Announcement.find({
      isActive: true,
      $or: [
        { targetAudience: 'All' },
        { targetAudience: 'Faculty', 'targetDetails.faculty': req.user.faculty },
        { targetAudience: 'Department', 'targetDetails.department': req.user.department },
        { targetAudience: 'Level', 'targetDetails.level': req.user.level },
        { targetAudience: 'Course', course: { $in: courses.map(c => c._id) } }
      ]
    })
      .populate('author', 'firstName lastName')
      .sort({ createdAt: -1 })
      .limit(5);

    // Get clubs
    const clubs = await Club.find({ 'members.user': studentId })
      .select('name logo category');

    res.json({
      success: true,
      dashboard: {
        overview: {
          totalCourses: courses.length,
          gpa,
          attendanceRate: attendanceStats.rate,
          totalClubs: clubs.length
        },
        courses,
        recentGrades,
        attendanceStats,
        upcomingExams,
        todaySchedule,
        recentAnnouncements,
        clubs
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// @route   GET /api/dashboard/professor
// @desc    Get professor dashboard data
// @access  Private (Professor)
router.get('/professor', protect, authorize('professor'), async (req, res) => {
  try {
    const professorId = req.user.id;

    // Get teaching courses
    const courses = await Course.find({ professor: professorId })
      .populate('enrolledStudents', 'firstName lastName studentId');

    // Count total students
    const totalStudents = courses.reduce((sum, course) => sum + course.enrolledStudents.length, 0);

    // Get today's classes
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const today = days[new Date().getDay()];
    
    const todayClasses = [];
    courses.forEach(course => {
      const todaySessions = course.schedule?.filter(s => s.day === today) || [];
      todaySessions.forEach(session => {
        todayClasses.push({
          courseId: course._id,
          courseName: course.name,
          courseCode: course.code,
          startTime: session.startTime,
          endTime: session.endTime,
          room: session.room,
          type: session.type,
          studentCount: course.enrolledStudents.length
        });
      });
    });
    todayClasses.sort((a, b) => a.startTime.localeCompare(b.startTime));

    // Get upcoming exams
    const upcomingExams = await Exam.find({
      course: { $in: courses.map(c => c._id) },
      date: { $gte: new Date() }
    })
      .populate('course', 'name code')
      .sort({ date: 1 })
      .limit(5);

    // Get recent announcements
    const recentAnnouncements = await Announcement.find({
      author: professorId
    })
      .populate('course', 'name code')
      .sort({ createdAt: -1 })
      .limit(5);

    // Pending grading (courses without recent grade updates)
    const pendingGrading = courses.map(course => ({
      courseId: course._id,
      courseName: course.name,
      courseCode: course.code,
      studentCount: course.enrolledStudents.length
    }));

    res.json({
      success: true,
      dashboard: {
        overview: {
          totalCourses: courses.length,
          totalStudents,
          todayClasses: todayClasses.length,
          upcomingExams: upcomingExams.length
        },
        courses: courses.map(c => ({
          _id: c._id,
          name: c.name,
          code: c.code,
          credits: c.credits,
          studentCount: c.enrolledStudents.length
        })),
        todayClasses,
        upcomingExams,
        recentAnnouncements,
        pendingGrading
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// @route   GET /api/dashboard/admin
// @desc    Get admin dashboard data
// @access  Private (Admin)
router.get('/admin', protect, authorize('admin'), async (req, res) => {
  try {
    // Count statistics
    const totalStudents = await User.countDocuments({ role: 'student' });
    const totalProfessors = await User.countDocuments({ role: 'professor' });
    const totalCourses = await Course.countDocuments();
    const totalClubs = await Club.countDocuments();

    // Recent registrations
    const recentUsers = await User.find()
      .select('firstName lastName email role createdAt')
      .sort({ createdAt: -1 })
      .limit(10);

    // Active courses
    const activeCourses = await Course.find({ isActive: true })
      .populate('professor', 'firstName lastName')
      .select('name code enrolledStudents');

    // Recent announcements
    const recentAnnouncements = await Announcement.find()
      .populate('author', 'firstName lastName role')
      .sort({ createdAt: -1 })
      .limit(10);

    // System statistics by faculty
    const facultyStats = await User.aggregate([
      { $match: { role: 'student' } },
      { $group: { _id: '$faculty', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);

    // Level distribution
    const levelStats = await User.aggregate([
      { $match: { role: 'student' } },
      { $group: { _id: '$level', count: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ]);

    res.json({
      success: true,
      dashboard: {
        overview: {
          totalStudents,
          totalProfessors,
          totalCourses,
          totalClubs
        },
        recentUsers,
        activeCourses: activeCourses.map(c => ({
          _id: c._id,
          name: c.name,
          code: c.code,
          professor: c.professor,
          enrolledCount: c.enrolledStudents.length
        })),
        recentAnnouncements,
        facultyStats,
        levelStats
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// @route   GET /api/dashboard/stats
// @desc    Get general statistics
// @access  Private
router.get('/stats', protect, async (req, res) => {
  try {
    const stats = {
      users: {
        total: await User.countDocuments(),
        students: await User.countDocuments({ role: 'student' }),
        professors: await User.countDocuments({ role: 'professor' }),
        admins: await User.countDocuments({ role: 'admin' })
      },
      courses: {
        total: await Course.countDocuments(),
        active: await Course.countDocuments({ isActive: true })
      },
      clubs: {
        total: await Club.countDocuments(),
        active: await Club.countDocuments({ isActive: true })
      },
      exams: {
        upcoming: await Exam.countDocuments({ 
          date: { $gte: new Date() },
          isPublished: true 
        })
      }
    };

    res.json({
      success: true,
      stats
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;