import express from 'express';
import Grade from '../models/Grade.js';
import Course from '../models/Course.js';
import { protect, authorize} from '../middleware/auth.js';

// @route   GET /api/grades
// @desc    Get grades (student gets own, professor gets course grades)
// @access  Private
router.get('/', protect, async (req, res) => {
  try {
    let query = {};

    if (req.user.role === 'student') {
      query.student = req.user.id;
    }

    if (req.query.course) query.course = req.query.course;
    if (req.query.semester) query.semester = req.query.semester;
    if (req.query.academicYear) query.academicYear = req.query.academicYear;

    const grades = await Grade.find(query)
      .populate('student', 'firstName lastName studentId')
      .populate('course', 'name code')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      count: grades.length,
      grades
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// @route   GET /api/grades/:id
// @desc    Get single grade
// @access  Private
router.get('/:id', protect, async (req, res) => {
  try {
    const grade = await Grade.findById(req.params.id)
      .populate('student', 'firstName lastName studentId email')
      .populate('course', 'name code professor');

    if (!grade) {
      return res.status(404).json({ error: 'Grade not found' });
    }

    // Check authorization
    if (req.user.role === 'student' && grade.student._id.toString() !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    res.json({
      success: true,
      grade
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// @route   POST /api/grades
// @desc    Create/Add grade
// @access  Private (Professor/Admin)
router.post('/', protect, authorize('professor', 'admin'), async (req, res) => {
  try {
    const { student, course, semester, academicYear, assessments } = req.body;

    // Verify course belongs to professor
    if (req.user.role === 'professor') {
      const courseDoc = await Course.findById(course);
      if (!courseDoc || courseDoc.professor.toString() !== req.user.id) {
        return res.status(403).json({ error: 'Not authorized to grade this course' });
      }
    }

    // Check if grade already exists
    let grade = await Grade.findOne({ student, course, semester, academicYear });

    if (grade) {
      // Update existing grade
      grade.assessments = assessments;
      await grade.save();
    } else {
      // Create new grade
      grade = await Grade.create({
        student,
        course,
        semester,
        academicYear,
        assessments
      });
    }

    await grade.populate('student', 'firstName lastName studentId');
    await grade.populate('course', 'name code');

    res.status(201).json({
      success: true,
      grade
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// @route   PUT /api/grades/:id
// @desc    Update grade
// @access  Private (Professor/Admin)
router.put('/:id', protect, authorize('professor', 'admin'), async (req, res) => {
  try {
    let grade = await Grade.findById(req.params.id).populate('course');

    if (!grade) {
      return res.status(404).json({ error: 'Grade not found' });
    }

    // Check authorization
    if (req.user.role === 'professor' && grade.course.professor.toString() !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    grade = await Grade.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true
    })
      .populate('student', 'firstName lastName studentId')
      .populate('course', 'name code');

    res.json({
      success: true,
      grade
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// @route   DELETE /api/grades/:id
// @desc    Delete grade
// @access  Private (Professor/Admin)
router.delete('/:id', protect, authorize('professor', 'admin'), async (req, res) => {
  try {
    const grade = await Grade.findById(req.params.id).populate('course');

    if (!grade) {
      return res.status(404).json({ error: 'Grade not found' });
    }

    // Check authorization
    if (req.user.role === 'professor' && grade.course.professor.toString() !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    await grade.deleteOne();

    res.json({
      success: true,
      message: 'Grade deleted successfully'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// @route   GET /api/grades/student/:studentId
// @desc    Get all grades for a student
// @access  Private (Student/Professor/Admin)
router.get('/student/:studentId', protect, async (req, res) => {
  try {
    // Students can only see their own grades
    if (req.user.role === 'student' && req.user.id !== req.params.studentId) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const grades = await Grade.find({ student: req.params.studentId })
      .populate('course', 'name code credits')
      .sort({ academicYear: -1, semester: -1 });

    // Calculate GPA
    let totalCredits = 0;
    let weightedGrades = 0;

    grades.forEach(grade => {
      if (grade.finalGrade && grade.course.credits) {
        totalCredits += grade.course.credits;
        weightedGrades += grade.finalGrade * grade.course.credits;
      }
    });

    const gpa = totalCredits > 0 ? (weightedGrades / totalCredits).toFixed(2) : 0;

    res.json({
      success: true,
      count: grades.length,
      gpa,
      grades
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// @route   GET /api/grades/course/:courseId
// @desc    Get all grades for a course
// @access  Private (Professor/Admin)
router.get('/course/:courseId', protect, authorize('professor', 'admin'), async (req, res) => {
  try {
    const course = await Course.findById(req.params.courseId);

    if (!course) {
      return res.status(404).json({ error: 'Course not found' });
    }

    // Check authorization
    if (req.user.role === 'professor' && course.professor.toString() !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const grades = await Grade.find({ course: req.params.courseId })
      .populate('student', 'firstName lastName studentId email')
      .sort({ 'student.lastName': 1 });

    // Calculate statistics
    const gradeValues = grades.map(g => g.finalGrade).filter(g => g !== undefined);
    const stats = {
      total: grades.length,
      average: gradeValues.length > 0 
        ? (gradeValues.reduce((sum, g) => sum + g, 0) / gradeValues.length).toFixed(2)
        : 0,
      highest: gradeValues.length > 0 ? Math.max(...gradeValues) : 0,
      lowest: gradeValues.length > 0 ? Math.min(...gradeValues) : 0,
      passRate: gradeValues.length > 0
        ? ((gradeValues.filter(g => g >= 10).length / gradeValues.length) * 100).toFixed(2)
        : 0
    };

    res.json({
      success: true,
      count: grades.length,
      stats,
      grades
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// @route   POST /api/grades/:id/assessments
// @desc    Add assessment to grade
// @access  Private (Professor/Admin)
router.post('/:id/assessments', protect, authorize('professor', 'admin'), async (req, res) => {
  try {
    let grade = await Grade.findById(req.params.id).populate('course');

    if (!grade) {
      return res.status(404).json({ error: 'Grade not found' });
    }

    // Check authorization
    if (req.user.role === 'professor' && grade.course.professor.toString() !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    grade.assessments.push(req.body);
    await grade.save();

    await grade.populate('student', 'firstName lastName studentId');

    res.json({
      success: true,
      grade
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// @route   PUT /api/grades/:gradeId/assessments/:assessmentId
// @desc    Update specific assessment
// @access  Private (Professor/Admin)
router.put('/:gradeId/assessments/:assessmentId', protect, authorize('professor', 'admin'), async (req, res) => {
  try {
    let grade = await Grade.findById(req.params.gradeId).populate('course');

    if (!grade) {
      return res.status(404).json({ error: 'Grade not found' });
    }

    // Check authorization
    if (req.user.role === 'professor' && grade.course.professor.toString() !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const assessment = grade.assessments.id(req.params.assessmentId);
    if (!assessment) {
      return res.status(404).json({ error: 'Assessment not found' });
    }

    Object.assign(assessment, req.body);
    await grade.save();

    res.json({
      success: true,
      grade
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// @route   DELETE /api/grades/:gradeId/assessments/:assessmentId
// @desc    Delete specific assessment
// @access  Private (Professor/Admin)
router.delete('/:gradeId/assessments/:assessmentId', protect, authorize('professor', 'admin'), async (req, res) => {
  try {
    let grade = await Grade.findById(req.params.gradeId).populate('course');

    if (!grade) {
      return res.status(404).json({ error: 'Grade not found' });
    }

    // Check authorization
    if (req.user.role === 'professor' && grade.course.professor.toString() !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    grade.assessments = grade.assessments.filter(
      a => a._id.toString() !== req.params.assessmentId
    );
    await grade.save();

    res.json({
      success: true,
      message: 'Assessment deleted successfully',
      grade
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;