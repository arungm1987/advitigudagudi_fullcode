/**
 * Photo Service: Create Presigned URL Handler
 * 
 * Generates a pre-signed S3 URL for browser-direct photo uploads.
 * Avoids streaming file data through Lambda by delegating to S3.
 * Pre-registers photo metadata in DynamoDB with PENDING_UPLOAD status.
 * 
 * Architecture:
 * 1. Extract userId from JWT claims
 * 2. Validate request (title, contentType required)
 * 3. Generate photoId (UUID)
 * 4. Create S3 PutObjectCommand with metadata
 * 5. Generate presigned URL (15-minute expiry)
 * 6. Pre-register metadata in DynamoDB
 * 7. Return presignedUrl to frontend for direct upload
 * 
 * Idempotency: Request repeats with same photoId return the same presigned URL
 */

import { APIGatewayProxyHandler } from 'aws-lambda';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { v4 as uuid } from 'uuid';
import * as crypto from 'crypto';

const s3Client = new S3Client({});
const ddbClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(ddbClient);
const sqsClient = new SQSClient({});

interface CreatePresignedUrlRequest {
  title: string;
  description?: string;
  contentType: string;
  idempotencyKey?: string;
}

interface PhotoMetadata {
  photoId: string;
  uploaderUserId: string;
  title: string;
  description: string;
  s3Key: string;
  s3Bucket: string;
  status: 'PENDING_UPLOAD' | 'CONFIRMED' | 'DELETED';
  sharedWith: string[];
  createdAt: string;
  expiresAt: string;
}

interface CreatePresignedUrlResponse {
  statusCode: number;
  photoId: string;
  presignedUrl: string;
  s3Key: string;
  expiresIn: number;
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
        action: 'createPresignedUrl.dlqError',
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
      action: 'createPresignedUrl.start',
      requestId,
      path: event.path,
      method: event.httpMethod,
    })
  );

  try {
    // **Extract userId from JWT**
    const userId = event.requestContext.authorizer?.claims?.sub;
    if (!userId) {
      console.warn(
        JSON.stringify({
          action: 'createPresignedUrl.unauthorized',
          requestId,
        })
      );

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
    const body = JSON.parse(event.body || '{}') as CreatePresignedUrlRequest;
    const { title, description = '', contentType, idempotencyKey } = body;

    // **Validate required fields**
    if (!title || !contentType) {
      console.warn(
        JSON.stringify({
          action: 'createPresignedUrl.validationError',
          requestId,
          userId,
          missing: {
            title: !title,
            contentType: !contentType,
          },
        })
      );

      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          statusCode: 400,
          code: 'INVALID_REQUEST',
          message: 'title and contentType are required',
          requestId,
        } as ErrorResponse),
      };
    }

    // **Validate contentType is an image**
    if (!contentType.startsWith('image/')) {
      console.warn(
        JSON.stringify({
          action: 'createPresignedUrl.invalidContentType',
          requestId,
          userId,
          contentType,
        })
      );

      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          statusCode: 400,
          code: 'INVALID_CONTENT_TYPE',
          message: 'Only image/* contentType allowed',
          requestId,
        } as ErrorResponse),
      };
    }

    const bucketName = process.env.PHOTO_BUCKET_NAME!;
    const tableName = process.env.PHOTO_METADATA_TABLE_NAME!;
    const dlqUrl = process.env.DLQ_URL!;

    if (!bucketName || !tableName || !dlqUrl) {
      throw new Error('Missing environment variables: PHOTO_BUCKET_NAME, PHOTO_METADATA_TABLE_NAME, DLQ_URL');
    }

    // **Generate or use provided photoId**
    const photoId = idempotencyKey ? crypto.createHash('sha256').update(idempotencyKey).digest('hex').slice(0, 32) : uuid();
    const s3Key = `photos/${userId}/${photoId}`;

    console.log(
      JSON.stringify({
        action: 'createPresignedUrl.processing',
        requestId,
        userId,
        photoId,
        s3Key,
        title,
      })
    );

    // **Check if this photoId already exists (idempotency)**
    try {
      const existingItem = await docClient.send(
        new GetCommand({
          TableName: tableName,
          Key: { photoId },
        })
      );

      if (existingItem.Item) {
        console.log(
          JSON.stringify({
            action: 'createPresignedUrl.idempotentReturn',
            requestId,
            photoId,
            userId,
          })
        );

        // Regenerate presigned URL from existing metadata
        const command = new PutObjectCommand({
          Bucket: bucketName,
          Key: existingItem.Item.s3Key,
          ContentType: contentType,
          Metadata: {
            photoId,
            userId,
            uploadedBy: userId,
          },
        });

        const presignedUrl = await getSignedUrl(s3Client, command, {
          expiresIn: 900,
        });

        return {
          statusCode: 200,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            statusCode: 200,
            photoId,
            presignedUrl,
            s3Key: existingItem.Item.s3Key,
            expiresIn: 900,
            requestId,
          } as CreatePresignedUrlResponse),
        };
      }
    } catch (getError: any) {
      if (getError.name !== 'ResourceNotFoundException') {
        throw getError;
      }
      // Item doesn't exist, proceed to create
    }

    // **Create S3 presigned URL (15-minute expiry)**
    const putCommand = new PutObjectCommand({
      Bucket: bucketName,
      Key: s3Key,
      ContentType: contentType,
      Metadata: {
        photoId,
        userId,
        uploadedBy: userId,
        createdAt: new Date().toISOString(),
      },
    });

    console.log(
      JSON.stringify({
        action: 'createPresignedUrl.s3.presign',
        requestId,
        photoId,
        bucket: bucketName,
        s3Key,
      })
    );

    const presignedUrl = await getSignedUrl(s3Client, putCommand, {
      expiresIn: 900, // 15 minutes
    });

    // **Pre-register metadata in DynamoDB**
    const metadata: PhotoMetadata = {
      photoId,
      uploaderUserId: userId,
      title: title.trim(),
      description: description.trim(),
      s3Key,
      s3Bucket: bucketName,
      status: 'PENDING_UPLOAD',
      sharedWith: [],
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 86400000).toISOString(), // 24 hours
    };

    console.log(
      JSON.stringify({
        action: 'createPresignedUrl.dynamodb.put',
        requestId,
        photoId,
        table: tableName,
      })
    );

    await docClient.send(
      new PutCommand({
        TableName: tableName,
        Item: metadata,
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
    const durationMs = Date.now() - startTime;

    console.error(
      JSON.stringify({
        action: 'createPresignedUrl.error',
        requestId,
        userId: event.requestContext.authorizer?.claims?.sub,
        error: error.message,
        code: error.code,
        durationMs,
      })
    );

    // **Send to DLQ for operational visibility**
    const dlqUrl = process.env.DLQ_URL;
    if (dlqUrl) {
      await sendFailureToDLQ(dlqUrl, {
        userId: event.requestContext.authorizer?.claims?.sub || 'unknown',
        action: 'createPresignedUrl',
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
        message: 'Failed to create presigned URL',
        requestId,
      } as ErrorResponse),
    };
  }
};
