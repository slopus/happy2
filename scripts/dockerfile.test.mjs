import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const repositoryRoot = new URL("../", import.meta.url);

test("copies workspace bin targets before pnpm creates their links", async () => {
    const dockerfile = await readFile(new URL("Dockerfile", repositoryRoot), "utf8");
    const install = dockerfile.indexOf("RUN pnpm install");
    const sdk = dockerfile.indexOf("COPY packages/happy2-plugin-sdk packages/happy2-plugin-sdk");

    assert.notEqual(install, -1, "Dockerfile must install workspace dependencies");
    assert.notEqual(sdk, -1, "Dockerfile must copy the plugin SDK source");
    assert.ok(
        sdk < install,
        "copy happy2-plugin-sdk before pnpm install so its happy2-plugin-build bin target exists",
    );
});
