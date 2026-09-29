/**
 * Verification Script for College Account Live Counter
 * Tests the real two-counter flow directly against the running backend server.
 */

const http = require('http');
const path = require('path');
const { io } = require('socket.io-client');
const assert = require('assert');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const BASE_URL = 'http://localhost:5000';
const COLLEGE_CENTER_ID = '6ab93df8da6b1eefeb19caa2';
const COUNTER_ONE_ID = '6ab93df9da6b1eefeb19caaa';
const COUNTER_TWO_ID = '6ab93dfbda6b1eefeb19cae0';
const SERVICE_ID = '6ab93df8da6b1eefeb19caa6';
const JWT_SECRET = process.env.JWT_SECRET || 'queueflow_dev_secret_change_in_production_minimum_64_chars_abc123xyz';

function request(method, path, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request(
      {
        method,
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        headers: {
          'Content-Type': 'application/json',
          ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
          ...headers,
        },
      },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          let parsed = null;
          try {
            parsed = JSON.parse(data);
          } catch (_) {
            parsed = data;
          }
          resolve({ status: res.statusCode, body: parsed });
        });
      }
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

const auth = (token) => ({ Authorization: `Bearer ${token}` });

// Pure counter state replication from frontend
function buildCountersState(backendCounters = [], nowServing = []) {
  if (!Array.isArray(backendCounters) || backendCounters.length === 0) return [];

  const isNowServingExplicitEmpty = Array.isArray(nowServing) && nowServing.length === 0;

  return backendCounters.map((c, idx) => {
    const matchedToken = Array.isArray(nowServing)
      ? nowServing.find((t) => {
          if (!t) return false;
          if (t.counterId) {
            if (t.counterId === c._id || t.counterId?._id === c._id) return true;
            if (c.number && t.counterId?.number === c.number) return true;
            if (c.name && t.counterId?.name === c.name) return true;
            if (c.displayLabel && t.counterId?.displayLabel === c.displayLabel) return true;
          }
          return false;
        })
      : null;

    const counterLabel =
      matchedToken?.counterId?.displayLabel ||
      c.displayLabel ||
      c.name ||
      (c.number ? `COUNTER ${String(c.number).padStart(2, '0')}` : `COUNTER ${String(idx + 1).padStart(2, '0')}`);

    if (isNowServingExplicitEmpty) {
      return { ...c, displayLabel: counterLabel, servingToken: null };
    }

    let servingToken = null;
    if (matchedToken) {
      servingToken = {
        _id: matchedToken._id,
        tokenCode: matchedToken.tokenCode,
        status: matchedToken.status,
        calledAt: matchedToken.calledAt,
      };
    } else if (c.servingToken && ['CALLED', 'SERVING'].includes(c.servingToken.status)) {
      servingToken = { ...c.servingToken };
    }

    return {
      ...c,
      displayLabel: counterLabel,
      servingToken,
    };
  });
}

function updateOnTokenCalled(counters, token, counter) {
  return counters.map((c) => {
    const match =
      (counter?._id && String(c._id) === String(counter._id)) ||
      (token?.counterId?._id && String(c._id) === String(token.counterId._id)) ||
      (counter?.number !== undefined && Number(c.number) === Number(counter.number));

    if (match) {
      return {
        ...c,
        servingToken: {
          _id: token?._id || token?.id,
          tokenCode: token?.tokenCode,
          status: token?.status || 'CALLED',
        },
      };
    }
    return c;
  });
}

function clearOnTokenCompleted(counters, token, counter) {
  return counters.map((c) => {
    const match =
      (counter?._id && String(c._id) === String(counter._id)) ||
      (token?.counterId?._id && String(c._id) === String(token.counterId._id)) ||
      (c.servingToken && c.servingToken.tokenCode === token?.tokenCode);

    if (match) {
      return {
        ...c,
        servingToken: null,
      };
    }
    return c;
  });
}

