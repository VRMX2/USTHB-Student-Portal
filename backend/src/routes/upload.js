// routes/upload.js - File Upload Routes
import express from 'express';
const  router = express.Router();
import { upload, uploadToCloudinary } from '../config/cloudinary';
import { protect } from '../middleware/auth';

// @route   POST /api/upload/image
// @desc    Upload single image
// @access  Private
router.post('/image', protect, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const result = await uploadToCloudinary(req.file.buffer, 'usthb-portal/images');

    res.json({
      success: true,
      url: result.secure_url,
      publicId: result.public_id
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// @route   POST /api/upload/document
// @desc    Upload document (PDF, etc.)
// @access  Private
router.post('/document', protect, upload.single('document'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const result = await uploadToCloudinary(req.file.buffer, 'usthb-portal/documents');

    res.json({
      success: true,
      url: result.secure_url,
      publicId: result.public_id,
      format: result.format
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// @route   POST /api/upload/multiple
// @desc    Upload multiple files
// @access  Private
router.post('/multiple', protect, upload.array('files', 10), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    const uploadPromises = req.files.map(file => 
      uploadToCloudinary(file.buffer, 'usthb-portal/files')
    );

    const results = await Promise.all(uploadPromises);

    const files = results.map(result => ({
      url: result.secure_url,
      publicId: result.public_id,
      format: result.format
    }));

    res.json({
      success: true,
      count: files.length,
      files
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// @route   POST /api/upload/profile-image
// @desc    Upload profile image
// @access  Private
router.post('/profile-image', protect, upload.single('profileImage'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const result = await uploadToCloudinary(req.file.buffer, 'usthb-portal/profiles');

    // Update user profile image
    const User = require('../models/User');
    await User.findByIdAndUpdate(req.user.id, {
      profileImage: result.secure_url
    });

    res.json({
      success: true,
      url: result.secure_url,
      publicId: result.public_id
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// @route   POST /api/upload/club-logo
// @desc    Upload club logo
// @access  Private
router.post('/club-logo', protect, upload.single('logo'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const result = await uploadToCloudinary(req.file.buffer, 'usthb-portal/clubs');

    res.json({
      success: true,
      url: result.secure_url,
      publicId: result.public_id
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// @route   POST /api/upload/course-material
// @desc    Upload course material
// @access  Private (Professor/Admin)
router.post('/course-material', protect, upload.single('material'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const result = await uploadToCloudinary(req.file.buffer, 'usthb-portal/course-materials');

    res.json({
      success: true,
      url: result.secure_url,
      publicId: result.public_id,
      format: result.format,
      originalName: req.file.originalname
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;