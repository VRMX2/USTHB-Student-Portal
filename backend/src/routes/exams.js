import express from 'express';
import Exam from '../models/Exam.js';
import Course from '../models/Course.js';
import User from '../models/User.js';
import { protect, authorize } from '../middleware/auth.js';
import { 
  createExamValidation, 
  validateMongoId, 
  validate 
} from '../middleware/validation.js';
import { uploadToCloudinary, upload } from '../config/cloudinary.js';
import { notificationHelpers } from '../utils/notificationService.js';
import { sendExamReminder } from '../utils/emailService.js';

const router = express.Router();

// @route   GET /api/exams
// @desc    Get all exams
// @access  Private
router.get('/', protect, async (req, res) => {
  try {
    const { course, type, semester, academicYear, startDate, endDate } = req.query;
    
    let query = {};

    // Role-based filtering
    if (req.user.role === 'student') {
      // Get student's enrolled courses
      const user = await User.findById(req.user._id).populate('enrolledCourses');
      const courseIds = user.enrolledCourses.map(c => c._id);
      query.course = { $in: courseIds };
      query.isPublished = true;
    } else if (req.user.role === 'professor') {
      const courses = await Course.find({ professor: req.user._id });
      const courseIds = courses.map(c => c._id);
      query.course = { $in: courseIds };
    }

    // Additional filters
    if (course) query.course = course;
    if (type) query.type = type;
    if (semester) query.semester = semester;
    if (academicYear) query.academicYear = academicYear;
    
    if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = new Date(startDate);
      if (endDate) query.date.$lte = new Date(endDate);
    }

    const exams = await Exam.find(query)
      .populate('course', 'code name professor')
      .populate({
        path: 'course',
        populate: {
          path: 'professor',
          select: 'firstName lastName'
        }
      })
      .sort({ date: 1 });

    res.json({
      success: true,
      count: exams.length,
      exams
    });
  } catch (error) {
    console.error('Get exams error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// @route   GET /api/exams/upcoming
// @desc    Get upcoming exams
// @access  Private
router.get('/upcoming', protect, async (req, res) => {
  try {
    let query = {
      date: { $gte: new Date() }
    };

    if (req.user.role === 'student') {
      const user = await User.findById(req.user._id).populate('enrolledCourses');
      const courseIds = user.enrolledCourses.map(c => c._id);
      query.course = { $in: courseIds };
      query.isPublished = true;
    } else if (req.user.role === 'professor') {
      const courses = await Course.find({ professor: req.user._id });
      const courseIds = courses.map(c => c._id);
      query.course = { $in: courseIds };
    }

    const exams = await Exam.find(query)
      .populate('course', 'code name professor')
      .populate({
        path: 'course',
        populate: {
          path: 'professor',
          select: 'firstName lastName email'
        }
      })
      .sort({ date: 1 })
      .limit(10);

    res.json({
      success: true,
      count: exams.length,
      exams
    });
  } catch (error) {
    console.error('Get upcoming exams error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// @route   GET /api/exams/:id
// @desc    Get single exam
// @access  Private
router.get('/:id', protect, validateMongoId, validate, async (req, res) => {
  try {
    const exam = await Exam.findById(req.params.id)
      .populate('course', 'code name professor enrolledStudents')
      .populate({
        path: 'course',
        populate: {
          path: 'professor',
          select: 'firstName lastName email'
        }
      });

    if (!exam) {
      return res.status(404).json({ error: 'Exam not found' });
    }

    // Check authorization
    if (req.user.role === 'student') {
      if (!exam.isPublished) {
        return res.status(403).json({ error: 'Exam not published yet' });
      }
      
      const isEnrolled = exam.course.enrolledStudents.some(
        studentId => studentId.toString() === req.user._id.toString()
      );

      if (!isEnrolled) {
        return res.status(403).json({ error: 'Not enrolled in this course' });
      }
    }

    if (req.user.role === 'professor') {
      const course = await Course.findById(exam.course._id);
      if (course.professor.toString() !== req.user._id.toString()) {
        return res.status(403).json({ error: 'Not authorized' });
      }
    }

    res.json({
      success: true,
      exam
    });
  } catch (error) {
    console.error('Get exam error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// @route   POST /api/exams
// @desc    Create new exam
// @access  Private (Professor, Admin)
router.post(
  '/',
  protect,
  authorize('professor', 'admin'),
  createExamValidation,
  validate,
  async (req, res) => {
    try {
      const {
        course,
        title,
        type,
        date,
        startTime,
        duration,
        room,
        instructions,
        totalMarks,
        semester,
        academicYear,
        isPublished
      } = req.body;

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

      const exam = await Exam.create({
        course,
        title,
        type,
        date: new Date(date),
        startTime,
        duration,
        room,
        instructions,
        totalMarks,
        semester,
        academicYear,
        isPublished: isPublished || false
      });

      const populatedExam = await Exam.findById(exam._id)
        .populate('course', 'code name professor');

      // If published, send notifications to enrolled students
      if (isPublished) {
        const students = await User.find({ 
          _id: { $in: courseData.enrolledStudents } 
        });

        const examDateStr = new Date(date).toLocaleDateString();
        
        students.forEach(async (student) => {
          await notificationHelpers.examReminder(
            student._id,
            courseData.name,
            examDateStr,
            room
          );

          await sendExamReminder(
            student.email,
            `${student.firstName} ${student.lastName}`,
            courseData.name,
            examDateStr,
            startTime,
            room
          );
        });
      }

      res.status(201).json({
        success: true,
        exam: populatedExam
      });
    } catch (error) {
      console.error('Create exam error:', error);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// @route   PUT /api/exams/:id
// @desc    Update exam
// @access  Private (Professor, Admin)
router.put(
  '/:id',
  protect,
  authorize('professor', 'admin'),
  validateMongoId,
  validate,
  async (req, res) => {
    try {
      let exam = await Exam.findById(req.params.id).populate('course');

      if (!exam) {
        return res.status(404).json({ error: 'Exam not found' });
      }

      // Check authorization
      if (req.user.role === 'professor') {
        const course = await Course.findById(exam.course._id);
        if (course.professor.toString() !== req.user._id.toString()) {
          return res.status(403).json({ error: 'Not authorized' });
        }
      }

      const allowedUpdates = [
        'title',
        'type',
        'date',
        'startTime',
        'duration',
        'room',
        'instructions',
        'totalMarks',
        'isPublished'
      ];

      const updates = {};
      Object.keys(req.body).forEach(key => {
        if (allowedUpdates.includes(key)) {
          updates[key] = req.body[key];
        }
      });

      const wasPublished = exam.isPublished;

      exam = await Exam.findByIdAndUpdate(
        req.params.id,
        updates,
        { new: true, runValidators: true }
      ).populate('course', 'code name professor enrolledStudents');

      // If newly published, send notifications
      if (!wasPublished && exam.isPublished) {
        const students = await User.find({ 
          _id: { $in: exam.course.enrolledStudents } 
        });

        const examDateStr = exam.date.toLocaleDateString();
        
        students.forEach(async (student) => {
          await notificationHelpers.examReminder(
            student._id,
            exam.course.name,
            examDateStr,
            exam.room
          );
        });
      }

      res.json({
        success: true,
        exam
      });
    } catch (error) {
      console.error('Update exam error:', error);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// @route   DELETE /api/exams/:id
// @desc    Delete exam
// @access  Private (Admin)
router.delete(
  '/:id',
  protect,
  authorize('admin'),
  validateMongoId,
  validate,
  async (req, res) => {
    try {
      const exam = await Exam.findById(req.params.id);

      if (!exam) {
        return res.status(404).json({ error: 'Exam not found' });
      }

      await exam.deleteOne();

      res.json({
        success: true,
        message: 'Exam deleted successfully'
      });
    } catch (error) {
      console.error('Delete exam error:', error);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// @route   POST /api/exams/:id/materials
// @desc    Upload exam material
// @access  Private (Professor of the course)
router.post(
  '/:id/materials',
  protect,
  authorize('professor', 'admin'),
  upload.single('file'),
  async (req, res) => {
    try {
      const exam = await Exam.findById(req.params.id).populate('course');

      if (!exam) {
        return res.status(404).json({ error: 'Exam not found' });
      }

      // Check authorization
      if (req.user.role === 'professor') {
        const course = await Course.findById(exam.course._id);
        if (course.professor.toString() !== req.user._id.toString()) {
          return res.status(403).json({ error: 'Not authorized' });
        }
      }

      if (!req.file) {
        return res.status(400).json({ error: 'Please upload a file' });
      }

      const result = await uploadToCloudinary(req.file.buffer, 'exam-materials');

      const material = {
        title: req.body.title || req.file.originalname,
        url: result.secure_url
      };

      exam.materials.push(material);
      await exam.save();

      res.json({
        success: true,
        message: 'Material uploaded successfully',
        material
      });
    } catch (error) {
      console.error('Upload exam material error:', error);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// @route   GET /api/exams/course/:courseId
// @desc    Get all exams for a course
// @access  Private
router.get(
  '/course/:courseId',
  protect,
  validateMongoId,
  validate,
  async (req, res) => {
    try {
      const course = await Course.findById(req.params.courseId);

      if (!course) {
        return res.status(404).json({ error: 'Course not found' });
      }

      let query = { course: req.params.courseId };

      if (req.user.role === 'student') {
        query.isPublished = true;
        
        const isEnrolled = course.enrolledStudents.some(
          studentId => studentId.toString() === req.user._id.toString()
        );

        if (!isEnrolled) {
          return res.status(403).json({ error: 'Not enrolled in this course' });
        }
      }

      const exams = await Exam.find(query)
        .populate('course', 'code name')
        .sort({ date: 1 });

      res.json({
        success: true,
        count: exams.length,
        exams
      });
    } catch (error) {
      console.error('Get course exams error:', error);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

export default router;