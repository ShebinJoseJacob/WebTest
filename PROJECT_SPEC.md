# 📋 Full-Stack IoT Worker Monitoring Platform

## 🚀 Project Overview

We are building an **IoT-based worker monitoring system**.  
Each device will collect the following data:

- Heart rate  
- SpO2  
- Body temperature  
- GPS location  
- Fall detection alerts  
- Biomarker abnormality alerts  
- First signal of the day (for attendance tracking)  

Your task is to **design, build, and deliver** the **complete full-stack solution** — backend, frontend, database, real-time updates, and deployment — with production-level code and documentation.

---

## 👤 User Roles & Access Rules

### 1. Employee
- **Can ONLY view:**
  - Check-in and Check-out time (based on first/last biometric reading of the day)
  - Personal biometric variation graphs (heart rate, SpO2, temperature) throughout the day
  - Personal alerts and incidents (e.g., falls, abnormal vitals)
- **Cannot view:**
  - Other employees or devices
  - System-wide statistics

### 2. Supervisor
- **Full visibility** of all employees.
- **Overview Tab** (modern, mobile-friendly):
  - Real-time vitals in a grid/table format
  - Status badges: OK, Warning, Critical
  - Live data pulse indicator
  - Count of alerts (hourly/daily)
  - Attendance summary
  - Filters: critical only, by department, by location
- **Map Tab**:
  - Real-time GPS tracking (Leaflet.js / Mapbox)
  - Click employee marker → modal with name, last vitals, location accuracy, last signal time
- **Alerts Tab**:
  - Real-time list of alerts
  - **Critical alerts** trigger:
    - Audio notification
    - Flashing alert in UI until acknowledged

---

## 🖥️ Frontend

- Framework: **React.js** (or propose a better modern stack)
- Fully **responsive** for desktop and mobile
- **Employee Dashboard**:
  - Personal vitals graphs (line charts with timestamps)
  - Alerts & incident logs
  - Attendance history
- **Supervisor Dashboard**:
  - Modern overview tab
  - Real-time map tracking
  - Alerts with sound notifications
- **Authentication**: JWT-based login

---

## ⚙️ Backend

- Framework: **Node.js + Express.js** (or better suggestion)
- Database: **PostgreSQL** or **MongoDB** (justify choice)
- Features:
  - API for IoT device data ingestion
  - Role-based access control (RBAC)
  - Attendance tracking logic
  - Real-time data via **WebSockets / Socket.io**
  - Alert triggering & logging
- API Endpoints:
  - `POST /api/data` → Ingest device data
  - `GET /api/vitals` → Retrieve live/historical vitals
  - `GET /api/alerts` → Fetch alerts
  - `GET /api/location` → Get real-time coordinates
  - `POST /api/acknowledge-alert` → Acknowledge/silence alert

---

## 🗄️ Database Schema (Example for PostgreSQL)

**Tables:**
- `users` (id, name, role, email, password_hash)
- `devices` (id, user_id, device_serial)
- `vitals` (id, device_id, heart_rate, spo2, temperature, timestamp)
- `alerts` (id, device_id, type, severity, timestamp, acknowledged)
- `attendance` (id, user_id, date, check_in_time, check_out_time)

---

## 📦 Deployment (Render.com)

### 1️⃣ Prepare the Project
- Create separate folders: `/frontend` and `/backend`
- Ensure **backend** runs on `PORT` from env variables
- Ensure **frontend** build can be served by Render static site hosting

### 2️⃣ Environment Variables
Create a `.env` file in backend with:
``
PORT=5000
DATABASE_URL=postgresql://user:pass@host:port/dbname
JWT_SECRET=your_secret
MAPBOX_API_KEY=your_mapbox_key
``

### 3️⃣ Deploy Backend to Render
- Go to [Render.com](https://render.com)
- Create **New Web Service**
- Connect GitHub repo
- Set **Environment**: `Node`
- Build Command: `npm install`
- Start Command:  `npm start`
- Add `.env` variables in Render dashboard
- Click **Deploy**

### 4️⃣ Deploy Database to Render
- Go to **New Database**
- Choose **PostgreSQL**
- Copy connection string → set in backend `.env`

### 5️⃣ Deploy Frontend to Render
- Create **New Static Site**
- Connect repo
- Build Command:  `npm install && npm run build`
- Publish directory: `build`
- Set `REACT_APP_API_URL` in environment variables to backend Render URL

---

## 📜 Deliverables

1. Complete source code:
 - `/frontend` (React UI)
 - `/backend` (API + WebSocket server)
 - `/database` (schema, migrations, seeds)
 - `/docker` (optional for local dev)
 - `.env.sample`
2. Mock IoT data ingestion script for local testing
3. Unit & integration tests
4. **Step-by-step README** for:
 - Local setup
 - Render deployment
 - API documentation

---

## 🔑 Key Notes

- Prioritize **scalability**, **security**, and **low latency**.
- Enforce strict RBAC in backend.
- Maintain **modern UI/UX** with responsive design.
- Critical alerts must:
- Trigger **sound**
- Show visual indication until acknowledged

---


