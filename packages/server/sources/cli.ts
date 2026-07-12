import { join } from "node:path";
import { parseArgs } from "node:util";
import { TokenService } from "./modules/auth/tokens.js";
import { defaultConfig } from "./modules/config/defaults.js";
import { initializeManagedEnvironment } from "./modules/config/environment.js";
import { loadConfig } from "./modules/config/loader.js";
import { Database } from "./modules/database.js";
import { buildServer } from "./server.js";

const { values } = parseArgs({
    options: { config: { type: "string" } },
});
const configPath = values.config ?? process.env.RIGGED_CONFIG;
const config = configPath ? await loadConfig(configPath) : defaultConfig();
// In configless mode the current working directory owns the generated .env.
await initializeManagedEnvironment(configPath ?? join(process.cwd(), "rigged.toml"), config);
const database = new Database(
    config.database.url,
    config.database.authTokenEnv ? process.env[config.database.authTokenEnv] : undefined,
);
await database.migrate();
const app = await buildServer(config, { database, tokens: await TokenService.create(config) });
try {
    await app.listen({ host: config.server.host, port: config.server.port });
} catch (error) {
    app.log.error(error);
    await app.close();
    process.exitCode = 1;
}
