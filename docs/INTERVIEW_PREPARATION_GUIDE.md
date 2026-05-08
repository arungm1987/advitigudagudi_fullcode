# Senior Architect Interview Preparation Guide
## Advitigudagudi: Production-Grade AWS Serverless Microservices

---

## Part 1: 30-Second Elevator Pitch

**"Advitigudagudi is a production-grade serverless microservices platform on AWS. Four independently deployable services: Auth (Cognito + PostConfirmation Lambda), User (DynamoDB + EventBridge), Photo Sharing (S3 presigned URLs + metadata indexing), and Calendar (Chime SDK integration). All services communicate asynchronously through EventBridge, validate JWTs at the API Gateway authorizer layer, and implement consistent error handling with SQS DLQ capture for resilience. The entire system is infrastructure-as-code using AWS SAM, deployed on arm64 Graviton Lambda for 19% better price-performance."**

---

## Part 2: Core Architecture Questions & Answers

### Q1: "Walk me through your authentication flow. How do native and Google OAuth work?"

**Answer (Production-grade response):**

"Cognito User Pool is the single source of truth for identity. Both native email/password and Google OAuth flow through the same Cognito Hosted UI — the frontend never touches authentication logic directly.

**Native flow:**
1. User enters email and password on Cognito Hosted UI
2. Cognito sends an email verification code
3. User verifies the code (PostConfirmation_ConfirmSignUp triggerSource)
4. PostConfirmation Lambda fires, reads userAttributes, creates DynamoDB profile, publishes USER_CREATED event

**Google OAuth flow:**
1. User clicks 'Sign in with Google' on Cognito Hosted UI
2. Cognito federates with Google Identity Provider
3. User authenticates with Google
4. Google returns ID token to Cognito
5. Cognito auto-confirms the account (PostConfirmation_ConfirmFederatedIdentity triggerSource)
6. Same PostConfirmation Lambda fires with identical downstream actions

**Key design decisions:**
- Single Cognito User Pool for both flows eliminates duplicate login logic
- PostConfirmation has an allowlist guard checking triggerSource — we only process ConfirmSignUp and ConfirmFederatedIdentity, rejecting unknown sources
- Name fallback chain: explicit name field → given_name + family_name concatenated → email local-part. This handles Google users who might not have a full name
- Token lifetimes: 60-minute access/ID tokens, 30-day refresh tokens
- PreventUserExistenceErrors enabled so login form never leaks whether an email is registered"

---

### Q2: "How do you handle service-to-service communication without tight coupling?"

**Answer:**

"EventBridge is our backbone. Instead of services calling each other directly, we publish domain events.

**Example: Photo Service needs to know about new users**
1. User Service publishes USER_CREATED event to EventBridge custom bus with source='photoshare.users', detailType='USER_CREATED', and a structured payload with userId, email, displayName, timestamp, schemaVersion
2. Photo Service has an EventBridge rule subscribed to that event pattern
3. When USER_CREATED fires, EventBridge invokes a Lambda (syncUserIndex) that writes the user to Photo Service's local user index table
4. Photo Service now has the user available for email-to-userId lookups on photo sharing operations

