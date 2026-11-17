import { existsSync } from "node:fs";
import { MongoMemoryServer } from "mongodb-memory-server";

// One real mongod for the run. Locally a system binary can be used (MONGOMS_SYSTEM_BINARY);
// in CI mongodb-memory-server downloads one.
let mongod;
export async function setup({
  provide
}) {
  if (!process.env.MONGOMS_SYSTEM_BINARY && existsSync("/opt/mongo/bin/mongod")) process.env.MONGOMS_SYSTEM_BINARY = "/opt/mongo/bin/mongod";
  mongod = await MongoMemoryServer.create();
  provide("mongoUri", mongod.getUri());
}
export async function teardown() {
  await mongod?.stop();
}
