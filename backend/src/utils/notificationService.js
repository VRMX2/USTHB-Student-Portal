const Notification = require('../models/Notification');

const createNotification = async (data) => {
  try {
    const notification = await Notification.create(data);
    return notification;
  } catch (error) {
    console.error('Error creating notification:', error);
    return null;
  }
};

const createBulkNotifications = async (notifications) => {
  try {
    const result = await Notification.insertMany(notifications);
    return result;
  } catch (error) {
    console.error('Error creating bulk notifications:', error);
    return null;
  }
};

const notificationHelpers = {
  newMessage: async (recipientId, senderId, message) => {
    return await createNotification({
      recipient: recipientId,
      sender: senderId,
      type: 'new_message',
      title: 'New Message',
      message: 'You have a new message',
      priority: 'normal',
      link: '/messages'
    });
  },

  newGrade: async (studentId, courseName, grade) => {
    return await createNotification({
      recipient: studentId,
      type: 'new_grade',
      title: 'New Grade Posted',
      message: `Your grade for ${courseName}: ${grade}/20`,
      priority: 'high',
      link: '/grades',
      data: { courseName, grade }
    });
  },

  examReminder: async (studentId, courseName, examDate, room) => {
    return await createNotification({
      recipient: studentId,
      type: 'exam_reminder',
      title: 'Exam Reminder',
      message: `Upcoming exam: ${courseName} on ${examDate} in ${room}`,
      priority: 'urgent',
      link: '/exams',
      data: { courseName, examDate, room }
    });
  }
};

const sendRealtimeNotification = (io, userId, notification) => {
  io.to(`user_${userId}`).emit('new_notification', notification);
};

module.exports = {
  createNotification,
  createBulkNotifications,
  notificationHelpers,
  sendRealtimeNotification
};