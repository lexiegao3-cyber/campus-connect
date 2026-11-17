import mongoose from "mongoose";
import request from "supertest";
import { inject } from "vitest";
import { createApp } from "../src/app.js";
import { connect } from "../src/db.js";

export const cfg = { secret: new TextEncoder().encode("test-secret-0123456789-0123456789"), ttlSeconds: 3600, devLogin: true, googleClientId: "test-client" };

/** A fresh database per test file, a controllable clock and a hub that records events. */
export async function setupApp(dbName, start = new Date("2026-11-16T12:00:00Z")) {
  await connect(`${inject("mongoUri").replace(/\/?(\?|$)/, `/${dbName}$1`)}`);
  await mongoose.connection.dropDatabase();
  await Promise.all(Object.values(mongoose.models).map((m) => m.syncIndexes()));
  const clock = { now: start };
  const events = [];
  const hub = {
    toUser: (u, event, payload) => events.push({ to: `user:${u}`, event, payload }),
    toSchool: (s, event, payload) => events.push({ to: `school:${s}`, event, payload }),
  };
  const { app, services } = createApp(cfg, {
    hub, now: () => clock.now,
    verifyGoogle: async (credential) => {
      if (credential !== "valid-google-credential-xyz") throw new Error("bad token");
      return { sub: "g-123", email: "gina@upenn.edu", name: "Gina" };
    },
  });
  const signIn = async (email, name = email.split("@")[0]) => {
    const res = await request(app).post("/api/auth/dev").send({ email, name });
    if (res.status !== 200) throw new Error(`sign-in ${res.status} ${JSON.stringify(res.body)}`);
    return { h: { Authorization: `Bearer ${res.body.token}` }, id: res.body.user.id };
  };
  return { app, services, clock, events, signIn, close: () => mongoose.disconnect() };
}

// Pottruck gym and Van Pelt library, ~0.6 km apart.
export const GYM = { lat: 39.9534, lng: -75.1966 };
export const LIBRARY = { lat: 39.9525, lng: -75.1932 };
