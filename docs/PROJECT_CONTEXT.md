# Advitigudagudi Project Context

Last updated: 2026-06-02

This file is the durable source of truth for project architecture, implementation order, and agent working rules. Future conversations should read this file before asking the user to repeat project context.

## Project Purpose

Advitigudagudi is an enterprise-grade interview preparation and portfolio platform.

The project is intended to demonstrate production-quality engineering across:

- Frontend architecture
- Microfrontends
- AWS serverless systems
- Authentication
- CI/CD
- Scalable engineering practices

## Documentation Policy

The `docs/` folder has been reviewed and folded into this context file at a durable architecture level.

The intended retained docs are:

- `docs/PROJECT_CONTEXT.md`
- `docs/INTERVIEW_PREPARATION_GUIDE.md`

Older docs that were reviewed before cleanup include:

- `docs/ARCHITECTURE_CONTEXT.md`
- `docs/ARCHITECTURE_DESIGN.md`
- `docs/ARCHITECTURE_INTERVIEW_GUIDE.md`
- `docs/PRODUCTION_IMPLEMENTATION_GUIDE.md`
- `docs/INTERVIEW_PREPARATION_GUIDE.md`
- `docs/QUICK_REFERENCE.md`
- `docs/README.md`
- `docs/Project_Context_Mastery.md`
- Photo service handler reference files
- Calendar service handler/template reference files

Do not treat every older doc as current target architecture. Some docs are historical learning material or production reference blueprints. This file resolves the current interpretation.

After cleanup, deleted docs should not be required for future context. If information is needed later, this file and the interview guide should be treated as the source of truth.

## Repository Boundaries

Approved workspace:

```text
C:\jobhunt_interviewpreparation\April2026\advitigudagudi_full_project\advitigudagudi
```

Agents must treat this repository root as the complete working universe.

Do not read or scan outside this directory. Do not access Desktop, Downloads, Documents, other repositories, user profile folders, system folders, AWS credential files, SSH files, private keys, token files, or secret-bearing files.

Never read or display contents from:

- `.env`
- `.env.*`
- `*.env`
- `.env.local`
- `.env.development`
- `.env.production`
- `.env.staging`
- AWS credential/config files
- SSH files
- Private key or certificate secret files
- Files containing password, secret, token, credential, or private in their names

If a configuration value is required, ask the user to provide it manually instead of reading secret files.

## Current Repository Structure

Observed top-level project areas:

- `shell-app`: Main React host microfrontend.
- `auth-mfe`: Authentication remote microfrontend.
- `auth-service`: AWS SAM authentication backend.
- `user-microservice`: Planned or in-progress user service with Lambda handlers and local server support.
- `sample-mfe`: Sample microfrontend.
- `infrastructure`: CloudFormation/SAM infrastructure templates.
- `docs`: Project documentation.
- `.github/workflows`: Planned or existing CI/CD workflows.
- `PROMPTS`: Service implementation prompts.

Planned service folders from the backend-first roadmap:

- `photo-service`
- `calendar-service`

Reference code for those services previously existed under `docs/` and has been summarized in this file. Real service folders should be created when implementation begins.

## Frontend Architecture

### Shell App

Path: `shell-app`

Current stack:

- React 18
- TypeScript
- Vite
- Module Federation via `@originjs/vite-plugin-federation`
- Redux Toolkit
- RTK Query
- React Redux
- React Router
- Tailwind CSS

Current Vite host configuration:

- Federation name: `shell_app`
- Dev server port: `3000`
- Remote configured:
  - `auth_mfe`: `http://localhost:3001/assets/remoteEntry.js`

Current app entry behavior:

- `shell-app/src/App.tsx` renders `AuthBootstrap`.
- `shell-app/src/routes/index.tsx` currently defines a root route for `HomePage`, but the route tree is not currently mounted by `App.tsx`.
- `shell-app/src/store/index.tsx` currently registers `authApi` only.

### Auth Remote MFE

Path: `auth-mfe`

Current stack:

- React 18
- TypeScript
- Vite
- Module Federation via `@originjs/vite-plugin-federation`
- Redux Toolkit dependencies are present
- Tailwind CSS

Current Vite remote configuration:

- Federation name: `auth_mfe`
- Exposed module: `./AuthApp` from `./src/App.tsx`
- Remote entry filename: `remoteEntry.js`
- Dev and preview port: `3001`
- Shared dependencies: `react`, `react-dom`

## Backend Architecture

