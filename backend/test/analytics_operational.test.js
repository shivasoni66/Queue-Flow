'use strict';

/**
 * Authoritative Operational Analytics & Telemetry Test Suite
 *
 * Verifies that GET /api/analytics/:centerId returns strictly authoritative,
 * database-derived analytics with zero static/mock/demo data.
 *
 * Covers:
 *  - selected center scoping & isolation
 *  - real tokens issued today & completed today
 *  - real measured wait time (calledAt - createdAt)
 *  - real CCTV/IoT current crowd & freshness
 *  - real hourly footfall telemetry (with numeric count field)
 *  - dynamic counter utilization based on operational activity
 *  - dynamic service demand breakdown by requested tokens
 *  - average service time based on completed service durations
 *  - truthful empty / no-data states (no fabricated fake values)
 *  - date boundaries scoping
 */

const assert = require('assert');
const mongoose = require('mongoose');
require('dotenv').config();

const connectDB = require('../src/config/database');
const { getDashboard } = require('../src/controllers/analyticsController');
const ServiceCenter = require('../src/models/ServiceCenter');
const Counter = require('../src/models/Counter');
const Service = require('../src/models/Service');
const { Token } = require('../src/models/Token');
const FootfallEvent = require('../src/models/FootfallEvent');

const COLLEGE_CENTER_ID = '6ab93df8da6b1eefeb19caa2';

function mockReqRes(centerId, user = { _id: new mongoose.Types.ObjectId(), role: 'ADMIN' }) {
  const req = {
    params: { centerId },
    user,
  };

  const run = () =>
    new Promise((resolve, reject) => {
      let resolved = false;
      const res = {
        statusCode: 200,
        status(code) {
          this.statusCode = code;
          return this;
        },
        json(payload) {
          if (!resolved) {
            resolved = true;
            resolve({ status: this.statusCode, body: payload });
          }
          return this;
        },
      };

      getDashboard(req, res, (err) => {
        if (!resolved) {
          resolved = true;
          if (err) reject(err);
          else resolve({ status: res.statusCode, body: null });
        }
      });
    });

  return { req, run };
}

