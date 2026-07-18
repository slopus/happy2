import { fileURLToPath } from "node:url";

import { readPackageManifest } from "./release/readPackageManifest.js";
import { runCommand } from "./release/runCommand.js";

const PACKAGE_DIRECTORY = fileURLToPath(new URL("../", import.meta.url));
const VERSION_BUMPS = new Set([
    "major",
    "minor",
    "patch",
    "premajor",
    "preminor",
    "prepatch",
    "prerelease",
]);
const SEMANTIC_VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const NOT_PUBLISHED = /E404|404 Not Found|is not in this registry/i;
const USAGE = `Usage: pnpm release <version>

Examples:
  pnpm release 0.1.0
  pnpm release patch
  pnpm release minor`;

function packageVersionIsPublished(name: string, version: string): boolean {
    const result = runCommand("pnpm", ["view", `${name}@${version}`, "version", "--json"], {
        allowFailure: true,
        captureOutput: true,
    });
    if (result.status === 0) {
        return true;
    }
    if (NOT_PUBLISHED.test(`${result.stdout}\n${result.stderr}`)) {
        return false;
    }

    if (result.stderr.length > 0) {
        console.error(result.stderr);
    }
    throw new Error(`Could not determine whether ${name}@${version} is already published.`);
}

async function release(): Promise<void> {
    const releaseInput = process.argv[2];
    if (releaseInput === "--help" || releaseInput === "-h") {
        console.log(USAGE);
        return;
    }
    if (
        releaseInput === undefined ||
        process.argv.length !== 3 ||
        (!VERSION_BUMPS.has(releaseInput) && !SEMANTIC_VERSION.test(releaseInput))
    ) {
        throw new Error(USAGE);
    }

    const branch = runCommand("git", ["branch", "--show-current"], {
        captureOutput: true,
    }).stdout;
    if (branch !== "main") {
        throw new Error(
            `Releases must run from the main branch. The current branch is ${branch || "detached"}.`,
        );
    }

    const worktreeStatus = runCommand("git", ["status", "--porcelain"], {
        captureOutput: true,
    }).stdout;
    if (worktreeStatus.length > 0) {
        throw new Error("The working tree must be clean before creating a release.");
    }

    console.log("Checking the latest main branch...");
    runCommand("git", ["fetch", "origin", "main", "--tags"]);
    const initialManifest = readPackageManifest();
    const releaseTag = `v${initialManifest.version}`;
    const tagsAtHead = runCommand("git", ["tag", "--points-at", "HEAD"], {
        captureOutput: true,
    }).stdout.split("\n");
    const requestedCurrentVersion = releaseInput === initialManifest.version;
    const retryingRelease = requestedCurrentVersion && tagsAtHead.includes(releaseTag);
    const releaseTagExists =
        runCommand("git", ["show-ref", "--verify", "--quiet", `refs/tags/${releaseTag}`], {
            allowFailure: true,
            captureOutput: true,
        }).status === 0;
    if (requestedCurrentVersion && !retryingRelease && releaseTagExists) {
        throw new Error(`${releaseTag} already exists at a different commit.`);
    }

    const head = runCommand("git", ["rev-parse", "HEAD"], { captureOutput: true }).stdout;
    const originMain = runCommand("git", ["rev-parse", "origin/main"], {
        captureOutput: true,
    }).stdout;
    if (head !== originMain) {
        const originIsAncestor =
            runCommand("git", ["merge-base", "--is-ancestor", "origin/main", "HEAD"], {
                allowFailure: true,
                captureOutput: true,
            }).status === 0;
        const commitsAhead = Number(
            runCommand("git", ["rev-list", "--count", "origin/main..HEAD"], {
                captureOutput: true,
            }).stdout,
        );
        if (!retryingRelease || !originIsAncestor || commitsAhead !== 1) {
            throw new Error(
                "Local main must match origin/main. Update the branch before creating a release.",
            );
        }
        console.log(`Resuming the local ${releaseTag} release commit.`);
    }

    const releasingInitialVersion =
        requestedCurrentVersion &&
        !retryingRelease &&
        !packageVersionIsPublished(initialManifest.name, initialManifest.version);
    if (requestedCurrentVersion && !retryingRelease && !releasingInitialVersion) {
        throw new Error(
            `${initialManifest.name}@${initialManifest.version} is already published, but its release tag is not at HEAD.`,
        );
    }

    console.log("Validating the release...");
    runCommand("pnpm", ["run", "check"]);

    if (!retryingRelease) {
        console.log(`Creating the ${releaseInput} release commit and tag...`);
        if (!releasingInitialVersion) {
            runCommand("pnpm", ["version", releaseInput, "--no-git-tag-version"], {
                cwd: PACKAGE_DIRECTORY,
            });
        }
        const versionedManifest = readPackageManifest();
        runCommand("git", ["add", "package.json", "pnpm-lock.yaml"]);
        const commitArguments = ["commit", "-m", `Release v${versionedManifest.version}`];
        if (releasingInitialVersion) {
            commitArguments.push("--allow-empty");
        }
        runCommand("git", commitArguments);
        runCommand("git", ["tag", `v${versionedManifest.version}`]);
    }

    const releaseManifest = readPackageManifest();
    console.log(`Previewing ${releaseManifest.name}@${releaseManifest.version}...`);
    runCommand("pnpm", ["publish", "--access", "public", "--dry-run", "--no-git-checks"], {
        cwd: PACKAGE_DIRECTORY,
    });

    const pushedReleaseTag = `v${releaseManifest.version}`;
    console.log("Pushing the release commit and tag atomically...");
    runCommand("git", ["push", "--atomic", "origin", "main", pushedReleaseTag]);

    console.log(
        `Queued ${releaseManifest.name}@${releaseManifest.version} for publishing through GitHub Actions.`,
    );
}

try {
    await release();
} catch (error) {
    console.error(error instanceof Error ? error.message : "The release failed unexpectedly.");
    process.exitCode = 1;
}
