# Advitigudagudi Interview Preparation Guide

Use this guide together with `docs/PROJECT_CONTEXT.md`. It is intentionally self-contained so the rest of the old `docs/` folder can be deleted after this cleanup.

## 30-Second Pitch

Advitigudagudi is an interview preparation and portfolio platform built as a production-style AWS serverless system. The frontend is a React, TypeScript, Vite microfrontend shell deployed through S3, CloudFront, Route53, and GitHub Actions. The backend uses Cognito, API Gateway, Lambda, DynamoDB, EventBridge, SQS failure capture, and SAM. The architecture is designed to demonstrate secure authentication, event-driven service boundaries, scalable uploads, CI/CD, and clear operational practices.

## Current Architecture Story

The platform is split into independently understandable services:

- Auth: Cognito Hosted UI, native username/password, Google federation, and backend session handling.
- User: Cognito PostConfirmation side effects, DynamoDB profile creation, and `USER_CREATED` event publishing.
- Photo: planned service for browser-direct S3 uploads through presigned URLs, photo metadata, and sharing events.
- Calendar: planned service for meeting metadata and learning-friendly free meeting-tool integration.
- Frontend shell: React host microfrontend that coordinates auth state, protected routes, and remote MFEs.

The system uses EventBridge as the asynchronous backbone. User Service publishes `USER_CREATED`; Photo and Calendar services can subscribe and build local user indexes for email-to-userId lookups. Failures are captured through SQS so operational recovery is possible without losing important events.

## Authentication: Explain Both Patterns

### Pattern 1: Bearer JWT With API Gateway Authorizer

Flow:

```text
React obtains Cognito token
  -> sends Authorization: Bearer <jwt>
  -> API Gateway Cognito authorizer validates token
  -> Lambda receives trusted claims
```

How to explain it:

"This is a common AWS serverless pattern. API Gateway validates the Cognito JWT before Lambda runs, so invalid or expired tokens are rejected early. Lambda gets claims like `sub` and `email` from the authorizer context."

Strengths:

- Simple and native to API Gateway.
- Lambda does not need to verify JWTs manually.
- Easy to secure APIs quickly.
- Good for prototypes, internal tools, and learning API Gateway authorizers.

Trade-offs:

- The browser must hold a token in memory or storage.
- `localStorage` and `sessionStorage` increase XSS risk.
- The frontend owns more of the token refresh/session lifecycle.

### Pattern 2: Backend Token Exchange With HttpOnly Cookies

Flow:

```text
React redirects to Cognito Hosted UI
  -> Cognito redirects back with authorization code
  -> React sends only the code to backend
  -> Lambda exchanges code with Cognito
  -> backend stores tokens in HttpOnly Secure SameSite cookies
  -> React calls /auth/me with credentials included
```

How to explain it:

"This is the preferred enterprise pattern for this app. React never reads JWTs. The backend owns token exchange, refresh, and logout. The frontend only asks `/auth/me` whether a session exists."

Strengths:

- Tokens are inaccessible to JavaScript.
- Lower impact from XSS because tokens cannot be read directly.
- Frontend auth state stays simple: authenticated user profile only.
- Better for public production apps.

Trade-offs:

- Backend must implement callback exchange, cookies, refresh, logout, and CSRF-aware behavior.
- Cross-domain cookies need careful `SameSite`, `Secure`, CORS, and custom-domain setup.
- API Gateway authorizer integration may require adapting cookie validation into the backend/session layer.

Best interview answer:

"I can explain both. For learning API Gateway security, Bearer JWT authorizers are excellent. For this app's preferred production frontend architecture, I would use backend token exchange and HttpOnly cookies so React never stores tokens."

## User Microservice Talking Points

Flow:

```text
Cognito PostConfirmation
  -> Lambda validates triggerSource
  -> DynamoDB stores profile
  -> EventBridge publishes USER_CREATED
  -> SQS captures failures
```

Key points:

- Cognito remains the identity authority.
- DynamoDB stores a minimal user profile for app query patterns.
- `USER_CREATED` lets downstream services react without direct service calls.
- The Lambda should allow only `PostConfirmation_ConfirmSignUp` and `PostConfirmation_ConfirmFederatedIdentity`.
- If DynamoDB or EventBridge fails, capture the failure to SQS and return the event to Cognito so signup is not blocked.

Strong answer:

"I do not want profile creation failure to block account confirmation. The user should complete signup, while the failed profile write or event publish is captured to SQS for replay."

## EventBridge And Service Decoupling

How to explain:

"Services do not call each other directly for lifecycle events. They publish domain events. New services can subscribe without changing the producer."

Example:

```text
User Service publishes USER_CREATED
  -> Photo Service syncs local user index
  -> Calendar Service syncs local user index
```

Benefits:

- Independent deployment.
- Better resilience when a downstream service is unavailable.
- Easier expansion to new services.
- Clear event contracts with schema versions.

Important distinction:

"EventBridge is an event bus, not a FIFO queue. It is best for routing events to subscribers, while SQS is better for buffering, retry, and replay workflows."

