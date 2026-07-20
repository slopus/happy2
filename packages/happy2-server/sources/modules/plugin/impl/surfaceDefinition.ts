import { PluginError } from "../types.js";

export const contributionPlacements = [
    "sidebarMenu",
    "profileSection",
    "pluginSettings",
    "chatMenu",
    "composerIcon",
    "composerMenu",
    "messageMenu",
] as const;

export type PluginContributionPlacement = (typeof contributionPlacements)[number];
export type PluginAudience = { scope: "all_users" | "user" };
export type PluginAppPresentation = "sidebar" | "detached";
export type PluginAppOpenPresentation = "primary" | "modal" | "fullscreen";
export type JsonObject = { readonly [key: string]: JsonValue };
export type JsonValue = boolean | null | number | string | JsonObject | readonly JsonValue[];

export interface PluginToolAction {
    toolName: string;
    openApp?: { instanceKey: string; presentation: PluginAppOpenPresentation };
}

export interface PluginControlBase {
    id: string;
    title: string;
    description: string;
}

export interface PluginButtonControl extends PluginControlBase {
    kind: "button";
    assetId: string;
    action: PluginToolAction;
}

export interface PluginCheckboxControl extends PluginControlBase {
    kind: "checkbox";
    checked: boolean;
    action: PluginToolAction;
}

export interface PluginCheckboxGroupControl extends PluginControlBase {
    kind: "checkboxGroup";
    options: readonly PluginControlBase[];
    selectedOptionIds: readonly string[];
    action: PluginToolAction;
}

export interface PluginInputControl extends PluginControlBase {
    kind: "input";
    value: string;
    placeholder?: string;
    action: PluginToolAction;
}

export interface PluginTextControl extends PluginControlBase {
    kind: "text";
    text: string;
}

export type PluginInteractiveControl =
    | PluginButtonControl
    | PluginCheckboxControl
    | PluginCheckboxGroupControl
    | PluginInputControl;

export type PluginContributionSpec =
    | PluginButtonControl
    | (PluginControlBase & { kind: "staticMenu"; items: readonly PluginButtonControl[] })
    | (PluginControlBase & { kind: "asyncMenu"; resolverToolName: string })
    | (PluginControlBase & {
          kind: "section";
          controls: readonly (PluginInteractiveControl | PluginTextControl)[];
      });

type PluginAnyControl = PluginContributionSpec | PluginInteractiveControl | PluginTextControl;

export interface PluginAppDefinition {
    assetId: string;
    audience: PluginAudience;
    context: JsonObject;
    description: string;
    instanceKey: string;
    position: number;
    presentation: PluginAppPresentation;
    resourceUri: string;
    revision?: number;
    title: string;
}

export interface PluginContributionDefinition {
    audience: PluginAudience;
    description: string;
    externalKey: string;
    location: PluginContributionPlacement;
    position: number;
    revision?: number;
    spec: PluginContributionSpec;
    title: string;
}

const IDENTIFIER = /^[a-zA-Z0-9](?:[a-zA-Z0-9._-]*[a-zA-Z0-9])?$/;
const MAX_POSITION = 999_999_999;

/** Strictly parses one plugin-owned durable app definition into the bounded host representation. */
export function pluginAppDefinitionParse(value: unknown): PluginAppDefinition {
    const input = record(value, "app definition");
    exact(input, [
        "assetId",
        "audience",
        "context",
        "description",
        "instanceKey",
        "position",
        "presentation",
        "resourceUri",
        "revision",
        "title",
    ]);
    const presentation = input.presentation;
    if (presentation !== "sidebar" && presentation !== "detached")
        invalid("app presentation must be sidebar or detached");
    const resourceUri = boundedString(input.resourceUri, "app resourceUri", 2_048);
    if (!resourceUri.startsWith("ui://")) invalid("app resourceUri must use the ui:// scheme");
    try {
        if (new URL(resourceUri).protocol !== "ui:") throw new Error();
    } catch {
        invalid("app resourceUri must be a valid ui:// URI");
    }
    return {
        assetId: identifier(input.assetId, "app assetId", 64),
        audience: audience(input.audience),
        context: jsonObject(input.context, "app context"),
        description: requiredString(input.description, "app description", 256),
        instanceKey: identifier(input.instanceKey, "app instanceKey", 128),
        position: position(input.position),
        presentation,
        resourceUri,
        ...(input.revision === undefined
            ? {}
            : { revision: nonnegativeInteger(input.revision, "app revision") }),
        title: requiredString(input.title, "app title", 64),
    };
}

