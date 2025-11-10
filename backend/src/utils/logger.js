import fs from 'fs';
import path from 'path';

const logsDir = path.join(__dirname, '../logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir);
}

const getTimestamp = () => new Date().toISOString();

const log = (level, message, data = null) => {
  const logEntry = {
    timestamp: getTimestamp(),
    level,
    message,
    ...(data && { data })
  };

  const logString = JSON.stringify(logEntry) + '\n';

  const colors = {
    info: '\x1b[36m',
    warn: '\x1b[33m',
    error: '\x1b[31m',
    success: '\x1b[32m',
    reset: '\x1b[0m'
  };

  console.log(`${colors[level] || colors.reset}[${level.toUpperCase()}] ${message}${colors.reset}`);
  if (data) console.log(data);

  const logFile = path.join(logsDir, `${new Date().toISOString().split('T')[0]}.log`);
  fs.appendFileSync(logFile, logString);
};

module.exports = {
  info: (message, data) => log('info', message, data),
  warn: (message, data) => log('warn', message, data),
  error: (message, data) => log('error', message, data),
  success: (message, data) => log('success', message, data)
};