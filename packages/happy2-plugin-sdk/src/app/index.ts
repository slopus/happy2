import { useCallback, useEffect, useState } from "react";
import {
    useApp,
    useHostStyles,
    type App,
    type McpUiAppCapabilities,
    type McpUiHostContext,
    type UseAppOptions,
} from "@modelcontextprotocol/ext-apps/react";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { RequestOptions } from "@modelcontextprotocol/sdk/shared/protocol.js";
import { z } from "zod/v4";
import type { AppOpenPresentation, JsonObject } from "../types.js";

export {
    useApp,
    useHostFonts,
    useHostStyles,
    useHostStyleVariables,
} from "@modelcontextprotocol/ext-apps/react";
export type { App, McpUiHostContext } from "@modelcontextprotocol/ext-apps/react";
export type { AppOpenPresentation, JsonObject, JsonValue } from "../types.js";

export const HAPPY_INSTANCE_HOST_CONTEXT_KEY = "happy2/instance";
export const HAPPY_APP_OPEN_METHOD = "happy2/app-open";

/** Durable instance data supplied by Happy in standard extensible host context. */
export interface HappyInstanceHostContext {
    readonly context: JsonObject;
    readonly dataRevision: number;
    readonly definitionRevision: number;
    readonly id: string;
    readonly key: string;
}

export type HappyHostContext = McpUiHostContext & {
    readonly [HAPPY_INSTANCE_HOST_CONTEXT_KEY]?: HappyInstanceHostContext;
};

export interface UseHappyAppOptions extends Pick<
    UseAppOptions,
    "appInfo" | "autoResize" | "onAppCreated"
> {
    readonly capabilities?: McpUiAppCapabilities;
}

export interface HappyAppState<TInput extends JsonObject = JsonObject> {
    readonly app: App | null;
    readonly error: Error | null;
    readonly hostContext: HappyHostContext | undefined;
    readonly instance: HappyInstanceHostContext | undefined;
    readonly isConnected: boolean;
    readonly toolInput: TInput | undefined;
    readonly toolResult: CallToolResult | undefined;
}

/**
 * Connects through the official MCP Apps React hook and exposes Happy's durable instance context.
 * Tool notifications are registered before the handshake, so initial input/result cannot race mount.
 */
export function useHappyApp<TInput extends JsonObject = JsonObject>(
    options: UseHappyAppOptions,
): HappyAppState<TInput> {
    const [hostContext, setHostContext] = useState<HappyHostContext>();
    const [toolInput, setToolInput] = useState<TInput>();
    const [toolResult, setToolResult] = useState<CallToolResult>();
    const state = useApp({
        appInfo: options.appInfo,
        autoResize: options.autoResize,
        capabilities: options.capabilities ?? {},
        strict: true,
        onAppCreated(app) {
            app.addEventListener("hostcontextchanged", (update) =>
                setHostContext((current) => ({ ...current, ...update })),
            );
            app.addEventListener("toolinput", (input) => setToolInput(input.arguments as TInput));
            app.addEventListener("toolresult", setToolResult);
            options.onAppCreated?.(app);
        },
    });

    useEffect(() => {
        const initial = state.app?.getHostContext();
        if (initial) setHostContext(initial);
    }, [state.app]);
    useHostStyles(state.app, hostContext);

    return {
        ...state,
        hostContext,
        instance: happyInstanceHostContext(hostContext),
        toolInput,
        toolResult,
    };
}

export interface HappyAppOpenRequest {
    readonly instanceKey: string;
    readonly presentation: AppOpenPresentation;
}

export interface HappyAppOpenResult {
    readonly isError?: boolean;
}

const appOpenResultSchema = z
    .object({ isError: z.boolean().optional() })
    .loose() as z.ZodType<HappyAppOpenResult>;

/** Requests that Happy open a predeclared installation-local app instance. */
export function openHappyApp(
    app: App,
    request: HappyAppOpenRequest,
    options?: RequestOptions,
): Promise<HappyAppOpenResult> {
    if (!request.instanceKey.trim()) throw new TypeError("App instance key is required");
    return app.request(
        {
            method: HAPPY_APP_OPEN_METHOD,
            params: request,
        } as never,
        appOpenResultSchema,
        options,
    );
}

/** Stable React callback for the Happy app-open vendor request. */
export function useOpenHappyApp(app: App | null) {
    return useCallback(
        (request: HappyAppOpenRequest, options?: RequestOptions) => {
            if (!app) return Promise.reject(new Error("MCP App is not connected"));
            return openHappyApp(app, request, options);
        },
        [app],
    );
}

/** Parses Happy's namespaced extension while tolerating unrelated future host-context fields. */
export function happyInstanceHostContext(
    context: McpUiHostContext | undefined,
): HappyInstanceHostContext | undefined {
    const value = context?.[HAPPY_INSTANCE_HOST_CONTEXT_KEY];
    if (value === undefined) return undefined;
    const record = object(value, HAPPY_INSTANCE_HOST_CONTEXT_KEY);
    return {
        context: jsonObject(record.context, `${HAPPY_INSTANCE_HOST_CONTEXT_KEY}.context`),
        dataRevision: revision(
            record.dataRevision,
            `${HAPPY_INSTANCE_HOST_CONTEXT_KEY}.dataRevision`,
        ),
        definitionRevision: revision(
            record.definitionRevision,
            `${HAPPY_INSTANCE_HOST_CONTEXT_KEY}.definitionRevision`,
        ),
        id: string(record.id, `${HAPPY_INSTANCE_HOST_CONTEXT_KEY}.id`),
        key: string(record.key, `${HAPPY_INSTANCE_HOST_CONTEXT_KEY}.key`),
    };
}

function object(value: unknown, label: string): Readonly<Record<string, unknown>> {
    if (!value || typeof value !== "object" || Array.isArray(value))
        throw new TypeError(`${label} must be an object`);
    return value as Readonly<Record<string, unknown>>;
}

function jsonObject(value: unknown, label: string): JsonObject {
    const record = object(value, label);
    assertJson(record, label);
    return record as JsonObject;
}

function assertJson(value: unknown, label: string): void {
    if (value === null || ["boolean", "string"].includes(typeof value)) return;
    if (typeof value === "number") {
        if (Number.isFinite(value)) return;
        throw new TypeError(`${label} must contain finite JSON numbers`);
    }
    if (Array.isArray(value)) {
        value.forEach((item, index) => assertJson(item, `${label}[${index}]`));
        return;
    }
    if (value && typeof value === "object") {
        for (const [key, item] of Object.entries(value)) assertJson(item, `${label}.${key}`);
        return;
    }
    throw new TypeError(`${label} must contain only JSON values`);
}

function revision(value: unknown, label: string): number {
    if (!Number.isSafeInteger(value) || (value as number) < 0)
        throw new TypeError(`${label} must be a non-negative integer`);
    return value as number;
}

function string(value: unknown, label: string): string {
    if (typeof value !== "string" || !value) throw new TypeError(`${label} must be a string`);
    return value;
}
