'use strict';

require('dotenv').config();

const http = require('http');
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

const connectDB = require('./src/config/database');
const { initSocket } = require('./src/config/socket');

// ─── Route Imports ────────────────────────────────
const authRoutes = require('./src/routes/auth');
const serviceCenterRoutes = require('./src/routes/serviceCenters');
const serviceRoutes = require('./src/routes/services');
const tokenRoutes = require('./src/routes/tokens');
const queueRoutes = require('./src/routes/queue');
const counterRoutes = require('./src/routes/counters');
const crowdRoutes = require('./src/routes/crowd');
const analyticsRoutes = require('./src/routes/analytics');
const notificationRoutes = require('./src/routes/notifications');
const iotRoutes = require('./src/routes/iot');
const devRoutes = require('./src/routes/dev');

// ─── App Init ─────────────────────────────────────
const app = express();
const server = http.createServer(app);

// ─── Database ─────────────────────────────────────
connectDB();

// ─── Socket.IO ────────────────────────────────────
initSocket(server);

// ─── Middleware ───────────────────────────────────
const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:5173')
  .split(',')
  .map((o) => o.trim());

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, curl, Postman)
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`CORS: Origin ${origin} not allowed`));
      }
    },
    credentials: true,
  })
);

app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

if (process.env.NODE_ENV !== 'test') {
  app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
}

// ─── Rate Limiting ────────────────────────────────
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === 'test' ? 10000 : 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests, please try again later.' },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'test' ? 10000 : 20,
  message: { success: false, message: 'Too many auth attempts, please try again later.' },
});

app.use('/api/', generalLimiter);

// ─── Health Check ─────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({
    success: true,
    message: 'QueueFlow backend is running',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
  });
});

// ─── API Routes ───────────────────────────────────
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/service-centers', serviceCenterRoutes);
app.use('/api/services', serviceRoutes);
app.use('/api/tokens', tokenRoutes);
app.use('/api/queue', queueRoutes);
app.use('/api/counters', counterRoutes);
app.use('/api/crowd', crowdRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/iot', iotRoutes);

// Dev simulator — only available in non-production environments
if (process.env.NODE_ENV !== 'production' && process.env.DEV_SIMULATOR_ENABLED === 'true') {
  app.use('/api/dev', devRoutes);
  console.log('[DEV] Simulator routes enabled at /api/dev');
}

// ─── 404 Handler ──────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ success: false, message: 'Route not found' });
});

// ─── Global Error Handler ─────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error('[ERROR]', err.message, err.stack);

  if (err.name === 'ValidationError') {
    const errors = Object.values(err.errors).map((e) => e.message);
    return res.status(400).json({ success: false, message: 'Validation error', errors });
  }

  if (err.code === 11000) {
    const field = Object.keys(err.keyValue)[0];
    return res.status(409).json({ success: false, message: `${field} already exists` });
  }

  if (err.name === 'CastError') {
    return res.status(400).json({ success: false, message: 'Invalid ID format' });
  }

  const status = err.status || err.statusCode || 500;
  res.status(status).json({
    success: false,
    message: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
});

// ─── Start Server ─────────────────────────────────
const PORT = parseInt(process.env.PORT || '5000', 10);

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`\n🚀 QueueFlow Backend running on port ${PORT}`);
    console.log(`   Environment : ${process.env.NODE_ENV}`);
    console.log(`   Health check: http://localhost:${PORT}/health`);
    console.log(`   API base    : http://localhost:${PORT}/api\n`);
  });
}

// ─── Graceful Shutdown ────────────────────────────
process.on('SIGTERM', () => {
  console.log('[SIGTERM] Graceful shutdown initiated...');
  server.close(() => {
    console.log('[SIGTERM] HTTP server closed.');
    process.exit(0);
  });
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[unhandledRejection]', reason, promise);
});

module.exports = { app, server };
