/**
 * Photo Service: Share Photo Handler
 * 
 * Shares a photo with specific users by userId or email.
 * Emits PHOTO_SHARED event to EventBridge for downstream subscribers.
 * Uses user index table for email-to-userId lookup.
 * 
 * Architecture:
 * 1. Extract userId and photoId from JWT/path
 * 2. Validate photo exists and user is owner
 * 3. Resolve shared user IDs (from both direct IDs and emails)
 * 4. Update photo metadata with shared list
 * 5. Emit PHOTO_SHARED event to EventBridge
 * 6. Return success response
 * 
 * Idempotency: Sharing the same photo with the same user twice is idempotent
 */

import { APIGatewayProxyHandler } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { EventBridgeClient, PutEventsCommand } from '@aws-sdk/client-eventbridge';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { v4 as uuid } from 'uuid';

const ddbClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(ddbClient);
const eventBridgeClient = new EventBridgeClient({});
const sqsClient = new SQSClient({});

interface SharePhotoRequest {
  userIds?: string[];
  emails?: string[];
}

interface PhotoShareEvent {
  photoId: string;
  uploaderUserId: string;
  title: string;
  sharedWith: string[];
  sharedAt: string;
  schemaVersion: '1.0';
}

interface ErrorResponse {
  statusCode: number;
  code: string;
  message: string;
  requestId: string;
}

interface SuccessResponse {
  statusCode: number;
  photoId: string;
  sharedWith: string[];
  requestId: string;
}

/**
 * Lookup email to userId mapping in the user index table
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
        action: 'sharePhoto.emailLookup.error',
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
    photoId: string;
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
          PhotoId: {
            StringValue: payload.photoId,
            DataType: 'String',
          },
        },
      })
    );
  } catch (sqsError) {
    console.error(
      JSON.stringify({
        action: 'sharePhoto.dlqError',
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
      action: 'sharePhoto.start',
      requestId,
      path: event.path,
      method: event.httpMethod,
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

    // **Extract photoId from path**
    const photoId = event.pathParameters?.photoId;
    if (!photoId) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          statusCode: 400,
          code: 'INVALID_REQUEST',
          message: 'photoId is required',
          requestId,
        } as ErrorResponse),
      };
    }

    // **Parse request body**
    const body = JSON.parse(event.body || '{}') as SharePhotoRequest;
    const { userIds = [], emails = [] } = body;

    if (userIds.length === 0 && emails.length === 0) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          statusCode: 400,
          code: 'INVALID_REQUEST',
          message: 'At least one userId or email is required',
          requestId,
        } as ErrorResponse),
      };
    }

    const photoTableName = process.env.PHOTO_METADATA_TABLE_NAME!;
    const userIndexTableName = process.env.USER_INDEX_TABLE_NAME!;
    const eventBusName = process.env.EVENT_BUS_NAME!;
    const dlqUrl = process.env.DLQ_URL!;

    console.log(
      JSON.stringify({
        action: 'sharePhoto.fetching',
        requestId,
        photoId,
        userId,
      })
    );

    // **Fetch photo metadata**
    const { Item: photo } = await docClient.send(
      new GetCommand({
        TableName: photoTableName,
        Key: { photoId },
      })
    );

    if (!photo) {
      console.warn(
        JSON.stringify({
          action: 'sharePhoto.notFound',
          requestId,
          photoId,
        })
      );

      return {
        statusCode: 404,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          statusCode: 404,
          code: 'PHOTO_NOT_FOUND',
          message: 'Photo not found',
          requestId,
        } as ErrorResponse),
      };
    }

    // **Verify user is the photo owner**
    if (photo.uploaderUserId !== userId) {
      console.warn(
        JSON.stringify({
          action: 'sharePhoto.forbidden',
          requestId,
          photoId,
          userId,
          ownerId: photo.uploaderUserId,
        })
      );

      return {
        statusCode: 403,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          statusCode: 403,
          code: 'FORBIDDEN',
          message: 'You do not own this photo',
          requestId,
        } as ErrorResponse),
      };
    }

    // **Resolve email addresses to userIds**
    const resolvedUserIds = new Set(userIds);

    console.log(
      JSON.stringify({
        action: 'sharePhoto.resolvingEmails',
        requestId,
        emailCount: emails.length,
      })
    );

    for (const email of emails) {
      const resolvedId = await lookupUserByEmail(email, userIndexTableName);
      if (resolvedId) {
        resolvedUserIds.add(resolvedId);
      } else {
        console.warn(
          JSON.stringify({
            action: 'sharePhoto.emailNotFound',
            requestId,
            email,
          })
        );
      }
    }

    // **Filter out self-sharing**
    resolvedUserIds.delete(userId);

    if (resolvedUserIds.size === 0) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          statusCode: 400,
          code: 'NO_VALID_RECIPIENTS',
          message: 'No valid user IDs resolved from provided userIds and emails',
          requestId,
        } as ErrorResponse),
      };
    }

    // **Merge with existing shared list (idempotent)**
    const currentSharedWith = photo.sharedWith || [];
    const newSharedWith = Array.from(new Set([...currentSharedWith, ...resolvedUserIds]));

    console.log(
      JSON.stringify({
        action: 'sharePhoto.updating',
        requestId,
        photoId,
        oldCount: currentSharedWith.length,
        newCount: newSharedWith.length,
      })
    );

    // **Update photo metadata**
    await docClient.send(
      new UpdateCommand({
        TableName: photoTableName,
        Key: { photoId },
        UpdateExpression: 'SET sharedWith = :sharedWith, updatedAt = :updatedAt',
        ExpressionAttributeValues: {
          ':sharedWith': newSharedWith,
          ':updatedAt': new Date().toISOString(),
        },
      })
    );

    // **Emit PHOTO_SHARED event**
    const shareEvent: PhotoShareEvent = {
      photoId,
      uploaderUserId: userId,
      title: photo.title,
      sharedWith: newSharedWith,
      sharedAt: new Date().toISOString(),
      schemaVersion: '1.0',
    };

    console.log(
      JSON.stringify({
        action: 'sharePhoto.eventbridge.publish',
        requestId,
        photoId,
        eventType: 'PHOTO_SHARED',
        recipients: newSharedWith.length,
      })
    );

    await eventBridgeClient.send(
      new PutEventsCommand({
        Entries: [
          {
            Source: 'photoshare.photos',
            DetailType: 'PHOTO_SHARED',
            Detail: JSON.stringify(shareEvent),
            EventBusName: eventBusName,
            Resources: [photoId],
          },
        ],
      })
    );

    const durationMs = Date.now() - startTime;

    console.log(
      JSON.stringify({
        action: 'sharePhoto.success',
        requestId,
        photoId,
        userId,
        recipients: newSharedWith.length,
        durationMs,
      })
    );

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        statusCode: 200,
        photoId,
        sharedWith: newSharedWith,
        requestId,
      } as SuccessResponse),
    };
  } catch (error: any) {
    const durationMs = Date.now() - startTime;
    const userId = event.requestContext.authorizer?.claims?.sub;
    const photoId = event.pathParameters?.photoId;

    console.error(
      JSON.stringify({
        action: 'sharePhoto.error',
        requestId,
        userId,
        photoId,
        error: error.message,
        code: error.code,
        durationMs,
      })
    );

    // **Send to DLQ**
    const dlqUrl = process.env.DLQ_URL;
    if (dlqUrl && userId && photoId) {
      await sendFailureToDLQ(dlqUrl, {
        userId,
        photoId,
        action: 'sharePhoto',
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
        message: 'Failed to share photo',
        requestId,
      } as ErrorResponse),
    };
  }
};
