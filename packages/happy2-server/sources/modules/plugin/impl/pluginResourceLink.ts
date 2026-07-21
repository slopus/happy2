const MAX_LINKS = 24;
const MAX_URI_LENGTH = 2_048;
const MAX_NAME_LENGTH = 240;
const MAX_DESCRIPTION_LENGTH = 2_048;
const MAX_MIME_TYPE_LENGTH = 255;

export interface PluginResourceLinkInput {
    position: number;
    kind: "resource" | "shared_link";
    uri: string;
    name: string;
    title?: string;
    description?: string;
    mimeType?: string;
    size?: number;
}

/** Extracts bounded standard MCP resource-link blocks and classifies browser-share links without retaining arbitrary result metadata. */
export function pluginResourceLinkInputs(
    result: Readonly<Record<string, unknown>>,
): PluginResourceLinkInput[] {
    if (result.isError === true || !Array.isArray(result.content)) return [];
    const links: PluginResourceLinkInput[] = [];
    for (const block of result.content) {
        if (!plainObject(block) || block.type !== "resource_link") continue;
        if (links.length === MAX_LINKS) break;
        const parsed = resourceLink(block, links.length);
        if (parsed) links.push(parsed);
    }
    return links;
}

function resourceLink(
    block: Readonly<Record<string, unknown>>,
    position: number,
): PluginResourceLinkInput | undefined {
    const uri = boundedString(block.uri, MAX_URI_LENGTH);
    const name = boundedString(block.name, MAX_NAME_LENGTH);
    const mimeType = optionalBoundedString(block.mimeType, MAX_MIME_TYPE_LENGTH);
    const parsedSize = optionalSize(block.size);
    if (!uri || !name || mimeType === null || parsedSize === null) return undefined;
    const kind = sharedLinkKind(uri, mimeType);
    if (!kind) return undefined;
    const title = optionalBoundedString(block.title, MAX_NAME_LENGTH);
    const description = optionalBoundedString(block.description, MAX_DESCRIPTION_LENGTH);
    if (title === null || description === null) return undefined;
    return {
        position,
        kind,
        uri,
        name,
        ...(title ? { title } : {}),
        ...(description ? { description } : {}),
        ...(mimeType ? { mimeType } : {}),
        ...(parsedSize === undefined ? {} : { size: parsedSize }),
    };
}

function sharedLinkKind(
    uri: string,
    mimeType: string | undefined,
): PluginResourceLinkInput["kind"] | undefined {
    let protocol: string;
    try {
        protocol = new URL(uri).protocol;
    } catch {
        return undefined;
    }
    const baseMimeType = mimeType?.split(";", 1)[0]?.trim().toLocaleLowerCase();
    return (protocol === "http:" || protocol === "https:") &&
        (baseMimeType === undefined || baseMimeType === "text/html")
        ? "shared_link"
        : "resource";
}

function optionalSize(value: unknown): number | null | undefined {
    if (value === undefined) return undefined;
    return Number.isSafeInteger(value) && (value as number) >= 0 ? (value as number) : null;
}

function optionalBoundedString(value: unknown, maximum: number): string | null | undefined {
    if (value === undefined) return undefined;
    return boundedString(value, maximum) ?? null;
}

function boundedString(value: unknown, maximum: number): string | undefined {
    return typeof value === "string" && value.length > 0 && value.length <= maximum
        ? value
        : undefined;
}

function plainObject(value: unknown): value is Readonly<Record<string, unknown>> {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
