import { join } from "node:path";
import {
    DESKTOP_LOCAL_ACCESS_TOKEN_ENV,
    type ServerProcessStart,
} from "../shared/serverProcessContract";

/** Builds the complete per-topology server configuration owned by the desktop host. */
export function desktopServerConfigToml(
    input: ServerProcessStart,
    ports: { pluginHostPort: number; publicUrl: string; serverPort: number },
): string {
    const embeddedEndpoints = input.rigEndpointRoot;
    const lines = [
        "[server]",
        'role = "all"',
        'host = "127.0.0.1"',
        `port = ${ports.serverPort}`,
        `public_url = ${tomlString(ports.publicUrl)}`,
        "trusted_proxy_hops = 0",
        "",
        "[database]",
        `url = ${tomlString(`file:${join(input.runtimeRoot, "happy2.db")}`)}`,
        "",
        "[agents]",
        "enabled = true",
        'daemon_mode = "managed"',
        `default_cwd = ${tomlString(join(input.runtimeRoot, "workspaces"))}`,
        `directory = ${tomlString(join(input.runtimeRoot, "rig"))}`,
        `socket_path = ${tomlString(join(embeddedEndpoints, "server.sock"))}`,
        `token_path = ${tomlString(join(embeddedEndpoints, "token"))}`,
        "",
        "[files]",
        `directory = ${tomlString(join(input.runtimeRoot, "files"))}`,
        "",
        "[plugins]",
        `directory = ${tomlString(join(input.runtimeRoot, "plugins"))}`,
        'host_api_host = "127.0.0.1"',
        `host_api_port = ${ports.pluginHostPort}`,
        "",
        "[auth.local]",
        "enabled = true",
        `token_env = ${tomlString(DESKTOP_LOCAL_ACCESS_TOKEN_ENV)}`,
        "",
        "[auth.password]",
        "enabled = false",
        "",
        "[auth.magic_link]",
        "enabled = false",
        "",
        "[auth.dev_tokens]",
        "enabled = false",
        "",
    ];
    return `${lines.join("\n")}\n`;
}

function tomlString(value: string): string {
    return JSON.stringify(value);
}
