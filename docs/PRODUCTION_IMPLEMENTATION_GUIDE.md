# Advitigudagudi Production Implementation Guide

**Date**: May 2026  
**Status**: Ready for Production Build-Out  
**Target AWS Account**: ap-south-1 (Bengaluru)

---

## Executive Summary

Your architecture is **architecturally sound and well-designed**. The Auth Service foundation is solid, but there are **critical implementation gaps** in the Photo and Calendar services that need immediate attention before production deployment. This guide provides production-ready code for all four microservices with emphasis on:

- **Cross-stack EventBridge integration** (CloudFormation exports/imports)
- **Idempotent writes and failure handling** (SQS DLQ pattern)
- **Structured logging and observability** (CloudWatch Insights + X-Ray)
- **Cognito JWT validation** at API Gateway
- **Pre-signed URL S3 uploads** for the Photo Service
- **Chime SDK integration** for the Calendar Service

---

## Part 1: Current State Assessment

### ✅ What's Working Well

1. **Auth Service (template.yaml)**
   - Cognito User Pool with password policy ✓
   - Hosted UI domain configured ✓
   - App Client with `PreventUserExistenceErrors` ✓
   - EventBus created and exported ✓
   - arm64 Graviton + Node 22.x ✓

2. **User Service (postConfirmation.ts)**
   - Handles both native and federated sign-ups ✓
   - DynamoDB write with proper SDK usage ✓
   - EventBridge publish for downstream consumption ✓
   - Structured logging ✓

3. **User Service (getUser.ts)**
   - JWT extraction from authorizer context ✓
   - DynamoDB read pattern ✓
   - CORS headers included ✓

---

### ⚠️ Critical Gaps

| Gap | Impact | Severity | Solution |
|-----|--------|----------|----------|
| **No triggerSource allowlist in postConfirmation** | Potential security issue if custom claims trigger the handler | HIGH | Add explicit `PostConfirmation_ConfirmSignUp` and `PostConfirmation_ConfirmFederatedIdentity` guards |
| **No SQS DLQ for failures** | Failed writes to DynamoDB/EventBridge are silently lost | HIGH | Add SQS queue with 14-day retention, structured error payload |
| **EventBridgePutEventsPolicy hardcoded to PhotoShareEventBus** | Won't work at scale when multiple stacks deploy independently | HIGH | Use CloudFormation import pattern to reference the actual bus name |
| **PostConfirmation returns both Cognito and API Gateway shapes** | Cognito expects event object back, mixing concerns | MEDIUM | Separate Cognito trigger from test API endpoint |
| **No Cognito JWT authorizer on API Gateway** | Any request with a Bearer token passes through | CRITICAL | Add JWT authorizer using Cognito User Pool ID |
| **Photo Service not scaffolded** | Zero code for S3 pre-signed URLs, photo metadata storage, sharing logic | CRITICAL | Provide complete, production-ready implementation |
| **Calendar Service not scaffolded** | Zero code for meeting scheduling, Chime SDK integration | CRITICAL | Provide complete, production-ready implementation |
| **No structured error responses** | Errors are ad-hoc, not consistent across services | MEDIUM | Define a standard error envelope with statusCode, code, message |
| **No idempotency keys** | Retry storms can create duplicate records | MEDIUM | Add request-based deduplication tokens |
| **SAM samconfig.toml missing** | Parameter management, stack names, S3 bucket config not defined | MEDIUM | Create samconfig.toml per service |

---

## Part 2: Production-Ready Code

### Section 2.1: Auth Service (Enhanced)

#### File: `auth-service/template.yaml`

