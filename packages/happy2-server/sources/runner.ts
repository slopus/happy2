#!/usr/bin/env node

import { parseArgs } from "node:util";
import { loadRuntimeConfig } from "./modules/config/runtime.js";
import { startStandaloneHappy2 } from "./standalone.js";
import {
    isNpxInvocation,
    parseSystemServiceCommand,
    systemServiceStart,
    systemServiceStop,
    systemServiceUsage,
} from "./systemService.js";

try {
    const arguments_ = process.argv.slice(2);
    if (arguments_[0] === "service") {
        const command = parseSystemServiceCommand(arguments_.slice(1));
        if (command.action === "help") {
            console.log(systemServiceUsage());
        } else if (command.action === "start") {
            await systemServiceStart({
                configPath: command.configPath ?? process.env.HAPPY2_CONFIG,
                npx: isNpxInvocation(process.argv[1]),
            });
        } else if (command.action === "stop") {
            await systemServiceStop();
        } else {
            console.error(systemServiceUsage());
            process.exitCode = 1;
        }
    } else {
        const { values } = parseArgs({
            args: arguments_,
            options: { config: { type: "string" } },
        });
        const { config } = await loadRuntimeConfig(values.config ?? process.env.HAPPY2_CONFIG);
        const running = await startStandaloneHappy2(config);
        console.log(`Happy (2) is running at ${running.url}`);

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
    }
} catch (error) {
    console.error(error);
    process.exitCode = 1;
}
