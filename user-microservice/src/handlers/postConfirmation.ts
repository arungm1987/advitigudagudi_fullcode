import { PostConfirmationTriggerHandler } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { EventBridgeClient, PutEventsCommand } from '@aws-sdk/client-eventbridge';

// Initialize clients outside the handler for execution environment reuse
const region = "ap-south-1";
const ddbClient = new DynamoDBClient({ region });
const docClient = DynamoDBDocumentClient.from(ddbClient);
const eventBridge = new EventBridgeClient({  });

export const handler: PostConfirmationTriggerHandler = async (event: any) => {
    console.log("Received Event:", JSON.stringify(event, null, 2));

    let requestData;

    // 1. Determine if the event is coming from API Gateway (testing) or Cognito (live)
    if (event.body) {
        // API Gateway path
        const body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
        requestData = body.request;
    } else {
        // Direct Cognito path
        requestData = event.request;
    }

    // Validation check
    if (!requestData || !requestData.userAttributes) {
        console.error("Invalid event structure: userAttributes not found.");
        return {
            statusCode: 400,
            body: JSON.stringify({ message: "Invalid event structure" }),
        };
    }

    const { sub, email, nickname, name } = requestData.userAttributes;
    const tableName = process.env.USER_PROFILES_TABLE_NAME;
    const eventBusName = process.env.EVENT_BUS_NAME;

    try {
        // 2. Persist user to DynamoDB (Awaited to ensure completion)
        console.log(`Writing user ${email} to table ${tableName}`);
        await docClient.send(new PutCommand({
            TableName: tableName,
            Item: {
                userId: sub,
                email: email,
                name: name || nickname || 'New User',
                createdAt: new Date().toISOString(),
            },
        }));

        // 3. Notify other services via EventBridge (Awaited)
        console.log(`Publishing USER_CREATED event to bus ${eventBusName}`);
        await eventBridge.send(new PutEventsCommand({
            Entries: [{
                Source: 'photoshare.users',
                DetailType: 'USER_CREATED',
                Detail: JSON.stringify({ userId: sub, email }),
                EventBusName: eventBusName,
            }],
        }));

        // 4. Return success response
        // Cognito expects the 'event' object back, but API Gateway needs a status code.
        // We return a combined response that satisfies both.
        return {
            ...event,
            statusCode: 200,
            body: JSON.stringify({
                message: "User processed successfully",
                userId: sub
            }),
        };

    } catch (error: any) {
        console.error('Execution Error:', error);

        // Return error for API Gateway visibility
        return {
            statusCode: 500,
            body: JSON.stringify({
                error: "Internal Server Error",
                details: error.message
            }),
        };
    }
};