import mongoose from "mongoose";

const examSchema = new mongoose.Schema({
  course: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Course',
    required: true
  },
  title: {
    type: String,
    required: true
  },
  type: {
    type: String,
    enum: ['Midterm', 'Final', 'Makeup', 'Quiz'],
    required: true
  },
  date: {
    type: Date,
    required: true
  },
  startTime: {
    type: String,
    required: true
  },
  duration: {
    type: Number,
    required: true
  },
  room: {
    type: String,
    required: true
  },
  instructions: String,
  materials: [{
    title: String,
    url: String
  }],
  totalMarks: {
    type: Number,
    required: true
  },
  semester: {
    type: String,
    enum: ['S1', 'S2'],
    required: true
  },
  academicYear: {
    type: String,
    required: true
  },
  isPublished: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Exam', examSchema);