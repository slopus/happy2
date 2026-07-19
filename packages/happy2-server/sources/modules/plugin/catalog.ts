import { createHash } from "node:crypto";
import { lstat, readFile, readdir, realpath } from "node:fs/promises";
import { basename, join, relative, resolve, sep } from "node:path";
import sharp from "sharp";
import { rgbaToThumbHash } from "thumbhash";
import { parseDocument } from "yaml";
import { StrictWebhookUrlPolicy } from "../integrations/ssrf.js";
import type {
    PluginManifest,
    PluginMcp,
    PluginPackage,
    PluginSource,
    PluginSkillSummary,
    PluginVariableDefinition,
    PluginContainer,
    PluginHostPermission,
} from "./types.js";

const MAX_PACKAGE_FILES = 1_000;
const MAX_PACKAGE_BYTES = 20 * 1024 * 1024;
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_ICON_DIMENSION = 4_096;
const SHORT_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ENV_KEY = /^[A-Z_][A-Z0-9_]*$/;
const SKILL_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const VERSION =
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;
const HEADER_NAME = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;
const RESERVED_REMOTE_HEADERS = new Set([
    "__proto__",
    "accept",
    "connection",
    "constructor",
    "content-length",
    "content-type",
    "host",
    "mcp-protocol-version",
    "proxy-authorization",
    "prototype",
    "te",
    "trailer",
    "transfer-encoding",
    "upgrade",
    "user-agent",
]);
const HOST_PERMISSIONS = new Set<PluginHostPermission>(["plugins:list"]);

/** Immutable lookup over validated plugin packages supplied by the built-in catalog. */
export class PluginCatalog {
    private readonly packages: ReadonlyMap<string, PluginPackage>;

    constructor(packages: readonly PluginPackage[]) {
        const indexed = new Map<string, PluginPackage>();
        for (const plugin of packages) {
            if (indexed.has(plugin.manifest.shortName))
                throw new Error(`Duplicate plugin shortName ${plugin.manifest.shortName}`);
            indexed.set(plugin.manifest.shortName, plugin);
        }
        this.packages = indexed;
    }

    list(): PluginPackage[] {
        return [...this.packages.values()].sort((left, right) =>
            left.manifest.displayName.localeCompare(right.manifest.displayName),
        );
    }

    get(shortName: string): PluginPackage | undefined {
        return this.packages.get(shortName);
    }
}

/** Loads and fully validates every child package in a built-in plugins directory. */
export async function pluginCatalogLoad(root: string): Promise<PluginCatalog> {
    let entries;
    try {
        entries = await readdir(root, { withFileTypes: true });
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return new PluginCatalog([]);
        throw error;
    }
    const packages = await Promise.all(
        entries
            .filter((entry) => entry.isDirectory())
            .map((entry) => pluginPackageLoad(join(root, entry.name), entry.name)),
    );
    return new PluginCatalog(packages);
}

/** Loads one built-in package while rejecting unsafe paths, malformed manifests, invalid skills, and non-square icons. */
export async function pluginPackageLoad(
    directory: string,
    sourceReference = basename(directory),
): Promise<PluginPackage> {
    return packageLoad(
        directory,
        { kind: "builtin", reference: sourceReference },
        sourceReference,
        false,
    );
}

/** Loads one downloaded package with the same validation as a built-in package without coupling its short name to an archive directory. */
export async function pluginPackageLoadSource(
    directory: string,
    source: PluginSource,
    requireDirectoryName = false,
): Promise<PluginPackage> {
    return packageLoad(
        directory,
        source,
        requireDirectoryName ? basename(directory) : undefined,
        false,
    );
}

/** Revalidates an installed package while excluding Happy's reserved writable data subtree from its immutable package digest. */
export async function pluginPackageLoadInstalled(
    directory: string,
    source: PluginSource,
    expectedShortName: string,
): Promise<PluginPackage> {
    const loaded = await packageLoad(directory, source, expectedShortName, true);
    if (loaded.manifest.shortName !== expectedShortName)
        throw new Error(`${source.reference}: installed plugin shortName changed`);
    return loaded;
}

