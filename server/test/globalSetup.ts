import { existsSync } from "node:fs";
import { MongoMemoryServer } from "mongodb-memory-server";

// One real mongod for the run. Locally a system binary can be used (MONGOMS_SYSTEM_BINARY);
// in CI mongodb-memory-server downloads one.
let mongod: MongoMemoryServer;
export async function setup({ provide }: { provide: (k: string, v: string) => void }) {
  if (!process.env.MONGOMS_SYSTEM_BINARY && existsSync("/opt/mongo/bin/mongod")) process.env.MONGOMS_SYSTEM_BINARY = "/opt/mongo/bin/mongod";
  mongod = await MongoMemoryServer.create();
  provide("mongoUri", mongod.getUri());
}
export async function teardown() {
  await mongod?.stop();
}
declare module "vitest" {
  export interface ProvidedContext {
    mongoUri: string;
  }
}
