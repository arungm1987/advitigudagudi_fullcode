# Advitigudagudi — Frontend + Backend Portfolio Architecture

## Vision

Build a production-style, event-driven microservices platform that demonstrates:

- Frontend Microfrontend Architecture (MFE)
- Backend Serverless Microservices
- AWS Cloud Architecture
- Authentication & Authorization
- CI/CD Pipelines
- Event-Driven Systems
- Scalable Frontend + Backend Design
- Cost Optimization Decisions

This project should feel like a real enterprise platform rather than a tutorial application.

---

# Final Target Architecture

## Frontend (Microfrontends)

```text
CloudFront
   ↓
Shell App (Host)
   ↓ dynamically loads
--------------------------------
| Auth MFE                     |
| Photo MFE                    |
| Calendar MFE                 |
| Future Services              |
--------------------------------
```

### Frontend Tech Stack

- React 19
- TypeScript
- Vite
- Module Federation
- RTK Query
- Tailwind CSS
- React Router
- Cognito Hosted UI
- JWT-based authentication

### Frontend Hosting

| App | Hosting |
|---|---|
| shell-app | S3 + CloudFront |
| auth-mfe | S3 + CloudFront |
| photo-mfe | S3 + CloudFront |
| calendar-mfe | S3 + CloudFront |

### Why This Architecture

- Independent deployments
- CDN scalability
- Very low cost
- Production-grade architecture
- Great for architect interviews

---

# Backend Architecture

## Services

### 1. Auth Service ✅

Already deployed.

Responsibilities:
- Cognito
- Google OAuth
- JWT authentication
- User signup events
- EventBridge integration

Tech:
- AWS SAM
- Lambda
- Cognito
- EventBridge
- DynamoDB
- SQS DLQ

---

### 2. User Service

Responsibilities:
- User profile APIs
- Search users
- User metadata
- User subscriptions

Endpoints:

```text
GET /me
GET /users
GET /users/search
```

---

### 3. Photo Service

Responsibilities:
- Presigned S3 uploads
- Photo sharing
- Metadata storage
- Shared photo access

Endpoints:

```text
POST /photos/presigned-url
POST /photos
POST /photos/{id}/share
GET /photos
```

---

### 4. Calendar Service

Responsibilities:
- Events
- Shared calendars
- Notifications
- Scheduling

---

# Backend Tech Stack

- Node.js 20
- TypeScript
- AWS SAM
- Lambda
- API Gateway
- DynamoDB
- EventBridge
- SQS
- Cognito
- CloudWatch
- X-Ray

---

# Deployment Architecture

## Frontend CI/CD

```text
GitHub Actions
    ↓
Build React/Vite
    ↓
Upload to S3
    ↓
Invalidate CloudFront
```

## Backend CI/CD

```text
GitHub Actions
    ↓
SAM Build
    ↓
SAM Deploy
    ↓
CloudFormation
```

---

# Portfolio Strengths

This project demonstrates:

## Frontend Skills

- React architecture
- Microfrontends
- Module Federation
- State management
- API integration
- Auth flows
- Deployment strategy
- Performance optimization

## Backend Skills

- Serverless architecture
- Event-driven systems
- Distributed systems
- OAuth/Auth
- API Gateway
- DynamoDB design
- Async messaging
- Observability
- DLQ patterns

## Cloud Skills

- AWS architecture
- IAM
- Infrastructure as Code
- CI/CD pipelines
- CDN hosting
- Cost optimization
- Monitoring

---

# Recommended Frontend Build Order

## Phase 1 — Foundation

### shell-app

Responsibilities:
- Layout
- Navigation
- Auth state
- Route orchestration
- Remote module loading

Pages:
- Login
- Dashboard
- Profile

---

## Phase 2 — Auth MFE

Responsibilities:
- Login flow
- Logout flow
- Token management
- Session management
- Cognito integration

Features:
- Google Login
- Hosted UI redirect
- JWT storage
- Refresh handling

---

## Phase 3 — User Service Integration

Features:
- Current user profile
- User search
- Shared user listing

---

## Phase 4 — Photo MFE

Features:
- Upload photos
- Presigned URL flow
- Share photos
- List shared photos

---

## Phase 5 — Calendar MFE

Features:
- Event creation
- Shared events
- Notifications

---

# Immediate Next Step

Build:

```text
shell-app
```

with:

- Vite
- React
- Module Federation host
- Tailwind
- React Router
- Cognito auth integration

Then integrate:

```text
auth-mfe
```

for login/logout flows.

---

# Interview Positioning

This platform should be explained as:

> A production-style event-driven microservices platform using serverless AWS architecture and independently deployable microfrontends.

Key architectural decisions:

- S3 + CloudFront for static frontend hosting
- Lambda for cost-efficient backend scaling
- EventBridge for service decoupling
- Cognito Hosted UI for OAuth federation
- Independent CI/CD pipelines for each service
- Module Federation for frontend scalability

---

# Goal

By the end, this should become:

- Portfolio project
- System design discussion project
- Full-stack architect showcase
- AWS architecture showcase
- Microfrontend reference implementation
- Interview storytelling platform

