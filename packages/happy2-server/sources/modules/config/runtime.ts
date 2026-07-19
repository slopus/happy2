import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { defaultConfig } from "./defaults.js";
import { initializeManagedEnvironment } from "./environment.js";
import { loadConfig } from "./loader.js";
import type { ServerConfig } from "./type.js";

export async function loadRuntimeConfig(
    configPath?: string,
    cwd = process.cwd(),
): Promise<{
    config: ServerConfig;
    managedConfigPath: string;
}> {
    const managedConfigPath = configPath ?? join(cwd, ".happy2", "happy2.toml");
    const defaults = defaultConfig(cwd);
    let config: ServerConfig;
    if (configPath) {
        config = await loadConfig(configPath, defaults);
    } else {
        await mkdir(dirname(managedConfigPath), { recursive: true, mode: 0o700 });
        try {
            config = await loadConfig(managedConfigPath, defaults);
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
            config = defaults;
        }
    }
    await initializeManagedEnvironment(managedConfigPath, config);
    return { config, managedConfigPath };
}
