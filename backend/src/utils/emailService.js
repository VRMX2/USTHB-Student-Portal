import nodemailer from 'nodemailer';

const createTransporter = () => {
  return nodemailer.createTransporter({
    host: process.env.EMAIL_HOST,
    port: process.env.EMAIL_PORT,
    secure: false,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    }
  });
};

const sendEmail = async (options) => {
  try {
    const transporter = createTransporter();

    const mailOptions = {
      from: `USTHB Portal <${process.env.EMAIL_USER}>`,
      to: options.email,
      subject: options.subject,
      text: options.message,
      html: options.html
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('Email sent:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('Error sending email:', error);
    return { success: false, error: error.message };
  }
};

const emailTemplates = {
  welcome: (name) => ({
    subject: 'Welcome to USTHB Portal',
    html: `<h1>Welcome ${name}!</h1><p>Your account has been created successfully.</p>`
  }),
  newGrade: (studentName, courseName, grade) => ({
    subject: `New Grade: ${courseName}`,
    html: `<h2>Grade Notification</h2><p>Dear ${studentName}, Your grade: <strong>${grade}/20</strong></p>`
  }),
  examReminder: (studentName, courseName, examDate, examTime, room) => ({
    subject: `Exam Reminder: ${courseName}`,
    html: `<h2>Upcoming Exam</h2><p>Course: ${courseName}<br>Date: ${examDate}<br>Time: ${examTime}<br>Room: ${room}</p>`
  })
};

const sendWelcomeEmail = async (email, name) => {
  const template = emailTemplates.welcome(name);
  return await sendEmail({ email, ...template });
};

const sendGradeNotification = async (email, studentName, courseName, grade) => {
  const template = emailTemplates.newGrade(studentName, courseName, grade);
  return await sendEmail({ email, ...template });
};

const sendExamReminder = async (email, studentName, courseName, examDate, examTime, room) => {
  const template = emailTemplates.examReminder(studentName, courseName, examDate, examTime, room);
  return await sendEmail({ email, ...template });
};

module.exports = {
  sendEmail,
  sendWelcomeEmail,
  sendGradeNotification,
  sendExamReminder
};