**Why this pattern?**
- **Decoupling:** Photo Service doesn't know User Service exists. They interact only through events
- **Resilience:** If Photo Service is down, User Service still completes. When Photo Service comes back online, it catches up (though we'd need a replay mechanism for historical events)
- **Scalability:** New services can subscribe to the same event without modifying User Service
- **Observability:** Every event has a schemaVersion (e.g., USER_CREATED v1.0). If we need to evolve the event schema, we bump the version and handle both old and new formats

**SQS DLQ pattern:** If a Lambda fails to process an event, EventBridge retries with exponential backoff, then sends to a DLQ. We monitor the DLQ and replay messages when the service recovers."

---

### Q3: "How do you handle photo uploads from the browser?"

**Answer:**

"Direct S3 uploads using presigned URLs. This is critical for performance and scalability.

**Traditional approach (❌ slow, unscalable):**
1. Browser sends file to Lambda
2. Lambda streams file to S3
3. Lambda is blocked during upload
4. Expensive memory/time on Lambda

**Our approach (✓ fast, scalable):**
1. Browser calls /v1/photos/presigned-url with metadata (title, description, contentType)
2. Lambda generates photoId (UUID), creates S3 PutObjectCommand with Metadata headers (photoId, userId), generates presigned URL (15-minute expiry)
3. Lambda pre-registers photoId in DynamoDB with status=PENDING_UPLOAD and a 24-hour expiration
4. Lambda returns presignedUrl to browser
5. Browser signs directly with S3 using the presigned URL
6. S3 stores object with metadata headers
7. Browser calls /v1/photos/{photoId}/finalize to mark status=CONFIRMED (optional, or auto-confirm on S3 upload completion via S3 events)

**Benefits:**
- Lambda is stateless and fast (just DynamoDB write + presigned URL generation)
- Presigned URLs are time-bound (15 minutes)
- If browser disconnects mid-upload, S3 cleans up (we set an abort lifecycle rule)
- Pre-registration in DynamoDB means we already have the metadata, just waiting for file confirmation
- Browser sees instant feedback (presigned URL generated in <200ms)
- We can scale to millions of concurrent uploads without scaling Lambda"

---

### Q4: "How does your Calendar + Chime integration work?"

**Answer:**

"Deferred Chime session creation pattern — we create the meeting metadata in DynamoDB immediately, but only invoke Chime SDK when a user actually joins.

**createMeeting flow:**
1. Frontend: POST /v1/meetings with title, scheduledTime, attendeeUserIds/emails
2. Lambda validates future scheduledTime, resolves emails to userIds via user index table
3. Lambda calls Chime SDK: CreateMeeting (creates a Chime meeting session)
4. Lambda stores meeting metadata in DynamoDB: meetingId, chimeMeetingId, attendees, status=SCHEDULED
5. Lambda emits MEETING_SCHEDULED event to EventBridge
6. Lambda returns meetingId and chimeMeetingId to frontend
7. Frontend stores these and shares with attendees

**joinMeeting flow:**
1. Frontend: POST /v1/meetings/{meetingId}/join (with JWT)
2. Lambda fetches meeting metadata, verifies user is organizer or attendee
3. Lambda calls Chime SDK: CreateAttendee (generates unique attendeeId and joinToken for this user)
4. Lambda returns joinToken and attendeeId to frontend
5. Frontend uses Chime SDK JavaScript client to initialize meeting with the joinToken
6. Browser connects directly to Chime media infrastructure

**Why deferred attendee creation?**
- Avoids creating Chime attendee objects for users who never show up
- Keeps createMeeting fast (just metadata, no Chime call)
- Users who are invited see meeting details before joining
- If user drops and rejoins, we can regenerate a token (idempotent)

**Why Chime SDK matters:**
- Avoids streaming audio/video through our Lambda
- Chime has SFU (Selective Forwarding Unit) architecture — only sends streams you're actually watching
- Chime handles encryption, NAT traversal, codec negotiation
- We just orchestrate: create meeting, generate tokens, track who's in the room"

---

### Q5: "How do you ensure data consistency and handle failures?"

**Answer:**

"Multi-layered approach:

**1. Idempotency:**
- Every write uses DynamoDB PutCommand or UpdateCommand with appropriate conditions
- Pre-signed URL generation: if request repeats with same idempotencyKey, we hash it to the same photoId and return the same presigned URL
- Sharing a photo with the same user twice uses a Set to deduplicate

**2. DLQ Capture:**
- PostConfirmation failures: captured to SQS queue with 14-day retention. Message includes userId, email, triggerSource, error details
- Photo/Calendar operation failures: same pattern
- Operators monitor DLQ and manually replay messages when root cause is fixed

**3. Event Sourcing via EventBridge:**
- Every significant state change is published as an event (USER_CREATED, PHOTO_SHARED, MEETING_SCHEDULED)
- Events have schemaVersion. If schema evolves, we can handle both old and new
- Events are queryable in CloudWatch Logs

**4. DynamoDB Streams (not currently used but ready):**
- Tables have StreamSpecification: NEW_AND_OLD_IMAGES
- If we need to replicate data elsewhere (Elasticsearch, Analytics), we can subscribe to streams

**5. JWT Validation at Gateway:**
- API Gateway authorizer validates JWT signature against Cognito User Pool public keys
- No need to validate in Lambda — claims are pre-validated
- If token is expired or forged, request never reaches Lambda (saves cold start)

**6. Structured Logging:**
- Every Lambda logs JSON with consistent fields: action, requestId, userId, service, durationMs
- CloudWatch Logs Insights queries: `fields @timestamp, action, durationMs | stats avg(durationMs) by action`
- X-Ray tracing enabled — can see latency breakdown across AWS services"

---

### Q6: "How do you scale this architecture?"

**Answer:**

"Serverless-first means scaling is mostly automatic.

**Lambda:**
- AWS manages concurrency. Each account gets 1000 concurrent executions (soft limit, easily increased)
- On production, we'd set reserved concurrency per function to guarantee minimum throughput
- Arm64 Graviton processors cost 20% less than x86

**DynamoDB:**
- Pay-per-request billing means no provisioning
- Scales to millions of read/write units automatically
- If we had hot keys (e.g., a celebrity's photos), we'd partition by userId prefix
- Point-in-time recovery enabled for disaster recovery

**S3:**
- Request rate: 3,500 PUT/DELETE per second per partition key (photoId prefix)
- We partition by userId: s3://bucket/photos/{userId}/{photoId}
- Each user is a separate partition, so we can sustain 3,500 uploads per user concurrently
- CloudFront cache for photo GET requests (cache-control: max-age=31536000 on versioned objects)

**EventBridge:**
- Handles thousands of events per second natively
- DLQ and retry policy ensures no message loss
- We can add more subscribers without touching existing ones

**Database:**
- Cognito: AWS manages. No scaling needed
- Chime: AWS manages backend. We just generate tokens and let Chime route media

**Bottlenecks (and mitigations):**
- Cognito rate limits: ~100 authentication requests per second per User Pool (can request increase)
- Single Cognito User Pool for all services: consider multi-tenant partitioning if we have thousands of customers
- Email sending (PostConfirmation verification emails): use SES quotas (initially 50/sec, can increase)"

---

## Part 3: Deep Technical Questions

### Q: "Tell me about your IAM strategy. How do you ensure least privilege?"

**Answer (Show security mindset):**

"Every Lambda has a dedicated IAM execution role scoped to the minimal actions and resources it needs.

**Example: PostConfirmation Lambda**
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": "dynamodb:PutItem",
      "Resource": "arn:aws:dynamodb:ap-south-1:ACCOUNT:table/advitigudagudi-user-service-profiles"
    },
    {
      "Effect": "Allow",
      "Action": "events:PutEvents",
      "Resource": "arn:aws:events:ap-south-1:ACCOUNT:event-bus/advitigudagudi-auth-PhotoShareBus"
    },
    {
      "Effect": "Allow",
      "Action": "sqs:SendMessage",
      "Resource": "arn:aws:sqs:ap-south-1:ACCOUNT:advitigudagudi-user-postconfirmation-dlq"
    }
  ]
}
```

Not:
- DynamoDB:*
- events:* (which would allow deleting the bus)
- s3:* (this Lambda doesn't touch S3)

**Cross-stack pattern:**
- Auth stack exports EventBus ARN
- User stack imports it and uses it in the IAM policy
- This ties IAM to actual deployed resources, not hardcoded ARNs

**Cognito-Specific:**
- The PostConfirmation trigger is configured with a Lambda permission granting cognito-idp.amazonaws.com permission to invoke it
- Without this permission, Cognito can't invoke the Lambda

**Prevention of key practices:**
- No root account credentials in code
- Google Client Secret stored in Secrets Manager with CloudFormation dynamic reference — never in SAM template or git
- Secrets Manager policy allows only the Lambda that needs it"

---

### Q: "What happens if DynamoDB write fails in PostConfirmation?"

**Answer (Shows production thinking):**

"Let's trace through:

1. PostConfirmation Lambda executes, tries to PutItem to DynamoDB
2. DynamoDB returns ProvisionedThroughputExceededException or a network timeout
3. Our Lambda catches the error in the try-catch
4. We construct a failure payload with userId, email, triggerSource, error.message
5. We send it to SQS DLQ with MessageAttributes (for filtering in CloudWatch)
6. **Important: We still return the Cognito event unmodified**
   - Cognito expects the event object back from PostConfirmation
   - If we throw an error, Cognito triggers a lambda error, which **blocks the signup**
   - Instead, we return success to Cognito (user is confirmed) but capture the failure to SQS

**Later (operational recovery):**
1. On-call engineer gets a CloudWatch alarm: 'DLQ message count > 0'
2. Engineer checks what went wrong (DynamoDB was overloaded, network issue, etc.)
3. Engineer fixes the root cause
4. Engineer replays DLQ messages — a Lambda reads the SQS message, re-attempts the DynamoDB write
5. If successful, we delete the message from DLQ

**Why this pattern?**
- User gets a working account immediately (signup is not blocked)
- User Service profile gets created eventually (within 15 minutes)
- Frontend can fetch /v1/users/me immediately, gets a 404 briefly, but profile will appear
- We don't lose the event — 14-day retention on DLQ means we have time to investigate

**Alternative patterns we considered (❌):**
- Throw error from PostConfirmation: blocks signup (terrible UX)
- Auto-retry in Lambda: adds latency to signup flow
- Step Functions: adds complexity, harder to debug"

---

### Q: "How do you handle the EventBridge USER_CREATED event if a subscriber crashes?"

**Answer:**

"EventBridge has built-in retry and DLQ:

```yaml
EventBridgeRule:
  Type: AWS::Events::Rule
  Properties:
    Targets:
      - Arn: !GetAtt SyncUserIndexFunction.Arn
        RetryPolicy:
          MaximumEventAge: 3600  # Retry for 1 hour
          MaximumRetryAttempts: 2  # Total 3 invocations (1 initial + 2 retries)
        DeadLetterConfig:
          Arn: !GetAtt EventBridgeDLQ.Arn  # SQS queue
