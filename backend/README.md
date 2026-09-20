# QueueFlow Backend

Real-time Smart Queue Management System — Node.js + Express + Socket.IO + MongoDB Atlas

---

## Architecture

```
Flutter App  ←→  Express REST + Socket.IO  ←→  MongoDB Atlas
React Admin  ←→  Express REST + Socket.IO
ESP32 IoT    →   Express IoT endpoints     →   Socket.IO → All clients
```

## Project Structure

```
backend/
├── server.js                    Entry point
├── .env                         Environment variables (DO NOT COMMIT)
├── .env.example                 Env variable template
├── scripts/
│   └── seed.js                  Database seed
└── src/
    ├── config/
    │   ├── database.js          MongoDB connection
    │   └── socket.js            Socket.IO server + emit helpers
    ├── models/
    │   ├── User.js
    │   ├── ServiceCenter.js
    │   ├── Service.js
    │   ├── Token.js
    │   ├── Queue.js
    │   ├── Counter.js
    │   ├── FootfallEvent.js
    │   ├── QueueEvent.js        Audit log
    │   ├── Notification.js
    │   └── Prediction.js
    ├── middleware/
    │   ├── auth.js              JWT protect + requireRole + iotSecret
    │   └── validate.js          express-validator error handler
    ├── controllers/             Business logic per resource
    ├── services/
    │   ├── queueService.js      Core queue operations
    │   ├── waitTimeService.js   Formula/AI wait estimation
    │   ├── notificationService.js
    │   └── recommendationService.js
    ├── routes/                  Express routers
    └── utils/
        ├── apiResponse.js       Standardized responses
        ├── asyncHandler.js      Async error wrapper
        └── tokenUtils.js        Token code + QR helpers
```

---

## Setup

### 1. Prerequisites

- Node.js 18+
- MongoDB Atlas account (free tier works)
- npm

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env` and replace `MONGODB_URI` with your Atlas connection string:
```
MONGODB_URI=mongodb+srv://<username>:<password>@<cluster>.mongodb.net/queueflow?retryWrites=true&w=majority
```

### 3. Install dependencies

```bash
npm install
```

### 4. Seed the database

```bash
npm run seed
```

This creates:
- Admin user: `admin@queueflow.dev` / `Admin@1234`
- Staff users: `staff1@queueflow.dev`, `staff2@queueflow.dev` / `Staff@1234`
- Customer users: `customer1@example.com`, `customer2@example.com` / `Customer@1234`
- 2 Service Centers (City Hall, State Bank)
- 5 Services per center
- Counters (all start CLOSED — open via admin panel)

To clear and re-seed:
```bash
npm run seed:clear
```

### 5. Start the server

```bash
npm run dev    # development (nodemon)
npm start      # production
```

Server starts on `http://localhost:5000`

---

## REST API Reference

### Health
```
GET /health
```

### Auth
```
POST /api/auth/register     Body: { name, email, password, phone? }
POST /api/auth/login        Body: { email, password }
POST /api/auth/logout       Auth required
GET  /api/auth/me           Auth required
PATCH /api/auth/me          Auth required
```

### Service Centers
```
GET  /api/service-centers              Public
GET  /api/service-centers/:id          Public
POST /api/service-centers              Admin only
PATCH /api/service-centers/:id         Admin only
```

### Services
```
GET  /api/services?centerId=...        Public
GET  /api/services/:id                 Public
POST /api/services                     Admin only
PATCH /api/services/:id                Admin only
```

### Queue (public preview before joining)
```
GET /api/queue/:centerId               Live queue status for all services
GET /api/queue/:centerId/:serviceId    Queue for specific service
GET /api/queue/:centerId/events/recent Admin/Staff only
```

### Tokens (all require auth)
```
POST /api/tokens                Body: { centerId, serviceId, notifyApp?, notifySms? }
GET  /api/tokens/my             Customer's token history
GET  /api/tokens/active         Customer's currently active token
GET  /api/tokens/:id
GET  /api/tokens/:id/qr         QR code image (base64)
POST /api/tokens/:id/cancel
POST /api/tokens/:id/feedback   Body: { rating: 1-5, comment? }
```

