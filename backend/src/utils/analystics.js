const User = require('../models/User');
const Course = require('../models/Course');
const Grade = require('../models/Grade');
const Attendance = require('../models/Attendance');

const calculateStudentAnalytics = async (studentId) => {
  try {
    const grades = await Grade.find({ student: studentId }).populate('course', 'name code credits');

    let totalCredits = 0;
    let weightedGrades = 0;
    const gradesBySubject = [];

    grades.forEach(grade => {
      if (grade.finalGrade && grade.course.credits) {
        totalCredits += grade.course.credits;
        weightedGrades += grade.finalGrade * grade.course.credits;
        
        gradesBySubject.push({
          course: grade.course.name,
          code: grade.course.code,
          grade: grade.finalGrade,
          credits: grade.course.credits
        });
      }
    });

    const gpa = totalCredits > 0 ? (weightedGrades / totalCredits).toFixed(2) : 0;

    const attendance = await Attendance.find({ student: studentId });
    const attendanceRate = attendance.length > 0
      ? ((attendance.filter(a => a.status === 'Present' || a.status === 'Late').length / attendance.length) * 100).toFixed(2)
      : 0;

    const recentGrades = grades
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 5)
      .map(g => g.finalGrade);

    const sortedByGrade = gradesBySubject.sort((a, b) => b.grade - a.grade);
    const strengths = sortedByGrade.slice(0, 3);
    const weaknesses = sortedByGrade.slice(-3).reverse();

    return {
      gpa,
      totalCourses: grades.length,
      totalCredits,
      attendanceRate,
      recentGrades,
      gradesBySubject,
      strengths,
      weaknesses,
      averageGrade: grades.length > 0 
        ? (grades.reduce((sum, g) => sum + g.finalGrade, 0) / grades.length).toFixed(2)
        : 0
    };
  } catch (error) {
    console.error('Error calculating student analytics:', error);
    return null;
  }
};

const calculateCourseAnalytics = async (courseId) => {
  try {
    const course = await Course.findById(courseId).populate('enrolledStudents');
    if (!course) return null;

    const grades = await Grade.find({ course: courseId });
    const gradeValues = grades.map(g => g.finalGrade).filter(g => g !== undefined);
    
    const average = gradeValues.length > 0
      ? (gradeValues.reduce((sum, g) => sum + g, 0) / gradeValues.length).toFixed(2)
      : 0;

    const highest = gradeValues.length > 0 ? Math.max(...gradeValues) : 0;
    const lowest = gradeValues.length > 0 ? Math.min(...gradeValues) : 0;

    const distribution = {
      excellent: gradeValues.filter(g => g >= 16).length,
      veryGood: gradeValues.filter(g => g >= 14 && g < 16).length,
      good: gradeValues.filter(g => g >= 12 && g < 14).length,
      average: gradeValues.filter(g => g >= 10 && g < 12).length,
      fail: gradeValues.filter(g => g < 10).length
    };

    const passRate = gradeValues.length > 0
      ? ((gradeValues.filter(g => g >= 10).length / gradeValues.length) * 100).toFixed(2)
      : 0;

    return {
      enrolledStudents: course.enrolledStudents.length,
      gradedStudents: grades.length,
      averageGrade: average,
      highestGrade: highest,
      lowestGrade: lowest,
      passRate,
      distribution
    };
  } catch (error) {
    console.error('Error calculating course analytics:', error);
    return null;
  }
};

module.exports = {
  calculateStudentAnalytics,
  calculateCourseAnalytics
};