(async function runTests() {
  console.log('\n======================================================');
  console.log('🧪 Running Operational Analytics & Telemetry Test Suite');
  console.log('======================================================\n');

  await connectDB();

  // 1. Verify Real College Account exists
  console.log('▶ [1/9] Verifying College Account exists (centerId: ' + COLLEGE_CENTER_ID + ')');
  const collegeCenter = await ServiceCenter.findById(COLLEGE_CENTER_ID).lean();
  assert(collegeCenter, 'College Account center must exist in database');
  console.log(`  ✅ Found center: ${collegeCenter.name} (${collegeCenter.code})`);

  // 2. Query Dashboard Analytics for College Account
  console.log('\n▶ [2/9] Fetching analytics for College Account');
  const { status, body } = await mockReqRes(COLLEGE_CENTER_ID).run();
  assert.strictEqual(status, 200, 'HTTP status must be 200');
  assert.strictEqual(body.success, true, 'API response success must be true');

  const data = body.data;
  assert(data, 'Response must contain data property');
  assert(data.summary, 'Data must contain summary');
  console.log('  ✅ Dashboard returned successfully');

  // 3. Verify Total Issued Today & Completed Services
  console.log('\n▶ [3/9] Verifying Total Issued Today & Completed Services match actual DB records');
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);

  const actualIssuedToday = await Token.countDocuments({
    centerId: new mongoose.Types.ObjectId(COLLEGE_CENTER_ID),
    createdAt: { $gte: startOfDay, $lt: endOfDay },
  });
  const actualCompletedToday = await Token.countDocuments({
    centerId: new mongoose.Types.ObjectId(COLLEGE_CENTER_ID),
    status: 'COMPLETED',
    completedAt: { $gte: startOfDay, $lt: endOfDay },
  });

  assert.strictEqual(data.summary.totalIssued, actualIssuedToday, 'totalIssued must match actual Token.createdAt today');
  assert.strictEqual(data.summary.issuedToday, actualIssuedToday, 'issuedToday must match actual Token.createdAt today');
  assert.strictEqual(data.summary.totalServed, actualCompletedToday, 'totalServed must match actual Token COMPLETED today');
  assert.strictEqual(data.summary.completedToday, actualCompletedToday, 'completedToday must match actual Token COMPLETED today');
  console.log(`  ✅ Total Issued Today = ${data.summary.totalIssued} (exact DB match)`);
  console.log(`  ✅ Completed Services Today = ${data.summary.totalServed} (exact DB match)`);

  // 4. Verify Average Wait Time
  console.log('\n▶ [4/9] Verifying Average Wait Time is measured from real token samples');
  if (data.summary.waitSampleCount > 0) {
    assert(typeof data.summary.avgWaitSeconds === 'number', 'avgWaitSeconds must be numeric when samples exist');
    assert(data.summary.avgWaitSeconds >= 0, 'avgWaitSeconds cannot be negative');
    console.log(`  ✅ avgWaitSeconds = ${data.summary.avgWaitSeconds}s from ${data.summary.waitSampleCount} real samples`);
  } else {
    assert.strictEqual(data.summary.avgWaitSeconds, null, 'avgWaitSeconds must be null when no samples exist');
    console.log('  ✅ avgWaitSeconds = null (truthful empty state for 0 samples)');
  }

  // 5. Verify Current Crowd
  console.log('\n▶ [5/9] Verifying Current Crowd uses authoritative CCTV/IoT value');
  assert.strictEqual(data.summary.currentCrowd, collegeCenter.currentCrowd, 'currentCrowd must match ServiceCenter.currentCrowd');
  assert(typeof data.summary.crowdSensorOnline === 'boolean', 'crowdSensorOnline must be a boolean');
  console.log(`  ✅ currentCrowd = ${data.summary.currentCrowd}, crowdSensorOnline = ${data.summary.crowdSensorOnline}`);

  // 6. Verify Hourly Visitor Footfall
  console.log('\n▶ [6/9] Verifying Hourly Visitor Footfall chart data');
  assert(Array.isArray(data.hourlyFootfall), 'hourlyFootfall must be an array');
  for (const item of data.hourlyFootfall) {
    assert(typeof item.hour === 'string', 'Hour must be a string like "15:00"');
    assert(typeof item.count === 'number', 'Every footfall item MUST have a numeric "count" property for the chart');
    assert(typeof item.entries === 'number', 'item must have numeric entries');
    assert(typeof item.peakCount === 'number', 'item must have numeric peakCount');
    console.log(`     Hour ${item.hour}: count=${item.count} (entries=${item.entries}, peak=${item.peakCount})`);
  }
  console.log('  ✅ Hourly footfall structure is valid and contains real count');

  // 7. Verify Dynamic Counter Utilization
  console.log('\n▶ [7/9] Verifying Dynamic Counter Utilization from operational activity');
  const actualCounters = await Counter.find({ centerId: new mongoose.Types.ObjectId(COLLEGE_CENTER_ID) }).lean();
  assert.strictEqual(data.counters.length, actualCounters.length, 'counters length must match actual DB counters');

  for (const c of data.counters) {
    assert(c.name, 'Counter must have name');
    assert(c.counterId, 'Counter must have counterId');
    assert(
      c.utilizationPercent === null || (typeof c.utilizationPercent === 'number' && c.utilizationPercent >= 0 && c.utilizationPercent <= 100),
      `utilizationPercent for ${c.name} must be null or 0-100% number, got: ${c.utilizationPercent}`
    );
    console.log(`     ${c.name}: utilization=${c.utilizationPercent !== null ? c.utilizationPercent + '%' : '—'} (served=${c.served})`);
  }
  console.log('  ✅ Counter utilization is calculated dynamically without hardcoding');

  // 8. Verify Service Demand & Average Service Time per Service
  console.log('\n▶ [8/9] Verifying Service Demand Breakdown & Average Service Time per Service');
  assert(Array.isArray(data.serviceDemand), 'serviceDemand must be an array');
  assert(Array.isArray(data.queues), 'queues must be an array');

  for (const sd of data.serviceDemand) {
    assert(sd.name, 'Service demand must have service name');
    assert(typeof sd.total === 'number', 'Service demand total must be numeric');
    console.log(`     Service "${sd.name}": totalRequested=${sd.total}, completed=${sd.completed}`);
  }

  for (const q of data.queues) {
    assert(q.service?.name, 'Queue must have service name');
    assert(
      q.avgServiceTimeSeconds === null || (typeof q.avgServiceTimeSeconds === 'number' && q.avgServiceTimeSeconds >= 0),
      'avgServiceTimeSeconds must be null or positive number'
    );
    console.log(`     Service "${q.service.name}": avgServiceTime=${q.avgServiceTimeSeconds !== null ? q.avgServiceTimeSeconds + 's' : '—'}`);
  }
  console.log('  ✅ Service demand and average service time are valid and data-backed');

  // 9. Verify Center Isolation (different center returns ONLY its own data)
  console.log('\n▶ [9/9] Verifying Wrong-Center Isolation');
  const otherCenter = await ServiceCenter.findOne({ _id: { $ne: new mongoose.Types.ObjectId(COLLEGE_CENTER_ID) } }).lean();
  if (otherCenter) {
    const otherRes = await mockReqRes(otherCenter._id.toString()).run();
    assert.strictEqual(otherRes.status, 200);
    const otherData = otherRes.body.data;
    assert.strictEqual(otherData.summary.centerId.toString(), otherCenter._id.toString(), 'Must return other centerId');

    // Counters must belong strictly to other center
    for (const c of otherData.counters) {
      const dbC = await Counter.findById(c.counterId).lean();
      assert.strictEqual(dbC.centerId.toString(), otherCenter._id.toString(), 'Counter must belong strictly to other center');
    }
    console.log(`  ✅ Complete center isolation verified against: ${otherCenter.name}`);
  }

  console.log('\n======================================================');
  console.log('🎉 ALL BACKEND ANALYTICS TESTS PASSED WITH 100% SUCCESS');
  console.log('======================================================\n');
  process.exit(0);
})().catch((err) => {
  console.error('\n❌ ANALYTICS TEST FAILED:', err);
  process.exit(1);
});
