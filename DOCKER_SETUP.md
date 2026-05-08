# Docker Local Development Setup Guide

This guide explains how to run the entire Advitigudagudi application stack locally using Docker and Docker Compose.

## Prerequisites

- **Docker**: [Install Docker Desktop](https://www.docker.com/products/docker-desktop)
- **Docker Compose**: Comes with Docker Desktop
- **Node.js 22+** (optional, only if you want to run services outside Docker)

## Architecture Overview

The application consists of three main services:

1. **DynamoDB Local**: Local database service
   - Port: `8000`
   - Purpose: Local development database
   - Data persists in named volume `dynamodb-data`

2. **User Microservice**: Backend API
   - Port: `3001` (exposed), `3000` (internal)
   - Technology: Node.js/Express with AWS SDK
   - Endpoints:
     - `GET /users` - Fetch all users from the database
     - `POST /test-registration` - Create a test user
     - `GET /health` - Health check endpoint

3. **Sample MFE**: Frontend React Application
   - Port: `3000`
   - Technology: React + Vite
   - Displays user data fetched from the microservice

## Quick Start

### Step 1: Navigate to the project root

```bash
cd c:\jobhunt_interviewpreparation\April2026\advitigudagudi_full_project\advitigudagudi
```

### Step 2: Start the Docker containers

```bash
docker-compose up -d
```

This will:
- Build and start DynamoDB Local
- Build and start the User Microservice
- Build and start the Sample MFE frontend

### Step 3: Access the application

- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:3001
- **DynamoDB Local Admin**: http://localhost:8000

## Testing the Setup

### Test 1: Check Health Status

```bash
# Test backend health
curl http://localhost:3001/health
```

Expected response:
```json
{
  "status": "healthy",
  "timestamp": "2026-05-07T10:30:00.000Z"
}
```

### Test 2: Create a Test User

```bash
curl -X POST http://localhost:3001/test-registration \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user-123",
    "name": "John Doe",
    "email": "john@example.com",
    "phone": "555-1234"
  }'
```

Expected response:
```json
{
  "message": "User created successfully",
  "user": {
    "userId": "user-123",
    "name": "John Doe",
    "email": "john@example.com",
    "phone": "555-1234",
    "createdAt": "2026-05-07T10:30:00.000Z"
  }
}
```

### Test 3: Fetch All Users

```bash
curl http://localhost:3001/users
```

Expected response:
```json
{
  "users": [
    {
      "userId": "user-123",
      "name": "John Doe",
      "email": "john@example.com",
      "phone": "555-1234",
      "createdAt": "2026-05-07T10:30:00.000Z"
    }
  ],
  "count": 1,
  "message": "Users fetched successfully"
}
```

### Test 4: View Frontend with User Data

1. Open http://localhost:3000 in your browser
2. The frontend should automatically load and display any users from the database
3. You should see the users displayed in card format

## Useful Docker Commands

### View running containers

```bash
docker-compose ps
```

### View logs from all services

```bash
docker-compose logs -f
```

### View logs from a specific service

```bash
# User Microservice logs
docker-compose logs -f user-microservice

# Frontend logs
docker-compose logs -f sample-mfe

# DynamoDB logs
docker-compose logs -f dynamodb-local
```

### Stop all services

```bash
docker-compose down
```

### Stop and remove volumes (clears database)

```bash
docker-compose down -v
```

### Rebuild containers without cache

```bash
docker-compose up -d --build --no-cache
```

### Rebuild a specific service

```bash
docker-compose up -d --build user-microservice
```

## Troubleshooting

### Issue: "Port 3000 is already in use"

**Solution**: Either stop the service using port 3000 or modify the docker-compose.yml to use a different port:

```yaml
services:
  sample-mfe:
    ports:
      - "3010:80"  # Changed from 3000 to 3010
```

Then access frontend at http://localhost:3010

### Issue: "Cannot connect to Docker daemon"

**Solution**: Ensure Docker Desktop is running
- On Windows: Start Docker Desktop from the Start menu
- On Mac: Open Docker.app from Applications

### Issue: "Container failed to start"

**Solution**: Check logs to see what went wrong:

```bash
docker-compose logs user-microservice
```

Common issues:
- Missing npm dependencies: Run `docker-compose up -d --build`
- Port conflicts: Check if ports 3000, 3001, 8000 are available

### Issue: "Database connection errors"

**Solution**: 
1. Ensure DynamoDB Local is running: `docker-compose ps`
2. Verify the healthcheck passed: `docker-compose logs dynamodb-local`
3. Clear volumes and restart: `docker-compose down -v && docker-compose up -d`

## Development Workflow

### Making changes to the backend

The `user-microservice` volume is mounted, so changes to TypeScript files should auto-reload:

```bash
# Changes to local-server.ts will automatically rebuild
# Monitor the logs
docker-compose logs -f user-microservice
```

### Making changes to the frontend

The frontend is built as a static Docker image. To see changes:

```bash
docker-compose up -d --build sample-mfe
```

Or develop locally outside Docker:

```bash
cd sample-mfe
npm install
npm run dev
```

Then point the frontend to the backend:
- Set `VITE_API_BASE_URL=http://localhost:3001` in your environment

## Performance Notes

- **First startup**: May take 2-5 minutes as Docker builds the images
- **Subsequent startups**: Should be faster (10-30 seconds)
- **DynamoDB Local**: Data persists in the `dynamodb-data` volume

## Environment Variables

The services use the following environment variables (defined in docker-compose.yml):

### User Microservice
- `NODE_ENV`: Set to 'development'
- `AWS_REGION`: us-east-1
- `USER_PROFILES_TABLE_NAME`: advitigudagudi-user-service-Profiles
- `DYNAMODB_ENDPOINT`: Points to DynamoDB Local
- `PORT`: 3000

### Sample MFE
- `VITE_API_BASE_URL`: Points to User Microservice (http://user-microservice:3000 internally)

## Next Steps

1. **Create sample data**: Use the test-registration endpoint to create test users
2. **Explore the database**: Use AWS CLI or DynamoDB Local Admin Console
3. **Modify frontend**: Edit files in `sample-mfe/src` to customize the UI
4. **Add more endpoints**: Add handlers to `user-microservice/src/handlers`

## Additional Resources

- [Docker Compose Documentation](https://docs.docker.com/compose/)
- [DynamoDB Local Documentation](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/DynamoDBLocal.html)
- [AWS SDK for JavaScript](https://docs.aws.amazon.com/sdk-for-javascript/)
- [React Documentation](https://react.dev)
