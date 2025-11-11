import express from "express";
import Course from '../models/Course.js';
import User from '../models/User.js';
import { protect, authorize } from '../middleware/auth.js';

const router = express.Router();

// @route   GET /api/courses
// @desc    Get all courses or user's enrolled courses
// @access  Private
router.get('/', protect, async (req, res) => {
  try {
    let query = {};

    // If student, get enrolled courses
    if (req.user.role === 'student') {
      query.enrolledStudents = req.user.id;
    }

    // If professor, get courses they teach
    if (req.user.role === 'professor') {
      query.professor = req.user.id;
    }

    // Filter by faculty, department, level
    if (req.query.faculty) query.faculty = req.query.faculty;
    if (req.query.department) query.department = req.query.department;
    if (req.query.level) query.level = req.query.level;
    if (req.query.semester) query.semester = req.query.semester;

    const courses = await Course.find(query)
      .populate('professor', 'firstName lastName email')
      .populate('enrolledStudents', 'firstName lastName studentId')
      .sort({ name: 1 });

    res.json({
      success: true,
      count: courses.length,
      courses
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// @route   GET /api/courses/:id
// @desc    Get single course
// @access  Private
router.get('/:id', protect, async (req, res) => {
  try {
    const course = await Course.findById(req.params.id)
      .populate('professor', 'firstName lastName email phoneNumber')
      .populate('enrolledStudents', 'firstName lastName studentId email');

    if (!course) {
      return res.status(404).json({ error: 'Course not found' });
    }

    res.json({
      success: true,
      course
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// @route   POST /api/courses
// @desc    Create a new course
// @access  Private (Professor/Admin)
router.post('/', protect, authorize('professor', 'admin'), async (req, res) => {
  try {
    const courseData = { ...req.body };
    
    // If professor creates course, set them as professor
    if (req.user.role === 'professor') {
      courseData.professor = req.user.id;
    }

    const course = await Course.create(courseData);

    res.status(201).json({
      success: true,
      course
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// @route   PUT /api/courses/:id
// @desc    Update course
// @access  Private (Professor/Admin)
router.put('/:id', protect, authorize('professor', 'admin'), async (req, res) => {
  try {
    let course = await Course.findById(req.params.id);

    if (!course) {
      return res.status(404).json({ error: 'Course not found' });
    }

    // Check if user is course professor
    if (req.user.role === 'professor' && course.professor.toString() !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized to update this course' });
    }

    course = await Course.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true
    });

    res.json({
      success: true,
      course
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// @route   DELETE /api/courses/:id
// @desc    Delete course
// @access  Private (Professor/Admin)
router.delete('/:id', protect, authorize('professor', 'admin'), async (req, res) => {
  try {
    const course = await Course.findById(req.params.id);

    if (!course) {
      return res.status(404).json({ error: 'Course not found' });
    }

    // Check if user is course professor
    if (req.user.role === 'professor' && course.professor.toString() !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized to delete this course' });
    }

    await course.deleteOne();

    res.json({
      success: true,
      message: 'Course deleted successfully'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// @route   POST /api/courses/:id/enroll
// @desc    Enroll in a course
// @access  Private (Student)
router.post('/:id/enroll', protect, authorize('student'), async (req, res) => {
  try {
    const course = await Course.findById(req.params.id);

    if (!course) {
      return res.status(404).json({ error: 'Course not found' });
    }

    // Check if already enrolled
    if (course.enrolledStudents.includes(req.user.id)) {
      return res.status(400).json({ error: 'Already enrolled in this course' });
    }

    // Check if course is full
    if (course.enrolledStudents.length >= course.maxStudents) {
      return res.status(400).json({ error: 'Course is full' });
    }

    course.enrolledStudents.push(req.user.id);
    await course.save();

    // Add course to user's enrolled courses
    await User.findByIdAndUpdate(req.user.id, {
      $push: { enrolledCourses: course._id }
    });

    res.json({
      success: true,
      message: 'Successfully enrolled in course',
      course
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// @route   DELETE /api/courses/:id/enroll
// @desc    Unenroll from a course
// @access  Private (Student)
router.delete('/:id/enroll', protect, authorize('student'), async (req, res) => {
  try {
    const course = await Course.findById(req.params.id);

    if (!course) {
      return res.status(404).json({ error: 'Course not found' });
    }

    course.enrolledStudents = course.enrolledStudents.filter(
      student => student.toString() !== req.user.id
    );
    await course.save();

    await User.findByIdAndUpdate(req.user.id, {
      $pull: { enrolledCourses: course._id }
    });

    res.json({
      success: true,
      message: 'Successfully unenrolled from course'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// @route   POST /api/courses/:id/materials
// @desc    Add course material
// @access  Private (Professor/Admin)
router.post('/:id/materials', protect, authorize('professor', 'admin'), async (req, res) => {
  try {
    const course = await Course.findById(req.params.id);

    if (!course) {
      return res.status(404).json({ error: 'Course not found' });
    }

    if (req.user.role === 'professor' && course.professor.toString() !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    course.materials.push(req.body);
    await course.save();

    res.json({
      success: true,
      course
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// @route   DELETE /api/courses/:courseId/materials/:materialId
// @desc    Delete course material
// @access  Private (Professor/Admin)
router.delete('/:courseId/materials/:materialId', protect, authorize('professor', 'admin'), async (req, res) => {
  try {
    const course = await Course.findById(req.params.courseId);

    if (!course) {
      return res.status(404).json({ error: 'Course not found' });
    }

    if (req.user.role === 'professor' && course.professor.toString() !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    course.materials = course.materials.filter(
      material => material._id.toString() !== req.params.materialId
    );
    await course.save();

    res.json({
      success: true,
      message: 'Material deleted successfully',
      course
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// @route   GET /api/courses/available/all
// @desc    Get all available courses for enrollment
// @access  Private (Student)
router.get('/available/all', protect, authorize('student'), async (req, res) => {
  try {
    const courses = await Course.find({
      enrolledStudents: { $ne: req.user.id },
      level: req.user.level,
      isActive: true
    })
      .populate('professor', 'firstName lastName')
      .sort({ name: 1 });

    res.json({
      success: true,
      count: courses.length,
      courses
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;