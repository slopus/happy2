import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, extname, join, relative, resolve } from "node:path";

const root = new URL("../src/", import.meta.url).pathname;
const files = walk(root).filter((path) => path.endsWith(".ts"));
const failures: string[] = [];

for (const directory of readdirSync(join(root, "modules"))) {
    const moduleDirectory = join(root, "modules", directory);
    if (!statSync(moduleDirectory).isDirectory()) continue;
    const implementationFiles = readdirSync(moduleDirectory).filter(
        (entry) => entry.endsWith(".ts") && entry !== "module.test.ts",
    );
    if (implementationFiles.length !== 1 || !implementationFiles[0]!.endsWith("State.ts"))
        failures.push(
            `modules/${directory}: domain implementation must be one *State.ts file (found ${implementationFiles.join(", ") || "none"})`,
        );
}

for (const file of files) {
    const source = readFileSync(file, "utf8");
    const name = relative(root, file);
    if (
        /(?:\bfrom\s*|\bimport\s*(?:\(\s*)?|\brequire\s*\(\s*)["'](?:react|react-dom|solid-js|svelte|vue|@preact\/signals)(?=["'/])/.test(
            source,
        )
    )
        failures.push(`${name}: state core must not import a UI framework`);
    if (/\b(?:getField|setField|updateField)\b/.test(source))
        failures.push(`${name}: generic known-field mutation API is forbidden`);
    if (/\b(?:field|path)\s*:\s*keyof\b/.test(source))
        failures.push(`${name}: keyof field/path dispatch is forbidden`);
}

const privateCapabilities = files.flatMap((file) => {
    if (!file.includes(`${join("modules", "")}`) || !file.endsWith("Types.ts")) return [];
    const source = readFileSync(file, "utf8");
    return [...source.matchAll(/export\s+(?:type|interface)\s+(\w+Input)\b/g)].map(
        (match) => match[1]!,
    );
});
const indexPath = join(root, "index.ts");
const publicCapabilities = exportedNames(indexPath);
for (const privateCapability of privateCapabilities) {
    if (publicCapabilities.has(privateCapability))
        failures.push(`index.ts: owner-only ${privateCapability} must not be exported`);
}

const actionFiles = files.filter((file) => {
    const stem = basename(file, ".ts");
    return (
        /(?:Add|Change|Create|Delete|Edit|Join|Leave|Load|Mark|More|Open|Reconcile|Remove|Save|Send|Set|Start|Stop|Submit|Update|Upload)$/.test(
            stem,
        ) && !/(?:Store|Types|Context|InputApply|OutputRoute)$/.test(stem)
    );
});
for (const file of actionFiles) {
    const stem = basename(file, ".ts");
    const source = readFileSync(file, "utf8");
    const match = source.match(/export\s+(?:async\s+)?function\s+(\w+)/);
    if (!match || match[1] !== stem)
        failures.push(
            `${relative(root, file)}: action filename and first exported function must match`,
        );
    if (
        !new RegExp(
            `/\\*\\*[\\s\\S]{1,600}?\\*/\\s*export\\s+(?:async\\s+)?function\\s+${stem}\\b`,
        ).test(source)
    )
        failures.push(`${relative(root, file)}: action requires a direct semantic doc comment`);
}

if (failures.length > 0) {
    console.error(failures.join("\n"));
    process.exitCode = 1;
} else {
    console.log(
        `happy2-state architecture check passed (${files.length} source files, ${actionFiles.length} actions)`,
    );
}

function walk(directory: string): string[] {
    return readdirSync(directory).flatMap((entry) => {
        const path = join(directory, entry);
        return statSync(path).isDirectory() ? walk(path) : extname(path) ? [path] : [];
    });
}

function exportedNames(file: string, seen = new Set<string>()): Set<string> {
    if (seen.has(file)) return new Set();
    seen.add(file);
    const source = readFileSync(file, "utf8");
    const names = new Set<string>();
    for (const match of source.matchAll(
        /export\s+(?:declare\s+)?(?:type|interface|class|function|const|let|var|enum)\s+(\w+)/g,
    ))
        names.add(match[1]!);
    for (const match of source.matchAll(
        /export\s+(?:type\s+)?\{([\s\S]*?)\}(?:\s+from\s+["'][^"']+["'])?/g,
    )) {
        for (const item of match[1]!.split(",")) {
            const normalized = item.trim().replace(/^type\s+/, "");
            if (!normalized) continue;
            const parts = normalized.split(/\s+as\s+/);
            names.add((parts[1] ?? parts[0])!.trim());
        }
    }
    for (const match of source.matchAll(/export\s+\*\s+from\s+["']([^"']+)["']/g)) {
        const target = localSource(file, match[1]!);
        if (target) for (const name of exportedNames(target, seen)) names.add(name);
    }
    return names;
}

function localSource(importer: string, specifier: string): string | undefined {
    if (!specifier.startsWith(".")) return undefined;
    const requested = resolve(dirname(importer), specifier);
    const candidates = requested.endsWith(".js")
        ? [`${requested.slice(0, -3)}.ts`, `${requested.slice(0, -3)}.mts`]
        : [requested, `${requested}.ts`, join(requested, "index.ts")];
    return candidates.find((candidate) => existsSync(candidate));
}
