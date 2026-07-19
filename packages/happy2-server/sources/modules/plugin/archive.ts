import { inflateRawSync } from "node:zlib";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, posix, resolve, sep } from "node:path";

const CENTRAL_SIGNATURE = 0x02014b50;
const END_SIGNATURE = 0x06054b50;
const LOCAL_SIGNATURE = 0x04034b50;
const MAX_ARCHIVE_BYTES = 50 * 1024 * 1024;
const MAX_ENTRIES = 10_000;
const MAX_PACKAGE_FILES = 1_000;
const MAX_PACKAGE_BYTES = 20 * 1024 * 1024;
const MAX_FILE_BYTES = 5 * 1024 * 1024;

interface ZipEntry {
    compressedSize: number;
    crc32: number;
    externalAttributes: number;
    flags: number;
    localOffset: number;
    method: number;
    name: string;
    uncompressedSize: number;
}

export interface PluginArchiveCandidate {
    directory: string;
    packagePath: string;
}

/** Extracts only eligible plugin package roots from a bounded ZIP, rejecting links, bombs, traversal, and ambiguous generic archives. */
export async function pluginArchiveExtract(
    archive: Buffer,
    destination: string,
    kind: "github" | "zip",
): Promise<PluginArchiveCandidate[]> {
    if (archive.byteLength === 0 || archive.byteLength > MAX_ARCHIVE_BYTES)
        throw new Error("Plugin ZIP must be between 1 byte and 50 MiB");
    const entries = zipEntries(archive);
    const files = entries.filter((entry) => !entry.name.endsWith("/"));
    const wrapper = commonWrapper(entries.map(({ name }) => name));
    const manifests = files
        .map((entry) => ({ entry, path: stripWrapper(entry.name, wrapper) }))
        .filter(({ path }) => path === "plugin.json" || path.endsWith("/plugin.json"));
    let roots: Array<{ packagePath: string; rawPrefix: string }>;
    if (kind === "github") {
        const root = manifests.find(({ path }) => path === "plugin.json");
        const nested = manifests.filter(({ path }) => /^plugins\/[^/]+\/plugin\.json$/.test(path));
        const selected = root ? [root] : nested;
        if (selected.length === 0)
            throw new Error(
                "GitHub repository must contain plugin.json at its root or in plugins/<name>",
            );
        roots = selected.map(({ entry, path }) => ({
            packagePath: posix.dirname(path) === "." ? "" : posix.dirname(path),
            rawPrefix: posix.dirname(entry.name) === "." ? "" : `${posix.dirname(entry.name)}/`,
        }));
    } else {
        if (manifests.length !== 1)
            throw new Error("A plugin ZIP must contain exactly one plugin.json");
        const [{ entry, path }] = manifests;
        roots = [
            {
                packagePath: posix.dirname(path) === "." ? "" : posix.dirname(path),
                rawPrefix: posix.dirname(entry.name) === "." ? "" : `${posix.dirname(entry.name)}/`,
            },
        ];
    }

    await mkdir(destination, { recursive: true, mode: 0o700 });
    const results: PluginArchiveCandidate[] = [];
    for (const [index, root] of roots.entries()) {
        const candidateDirectory = resolve(destination, `candidate-${index}`);
        await mkdir(candidateDirectory, { recursive: true, mode: 0o700 });
        const selected = files.filter(({ name }) =>
            root.rawPrefix ? name.startsWith(root.rawPrefix) : true,
        );
        if (selected.length > MAX_PACKAGE_FILES)
            throw new Error("Plugin package has too many files");
        let totalBytes = 0;
        const names = new Set<string>();
        for (const entry of selected) {
            const relativeName = root.rawPrefix
                ? entry.name.slice(root.rawPrefix.length)
                : entry.name;
            const safeName = safeRelativePath(relativeName);
            if (!safeName || names.has(safeName))
                throw new Error("Plugin ZIP contains duplicate or invalid package paths");
            names.add(safeName);
            if (entry.uncompressedSize > MAX_FILE_BYTES)
                throw new Error(`Plugin package file is too large: ${safeName}`);
            totalBytes += entry.uncompressedSize;
            if (totalBytes > MAX_PACKAGE_BYTES) throw new Error("Plugin package is too large");
            const output = resolve(candidateDirectory, safeName.split("/").join(sep));
            if (!output.startsWith(`${candidateDirectory}${sep}`))
                throw new Error("Plugin ZIP path escapes its package directory");
            await mkdir(dirname(output), { recursive: true, mode: 0o700 });
            await writeFile(output, zipEntryBody(archive, entry), { mode: 0o600 });
        }
        results.push({ directory: candidateDirectory, packagePath: root.packagePath });
    }
    return results;
}

