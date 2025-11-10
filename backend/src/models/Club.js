import mongoose from 'mongoose';

const clubSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true
  },
  description: {
    type: String,
    required: true
  },
  logo: {
    type: String,
    default: 'https://res.cloudinary.com/demo/image/upload/v1/club-default.png'
  },
  category: {
    type: String,
    enum: ['Academic', 'Sports', 'Cultural', 'Technology', 'Social', 'Other'],
    required: true
  },
  president: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  vicePresident: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  members: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    role: {
      type: String,
      enum: ['Member', 'Officer', 'President', 'VicePresident'],
      default: 'Member'
    },
    joinedAt: {
      type: Date,
      default: Date.now
    }
  }],
  events: [{
    title: String,
    description: String,
    date: Date,
    location: String,
    image: String
  }],
  email: String,
  socialMedia: {
    facebook: String,
    instagram: String,
    twitter: String,
    linkedin: String
  },
  isActive: {
    type: Boolean,
    default: true
  },
  foundedDate: Date
}, {
  timestamps: true
});

module.exports = mongoose.model('Club', clubSchema);