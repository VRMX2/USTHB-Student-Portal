import mongoose from "mongoose";


const gradeSchema = new mongoose.Schema({
  student: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  course: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Course',
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
  assessments: [{
    type: {
      type: String,
      enum: ['TD', 'TP', 'Test', 'Exam', 'Project'],
      required: true
    },
    score: {
      type: Number,
      required: true,
      min: 0,
      max: 20
    },
    maxScore: {
      type: Number,
      default: 20
    },
    weight: {
      type: Number,
      required: true
    },
    date: Date,
    comments: String
  }],
  finalGrade: {
    type: Number,
    min: 0,
    max: 20
  },
  status: {
    type: String,
    enum: ['Pass', 'Fail', 'Pending'],
    default: 'Pending'
  },
  remarks: String
}, {
  timestamps: true
});

gradeSchema.pre('save', function(next) {
  if (this.assessments && this.assessments.length > 0) {
    let totalWeight = 0;
    let weightedSum = 0;
    
    this.assessments.forEach(assessment => {
      weightedSum += (assessment.score / assessment.maxScore) * 20 * assessment.weight;
      totalWeight += assessment.weight;
    });
    
    if (totalWeight > 0) {
      this.finalGrade = Number((weightedSum / totalWeight).toFixed(2));
      this.status = this.finalGrade >= 10 ? 'Pass' : 'Fail';
    }
  }
  next();
});

module.exports = mongoose.model('Grade', gradeSchema);