```

**Scenario: SyncUserIndexFunction crashes**

1. EventBridge invokes SyncUserIndexFunction with USER_CREATED event
2. Function crashes (returns non-zero exit code or throws)
3. EventBridge waits ~1 second, retries
4. Function crashes again
5. EventBridge waits ~2 seconds, retries again (exponential backoff)
6. Function crashes a third time
7. EventBridge sends event to DLQ SQS queue

**Operational response:**
1. On-call engineer gets alert: 'EventBridge DLQ has messages'
2. Engineer fixes Photo Service (e.g., restart Lambda, fix code bug)
3. Engineer replays DLQ: a Lambda reads the DLQ message (USER_CREATED event), re-invokes SyncUserIndexFunction
4. If successful, message is deleted from DLQ

**Why not infinite retries?**
- Prevent storms. If a service is misconfigured, we don't want EventBridge hammering it forever
- Forces human intervention, which is appropriate for operational issues
- The 1-hour window is enough for most transient failures to recover

**Trade-off:**
- User index in Photo Service might be stale briefly (missing new users)
- But this is **acceptable** because we only need the index for email-to-userId lookup during photo sharing
- A user can still log in and upload photos (doesn't require their own profile in the index)
- Email lookups might fail, but the user can share with the direct userId instead"

---

## Part 4: Handling Tough Questions

### Q: "Why not just use Cognito User Pool as the single source of truth? Why replicate user data to DynamoDB?"

**Answer (Shows architectural thinking):**

"Great question. We _do_ use Cognito as authoritative for identity. But we replicate the **minimal profile data** (userId, email, displayName, profilePictureUrl) to DynamoDB because:

1. **Query patterns Cognito doesn't support:**
   - Get all users (Cognito has no list-all-users API without ListUsers admin action, which is slow)
   - Query by email in a GSI (Cognito only indexes by username/email for auth, not for profile lookups)
   - Join user data with custom attributes in a transaction

2. **Performance:**
   - Cognito API is slower for profile lookups (goes through IDP infrastructure)
   - DynamoDB with on-demand billing is faster and cheaper

3. **Autonomy:**
   - Each microservice has its own database (poly-persistence)
   - Photo Service doesn't need to hit Cognito to look up a user's email
   - Calendar Service maintains its own user index independently

4. **Schema flexibility:**
   - Cognito has limited custom attributes
   - We might want to store photos:uploadCount, meetings:attendedCount, etc., in DynamoDB
   - Cognito is not suitable for that

**What we sync:**
- userId, email, displayName, profilePictureUrl (identity-related)
- Nothing sensitive (no passwords, no tokens)

**What stays in Cognito:**
- Password hash, MFA setup, token generation, session management
- Only Cognito User Pool is authoritative for these"

---

### Q: "How do you handle multi-tenancy if you want to sell this as a B2B product?"

**Answer (Shows forward thinking):**

"Current architecture is single-tenant (one customer: Advitigudagudi). Here's how we'd scale to multi-tenant:

**Option 1: Namespace isolation (Low cost, medium complexity)**
- Create a Cognito User Pool per tenant
- Create EventBus per tenant: photoshare-tenant-{tenantId}-bus
- Create tables per tenant: photos-tenant-{tenantId}, meetings-tenant-{tenantId}
- Tenants are completely isolated at the AWS resource level

**Option 2: Row-level security (Lower cost, higher complexity)**
- Single Cognito User Pool for all tenants (shared auth)
- Single tables with tenantId as part of the partition key: userId#tenantId
- Application logic enforces: 'User can only read rows where tenantId matches their tenant'

**Option 3: Subdomain routing (Medium cost, medium complexity)**
- Single codebase, but route based on subdomain
- tenant-a.advitigudagudi.com → uses PhotoBus-A, tables prefixed with A_
- tenant-b.advitigudagudi.com → uses PhotoBus-B, tables prefixed with B_
- Hybrid approach: some shared infrastructure (Cognito), some isolated (EventBuses)

**We'd go with Option 1 or Option 3:**
- Option 1 if tenants need complete isolation (healthcare, finance)
- Option 3 if we want to share some infrastructure but keep costs reasonable
- Option 2 only if we're willing to risk a bug that exposes one tenant's data to another

**SAM deployment:**
```bash
# Deploy for tenant A
sam deploy --parameter-overrides TenantId=tenant-a