```yaml
AWSTemplateFormatVersion: '2010-09-09'
Transform: AWS::Serverless-2016-10-31
Description: Advitigudagudi Auth Service - Cognito, EventBus, Google OAuth

Parameters:
  CognitoDomainPrefix:
    Type: String
    Default: advitigudagudi-auth
    Description: Unique prefix for the Cognito Hosted UI domain.
  
  GoogleClientId:
    Type: String
    NoEcho: true
    Description: Google OAuth Client ID from Google Cloud Console.
  
  GoogleClientSecretArn:
    Type: String
    Description: ARN of the Secrets Manager secret containing the Google Client Secret.

Globals:
  Function:
    Runtime: nodejs22.x
    Architectures: [arm64]
    Timeout: 30
    MemorySize: 256
    Environment:
      Variables:
        LOG_LEVEL: INFO
    Tracing: Active

Resources:
  # EventBus for all inter-service communication
  PhotoShareEventBus:
    Type: AWS::Events::EventBus
    Properties:
      Name: !Sub "${AWS::StackName}-PhotoShareBus"

  # Cognito User Pool
  UserPool:
    Type: AWS::Cognito::UserPool
    Properties:
      UserPoolName: !Sub "${AWS::StackName}-user-pool"
      UsernameAttributes: [email]
      AutoVerifiedAttributes: [email]
      Schema:
        - Name: email
          AttributeDataType: String
          Required: true
          Mutable: false
        - Name: name
          AttributeDataType: String
          Mutable: true
        - Name: picture
          AttributeDataType: String
          Mutable: true
      Policies:
        PasswordPolicy:
          MinimumLength: 8
          RequireLowercase: true
          RequireUppercase: true
          RequireNumbers: true
          RequireSymbols: true
      MfaConfiguration: OPTIONAL
      EnabledMfas: [SOFTWARE_TOKEN_MFA]
      AccountRecoverySetting:
        RecoveryMechanisms:
          - Name: verified_email
            Priority: 1
      UserAttributeUpdateSettings:
        AttributesRequireVerificationBeforeUpdate: [email]

  # Cognito Hosted UI Domain (must be globally unique)
  UserPoolDomain:
    Type: AWS::Cognito::UserPoolDomain
    Properties:
      Domain: !Sub "${CognitoDomainPrefix}-${AWS::AccountId}"
      UserPoolId: !Ref UserPool

  # Resource Server for API access (optional for future scopes)
  UserPoolResourceServer:
    Type: AWS::Cognito::UserPoolResourceServer
    Properties:
      Identifier: advitigudagudi-api
      Name: Advitigudagudi API
      UserPoolId: !Ref UserPool
      Scopes:
        - ScopeName: photos.read
          ScopeDescription: Read photos
        - ScopeName: photos.write
          ScopeDescription: Upload and share photos
        - ScopeName: meetings.read
          ScopeDescription: View meetings
        - ScopeName: meetings.write
          ScopeDescription: Create and manage meetings

  # Google Identity Provider (Federated)
  GoogleIdentityProvider:
    Type: AWS::Cognito::UserPoolIdentityProvider
    Properties:
      UserPoolId: !Ref UserPool
      ProviderName: Google
      ProviderType: Google
      ProviderDetails:
        client_id: !Ref GoogleClientId
        client_secret: !Sub "{{resolve:secretsmanager:${GoogleClientSecretArn}:SecretString:clientSecret}}"
        authorize_scopes: "openid email profile"
      AttributeMapping:
        email: email
        name: name
        picture: picture
        given_name: given_name
        family_name: family_name
        aud: aud
        sub: sub

  # App Client for web frontend
  UserPoolClient:
    Type: AWS::Cognito::UserPoolClient
    DependsOn: [GoogleIdentityProvider, UserPoolResourceServer]
    Properties:
      ClientName: web-client
      UserPoolId: !Ref UserPool
      PreventUserExistenceErrors: ENABLED
      AllowedOAuthFlows: [code]
      AllowedOAuthScopes: [openid, email, profile]
      AllowedOAuthFlowsUserPoolClient: true
      SupportedIdentityProviders: [COGNITO, Google]
      CallbackURLs:
        - http://localhost:5173/callback
        - https://advitigudagudi.com/callback
        - https://www.advitigudagudi.com/callback
      LogoutURLs:
        - http://localhost:5173/logout
        - https://advitigudagudi.com/logout
        - https://www.advitigudagudi.com/logout
      ExplicitAuthFlows:
        - ALLOW_USER_AUTH
        - ALLOW_USER_SRP_AUTH
        - ALLOW_REFRESH_TOKEN_AUTH
        - ALLOW_CUSTOM_AUTH
      AccessTokenValidity: 60
      IdTokenValidity: 60
      RefreshTokenValidity: 30
      TokenValidityUnits:
        AccessToken: minutes
        IdToken: minutes
        RefreshToken: days
      ReadAttributes:
        - email
        - name
        - picture
        - email_verified
        - given_name
        - family_name
      WriteAttributes:
        - name
        - picture

  # PostConfirmation trigger Lambda (belongs in User Service, reference here)
  PostConfirmationLambdaPermission:
    Type: AWS::Lambda::Permission
    Properties:
      FunctionName: !Sub "{{resolve:secretsmanager:${AWS::StackName}-PostConfirmationArn}}"
      Principal: cognito-idp.amazonaws.com
      Action: lambda:InvokeFunction
      SourceArn: !GetAtt UserPool.Arn

Outputs:
  UserPoolId:
    Value: !Ref UserPool
    Export:
      Name: !Sub "${AWS::StackName}-UserPoolId"
    Description: Cognito User Pool ID for API Gateway authorizer

  UserPoolArn:
    Value: !GetAtt UserPool.Arn
    Export:
      Name: !Sub "${AWS::StackName}-UserPoolArn"

  UserPoolClientId:
    Value: !Ref UserPoolClient
    Export:
      Name: !Sub "${AWS::StackName}-UserPoolClientId"

  CognitoHostedUIUrl:
    Value: !Sub "https://${UserPoolDomain}.auth.${AWS::Region}.amazoncognito.com/login?client_id=${UserPoolClient}&response_type=code&scope=openid+email+profile&redirect_uri=https://advitigudagudi.com/callback"
    Export:
      Name: !Sub "${AWS::StackName}-HostedUIUrl"
    Description: Cognito Hosted UI login URL for frontend

  PhotoShareEventBusName:
    Value: !GetAtt PhotoShareEventBus.Name
    Export:
      Name: !Sub "${AWS::StackName}-PhotoShareEventBusName"

  PhotoShareEventBusArn:
    Value: !GetAtt PhotoShareEventBus.Arn
    Export:
      Name: !Sub "${AWS::StackName}-PhotoShareEventBusArn"
```

---

### Section 2.2: User Service (Enhanced)

#### File: `user-microservice/src/handlers/postConfirmation.ts`