async function runVerification() {
  console.log('🚀 Starting College Account Real Two-Counter Verification...\n');

  // 1. Login as Admin
  const loginRes = await request('POST', '/api/auth/login', {
    email: 'admin@queueflow.dev',
    password: 'Admin@1234',
  });
  assert.strictEqual(loginRes.status, 200, 'Admin login failed');
  const adminToken = loginRes.body.data.token;
  console.log('  ✓ Admin logged in');

  // 2. Fetch Display State to get displayToken & initial counters
  const displayRes = await request('GET', `/api/queue/${COLLEGE_CENTER_ID}/display`);
  assert.strictEqual(displayRes.status, 200, 'Failed to fetch display data');
  const displayData = displayRes.body.data;
  const displayToken = displayData.displayToken;
  assert(displayToken, 'displayToken is missing');
  console.log('  ✓ Fetched initial display data and displayToken');

  // Disable autoResourceAllocation temporarily so manual call-next can be tested deterministically
  const initialAuto = displayData.center?.autoResourceAllocation ?? true;
  await request('PATCH', `/api/service-centers/${COLLEGE_CENTER_ID}`, { autoResourceAllocation: false }, auth(adminToken));
  console.log('  ✓ Disabled autoResourceAllocation for deterministic manual testing');

  let localCounters = buildCountersState(displayData.counters, displayData.nowServing);

  // Connect socket client as Live Counter display board first
  const socket = io(BASE_URL, {
    transports: ['websocket'],
    auth: { token: `Bearer ${displayToken}` },
    query: { centerId: COLLEGE_CENTER_ID, role: 'display' },
  });

  const receivedEvents = [];
  socket.on('token.called', (d) => {
    receivedEvents.push({ event: 'token.called', data: d });
    localCounters = updateOnTokenCalled(localCounters, d.token, d.counter);
  });
  socket.on('token.completed', (d) => {
    receivedEvents.push({ event: 'token.completed', data: d });
    localCounters = clearOnTokenCompleted(localCounters, d.token, d.counter);
  });

  await new Promise((resolve) => socket.once('connect', resolve));
  socket.emit('join:center', COLLEGE_CENTER_ID);
  await new Promise((r) => setTimeout(r, 200));
  console.log('  ✓ Socket.IO connected and joined center room');

  // Connect to DB and ensure clean baseline for College center
  if (mongoose.connection.readyState === 0 && process.env.MONGODB_URI) {
    await mongoose.connect(process.env.MONGODB_URI);
  }
  const TokenModel = mongoose.model('Token', new mongoose.Schema({}, { strict: false }));
  const CounterModel = mongoose.model('Counter', new mongoose.Schema({}, { strict: false }));
  await TokenModel.updateMany(
    { centerId: new mongoose.Types.ObjectId(COLLEGE_CENTER_ID), status: { $in: ['CALLED', 'SERVING'] } },
    { $set: { status: 'COMPLETED', completedAt: new Date() } }
  );
  await CounterModel.updateMany(
    { centerId: new mongoose.Types.ObjectId(COLLEGE_CENTER_ID) },
    { $set: { status: 'ACTIVE', currentTokenId: null } }
  );

  await new Promise((r) => setTimeout(r, 600));

  const clearedRes = await request('GET', `/api/queue/${COLLEGE_CENTER_ID}/display`);
  localCounters = buildCountersState(clearedRes.body.data.counters, clearedRes.body.data.nowServing);
  console.log('  Baseline Counters (should all be IDLE):', localCounters.map((c) => `${c.displayLabel}: ${c.servingToken?.tokenCode || 'IDLE'}`));

  const centerLat = displayData.center?.latitude || displayData.center?.location?.latitude || 23.183009;
  const centerLng = displayData.center?.longitude || displayData.center?.location?.longitude || 77.301403;

  const existingCustomers = [
    { id: '6ab030edfb8baa6b361738d2', tokenVersion: 1 },
    { id: '6ab030edfb8baa6b361738d5', tokenVersion: 0 },
    { id: '6ab0319885a3062e4a04add4', tokenVersion: 0 },
    { id: '6ab033ab1a00ac06d1bf6674', tokenVersion: 0 },
    { id: '6ab034e0703e062265d75a31', tokenVersion: 0 },
  ];
  let custPtr = 0;

  async function ensureCustomerToken() {
    if (custPtr >= existingCustomers.length) return null;
    const cust = existingCustomers[custPtr++];
    const jwtToken = jwt.sign(
      { id: cust.id, role: 'CUSTOMER', tokenVersion: cust.tokenVersion },
      JWT_SECRET
    );
    const joinRes = await request(
      'POST',
      '/api/tokens',
      {
        centerId: COLLEGE_CENTER_ID,
        serviceId: SERVICE_ID,
        notifyApp: false,
        notifySms: false,
        latitude: centerLat,
        longitude: centerLng,
      },
      auth(jwtToken)
    );
    if (joinRes.status === 201) {
      return joinRes.body?.data?.token;
    }
    return null;
  }

  async function freshLocationWaitingTokens() {
    await TokenModel.updateMany(
      { centerId: new mongoose.Types.ObjectId(COLLEGE_CENTER_ID), status: 'WAITING' },
      {
        $set: {
          'lastLocation.latitude': centerLat,
          'lastLocation.longitude': centerLng,
          'lastLocation.distanceMeters': 0,
          'lastLocation.status': 'IN_RANGE',
          'lastLocation.updatedAt': new Date(),
          locationStatus: 'IN_RANGE',
          proximityState: 'INSIDE',
          proximityUpdatedAt: new Date(),
          proximityDistanceMeters: 0,
        },
      }
    );
  }

  console.log('\n  Ensuring sufficient waiting tokens for College Queue...');
  await ensureCustomerToken();
  await ensureCustomerToken();
  await freshLocationWaitingTokens();
  console.log('  ✓ Tokens ready with fresh in-range location in College Queue');

  // ─────────────────────────────────────────────────────────────
  // TEST 1: Call next at Counter 01
  // Expected: Counter 01 -> real token, Counter 02 -> IDLE
  // ─────────────────────────────────────────────────────────────
  console.log('\n--- TEST 1: Call next at Counter 01 ---');
  await freshLocationWaitingTokens();
  const call1Res = await request('POST', `/api/counters/${COUNTER_ONE_ID}/call-next`, { centerId: COLLEGE_CENTER_ID }, auth(adminToken));
  assert.strictEqual(call1Res.status, 200, 'Call next at Counter 01 failed');
  const c1Token = call1Res.body?.data?.counter?.currentTokenId?.tokenCode || call1Res.body?.data?.token?.tokenCode;
  assert(c1Token, `Call next at Counter 01 returned no token: ${JSON.stringify(call1Res.body)}`);
  console.log(`  Counter 01 called token: ${c1Token}`);

  await new Promise((r) => setTimeout(r, 600));

  const c1 = localCounters.find((c) => c._id === COUNTER_ONE_ID);
  const c2 = localCounters.find((c) => c._id === COUNTER_TWO_ID);
  assert.strictEqual(c1?.servingToken?.tokenCode, c1Token, `Counter 01 must be serving ${c1Token}`);
  assert.strictEqual(c2?.servingToken, null, 'Counter 02 must be IDLE');
  console.log('  ✅ TEST 1 PASSED: Counter 01 is serving real token, Counter 02 is IDLE');

  // ─────────────────────────────────────────────────────────────
  // TEST 2: Call next at Counter 02
  // Expected: Counter 01 -> current state, Counter 02 -> new real token
  // Both must be shown at the same time!
  // ─────────────────────────────────────────────────────────────
  console.log('\n--- TEST 2: Call next at Counter 02 ---');
  await freshLocationWaitingTokens();
  const call2Res = await request('POST', `/api/counters/${COUNTER_TWO_ID}/call-next`, { centerId: COLLEGE_CENTER_ID }, auth(adminToken));
  assert.strictEqual(call2Res.status, 200, 'Call next at Counter 02 failed');
  const c2Token = call2Res.body?.data?.counter?.currentTokenId?.tokenCode || call2Res.body?.data?.token?.tokenCode;
  assert(c2Token, `Call next at Counter 02 returned no token: ${JSON.stringify(call2Res.body)}`);
  console.log(`  Counter 02 called token: ${c2Token}`);

  await new Promise((r) => setTimeout(r, 600));

  const c1After = localCounters.find((c) => c._id === COUNTER_ONE_ID);
  const c2After = localCounters.find((c) => c._id === COUNTER_TWO_ID);
  assert.strictEqual(c1After?.servingToken?.tokenCode, c1Token, 'Counter 01 must still be serving its token');
  assert.strictEqual(c2After?.servingToken?.tokenCode, c2Token, 'Counter 02 must be serving new real token');
  console.log(`  State: Counter 01 -> ${c1After?.servingToken?.tokenCode}, Counter 02 -> ${c2After?.servingToken?.tokenCode}`);
  console.log('  ✅ TEST 2 PASSED: Both counters are shown simultaneously without overwriting!');

  // ─────────────────────────────────────────────────────────────
  // TEST 3: Complete Counter 01 token
  // Expected: Counter 01 -> IDLE, Counter 02 -> still shows real token
  // Counter 02 must NOT disappear!
  // ─────────────────────────────────────────────────────────────
  console.log('\n--- TEST 3: Complete Counter 01 token ---');
  const comp1Res = await request('POST', `/api/counters/${COUNTER_ONE_ID}/complete`, { centerId: COLLEGE_CENTER_ID }, auth(adminToken));
  assert.strictEqual(comp1Res.status, 200, 'Complete Counter 01 failed');

  await new Promise((r) => setTimeout(r, 600));

  const c1PostComp = localCounters.find((c) => c._id === COUNTER_ONE_ID);
  const c2PostComp = localCounters.find((c) => c._id === COUNTER_TWO_ID);
  assert.strictEqual(c1PostComp?.servingToken, null, 'Counter 01 must be IDLE');
  assert.strictEqual(c2PostComp?.servingToken?.tokenCode, c2Token, `Counter 02 must STILL show its token ${c2Token}`);
  console.log(`  State: Counter 01 -> IDLE, Counter 02 -> ${c2PostComp?.servingToken?.tokenCode}`);
  console.log('  ✅ TEST 3 PASSED: Counter 01 is IDLE, Counter 02 did NOT disappear!');

  // ─────────────────────────────────────────────────────────────
  // TEST 4: Call another token on Counter 01
  // Expected: Counter 01 updates, Counter 02 remains unchanged
  // ─────────────────────────────────────────────────────────────
  console.log('\n--- TEST 4: Call another token on Counter 01 ---');
  await ensureCustomerToken();
  await freshLocationWaitingTokens();
  const call1NextRes = await request('POST', `/api/counters/${COUNTER_ONE_ID}/call-next`, { centerId: COLLEGE_CENTER_ID }, auth(adminToken));
  assert.strictEqual(call1NextRes.status, 200, 'Second call next at Counter 01 failed');
  const c1Token2 = call1NextRes.body?.data?.counter?.currentTokenId?.tokenCode || call1NextRes.body?.data?.token?.tokenCode;
  assert(c1Token2, `Second call next at Counter 01 returned no token: ${JSON.stringify(call1NextRes.body)}`);
  console.log(`  Counter 01 called token: ${c1Token2}`);

  await new Promise((r) => setTimeout(r, 600));

  const c1Test4 = localCounters.find((c) => c._id === COUNTER_ONE_ID);
  const c2Test4 = localCounters.find((c) => c._id === COUNTER_TWO_ID);
  assert.strictEqual(c1Test4?.servingToken?.tokenCode, c1Token2, `Counter 01 updated to ${c1Token2}`);
  assert.strictEqual(c2Test4?.servingToken?.tokenCode, c2Token, `Counter 02 remained ${c2Token}`);
  console.log('  ✅ TEST 4 PASSED: Counter 01 updated, Counter 02 remained unchanged');

  // ─────────────────────────────────────────────────────────────
  // TEST 5: Socket reconnect / Authoritative sync
  // Expected: Both counters return authoritative state
  // ─────────────────────────────────────────────────────────────
  console.log('\n--- TEST 5: Authoritative Reconnect Sync ---');
  const freshDisplay = await request('GET', `/api/queue/${COLLEGE_CENTER_ID}/display`);
  assert.strictEqual(freshDisplay.status, 200);
  const rebuiltCounters = buildCountersState(freshDisplay.body.data.counters, freshDisplay.body.data.nowServing);

  const c1Rebuilt = rebuiltCounters.find((c) => c._id === COUNTER_ONE_ID);
  const c2Rebuilt = rebuiltCounters.find((c) => c._id === COUNTER_TWO_ID);
  assert.strictEqual(c1Rebuilt?.servingToken?.tokenCode, c1Token2, 'Counter 01 authoritative state verified');
  assert.strictEqual(c2Rebuilt?.servingToken?.tokenCode, c2Token, 'Counter 02 authoritative state verified');
  console.log('  ✅ TEST 5 PASSED: Both counters authoritative on reconnect!');

  // Cleanup: Complete remaining tokens and restore auto allocation
  await TokenModel.updateMany(
    { centerId: new mongoose.Types.ObjectId(COLLEGE_CENTER_ID), status: { $in: ['CALLED', 'SERVING'] } },
    { $set: { status: 'COMPLETED', completedAt: new Date() } }
  );
  await CounterModel.updateMany(
    { centerId: new mongoose.Types.ObjectId(COLLEGE_CENTER_ID) },
    { $set: { status: 'ACTIVE', currentTokenId: null } }
  );
  await request('PATCH', `/api/service-centers/${COLLEGE_CENTER_ID}`, { autoResourceAllocation: initialAuto }, auth(adminToken));
  console.log('  ✓ Cleaned up active tokens and restored autoResourceAllocation');

  socket.disconnect();
  await mongoose.disconnect();
  console.log('\n🎉 ALL REAL COLLEGE ACCOUNT TESTS PASSED WITH 100% SUCCESS!\n');
}

runVerification().catch(async (err) => {
  console.error('\n❌ Verification Failed:', err);
  try {
    await mongoose.disconnect();
  } catch (_) {}
  process.exit(1);
});
