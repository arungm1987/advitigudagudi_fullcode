# Architecture Context Snapshot

## Purpose
This file captures the working context used to build `docs/ARCHITECTURE_DESIGN.md` so future updates can be made quickly and consistently.

## Current System Context
- Project: PhotoShare User Microservice.
- Infrastructure template source: `user-microservice/template.yaml`.
- Runtime flow source: `user-microservice/src/handlers/postConfirmation.ts`.
- Event shape source: `user-microservice/src/lib/buildUserCreatedEvent.ts`.

## Confirmed Components
- Cognito User Pool triggers post-confirmation Lambda.
- Lambda writes profile record to DynamoDB.
- Lambda publishes `USER_CREATED` to custom EventBridge bus.
- Lambda routes DynamoDB/EventBridge write failures to SQS queue.

## Environment Variables Used by Lambda
- `USER_PROFILES_TABLE_NAME`
- `EVENT_BUS_NAME`
- `USER_PROFILE_WRITE_FAILURES_QUEUE_URL`
- `EVENT_SOURCE` (expected: `photoshare.users`)
- `EVENT_DETAIL_TYPE` (expected: `USER_CREATED`)

## Known Failure Reasons (captured to SQS)
- `DynamoDBPutFailed`
- `EventBridgePutFailed`

## Contract Context
- Event name: `USER_CREATED`
- Schema version constant in code: `1.0` (`USER_CREATED_SCHEMA_VERSION`)
- Detail fields: `userId`, `email`, `name`, `createdAt`, optional `schemaVersion`

## Security Context
- Lambda IAM writes are scoped to specific DynamoDB table, EventBridge bus, and SQS queue.
- Cognito invoke permission is constrained by `SourceArn` to the configured user pool.
- Encryption enabled for DynamoDB and SQS in infrastructure template.

## Documentation Notes
- Mermaid sequence must include happy path and DynamoDB failure path to SQS.
- Keep wording simple and professional.
- Avoid using the term prohibited by the plan.

## Added Delivery Artifacts
- `docs/ARCHITECTURE_DESIGN.md`: primary architecture and event contract design document.
- `docs/ARCHITECTURE_INTERVIEW_GUIDE.md`: execution steps, explanation framework, and interview Q&A playbook.

## Execution Context
- Validate docs and Mermaid rendering before demos/reviews.
- Verify implementation parity against `template.yaml` and Lambda handler.
- Run tests before deployment and capture evidence from happy-path and failure-path checks.

## Interview Context
- Lead with system problem and business need.
- Explain component decisions (Cognito, Lambda, DynamoDB, EventBridge, SQS) in flow order.
- Highlight reliability strategy (SQS fallback), least privilege IAM, and contract versioning.

## Backend-First Program Decisions (Confirmed)
- Build sequence: Auth/User hardening -> Photo Service -> Calendar/Meeting Service.
- Service folders will live at repo root:
  - `auth-service`
  - `user-microservice`
  - `photo-service`
  - `calendar-service`
- Dev baseline:
  - Region: `ap-south-1`
  - AWS profile: `arunadminaccess`
  - API usage: API Gateway default invoke URLs in dev
  - Chime: real integration in dev
  - Google OAuth: placeholders for now, real setup later
- CI/CD setup is intentionally deferred until backend scaffolding is complete.
