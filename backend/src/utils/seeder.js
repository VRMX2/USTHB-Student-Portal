import "dotenv/config";
import mongoose from 'mongoose';
import User from '../models/User.js';
import Course from '../models/Course.js';
import Club from '../models/Club.js';

const connectDB = async () => {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/usthb_portal');
  console.log('MongoDB connected');
};

const seedData = async () => {
  try {
    await connectDB();

    // Clear existing data
    await User.deleteMany({});
    await Course.deleteMany({});
    await Club.deleteMany({});

    console.log('Cleared existing data');

    // Create admin
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

    // Create professors
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
      },
      {
        studentId: 'PROF003',
        email: 'prof3@usthb.dz',
        password: 'professor123',
        firstName: 'Mohamed',
        lastName: 'Djamel',
        role: 'professor',
        faculty: 'Faculty of Mathematics',
        department: 'Applied Mathematics'
      }
    ]);

    // Create students
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
      },
      {
        studentId: '201901236',
        email: 'student3@usthb.dz',
        password: 'student123',
        firstName: 'Yacine',
        lastName: 'Rahmouni',
        role: 'student',
        faculty: 'Faculty of Computer Science',
        department: 'Artificial Intelligence',
        level: 'M1'
      }
    ]);

    // Create courses
    const courses = await Course.create([
      {
        code: 'CS301',
        name: 'Advanced Algorithms',
        description: 'In-depth study of algorithm design and analysis',
        credits: 6,
        professor: professors[0]._id,
        faculty: 'Faculty of Computer Science',
        department: 'Software Engineering',
        level: 'L3',
        semester: 'S1',
        academicYear: '2024-2025',
        schedule: [
          {
            day: 'Monday',
            startTime: '08:00',
            endTime: '10:00',
            room: 'A101',
            type: 'Lecture'
          },
          {
            day: 'Wednesday',
            startTime: '14:00',
            endTime: '16:00',
            room: 'Lab 3',
            type: 'TP'
          }
        ],
        enrolledStudents: [students[0]._id, students[1]._id]
      },
      {
        code: 'AI401',
        name: 'Machine Learning',
        description: 'Introduction to machine learning algorithms and applications',
        credits: 6,
        professor: professors[1]._id,
        faculty: 'Faculty of Computer Science',
        department: 'Artificial Intelligence',
        level: 'M1',
        semester: 'S1',
        academicYear: '2024-2025',
        schedule: [
          {
            day: 'Tuesday',
            startTime: '10:00',
            endTime: '12:00',
            room: 'B201',
            type: 'Lecture'
          },
          {
            day: 'Thursday',
            startTime: '14:00',
            endTime: '16:00',
            room: 'Lab 5',
            type: 'TP'
          }
        ],
        enrolledStudents: [students[2]._id]
      },
      {
        code: 'MATH201',
        name: 'Linear Algebra',
        description: 'Vector spaces, matrices, and linear transformations',
        credits: 5,
        professor: professors[2]._id,
        faculty: 'Faculty of Mathematics',
        department: 'Applied Mathematics',
        level: 'L2',
        semester: 'S1',
        academicYear: '2024-2025',
        schedule: [
          {
            day: 'Monday',
            startTime: '10:00',
            endTime: '12:00',
            room: 'C301',
            type: 'Lecture'
          },
          {
            day: 'Friday',
            startTime: '08:00',
            endTime: '10:00',
            room: 'C302',
            type: 'TD'
          }
        ],
        enrolledStudents: []
      }
    ]);

    // Update users with enrolled courses
    await User.findByIdAndUpdate(students[0]._id, {
      $push: { enrolledCourses: courses[0]._id }
    });
    await User.findByIdAndUpdate(students[1]._id, {
      $push: { enrolledCourses: courses[0]._id }
    });
    await User.findByIdAndUpdate(students[2]._id, {
      $push: { enrolledCourses: courses[1]._id }
    });

    // Create clubs
    const clubs = await Club.create([
      {
        name: 'Tech Innovation Club',
        description: 'A club for students interested in technology and innovation',
        category: 'Technology',
        president: students[0]._id,
        members: [
          { user: students[0]._id, role: 'President' },
          { user: students[1]._id, role: 'Member' }
        ],
        email: 'tech.innovation@usthb.dz',
        foundedDate: new Date('2020-09-01')
      },
      {
        name: 'AI Research Club',
        description: 'Exploring artificial intelligence and machine learning',
        category: 'Academic',
        president: students[2]._id,
        members: [
          { user: students[2]._id, role: 'President' }
        ],
        email: 'ai.research@usthb.dz',
        foundedDate: new Date('2021-10-15')
      },
      {
        name: 'Sports Club',
        description: 'Promoting sports and physical activities',
        category: 'Sports',
        president: students[1]._id,
        members: [
          { user: students[1]._id, role: 'President' },
          { user: students[0]._id, role: 'Member' }
        ],
        email: 'sports@usthb.dz',
        foundedDate: new Date('2019-03-20')
      }
    ]);

    console.log('✅ Database seeded successfully!');
    console.log('\n📝 Login Credentials:');
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