### Auth Service

Path: `auth-service`

Current stack:

- AWS SAM
- Node.js Lambda
- TypeScript
- API Gateway
- Cognito
- `aws-jwt-verify`

Current SAM resources include:

- Cognito User Pool
- Google Identity Provider
- Cognito User Pool Client
- Cognito hosted auth domain
- Post Confirmation Lambda
- `GET /auth/me` Lambda

Current `GET /auth/me` behavior:

- Handler: `auth-service/src/handlers/getCurrentUser.ts`
- Calls `authenticateRequest`.
- Returns a JSON profile with `userId`, `email`, `name`, and `roles`.
- Returns 401 for unauthorized requests.

Current middleware behavior:

- `auth-service/src/middleware/authMiddleware.ts` reads an `Authorization` bearer token header.
- Verifies the token with `aws-jwt-verify`.
- Attaches user claims to the event.

Current JWT verifier behavior:

- `auth-service/src/utils/jwtVerifier.ts` reads `COGNITO_USER_POOL_ID` and `COGNITO_APP_CLIENT_ID` from Lambda environment variables.
- Verifies Cognito ID tokens.

Important current-state gap:

- The backend currently expects bearer tokens in request headers.
- The target architecture requires HttpOnly cookie-based sessions.

### User Microservice Architecture

The User Microservice owns profile creation side effects after Cognito confirmation.

Target/event-driven flow from the docs:

```text
Cognito PostConfirmation
  -> User Lambda validates trigger source
  -> DynamoDB stores canonical user profile
  -> EventBridge publishes USER_CREATED
  -> SQS captures DynamoDB/EventBridge failures for replay
```

Confirmed or desired reliability/security patterns:

- Allow only Cognito trigger sources `PostConfirmation_ConfirmSignUp` and `PostConfirmation_ConfirmFederatedIdentity`.
- Return the Cognito event object to avoid blocking signup when downstream persistence fails.
- Capture failed profile writes or event publishes in SQS with structured payloads.
- Use least-privilege IAM scoped to exact DynamoDB table, EventBridge bus, and SQS queue resources.
- Enable DynamoDB encryption and point-in-time recovery where available.
- Use structured JSON logs with fields such as `action`, `requestId`, `userId`, and `durationMs`.

`USER_CREATED` event contract:

- Source currently appears in reference docs as `photoshare.users`.
- Detail type: `USER_CREATED`.
- Schema version: `1.0`.
- Detail fields: `userId`, `email`, display/name field, `createdAt` or timestamp, and optional `schemaVersion`.

Naming note:

- Older docs use `PhotoShareBus` and `photoshare.*` event sources.
- Current product name is Advitigudagudi.
- Treat `PhotoShare` naming as legacy/internal reference naming until a final event naming decision is made.

### User Microservice

Path: `user-microservice`

Observed stack:

- TypeScript
- AWS SDK for DynamoDB
- EventBridge dependency
- Express and CORS for local server support
- esbuild build pipeline

Observed handlers include:

- `postConfirmation`
- `getUser`
- `getUsers`

### Photo Service Target

`photo-service` is planned but not yet present as a root service folder.

Reference docs describe:

- S3 bucket for browser-direct photo uploads.
- Pre-signed URL generation with roughly 15-minute expiry.
- DynamoDB photo metadata table.
- User index table for email-to-userId sharing lookups.
- `PHOTO_SHARED` event publication through EventBridge.
- SQS DLQ for operation failures.
- Idempotency for repeated upload/share requests.

Target photo flow:

```text
Frontend requests upload URL
  -> Lambda validates user and metadata
  -> Lambda creates pre-signed S3 PUT URL
  -> Lambda pre-registers metadata in DynamoDB
  -> Browser uploads directly to S3
```

This pattern is important for interviews because Lambda does not stream file bytes, keeping uploads scalable and low-latency.

### Calendar And Meeting Service Target

`calendar-service` is planned but not yet present as a root service folder.

Reference docs include an AWS Chime SDK design, but the current learning direction is to use free meeting tools such as Google Meet or another no-cost tool for testing and learning before committing to paid/production Chime implementation.

Current intended learning design:

- Store meeting metadata in DynamoDB.
- Resolve attendees by userId or email through a local user index.
- Publish `MEETING_SCHEDULED` through EventBridge.
- Integrate with a free meeting provider or generated meeting link for early testing.
- Keep the Chime SDK reference as an advanced production option, not the immediate implementation target.

