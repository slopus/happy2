import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { defaultConfig } from "./defaults.js";
import { initializeManagedEnvironment } from "./environment.js";
import { loadConfig } from "./loader.js";
import type { ServerConfig } from "./type.js";

export async function loadRuntimeConfig(configPath?: string): Promise<{
    config: ServerConfig;
    managedConfigPath: string;
}> {
    const managedConfigPath = configPath ?? join(process.cwd(), ".rigged", "rigged.toml");
    if (!configPath) await mkdir(dirname(managedConfigPath), { recursive: true, mode: 0o700 });
    const config = configPath ? await loadConfig(configPath) : defaultConfig();
    await initializeManagedEnvironment(managedConfigPath, config);
    return { config, managedConfigPath };
}
