import type { Server as HttpServer } from "node:http";
import { Server } from "socket.io";
import { verifyToken, type AuthConfig } from "./auth.js";
import { User } from "./models.js";

/**
 * Where live events go. The app only talks to this interface, so tests can
 * capture events and the API works without a socket server attached.
 */
export interface Hub {
  toUser(userId: string, event: string, payload: unknown): void;
  toSchool(school: string, event: string, payload: unknown): void;
}

export const nullHub: Hub = { toUser: () => undefined, toSchool: () => undefined };

/** Socket.IO rooms: one per user (notifications) and one per school (live feed). */
export function attachRealtime(server: HttpServer, cfg: AuthConfig, corsOrigin?: string): { hub: Hub; io: Server } {
  const io = new Server(server, { cors: corsOrigin ? { origin: corsOrigin } : undefined });
  io.use(async (socket, next) => {
    try {
      const token = String(socket.handshake.auth?.token ?? "");
      const userId = await verifyToken(token, cfg);
      const user = await User.findById(userId, { "school.domain": 1 }).lean();
      if (!user?.school) return next(new Error("unknown user"));
      socket.data.userId = userId;
      socket.data.school = user.school.domain;
      next();
    } catch {
      next(new Error("unauthorized"));
    }
  });
  io.on("connection", (socket) => {
    void socket.join(`user:${socket.data.userId}`);
    void socket.join(`school:${socket.data.school}`);
  });
  return {
    io,
    hub: {
      toUser: (userId, event, payload) => io.to(`user:${userId}`).emit(event, payload),
      toSchool: (school, event, payload) => io.to(`school:${school}`).emit(event, payload),
    },
  };
}