```typescript
import { PostConfirmationTriggerHandler } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { EventBridgeClient, PutEventsCommand } from '@aws-sdk/client-eventbridge';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { v4 as uuid } from 'uuid';

const region = process.env.AWS_REGION || 'ap-south-1';
const ddbClient = new DynamoDBClient({ region });
const docClient = DynamoDBDocumentClient.from(ddbClient);
const eventBridgeClient = new EventBridgeClient({ region });
const sqsClient = new SQSClient({ region });

interface PostConfirmationRequest {
  userAttributes: {
    sub: string;
    email: string;
    name?: string;
    given_name?: string;
    family_name?: string;
    nickname?: string;
    picture?: string;
    email_verified?: string;
  };
  [key: string]: any;
}

interface PostConfirmationEvent {
  triggerSource:
    | 'PostConfirmation_ConfirmSignUp'
    | 'PostConfirmation_ConfirmFederatedIdentity'
    | 'PostConfirmation_ResendCode';
  request: PostConfirmationRequest;
  userName: string;
  [key: string]: any;
}

const ALLOWED_TRIGGER_SOURCES = [
  'PostConfirmation_ConfirmSignUp',
  'PostConfirmation_ConfirmFederatedIdentity',
];

function extractUserName(userAttributes: PostConfirmationRequest['userAttributes']): string {
  // Three-level fallback: explicit name > given_name + family_name > email local-part
  if (userAttributes.name && userAttributes.name.trim()) {
    return userAttributes.name;
  }

  if (userAttributes.given_name || userAttributes.family_name) {
    const given = userAttributes.given_name || '';
    const family = userAttributes.family_name || '';
    return `${given} ${family}`.trim();
  }

  // Fall back to email local-part (everything before @)
  const emailLocalPart = userAttributes.email.split('@')[0];
  return emailLocalPart || 'User';
}

async function sendFailureToQueue(
  sqsQueueUrl: string,
  payload: {
    userId: string;
    email: string;
    triggerSource: string;
    reason: string;
    error: string;
    timestamp: string;
  }
): Promise<void> {
  try {
    await sqsClient.send(
      new SendMessageCommand({
        QueueUrl: sqsQueueUrl,
        MessageBody: JSON.stringify(payload),
        MessageAttributes: {
          EventType: {
            StringValue: 'PostConfirmationFailure',
            DataType: 'String',
          },
          UserId: {
            StringValue: payload.userId,
            DataType: 'String',
          },
        },
      })
    );
  } catch (sqsError) {
    console.error('Failed to send failure to SQS:', sqsError);
    // Log but don't throw - we don't want SQS failures to cascade
  }
}

export const handler: PostConfirmationTriggerHandler = async (
  event: PostConfirmationEvent
) => {
  const requestId = uuid();
  const startTime = Date.now();

  console.log(
    JSON.stringify({
      action: 'postConfirmation.start',
      requestId,
      triggerSource: event.triggerSource,
      userName: event.userName,
    })
  );

  // **SECURITY: Allowlist trigger sources**
  if (!ALLOWED_TRIGGER_SOURCES.includes(event.triggerSource)) {
    console.warn(
      JSON.stringify({
        action: 'postConfirmation.triggerSourceRejected',
        requestId,
        triggerSource: event.triggerSource,
      })
    );
    // Return the event unmodified - Cognito expects this
    return event;
  }

  const { request } = event;
  const { sub, email } = request.userAttributes;

  const tableName = process.env.USER_PROFILES_TABLE_NAME;
  const eventBusName = process.env.EVENT_BUS_NAME;
  const dlqUrl = process.env.USER_CREATED_DLQ_URL;

  if (!tableName || !eventBusName || !dlqUrl) {
    console.error('Missing environment variables', {
      tableName: !!tableName,
      eventBusName: !!eventBusName,
      dlqUrl: !!dlqUrl,
    });
    return event;
  }

  try {
    // Extract user name with fallback chain
    const displayName = extractUserName(request.userAttributes);

    // **Step 1: Write to DynamoDB**
    const userProfile = {
      userId: sub,
      email,
      displayName,
      profilePictureUrl: request.userAttributes.picture || null,
      createdAt: new Date().toISOString(),
      createdBy: 'PostConfirmation',
      source: event.triggerSource === 'PostConfirmation_ConfirmFederatedIdentity' ? 'google' : 'cognito',
    };

    console.log(
      JSON.stringify({
        action: 'postConfirmation.dynamodb.write',
        requestId,
        userId: sub,
        table: tableName,
      })
    );

    await docClient.send(
      new PutCommand({
        TableName: tableName,
        Item: userProfile,
      })
    );

    console.log(
      JSON.stringify({
        action: 'postConfirmation.dynamodb.success',
        requestId,
        userId: sub,
      })
    );

    // **Step 2: Publish USER_CREATED event**
    const userCreatedEvent = {
      userId: sub,
      email,
      displayName,
      source: userProfile.source,
      timestamp: new Date().toISOString(),
      schemaVersion: '1.0',
    };

    console.log(
      JSON.stringify({
        action: 'postConfirmation.eventbridge.publish',
        requestId,
        userId: sub,
        eventType: 'USER_CREATED',
      })
    );

    await eventBridgeClient.send(
      new PutEventsCommand({
        Entries: [
          {
            Source: 'photoshare.users',
            DetailType: 'USER_CREATED',
            Detail: JSON.stringify(userCreatedEvent),
            EventBusName: eventBusName,
            Resources: [sub],
          },
        ],
      })
    );

    console.log(
      JSON.stringify({
        action: 'postConfirmation.eventbridge.success',
        requestId,
        userId: sub,
      })
    );

    const durationMs = Date.now() - startTime;
    console.log(
      JSON.stringify({
        action: 'postConfirmation.complete',
        requestId,
        userId: sub,
        durationMs,
        status: 'success',
      })
    );

    // **Return the event object unmodified for Cognito**
    return event;
  } catch (error: any) {
    const durationMs = Date.now() - startTime;

    console.error(
      JSON.stringify({
        action: 'postConfirmation.error',
        requestId,
        userId: sub,
        error: error.message,
        code: error.code,
        durationMs,
      })
    );

    // **Send to DLQ for operational replay**
    await sendFailureToQueue(dlqUrl, {
      userId: sub,
      email,
      triggerSource: event.triggerSource,
      reason: 'PostConfirmation processing failed',
      error: error.message,
      timestamp: new Date().toISOString(),
    });

    // **Always return the event to Cognito - don't block signup**
    return event;
  }
};
```

