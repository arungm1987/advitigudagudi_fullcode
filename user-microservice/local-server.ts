import express from 'express';
import cors from 'cors';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, PutCommand } from '@aws-sdk/lib-dynamodb';

const app = express();
app.use(express.json());
app.use(cors());

// DynamoDB configuration for local
const ddbClient = new DynamoDBClient({
    region: 'us-east-1',
    endpoint: process.env.DYNAMODB_ENDPOINT || 'http://localhost:8000',
    credentials: {
        accessKeyId: 'local',
        secretAccessKey: 'local'
    }
});

const docClient = DynamoDBDocumentClient.from(ddbClient);
const TABLE_NAME = process.env.USER_PROFILES_TABLE_NAME || 'advitigudagudi-user-service-Profiles';

// GET /users - Fetch all users
app.get('/users', async (req, res) => {
    try {
        const result = await docClient.send(new ScanCommand({
            TableName: TABLE_NAME,
        }));

        res.status(200).json({
            users: result.Items || [],
            count: result.Count || 0,
            message: 'Users fetched successfully'
        });
    } catch (error) {
        console.error('Error fetching users:', error);
        res.status(500).json({ 
            message: 'Internal Server Error',
            error: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});

// POST /test-registration - Create a test user
app.post('/test-registration', async (req, res) => {
    try {
        const { userId, name, email, phone } = req.body;
        
        if (!userId) {
            return res.status(400).json({ message: 'userId is required' });
        }

        const user = {
            userId,
            name: name || 'Test User',
            email: email || 'test@example.com',
            phone: phone || '1234567890',
            createdAt: new Date().toISOString(),
        };

        await docClient.send(new PutCommand({
            TableName: TABLE_NAME,
            Item: user,
        }));

        res.status(201).json({
            message: 'User created successfully',
            user
        });
    } catch (error) {
        console.error('Error creating user:', error);
        res.status(500).json({ 
            message: 'Internal Server Error',
            error: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});

// Health check
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'healthy', timestamp: new Date().toISOString() });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n🚀 User Microservice running on http://0.0.0.0:${PORT}`);
    console.log(`   - GET  /users              - Fetch all users`);
    console.log(`   - POST /test-registration - Create a test user`);
    console.log(`   - GET  /health            - Health check\n`);
});