If Chime is revisited later, the intended pattern is:

- Create meeting/session metadata when scheduling.
- Create or issue attendee-specific join credentials when the user joins.
- Avoid unnecessary paid/managed meeting resources during early learning and tests.

## Infrastructure

Current frontend infrastructure template:

- Path: `infrastructure/frontend/frontend-hosting.yaml`
- S3 bucket for frontend hosting
- CloudFront distribution
- CloudFront Origin Access Control
- Bucket policy allowing CloudFront access
- SPA fallback for 403 and 404 to `/index.html`

Current higher-level frontend architecture:

```text
Route53
  -> CloudFront
  -> S3
  -> React shell-app
```

Current higher-level backend architecture:

```text
API Gateway
  -> Lambda
  -> DynamoDB
```

Event-driven service backbone:

```text
User Service
  -> EventBridge
  -> Photo Service user index
  -> Calendar Service user index
```

Core domain events from docs:

- `USER_CREATED`
- `PHOTO_SHARED`
- `MEETING_SCHEDULED`

Cross-stack infrastructure pattern from docs:

- Auth stack exports shared values such as Cognito User Pool ARN/ID and EventBridge bus name/ARN.
- User, Photo, and Calendar stacks import those values instead of hardcoding resource names.
- Prefer CloudFormation/SAM exports/imports for production stack wiring.

Authentication provider:

- AWS Cognito User Pool
- Cognito username/password
- Google OAuth federation

Known Cognito values from project brief:

- User Pool: `ap-south-1_r7PXPNSpR`
- Client name: `advitigudagudi-client`
- Client ID: `5pil9de2mf10k7r9clvdovq7s2`

## Environment Strategy

Branch deployment strategy:

```text
development -> https://dev.advitigudagudi.com
main        -> https://app.advitigudagudi.com
```

Current project brief says completed frontend AWS work includes:

- S3 bucket hosting
- CloudFront distribution
- ACM HTTPS certificate
- Route53 custom DNS
- GitHub Actions deployment

Historical learning context:

- `docs/Project_Context_Mastery.md` mentions Docker, ECS, CodePipeline, and an earlier Webpack/sample-MFE direction.
- Treat Docker/ECS/CodePipeline as historical or learning context, not the current target deployment architecture.
- Current target architecture is Vite microfrontends, S3, CloudFront, Route53, SAM/Lambda services, and GitHub Actions.

## Authentication Target Architecture

The project intentionally keeps two authentication approaches as learning material:

1. Bearer JWT with API Gateway Cognito authorizer.
2. Backend token exchange with HttpOnly cookie sessions.

The current preferred implementation target for the frontend shell is the cookie-based enterprise pattern because React should not read or store JWTs.

### Approach A: Bearer JWT And API Gateway Authorizer

This is the pattern described in several older production/interview docs.

Flow:

```text
React obtains Cognito token
  -> sends Authorization: Bearer <jwt>
  -> API Gateway Cognito authorizer validates token
  -> Lambda receives validated claims
```

Strengths:

- Simple for serverless APIs.
- API Gateway rejects invalid tokens before Lambda runs.
- Lambda can read user claims from authorizer context.
- Easy to explain and common in AWS serverless interviews.

Trade-offs:

- Browser must hold a token somewhere, often memory, `localStorage`, or `sessionStorage`.
- `localStorage` and `sessionStorage` increase XSS blast radius.
- More frontend responsibility for auth lifecycle and token refresh.
- Less aligned with the current enterprise security requirement for this app.

Good fit when:

- Building internal tools or prototypes.
- API Gateway authorizer simplicity is more important than browser-token isolation.
- Frontend can safely keep tokens in memory and refresh flows are well controlled.

### Approach B: Backend Token Exchange And HttpOnly Cookies

This is the current preferred target for Advitigudagudi shell authentication.

Security requirement:

Do not store tokens in:

- `localStorage`
- `sessionStorage`
- Redux

Target login flow:

```text
React
  -> redirects to Cognito Hosted UI
  -> user logs in
  -> Cognito redirects to /auth/callback?code=xxx
  -> React sends authorization code only to backend
  -> Lambda exchanges authorization code with Cognito
  -> backend stores tokens as secure cookies
```

Target token storage:

- `access_token`
- `id_token`
- `refresh_token`

Tokens must be stored by the backend as cookies with:

- `HttpOnly=true`
- `Secure=true`
- `SameSite=Lax`

