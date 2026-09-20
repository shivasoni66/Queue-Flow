# QueueFlow Admin Web Panel

Real-time operations & management panel for the QueueFlow Smart Queue Management System.

Built with **React.js + Vite + Socket.IO Client + Recharts + Axios**.

---

## Features

* **Admin Authentication**: JWT-based role authentication (`ADMIN` and `STAFF`) connected to the backend.
* **Real-time Live Queue**: Synchronized live queue positions, waiting counts, and token status updates via Socket.IO.
* **Counter Management**: Interactive counter cards with Call Next, Start Serving, Complete, Skip, Break/Resume, Close/Open, and Service Reassignment.
* **IoT Live Footfall Sensor**: Live crowd occupancy bar with real-time updates and embedded simulator controls.
* **Live Activity Log**: Audit trail of real operational events (`called`, `serving`, `done`, `break`, `skip`, `waiting`).
* **Standalone Counter Display**: Dedicated fullscreen display board (`/counter/:id`) for counter monitors.
* **Operational Analytics**: Recharts charts for hourly visitor footfall, service demand breakdown, and counter utilization.
* **Alerts & Smart Recommendations**: Real-time evidence-based operational suggestions and bulk broadcast announcements.

---

## Environment Variables

Configure in `.env`:

```env
VITE_API_URL=http://localhost:5000
VITE_SOCKET_URL=http://localhost:5000
```

---

## Development & Build

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Production build
npm run build

# Preview production build
npm run preview
```
