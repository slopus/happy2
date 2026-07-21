import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const repositoryRoot = new URL("../", import.meta.url);

test("copies every workspace manifest and plugin builder before installing dependencies", async () => {
    const dockerfile = await readFile(new URL("Dockerfile", repositoryRoot), "utf8");
    const install = dockerfile.indexOf("RUN pnpm install");
    const manifests = dockerfile.indexOf("COPY --parents packages/*/package.json ./");
    const sdk = dockerfile.indexOf("COPY packages/happy2-plugin-sdk packages/happy2-plugin-sdk");

    assert.notEqual(install, -1, "Dockerfile must install workspace dependencies");
    assert.notEqual(manifests, -1, "Dockerfile must copy every workspace manifest");
    assert.notEqual(sdk, -1, "Dockerfile must copy the plugin builder source");
    assert.ok(
        manifests < install && sdk < install,
        "copy workspace manifests and the plugin builder before pnpm install",
    );
});

test("installs and builds every package matching the built-in plugin convention", async () => {
    const dockerfile = await readFile(new URL("Dockerfile", repositoryRoot), "utf8");
    const rootPackage = JSON.parse(await readFile(new URL("package.json", repositoryRoot), "utf8"));
    const install = dockerfile.indexOf("RUN pnpm install");
    const sources = dockerfile.indexOf("COPY packages packages");
    const build = dockerfile.indexOf("RUN pnpm run plugins:build");

    assert.match(dockerfile, /pnpm install[^\n]+\.\/packages\/happy2-plugin-\*/);
    assert.match(rootPackage.scripts["plugins:build"], /happy2-plugin-\*/);
    assert.ok(
        install < sources && sources < build,
        "copy plugin sources after install and before build",
    );
});