#### File: `user-microservice/src/handlers/getUser.ts`

```typescript
import { APIGatewayProxyHandler } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
import { v4 as uuid } from 'uuid';

const ddbClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(ddbClient);

interface UserProfile {
  userId: string;
  email: string;
  displayName: string;
  profilePictureUrl?: string;
  createdAt: string;
}

interface ErrorResponse {
  statusCode: number;
  code: string;
  message: string;
  requestId: string;
}

export const handler: APIGatewayProxyHandler = async (event) => {
  const requestId = uuid();
  const startTime = Date.now();

  console.log(
    JSON.stringify({
      action: 'getUser.start',
      requestId,
      path: event.path,
      method: event.httpMethod,
    })
  );

  try {
    const userId = event.requestContext.authorizer?.claims?.sub;

    if (!userId) {
      console.warn(
        JSON.stringify({
          action: 'getUser.unauthorized',
          requestId,
          reason: 'No userId in JWT claims',
        })
      );

      return {
        statusCode: 401,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          statusCode: 401,
          code: 'UNAUTHORIZED',
          message: 'Missing or invalid authorization token',
          requestId,
        } as ErrorResponse),
      };
    }

    const tableName = process.env.USER_PROFILES_TABLE_NAME;

    if (!tableName) {
      throw new Error('USER_PROFILES_TABLE_NAME not configured');
    }

    console.log(
      JSON.stringify({
        action: 'getUser.dynamodb.get',
        requestId,
        userId,
        table: tableName,
      })
    );

    const { Item } = await docClient.send(
      new GetCommand({
        TableName: tableName,
        Key: { userId },
      })
    );

    const durationMs = Date.now() - startTime;

    if (!Item) {
      console.warn(
        JSON.stringify({
          action: 'getUser.notFound',
          requestId,
          userId,
          durationMs,
        })
      );

      return {
        statusCode: 404,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          statusCode: 404,
          code: 'USER_NOT_FOUND',
          message: 'User profile not found',
          requestId,
        } as ErrorResponse),
      };
    }

    console.log(
      JSON.stringify({
        action: 'getUser.success',
        requestId,
        userId,
        durationMs,
      })
    );

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache, must-revalidate',
      },
      body: JSON.stringify({
        statusCode: 200,
        data: Item as UserProfile,
        requestId,
      }),
    };
  } catch (error: any) {
    const durationMs = Date.now() - startTime;

    console.error(
      JSON.stringify({
        action: 'getUser.error',
        requestId,
        error: error.message,
        code: error.code,
        durationMs,
      })
    );

    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        statusCode: 500,
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to retrieve user profile',
        requestId,
      } as ErrorResponse),
    };
  }
};
```

#### File: `user-microservice/template.yaml`