async function packageLoad(
    directory: string,
    source: PluginSource,
    expectedShortName: string | undefined,
    installed: boolean,
): Promise<PluginPackage> {
    const canonicalDirectory = await realpath(directory);
    const files = await packageFiles(canonicalDirectory, installed);
    if (!installed && [...files.keys()].some((name) => name === "data" || name.startsWith("data/")))
        throw new Error(`${source.reference}: data is reserved for Happy-managed persistent state`);
    const manifestBuffer = files.get("plugin.json");
    const iconBuffer = files.get("plugin.png");
    const label = source.reference;
    if (!manifestBuffer) throw new Error(`${label}: plugin.json is required`);
    if (!iconBuffer) throw new Error(`${label}: plugin.png is required`);
    const manifest = manifestParse(manifestBuffer.toString("utf8"), label);
    if (expectedShortName && manifest.shortName !== expectedShortName)
        throw new Error(`${label}: shortName must match the package directory name`);
    const iconImage = sharp(iconBuffer, { limitInputPixels: 16_777_216 });
    const icon = await iconImage.metadata();
    if (
        icon.format !== "png" ||
        !icon.width ||
        icon.width !== icon.height ||
        icon.width > MAX_ICON_DIMENSION
    )
        throw new Error(`${label}: plugin.png must be a square PNG up to 4096 pixels`);
    const skills = await skillsParse(files, label);
    if (!manifest.container && !manifest.mcp && skills.length === 0)
        throw new Error(`${label}: a plugin must contain a container, skill, or MCP server`);
    if (manifest.container?.dockerfile)
        requirePackageFile(files, manifest.container.dockerfile, label);
    if (manifest.mcp?.type === "stdio" && manifest.mcp.container)
        requirePackageFile(files, manifest.mcp.container.dockerfile, label);
    const thumbhashInput = await iconImage
        .clone()
        .resize(100, 100, { fit: "inside", withoutEnlargement: true })
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
    return {
        manifest,
        skills,
        directory: canonicalDirectory,
        iconPath: join(canonicalDirectory, "plugin.png"),
        image: {
            contentType: "image/png",
            size: iconBuffer.byteLength,
            width: icon.width,
            height: icon.height,
            thumbhash: Buffer.from(
                rgbaToThumbHash(
                    thumbhashInput.info.width,
                    thumbhashInput.info.height,
                    thumbhashInput.data,
                ),
            ).toString("base64url"),
            checksumSha256: createHash("sha256").update(iconBuffer).digest("hex"),
        },
        packageDigest: digest(files),
        source,
    };
}

async function packageFiles(
    directory: string,
    ignoreInstalledData = false,
): Promise<Map<string, Buffer>> {
    const result = new Map<string, Buffer>();
    let totalBytes = 0;
    const visit = async (current: string): Promise<void> => {
        const entries = await readdir(current, { withFileTypes: true });
        for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
            if (ignoreInstalledData && current === directory && entry.name === "data") continue;
            const path = join(current, entry.name);
            const info = await lstat(path);
            if (info.isSymbolicLink())
                throw new Error(`Plugin packages may not contain symlinks: ${path}`);
            if (info.isDirectory()) {
                await visit(path);
                continue;
            }
            if (!info.isFile()) throw new Error(`Plugin packages may contain only files: ${path}`);
            if (info.size > MAX_FILE_BYTES)
                throw new Error(`Plugin package file is too large: ${path}`);
            if (result.size >= MAX_PACKAGE_FILES)
                throw new Error("Plugin package has too many files");
            totalBytes += info.size;
            if (totalBytes > MAX_PACKAGE_BYTES) throw new Error("Plugin package is too large");
            const name = relative(directory, path).split(sep).join("/");
            result.set(name, await readFile(path));
        }
    };
    await visit(directory);
    return result;
}

