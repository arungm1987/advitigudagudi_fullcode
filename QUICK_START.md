# 🚀 Quick Start Guide

Get your local development environment running in 5 minutes!

## Prerequisites

- ✅ Docker Desktop installed ([Download here](https://www.docker.com/products/docker-desktop))

## 1️⃣ Start the Services (60 seconds)

Open PowerShell in the project root and run:

```powershell
docker-compose up -d
```

Wait 30-60 seconds for services to initialize.

**Or use the setup script:**

```powershell
.\docker-setup.ps1 start
```

## 2️⃣ Verify Everything is Running

```powershell
docker-compose ps
```

You should see 3 containers:
- ✓ dynamodb-local
- ✓ user-microservice
- ✓ sample-mfe

## 3️⃣ Open the Frontend

Visit: **http://localhost:3000**

You should see the "Advitigudagudi - User Directory" page. If no users are shown, that's normal - the database is empty.

## 4️⃣ Create Sample Users

Option A: Using PowerShell script

```powershell
.\docker-setup.ps1 sample
```

Option B: Using curl

```bash
curl -X POST http://localhost:3001/test-registration `
  -H "Content-Type: application/json" `
  -d '{
    "userId": "user-001",
    "name": "Alice Johnson",
    "email": "alice@example.com",
    "phone": "555-0001"
  }'
```

## 5️⃣ View the Data

Refresh http://localhost:3000 - you should now see the users displayed!

## 📊 API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| http://localhost:3001/users | GET | Get all users |
| http://localhost:3001/test-registration | POST | Create a test user |
| http://localhost:3001/health | GET | Check backend health |

## 🛑 Stop Services

```powershell
docker-compose down
```

## 📚 Need More Help?

See [DOCKER_SETUP.md](./DOCKER_SETUP.md) for:
- Detailed architecture
- Troubleshooting
- Development workflow
- Advanced configuration

## 🔧 Useful Commands

```powershell
# See what's running
docker-compose ps

# View logs (all services)
docker-compose logs -f

# View logs (specific service)
docker-compose logs -f user-microservice

# Stop everything
docker-compose down

# Start fresh (remove old data)
docker-compose down -v
docker-compose up -d

# Rebuild containers
docker-compose up -d --build
```

## 🎯 System Architecture

```
┌─────────────────────────────────────────┐
│       http://localhost:3000             │
│    React Frontend (Sample MFE)          │
│  - Displays users from database         │
│  - Fetches from User Microservice       │
└────────────────┬────────────────────────┘
                 │
                 ↓
┌─────────────────────────────────────────┐
│     http://localhost:3001               │
│  User Microservice (Express + Node.js)  │
│  - GET  /users                          │
│  - POST /test-registration              │
│  - GET  /health                         │
└────────────────┬────────────────────────┘
                 │
                 ↓
┌─────────────────────────────────────────┐
│    http://localhost:8000                │
│      DynamoDB Local Database            │
│  - Table: advitigudagudi-user-service   │
└─────────────────────────────────────────┘
```

## ✨ What's Next?

1. **Explore the code**:
   - Frontend: `sample-mfe/src/`
   - Backend: `user-microservice/src/`

2. **Make changes**:
   - Backend changes auto-reload (if using volume mounts)
   - Frontend changes require rebuild

3. **Add more users**:
   - Use the `/test-registration` endpoint
   - Check the `/users` endpoint

4. **Read the docs**:
   - See [DOCKER_SETUP.md](./DOCKER_SETUP.md) for full documentation

---

**That's it!** 🎉 Your local development environment is ready!