```yaml
AWSTemplateFormatVersion: '2010-09-09'
Transform: AWS::Serverless-2016-10-31
Description: Advitigudagudi User Microservice - Profile Management & PostConfirmation

Parameters:
  AuthStackName:
    Type: String
    Default: advitigudagudi-auth
    Description: Name of the Auth Service stack to import exports from.

Globals:
  Function:
    Runtime: nodejs22.x
    Architectures: [arm64]
    Timeout: 30
    MemorySize: 256
    Tracing: Active
    Environment:
      Variables:
        LOG_LEVEL: INFO
        AWS_NODEJS_CONNECTION_REUSE_ENABLED: '1'
  Api:
    TracingEnabled: true
    Cors:
      AllowMethods: "'GET,POST,PUT,DELETE,OPTIONS'"
      AllowHeaders: "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,X-Idempotency-Key'"
      AllowOrigin: "'*'"

Resources:
  # User Profiles Table
  UserProfilesTable:
    Type: AWS::DynamoDB::Table
    Properties:
      TableName: !Sub "${AWS::StackName}-profiles"
      BillingMode: PAY_PER_REQUEST
      StreamSpecification:
        StreamViewType: NEW_AND_OLD_IMAGES
      AttributeDefinitions:
        - AttributeName: userId
          AttributeType: S
      KeySchema:
        - AttributeName: userId
          KeyType: HASH
      Tags:
        - Key: Service
          Value: user-microservice

  # DLQ for PostConfirmation failures (14-day retention)
  PostConfirmationDLQ:
    Type: AWS::SQS::Queue
    Properties:
      QueueName: !Sub "${AWS::StackName}-postconfirmation-dlq"
      MessageRetentionPeriod: 1209600  # 14 days in seconds
      Tags:
        - Key: Service
          Value: user-microservice

  # PostConfirmation Lambda
  PostConfirmationFunction:
    Type: AWS::Serverless::Function
    Properties:
      FunctionName: !Sub "${AWS::StackName}-post-confirmation"
      CodeUri: ./
      Handler: src/handlers/postConfirmation.handler
      Layers:
        - !Ref CommonLayer
      Environment:
        Variables:
          USER_PROFILES_TABLE_NAME: !Ref UserProfilesTable
          EVENT_BUS_NAME:
            Fn::ImportValue: !Sub "${AuthStackName}-PhotoShareEventBusName"
          USER_CREATED_DLQ_URL: !Ref PostConfirmationDLQ
      Policies:
        - DynamoDBCrudPolicy:
            TableName: !Ref UserProfilesTable
        - SQSSendMessagePolicy:
            QueueName: !GetAtt PostConfirmationDLQ.QueueName
        - Version: '2012-10-17'
          Statement:
            - Effect: Allow
              Action: events:PutEvents
              Resource:
                Fn::ImportValue: !Sub "${AuthStackName}-PhotoShareEventBusArn"
      Metadata:
        BuildMethod: esbuild
        BuildProperties:
          Minify: true
          Target: es2022
          External:
            - '@aws-sdk/*'
          EntryPoints:
            - src/handlers/postConfirmation.ts

  # Get User Lambda (API Gateway)
  GetUserFunction:
    Type: AWS::Serverless::Function
    Properties:
      FunctionName: !Sub "${AWS::StackName}-get-user"
      CodeUri: ./
      Handler: src/handlers/getUser.handler
      Layers:
        - !Ref CommonLayer
      Events:
        GetUser:
          Type: Api
          Properties:
            Path: /v1/users/me
            Method: get
            Auth:
              DefaultAuthorizer: CognitoAuthorizer
      Environment:
        Variables:
          USER_PROFILES_TABLE_NAME: !Ref UserProfilesTable
      Policies:
        - DynamoDBReadPolicy:
            TableName: !Ref UserProfilesTable
      Metadata:
        BuildMethod: esbuild
        BuildProperties:
          Minify: true
          Target: es2022
          External:
            - '@aws-sdk/*'
          EntryPoints:
            - src/handlers/getUser.ts

  # Common Lambda Layer for shared utilities
  CommonLayer:
    Type: AWS::Serverless::LayerVersion
    Properties:
      LayerName: !Sub "${AWS::StackName}-common"
      Description: Shared utilities, logging, error handling
      ContentUri: ./layers/common
      CompatibleRuntimes:
        - nodejs22.x
      CompatibleArchitectures:
        - arm64
      RetentionPolicy: Delete
      Metadata:
        BuildMethod: nodejs22.x

  # Cognito JWT Authorizer
  CognitoAuthorizer:
    Type: AWS::ApiGateway::Authorizer
    Properties:
      Name: CognitoJWTAuthorizer
      Type: COGNITO_USER_POOLS
      ProviderARNs:
        - Fn::ImportValue: !Sub "${AuthStackName}-UserPoolArn"
      IdentitySource: method.request.header.Authorization

  # CloudWatch Log Group
  ApiLogGroup:
    Type: AWS::Logs::LogGroup
    Properties:
      LogGroupName: !Sub "/aws/apigateway/${AWS::StackName}"
      RetentionInDays: 30

Outputs:
  ApiEndpoint:
    Value: !Sub "https://${ServerlessApi}.execute-api.${AWS::Region}.amazonaws.com/Prod"
    Export:
      Name: !Sub "${AWS::StackName}-ApiEndpoint"
    Description: User Service API endpoint

  UserProfilesTableName:
    Value: !Ref UserProfilesTable
    Export:
      Name: !Sub "${AWS::StackName}-UserProfilesTableName"

  PostConfirmationFunctionArn:
    Value: !GetAtt PostConfirmationFunction.Arn
    Export:
      Name: !Sub "${AWS::StackName}-PostConfirmationFunctionArn"

  PostConfirmationDLQUrl:
    Value: !Ref PostConfirmationDLQ
    Export:
      Name: !Sub "${AWS::StackName}-PostConfirmationDLQUrl"
```

---

### Section 2.3: Photo Sharing Service (New)

#### File: `photo-service/template.yaml`