React must not access JWT tokens directly.

Target session bootstrap:

```text
React startup
  -> GET /auth/me
  -> Lambda validates cookie
  -> returns user profile
```

Target logout:

```text
POST /auth/logout
  -> backend clears cookies
```

Strengths:

- Tokens are inaccessible to JavaScript.
- Lower XSS impact because stolen frontend JavaScript cannot directly read tokens.
- Session bootstrap is simple for React: call `/auth/me`.
- Better aligned with enterprise browser security expectations.

Trade-offs:

- Backend must implement authorization-code exchange, cookie setting, refresh, logout, and CSRF-conscious request design.
- API Gateway authorizers may not directly see bearer tokens unless the backend/session layer adapts validation.
- Cross-domain cookie settings require careful `SameSite`, `Secure`, CORS, and custom-domain planning.

Good fit when:

- Building public production apps.
- Prioritizing token confidentiality in the browser.
- The backend can own session lifecycle.

Current decision:

- Learn and be able to explain both approaches.
- Implement the shell-app auth flow using HttpOnly cookie sessions unless the user explicitly chooses the Bearer JWT path for a specific learning task.

## Frontend Auth Requirements

Required pages:

- `LoginPage`
- `AuthCallback`

`LoginPage` responsibilities:

- Show application landing page.
- Redirect user to Cognito Hosted UI.

`AuthCallback` responsibilities:

- Read authorization code from the callback URL.
- Call backend callback endpoint.
- Redirect after success.

Redux auth state may store only:

```ts
{
  authenticated: boolean;
  user: {
    id: string;
    email?: string;
    name?: string;
  };
}
```

Redux must not store tokens.

RTK Query requirement:

- All API calls must use `credentials: "include"`.

Important current-state gap:

- `shell-app/src/services/baseApi.tsx` currently reads `accessToken` from `localStorage` and sends an `Authorization` header.
- `shell-app/src/features/auth/AuthBootstrap.tsx` currently checks `localStorage` before calling `/auth/me`.
- These are known conflicts with the target security architecture and should be addressed in the approved implementation sequence.

## Approved Auth Implementation Order

Follow this order only:

1. Auth environment configuration
2. Login page
3. Auth callback frontend
4. Backend Lambda token exchange
5. Cookie based session
6. `/auth/me` endpoint
7. Redux session bootstrap
8. Protected routes
9. Logout
10. Share authentication across MFEs

## Coding Rules

Before changing application code:

1. Read this `docs/PROJECT_CONTEXT.md` file.
2. Explain planned changes.
3. Wait for approval.
4. Modify the minimum files required.
5. Provide the changed file list.

Default mode is read-only until the user approves edits.

Do not rewrite architecture without approval.

Do not introduce Amplify.

Use existing project direction:

- Cognito
- SAM
- Lambda
- RTK Query
- Module Federation

For auth learning, Amplify may be discussed conceptually only if useful for comparison, but it should not be introduced into this codebase without explicit approval.

## Git Safety

Never automatically:

- Commit
- Push
- Merge branches
- Delete branches
- Rewrite history

Only prepare changes. The user performs Git operations manually.

## Cloud Safety

AWS changes require explicit approval.

Never automatically:

- Delete CloudFormation stacks
- Delete S3 buckets
- Delete DynamoDB tables
- Delete Cognito resources
- Rotate secrets
- Modify IAM permissions

Explain cloud changes before performing them.

## Current Known Gaps And Next Work

The repository already contains early auth plumbing, but it is not yet aligned with the final enterprise cookie-session design.

Known gaps:

- Frontend still references `localStorage` token storage.
- RTK Query base query does not yet use `credentials: "include"`.
- Backend `/auth/me` currently validates bearer auth header instead of secure cookies.
- Auth callback token exchange Lambda is not yet present in the observed SAM template.
- Logout endpoint is not yet present in the observed SAM template.
- Redux auth slice for token-free authenticated user state is not yet present in the observed store.
- Protected routes are not yet implemented.
- Shell app route tree is present but not currently mounted by `App.tsx`.
- Auth sharing across MFEs is not yet implemented.
- User Service should be hardened with trigger-source allowlist, SQS failure capture, structured logs, and cross-stack EventBridge imports.
- Photo Service root folder is not yet implemented.
- Calendar Service root folder is not yet implemented.
- Event naming still uses legacy `photoshare.*` references in docs and needs a final naming decision.

Next implementation should begin with Step 1: Auth environment configuration.
