import { readFileSync } from "node:fs";

interface PackageManifest {
    name: string;
    dependencies?: Readonly<Record<string, string>>;
}

function readManifest(url: URL): PackageManifest {
    return JSON.parse(readFileSync(url, "utf8")) as PackageManifest;
}

const publishedManifest = readManifest(new URL("../package.json", import.meta.url));
const serverManifest = readManifest(
    new URL("../packages/happy2-server/package.json", import.meta.url),
);
const publishedDependencies = publishedManifest.dependencies ?? {};
const serverDependencies = serverManifest.dependencies ?? {};
const dependencyNames = [
    ...new Set([...Object.keys(publishedDependencies), ...Object.keys(serverDependencies)]),
].sort();
const differences = dependencyNames.flatMap((name) => {
    const publishedVersion = publishedDependencies[name];
    const serverVersion = serverDependencies[name];
    if (publishedVersion === serverVersion) {
        return [];
    }

    return [
        `  ${name}: ${publishedManifest.name}=${publishedVersion ?? "<missing>"}, ${serverManifest.name}=${serverVersion ?? "<missing>"}`,
    ];
});

if (differences.length > 0) {
    throw new Error(
        [
            "Published runtime dependencies must exactly match the server runtime dependencies.",
            ...differences,
        ].join("\n"),
    );
}

console.log(
    `${publishedManifest.name} runtime dependencies match ${serverManifest.name} (${dependencyNames.length}).`,
);
