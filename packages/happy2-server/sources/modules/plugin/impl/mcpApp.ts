import { PluginError } from "../types.js";

export const MCP_APP_EXTENSION_ID = "io.modelcontextprotocol/ui";
export const MCP_APP_RESOURCE_MIME_TYPE = "text/html;profile=mcp-app";

export interface McpAppToolUi {
    resourceUri?: string;
    visibility: readonly ("model" | "app")[];
}

export interface McpAppResourceInput {
    uri: string;
    html: string;
    contentHashSha256: string;
    csp?: {
        connectDomains?: string[];
        resourceDomains?: string[];
        frameDomains?: string[];
        baseUriDomains?: string[];
    };
    permissions?: {
        camera?: Record<string, never>;
        microphone?: Record<string, never>;
        geolocation?: Record<string, never>;
        clipboardWrite?: Record<string, never>;
    };
    domain?: string;
    prefersBorder?: boolean;
}

/** Validates and normalizes the standardized MCP Apps resource metadata before the host snapshots executable HTML. */
export function mcpAppResourceInput(
    uri: string,
    html: string,
    contentHashSha256: string,
    meta: Readonly<Record<string, unknown>> | undefined,
): McpAppResourceInput {
    if (!validUiUri(uri)) invalid("resource URI must use the ui:// scheme");
    const nested = meta?.ui;
    if (nested !== undefined && !plainObject(nested))
        invalid("resource ui metadata must be an object");
    const ui = nested as Readonly<Record<string, unknown>> | undefined;
    const csp = optionalObject(ui?.csp, "resource ui.csp");
    const permissions = optionalObject(ui?.permissions, "resource ui.permissions");
    const domain = ui?.domain;
    const prefersBorder = ui?.prefersBorder;
    if (domain !== undefined && (typeof domain !== "string" || !validOrigin(domain)))
        invalid("resource ui.domain must be an HTTPS origin");
    if (prefersBorder !== undefined && typeof prefersBorder !== "boolean")
        invalid("resource ui.prefersBorder must be a boolean");
    return {
        uri,
        html,
        contentHashSha256,
        ...(csp ? { csp: parseCsp(csp) } : {}),
        ...(permissions ? { permissions: parsePermissions(permissions) } : {}),
        ...(domain ? { domain } : {}),
        ...(prefersBorder === undefined ? {} : { prefersBorder }),
    };
}

/** Parses the standardized MCP Apps tool metadata while accepting the extension's temporary legacy resource URI key. */
export function mcpAppToolUi(meta: Readonly<Record<string, unknown>> | undefined): McpAppToolUi {
    const nested = meta?.ui;
    if (nested !== undefined && !plainObject(nested)) invalid("tool ui metadata must be an object");
    const ui = nested as Readonly<Record<string, unknown>> | undefined;
    const nestedUri = ui?.resourceUri;
    const legacyUri = meta?.["ui/resourceUri"];
    if (nestedUri !== undefined && typeof nestedUri !== "string")
        invalid("tool ui.resourceUri must be a string");
    if (legacyUri !== undefined && typeof legacyUri !== "string")
        invalid("tool ui/resourceUri must be a string");
    const resourceUri = (nestedUri ?? legacyUri) as string | undefined;
    if (resourceUri !== undefined && !validUiUri(resourceUri))
        invalid("tool UI resource URI must use the ui:// scheme and be at most 2048 characters");
    const rawVisibility = ui?.visibility;
    if (rawVisibility !== undefined && !Array.isArray(rawVisibility))
        invalid("tool ui.visibility must be an array");
    const visibility =
        rawVisibility === undefined
            ? (["model", "app"] as const)
            : rawVisibility.map((value) => {
                  if (value !== "model" && value !== "app")
                      invalid("tool ui.visibility contains an unsupported audience");
                  return value;
              });
    if (new Set(visibility).size !== visibility.length)
        invalid("tool ui.visibility contains a duplicate audience");
    return {
        ...(resourceUri === undefined ? {} : { resourceUri }),
        visibility,
    };
}

export function mcpAppToolVisibleTo(
    meta: Readonly<Record<string, unknown>> | undefined,
    audience: "model" | "app",
): boolean {
    return mcpAppToolUi(meta).visibility.includes(audience);
}

function validUiUri(value: string): boolean {
    if (!value.startsWith("ui://") || value.length > 2_048) return false;
    try {
        return new URL(value).protocol === "ui:";
    } catch {
        return false;
    }
}

function parseCsp(value: Readonly<Record<string, unknown>>): McpAppResourceInput["csp"] {
    const allowed = new Set([
        "connectDomains",
        "resourceDomains",
        "frameDomains",
        "baseUriDomains",
    ]);
    if (Object.keys(value).some((key) => !allowed.has(key)))
        invalid("resource ui.csp contains an unsupported field");
    const parse = (name: string): string[] | undefined => {
        const raw = value[name];
        if (raw === undefined) return undefined;
        if (!Array.isArray(raw) || raw.length > 64 || raw.some((item) => !validCspOrigin(item)))
            invalid(`resource ui.csp.${name} must contain valid origins`);
        if (new Set(raw).size !== raw.length)
            invalid(`resource ui.csp.${name} contains a duplicate origin`);
        return raw as string[];
    };
    const connectDomains = parse("connectDomains");
    const resourceDomains = parse("resourceDomains");
    const frameDomains = parse("frameDomains");
    const baseUriDomains = parse("baseUriDomains");
    return {
        ...(connectDomains ? { connectDomains } : {}),
        ...(resourceDomains ? { resourceDomains } : {}),
        ...(frameDomains ? { frameDomains } : {}),
        ...(baseUriDomains ? { baseUriDomains } : {}),
    };
}

function parsePermissions(
    value: Readonly<Record<string, unknown>>,
): McpAppResourceInput["permissions"] {
    const allowed = ["camera", "microphone", "geolocation", "clipboardWrite"] as const;
    if (Object.keys(value).some((key) => !allowed.includes(key as (typeof allowed)[number])))
        invalid("resource ui.permissions contains an unsupported permission");
    const result: NonNullable<McpAppResourceInput["permissions"]> = {};
    for (const permission of allowed) {
        const setting = value[permission];
        if (setting === undefined) continue;
        if (!plainObject(setting) || Object.keys(setting).length !== 0)
            invalid(`resource ui.permissions.${permission} must be an empty object`);
        result[permission] = {};
    }
    return result;
}

function optionalObject(
    value: unknown,
    name: string,
): Readonly<Record<string, unknown>> | undefined {
    if (value === undefined) return undefined;
    if (!plainObject(value)) invalid(`${name} must be an object`);
    return value;
}

function validCspOrigin(value: unknown): boolean {
    return (
        typeof value === "string" &&
        value.length <= 512 &&
        /^(?:https?|wss?):\/\/(?:\*\.)?[a-z0-9.-]+(?::\d{1,5})?$/i.test(value)
    );
}

function validOrigin(value: string): boolean {
    try {
        const url = new URL(value);
        return url.protocol === "https:" && url.origin === value && value.length <= 512;
    } catch {
        return false;
    }
}

function plainObject(value: unknown): value is Readonly<Record<string, unknown>> {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function invalid(message: string): never {
    throw new PluginError("broken_configuration", `Plugin MCP Apps ${message}`);
}