/** Strictly parses one native contribution and enforces the placement-to-control matrix. */
export function pluginContributionDefinitionParse(value: unknown): PluginContributionDefinition {
    const input = record(value, "contribution definition");
    exact(input, [
        "audience",
        "description",
        "externalKey",
        "location",
        "position",
        "revision",
        "spec",
        "title",
    ]);
    if (!contributionPlacements.includes(input.location as PluginContributionPlacement))
        invalid("contribution location is unsupported");
    const location = input.location as PluginContributionPlacement;
    const spec = contributionSpec(input.spec);
    if ((location === "profileSection" || location === "pluginSettings") && spec.kind !== "section")
        invalid(`${location} contributions must be sections`);
    if (location === "composerIcon" && spec.kind !== "button")
        invalid("composerIcon contributions must be buttons");
    if (
        location !== "profileSection" &&
        location !== "pluginSettings" &&
        location !== "composerIcon" &&
        spec.kind !== "button" &&
        spec.kind !== "staticMenu" &&
        spec.kind !== "asyncMenu"
    )
        invalid(`${location} contributions must be buttons or menus`);
    return {
        audience: audience(input.audience),
        description: requiredString(input.description, "contribution description", 256),
        externalKey: identifier(input.externalKey, "contribution externalKey", 128),
        location,
        position: position(input.position),
        ...(input.revision === undefined
            ? {}
            : { revision: nonnegativeInteger(input.revision, "contribution revision") }),
        spec: spec as PluginContributionSpec,
        title: requiredString(input.title, "contribution title", 64),
    };
}

/** Strictly parses an app context payload at the same JSON and complexity boundary as app puts. */
export function pluginAppContextParse(value: unknown): JsonObject {
    return jsonObject(value, "app context");
}

/** Validates a plugin-controlled stable identifier before using it as a durable natural key. */
export function pluginSurfaceIdentifier(value: unknown, name: string, maximum: number): string {
    return identifier(value, name, maximum);
}

/** Converts a bounded numeric plugin position into a lexically sortable durable key. */
export function pluginPositionEncode(value: number): string {
    return String(value).padStart(9, "0");
}

/** Restores a validated durable position key to its public numeric form. */
export function pluginPositionDecode(value: string): number {
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed < 0 || parsed > MAX_POSITION)
        throw new Error("Persisted plugin surface position is invalid");
    return parsed;
}

/** Serializes a bounded JSON object and rechecks the durable 32 KiB limit. */
export function pluginSurfaceJson(value: JsonObject | PluginContributionSpec): string {
    const json = JSON.stringify(value);
    if (Buffer.byteLength(json, "utf8") > 32_768) invalid("plugin surface JSON exceeds 32 KiB");
    return json;
}