function manifestParse(source: string, label: string): PluginManifest {
    let value: unknown;
    try {
        value = JSON.parse(source);
    } catch {
        throw new Error(`${label}: plugin.json must contain valid JSON`);
    }
    const record = object(value, `${label}: plugin.json`);
    only(record, [
        "schemaVersion",
        "version",
        "displayName",
        "shortName",
        "description",
        "variables",
        "container",
        "mcp",
    ]);
    if (record.schemaVersion !== 1) throw new Error(`${label}: schemaVersion must be 1`);
    const version = string(record.version, "version", 64);
    const versionMatch = VERSION.exec(version);
    if (
        !versionMatch ||
        versionMatch[4]
            ?.split(".")
            .some(
                (identifier) =>
                    /^\d+$/.test(identifier) && identifier.length > 1 && identifier.startsWith("0"),
            )
    )
        throw new Error(`${label}: version must be a valid SemVer version`);
    const shortName = string(record.shortName, "shortName", 64);
    if (!SHORT_NAME.test(shortName)) throw new Error(`${label}: shortName is invalid`);
    const variables = variableDefinitions(record.variables, label);
    const parsedContainer =
        record.container === undefined ? undefined : container(record.container, label);
    const parsedMcp = record.mcp === undefined ? undefined : mcp(record.mcp, variables, label);
    if (parsedContainer && parsedMcp?.type === "stdio" && parsedMcp.container)
        throw new Error(`${label}: use container.dockerfile instead of mcp.container.dockerfile`);
    if (parsedContainer && parsedMcp?.type === "remote")
        throw new Error(`${label}: a remote MCP cannot share a local plugin container`);
    if (!parsedContainer && !parsedMcp && variables.length)
        throw new Error(`${label}: variables require a container or MCP server definition`);
    if (parsedContainer && !parsedContainer.command && parsedMcp?.type !== "stdio")
        throw new Error(`${label}: a container without a stdio MCP requires a command`);
    return {
        schemaVersion: 1,
        version,
        displayName: string(record.displayName, "displayName", 100),
        shortName,
        description: string(record.description, "description", 1_000),
        variables,
        ...(parsedContainer ? { container: parsedContainer } : {}),
        ...(parsedMcp ? { mcp: parsedMcp } : {}),
    };
}

function container(value: unknown, label: string): PluginContainer {
    const record = object(value, "container");
    only(record, ["dockerfile", "command", "args", "permissions"]);
    const command =
        record.command === undefined
            ? undefined
            : string(record.command, "container.command", 1_000);
    if (!command && record.args !== undefined)
        throw new Error(`${label}: container.args requires container.command`);
    const rawPermissions = record.permissions ?? [];
    if (!Array.isArray(rawPermissions) || rawPermissions.length > HOST_PERMISSIONS.size)
        throw new Error(`${label}: container.permissions is invalid`);
    const permissions: PluginHostPermission[] = [];
    for (const [index, raw] of rawPermissions.entries()) {
        const permission = string(raw, `container.permissions[${index}]`, 100);
        if (!HOST_PERMISSIONS.has(permission as PluginHostPermission))
            throw new Error(`${label}: unknown container permission ${permission}`);
        if (permissions.includes(permission as PluginHostPermission))
            throw new Error(`${label}: duplicate container permission ${permission}`);
        permissions.push(permission as PluginHostPermission);
    }
    return {
        ...(record.dockerfile === undefined
            ? {}
            : { dockerfile: relativePath(record.dockerfile, "container.dockerfile") }),
        ...(command ? { command } : {}),
        args: command ? stringArray(record.args, "container.args", 128, 4_096) : [],
        permissions,
    };
}

