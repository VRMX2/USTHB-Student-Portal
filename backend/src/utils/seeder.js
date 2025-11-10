require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');
const Course = require('../models/Course');
const Club = require('../models/Club');

const connectDB = async () => {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/usthb_portal');
  console.log('MongoDB connected');
};

const seedData = async () => {
  try {
    await connectDB();

    await User.deleteMany({});
    await Course.deleteMany({});
    await Club.deleteMany({});

    console.log('Cleared existing data');

    const admin = await User.create({
      studentId: 'ADM001',
      email: 'admin@usthb.dz',
      password: 'admin123',
      firstName: 'System',
      lastName: 'Administrator',
      role: 'admin',
      faculty: 'Administration',
      department: 'IT'
    });

    const professors = await User.create([
      {
        studentId: 'PROF001',
        email: 'prof1@usthb.dz',
        password: 'professor123',
        firstName: 'Ahmed',
        lastName: 'Benali',
        role: 'professor',
        faculty: 'Faculty of Computer Science',
        department: 'Software Engineering'
      },
      {
        studentId: 'PROF002',
        email: 'prof2@usthb.dz',
        password: 'professor123',
        firstName: 'Fatima',
        lastName: 'Zahra',
        role: 'professor',
        faculty: 'Faculty of Computer Science',
        department: 'Artificial Intelligence'
      }
    ]);

    const students = await User.create([
      {
        studentId: '201901234',
        email: 'student1@usthb.dz',
        password: 'student123',
        firstName: 'Karim',
        lastName: 'Mansouri',
        role: 'student',
        faculty: 'Faculty of Computer Science',
        department: 'Software Engineering',
        level: 'L3'
      },
      {
        studentId: '201901235',
        email: 'student2@usthb.dz',
        password: 'student123',
        firstName: 'Amina',
        lastName: 'Saidi',
        role: 'student',
        faculty: 'Faculty of Computer Science',
        department: 'Software Engineering',
        level: 'L3'
      }
    ]);

    const courses = await Course.create([
      {
        code: 'CS301',
        name: 'Advanced Algorithms',
        description: 'In-depth study of algorithm design',
        credits: 6,
        professor: professors[0]._id,
        faculty: 'Faculty of Computer Science',
        department: 'Software Engineering',
        level: 'L3',
        semester: 'S1',
        academicYear: '2024-2025',
        schedule: [
          { day: 'Monday', startTime: '08:00', endTime: '10:00', room: 'A101', type: 'Lecture' },
          { day: 'Wednesday', startTime: '14:00', endTime: '16:00', room: 'Lab 3', type: 'TP' }
        ],
        enrolledStudents: [students[0]._id, students[1]._id]
      }
    ]);

    await User.findByIdAndUpdate(students[0]._id, { $push: { enrolledCourses: courses[0]._id } });

    const clubs = await Club.create([
      {
        name: 'Tech Innovation Club',
        description: 'A club for tech enthusiasts',
        category: 'Technology',
        president: students[0]._id,
        members: [{ user: students[0]._id, role: 'President' }],
        email: 'tech@usthb.dz',
        foundedDate: new Date('2020-09-01')
      }
    ]);

    console.log('✅ Database seeded successfully!');
    console.log('\nLogin Credentials:');
    console.log('Admin: admin@usthb.dz / admin123');
    console.log('Professor: prof1@usthb.dz / professor123');
    console.log('Student: student1@usthb.dz / student123');

    process.exit(0);
  } catch (error) {
    console.error('Error seeding database:', error);
    process.exit(1);
  }
};

seedData();