function contributionSpec(value: unknown): PluginAnyControl {
    const input = record(value, "contribution spec");
    const kind = input.kind;
    if (kind === "button") return button(input, "button");
    if (kind === "checkbox") {
        exact(input, ["action", "checked", "description", "id", "kind", "title"]);
        if (typeof input.checked !== "boolean") invalid("checkbox checked must be a boolean");
        return {
            ...base(input, "checkbox"),
            kind,
            checked: input.checked,
            action: action(input.action),
        };
    }
    if (kind === "checkboxGroup") {
        exact(input, [
            "action",
            "description",
            "id",
            "kind",
            "options",
            "selectedOptionIds",
            "title",
        ]);
        if (
            !Array.isArray(input.options) ||
            input.options.length === 0 ||
            input.options.length > 32
        )
            invalid("checkboxGroup options must contain 1 to 32 entries");
        const options = input.options.map((item, index) => {
            const option = record(item, `checkboxGroup option ${index}`);
            exact(option, ["description", "id", "title"]);
            return base(option, `checkboxGroup option ${index}`);
        });
        uniqueIds(options, "checkboxGroup options");
        if (
            !Array.isArray(input.selectedOptionIds) ||
            input.selectedOptionIds.length > options.length
        )
            invalid("checkboxGroup selectedOptionIds is invalid");
        const selectedOptionIds = input.selectedOptionIds.map((item) =>
            identifier(item, "selected option id", 64),
        );
        if (
            new Set(selectedOptionIds).size !== selectedOptionIds.length ||
            selectedOptionIds.some((id) => !options.some((option) => option.id === id))
        )
            invalid("checkboxGroup selectedOptionIds must uniquely reference declared options");
        return {
            ...base(input, "checkboxGroup"),
            kind,
            options,
            selectedOptionIds,
            action: action(input.action),
        };
    }
    if (kind === "input") {
        exact(input, ["action", "description", "id", "kind", "placeholder", "title", "value"]);
        return {
            ...base(input, "input"),
            kind,
            value: boundedString(input.value, "input value", 2_048),
            ...(input.placeholder === undefined
                ? {}
                : { placeholder: boundedString(input.placeholder, "input placeholder", 128) }),
            action: action(input.action),
        };
    }
    if (kind === "text") {
        exact(input, ["description", "id", "kind", "text", "title"]);
        return {
            ...base(input, "text"),
            kind,
            text: boundedString(input.text, "text content", 2_048, true),
        };
    }
    if (kind === "staticMenu") {
        exact(input, ["description", "id", "items", "kind", "title"]);
        if (!Array.isArray(input.items) || input.items.length > 32)
            invalid("staticMenu items must contain at most 32 buttons");
        const items = input.items.map((item, index) =>
            button(record(item, `staticMenu item ${index}`), `staticMenu item ${index}`),
        );
        uniqueIds(items, "staticMenu items");
        return { ...base(input, "staticMenu"), kind, items };
    }
    if (kind === "asyncMenu") {
        exact(input, ["description", "id", "kind", "resolverToolName", "title"]);
        return {
            ...base(input, "asyncMenu"),
            kind,
            resolverToolName: identifier(input.resolverToolName, "asyncMenu resolverToolName", 256),
        };
    }
    if (kind === "section") {
        exact(input, ["controls", "description", "id", "kind", "title"]);
        if (!Array.isArray(input.controls) || input.controls.length > 32)
            invalid("section controls must contain at most 32 controls");
        const controls = input.controls.map((control) => contributionSpec(control));
        if (
            controls.some(
                (control) =>
                    control.kind === "staticMenu" ||
                    control.kind === "asyncMenu" ||
                    control.kind === "section",
            )
        )
            invalid("sections may contain only basic controls and text");
        uniqueIds(controls, "section controls");
        return {
            ...base(input, "section"),
            kind,
            controls: controls as readonly (PluginInteractiveControl | PluginTextControl)[],
        };
    }
    invalid("contribution spec kind is unsupported");
}

function button(input: Record<string, unknown>, name: string): PluginButtonControl {
    exact(input, ["action", "assetId", "description", "id", "kind", "title"]);
    if (input.kind !== "button") invalid(`${name} must be a button`);
    return {
        ...base(input, name),
        kind: "button",
        assetId: identifier(input.assetId, `${name} assetId`, 64),
        action: action(input.action),
    };
}

function action(value: unknown): PluginToolAction {
    const input = record(value, "control action");
    exact(input, ["openApp", "toolName"]);
    const openApp = input.openApp;
    if (openApp === undefined)
        return { toolName: identifier(input.toolName, "action toolName", 256) };
    const target = record(openApp, "action openApp");
    exact(target, ["instanceKey", "presentation"]);
    if (
        target.presentation !== "primary" &&
        target.presentation !== "modal" &&
        target.presentation !== "fullscreen"
    )
        invalid("action openApp presentation is unsupported");
    return {
        toolName: identifier(input.toolName, "action toolName", 256),
        openApp: {
            instanceKey: identifier(target.instanceKey, "action openApp instanceKey", 128),
            presentation: target.presentation as PluginAppOpenPresentation,
        },
    };
}

