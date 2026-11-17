import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import mongoose from "mongoose";
import { io as connectClient, type Socket } from "socket.io-client";
import request from "supertest";
import { afterAll, beforeAll, expect, it, inject } from "vitest";
import { createApp } from "../src/app.js";
import { connect } from "../src/db.js";
import { attachRealtime, nullHub, type Hub } from "../src/realtime.js";
import { cfg, GYM } from "./helpers.js";

let server: Server, base: string, app: ReturnType<typeof createApp>["app"];
const sockets: Socket[] = [];
beforeAll(async () => {
  await connect(inject("mongoUri").replace(/\/?(\?|$)/, "/realtime$1"));
  await mongoose.connection.dropDatabase();
  await Promise.all(Object.values(mongoose.models).map((m) => m.syncIndexes()));
  let live: Hub = nullHub;
  ({ app } = createApp(cfg, { hub: { toUser: (...a) => live.toUser(...a), toSchool: (...a) => live.toSchool(...a) } }));
  server = createServer(app);
  live = attachRealtime(server, cfg).hub;
  await new Promise<void>((r) => server.listen(0, r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  for (const s of sockets) s.disconnect();
  await new Promise((r) => server.close(r));
  await mongoose.disconnect();
});

const signIn = async (email: string) => (await request(app).post("/api/auth/dev").send({ email, name: email.split("@")[0] })).body.token as string;
const open = (token: string) =>
  new Promise<Socket>((resolve, reject) => {
    const s = connectClient(base, { auth: { token }, transports: ["websocket"] });
    sockets.push(s);
    s.on("connect", () => resolve(s));
    s.on("connect_error", reject);
  });

it("pushes a 'joined' notification to the host over the socket, and rejects bad tokens", async () => {
  const hostToken = await signIn("rt-host@upenn.edu");
  const joinerToken = await signIn("rt-joiner@upenn.edu");
  const hostSocket = await open(hostToken);
  await expect(open("not-a-token")).rejects.toThrow(/unauthorized/);

  const start = new Date(Date.now() + 2 * 864e5);
  const a = await request(app).post("/api/activities").set({ Authorization: `Bearer ${hostToken}` }).send({
    title: "Pickup basketball", category: "sports", sport: "basketball", capacity: 6,
    startsAt: start.toISOString(), endsAt: new Date(start.getTime() + 2 * 3600_000).toISOString(),
    fillBy: new Date(start.getTime() - 3600_000).toISOString(), area: { name: "Gym", point: GYM },
  }).expect(201);

  const got = new Promise<{ type: string; params: { name: string } }>((r) => hostSocket.on("notification", r));
  const t0 = performance.now();
  await request(app).post(`/api/activities/${a.body.activity.id}/join`).set({ Authorization: `Bearer ${joinerToken}` }).expect(200);
  const n = await got;
  expect(n.type).toBe("joined");
  expect(n.params.name).toBe("rt-joiner");
  expect(performance.now() - t0).toBeLessThan(1000);
});
