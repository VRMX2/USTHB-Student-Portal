// routes/exams.js - Exam Management Routes
import express from 'express';
const router = express.Router();
import Exam from '../models/Exam';
import Course from '../models/Course';
import { protect, authorize } from '../middleware/auth';

// @route   GET /api/exams
// @desc    Get exams
// @access  Private
router.get('/', protect, async (req, res) => {
  try {
    let query = {};

    // Filter by course if provided
    if (req.query.course) {
      query.course = req.query.course;
    } else if (req.user.role === 'student') {
      // Get exams for enrolled courses
      const courses = await Course.find({ enrolledStudents: req.user.id }).select('_id');
      query.course = { $in: courses.map(c => c._id) };
    } else if (req.user.role === 'professor') {
      // Get exams for teaching courses
      const courses = await Course.find({ professor: req.user.id }).select('_id');
      query.course = { $in: courses.map(c => c._id) };
    }

    if (req.query.type) query.type = req.query.type;
    if (req.query.semester) query.semester = req.query.semester;
    if (req.query.isPublished !== undefined) query.isPublished = req.query.isPublished;

    const exams = await Exam.find(query)
      .populate('course', 'name code professor')
      .sort({ date: 1 });

    res.json({
      success: true,
      count: exams.length,
      exams
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// @route   GET /api/exams/upcoming
// @desc    Get upcoming exams
// @access  Private
router.get('/upcoming', protect, async (req, res) => {
  try {
    let query = { date: { $gte: new Date() }, isPublished: true };

    if (req.user.role === 'student') {
      const courses = await Course.find({ enrolledStudents: req.user.id }).select('_id');
      query.course = { $in: courses.map(c => c._id) };
    } else if (req.user.role === 'professor') {
      const courses = await Course.find({ professor: req.user.id }).select('_id');
      query.course = { $in: courses.map(c => c._id) };
    }

    const exams = await Exam.find(query)
      .populate('course', 'name code')
      .sort({ date: 1 })
      .limit(10);

    res.json({
      success: true,
      count: exams.length,
      exams
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// @route   GET /api/exams/past
// @desc    Get past exams
// @access  Private
router.get('/past', protect, async (req, res) => {
  try {
    let query = { date: { $lt: new Date() } };

    if (req.user.role === 'student') {
      const courses = await Course.find({ enrolledStudents: req.user.id }).select('_id');
      query.course = { $in: courses.map(c => c._id) };
    } else if (req.user.role === 'professor') {
      const courses = await Course.find({ professor: req.user.id }).select('_id');
      query.course = { $in: courses.map(c => c._id) };
    }

    const exams = await Exam.find(query)
      .populate('course', 'name code')
      .sort({ date: -1 })
      .limit(20);

    res.json({
      success: true,
      count: exams.length,
      exams
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// @route   GET /api/exams/:id
// @desc    Get single exam
// @access  Private
router.get('/:id', protect, async (req, res) => {
  try {
    const exam = await Exam.findById(req.params.id)
      .populate('course', 'name code professor enrolledStudents');

    if (!exam) {
      return res.status(404).json({ error: 'Exam not found' });
    }

    res.json({
      success: true,
      exam
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// @route   POST /api/exams
// @desc    Create exam
// @access  Private (Professor/Admin)
router.post('/', protect, authorize('professor', 'admin'), async (req, res) => {
  try {
    const course = await Course.findById(req.body.course);

    if (!course) {
      return res.status(404).json({ error: 'Course not found' });
    }

    if (req.user.role === 'professor' && course.professor.toString() !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const exam = await Exam.create(req.body);

    await exam.populate('course', 'name code');

    // Emit socket event to notify students
    const io = req.app.get('io');
    course.enrolledStudents.forEach(studentId => {
      io.to(`student_${studentId}`).emit('new_exam', exam);
    });

    res.status(201).json({
      success: true,
      exam
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// @route   PUT /api/exams/:id
// @desc    Update exam
// @access  Private (Professor/Admin)
router.put('/:id', protect, authorize('professor', 'admin'), async (req, res) => {
  try {
    let exam = await Exam.findById(req.params.id).populate('course');

    if (!exam) {
      return res.status(404).json({ error: 'Exam not found' });
    }

    if (req.user.role === 'professor' && exam.course.professor.toString() !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    exam = await Exam.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true
    }).populate('course', 'name code');

    res.json({
      success: true,
      exam
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// @route   DELETE /api/exams/:id
// @desc    Delete exam
// @access  Private (Professor/Admin)
router.delete('/:id', protect, authorize('professor', 'admin'), async (req, res) => {
  try {
    const exam = await Exam.findById(req.params.id).populate('course');

    if (!exam) {
      return res.status(404).json({ error: 'Exam not found' });
    }

    if (req.user.role === 'professor' && exam.course.professor.toString() !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    await exam.deleteOne();

    res.json({
      success: true,
      message: 'Exam deleted successfully'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// @route   PUT /api/exams/:id/publish
// @desc    Publish/unpublish exam
// @access  Private (Professor/Admin)
router.put('/:id/publish', protect, authorize('professor', 'admin'), async (req, res) => {
  try {
    const exam = await Exam.findById(req.params.id).populate('course');

    if (!exam) {
      return res.status(404).json({ error: 'Exam not found' });
    }

    if (req.user.role === 'professor' && exam.course.professor.toString() !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    exam.isPublished = !exam.isPublished;
    await exam.save();

    res.json({
      success: true,
      exam
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// @route   GET /api/exams/course/:courseId
// @desc    Get exams for specific course
// @access  Private
router.get('/course/:courseId', protect, async (req, res) => {
  try {
    const course = await Course.findById(req.params.courseId);

    if (!course) {
      return res.status(404).json({ error: 'Course not found' });
    }

    let query = { course: req.params.courseId };

    // Students only see published exams
    if (req.user.role === 'student') {
      query.isPublished = true;
    }

    const exams = await Exam.find(query)
      .populate('course', 'name code')
      .sort({ date: 1 });

    res.json({
      success: true,
      count: exams.length,
      exams
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// @route   GET /api/exams/today/schedule
// @desc    Get today's exams
// @access  Private
router.get('/today/schedule', protect, async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    let query = {
      date: { $gte: today, $lt: tomorrow },
      isPublished: true
    };

    if (req.user.role === 'student') {
      const courses = await Course.find({ enrolledStudents: req.user.id }).select('_id');
      query.course = { $in: courses.map(c => c._id) };
    } else if (req.user.role === 'professor') {
      const courses = await Course.find({ professor: req.user.id }).select('_id');
      query.course = { $in: courses.map(c => c._id) };
    }

    const exams = await Exam.find(query)
      .populate('course', 'name code')
      .sort({ startTime: 1 });

    res.json({
      success: true,
      count: exams.length,
      exams
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// @route   GET /api/exams/week/schedule
// @desc    Get this week's exams
// @access  Private
router.get('/week/schedule', protect, async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const nextWeek = new Date(today);
    nextWeek.setDate(nextWeek.getDate() + 7);

    let query = {
      date: { $gte: today, $lt: nextWeek },
      isPublished: true
    };

    if (req.user.role === 'student') {
      const courses = await Course.find({ enrolledStudents: req.user.id }).select('_id');
      query.course = { $in: courses.map(c => c._id) };
    } else if (req.user.role === 'professor') {
      const courses = await Course.find({ professor: req.user.id }).select('_id');
      query.course = { $in: courses.map(c => c._id) };
    }

    const exams = await Exam.find(query)
      .populate('course', 'name code')
      .sort({ date: 1, startTime: 1 });

    res.json({
      success: true,
      count: exams.length,
      exams
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;