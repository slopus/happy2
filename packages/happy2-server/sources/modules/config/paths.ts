import { isAbsolute, join } from "node:path";

export function localRuntimePaths(
    cwd = process.cwd(),
    environment: NodeJS.ProcessEnv = process.env,
): {
    filesDirectory: string;
    rigDirectory: string;
    runtimeDirectory: string;
    workspacesDirectory: string;
} {
    const runtimeDirectory = join(cwd, ".happy2");
    const configuredRigHome = environment.RIG_HOME?.trim();
    if (configuredRigHome && !isAbsolute(configuredRigHome)) {
        throw new Error("RIG_HOME must be an absolute path.");
    }
    return {
        filesDirectory: join(runtimeDirectory, "files"),
        rigDirectory: configuredRigHome || join(runtimeDirectory, "rig"),
        runtimeDirectory,
        workspacesDirectory: join(runtimeDirectory, "workspaces"),
    };
}
