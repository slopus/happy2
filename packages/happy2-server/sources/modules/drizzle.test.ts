import { createClient } from "@libsql/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
    createDatabase,
    retrySqliteBusy,
    withTransaction,
    type DrizzleDatabase,
    type DrizzleTransaction,
} from "./drizzle.js";

describe("transaction composition", () => {
    const clients: ReturnType<typeof createClient>[] = [];

    afterEach(() => {
        for (const client of clients.splice(0)) client.close();
    });

    it("opens one real top-level transaction and reuses it without a savepoint", async () => {
        const client = createClient({ url: ":memory:" });
        clients.push(client);
        const database = createDatabase(client);
        const topLevel = vi.spyOn(database, "transaction");
        let nested: ReturnType<typeof vi.spyOn> | undefined;

        const result = await withTransaction(database, async (outer) => {
            nested = vi.spyOn(outer, "transaction");
            return withTransaction(outer, async (inner) => {
                expect(inner).toBe(outer);
                return "committed";
            });
        });

        expect(result).toBe("committed");
        expect(topLevel).toHaveBeenCalledTimes(1);
        expect(nested).toHaveBeenCalledTimes(0);
    });

    it("retries the complete top-level transaction only for SQLite busy failures", async () => {
        const transaction = {} as DrizzleTransaction;
        const database = {
            transaction: vi
                .fn<(operation: (tx: DrizzleTransaction) => Promise<string>) => Promise<string>>()
                .mockRejectedValueOnce(Object.assign(new Error("locked"), { code: "SQLITE_BUSY" }))
                .mockImplementation(async (operation) => operation(transaction)),
        } as unknown as DrizzleDatabase;
        const operation = vi.fn(async () => "committed");

        await expect(withTransaction(database, operation)).resolves.toBe("committed");
        expect(database.transaction).toHaveBeenCalledTimes(2);
        expect(operation).toHaveBeenCalledTimes(1);
    });

    it("does not retry non-busy failures", async () => {
        const failure = new Error("invalid transition");
        const operation = vi.fn(async () => {
            throw failure;
        });

        await expect(retrySqliteBusy(operation)).rejects.toBe(failure);
        expect(operation).toHaveBeenCalledTimes(1);
    });
});