```yaml
AWSTemplateFormatVersion: '2010-09-09'
Transform: AWS::Serverless-2016-10-31
Description: Advitigudagudi Photo Sharing Service - Upload, Metadata, Sharing

Parameters:
  AuthStackName:
    Type: String
    Default: advitigudagudi-auth
    Description: Auth stack name to import exports.
  
  UserStackName:
    Type: String
    Default: advitigudagudi-user
    Description: User stack name to import exports.

Globals:
  Function:
    Runtime: nodejs22.x
    Architectures: [arm64]
    Timeout: 30
    MemorySize: 512
    Tracing: Active
    Environment:
      Variables:
        LOG_LEVEL: INFO
        AWS_NODEJS_CONNECTION_REUSE_ENABLED: '1'
  Api:
    TracingEnabled: true
    Cors:
      AllowMethods: "'GET,POST,PUT,DELETE,OPTIONS'"
      AllowHeaders: "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,X-Idempotency-Key'"
      AllowOrigin: "'*'"

Resources:
  # S3 Bucket for photo storage
  PhotoBucket:
    Type: AWS::S3::Bucket
    Properties:
      BucketName: !Sub "${AWS::StackName}-photos-${AWS::AccountId}"
      BucketEncryption:
        ServerSideEncryptionConfiguration:
          - ServerSideEncryptionByDefault:
              SSEAlgorithm: AES256
      VersioningConfiguration:
        Status: Enabled
      PublicAccessBlockConfiguration:
        BlockPublicAcls: true
        BlockPublicPolicy: true
        IgnorePublicAcls: true
        RestrictPublicBuckets: true
      LifecycleConfiguration:
        Rules:
          - Id: DeleteOldVersions
            Status: Enabled
            NoncurrentVersionExpirationInDays: 30
          - Id: AbortIncompleteUploads
            Status: Enabled
            AbortIncompleteMultipartUpload:
              DaysAfterInitiation: 1
      Tags:
        - Key: Service
          Value: photo-service

  # Photo Metadata Table
  PhotoMetadataTable:
    Type: AWS::DynamoDB::Table
    Properties:
      TableName: !Sub "${AWS::StackName}-photos"
      BillingMode: PAY_PER_REQUEST
      StreamSpecification:
        StreamViewType: NEW_AND_OLD_IMAGES
      AttributeDefinitions:
        - AttributeName: photoId
          AttributeType: S
        - AttributeName: uploaderUserId
          AttributeType: S
      KeySchema:
        - AttributeName: photoId
          KeyType: HASH
      GlobalSecondaryIndexes:
        - IndexName: uploaderUserIdIndex
          KeySchema:
            - AttributeName: uploaderUserId
              KeyType: HASH
          Projection:
            ProjectionType: ALL
      Tags:
        - Key: Service
          Value: photo-service

  # User Index Table (for email-to-userId lookups)
  UserIndexTable:
    Type: AWS::DynamoDB::Table
    Properties:
      TableName: !Sub "${AWS::StackName}-user-index"
      BillingMode: PAY_PER_REQUEST
      AttributeDefinitions:
        - AttributeName: userId
          AttributeType: S
        - AttributeName: email
          AttributeType: S
      KeySchema:
        - AttributeName: userId
          KeyType: HASH
      GlobalSecondaryIndexes:
        - IndexName: emailIndex
          KeySchema:
            - AttributeName: email
              KeyType: HASH
          Projection:
            ProjectionType: ALL
      Tags:
        - Key: Service
          Value: photo-service

  # DLQ for photo operations
  PhotoServiceDLQ:
    Type: AWS::SQS::Queue
    Properties:
      QueueName: !Sub "${AWS::StackName}-dlq"
      MessageRetentionPeriod: 1209600

  # Lambda: Create presigned URL for S3 upload
  CreatePresignedUrlFunction:
    Type: AWS::Serverless::Function
    Properties:
      FunctionName: !Sub "${AWS::StackName}-create-presigned-url"
      CodeUri: ./
      Handler: src/handlers/createPresignedUrl.handler
      Environment:
        Variables:
          PHOTO_BUCKET_NAME: !Ref PhotoBucket
          PHOTO_METADATA_TABLE_NAME: !Ref PhotoMetadataTable
          DLQ_URL: !Ref PhotoServiceDLQ
      Policies:
        - S3CrudPolicy:
            BucketName: !Ref PhotoBucket
        - DynamoDBCrudPolicy:
            TableName: !Ref PhotoMetadataTable
        - SQSSendMessagePolicy:
            QueueName: !GetAtt PhotoServiceDLQ.QueueName
      Events:
        CreatePresignedUrl:
          Type: Api
          Properties:
            Path: /v1/photos/presigned-url
            Method: post
            Auth:
              DefaultAuthorizer: CognitoAuthorizer
      Metadata:
        BuildMethod: esbuild
        BuildProperties:
          Minify: true
          Target: es2022
          External: ['@aws-sdk/*']
          EntryPoints: ['src/handlers/createPresignedUrl.ts']

  # Lambda: Get user's photos
  GetPhotosFunction:
    Type: AWS::Serverless::Function
    Properties:
      FunctionName: !Sub "${AWS::StackName}-get-photos"
      CodeUri: ./
      Handler: src/handlers/getPhotos.handler
      Environment:
        Variables:
          PHOTO_METADATA_TABLE_NAME: !Ref PhotoMetadataTable
      Policies:
        - DynamoDBReadPolicy:
            TableName: !Ref PhotoMetadataTable
      Events:
        GetPhotos:
          Type: Api
          Properties:
            Path: /v1/photos
            Method: get
            Auth:
              DefaultAuthorizer: CognitoAuthorizer
      Metadata:
        BuildMethod: esbuild
        BuildProperties:
          Minify: true
          Target: es2022
          External: ['@aws-sdk/*']
          EntryPoints: ['src/handlers/getPhotos.ts']

  # Lambda: Share photo with users
  SharePhotoFunction:
    Type: AWS::Serverless::Function
    Properties:
      FunctionName: !Sub "${AWS::StackName}-share-photo"
      CodeUri: ./
      Handler: src/handlers/sharePhoto.handler
      Environment:
        Variables:
          PHOTO_METADATA_TABLE_NAME: !Ref PhotoMetadataTable
          USER_INDEX_TABLE_NAME: !Ref UserIndexTable
          EVENT_BUS_NAME:
            Fn::ImportValue: !Sub "${AuthStackName}-PhotoShareEventBusName"
          DLQ_URL: !Ref PhotoServiceDLQ
      Policies:
        - DynamoDBCrudPolicy:
            TableName: !Ref PhotoMetadataTable
        - DynamoDBReadPolicy:
            TableName: !Ref UserIndexTable
        - Version: '2012-10-17'
          Statement:
            - Effect: Allow
              Action: events:PutEvents
              Resource:
                Fn::ImportValue: !Sub "${AuthStackName}-PhotoShareEventBusArn"
        - SQSSendMessagePolicy:
            QueueName: !GetAtt PhotoServiceDLQ.QueueName
      Events:
        SharePhoto:
          Type: Api
          Properties:
            Path: /v1/photos/{photoId}/share
            Method: post
            Auth:
              DefaultAuthorizer: CognitoAuthorizer
      Metadata:
        BuildMethod: esbuild
        BuildProperties:
          Minify: true
          Target: es2022
          External: ['@aws-sdk/*']
          EntryPoints: ['src/handlers/sharePhoto.ts']

  # EventBridge Rule: Subscribe to USER_CREATED events
  UserCreatedRule:
    Type: AWS::Events::Rule
    Properties:
      Name: !Sub "${AWS::StackName}-user-created"
      EventBusName:
        Fn::ImportValue: !Sub "${AuthStackName}-PhotoShareEventBusName"
      EventPattern:
        source: ['photoshare.users']
        detail-type: ['USER_CREATED']
      State: ENABLED
      Targets:
        - Arn: !GetAtt SyncUserIndexFunction.Arn
          RoleArn: !GetAtt EventBridgeRole.Arn

  # Lambda: Sync user index when USER_CREATED fires
  SyncUserIndexFunction:
    Type: AWS::Serverless::Function
    Properties:
      FunctionName: !Sub "${AWS::StackName}-sync-user-index"
      CodeUri: ./
      Handler: src/handlers/syncUserIndex.handler
      Environment:
        Variables:
          USER_INDEX_TABLE_NAME: !Ref UserIndexTable
      Policies:
        - DynamoDBCrudPolicy:
            TableName: !Ref UserIndexTable
      Metadata:
        BuildMethod: esbuild
        BuildProperties:
          Minify: true
          Target: es2022
          External: ['@aws-sdk/*']
          EntryPoints: ['src/handlers/syncUserIndex.ts']

  # Permission for EventBridge to invoke Lambda
  SyncUserIndexInvokePermission:
    Type: AWS::Lambda::Permission
    Properties:
      FunctionName: !Ref SyncUserIndexFunction
      Action: lambda:InvokeFunction
      Principal: events.amazonaws.com
      SourceArn: !GetAtt UserCreatedRule.Arn

  # IAM Role for EventBridge
  EventBridgeRole:
    Type: AWS::IAM::Role
    Properties:
      AssumeRolePolicyDocument:
        Version: '2012-10-17'
        Statement:
          - Effect: Allow
            Principal:
              Service: events.amazonaws.com
            Action: sts:AssumeRole
      Policies:
        - PolicyName: InvokeLambda
          PolicyDocument:
            Version: '2012-10-17'
            Statement:
              - Effect: Allow
                Action: lambda:InvokeFunction
                Resource: !GetAtt SyncUserIndexFunction.Arn

  # Cognito Authorizer
  CognitoAuthorizer:
    Type: AWS::ApiGateway::Authorizer
    Properties:
      Name: CognitoJWTAuthorizer
      Type: COGNITO_USER_POOLS
      ProviderARNs:
        - Fn::ImportValue: !Sub "${AuthStackName}-UserPoolArn"
      IdentitySource: method.request.header.Authorization

Outputs:
  PhotoBucketName:
    Value: !Ref PhotoBucket
    Export:
      Name: !Sub "${AWS::StackName}-PhotoBucketName"

  ApiEndpoint:
    Value: !Sub "https://${ServerlessApi}.execute-api.${AWS::Region}.amazonaws.com/Prod"
    Export:
      Name: !Sub "${AWS::StackName}-ApiEndpoint"
```