function variableDefinitions(value: unknown, label: string): PluginVariableDefinition[] {
    if (value === undefined) return [];
    if (!Array.isArray(value) || value.length > 64)
        throw new Error(`${label}: variables must be an array with at most 64 entries`);
    const seen = new Set<string>();
    return value.map((item, index) => {
        const record = object(item, `variables[${index}]`);
        only(record, ["key", "displayName", "description", "kind"]);
        const key = string(record.key, `variables[${index}].key`, 128);
        if (!ENV_KEY.test(key)) throw new Error(`${label}: variable key ${key} is invalid`);
        if (seen.has(key)) throw new Error(`${label}: duplicate variable key ${key}`);
        seen.add(key);
        if (record.kind !== "text" && record.kind !== "secret")
            throw new Error(`${label}: variable ${key} kind must be text or secret`);
        return {
            key,
            displayName: string(record.displayName, `${key}.displayName`, 100),
            description: string(record.description, `${key}.description`, 1_000),
            kind: record.kind,
        };
    });
}

function mcp(
    value: unknown,
    variables: readonly PluginVariableDefinition[],
    label: string,
): PluginMcp {
    const record = object(value, "mcp");
    if (record.type === "stdio") {
        only(record, ["type", "command", "args", "container"]);
        const container =
            record.container === undefined ? undefined : object(record.container, "mcp.container");
        if (container) only(container, ["dockerfile"]);
        return {
            type: "stdio",
            command: string(record.command, "mcp.command", 1_000),
            args: stringArray(record.args, "mcp.args", 128, 4_096),
            ...(container
                ? {
                      container: {
                          dockerfile: relativePath(
                              container.dockerfile,
                              "mcp.container.dockerfile",
                          ),
                      },
                  }
                : {}),
        };
    }
    if (record.type === "remote") {
        only(record, ["type", "url", "headers"]);
        const url = string(record.url, "mcp.url", 4_096);
        let normalizedUrl: string;
        try {
            normalizedUrl = new StrictWebhookUrlPolicy().validateForStorage(url);
        } catch (error) {
            throw new Error(
                `${label}: ${error instanceof Error ? error.message : "remote MCP URL is invalid"}`,
            );
        }
        const headersRecord =
            record.headers === undefined ? {} : object(record.headers, "mcp.headers");
        const headers = Object.create(null) as Record<string, string>;
        const headerNames = new Set<string>();
        const declared = new Set(variables.map(({ key }) => key));
        const referenced = new Set<string>();
        for (const [key, raw] of Object.entries(headersRecord)) {
            if (!HEADER_NAME.test(key)) throw new Error(`${label}: invalid MCP header name ${key}`);
            const normalizedKey = key.toLowerCase();
            if (RESERVED_REMOTE_HEADERS.has(normalizedKey))
                throw new Error(`${label}: MCP header ${key} is managed by Happy`);
            if (headerNames.has(normalizedKey))
                throw new Error(`${label}: duplicate MCP header name ${key}`);
            headerNames.add(normalizedKey);
            const template = string(raw, `mcp.headers.${key}`, 8_192, false);
            if (/\r|\n/.test(template))
                throw new Error(`${label}: MCP header values may not contain newlines`);
            for (const match of template.matchAll(/\$\{([^}]+)\}/g))
                if (!declared.has(match[1]!))
                    throw new Error(
                        `${label}: MCP header ${key} references undeclared variable ${match[1]}`,
                    );
                else referenced.add(match[1]!);
            headers[key] = template;
        }
        const unused = variables.find(({ key }) => !referenced.has(key));
        if (unused)
            throw new Error(
                `${label}: remote MCP variable ${unused.key} is not used by a header template`,
            );
        return { type: "remote", url: normalizedUrl, headers };
    }
    throw new Error(`${label}: mcp.type must be stdio or remote`);
}

