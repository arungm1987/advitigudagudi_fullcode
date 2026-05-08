# Architecture Interview Guide - User Microservice

## 1) Quick 60-Second Pitch

The User Microservice listens to Cognito post-confirmation events and performs two core actions: it stores a canonical user profile in DynamoDB and emits a `USER_CREATED` event to EventBridge for downstream consumers. If persistence or publishing fails, Lambda sends a structured failure record to SQS so operations can replay or remediate without losing events.

## 2) Step-by-Step Execution Plan

1. Confirm docs render:
   - Open `docs/ARCHITECTURE_DESIGN.md`.
   - Validate Mermaid sequence diagram renders in editor.
2. Validate implementation alignment:
   - Check `user-microservice/template.yaml` resources and IAM statements.
   - Check `user-microservice/src/handlers/postConfirmation.ts` flow.
3. Run tests:
   - Execute unit tests in `user-microservice`.
   - Confirm post-confirmation, mapping, and event tests pass.
4. Deploy to a safe environment:
   - Deploy stack parameters for Cognito, Google OAuth, and callback URLs.
5. Verify happy path:
   - Complete user sign-up confirmation.
   - Confirm profile appears in DynamoDB and event is on EventBridge.
6. Verify failure handling:
   - Simulate DynamoDB write failure in non-production.
   - Confirm SQS receives failure message with `DynamoDBPutFailed`.
7. Record evidence:
   - Capture test/deploy notes and queue payload sample for review.

## 3) Clear Architecture Explanation

The design follows an event-driven serverless pattern:
- Cognito is the identity boundary and trigger source.
- Lambda is the orchestration layer for domain logic.
- DynamoDB is the source of truth for user profiles.
- EventBridge is the integration point for asynchronous fan-out.
- SQS is the reliability buffer for failed writes/publishes.

This keeps onboarding responsive while preserving durability and observability in failure scenarios.

## 4) Interview Storyline (Use This Order)

1. Problem statement:
   - "After user confirmation, we need a durable profile plus a domain event for other services."
2. Architecture decision:
   - "We use Lambda to coordinate DDB write and EventBridge publish."
3. Reliability:
   - "Any DynamoDB/EventBridge failure is sent to SQS with reason code and metadata."
4. Security:
   - "IAM permissions are scoped to exact resource ARNs and action-level minimums."
5. Operability:
   - "Structured logs and queue payloads make debugging and replay deterministic."
6. Trade-off:
   - "Event publication can fail after persistence, so consumers rely on replay for eventual completion."

## 5) Mock Interview Q and A

### Q1: Why EventBridge instead of direct Lambda-to-service calls?
Because EventBridge decouples producer and consumers, supports independent scaling, and avoids tight runtime dependencies between services.

### Q2: How do you avoid dropping events during failures?
The Lambda handler catches write/publish exceptions and pushes a structured failure message to SQS, preserving replay context.

### Q3: How is least privilege enforced?
The execution role allows only `dynamodb:PutItem` on the profile table, `events:PutEvents` on the custom bus, and `sqs:SendMessage` on the failure queue.

### Q4: What trust boundaries are in place?
Only Cognito can invoke the function via explicit `lambda:InvokeFunction` permission scoped by the user pool `SourceArn`.

### Q5: How is event contract evolution handled?
The event detail supports `schemaVersion` (current `1.0`) and is documented with JSON Schema to support safe consumer upgrades.

### Q6: What are known risks and mitigations?
Risk: profile persists but event publish fails.  
Mitigation: failure message in SQS enables replay to restore cross-service consistency.

## 6) Whiteboard Template (2 Minutes)

Draw this sequence and narrate:
1. User confirms signup in Cognito.
2. Cognito invokes PostConfirmation Lambda.
3. Lambda maps attributes and writes profile to DynamoDB.
4. Lambda publishes `USER_CREATED` to EventBridge.
5. On failure at step 3 or 4, Lambda sends payload to SQS.

Narration tip: emphasize "durable write first, event fan-out second, queue-based recovery on failure."

## 7) Final Interview Checklist

- I can explain each component role in one line.
- I can walk through happy path and failure path without notes.
- I can justify IAM scope and trust boundaries.
- I can explain event schema and versioning strategy.
- I can discuss one trade-off and one future improvement.
