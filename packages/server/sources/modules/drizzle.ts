import type { Client } from "@libsql/client";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import * as schema from "./schema.js";

export type DrizzleDatabase = LibSQLDatabase<typeof schema>;
export type DrizzleTransaction = Parameters<Parameters<DrizzleDatabase["transaction"]>[0]>[0];
export type DrizzleExecutor = DrizzleDatabase | DrizzleTransaction;

export function createDatabase(client: Client): DrizzleDatabase {
    return drizzle(client, { schema });
}

export { schema };
