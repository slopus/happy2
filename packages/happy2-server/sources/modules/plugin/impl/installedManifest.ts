import { PluginError, type PluginManifest } from "../types.js";

export function installedManifest(source: string): PluginManifest {
    let value: unknown;
    try {
        value = JSON.parse(source);
    } catch {
        throw unreadable();
    }
    if (!record(value)) throw unreadable();
    if (
        value.schemaVersion !== 1 ||
        typeof value.version !== "string" ||
        typeof value.displayName !== "string" ||
        typeof value.shortName !== "string" ||
        typeof value.description !== "string" ||
        !Array.isArray(value.variables) ||
        !value.variables.every(variable)
    )
        throw unreadable();
    if (value.container !== undefined && !container(value.container)) throw unreadable();
    if (value.mcp !== undefined && !mcp(value.mcp)) throw unreadable();
    return value as unknown as PluginManifest;
}

function container(value: unknown): boolean {
    return (
        record(value) &&
        (value.dockerfile === undefined || typeof value.dockerfile === "string") &&
        (value.command === undefined || typeof value.command === "string") &&
        Array.isArray(value.args) &&
        value.args.every((argument) => typeof argument === "string") &&
        Array.isArray(value.permissions) &&
        value.permissions.every((permission) => permission === "plugins:list")
    );
}

function variable(value: unknown): boolean {
    return (
        record(value) &&
        typeof value.key === "string" &&
        typeof value.displayName === "string" &&
        typeof value.description === "string" &&
        (value.kind === "secret" || value.kind === "text")
    );
}

function mcp(value: unknown): boolean {
    if (!record(value)) return false;
    if (value.type === "remote")
        return (
            typeof value.url === "string" &&
            record(value.headers) &&
            Object.values(value.headers).every((header) => typeof header === "string")
        );
    if (value.type !== "stdio") return false;
    return (
        typeof value.command === "string" &&
        Array.isArray(value.args) &&
        value.args.every((argument) => typeof argument === "string") &&
        (value.container === undefined ||
            (record(value.container) && typeof value.container.dockerfile === "string"))
    );
}

function record(value: unknown): value is Record<string, unknown> {
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function unreadable(): PluginError {
    return new PluginError("broken_configuration", "Installed plugin manifest is unreadable");
}
