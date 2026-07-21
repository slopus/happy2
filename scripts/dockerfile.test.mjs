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

test("copies every built-in plugin required by the server catalog", async () => {
    const dockerfile = await readFile(new URL("Dockerfile", repositoryRoot), "utf8");
    const plugins = [
        "hello",
        "chat-management",
        "documents",
        "environment-management",
        "plugin-developer",
        "movie-catalog",
        "todos",
        "port-sharing",
    ];
    const install = dockerfile.indexOf("RUN pnpm install");
    const build = dockerfile.indexOf("RUN pnpm -r --filter happy2-server... build");

    assert.notEqual(install, -1, "Dockerfile must install workspace dependencies");
    assert.notEqual(build, -1, "Dockerfile must build the server and its workspace dependencies");

    for (const shortName of plugins) {
        const packageName = `happy2-plugin-${shortName}`;
        const manifest = `COPY packages/${packageName}/package.json packages/${packageName}/package.json`;
        const source = `COPY packages/${packageName} packages/${packageName}`;
        const manifestIndex = dockerfile.indexOf(manifest);
        const sourceIndex = dockerfile.indexOf(source);

        assert.ok(manifestIndex >= 0, `Dockerfile must copy ${packageName}'s manifest`);
        assert.ok(sourceIndex >= 0, `Dockerfile must copy ${packageName}'s source`);
        assert.ok(manifestIndex < install, `copy ${packageName}'s manifest before pnpm install`);
        assert.ok(sourceIndex < build, `copy ${packageName}'s source before building the server`);
    }
});