function base(input: Record<string, unknown>, name: string): PluginControlBase {
    return {
        id: identifier(input.id, `${name} id`, 64),
        title: requiredString(input.title, `${name} title`, 64),
        description: requiredString(input.description, `${name} description`, 256),
    };
}

function audience(value: unknown): PluginAudience {
    const input = record(value, "audience");
    exact(input, ["scope"]);
    if (input.scope !== "all_users" && input.scope !== "user")
        invalid("audience scope is unsupported");
    return { scope: input.scope };
}

function jsonObject(value: unknown, name: string): JsonObject {
    if (!plainRecord(value)) invalid(`${name} must be a JSON object`);
    let nodes = 0;
    const visit = (candidate: unknown, depth: number): void => {
        nodes += 1;
        if (nodes > 4_096 || depth > 20) invalid(`${name} is too complex`);
        if (candidate === null || typeof candidate === "boolean" || typeof candidate === "string")
            return;
        if (typeof candidate === "number") {
            if (!Number.isFinite(candidate)) invalid(`${name} contains a non-finite number`);
            return;
        }
        if (Array.isArray(candidate)) {
            if (candidate.length > 1_024) invalid(`${name} contains an oversized array`);
            candidate.forEach((entry) => visit(entry, depth + 1));
            return;
        }
        if (!plainRecord(candidate)) invalid(`${name} contains a non-JSON value`);
        const entries = Object.entries(candidate);
        if (entries.length > 1_024) invalid(`${name} contains an oversized object`);
        for (const [key, entry] of entries) {
            if (!key || key.length > 256 || key.includes("\0"))
                invalid(`${name} contains an invalid key`);
            visit(entry, depth + 1);
        }
    };
    visit(value, 0);
    const json = JSON.stringify(value);
    if (Buffer.byteLength(json, "utf8") > 32_768) invalid(`${name} exceeds 32 KiB`);
    return value as JsonObject;
}

function position(value: unknown): number {
    const result = nonnegativeInteger(value, "position");
    if (result > MAX_POSITION) invalid("position is too large");
    return result;
}

function nonnegativeInteger(value: unknown, name: string): number {
    if (!Number.isSafeInteger(value) || (value as number) < 0)
        invalid(`${name} must be a nonnegative safe integer`);
    return value as number;
}

function uniqueIds(values: readonly { id: string }[], name: string): void {
    if (new Set(values.map((value) => value.id)).size !== values.length)
        invalid(`${name} contain duplicate ids`);
}

function identifier(value: unknown, name: string, maximum: number): string {
    const result = boundedString(value, name, maximum);
    if (!IDENTIFIER.test(result)) invalid(`${name} is invalid`);
    return result;
}

function requiredString(value: unknown, name: string, maximum: number): string {
    const result = boundedString(value, name, maximum);
    if (!result.trim()) invalid(`${name} is required`);
    return result;
}

function boundedString(value: unknown, name: string, maximum: number, bytes = false): string {
    if (typeof value !== "string" || value.includes("\0")) invalid(`${name} must be a string`);
    const length = bytes ? Buffer.byteLength(value, "utf8") : value.length;
    if (length > maximum) invalid(`${name} is too large`);
    return value;
}

function exact(input: Record<string, unknown>, allowed: readonly string[]): void {
    const allowedSet = new Set(allowed);
    if (Object.keys(input).some((key) => !allowedSet.has(key)))
        invalid("plugin surface contains an unsupported field");
}

function record(value: unknown, name: string): Record<string, unknown> {
    if (!plainRecord(value)) invalid(`${name} must be an object`);
    return value;
}

function plainRecord(value: unknown): value is Record<string, unknown> {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
}

function invalid(message: string): never {
    throw new PluginError("broken_configuration", message);
}