### Counters
```
GET  /api/counters?centerId=...        Public
GET  /api/counters/:id                 Public
POST /api/counters                     Admin only
PATCH /api/counters/:id/status         Admin/Staff  Body: { status: ACTIVE|BREAK|CLOSED }
PATCH /api/counters/:id/assign         Admin/Staff  Body: { serviceId }
POST /api/counters/:id/call-next       Admin/Staff
POST /api/counters/:id/complete        Admin/Staff
POST /api/counters/:id/skip            Admin/Staff  Body: { tokenId? }
```

### Crowd
```
GET /api/crowd/:centerId
GET /api/crowd/:centerId/history
```

### Analytics (Admin/Staff)
```
GET /api/analytics/:centerId           Full dashboard data
GET /api/analytics/:centerId/tokens    Time-series token data
```

### Notifications (auth required)
```
GET   /api/notifications
PATCH /api/notifications/read-all
PATCH /api/notifications/:id/read
POST  /api/notifications/broadcast     Admin/Staff
```

### IoT (x-iot-secret header required)
```
POST /api/iot/rfid   Body: { uid, centerId }
POST /api/iot/crowd  Body: { centerId, type: ENTRY|EXIT, sensorId? }
```

### Dev Simulator (development only)
```
POST /api/dev/simulate/crowd       Body: { centerId, type, count? }
POST /api/dev/simulate/rfid        Body: { email, centerId }
POST /api/dev/simulate/reset-crowd Body: { centerId }
```

---

## Socket.IO Events

### Client → Server (room subscriptions)
```
join:center   { centerId }       Join center room
leave:center  { centerId }
join:user     { userId }         Join personal notification room
leave:user    { userId }
join:counter  { centerId, counterId }  Counter display room
```

### Server → Client (events)
```
queue.updated       { centerId, serviceId, waitingCount, totalIssued }
token.created       { token }
token.called        { token, counter }
token.serving       { token }
token.completed     { token, counter }
token.skipped       { token }
token.cancelled     { token }
token.expired       { token }
token.position_updated  { tokenId, currentPosition, waitEstimateMinutes }
counter.updated     { counter, token? }
crowd.updated       { centerId, currentCrowd, crowdPercent, crowdStatus, capacity, event }
notification.created { notification }
```

---

## Role-Based Access

| Role     | Can do                                          |
|----------|-------------------------------------------------|
| CUSTOMER | Register, login, join queue, cancel token, feedback |
| STAFF    | All customer actions + call next, complete, skip, open/close counter |
| ADMIN    | All staff actions + create centers/services/counters, analytics, broadcast |

---

## IoT Integration

### RFID (ESP32 + RC522)
1. Customer taps RFID card on reader
2. ESP32 reads UID, sends `POST /api/iot/rfid` with `x-iot-secret` header
3. Backend looks up user by RFID UID, returns user profile + active token

### Crowd Sensor (ESP32 + IR/ToF)
1. Sensor detects person crossing entry/exit beam
2. ESP32 sends `POST /api/iot/crowd` with `type: ENTRY` or `type: EXIT`
3. Backend atomically increments/decrements `currentCrowd`
4. Socket.IO emits `crowd.updated` to all listeners in that center's room

### Dev Testing (no hardware)
```bash
# Simulate 5 entries
curl -X POST http://localhost:5000/api/dev/simulate/crowd \
  -H "Content-Type: application/json" \
  -d '{"centerId":"<id>","type":"ENTRY","count":5}'
```

---

## Deployment

### Render / Railway
1. Set `NODE_ENV=production`
2. Set all env vars in dashboard
3. Entry point: `node server.js`

### Important
- Never commit `.env`
- Change `JWT_SECRET` to a strong 64+ char random string in production
- Set `DEV_SIMULATOR_ENABLED=false` or omit in production
- Ensure MongoDB Atlas network access allows your server's IP