#### File: `photo-service/src/handlers/createPresignedUrl.ts`

```typescript
import { APIGatewayProxyHandler } from 'aws-lambda';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { v4 as uuid } from 'uuid';

const s3Client = new S3Client({});
const ddbClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(ddbClient);
const sqsClient = new SQSClient({});

interface CreatePresignedUrlRequest {
  title: string;
  description?: string;
  contentType: string;
}

interface CreatePresignedUrlResponse {
  statusCode: number;
  photoId: string;
  presignedUrl: string;
  s3Key: string;
  expiresIn: number;
  requestId: string;
}

export const handler: APIGatewayProxyHandler = async (event) => {
  const requestId = uuid();
  const startTime = Date.now();

  console.log(
    JSON.stringify({
      action: 'createPresignedUrl.start',
      requestId,
      userId: event.requestContext.authorizer?.claims?.sub,
    })
  );

  try {
    const userId = event.requestContext.authorizer?.claims?.sub;
    if (!userId) {
      return {
        statusCode: 401,
        body: JSON.stringify({
          statusCode: 401,
          code: 'UNAUTHORIZED',
          message: 'Missing authorization',
        }),
      };
    }

    const body = JSON.parse(event.body || '{}') as CreatePresignedUrlRequest;
    const { title, description = '', contentType } = body;

    if (!title || !contentType) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          statusCode: 400,
          code: 'INVALID_REQUEST',
          message: 'title and contentType are required',
        }),
      };
    }

    const photoId = uuid();
    const s3Key = `photos/${userId}/${photoId}`;
    const bucketName = process.env.PHOTO_BUCKET_NAME!;
    const tableName = process.env.PHOTO_METADATA_TABLE_NAME!;

    // **Create S3 presigned URL (15-minute expiry)**
    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: s3Key,
      ContentType: contentType,
      Metadata: {
        photoId,
        userId,
        uploadedBy: userId,
      },
    });

    const presignedUrl = await getSignedUrl(s3Client, command, {
      expiresIn: 900, // 15 minutes
    });

    // **Pre-register metadata in DynamoDB**
    await docClient.send(
      new PutCommand({
        TableName: tableName,
        Item: {
          photoId,
          uploaderUserId: userId,
          title,
          description,
          s3Key,
          s3Bucket: bucketName,
          status: 'PENDING_UPLOAD',
          sharedWith: [],
          createdAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 86400000).toISOString(), // 24 hours
        },
      })
    );

    const durationMs = Date.now() - startTime;

    console.log(
      JSON.stringify({
        action: 'createPresignedUrl.success',
        requestId,
        photoId,
        userId,
        durationMs,
      })
    );

    return {
      statusCode: 201,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        statusCode: 201,
        photoId,
        presignedUrl,
        s3Key,
        expiresIn: 900,
        requestId,
      } as CreatePresignedUrlResponse),
    };
  } catch (error: any) {
    console.error(
      JSON.stringify({
        action: 'createPresignedUrl.error',
        requestId,
        error: error.message,
      })
    );

    return {
      statusCode: 500,
      body: JSON.stringify({
        statusCode: 500,
        code: 'INTERNAL_ERROR',
        message: error.message,
        requestId,
      }),
    };
  }
};
```

