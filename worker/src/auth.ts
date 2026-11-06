import type { MiddlewareHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import { sign, verify } from "hono/jwt";
import type { AppEnv } from "./types";

const SESSION_TTL_SECONDS = 7 * 24 * 3600;

export async function issueSession(userId: number, secret: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return sign({ sub: String(userId), iat: now, exp: now + SESSION_TTL_SECONDS }, secret, "HS256");
}

function secretOf(env: AppEnv["Bindings"]): string {
  if (!env.SESSION_SECRET || env.SESSION_SECRET.length < 32) {
    throw new HTTPException(500, { message: "SESSION_SECRET is not configured" });
  }
  return env.SESSION_SECRET;
}

/**
 * Reads `Authorization: Bearer <jwt>`. With `required: false` anonymous
 * requests pass through (used for public listings that personalise when
 * signed in); a present-but-invalid token is always rejected.
 */
export function auth({ required }: { required: boolean }): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const header = c.req.header("Authorization");
    if (!header?.startsWith("Bearer ")) {
      if (required) throw new HTTPException(401, { message: "Not authenticated" });
      return next();
    }
    try {
      const payload = await verify(header.slice(7), secretOf(c.env), "HS256");
      c.set("userId", Number(payload.sub));
    } catch (err) {
      if (err instanceof HTTPException) throw err;
      throw new HTTPException(401, { message: "Invalid or expired session" });
    }
    return next();
  };
}

export { secretOf };
