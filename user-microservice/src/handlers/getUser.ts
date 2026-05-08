import { APIGatewayProxyHandler } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';

const ddbClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(ddbClient);

export const handler: APIGatewayProxyHandler = async (event) => {
    const userId = event.requestContext.authorizer?.claims.sub;
    const tableName = process.env.USER_PROFILES_TABLE_NAME;

    try {
        const { Item } = await docClient.send(new GetCommand({
            TableName: tableName,
            Key: { userId },
        }));

        return {
            statusCode: 200,
            headers: { "Access-Control-Allow-Origin": "*" }, // Required for React/CORS
            body: JSON.stringify(Item || { message: "User not found" }),
        };
    } catch (error) {
        return {
            statusCode: 500,
            body: JSON.stringify({ message: "Internal Server Error" }),
        };
    }
};