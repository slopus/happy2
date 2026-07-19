#!/usr/bin/env node

import { daemonStart, daemonStop, daemonUsage, parseDaemonCommand } from "./daemon.js";
import {
    isNpxInvocation,
    parseSystemServiceCommand,
    systemServiceStart,
    systemServiceStop,
    systemServiceUsage,
} from "./systemService.js";
import { happy2Usage, parseHappy2Command } from "./runnerCommand.js";

try {
    const arguments_ = process.argv.slice(2);
    if (arguments_[0] === "daemon") {
        const command = parseDaemonCommand(arguments_.slice(1));
        if (command.action === "help") {
            console.log(daemonUsage());
        } else if (command.action === "start") {
            await daemonStart({
                configPath: command.configPath ?? process.env.HAPPY2_CONFIG,
            });
        } else if (command.action === "stop") {
            await daemonStop();
        } else {
            console.error(daemonUsage());
            process.exitCode = 1;
        }
    } else if (arguments_[0] === "service") {
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
        const command = parseHappy2Command(arguments_);
        if (command.kind === "help") {
            console.log(happy2Usage());
            process.exit(0);
        }
        if (command.kind === "invalid") {
            console.error(`${command.message}\n\n${happy2Usage()}`);
            process.exit(1);
        }

        let running;
        if (command.kind === "web") {
            const { startWebHappy2 } = await import("./web.js");
            running = await startWebHappy2(command);
            console.log(
                `Happy (2) web is running at ${running.url} and proxying /v0 to ${command.backendUrl}`,
            );
        } else {
            const { loadRuntimeConfig } = await import("./modules/config/runtime.js");
            const { config } = await loadRuntimeConfig(command.configPath);
            if (command.kind === "backend") {
                const { startBackendHappy2 } = await import("./backend.js");
                running = await startBackendHappy2(config);
            } else {
                const { startStandaloneHappy2 } = await import("./standalone.js");
                running = await startStandaloneHappy2(config);
            }
            console.log(`Happy (2) ${command.kind} is running at ${running.url}`);
        }

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