# Deploy for tenant B
sam deploy --parameter-overrides TenantId=tenant-b
```

**Cost consideration:**
- Cognito: ~$0.50 per 1000 user sign-ups + $0.015 per daily active user
- DynamoDB on-demand: costs scale with actual usage, not per-tenant
- EventBridge: $1 per million events (negligible)
- So multi-tenancy is mostly additive cost of replication, not exponential"

---

## Part 5: "Walk Me Through" Scenarios

### Scenario 1: A user signs up with Google OAuth. Trace the entire flow.

1. User clicks 'Sign in with Google' on advitigudagudi.com
2. React app redirects to Cognito Hosted UI: `https://advitigudagudi-auth-{ACCOUNT_ID}.auth.ap-south-1.amazoncognito.com/login?client_id={CLIENT_ID}&response_type=code&scope=openid+email+profile&redirect_uri=https://advitigudagudi.com/callback`
3. Cognito Hosted UI renders Google button (configured as SupportedIdentityProvider)
4. User clicks Google button → redirects to Google OAuth consent screen
5. User consents, Google returns authorization code to Cognito
6. Cognito: auto-confirms account (no email verification) with triggerSource=PostConfirmation_ConfirmFederatedIdentity
7. Cognito invokes PostConfirmation Lambda
8. PostConfirmation Lambda:
   - Validates triggerSource is PostConfirmation_ConfirmFederatedIdentity (allowlist)
   - Extracts sub, email, name, given_name, family_name from userAttributes
   - Applies name fallback: name || given_name+family_name || email.split('@')[0]
   - PutItem to DynamoDB: {userId: sub, email, displayName, createdAt, source: 'google'}
   - PutEvents to EventBridge: {source: 'photoshare.users', DetailType: 'USER_CREATED', Detail: {userId, email, displayName, source: 'google'}}
   - Returns event object unmodified to Cognito
