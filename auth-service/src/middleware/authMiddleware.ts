import { APIGatewayProxyEvent } from "aws-lambda";
import { jwtVerifier } from "../utils/jwtVerifier";
export interface AuthenticatedUser {
  sub: string;
  email?: string;
  name?: string;
  cognitoGroups?: string[];
}

export interface AuthenticatedEvent extends APIGatewayProxyEvent {
  user?: AuthenticatedUser;
}

export const authenticateRequest = async (
  event: AuthenticatedEvent,
): Promise<void> => {
  try {
    const authHeader =
      event.headers.Authorization || event.headers.authorization;

    if (!authHeader) {
      throw new Error("Missing authorization header");
    }

    const token = authHeader.replace("Bearer ", "");

    const payload = await jwtVerifier.verify(token);

    event.user = {
      sub: String(payload.sub),

      email: typeof payload.email === "string" ? payload.email : undefined,

      name: typeof payload.name === "string" ? payload.name : undefined,

      cognitoGroups: Array.isArray(payload["cognito:groups"])
        ? payload["cognito:groups"].map(String)
        : [],
    };
  } catch (error) {
    console.error("JWT Verification Failed:", error);

    throw new Error("Unauthorized");
  }
};
