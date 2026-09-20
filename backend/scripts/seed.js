'use strict';

/**
 * QueueFlow Database Seed Script
 *
 * Creates realistic initial data for development and demo:
 * - 1 Admin user
 * - 2 Staff users
 * - 3 Customer users (1 with RFID)
 * - 2 Service Centers
 * - Services for each center
 * - Counters for each center
 *
 * Usage:
 *   node scripts/seed.js          # Seed (does not overwrite existing data)
 *   node scripts/seed.js --clear  # Clear all collections first, then seed
 *
 * IMPORTANT: This is SEED data for initial setup only.
 * Production data comes from real operations, not this script.
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const mongoose = require('mongoose');
const User = require('../src/models/User');
const ServiceCenter = require('../src/models/ServiceCenter');
const Service = require('../src/models/Service');
const Counter = require('../src/models/Counter');
const Queue = require('../src/models/Queue');
const { Token } = require('../src/models/Token');
const FootfallEvent = require('../src/models/FootfallEvent');
const QueueEvent = require('../src/models/QueueEvent');
const Notification = require('../src/models/Notification');

const CLEAR_MODE = process.argv.includes('--clear');

async function seed() {
  console.log('\n🌱 QueueFlow Seed Script\n');
  console.log(`   Mode: ${CLEAR_MODE ? 'CLEAR + SEED' : 'SEED ONLY'}`);
  console.log(`   MongoDB: ${process.env.MONGODB_URI ? '[configured]' : '[MISSING — set MONGODB_URI in .env]'}\n`);

  if (!process.env.MONGODB_URI) {
    console.error('❌ MONGODB_URI is not set. Copy .env.example to .env and configure it.');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI, {
    serverSelectionTimeoutMS: 15000,
  });
  console.log('✅ Connected to MongoDB\n');

  if (CLEAR_MODE) {
    console.log('🗑️  Clearing collections...');
    await Promise.all([
      User.deleteMany({}),
      ServiceCenter.deleteMany({}),
      Service.deleteMany({}),
      Counter.deleteMany({}),
      Queue.deleteMany({}),
      Token.deleteMany({}),
      FootfallEvent.deleteMany({}),
      QueueEvent.deleteMany({}),
      Notification.deleteMany({}),
    ]);
    console.log('   Done.\n');
  }

  // ─── Users ────────────────────────────────────────────────────────────────────
  console.log('👤 Creating users...');

  let admin = await User.findOne({ email: 'admin@queueflow.dev' });
  if (!admin) {
    admin = await User.create({
      name: 'Admin User',
      email: 'admin@queueflow.dev',
      passwordHash: await User.hashPassword('Admin@1234'),
      role: 'ADMIN',
      isActive: true,
    });
    console.log('   ✅ Admin: admin@queueflow.dev / Admin@1234');
  } else {
    console.log('   ℹ️  Admin already exists, skipping.');
  }

  let staff1 = await User.findOne({ email: 'staff1@queueflow.dev' });
  if (!staff1) {
    staff1 = await User.create({
      name: 'Priya Sharma',
      email: 'staff1@queueflow.dev',
      passwordHash: await User.hashPassword('Staff@1234'),
      role: 'STAFF',
      isActive: true,
    });
    console.log('   ✅ Staff 1: staff1@queueflow.dev / Staff@1234');
  }

  let staff2 = await User.findOne({ email: 'staff2@queueflow.dev' });
  if (!staff2) {
    staff2 = await User.create({
      name: 'Rahul Verma',
      email: 'staff2@queueflow.dev',
      passwordHash: await User.hashPassword('Staff@1234'),
      role: 'STAFF',
      isActive: true,
    });
    console.log('   ✅ Staff 2: staff2@queueflow.dev / Staff@1234');
  }

  let customer1 = await User.findOne({ email: 'customer1@example.com' });
  if (!customer1) {
    customer1 = await User.create({
      name: 'Amit Patel',
      email: 'customer1@example.com',
      phone: '+919876543210',
      passwordHash: await User.hashPassword('Customer@1234'),
      role: 'CUSTOMER',
      rfidUid: 'RFID001A2B3C',
      isActive: true,
    });
    console.log('   ✅ Customer 1: customer1@example.com / Customer@1234 (RFID: RFID001A2B3C)');
  }

  let customer2 = await User.findOne({ email: 'customer2@example.com' });
  if (!customer2) {
    customer2 = await User.create({
      name: 'Sunita Rao',
      email: 'customer2@example.com',
      phone: '+919876543211',
      passwordHash: await User.hashPassword('Customer@1234'),
      role: 'CUSTOMER',
      isActive: true,
    });
    console.log('   ✅ Customer 2: customer2@example.com / Customer@1234');
  }

  // ─── Service Centers ──────────────────────────────────────────────────────────
  console.log('\n🏢 Creating service centers...');

  let govtOffice = await ServiceCenter.findOne({ code: 'CITYHAL01' });
  if (!govtOffice) {
    govtOffice = await ServiceCenter.create({
      name: 'City Hall — Branch 01',
      code: 'CITYHAL01',
      type: 'GOVT',
      address: { street: '1 Civic Centre Road', city: 'Ahmedabad', state: 'Gujarat', pincode: '380001' },
      phone: '+919012345678',
      email: 'cityhall01@gov.local',
      capacity: 200,
      capacityAlertThreshold: 75,
      isOpen: true,
      currentCrowd: 0,
      noShowTimeoutSeconds: 120,
      operatingHours: [
        { day: 'MON', open: '09:00', close: '17:00' },
        { day: 'TUE', open: '09:00', close: '17:00' },
        { day: 'WED', open: '09:00', close: '17:00' },
        { day: 'THU', open: '09:00', close: '17:00' },
        { day: 'FRI', open: '09:00', close: '17:00' },
        { day: 'SAT', open: '09:00', close: '13:00' },
        { day: 'SUN', isClosed: true },
      ],
    });
    console.log(`   ✅ Service Center: ${govtOffice.name} (ID: ${govtOffice._id})`);
  } else {
    console.log(`   ℹ️  ${govtOffice.name} already exists.`);
  }

  let stateBank = await ServiceCenter.findOne({ code: 'SBANK001' });
  if (!stateBank) {
    stateBank = await ServiceCenter.create({
      name: 'State Bank — Main Branch',
      code: 'SBANK001',
      type: 'BANK',
      address: { street: 'MG Road', city: 'Ahmedabad', state: 'Gujarat', pincode: '380009' },
      phone: '+919012345679',
      email: 'sbank001@bank.local',
      capacity: 150,
      capacityAlertThreshold: 80,
      isOpen: true,
      currentCrowd: 0,
      noShowTimeoutSeconds: 90,
    });
    console.log(`   ✅ Service Center: ${stateBank.name} (ID: ${stateBank._id})`);
  } else {
    console.log(`   ℹ️  ${stateBank.name} already exists.`);
  }

  // ─── Services ─────────────────────────────────────────────────────────────────
  console.log('\n📋 Creating services...');

  const govtServices = [
    { name: 'License Renewal',   tokenPrefix: 'A', avgServiceTimeMinutes: 10, order: 1 },
    { name: 'Certificate',        tokenPrefix: 'B', avgServiceTimeMinutes: 8,  order: 2 },
    { name: 'Tax Payment',        tokenPrefix: 'C', avgServiceTimeMinutes: 6,  order: 3 },
    { name: 'Property Records',   tokenPrefix: 'D', avgServiceTimeMinutes: 12, order: 4 },
    { name: 'Permits',            tokenPrefix: 'E', avgServiceTimeMinutes: 15, order: 5 },
  ];

  const bankServices = [
    { name: 'Account Opening',    tokenPrefix: 'A', avgServiceTimeMinutes: 15, order: 1 },
    { name: 'Cash Deposit',       tokenPrefix: 'B', avgServiceTimeMinutes: 5,  order: 2 },
    { name: 'Loan Enquiry',       tokenPrefix: 'C', avgServiceTimeMinutes: 20, order: 3 },
    { name: 'Cheque Collection',  tokenPrefix: 'D', avgServiceTimeMinutes: 4,  order: 4 },
    { name: 'Forex',              tokenPrefix: 'E', avgServiceTimeMinutes: 10, order: 5 },
  ];

  const createdGovtServices = [];
  for (const svc of govtServices) {
    let existing = await Service.findOne({ centerId: govtOffice._id, tokenPrefix: svc.tokenPrefix });
    if (!existing) {
      existing = await Service.create({ centerId: govtOffice._id, ...svc });
      console.log(`   ✅ [City Hall] ${svc.name} (prefix: ${svc.tokenPrefix})`);
    } else {
      console.log(`   ℹ️  [City Hall] ${svc.name} already exists.`);
    }
    createdGovtServices.push(existing);
  }

  const createdBankServices = [];
  for (const svc of bankServices) {
    let existing = await Service.findOne({ centerId: stateBank._id, tokenPrefix: svc.tokenPrefix });
    if (!existing) {
      existing = await Service.create({ centerId: stateBank._id, ...svc });
      console.log(`   ✅ [State Bank] ${svc.name} (prefix: ${svc.tokenPrefix})`);
    } else {
      console.log(`   ℹ️  [State Bank] ${svc.name} already exists.`);
    }
    createdBankServices.push(existing);
  }

  // ─── Counters ─────────────────────────────────────────────────────────────────
  console.log('\n🏪 Creating counters...');

  const govtCounters = [
    { number: 1, name: 'Counter 01', serviceIdx: 0, status: 'CLOSED', staffId: staff1._id, displayLabel: 'COUNTER 01' },
    { number: 2, name: 'Counter 02', serviceIdx: 1, status: 'CLOSED', staffId: staff2._id, displayLabel: 'COUNTER 02' },
    { number: 3, name: 'Counter 03', serviceIdx: 2, status: 'CLOSED', staffId: null, displayLabel: 'COUNTER 03' },
    { number: 4, name: 'Counter 04', serviceIdx: 3, status: 'CLOSED', staffId: null, displayLabel: 'COUNTER 04' },
  ];

  for (const c of govtCounters) {
    let existing = await Counter.findOne({ centerId: govtOffice._id, number: c.number });
    if (!existing) {
      await Counter.create({
        centerId: govtOffice._id,
        name: c.name,
        number: c.number,
        serviceId: createdGovtServices[c.serviceIdx]._id,
        status: c.status,
        staffId: c.staffId,
        displayLabel: c.displayLabel,
      });
      console.log(`   ✅ [City Hall] ${c.name}`);
    } else {
      console.log(`   ℹ️  [City Hall] ${c.name} already exists.`);
    }
  }

  const bankCounters = [
    { number: 1, name: 'Counter 01', serviceIdx: 0, status: 'CLOSED', displayLabel: 'COUNTER 01' },
    { number: 2, name: 'Counter 02', serviceIdx: 1, status: 'CLOSED', displayLabel: 'COUNTER 02' },
    { number: 3, name: 'Counter 03', serviceIdx: 2, status: 'CLOSED', displayLabel: 'COUNTER 03' },
  ];

  for (const c of bankCounters) {
    let existing = await Counter.findOne({ centerId: stateBank._id, number: c.number });
    if (!existing) {
      await Counter.create({
        centerId: stateBank._id,
        name: c.name,
        number: c.number,
        serviceId: createdBankServices[c.serviceIdx]._id,
        status: c.status,
        displayLabel: c.displayLabel,
      });
      console.log(`   ✅ [State Bank] ${c.name}`);
    } else {
      console.log(`   ℹ️  [State Bank] ${c.name} already exists.`);
    }
  }

  // ─── Summary ──────────────────────────────────────────────────────────────────
  console.log('\n🎉 Seed complete!\n');
  console.log('─────────────────────────────────────────────────────');
  console.log('  CREDENTIALS');
  console.log('─────────────────────────────────────────────────────');
  console.log('  Admin:      admin@queueflow.dev   / Admin@1234');
  console.log('  Staff 1:    staff1@queueflow.dev  / Staff@1234');
  console.log('  Staff 2:    staff2@queueflow.dev  / Staff@1234');
  console.log('  Customer 1: customer1@example.com / Customer@1234  (RFID: RFID001A2B3C)');
  console.log('  Customer 2: customer2@example.com / Customer@1234');
  console.log('─────────────────────────────────────────────────────');
  console.log(`  City Hall ID   : ${govtOffice._id}`);
  console.log(`  State Bank ID  : ${stateBank._id}`);
  console.log('─────────────────────────────────────────────────────');
  console.log('\n  All counters start CLOSED. Open them via admin panel or API.\n');

  await mongoose.disconnect();
  process.exit(0);
}

seed().catch((err) => {
  console.error('\n❌ Seed failed:', err.message);
  console.error(err.stack);
  process.exit(1);
});
