import { randomBytes } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { DesktopTopology } from "../shared/desktopContract";
import { desktopTopologyIdValid, remoteEndpointNormalize } from "./runtimeValidation";

const settingsVersion = 2;
const maximumTopologies = 100;

export interface DesktopSettings {
    activeTopologyId: string;
    topologies: readonly DesktopTopology[];
    version: typeof settingsVersion;
}

export async function desktopSettingsRead(path: string): Promise<DesktopSettings | undefined> {
    try {
        const source = await readFile(path, "utf8");
        const parsed: unknown = JSON.parse(source);
        if (!isRecord(parsed)) return undefined;
        if (parsed.version === 1) return desktopSettingsVersionOneRead(path, source, parsed);
        if (parsed.version !== settingsVersion) return undefined;
        if (!desktopTopologyIdValid(parsed.activeTopologyId) || !Array.isArray(parsed.topologies))
            return undefined;
        if (parsed.topologies.length === 0 || parsed.topologies.length > maximumTopologies)
            return undefined;
        const topologies = parsed.topologies.map(topologyParse);
        if (topologies.some((topology) => topology === undefined)) return undefined;
        const validTopologies = topologies as DesktopTopology[];
        const identities = new Set(validTopologies.map(({ id }) => id));
        if (identities.size !== validTopologies.length || !identities.has(parsed.activeTopologyId))
            return undefined;
        return {
            activeTopologyId: parsed.activeTopologyId,
            topologies: validTopologies,
            version: settingsVersion,
        };
    } catch (error) {
        if (error instanceof SyntaxError || (error as NodeJS.ErrnoException).code === "ENOENT")
            return undefined;
        throw error;
    }
}

async function desktopSettingsVersionOneRead(
    path: string,
    source: string,
    value: Record<string, unknown>,
): Promise<DesktopSettings | undefined> {
    const migrated = desktopSettingsVersionOneMigrate(value);
    if (migrated) {
        await desktopSettingsWrite(path, migrated);
        return migrated;
    }
    const backupPath = path.endsWith(".json")
        ? `${path.slice(0, -".json".length)}.v1.json`
        : `${path}.v1`;
    try {
        await writeFile(backupPath, source, { flag: "wx", mode: 0o600 });
        await unlink(path);
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        if ((await readFile(backupPath, "utf8")) === source) await unlink(path);
    }
    return undefined;
}

function desktopSettingsVersionOneMigrate(
    value: Record<string, unknown>,
): DesktopSettings | undefined {
    if (!desktopTopologyIdValid(value.activeTopologyId) || !Array.isArray(value.topologies))
        return undefined;
    if (value.topologies.length === 0 || value.topologies.length > maximumTopologies)
        return undefined;
    const topologies: DesktopTopology[] = [];
    for (const candidate of value.topologies) {
        if (
            !isRecord(candidate) ||
            !desktopTopologyIdValid(candidate.id) ||
            candidate.mode !== "local" ||
            (candidate.rig !== "embedded" && candidate.rig !== "global")
        )
            return undefined;
        topologies.push({ id: candidate.id, mode: "local" });
    }
    const identities = new Set(topologies.map(({ id }) => id));
    if (identities.size !== topologies.length || !identities.has(value.activeTopologyId))
        return undefined;
    return { activeTopologyId: value.activeTopologyId, topologies, version: settingsVersion };
}

export async function desktopSettingsWrite(path: string, settings: DesktopSettings): Promise<void> {
    const validated = settingsValidate(settings);
    await mkdir(dirname(path), { mode: 0o700, recursive: true });
    const temporary = `${path}.${process.pid}.tmp`;
    await writeFile(temporary, `${JSON.stringify(validated, undefined, 2)}\n`, { mode: 0o600 });
    await rename(temporary, path);
}

export function desktopSettingsActivate(
    settings: DesktopSettings | undefined,
    topology: DesktopTopology,
): DesktopSettings {
    const existing = settings?.topologies.find(({ id }) => id === topology.id);
    const topologies = existing
        ? settings!.topologies.map((candidate) =>
              candidate.id === topology.id ? topology : candidate,
          )
        : [...(settings?.topologies ?? []), topology];
    return settingsValidate({
        activeTopologyId: topology.id,
        topologies,
        version: settingsVersion,
    });
}

export function desktopTopologyIdCreate(): string {
    return `top_${randomBytes(16).toString("hex")}`;
}

function settingsValidate(settings: DesktopSettings): DesktopSettings {
    if (settings.version !== settingsVersion) throw new Error("Desktop settings are invalid.");
    if (settings.topologies.length === 0 || settings.topologies.length > maximumTopologies)
        throw new Error("Desktop settings contain an invalid number of topologies.");
    const topologies = settings.topologies.map((topology) => {
        const parsed = topologyParse(topology);
        if (!parsed) throw new Error("Desktop settings contain an invalid topology.");
        return parsed;
    });
    const identities = new Set(topologies.map(({ id }) => id));
    if (identities.size !== topologies.length || !identities.has(settings.activeTopologyId))
        throw new Error("Desktop settings contain invalid topology identities.");
    return { activeTopologyId: settings.activeTopologyId, topologies, version: settingsVersion };
}

function topologyParse(value: unknown): DesktopTopology | undefined {
    if (!isRecord(value) || !desktopTopologyIdValid(value.id)) return undefined;
    if (value.mode === "local" && Object.keys(value).every((key) => ["id", "mode"].includes(key)))
        return { id: value.id, mode: "local" };
    if (
        value.mode === "cloud" &&
        typeof value.serverUrl === "string" &&
        Object.keys(value).every((key) => ["id", "mode", "serverUrl"].includes(key))
    ) {
        try {
            return {
                id: value.id,
                mode: "cloud",
                serverUrl: remoteEndpointNormalize(value.serverUrl),
            };
        } catch {
            return undefined;
        }
    }
    return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === "object" && !Array.isArray(value);
}