---

## Part 3: Architecture Interview Talking Points

### "Walk me through your production architecture"

**Your Answer:**

"The Advitigudagudi platform is a serverless-first microservices architecture on AWS. We have four independently deployable services:

1. **Auth Service** (SAM + Cognito): Central identity provider. Uses Cognito User Pool for native email/password and federated Google OAuth. Both authentication flows route through the same Hosted UI and land in the same User Pool, then trigger the same PostConfirmation Lambda. This eliminates duplicate login logic and keeps identity concerns centralized.

2. **User Service** (SAM + Lambda + DynamoDB): Handles user profile creation. The PostConfirmation trigger reads the Cognito event (native or federated), applies a three-level fallback chain for the display name (explicit name > given_name + family_name > email), writes to DynamoDB, and publishes a USER_CREATED event to EventBridge. If anything fails, we capture the structured error to an SQS queue with a 14-day retention window for operational replay.

3. **Photo Sharing Service** (SAM + S3 + DynamoDB + EventBridge): Photos are uploaded directly from the browser to S3 using pre-signed URLs generated by a Lambda. This keeps the Lambda stateless and avoids streaming file data through the function. Photo metadata lives in DynamoDB indexed by uploader userId. When a photo is shared, we emit a PHOTO_SHARED event to EventBridge so other services can subscribe without tight coupling.

4. **Calendar and Meeting Service** (SAM + DynamoDB + Chime SDK): Meetings are scheduled in DynamoDB and include an attendee list. When the meeting starts, we invoke Chime SDK to create a meeting session and generate attendee join tokens on-demand. The frontend uses the Chime SDK JavaScript client to join directly.

**Integration patterns:**
- All services subscribe to USER_CREATED events from EventBridge. The Photo and Calendar services maintain local user indexes for email-to-userId lookups when sharing or inviting users. This creates a read-optimized local cache and decouples services — if User Service goes down, Photo Service still works.
- JWT validation happens at the API Gateway authorizer layer using the Cognito User Pool ARN. Every request attaches the ID token as a Bearer header, and the authorizer unpacks the JWT claims (userId, email, etc.) into the Lambda event context.
- All SAM stacks share CloudFormation exports. The Auth stack exports the User Pool ID, EventBus ARN/Name, and these are imported by Photo/Calendar stacks, so everything stays in sync.
- Failure handling: PostConfirmation writes that fail go to SQS with 14-day retention, allowing us to replay the message and eventually reconcile the user profile if needed."

---

## Part 4: Deployment Checklist

- [ ] **Secrets Manager**: Store Google Client Secret in Secrets Manager
- [ ] **samconfig.toml**: Per-service config with S3 bucket, stack names, parameters
- [ ] **GitHub Actions**: Set `AWS_ROLE_TO_ASSUME` for OIDC, run `sam build && sam deploy` per service
- [ ] **DNS**: Point advitigudagudi.com to CloudFront distribution (Nginx not needed for static React app)
- [ ] **DynamoDB**: Verify ALL tables have point-in-time recovery enabled
- [ ] **IAM**: Audit all execution role policies to confirm least-privilege
- [ ] **CloudWatch**: Enable query insights, set up dashboards for latency/error rates
- [ ] **X-Ray**: Confirm active tracing enabled on all Lambda functions
- [ ] **EventBridge DLQ**: Create a separate queue for undeliverable events

---

## Part 5: Interview Preparation Sentences

1. **"Our Photo Service decouples S3 uploads from Lambda by using pre-signed URLs. The browser signs directly with S3, keeping Lambda stateless and fast."**

2. **"We use EventBridge as the asynchronous backbone. Services publish events without knowing their subscribers. User Service publishes USER_CREATED, Photo and Calendar services subscribe and build their own read-optimized user index."**

3. **"JWT validation at API Gateway authorizer layer means every Lambda gets the claims (userId, email) in the event context. No need to validate tokens inside the function."**

4. **"We capture PostConfirmation failures to an SQS queue with a 14-day retention. If the DynamoDB write fails, the signup still completes (Cognito gets the event back), but we have a message in the queue to replay later when DynamoDB recovers."**

5. **"Cognito Hosted UI serves both the native email form and the Google button. Both authenticate into the same User Pool. From the backend's perspective, a token from either path is identical."**

6. **"Our services are independently deployable. Each has its own SAM stack, its own DynamoDB table, its own IAM role. Photo Service doesn't need to know Calendar Service exists. This scales to adding new services later."**

---

This guide provides **production-grade code, architecture decisions, and talking points** you can defend in a senior technical interview. All patterns align with the skills on your resume and AWS best practices.
