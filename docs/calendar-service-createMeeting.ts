/**
 * Calendar Service: Create Meeting Handler
 * 
 * Creates a meeting scheduled for a specific time and invites attendees.
 * Integrates with Amazon Chime SDK to generate meeting sessions on-demand.
 * 
 * Architecture:
 * 1. Extract userId (organizer) from JWT
 * 2. Validate request (title, scheduledTime, attendeeIds/emails required)
 * 3. Resolve email addresses to userIds
 * 4. Create Chime meeting
 * 5. Store meeting metadata in DynamoDB
 * 6. Emit MEETING_SCHEDULED event to EventBridge
 * 7. Return meeting ID and metadata
 * 
 * The actual Chime session creation is deferred until user joins (see joinMeeting.ts)
 * This keeps the critical path fast and avoids creating unused Chime sessions.
 */

import { APIGatewayProxyHandler } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { ChimeClient, CreateMeetingCommand } from '@aws-sdk/client-chime';
import { EventBridgeClient, PutEventsCommand } from '@aws-sdk/client-eventbridge';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { v4 as uuid } from 'uuid';

const ddbClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(ddbClient);
const chimeClient = new ChimeClient({});
const eventBridgeClient = new EventBridgeClient({});
const sqsClient = new SQSClient({});

interface CreateMeetingRequest {
  title: string;
  description?: string;
  scheduledTime: string; // ISO 8601 datetime
  durationMinutes?: number;
  attendeeUserIds?: string[];
  attendeeEmails?: string[];
}

interface MeetingMetadata {
  meetingId: string;
  chimeMeetingId: string;
  organizerUserId: string;
  title: string;
  description: string;
  scheduledTime: string;
  durationMinutes: number;
  attendees: Array<{
    userId: string;
    email: string;
    joinedAt?: string;
  }>;
  status: 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED';
  createdAt: string;
}

interface CreateMeetingResponse {
  statusCode: number;
  meetingId: string;
  chimeMeetingId: string;
  attendeeCount: number;
  requestId: string;
}

interface ErrorResponse {
  statusCode: number;
  code: string;
  message: string;
  requestId: string;
}

/**
 * Lookup email to userId from user index
 */
async function lookupUserByEmail(email: string, userIndexTableName: string): Promise<string | null> {
  try {
    const result = await docClient.send(
      new QueryCommand({
        TableName: userIndexTableName,
        IndexName: 'emailIndex',
        KeyConditionExpression: 'email = :email',
        ExpressionAttributeValues: {
          ':email': email.toLowerCase(),
        },
        Limit: 1,
      })
    );

    return result.Items?.[0]?.userId || null;
  } catch (error) {
    console.warn(
      JSON.stringify({
        action: 'createMeeting.emailLookup.error',
        email,
        error: (error as Error).message,
      })
    );
    return null;
  }
}

