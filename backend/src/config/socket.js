'use strict';

const { Server } = require('socket.io');

let io;

/**
 * Initialize the Socket.IO server.
 * Must be called once from server.js after the HTTP server is created.
 */
function initSocket(httpServer) {
  const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:5173')
    .split(',')
    .map((o) => o.trim());

  io = new Server(httpServer, {
    cors: {
      origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin)) {
          callback(null, true);
        } else {
          callback(new Error(`Socket.IO CORS: Origin ${origin} not allowed`));
        }
      },
      methods: ['GET', 'POST'],
      credentials: true,
    },
    pingTimeout: 60000,
    pingInterval: 25000,
    transports: ['websocket', 'polling'],
  });

  io.on('connection', (socket) => {
    console.log(`[Socket] Client connected: ${socket.id}`);

    // ── Room subscriptions ──────────────────────────────────────
    // Clients join a center room to receive all events for that center
    socket.on('join:center', (centerId) => {
      if (!centerId) return;
      socket.join(`center:${centerId}`);
      console.log(`[Socket] ${socket.id} joined center:${centerId}`);
    });

    socket.on('leave:center', (centerId) => {
      if (!centerId) return;
      socket.leave(`center:${centerId}`);
    });

    // Clients join their personal room to receive user-specific notifications
    socket.on('join:user', (userId) => {
      if (!userId) return;
      socket.join(`user:${userId}`);
      console.log(`[Socket] ${socket.id} joined user:${userId}`);
    });

    socket.on('leave:user', (userId) => {
      if (!userId) return;
      socket.leave(`user:${userId}`);
    });

    // Counter display clients join a counter room
    socket.on('join:counter', ({ centerId, counterId }) => {
      if (!centerId || !counterId) return;
      socket.join(`counter:${centerId}:${counterId}`);
      console.log(`[Socket] ${socket.id} joined counter:${centerId}:${counterId}`);
    });

    socket.on('leave:counter', ({ centerId, counterId }) => {
      if (!centerId || !counterId) return;
      socket.leave(`counter:${centerId}:${counterId}`);
      console.log(`[Socket] ${socket.id} left counter:${centerId}:${counterId}`);
    });

    socket.on('disconnect', (reason) => {
      console.log(`[Socket] Client disconnected: ${socket.id} — ${reason}`);
    });

    socket.on('error', (err) => {
      console.error(`[Socket] Error from ${socket.id}:`, err.message);
    });
  });

  console.log('[Socket] Socket.IO server initialized');
  return io;
}

/**
 * Get the Socket.IO instance.
 * Call this from controllers/services to emit events.
 */
function getIO() {
  if (!io) {
    throw new Error('[Socket] Socket.IO has not been initialized. Call initSocket() first.');
  }
  return io;
}

// ─── Named emit helpers ────────────────────────────────────────────────────────

/**
 * Emit to all clients in a service center room.
 * @param {string} centerId
 * @param {string} event - Socket.IO event name
 * @param {object} data
 */
function emitToCenter(centerId, event, data) {
  getIO().to(`center:${centerId}`).emit(event, data);
}

/**
 * Emit to a specific user's personal room.
 * @param {string} userId
 * @param {string} event
 * @param {object} data
 */
function emitToUser(userId, event, data) {
  getIO().to(`user:${userId}`).emit(event, data);
}

/**
 * Emit to all clients subscribed to a specific counter display.
 * @param {string} centerId
 * @param {string} counterId
 * @param {string} event
 * @param {object} data
 */
function emitToCounter(centerId, counterId, event, data) {
  getIO().to(`counter:${centerId}:${counterId}`).emit(event, data);
}

/**
 * Broadcast to all connected clients.
 * Use sparingly — prefer room-scoped emits.
 */
function broadcast(event, data) {
  getIO().emit(event, data);
}

module.exports = {
  initSocket,
  getIO,
  emitToCenter,
  emitToUser,
  emitToCounter,
  broadcast,
};