9. Cognito redirects back to: `https://advitigudagudi.com/callback?code={AUTHORIZATION_CODE}&state={STATE}`
10. React app exchanges code for tokens: POST to Cognito token endpoint (handled by Amplify Auth SDK)
11. Cognito returns: {access_token, id_token, refresh_token}
12. React app stores tokens in memory (not localStorage — vulnerable to XSS)
13. React app: GET /v1/users/me with Bearer {id_token}
14. API Gateway authorizer validates JWT signature against Cognito User Pool public key
15. GetUser Lambda executes: GetItem from DynamoDB with userId from JWT claims
16. DynamoDB returns: {userId, email, displayName, profilePictureUrl, createdAt}
17. React app renders: "Welcome, {displayName}! Upload a photo or create a meeting"

**Latency breakdown:**
- Google OAuth redirect: ~500ms
- Cognito PostConfirmation: ~200ms
- /v1/users/me: ~150ms
- Total: ~1 second (acceptable for first login)

---

### Scenario 2: User shares a photo with another user by email.

1. User A clicks "Share" on a photo → enters User B's email
2. Frontend: POST /v1/photos/{photoId}/share with body: {emails: ["user-b@example.com"]}
3. API Gateway authorizer validates JWT, extracts userId=user-a
4. SharePhoto Lambda executes:
   - Validates photoId exists and userId is owner (GetItem from PhotoMetadataTable)
   - Looks up user-b@example.com in user-index table (QueryCommand on emailIndex)
   - Gets back: {userId: user-b-uuid, email: user-b@example.com, ...}
   - Updates PhotoMetadataTable: sharedWith = [previous_user_ids..., user-b-uuid]
   - PutEvents to EventBridge: {DetailType: 'PHOTO_SHARED', Detail: {photoId, uploaderUserId, sharedWith: [...], timestamp}}
   - Returns {sharedWith: [...]}