## Photo Service Talking Points

Target upload flow:

```text
Frontend requests presigned URL
  -> Lambda validates metadata
  -> Lambda creates S3 PUT URL
  -> Lambda writes pending metadata to DynamoDB
  -> Browser uploads directly to S3
```

Why this matters:

- Lambda does not stream file bytes.
- S3 handles high-concurrency uploads.
- Presigned URLs are time-limited.
- Metadata can be tracked before upload completes.

Strong answer:

"Presigned URLs keep Lambda stateless and fast. Lambda generates the upload permission, then the browser uploads directly to S3. That avoids tying up Lambda memory and duration for large files."

## Calendar And Meeting Talking Points

Current learning path:

- Store meeting metadata in DynamoDB.
- Resolve invited users by userId or email.
- Publish `MEETING_SCHEDULED` through EventBridge.
- Use a free meeting tool such as Google Meet or another no-cost provider for testing and learning.

How to explain Chime:

"Chime SDK is a production-grade option if we later want AWS-native meeting infrastructure. For learning and cost control, I would first integrate a free meeting-link workflow, then compare what Chime gives us: attendee tokens, media control, and AWS-native observability."

Practical answer:

"For the current project phase, I would not spend money on meeting infrastructure just to prove the calendar workflow. I would store meeting metadata and attach a free meeting link. Later, Chime can replace that link-generation layer if production requirements demand it."

## Failure Handling And Observability

Patterns to mention:

- SQS DLQ or failure queue for Lambda processing failures.
- Structured JSON logs with `action`, `requestId`, `userId`, and `durationMs`.
- CloudWatch alarms for Lambda errors and DLQ message count.
- Least-privilege IAM per Lambda.
- DynamoDB point-in-time recovery for important tables.

Strong answer:

"Failures should be captured, not hidden. A signup, upload, or meeting workflow can fail downstream, but the system should produce structured logs and queue messages so we can diagnose and replay safely."

## Scaling Talking Points

Lambda:

- Scales by concurrency.
- Reserved concurrency can protect critical functions.
- Keep functions stateless.

DynamoDB:

- On-demand mode supports unpredictable learning/project traffic.
- Design keys around access patterns.
- Avoid hot partitions for high-volume entities.

S3:

- Browser-direct upload scales far better than proxying files through Lambda.
- Use versioning, encryption, lifecycle rules, and CloudFront where appropriate.

EventBridge:

- Lets services add subscribers without changing producers.
- Combine with SQS for retry/replay where needed.

## Security Talking Points

Authentication:

- Cognito is the identity provider.
- Hosted UI avoids custom password handling.
- Google federation and native login flow into the same user pool.

Token handling:

- Never store tokens in Redux.
- Avoid `localStorage` and `sessionStorage` for production token storage.
- Prefer HttpOnly cookies for this app's implementation target.

IAM:

- Each Lambda should have only the actions and resources it needs.
- Avoid broad permissions such as `dynamodb:*`, `events:*`, or `s3:*`.

Secrets:

- Do not commit OAuth secrets, AWS credentials, private keys, or token files.
- Use Secrets Manager or manually provided configuration values.

## Common Interview Questions

### Why replicate user profile data to DynamoDB if Cognito has users?

Cognito is authoritative for identity and credentials, but DynamoDB is better for app profile query patterns, service autonomy, and local indexes. We store only minimal profile data such as `userId`, `email`, and display name. Passwords and token generation stay in Cognito.

### What happens if DynamoDB fails during PostConfirmation?

The Lambda catches the failure, sends a structured message to SQS, and returns the Cognito event so signup is not blocked. Operations can replay the queue message after the root cause is fixed.

### Why EventBridge instead of direct Lambda calls?

Direct calls couple services at runtime. EventBridge lets User Service publish `USER_CREATED` without knowing which services subscribe. Photo, Calendar, or future services can react independently.

### Why not use Amplify?

Amplify is useful for fast prototypes and can be discussed conceptually, but this project intentionally demonstrates direct Cognito, SAM, Lambda, RTK Query, and Module Federation architecture. Introducing Amplify would hide some of the architecture this project is meant to teach.

### What is the optimal auth solution?

It depends. Bearer JWT with API Gateway authorizers is simple and AWS-native. HttpOnly cookie sessions are better when browser token confidentiality matters. For Advitigudagudi's current production-style frontend, the preferred solution is backend token exchange with HttpOnly cookies.

## Final Talking Points

- "I can explain both Bearer JWT authorizers and HttpOnly cookie sessions, including when each is appropriate."
- "Cognito is the identity authority; DynamoDB stores app-specific profile data."
- "EventBridge decouples services through domain events like `USER_CREATED`."
- "SQS failure capture lets us recover without losing operational context."
- "Presigned URLs make uploads scalable because the browser sends files directly to S3."
- "The current calendar path uses free meeting links for learning, with Chime as a future production option."
- "The current deployment target is Vite microfrontends on S3/CloudFront plus SAM-based serverless services."
