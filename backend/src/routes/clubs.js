// routes/clubs.js - Club Management Routes
import express from 'express';
const router = express.Router();
import Club from '../models/Club';
import User from '../models/User';
import { protect } from '../middleware/auth';

// @route   GET /api/clubs
// @desc    Get all clubs
// @access  Private
router.get('/', protect, async (req, res) => {
  try {
    let query = { isActive: true };

    if (req.query.category) query.category = req.query.category;
    if (req.query.search) {
      query.name = { $regex: req.query.search, $options: 'i' };
    }

    const clubs = await Club.find(query)
      .populate('president', 'firstName lastName email profileImage')
      .populate('vicePresident', 'firstName lastName email')
      .sort({ name: 1 });

    res.json({
      success: true,
      count: clubs.length,
      clubs
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// @route   GET /api/clubs/my-clubs
// @desc    Get user's clubs
// @access  Private
router.get('/my-clubs', protect, async (req, res) => {
  try {
    const clubs = await Club.find({
      'members.user': req.user.id,
      isActive: true
    })
      .populate('president', 'firstName lastName profileImage')
      .populate('vicePresident', 'firstName lastName');

    res.json({
      success: true,
      count: clubs.length,
      clubs
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// @route   GET /api/clubs/:id
// @desc    Get single club
// @access  Private
router.get('/:id', protect, async (req, res) => {
  try {
    const club = await Club.findById(req.params.id)
      .populate('president', 'firstName lastName email profileImage')
      .populate('vicePresident', 'firstName lastName email')
      .populate('members.user', 'firstName lastName studentId profileImage');

    if (!club) {
      return res.status(404).json({ error: 'Club not found' });
    }

    // Check if current user is a member
    const isMember = club.members.some(
      member => member.user._id.toString() === req.user.id
    );

    res.json({
      success: true,
      club,
      isMember
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// @route   POST /api/clubs
// @desc    Create a new club
// @access  Private (Student/Admin)
router.post('/', protect, async (req, res) => {
  try {
    const clubData = {
      ...req.body,
      president: req.user.id,
      members: [{
        user: req.user.id,
        role: 'President'
      }]
    };

    const club = await Club.create(clubData);

    // Add club to user's clubs
    await User.findByIdAndUpdate(req.user.id, {
      $push: { clubs: club._id }
    });

    await club.populate('president', 'firstName lastName email profileImage');

    res.status(201).json({
      success: true,
      club
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// @route   PUT /api/clubs/:id
// @desc    Update club
// @access  Private (President/Admin)
router.put('/:id', protect, async (req, res) => {
  try {
    let club = await Club.findById(req.params.id);

    if (!club) {
      return res.status(404).json({ error: 'Club not found' });
    }

    // Check if user is president or admin
    if (club.president.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Not authorized' });
    }

    club = await Club.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true
    })
      .populate('president', 'firstName lastName email profileImage')
      .populate('vicePresident', 'firstName lastName email');

    res.json({
      success: true,
      club
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// @route   DELETE /api/clubs/:id
// @desc    Delete club
// @access  Private (President/Admin)
router.delete('/:id', protect, async (req, res) => {
  try {
    const club = await Club.findById(req.params.id);

    if (!club) {
      return res.status(404).json({ error: 'Club not found' });
    }

    // Check if user is president or admin
    if (club.president.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Not authorized' });
    }

    await club.deleteOne();

    res.json({
      success: true,
      message: 'Club deleted successfully'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// @route   POST /api/clubs/:id/join
// @desc    Join a club
// @access  Private
router.post('/:id/join', protect, async (req, res) => {
  try {
    const club = await Club.findById(req.params.id);

    if (!club) {
      return res.status(404).json({ error: 'Club not found' });
    }

    // Check if already a member
    const isMember = club.members.some(
      member => member.user.toString() === req.user.id
    );

    if (isMember) {
      return res.status(400).json({ error: 'Already a member of this club' });
    }

    club.members.push({
      user: req.user.id,
      role: 'Member'
    });
    await club.save();

    // Add club to user's clubs
    await User.findByIdAndUpdate(req.user.id, {
      $push: { clubs: club._id }
    });

    await club.populate('members.user', 'firstName lastName studentId profileImage');

    res.json({
      success: true,
      message: 'Successfully joined the club',
      club
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// @route   POST /api/clubs/:id/leave
// @desc    Leave a club
// @access  Private
router.post('/:id/leave', protect, async (req, res) => {
  try {
    const club = await Club.findById(req.params.id);

    if (!club) {
      return res.status(404).json({ error: 'Club not found' });
    }

    // Cannot leave if president
    if (club.president.toString() === req.user.id) {
      return res.status(400).json({ 
        error: 'President cannot leave the club. Please transfer presidency first.' 
      });
    }

    club.members = club.members.filter(
      member => member.user.toString() !== req.user.id
    );
    await club.save();

    await User.findByIdAndUpdate(req.user.id, {
      $pull: { clubs: club._id }
    });

    res.json({
      success: true,
      message: 'Successfully left the club'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// @route   POST /api/clubs/:id/events
// @desc    Add club event
// @access  Private (President/Officers/Admin)
router.post('/:id/events', protect, async (req, res) => {
  try {
    const club = await Club.findById(req.params.id);

    if (!club) {
      return res.status(404).json({ error: 'Club not found' });
    }

    // Check if user has permission
    const member = club.members.find(m => m.user.toString() === req.user.id);
    if (!member || (member.role !== 'President' && member.role !== 'Officer' && req.user.role !== 'admin')) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    club.events.push(req.body);
    await club.save();

    res.json({
      success: true,
      club
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// @route   PUT /api/clubs/:clubId/events/:eventId
// @desc    Update club event
// @access  Private (President/Officers/Admin)
router.put('/:clubId/events/:eventId', protect, async (req, res) => {
  try {
    const club = await Club.findById(req.params.clubId);

    if (!club) {
      return res.status(404).json({ error: 'Club not found' });
    }

    // Check if user has permission
    const member = club.members.find(m => m.user.toString() === req.user.id);
    if (!member || (member.role !== 'President' && member.role !== 'Officer' && req.user.role !== 'admin')) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const event = club.events.id(req.params.eventId);
    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }

    Object.assign(event, req.body);
    await club.save();

    res.json({
      success: true,
      club
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// @route   DELETE /api/clubs/:clubId/events/:eventId
// @desc    Delete club event
// @access  Private (President/Officers/Admin)
router.delete('/:clubId/events/:eventId', protect, async (req, res) => {
  try {
    const club = await Club.findById(req.params.clubId);

    if (!club) {
      return res.status(404).json({ error: 'Club not found' });
    }

    // Check if user has permission
    const member = club.members.find(m => m.user.toString() === req.user.id);
    if (!member || (member.role !== 'President' && member.role !== 'Officer' && req.user.role !== 'admin')) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    club.events = club.events.filter(e => e._id.toString() !== req.params.eventId);
    await club.save();

    res.json({
      success: true,
      message: 'Event deleted successfully',
      club
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// @route   PUT /api/clubs/:clubId/members/:memberId
// @desc    Update member role
// @access  Private (President/Admin)
router.put('/:clubId/members/:memberId', protect, async (req, res) => {
  try {
    const club = await Club.findById(req.params.clubId);

    if (!club) {
      return res.status(404).json({ error: 'Club not found' });
    }

    // Check if user is president or admin
    if (club.president.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const member = club.members.find(m => m.user.toString() === req.params.memberId);
    if (!member) {
      return res.status(404).json({ error: 'Member not found' });
    }

    member.role = req.body.role;
    await club.save();

    await club.populate('members.user', 'firstName lastName studentId profileImage');

    res.json({
      success: true,
      club
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// @route   DELETE /api/clubs/:clubId/members/:memberId
// @desc    Remove member from club
// @access  Private (President/Admin)
router.delete('/:clubId/members/:memberId', protect, async (req, res) => {
  try {
    const club = await Club.findById(req.params.clubId);

    if (!club) {
      return res.status(404).json({ error: 'Club not found' });
    }

    // Check if user is president or admin
    if (club.president.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Not authorized' });
    }

    // Cannot remove president
    if (club.president.toString() === req.params.memberId) {
      return res.status(400).json({ error: 'Cannot remove president' });
    }

    club.members = club.members.filter(m => m.user.toString() !== req.params.memberId);
    await club.save();

    await User.findByIdAndUpdate(req.params.memberId, {
      $pull: { clubs: club._id }
    });

    res.json({
      success: true,
      message: 'Member removed successfully'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// @route   GET /api/clubs/category/:category
// @desc    Get clubs by category
// @access  Private
router.get('/category/:category', protect, async (req, res) => {
  try {
    const clubs = await Club.find({
      category: req.params.category,
      isActive: true
    })
      .populate('president', 'firstName lastName profileImage')
      .sort({ name: 1 });

    res.json({
      success: true,
      count: clubs.length,
      clubs
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;