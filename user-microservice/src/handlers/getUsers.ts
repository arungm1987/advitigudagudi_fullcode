import { APIGatewayProxyHandler } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';

const ddbClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(ddbClient);

export const handler: APIGatewayProxyHandler = async (event) => {
    const tableName = process.env.USER_PROFILES_TABLE_NAME;

    try {
        const result = await docClient.send(new ScanCommand({
            TableName: tableName,
        }));

        return {
            statusCode: 200,
            headers: { "Access-Control-Allow-Origin": "*" },
            body: JSON.stringify({
                users: result.Items || [],
                count: result.Count || 0
            }),
        };
    } catch (error) {
        console.error('Error fetching users:', error);
        return {
            statusCode: 500,
            headers: { "Access-Control-Allow-Origin": "*" },
            body: JSON.stringify({ message: "Internal Server Error" }),
        };
    }
};