5. Photo Service (self): no subscriber yet, but Calendar Service might subscribe to PHOTO_SHARED in future
6. Photo metadata now includes sharedWith: [user-b-uuid]
7. Frontend polls /v1/photos or uses WebSocket subscription to see {sharedWith: [user-b-uuid]}
8. User B logs in, GET /v1/photos returns a list that includes this photo (because sharedWith includes their userId)

**If user-b@example.com doesn't exist:**
- QueryCommand returns empty Items
- Lambda logs a warning: 'sharePhoto.emailNotFound'
- Lambda continues (doesn't fail) and returns without adding that email
- User A sees: "Could not find user with email user-b@example.com. Photo shared with 0 users."
- User A can retry by searching for the user's ID instead

---

## Part 6: Questions to Ask Your Interviewer (Shows Preparation)

1. **"How do you approach observability and alerting in your organizations? Are you using CloudWatch, Datadog, New Relic?"**
   - Shows you care about ops, not just architecture

2. **"What's your experience with multi-region deployments? How do you handle failover?"**
   - Demonstrates thinking about high availability

3. **"How do you handle secrets rotation? Is it automated?"**
   - Shows security mindset

4. **"What's the biggest architectural decision you've had to reverse? What did you learn?"**
   - Conversational, shows they have real experience

5. **"How do you ensure backward compatibility when APIs change?"**
   - Shows versioning thought (we use /v1/ paths)

---

## Part 7: Final Talking Points for Confidence

✅ **"We use EventBridge as our async backbone, allowing services to operate independently without coupling."**

✅ **"Presigned URLs offload file uploads to S3, keeping Lambda stateless and scalable."**

✅ **"JWT validation at the API Gateway authorizer layer means every Lambda gets pre-authenticated requests."**

✅ **"DLQ capture on both PostConfirmation failures and EventBridge delivery failures ensures no data loss."**

✅ **"Cognito Hosted UI handles both native and federated auth flows, so we don't build custom auth UI."**

✅ **"Each microservice is independently deployable via SAM. Auth can deploy independently of Photo or Calendar."**

✅ **"Structured logging with CloudWatch Logs Insights + X-Ray tracing gives us full observability."**

✅ **"Least-privilege IAM means each Lambda has only the permissions it needs — nothing more."**

---

## Part 8: If You Get Stuck

**Interviewer:** "You said you use presigned URLs. Can you explain why that's better than having the Lambda stream the file?"

**You:** "Great question. If Lambda streams the file:
- Lambda is blocked during upload (can't handle other requests)
- Each concurrent upload ties up 512MB of Lambda memory for potentially minutes
- At 10 users uploading simultaneously, we'd need to scale Lambda horizontally
- Every upload goes through Lambda, so Lambda becomes the bottleneck

With presigned URLs:
- Lambda generates the URL in <100ms and returns
- Browser connects directly to S3 with the URL
- S3 is built for this — millions of concurrent uploads
- Lambda can serve other requests immediately
- We scale to unlimited concurrent uploads for free

The trade-off: browser needs to handle CORS, pre-flight requests, etc. But that's solved by having S3 configured with correct CORS headers."

---

## Part 9: Red Flags to Avoid

❌ **Don't say:** "We use DynamoDB for everything because it's serverless."
✅ **Instead:** "We use DynamoDB because it scales automatically, but we maintain Cognito as the authoritative identity provider for security-sensitive data."

❌ **Don't say:** "EventBridge is our message queue."
✅ **Instead:** "EventBridge is our event bus. It's optimized for routing events to multiple subscribers, not for FIFO queues or tight ordering."

❌ **Don't say:** "We don't need monitoring because Lambda logs to CloudWatch automatically."
✅ **Instead:** "We emit structured JSON logs with requestId, action, durationMs so we can query them in CloudWatch Logs Insights and identify patterns."

❌ **Don't say:** "Our microservices are loosely coupled."
✅ **Instead:** "Our microservices are decoupled through EventBridge. Photo Service doesn't know about User Service, but it subscribes to USER_CREATED events."

---

Good luck! You've got this. 🚀
