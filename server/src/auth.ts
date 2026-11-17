import type { RequestHandler } from "express";
import { OAuth2Client } from "google-auth-library";
import { jwtVerify, SignJWT } from "jose";
import { HttpError } from "./errors.js";

export interface AuthConfig {
  secret: Uint8Array;
  ttlSeconds: number;
  googleClientId?: string;
  /** Email-only sign-in for local development and demos; off in production unless enabled. */
  devLogin: boolean;
}

export function authConfigFromEnv(env = process.env): AuthConfig {
  const raw = env.CAMPUS_JWT_SECRET;
  if (!raw && env.NODE_ENV === "production") throw new Error("CAMPUS_JWT_SECRET is required in production");
  return {
    secret: new TextEncoder().encode(raw ?? "dev-only-secret-change-me-0123456789"),
    ttlSeconds: Number(env.CAMPUS_JWT_TTL_SECONDS ?? 7 * 24 * 3600),
    googleClientId: env.GOOGLE_CLIENT_ID || undefined,
    devLogin: env.ALLOW_DEV_LOGIN ? env.ALLOW_DEV_LOGIN === "true" : env.NODE_ENV !== "production",
  };
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

export const issueToken = (userId: string, cfg: AuthConfig) =>
  new SignJWT({}).setProtectedHeader({ alg: "HS256" }).setSubject(userId).setIssuedAt().setExpirationTime(`${cfg.ttlSeconds}s`).sign(cfg.secret);

export async function verifyToken(token: string, cfg: AuthConfig): Promise<string> {
  const { payload } = await jwtVerify(token, cfg.secret, { algorithms: ["HS256"] });
  if (!payload.sub) throw new Error("no subject");
  return payload.sub;
}

export function requireAuth(cfg: AuthConfig): RequestHandler {
  return async (req, _res, next) => {
    const h = req.headers.authorization;
    if (!h?.startsWith("Bearer ")) return next(new HttpError(401, "Sign in required"));
    try {
      req.userId = await verifyToken(h.slice(7), cfg);
      next();
    } catch {
      next(new HttpError(401, "Session expired, sign in again"));
    }
  };
}

export interface GoogleIdentity {
  sub: string;
  email: string;
  name: string;
}

/** Verifies a Google Identity Services ID token (signature, audience, expiry, verified email). */
export async function verifyGoogleCredential(credential: string, clientId: string, client = new OAuth2Client(clientId)): Promise<GoogleIdentity> {
  const ticket = await client.verifyIdToken({ idToken: credential, audience: clientId });
  const p = ticket.getPayload();
  if (!p?.sub || !p.email || !p.email_verified) throw new HttpError(401, "Google account email is not verified");
  return { sub: p.sub, email: p.email.toLowerCase(), name: p.name ?? p.email.split("@")[0]! };
}
