import { DynamoDBClient, PutItemCommand } from '@aws-sdk/client-dynamodb';
import { EventBridgeClient, PutEventsCommand } from '@aws-sdk/client-eventbridge';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { v4 as uuidv4 } from 'uuid';

/**
 * PostConfirmation handler
 * - Loose event typing (runtime checks) to avoid aws-lambda union mismatch
 * - Writes user profile to DynamoDB
 * - Publishes USER_CREATED event to EventBridge
 * - On error, pushes a structured payload to SQS DLQ and returns the event (non-blocking)
 */

const REGION = process.env.AWS_REGION || 'ap-south-1';
const USERS_TABLE = process.env.USERS_TABLE_NAME || '';
const EVENT_BUS = process.env.EVENT_BUS_NAME || '';
const DLQ_URL = process.env.DLQ_URL || '';

const ddb = new DynamoDBClient({ region: REGION });
const eb = new EventBridgeClient({ region: REGION });
const sqs = new SQSClient({ region: REGION });

const log = (obj: Record<string, any>) => console.log(JSON.stringify(obj));

const sendToDLQ = async (payload: any) => {
  if (!DLQ_URL) {
    log({ service: 'AuthService', action: 'DLQMissing' });
    return;
  }
  try {
    await sqs.send(new SendMessageCommand({ QueueUrl: DLQ_URL, MessageBody: JSON.stringify(payload) }));
    log({ service: 'AuthService', action: 'SentToDLQ', requestId: payload.requestId });
  } catch (err: any) {
    log({
      service: 'AuthService',
      action: 'DLQSendFailed',
      error: err?.message || String(err),
      requestId: payload.requestId,
    });
  }
};

export const handler = async (event: any): Promise<any> => {
  // using any avoids TypeScript union mismatches; runtime checks enforce shape
  const requestId = uuidv4();
  const start = Date.now();

  try {
    const trigger: string = (event?.triggerSource as unknown as string) || '';
    // Only handle the PostConfirmation triggers we expect
    if (!(typeof trigger === 'string' && (trigger === 'PostConfirmation_ConfirmSignUp' || trigger === 'PostConfirmation_ConfirmFederatedIdentity'))) {
      log({ service: 'AuthService', action: 'IgnoredTrigger', requestId, trigger, durationMs: Date.now() - start });
      return event;
    }

    // userAttributes may live in event.request.userAttributes or event.userAttributes
    const attrs = (event?.request?.userAttributes as Record<string, string>) || (event?.userAttributes as Record<string, string>) || {};
    const userId = attrs.sub || event?.userName || '';
    const email = attrs.email || '';
    let name = attrs.name || '';

    // name fallback: given_name + family_name, then local part of email
    if (!name) {
      const given = attrs.given_name || '';
      const family = attrs.family_name || '';
      if (given || family) name = `${given} ${family}`.trim();
    }
    if (!name && email) {
      name = email.split('@')[0];
    }

    const now = new Date().toISOString();

    // Write to DynamoDB
    const item: any = {
      userId: { S: userId },
      email: { S: email },
      name: { S: name },
      createdAt: { S: now },
      triggerSource: { S: trigger },
    };

    await ddb.send(new PutItemCommand({ TableName: USERS_TABLE, Item: item }));

    // Publish USER_CREATED event to EventBridge
    const detail = {
      schemaVersion: '1.0',
      userId,
      email,
      name,
      createdAt: now,
      triggerSource: trigger,
    };

    await eb.send(
      new PutEventsCommand({
        Entries: [
          {
            EventBusName: EVENT_BUS,
            Source: 'auth-service',
            DetailType: 'UserCreated',
            Detail: JSON.stringify(detail),
          },
        ],
      })
    );

    log({ service: 'AuthService', action: 'UserCreated', requestId, userId, email, name, durationMs: Date.now() - start });
    return event;
  } catch (err: any) {
    const payload = {
      requestId,
      service: 'AuthService',
      handler: 'PostConfirmation',
      reason: 'HandlerError',
      details: { message: err?.message || String(err), stack: err?.stack },
      userId: event?.request?.userAttributes?.sub || event?.userName,
      email: event?.request?.userAttributes?.email,
      failedAt: new Date().toISOString(),
    };
    log({ service: 'AuthService', action: 'PostConfirmationError', error: err?.message, requestId });
    await sendToDLQ(payload);
    // Return event so Cognito flow is not blocked
    return event;
  }
};