import {
  APIGatewayProxyResult,
} from "aws-lambda";

import {
  authenticateRequest,
  AuthenticatedEvent,
} from "../middleware/authMiddleware";

export const handler = async (
  event: AuthenticatedEvent
): Promise<APIGatewayProxyResult> => {
  try {
    await authenticateRequest(event);

    return {
      statusCode: 200,

      headers: {
        "Content-Type": "application/json",
      },

      body: JSON.stringify({
        success: true,

        data: {
          userId: event.user?.sub,
          email: event.user?.email,
          name: event.user?.name,
          roles: event.user?.cognitoGroups || [],
        },
      }),
    };
  } catch (error) {
    console.error("Get Current User Error:", error);

    return {
      statusCode: 401,

      headers: {
        "Content-Type": "application/json",
      },

      body: JSON.stringify({
        success: false,
        message: "Unauthorized",
      }),
    };
  }
};