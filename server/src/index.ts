import { existsSync } from "node:fs";
import { createServer } from "node:http";
import { resolve } from "node:path";
import express from "express";
import { createApp } from "./app.js";
import { authConfigFromEnv } from "./auth.js";
import { connect } from "./db.js";
import { attachRealtime, nullHub, type Hub } from "./realtime.js";

const port = Number(process.env.PORT ?? 8787);
const uri = process.env.MONGODB_URI ?? "mongodb://127.0.0.1:27017/spotme";
const cfg = authConfigFromEnv();
await connect(uri);

// The socket server needs the HTTP server, which needs the app: route events through a late-bound hub.
let live: Hub = nullHub;
const hub: Hub = { toUser: (...a) => live.toUser(...a), toSchool: (...a) => live.toSchool(...a) };
const { app, services } = createApp(cfg, { hub });

// In production one service serves the API, the socket and the built web app.
const webDist = resolve(process.env.CAMPUS_WEB_DIST ?? "../web/dist");
if (existsSync(resolve(webDist, "index.html"))) {
  app.use(express.static(webDist, { index: false, maxAge: "1h" }));
  app.get("/{*path}", (_req, res) => res.sendFile(resolve(webDist, "index.html")));
}

const server = createServer(app);
live = attachRealtime(server, cfg, process.env.CORS_ORIGIN).hub;

// Fill-by deadlines, auto-cancel and clean-up: every 30 s.
const tick = () => services.sweep().catch((e) => console.error("sweep failed", e));
setInterval(tick, 30_000).unref();
void tick();

server.listen(port, () => console.log(`SpotMe listening on http://localhost:${port}`));
