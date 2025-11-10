import express from 'express';
import Club from '../models/Club.js';
import User from '../models/User.js';
import { protect, authorize } from '../middleware/auth.js';
import { 
  createClubValidation, 
  validateMongoId, 
  validate 
} from '../middleware/validation.js';
import { uploadToCloudinary, upload } from '../config/cloudinary.js';

const router = express.Router();

// @route   GET /api/clubs
// @desc    Get all clubs
// @access  Private
router.get('/', protect, async (req, res) => {
  try {
    const { category, isActive, search } = req.query;
    
    let query = {};

    if (category) query.category = category;
    if (isActive !== undefined) query.isActive = isActive === 'true';
    
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }

    const clubs = await Club.find(query)
      .populate('president', 'firstName lastName profileImage studentId')
      .populate('vicePresident', 'firstName lastName profileImage studentId')
      .populate('members.user', 'firstName lastName profileImage studentId')
      .sort({ name: 1 });

    res.json({
      success: true,
      count: clubs.length,
      clubs
    });
  } catch (error) {
    console.error('Get clubs error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// @route   GET /api/clubs/my-clubs
// @desc    Get clubs where user is member
// @access  Private
router.get('/my-clubs', protect, async (req, res) => {
  try {
    const clubs = await Club.find({
      'members.user': req.user._id,
      isActive: true
    })
      .populate('president', 'firstName lastName profileImage')
      .populate('vicePresident', 'firstName lastName profileImage')
      .sort({ name: 1 });

    res.json({
      success: true,
      count: clubs.length,
      clubs
    });
  } catch (error) {
    console.error('Get my clubs error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// @route   GET /api/clubs/:id
// @desc    Get single club
// @access  Private
router.get('/:id', protect, validateMongoId, validate, async (req, res) => {
  try {
    const club = await Club.findById(req.params.id)
      .populate('president', 'firstName lastName profileImage studentId email')
      .populate('vicePresident', 'firstName lastName profileImage studentId email')
      .populate('members.user', 'firstName lastName profileImage studentId level department');

    if (!club) {
      return res.status(404).json({ error: 'Club not found' });
    }

    // Check if user is member
    const isMember = club.members.some(
      member => member.user._id.toString() === req.user._id.toString()
    );

    res.json({
      success: true,
      club,
      isMember
    });
  } catch (error) {
    console.error('Get club error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// @route   POST /api/clubs
// @desc    Create new club
// @access  Private (Student, Admin)
router.post(
  '/',
  protect,
  authorize('student', 'admin'),
  createClubValidation,
  validate,
  async (req, res) => {
    try {
      const {
        name,
        description,
        category,
        email,
        socialMedia,
        foundedDate
      } = req.body;

      // Check if club name already exists
      const existingClub = await Club.findOne({ name });
      if (existingClub) {
        return res.status(400).json({ error: 'Club name already exists' });
      }

      const club = await Club.create({
        name,
        description,
        category,
        president: req.user._id,
        email,
        socialMedia,
        foundedDate: foundedDate ? new Date(foundedDate) : undefined,
        members: [{
          user: req.user._id,
          role: 'President',
          joinedAt: new Date()
        }]
      });

      // Update user's clubs
      await User.findByIdAndUpdate(req.user._id, {
        $addToSet: { clubs: club._id }
      });

      const populatedClub = await Club.findById(club._id)
        .populate('president', 'firstName lastName profileImage')
        .populate('members.user', 'firstName lastName profileImage');

      res.status(201).json({
        success: true,
        club: populatedClub
      });
    } catch (error) {
      console.error('Create club error:', error);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// @route   PUT /api/clubs/:id
// @desc    Update club
// @access  Private (Club President, Admin)
router.put('/:id', protect, validateMongoId, validate, async (req, res) => {
  try {
    let club = await Club.findById(req.params.id);

    if (!club) {
      return res.status(404).json({ error: 'Club not found' });
    }

    // Check authorization
    if (
      req.user.role !== 'admin' &&
      club.president.toString() !== req.user._id.toString()
    ) {
      return res.status(403).json({ error: 'Not authorized to update this club' });
    }

    const allowedUpdates = [
      'description',
      'email',
      'socialMedia',
      'isActive'
    ];

    const updates = {};
    Object.keys(req.body).forEach(key => {
      if (allowedUpdates.includes(key)) {
        updates[key] = req.body[key];
      }
    });

    club = await Club.findByIdAndUpdate(
      req.params.id,
      updates,
      { new: true, runValidators: true }
    )
      .populate('president', 'firstName lastName profileImage')
      .populate('vicePresident', 'firstName lastName profileImage');

    res.json({
      success: true,
      club
    });
  } catch (error) {
    console.error('Update club error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// @route   POST /api/clubs/:id/logo
// @desc    Upload club logo
// @access  Private (Club President, Admin)
router.post(
  '/:id/logo',
  protect,
  upload.single('logo'),
  async (req, res) => {
    try {
      const club = await Club.findById(req.params.id);

      if (!club) {
        return res.status(404).json({ error: 'Club not found' });
      }

      // Check authorization
      if (
        req.user.role !== 'admin' &&
        club.president.toString() !== req.user._id.toString()
      ) {
        return res.status(403).json({ error: 'Not authorized' });
      }

      if (!req.file) {
        return res.status(400).json({ error: 'Please upload a logo' });
      }

      const result = await uploadToCloudinary(req.file.buffer, 'club-logos');

      club.logo = result.secure_url;
      await club.save();

      res.json({
        success: true,
        logo: club.logo
      });
    } catch (error) {
      console.error('Upload club logo error:', error);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// @route   POST /api/clubs/:id/join
// @desc    Join a club
// @access  Private (Student)
router.post(
  '/:id/join',
  protect,
  authorize('student'),
  validateMongoId,
  validate,
  async (req, res) => {
    try {
      const club = await Club.findById(req.params.id);

      if (!club) {
        return res.status(404).json({ error: 'Club not found' });
      }

      if (!club.isActive) {
        return res.status(400).json({ error: 'Club is not active' });
      }

      // Check if already a member
      const isMember = club.members.some(
        member => member.user.toString() === req.user._id.toString()
      );

      if (isMember) {
        return res.status(400).json({ error: 'Already a member of this club' });
      }

      club.members.push({
        user: req.user._id,
        role: 'Member',
        joinedAt: new Date()
      });

      await club.save();

      // Update user's clubs
      await User.findByIdAndUpdate(req.user._id, {
        $addToSet: { clubs: club._id }
      });

      res.json({
        success: true,
        message: 'Successfully joined the club'
      });
    } catch (error) {
      console.error('Join club error:', error);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// @route   POST /api/clubs/:id/leave
// @desc    Leave a club
// @access  Private (Student)
router.post(
  '/:id/leave',
  protect,
  authorize('student'),
  validateMongoId,
  validate,
  async (req, res) => {
    try {
      const club = await Club.findById(req.params.id);

      if (!club) {
        return res.status(404).json({ error: 'Club not found' });
      }

      // Can't leave if you're the president
      if (club.president.toString() === req.user._id.toString()) {
        return res.status(400).json({ 
          error: 'President cannot leave the club. Transfer presidency first.' 
        });
      }

      club.members = club.members.filter(
        member => member.user.toString() !== req.user._id.toString()
      );

      await club.save();

      // Update user's clubs
      await User.findByIdAndUpdate(req.user._id, {
        $pull: { clubs: club._id }
      });

      res.json({
        success: true,
        message: 'Successfully left the club'
      });
    } catch (error) {
      console.error('Leave club error:', error);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// @route   PUT /api/clubs/:id/members/:memberId
// @desc    Update member role
// @access  Private (Club President, Admin)
router.put(
  '/:id/members/:memberId',
  protect,
  validateMongoId,
  validate,
  async (req, res) => {
    try {
      const club = await Club.findById(req.params.id);

      if (!club) {
        return res.status(404).json({ error: 'Club not found' });
      }

      // Check authorization
      if (
        req.user.role !== 'admin' &&
        club.president.toString() !== req.user._id.toString()
      ) {
        return res.status(403).json({ error: 'Not authorized' });
      }

      const { role } = req.body;

      if (!['Member', 'Officer', 'VicePresident'].includes(role)) {
        return res.status(400).json({ error: 'Invalid role' });
      }

      const member = club.members.find(
        m => m.user.toString() === req.params.memberId
      );

      if (!member) {
        return res.status(404).json({ error: 'Member not found' });
      }

      member.role = role;

      // Update vice president if role is VicePresident
      if (role === 'VicePresident') {
        club.vicePresident = req.params.memberId;
      }

      await club.save();

      res.json({
        success: true,
        message: 'Member role updated successfully'
      });
    } catch (error) {
      console.error('Update member role error:', error);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// @route   POST /api/clubs/:id/events
// @desc    Add event to club
// @access  Private (Club Officers, Admin)
router.post('/:id/events', protect, async (req, res) => {
  try {
    const club = await Club.findById(req.params.id);

    if (!club) {
      return res.status(404).json({ error: 'Club not found' });
    }

    // Check authorization
    const member = club.members.find(
      m => m.user.toString() === req.user._id.toString()
    );

    if (
      req.user.role !== 'admin' &&
      (!member || !['President', 'VicePresident', 'Officer'].includes(member.role))
    ) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const { title, description, date, location } = req.body;

    if (!title || !date) {
      return res.status(400).json({ error: 'Title and date are required' });
    }

    club.events.push({
      title,
      description,
      date: new Date(date),
      location
    });

    await club.save();

    res.json({
      success: true,
      message: 'Event added successfully',
      events: club.events
    });
  } catch (error) {
    console.error('Add club event error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// @route   DELETE /api/clubs/:id
// @desc    Delete club (soft delete)
// @access  Private (Admin)
router.delete(
  '/:id',
  protect,
  authorize('admin'),
  validateMongoId,
  validate,
  async (req, res) => {
    try {
      const club = await Club.findById(req.params.id);

      if (!club) {
        return res.status(404).json({ error: 'Club not found' });
      }

      club.isActive = false;
      await club.save();

      res.json({
        success: true,
        message: 'Club deactivated successfully'
      });
    } catch (error) {
      console.error('Delete club error:', error);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

export default router;