async function sendFailureToDLQ(
  dlqUrl: string,
  payload: {
    userId: string;
    action: string;
    reason: string;
    error: string;
    timestamp: string;
  }
): Promise<void> {
  try {
    await sqsClient.send(
      new SendMessageCommand({
        QueueUrl: dlqUrl,
        MessageBody: JSON.stringify(payload),
        MessageAttributes: {
          Action: {
            StringValue: payload.action,
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
    console.error(
      JSON.stringify({
        action: 'createMeeting.dlqError',
        error: (sqsError as Error).message,
      })
    );
  }
}

export const handler: APIGatewayProxyHandler = async (event) => {
  const requestId = uuid();
  const startTime = Date.now();

  console.log(
    JSON.stringify({
      action: 'createMeeting.start',
      requestId,
      path: event.path,
    })
  );

  try {
    // **Extract organizer userId from JWT**
    const organizerUserId = event.requestContext.authorizer?.claims?.sub;
    if (!organizerUserId) {
      return {
        statusCode: 401,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          statusCode: 401,
          code: 'UNAUTHORIZED',
          message: 'Missing or invalid authorization',
          requestId,
        } as ErrorResponse),
      };
    }

    // **Parse request body**
    const body = JSON.parse(event.body || '{}') as CreateMeetingRequest;
    const {
      title,
      description = '',
      scheduledTime,
      durationMinutes = 60,
      attendeeUserIds = [],
      attendeeEmails = [],
    } = body;

    // **Validate required fields**
    if (!title || !scheduledTime) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          statusCode: 400,
          code: 'INVALID_REQUEST',
          message: 'title and scheduledTime are required',
          requestId,
        } as ErrorResponse),
      };
    }

    // **Validate scheduledTime is in the future**
    const scheduledDate = new Date(scheduledTime);
    if (scheduledDate <= new Date()) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          statusCode: 400,
          code: 'INVALID_TIME',
          message: 'scheduledTime must be in the future',
          requestId,
        } as ErrorResponse),
      };
    }

    if (attendeeUserIds.length === 0 && attendeeEmails.length === 0) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          statusCode: 400,
          code: 'INVALID_REQUEST',
          message: 'At least one attendee (userId or email) is required',
          requestId,
        } as ErrorResponse),
      };
    }

    const meetingTableName = process.env.MEETING_TABLE_NAME!;
    const userIndexTableName = process.env.USER_INDEX_TABLE_NAME!;
    const chimeSessionTableName = process.env.CHIME_SESSION_TABLE_NAME!;
    const eventBusName = process.env.EVENT_BUS_NAME!;
    const dlqUrl = process.env.DLQ_URL!;

    // **Resolve email addresses to userIds**
    const resolvedAttendeeIds = new Set(attendeeUserIds);

    console.log(
      JSON.stringify({
        action: 'createMeeting.resolvingEmails',
        requestId,
        emailCount: attendeeEmails.length,
      })
    );

    for (const email of attendeeEmails) {
      const resolvedId = await lookupUserByEmail(email, userIndexTableName);
      if (resolvedId) {
        resolvedAttendeeIds.add(resolvedId);
      } else {
        console.warn(
          JSON.stringify({
            action: 'createMeeting.emailNotFound',
            requestId,
            email,
          })
        );
      }
    }

    // **Filter out organizer from attendees**
    resolvedAttendeeIds.delete(organizerUserId);

    if (resolvedAttendeeIds.size === 0) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          statusCode: 400,
          code: 'NO_VALID_ATTENDEES',
          message: 'No valid attendees resolved from provided IDs and emails',
          requestId,
        } as ErrorResponse),
      };
    }

    const meetingId = uuid();

    // **Create Chime meeting**
    console.log(
      JSON.stringify({
        action: 'createMeeting.chime.create',
        requestId,
        meetingId,
        title,
      })
    );

    const chimeMeetingResponse = await chimeClient.send(
      new CreateMeetingCommand({
        ClientRequestToken: meetingId,
        MediaRegion: process.env.AWS_REGION || 'ap-south-1',
        MeetingFeatures: {
          Audio: {
            EchoReduction: 'AVAILABLE',
          },
          Video: {
            MaxResolution: 'FHD',
          },
        },
        NotificationsConfiguration: {
          SqsQueueArn: undefined, // Optional: set up if you want meeting events
          SnsTopicArn: undefined,
        },
      })
    );

    const chimeMeetingId = chimeMeetingResponse.Meeting?.MeetingId;
    if (!chimeMeetingId) {
      throw new Error('Failed to create Chime meeting: no MeetingId returned');
    }

    console.log(
      JSON.stringify({
        action: 'createMeeting.chime.success',
        requestId,
        meetingId,
        chimeMeetingId,
      })
    );

    // **Build attendees array**
    const attendees = Array.from(resolvedAttendeeIds).map((attendeeId) => ({
      userId: attendeeId,
      email: '', // Would be populated if we had a user -> email lookup
    }));

    // **Store meeting metadata in DynamoDB**
    const meetingMetadata: MeetingMetadata = {
      meetingId,
      chimeMeetingId,
      organizerUserId,
      title: title.trim(),
      description: description.trim(),
      scheduledTime: scheduledDate.toISOString(),
      durationMinutes,
      attendees,
      status: 'SCHEDULED',
      createdAt: new Date().toISOString(),
    };

    console.log(
      JSON.stringify({
        action: 'createMeeting.dynamodb.put',
        requestId,
        meetingId,
        table: meetingTableName,
      })
    );

    await docClient.send(
      new PutCommand({
        TableName: meetingTableName,
        Item: meetingMetadata,
      })
    );

    // **Also store Chime session mapping for quick lookup on join**
    await docClient.send(
      new PutCommand({
        TableName: chimeSessionTableName,
        Item: {
          chimeMeetingId,
          meetingId,
          organizerUserId,
          createdAt: new Date().toISOString(),
          expiresAt: Math.floor(
            new Date(scheduledDate.getTime() + durationMinutes * 60000).getTime() / 1000
          ), // TTL: meeting end time
        },
      })
    );

    // **Emit MEETING_SCHEDULED event**
    console.log(
      JSON.stringify({
        action: 'createMeeting.eventbridge.publish',
        requestId,
        meetingId,
        attendeeCount: attendees.length,
      })
    );

    await eventBridgeClient.send(
      new PutEventsCommand({
        Entries: [
          {
            Source: 'photoshare.calendar',
            DetailType: 'MEETING_SCHEDULED',
            Detail: JSON.stringify({
              meetingId,
              chimeMeetingId,
              organizerUserId,
              title,
              scheduledTime: scheduledDate.toISOString(),
              attendeeCount: attendees.length,
              timestamp: new Date().toISOString(),
              schemaVersion: '1.0',
            }),
            EventBusName: eventBusName,
            Resources: [meetingId],
          },
        ],
      })
    );

    const durationMs = Date.now() - startTime;

    console.log(
      JSON.stringify({
        action: 'createMeeting.success',
        requestId,
        meetingId,
        chimeMeetingId,
        organizerUserId,
        attendeeCount: attendees.length,
        durationMs,
      })
    );

    return {
      statusCode: 201,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        statusCode: 201,
        meetingId,
        chimeMeetingId,
        attendeeCount: attendees.length,
        requestId,
      } as CreateMeetingResponse),
    };
  } catch (error: any) {
    const durationMs = Date.now() - startTime;
    const organizerUserId = event.requestContext.authorizer?.claims?.sub;

    console.error(
      JSON.stringify({
        action: 'createMeeting.error',
        requestId,
        organizerUserId,
        error: error.message,
        code: error.code,
        durationMs,
      })
    );

    // **Send to DLQ**
    const dlqUrl = process.env.DLQ_URL;
    if (dlqUrl && organizerUserId) {
      await sendFailureToDLQ(dlqUrl, {
        userId: organizerUserId,
        action: 'createMeeting',
        reason: 'Handler exception',
        error: error.message,
        timestamp: new Date().toISOString(),
      });
    }

    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        statusCode: 500,
        code: 'INTERNAL_ERROR',
        message: 'Failed to create meeting',
        requestId,
      } as ErrorResponse),
    };
  }
};
