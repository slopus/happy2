import type { PluginFunctionResult } from "../types.js";

export function parsePluginFunctionResult(value: string): PluginFunctionResult {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
        throw new Error("Stored plugin function result is invalid");
    const result = parsed as Record<string, unknown>;
    if (result.status === "completed") return parsed as PluginFunctionResult;
    if (
        result.status === "failed" &&
        result.error &&
        typeof result.error === "object" &&
        !Array.isArray(result.error) &&
        typeof (result.error as Record<string, unknown>).message === "string"
    )
        return parsed as PluginFunctionResult;
    throw new Error("Stored plugin function result is invalid");
}
