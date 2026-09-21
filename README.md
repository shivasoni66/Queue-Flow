# QueueFlow — Real-Time Smart Queue Management System

QueueFlow is an enterprise-grade, real-time Smart Queue Management System designed to eliminate physical waiting lines, balance service counter workloads, track physical footfall via IoT sensors, and provide live operational analytics.

---

## Architecture Overview

QueueFlow is built as a unified distributed system sharing one central backend and database:

```
                  ┌─────────────────────────────────────┐
                  │    Flutter Customer Mobile App      │
                  │   (Token Booking, Status, Alerts)   │
                  └──────────────────┬──────────────────┘
                                     │ REST / WebSocket
┌──────────────────────────────┐     │     ┌──────────────────────────────┐
│       React Admin Panel      │◄────┼────►│   ESP32 / RFID / IoT Sensors  │
│   (Dashboard, Counters,      │     │     │   (Footfall Entry/Exit Count)│
│    Display Board, Analytics) │     │     └──────────────┬───────────────┘
└──────────────┬───────────────┘     │                    │ IoT Events
               │ REST / WebSocket    │                    │ (x-iot-secret)
               ▼                     ▼                    ▼
     ┌──────────────────────────────────────────────────────────┐
     │       Node.js + Express + Socket.IO Unified Backend       │
     │      (Authentication, Queue Engine, Event Broker)        │
     └────────────────────────────┬─────────────────────────────┘
                                  │
                                  ▼
                     ┌─────────────────────────┐
                     │   MongoDB Atlas Cloud   │
                     │  (Multi-Tenant Data)    │
                     └─────────────────────────┘
```

* **Backend Engine**: Node.js, Express, Socket.IO, Mongoose, JWT.
* **Admin Web Panel**: React.js 18, Vite 6, React Router 7, Socket.IO Client, Recharts, Lucide Icons.
* **Customer Mobile App**: Flutter (Cross-platform iOS & Android).
* **Database**: MongoDB Atlas (Replica Set with atomic increments for queue tokens).
* **Hardware / IoT**: ESP32 with RFID and Infrared/ToF beam sensors for premises occupancy tracking.
* **AI Prediction Service** *(Planned)*: Python, FastAPI, XGBoost for predictive wait-time forecasting.

---

## Repository Structure

```text
QueueFlow/
├── backend/                       # Node.js + Express + Socket.IO Backend
│   ├── src/
│   │   ├── config/                # Database (Mongoose), Socket.IO, CORS configs
│   │   ├── controllers/           # Auth, Queue, Counter, Crowd, Analytics, IoT
│   │   ├── middleware/            # JWT Auth, Role Guard, Error Handler, IoT Auth
│   │   ├── models/                # User, ServiceCenter, Service, Counter, Queue, Token, Footfall
│   │   ├── routes/                # Express API routes
│   │   ├── services/              # Queue, Counter, Socket, Recommendation services
│   │   └── utils/                 # Token generator, async handler, standard API response
│   ├── scripts/                   # Database seed scripts
│   ├── test/                      # Backend smoke tests
│   ├── .env.example               # Backend environment variable template
│   └── package.json
│
├── admin_panel/                   # React.js + Vite Admin & Staff Portal
│   ├── src/
│   │   ├── components/            # Counters, Queue, Dashboard, Common widgets
│   │   ├── context/               # AuthContext, SocketContext
│   │   ├── hooks/                 # useQueue, useCounters, useCrowd, useAnalytics
│   │   ├── pages/                 # Dashboard, CounterDisplay, Analytics, Alerts, Login
│   │   ├── services/              # Axios API client, Socket.IO event listeners
│   │   └── styles/                # Global styles, variables, responsive typography
│   ├── test/                      # End-to-end integration test suite
│   ├── .env.example               # Admin panel environment variable template
│   ├── vite.config.js             # Hardened Vite configuration (localhost bound)
│   └── package.json
│
├── ui_reference/                  # Design assets and visual references
├── .gitignore                     # Root gitignore protecting secrets & build outputs
└── README.md                      # System documentation
```

---

## Local Setup & Development

### 1. Prerequisites

* **Node.js**: v18+ (tested on Node v20 & v24)
* **npm**: v9+
* **MongoDB Atlas** account or a running MongoDB instance

### 2. Backend Setup

1. Navigate to the backend directory:
   ```bash
   cd backend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create your local environment file:
   ```bash
   cp .env.example .env
   ```
4. Configure your `.env` file:
   ```env
   PORT=5000
   NODE_ENV=development
   MONGODB_URI=mongodb+srv://<username>:<password>@<cluster>.mongodb.net/queueflow?retryWrites=true&w=majority
   JWT_SECRET=your_super_secret_jwt_key_minimum_64_characters
   JWT_EXPIRES_IN=7d
   ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000
   IOT_SECRET=your_iot_device_secret_key
   DEV_SIMULATOR_ENABLED=true
   ```
   > **Note**: Ensure your public IP address is allowed in MongoDB Atlas Network Access.

5. Seed initial data:
   ```bash
   npm run seed
   ```
6. Start backend development server:
   ```bash
   npm run dev
   ```
   The backend runs at `http://localhost:5000` (Health check: `http://localhost:5000/health`).

### 3. Admin Web Panel Setup

1. Navigate to the admin panel directory:
   ```bash
   cd admin_panel
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create your local environment file:
   ```bash
   cp .env.example .env
   ```
4. Configure `.env`:
   ```env
   VITE_API_URL=http://localhost:5000
   VITE_SOCKET_URL=http://localhost:5000
   ```
5. Start the frontend development server:
   ```bash
   npm run dev
   ```
   The Admin Panel runs at `http://localhost:5173`.

---

## Testing

### Backend Smoke Tests
Validates Atlas connection, authentication, role authorization, queue token lifecycle (`WAITING` → `CALLED` → `SERVING` → `COMPLETED`), skip workflow, and IoT endpoints:
```bash
cd backend
npm test
```

### Admin Panel Integration Suite
Simulates administrative and counter workflows, Socket.IO event propagation without page reload, live IoT crowd updates, and Counter Display synchronization:
```bash
cd admin_panel
npm test
```

### Production Build Verification
```bash
cd admin_panel
npm run build
```

---

## Security Highlights

* **No Hardcoded Secrets**: Secrets and credentials are exclusively injected via `.env` and kept strictly excluded from git tracking.
* **Development Server Hardening**: Vite dev server is configured to bind strictly to `localhost` (`127.0.0.1`), preventing accidental local-network exposure.
* **Patched Dependencies**: Uses `vite@6.4.3` (`esbuild >= 0.25.0`) and `react-router-dom@7.18.4`, maintaining 0 npm audit vulnerabilities.
* **Role-Based Access Control**: Backend routes are strictly guarded (`ADMIN`, `STAFF`, `CUSTOMER`); client-side routes enforce authentication boundaries.

---

## Deployment Overview

* **Backend**: Containerized or deployed directly on platforms such as Render, Railway, or AWS Elastic Beanstalk.
* **Admin Panel**: Static bundle generated via `npm run build` hosted on Vercel, Netlify, Render Static Sites, or AWS S3/CloudFront.
* **Database**: MongoDB Atlas cloud cluster with automated backups and network IP access rules.

---

## License

ISC License.
