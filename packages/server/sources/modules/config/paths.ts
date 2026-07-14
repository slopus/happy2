import { join, resolve } from "node:path";

export function localRuntimePaths(cwd = process.cwd()): {
    filesDirectory: string;
    rigDirectory: string;
    runtimeDirectory: string;
    workspacesDirectory: string;
} {
    const runtimeDirectory = join(cwd, ".rigged");
    const configuredRigDirectory = process.env.RIG_SERVER_DIRECTORY?.trim();
    return {
        filesDirectory: join(runtimeDirectory, "files"),
        rigDirectory: configuredRigDirectory
            ? resolve(configuredRigDirectory)
            : join(runtimeDirectory, "rig"),
        runtimeDirectory,
        workspacesDirectory: join(runtimeDirectory, "workspaces"),
    };
}
