// routes/search.js - Search Functionality Routes
import express from 'express';
const router = express.Router();
import User from '../models/User';
import Course from '../models/Course';
import Club from '../models/Club';
import Announcement from '../models/Announcement';
import { protect } from '../middleware/auth';

// @route   GET /api/search
// @desc    Global search across all entities
// @access  Private
router.get('/', protect, async (req, res) => {
  try {
    const { q, type } = req.query;

    if (!q) {
      return res.status(400).json({ error: 'Search query is required' });
    }

    const searchRegex = new RegExp(q, 'i');
    const results = {
      users: [],
      courses: [],
      clubs: [],
      announcements: []
    };

    // Search users
    if (!type || type === 'users') {
      results.users = await User.find({
        $or: [
          { firstName: searchRegex },
          { lastName: searchRegex },
          { email: searchRegex },
          { studentId: searchRegex }
        ]
      })
        .select('firstName lastName email studentId role profileImage department')
        .limit(10);
    }

    // Search courses
    if (!type || type === 'courses') {
      results.courses = await Course.find({
        $or: [
          { name: searchRegex },
          { code: searchRegex },
          { description: searchRegex }
        ]
      })
        .populate('professor', 'firstName lastName')
        .select('name code description credits level semester')
        .limit(10);
    }

    // Search clubs
    if (!type || type === 'clubs') {
      results.clubs = await Club.find({
        $or: [
          { name: searchRegex },
          { description: searchRegex }
        ],
        isActive: true
      })
        .populate('president', 'firstName lastName')
        .select('name description logo category')
        .limit(10);
    }

    // Search announcements
    if (!type || type === 'announcements') {
      results.announcements = await Announcement.find({
        $or: [
          { title: searchRegex },
          { content: searchRegex }
        ],
        isActive: true
      })
        .populate('author', 'firstName lastName')
        .select('title content priority createdAt')
        .sort({ createdAt: -1 })
        .limit(10);
    }

    const totalResults = 
      results.users.length +
      results.courses.length +
      results.clubs.length +
      results.announcements.length;

    res.json({
      success: true,
      query: q,
      totalResults,
      results
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// @route   GET /api/search/users
// @desc    Search users specifically
// @access  Private
router.get('/users', protect, async (req, res) => {
  try {
    const { q, role } = req.query;

    if (!q) {
      return res.status(400).json({ error: 'Search query is required' });
    }

    const searchRegex = new RegExp(q, 'i');
    let query = {
      $or: [
        { firstName: searchRegex },
        { lastName: searchRegex },
        { email: searchRegex },
        { studentId: searchRegex }
      ]
    };

    if (role) {
      query.role = role;
    }

    const users = await User.find(query)
      .select('firstName lastName email studentId role profileImage department faculty')
      .limit(20);

    res.json({
      success: true,
      count: users.length,
      users
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// @route   GET /api/search/courses
// @desc    Search courses specifically
// @access  Private
router.get('/courses', protect, async (req, res) => {
  try {
    const { q, level, semester, faculty } = req.query;

    if (!q) {
      return res.status(400).json({ error: 'Search query is required' });
    }

    const searchRegex = new RegExp(q, 'i');
    let query = {
      $or: [
        { name: searchRegex },
        { code: searchRegex },
        { description: searchRegex }
      ]
    };

    if (level) query.level = level;
    if (semester) query.semester = semester;
    if (faculty) query.faculty = faculty;

    const courses = await Course.find(query)
      .populate('professor', 'firstName lastName')
      .select('name code description credits level semester faculty')
      .limit(20);

    res.json({
      success: true,
      count: courses.length,
      courses
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// @route   GET /api/search/clubs
// @desc    Search clubs specifically
// @access  Private
router.get('/clubs', protect, async (req, res) => {
  try {
    const { q, category } = req.query;

    if (!q) {
      return res.status(400).json({ error: 'Search query is required' });
    }

    const searchRegex = new RegExp(q, 'i');
    let query = {
      $or: [
        { name: searchRegex },
        { description: searchRegex }
      ],
      isActive: true
    };

    if (category) {
      query.category = category;
    }

    const clubs = await Club.find(query)
      .populate('president', 'firstName lastName')
      .select('name description logo category members')
      .limit(20);

    res.json({
      success: true,
      count: clubs.length,
      clubs
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// @route   GET /api/search/suggestions
// @desc    Get search suggestions/autocomplete
// @access  Private
router.get('/suggestions', protect, async (req, res) => {
  try {
    const { q, type } = req.query;

    if (!q || q.length < 2) {
      return res.json({ success: true, suggestions: [] });
    }

    const searchRegex = new RegExp(`^${q}`, 'i');
    const suggestions = [];

    if (!type || type === 'courses') {
      const courses = await Course.find({
        $or: [
          { name: searchRegex },
          { code: searchRegex }
        ]
      })
        .select('name code')
        .limit(5);

      suggestions.push(...courses.map(c => ({
        type: 'course',
        text: `${c.code} - ${c.name}`,
        id: c._id
      })));
    }

    if (!type || type === 'users') {
      const users = await User.find({
        $or: [
			{ firstName: searchRegex },
          { lastName: searchRegex },
          { studentId: searchRegex }
        ]
      })
        .select('firstName lastName studentId')
        .limit(5);

      suggestions.push(...users.map(u => ({
        type: 'user',
        text: `${u.firstName} ${u.lastName} (${u.studentId})`,
        id: u._id
      })));
    }

    if (!type || type === 'clubs') {
      const clubs = await Club.find({
        name: searchRegex,
        isActive: true
      })
        .select('name')
        .limit(5);

      suggestions.push(...clubs.map(c => ({
        type: 'club',
        text: c.name,
        id: c._id
      })));
    }

    res.json({
      success: true,
      suggestions: suggestions.slice(0, 10)
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// @route   GET /api/search/advanced
// @desc    Advanced search with multiple filters
// @access  Private
router.get('/advanced', protect, async (req, res) => {
  try {
    const { q, entity, faculty, department, level, category, role } = req.query;

    if (!q) {
      return res.status(400).json({ error: 'Search query is required' });
    }

    const searchRegex = new RegExp(q, 'i');
    let results = [];

    switch (entity) {
      case 'users':
        let userQuery = {
          $or: [
            { firstName: searchRegex },
            { lastName: searchRegex },
            { email: searchRegex },
            { studentId: searchRegex }
          ]
        };
        if (role) userQuery.role = role;
        if (faculty) userQuery.faculty = faculty;
        if (department) userQuery.department = department;
        if (level) userQuery.level = level;

        results = await User.find(userQuery)
          .select('firstName lastName email studentId role profileImage department faculty level')
          .limit(50);
        break;

      case 'courses':
        let courseQuery = {
          $or: [
            { name: searchRegex },
            { code: searchRegex },
            { description: searchRegex }
          ]
        };
        if (faculty) courseQuery.faculty = faculty;
        if (department) courseQuery.department = department;
        if (level) courseQuery.level = level;

        results = await Course.find(courseQuery)
          .populate('professor', 'firstName lastName')
          .limit(50);
        break;

      case 'clubs':
        let clubQuery = {
          $or: [
            { name: searchRegex },
            { description: searchRegex }
          ],
          isActive: true
        };
        if (category) clubQuery.category = category;

        results = await Club.find(clubQuery)
          .populate('president', 'firstName lastName')
          .limit(50);
        break;

      default:
        return res.status(400).json({ error: 'Invalid entity type' });
    }

    res.json({
      success: true,
      entity,
      count: results.length,
      results
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;