async function skillsParse(
    files: ReadonlyMap<string, Buffer>,
    label: string,
): Promise<PluginSkillSummary[]> {
    const skillFiles = [...files.keys()].filter((name) => /^skills\/[^/]+\/SKILL\.md$/.test(name));
    const unexpected = [...files.keys()].find(
        (name) => name.startsWith("skills/") && name.split("/").length < 3,
    );
    if (unexpected) throw new Error(`${label}: skill files must live below skills/<name>/`);
    const skillDirectories = new Set(
        [...files.keys()]
            .filter((name) => name.startsWith("skills/"))
            .map((name) => name.split("/")[1]!)
            .filter(Boolean),
    );
    for (const directory of skillDirectories)
        if (!skillFiles.includes(`skills/${directory}/SKILL.md`))
            throw new Error(`${label}: skills/${directory}/SKILL.md is required`);
    return skillFiles.sort().map((path) => {
        const directory = path.split("/")[1]!;
        if (!SKILL_NAME.test(directory))
            throw new Error(`${label}: invalid skill directory ${directory}`);
        const source = files.get(path)!.toString("utf8");
        const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
        if (!match) throw new Error(`${label}: ${path} requires YAML frontmatter`);
        const document = parseDocument(match[1], { uniqueKeys: true });
        if (document.errors.length)
            throw new Error(`${label}: ${path} has invalid YAML frontmatter`);
        const frontmatter = object(document.toJSON(), `${path} frontmatter`);
        const name = string(frontmatter.name, `${path} name`, 64);
        const description = string(frontmatter.description, `${path} description`, 1_024);
        if (name !== directory)
            throw new Error(`${label}: ${path} name must match its parent directory`);
        if (!SKILL_NAME.test(name)) throw new Error(`${label}: ${path} has an invalid skill name`);
        return { name, description, directory: `skills/${directory}` };
    });
}

function requirePackageFile(files: ReadonlyMap<string, Buffer>, path: string, label: string): void {
    if (!files.has(path))
        throw new Error(`${label}: referenced package file ${path} does not exist`);
}

function relativePath(value: unknown, name: string): string {
    const path = string(value, name, 1_000);
    const normalized = path.replaceAll("\\", "/");
    if (
        normalized.startsWith("/") ||
        normalized.split("/").some((part) => !part || part === "." || part === "..") ||
        resolve("/plugin", normalized).split(sep).join("/").startsWith("/plugin/") === false
    )
        throw new Error(`${name} must be a safe package-relative path`);
    return normalized;
}

function digest(files: ReadonlyMap<string, Buffer>): string {
    const hash = createHash("sha256");
    for (const [name, contents] of [...files.entries()].sort(([a], [b]) => a.localeCompare(b))) {
        hash.update(name, "utf8");
        hash.update("\0");
        hash.update(String(contents.byteLength), "utf8");
        hash.update("\0");
        hash.update(contents);
    }
    return `sha256:${hash.digest("hex")}`;
}

function object(value: unknown, name: string): Record<string, unknown> {
    if (!value || typeof value !== "object" || Array.isArray(value))
        throw new Error(`${name} must be an object`);
    return value as Record<string, unknown>;
}

function only(value: Record<string, unknown>, allowed: readonly string[]): void {
    const unexpected = Object.keys(value).find((key) => !allowed.includes(key));
    if (unexpected) throw new Error(`Unexpected field ${unexpected}`);
}

function string(value: unknown, name: string, maximum: number, trim = true): string {
    if (typeof value !== "string") throw new Error(`${name} must be a string`);
    const normalized = trim ? value.trim() : value;
    if (!normalized || normalized.length > maximum || normalized.includes("\u0000"))
        throw new Error(`${name} must contain between 1 and ${maximum} characters`);
    return normalized;
}

function stringArray(
    value: unknown,
    name: string,
    maximumItems: number,
    maximumLength: number,
): string[] {
    if (value === undefined) return [];
    if (!Array.isArray(value) || value.length > maximumItems)
        throw new Error(`${name} must be an array with at most ${maximumItems} entries`);
    return value.map((item, index) => string(item, `${name}[${index}]`, maximumLength, false));
}
