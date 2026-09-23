'use strict';

const mongoose = require('mongoose');

let connectPromise = null;

async function connectDB() {
  if (mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  if (connectPromise) {
    return connectPromise;
  }

  const uri = process.env.MONGODB_URI;

  if (!uri) {
    console.error('[DB] MONGODB_URI is not set. Please configure your .env file.');
    process.exit(1);
  }

  connectPromise = (async () => {
    try {
      const conn = await mongoose.connect(uri, {
        serverSelectionTimeoutMS: 15000,
        socketTimeoutMS: 45000,
      });

      console.log(`[DB] MongoDB connected: ${conn.connection.host}`);
      // Ensure critical security indexes are registered
      try {
        const { Token } = require('../models/Token');
        Token.init().catch((idxErr) => console.warn('[DB] Token index init warning:', idxErr.message));
      } catch (_) {}

      mongoose.connection.on('disconnected', () => {
        console.warn('[DB] MongoDB disconnected.');
        connectPromise = null;
      });

      mongoose.connection.on('reconnected', () => {
        console.log('[DB] MongoDB reconnected.');
      });

      mongoose.connection.on('error', (err) => {
        console.error('[DB] MongoDB connection error:', err.message);
      });

      return conn;
    } catch (err) {
      connectPromise = null;
      console.error('[DB] Initial connection failed:', err.message);
      if (process.env.NODE_ENV === 'test') throw err;
      console.log('[DB] Retrying in 5 seconds...');
      setTimeout(connectDB, 5000);
    }
  })();

  return connectPromise;
}

module.exports = connectDB;