function zipEntries(archive: Buffer): ZipEntry[] {
    const endOffset = findEnd(archive);
    const entryCount = archive.readUInt16LE(endOffset + 10);
    const centralSize = archive.readUInt32LE(endOffset + 12);
    const centralOffset = archive.readUInt32LE(endOffset + 16);
    if (entryCount === 0xffff || centralSize === 0xffffffff || centralOffset === 0xffffffff)
        throw new Error("ZIP64 plugin archives are not supported");
    if (entryCount === 0 || entryCount > MAX_ENTRIES)
        throw new Error("Plugin ZIP has an invalid number of entries");
    if (centralOffset + centralSize > endOffset)
        throw new Error("Plugin ZIP central directory is invalid");
    const decoder = new TextDecoder("utf-8", { fatal: true });
    const result: ZipEntry[] = [];
    let offset = centralOffset;
    for (let index = 0; index < entryCount; index += 1) {
        if (offset + 46 > archive.byteLength || archive.readUInt32LE(offset) !== CENTRAL_SIGNATURE)
            throw new Error("Plugin ZIP central directory is malformed");
        const flags = archive.readUInt16LE(offset + 8);
        const method = archive.readUInt16LE(offset + 10);
        const nameLength = archive.readUInt16LE(offset + 28);
        const extraLength = archive.readUInt16LE(offset + 30);
        const commentLength = archive.readUInt16LE(offset + 32);
        const next = offset + 46 + nameLength + extraLength + commentLength;
        if (next > archive.byteLength) throw new Error("Plugin ZIP entry is truncated");
        if ((flags & 0x1) !== 0) throw new Error("Encrypted plugin ZIP entries are not supported");
        if (method !== 0 && method !== 8)
            throw new Error("Plugin ZIP uses an unsupported compression method");
        let name: string;
        try {
            name = decoder.decode(archive.subarray(offset + 46, offset + 46 + nameLength));
        } catch {
            throw new Error("Plugin ZIP entry names must use valid UTF-8");
        }
        name = safeArchivePath(name);
        const externalAttributes = archive.readUInt32LE(offset + 38);
        const unixMode = externalAttributes >>> 16;
        if ((unixMode & 0o170000) === 0o120000)
            throw new Error("Plugin ZIP packages may not contain symbolic links");
        result.push({
            compressedSize: archive.readUInt32LE(offset + 20),
            crc32: archive.readUInt32LE(offset + 16),
            externalAttributes,
            flags,
            localOffset: archive.readUInt32LE(offset + 42),
            method,
            name,
            uncompressedSize: archive.readUInt32LE(offset + 24),
        });
        offset = next;
    }
    if (offset !== centralOffset + centralSize)
        throw new Error("Plugin ZIP central directory size does not match its entries");
    return result;
}

function zipEntryBody(archive: Buffer, entry: ZipEntry): Buffer {
    const offset = entry.localOffset;
    if (offset + 30 > archive.byteLength || archive.readUInt32LE(offset) !== LOCAL_SIGNATURE)
        throw new Error("Plugin ZIP local entry is malformed");
    const nameLength = archive.readUInt16LE(offset + 26);
    const extraLength = archive.readUInt16LE(offset + 28);
    let localName: string;
    try {
        localName = new TextDecoder("utf-8", { fatal: true }).decode(
            archive.subarray(offset + 30, offset + 30 + nameLength),
        );
    } catch {
        throw new Error("Plugin ZIP local entry names must use valid UTF-8");
    }
    if (safeArchivePath(localName) !== entry.name)
        throw new Error("Plugin ZIP local and central entry names do not match");
    const start = offset + 30 + nameLength + extraLength;
    const end = start + entry.compressedSize;
    if (end > archive.byteLength) throw new Error("Plugin ZIP entry data is truncated");
    const compressed = archive.subarray(start, end);
    let body: Buffer;
    try {
        body =
            entry.method === 0
                ? Buffer.from(compressed)
                : inflateRawSync(compressed, {
                      maxOutputLength: Math.max(1, entry.uncompressedSize + 1),
                  });
    } catch (error) {
        throw new Error(`Plugin ZIP entry cannot be safely decompressed: ${entry.name}`, {
            cause: error,
        });
    }
    if (body.byteLength !== entry.uncompressedSize)
        throw new Error(`Plugin ZIP entry size is invalid: ${entry.name}`);
    if (crc32(body) !== entry.crc32)
        throw new Error(`Plugin ZIP entry checksum is invalid: ${entry.name}`);
    return body;
}

function findEnd(archive: Buffer): number {
    const minimum = Math.max(0, archive.byteLength - 65_557);
    for (let offset = archive.byteLength - 22; offset >= minimum; offset -= 1)
        if (archive.readUInt32LE(offset) === END_SIGNATURE) {
            const commentLength = archive.readUInt16LE(offset + 20);
            if (offset + 22 + commentLength === archive.byteLength) return offset;
        }
    throw new Error("Plugin upload is not a valid ZIP archive");
}

function commonWrapper(names: readonly string[]): string {
    const firstParts = names.map((name) => name.split("/", 1)[0]!).filter(Boolean);
    if (!firstParts.length || !firstParts.every((part) => part === firstParts[0])) return "";
    return names.some((name) => name === firstParts[0]) ? "" : `${firstParts[0]}/`;
}

function stripWrapper(name: string, wrapper: string): string {
    return wrapper && name.startsWith(wrapper) ? name.slice(wrapper.length) : name;
}

function safeArchivePath(value: string): string {
    if (!value || value.includes("\0") || value.includes("\\") || value.startsWith("/"))
        throw new Error("Plugin ZIP contains an unsafe entry path");
    const directory = value.endsWith("/");
    const normalized = posix.normalize(value);
    if (normalized === ".." || normalized.startsWith("../") || normalized.startsWith("/"))
        throw new Error("Plugin ZIP contains an unsafe entry path");
    return directory && !normalized.endsWith("/") ? `${normalized}/` : normalized;
}

function safeRelativePath(value: string): string | undefined {
    if (!value || value.endsWith("/")) return undefined;
    const normalized = safeArchivePath(value);
    return normalized === "." ? undefined : normalized;
}

let crcTable: Uint32Array | undefined;

function crc32(value: Buffer): number {
    crcTable ??= Uint32Array.from({ length: 256 }, (_, index) => {
        let current = index;
        for (let bit = 0; bit < 8; bit += 1)
            current = (current & 1) !== 0 ? 0xedb88320 ^ (current >>> 1) : current >>> 1;
        return current >>> 0;
    });
    let result = 0xffffffff;
    for (const byte of value) result = crcTable[(result ^ byte) & 0xff]! ^ (result >>> 8);
    return (result ^ 0xffffffff) >>> 0;
}
