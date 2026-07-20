import { parseArgs } from "node:util";

export type Happy2Command =
    | { kind: "all"; configPath?: string }
    | { kind: "backend"; configPath?: string }
    | {
          kind: "web";
          backendUrl: string;
          host: string;
          port: number;
          portSharingDomain?: string;
          trustedProxyHops: number;
      }
    | { kind: "help" }
    | { kind: "invalid"; message: string };

export function parseHappy2Command(
    arguments_: readonly string[],
    environment: NodeJS.ProcessEnv = process.env,
): Happy2Command {
    if (arguments_[0] === "help" || arguments_[0] === "--help" || arguments_[0] === "-h") {
        return arguments_.length === 1
            ? { kind: "help" }
            : { kind: "invalid", message: "Help does not accept additional arguments." };
    }
    const mode = arguments_[0] === "backend" || arguments_[0] === "web" ? arguments_[0] : "all";
    const modeArguments = mode === "all" ? arguments_ : arguments_.slice(1);
    try {
        if (mode === "web") {
            const { positionals, values } = parseArgs({
                args: [...modeArguments],
                allowPositionals: true,
                options: {
                    "backend-url": { type: "string" },
                    help: { type: "boolean", short: "h" },
                    host: { type: "string" },
                    port: { type: "string" },
                    "port-sharing-domain": { type: "string" },
                    "trusted-proxy-hops": { type: "string" },
                },
            });
            if (values.help && positionals.length === 0) return { kind: "help" };
            if (positionals.length !== 0) {
                return { kind: "invalid", message: "The web command has an unexpected argument." };
            }
            const backendUrl = values["backend-url"] ?? environment.HAPPY2_BACKEND_URL;
            if (!backendUrl) {
                return {
                    kind: "invalid",
                    message: "The web command requires --backend-url or HAPPY2_BACKEND_URL.",
                };
            }
            return {
                kind: "web",
                backendUrl,
                host: values.host ?? environment.HAPPY2_WEB_HOST ?? "127.0.0.1",
                port: nonnegativeInteger(
                    values.port ?? environment.HAPPY2_WEB_PORT ?? "3000",
                    "web port",
                    65_535,
                ),
                ...((values["port-sharing-domain"] ?? environment.HAPPY2_PORT_SHARING_DOMAIN)
                    ? {
                          portSharingDomain:
                              values["port-sharing-domain"] ??
                              environment.HAPPY2_PORT_SHARING_DOMAIN!,
                      }
                    : {}),
                trustedProxyHops: nonnegativeInteger(
                    values["trusted-proxy-hops"] ??
                        environment.HAPPY2_WEB_TRUSTED_PROXY_HOPS ??
                        "0",
                    "trusted proxy hops",
                ),
            };
        }

        const { positionals, values } = parseArgs({
            args: [...modeArguments],
            allowPositionals: true,
            options: {
                config: { type: "string" },
                help: { type: "boolean", short: "h" },
            },
        });
        if (values.help && positionals.length === 0) return { kind: "help" };
        if (positionals.length !== 0) {
            return { kind: "invalid", message: `The ${mode} command has an unexpected argument.` };
        }
        return {
            kind: mode,
            configPath: values.config ?? environment.HAPPY2_CONFIG,
        };
    } catch (error) {
        return {
            kind: "invalid",
            message: error instanceof Error ? error.message : "Invalid command arguments.",
        };
    }
}

export function happy2Usage(): string {
    return [
        "Usage:",
        "  happy2 [--config /path/to/happy2.toml]",
        "  happy2 backend [--config /path/to/happy2.toml]",
        "  happy2 web --backend-url http://backend:3000 [--host 127.0.0.1] [--port 3000]",
        "             [--port-sharing-domain preview.example.com] [--trusted-proxy-hops 0]",
        "  happy2 daemon start [--config /path/to/happy2.toml]",
        "  happy2 daemon stop",
        "  happy2 service start [--config /path/to/happy2.toml]",
        "  happy2 service stop",
        "",
        "Without a mode, Happy (2) runs the backend and bundled web app together.",
        "The web mode serves only the bundled app and proxies /v0 to the backend URL.",
        "Web options may also use HAPPY2_BACKEND_URL, HAPPY2_WEB_HOST, HAPPY2_WEB_PORT,",
        "HAPPY2_PORT_SHARING_DOMAIN, and HAPPY2_WEB_TRUSTED_PROXY_HOPS.",
    ].join("\n");
}

function nonnegativeInteger(
    value: string,
    label: string,
    maximum = Number.MAX_SAFE_INTEGER,
): number {
    if (!/^\d+$/.test(value)) throw new Error(`Happy (2) ${label} must be a non-negative integer.`);
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed > maximum) {
        throw new Error(`Happy (2) ${label} is outside the supported range.`);
    }
    return parsed;
}
