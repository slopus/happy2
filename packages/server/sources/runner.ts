#!/usr/bin/env node

import { parseArgs } from "node:util";
import { loadRuntimeConfig } from "./modules/config/runtime.js";
import { startStandaloneRigged } from "./standalone.js";

const { values } = parseArgs({
    options: { config: { type: "string" } },
});

try {
    const { config } = await loadRuntimeConfig(values.config ?? process.env.RIGGED_CONFIG);
    const running = await startStandaloneRigged(config);
    console.log(`Rigged is running at ${running.url}`);

    let stopping = false;
    const stop = () => {
        if (stopping) return;
        stopping = true;
        void running.close().catch((error: unknown) => {
            console.error(error);
            process.exitCode = 1;
        });
    };
    process.once("SIGHUP", stop);
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
} catch (error) {
    console.error(error);
    process.exitCode = 1;
}
