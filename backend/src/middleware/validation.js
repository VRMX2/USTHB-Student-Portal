import { body, param, query, validationResult } from 'express-validator';

exports.validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ 
      error: 'Validation failed',
      details: errors.array() 
    });
  }
  next();
};

exports.registerValidation = [
  body('studentId').trim().notEmpty().isLength({ min: 5, max: 20 }),
  body('email').trim().notEmpty().isEmail().normalizeEmail(),
  body('password').trim().notEmpty().isLength({ min: 6 }),
  body('firstName').trim().notEmpty().isLength({ min: 2, max: 50 }),
  body('lastName').trim().notEmpty().isLength({ min: 2, max: 50 }),
  body('faculty').trim().notEmpty(),
  body('department').trim().notEmpty()
];

exports.loginValidation = [
  body('email').trim().notEmpty().isEmail(),
  body('password').trim().notEmpty()
];

exports.createCourseValidation = [
  body('code').trim().notEmpty().isLength({ min: 2, max: 10 }),
  body('name').trim().notEmpty().isLength({ min: 3, max: 100 }),
  body('credits').notEmpty().isInt({ min: 1, max: 12 }),
  body('level').notEmpty().isIn(['L1', 'L2', 'L3', 'M1', 'M2']),
  body('semester').notEmpty().isIn(['S1', 'S2'])
];

exports.createGradeValidation = [
  body('student').notEmpty().isMongoId(),
  body('course').notEmpty().isMongoId(),
  body('semester').notEmpty().isIn(['S1', 'S2']),
  body('academicYear').notEmpty().matches(/^\d{4}-\d{4}$/),
  body('assessments').isArray({ min: 1 }),
  body('assessments.*.type').isIn(['TD', 'TP', 'Test', 'Exam', 'Project']),
  body('assessments.*.score').isFloat({ min: 0, max: 20 }),
  body('assessments.*.weight').isFloat({ min: 0, max: 1 })
];

exports.createAttendanceValidation = [
  body('student').notEmpty().isMongoId(),
  body('course').notEmpty().isMongoId(),
  body('date').notEmpty().isISO8601(),
  body('status').notEmpty().isIn(['Present', 'Absent', 'Late', 'Excused']),
  body('sessionType').notEmpty().isIn(['Lecture', 'TD', 'TP'])
];

exports.createExamValidation = [
  body('course').notEmpty().isMongoId(),
  body('title').trim().notEmpty().isLength({ min: 3, max: 100 }),
	body('type').notEmpty().isIn(['Midterm', 'Final', 'Makeup', 'Quiz']),
  body('date').notEmpty().isISO8601(),
  body('startTime').notEmpty().matches(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/),
  body('duration').notEmpty().isInt({ min: 30, max: 300 }),
  body('room').trim().notEmpty(),
  body('totalMarks').notEmpty().isInt({ min: 1 })
];

exports.sendMessageValidation = [
  body('receiver').notEmpty().isMongoId(),
  body('content').trim().notEmpty().isLength({ min: 1, max: 5000 })
];

exports.createAnnouncementValidation = [
  body('title').trim().notEmpty().isLength({ min: 3, max: 200 }),
  body('content').trim().notEmpty().isLength({ min: 10 }),
  body('priority').optional().isIn(['Low', 'Normal', 'High', 'Urgent']),
  body('targetAudience').notEmpty().isIn(['All', 'Faculty', 'Department', 'Course', 'Level'])
];

exports.createClubValidation = [
  body('name').trim().notEmpty().isLength({ min: 3, max: 100 }),
  body('description').trim().notEmpty().isLength({ min: 20, max: 1000 }),
  body('category').notEmpty().isIn(['Academic', 'Sports', 'Cultural', 'Technology', 'Social', 'Other'])
];

exports.validateMongoId = [
  param('id').isMongoId()
];