/**
 * Calendar Service: Join Meeting Handler
 * 
 * Generates a Chime attendee token when a user joins a meeting.
 * Defers Chime session creation to this point (on-demand).
 * 
 * Architecture:
 * 1. Extract userId from JWT
 * 2. Fetch meeting metadata and verify user is invited
 * 3. Create Chime attendee (generates token)
 * 4. Store session in ChimeMeetingSessionTable for tracking
 * 5. Return attendeeInfo and token to frontend
 * 6. Frontend uses token with Chime SDK JavaScript client
 * 
 * This deferred attendee creation pattern:
 * - Avoids creating attendee objects for no-shows
 * - Keeps the createMeeting critical path fast
 * - Still allows the organizer to share meeting details before joining
 */

import { APIGatewayProxyHandler } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { ChimeClient, CreateAttendeeCommand } from '@aws-sdk/client-chime';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { v4 as uuid } from 'uuid';

const ddbClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(ddbClient);
const chimeClient = new ChimeClient({});
const sqsClient = new SQSClient({});

interface JoinMeetingResponse {
  statusCode: number;
  attendeeId: string;
  joinToken: string;
  externalUserId: string;
  requestId: string;
}

interface ErrorResponse {
  statusCode: number;
  code: string;
  message: string;
  requestId: string;
}

async function sendFailureToDLQ(
  dlqUrl: string,
  payload: {
    userId: string;
    meetingId: string;
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
          MeetingId: {
            StringValue: payload.meetingId,
            DataType: 'String',
          },
        },
      })
    );
  } catch (sqsError) {
    console.error(
      JSON.stringify({
        action: 'joinMeeting.dlqError',
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
      action: 'joinMeeting.start',
      requestId,
      path: event.path,
    })
  );

  try {
    // **Extract userId from JWT**
    const userId = event.requestContext.authorizer?.claims?.sub;
    if (!userId) {
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

    // **Extract meetingId from path**
    const meetingId = event.pathParameters?.meetingId;
    if (!meetingId) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          statusCode: 400,
          code: 'INVALID_REQUEST',
          message: 'meetingId is required',
          requestId,
        } as ErrorResponse),
      };
    }

    const meetingTableName = process.env.MEETING_TABLE_NAME!;
    const chimeSessionTableName = process.env.CHIME_SESSION_TABLE_NAME!;
    const dlqUrl = process.env.DLQ_URL!;

    console.log(
      JSON.stringify({
        action: 'joinMeeting.fetching',
        requestId,
        meetingId,
        userId,
      })
    );

    // **Fetch meeting metadata**
    const { Item: meeting } = await docClient.send(
      new GetCommand({
        TableName: meetingTableName,
        Key: { meetingId },
      })
    );

    if (!meeting) {
      console.warn(
        JSON.stringify({
          action: 'joinMeeting.notFound',
          requestId,
          meetingId,
        })
      );

      return {
        statusCode: 404,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          statusCode: 404,
          code: 'MEETING_NOT_FOUND',
          message: 'Meeting not found',
          requestId,
        } as ErrorResponse),
      };
    }

    // **Verify user is the organizer or an invited attendee**
    const isOrganizer = meeting.organizerUserId === userId;
    const isAttendee = meeting.attendees?.some(
      (a: any) => a.userId === userId
    );

    if (!isOrganizer && !isAttendee) {
      console.warn(
        JSON.stringify({
          action: 'joinMeeting.forbidden',
          requestId,
          meetingId,
          userId,
        })
      );

      return {
        statusCode: 403,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          statusCode: 403,
          code: 'FORBIDDEN',
          message: 'You are not invited to this meeting',
          requestId,
        } as ErrorResponse),
      };
    }

    const chimeMeetingId = meeting.chimeMeetingId;

    console.log(
      JSON.stringify({
        action: 'joinMeeting.chime.createAttendee',
        requestId,
        meetingId,
        chimeMeetingId,
        userId,
      })
    );

    // **Create Chime attendee (generates join token)**
    const attendeeResponse = await chimeClient.send(
      new CreateAttendeeCommand({
        MeetingId: chimeMeetingId,
        ExternalUserId: userId,
      })
    );

    const attendeeId = attendeeResponse.Attendee?.AttendeeId;
    const joinToken = attendeeResponse.Attendee?.JoinToken;

    if (!attendeeId || !joinToken) {
      throw new Error('Failed to create Chime attendee: missing attendeeId or joinToken');
    }

    console.log(
      JSON.stringify({
        action: 'joinMeeting.chime.success',
        requestId,
        meetingId,
        attendeeId,
      })
    );

    // **Track user's join session (for presence/analytics)**
    const sessionKey = `${chimeMeetingId}#${userId}`;
    await docClient.send(
      new UpdateCommand({
        TableName: chimeSessionTableName,
        Key: { chimeMeetingId },
        UpdateExpression:
          'SET joinedUsers = list_append(if_not_exists(joinedUsers, :emptyList), :userId), lastActivity = :now',
        ExpressionAttributeValues: {
          ':emptyList': [],
          ':userId': [{ userId, joinedAt: new Date().toISOString() }],
          ':now': new Date().toISOString(),
        },
      })
    );

    // **Optionally update meeting metadata to mark user as joined**
    await docClient.send(
      new UpdateCommand({
        TableName: meetingTableName,
        Key: { meetingId },
        UpdateExpression:
          'SET #attendees = list_append(#attendees, :joinedAttendee) SET #status = :status',
        ExpressionAttributeNames: {
          '#attendees': 'attendees',
          '#status': 'status',
        },
        ExpressionAttributeValues: {
          ':joinedAttendee': [{ userId, joinedAt: new Date().toISOString() }],
          ':status': meeting.status === 'SCHEDULED' ? 'IN_PROGRESS' : meeting.status,
        },
      })
    );

    const durationMs = Date.now() - startTime;

    console.log(
      JSON.stringify({
        action: 'joinMeeting.success',
        requestId,
        meetingId,
        userId,
        attendeeId,
        durationMs,
      })
    );

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        statusCode: 200,
        attendeeId,
        joinToken,
        externalUserId: userId,
        requestId,
      } as JoinMeetingResponse),
    };
  } catch (error: any) {
    const durationMs = Date.now() - startTime;
    const userId = event.requestContext.authorizer?.claims?.sub;
    const meetingId = event.pathParameters?.meetingId;

    console.error(
      JSON.stringify({
        action: 'joinMeeting.error',
        requestId,
        userId,
        meetingId,
        error: error.message,
        code: error.code,
        durationMs,
      })
    );

    // **Send to DLQ**
    const dlqUrl = process.env.DLQ_URL;
    if (dlqUrl && userId && meetingId) {
      await sendFailureToDLQ(dlqUrl, {
        userId,
        meetingId,
        action: 'joinMeeting',
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
        message: 'Failed to join meeting',
        requestId,
      } as ErrorResponse),
    };
  }
};
