import { readdir, readFile } from "node:fs/promises";
import { basename, posix, relative, sep } from "node:path";
import { parse } from "@babel/parser";
import {
    VISITOR_KEYS,
    isArrowFunctionExpression,
    isCallExpression,
    isClassDeclaration,
    isExportNamedDeclaration,
    isExportSpecifier,
    isFunctionDeclaration,
    isFunctionExpression,
    isIdentifier,
    isImportDeclaration,
    isImportNamespaceSpecifier,
    isImportSpecifier,
    isMemberExpression,
    isStringLiteral,
    isTemplateLiteral,
    isTSTypeReference,
    isVariableDeclaration,
    isVariableDeclarator,
    type ArrowFunctionExpression,
    type File,
    type FunctionDeclaration,
    type FunctionExpression,
    type Node,
} from "@babel/types";

export interface ArchitectureViolation {
    file: string;
    line: number;
    message: string;
}

const MUTATION_METHODS = new Set(["insert", "update", "delete"]);
const ATOMICITY_CLAIM = /\b(?:atomic(?:ally|ity)?|cannot commit only part)\b/i;
const READ_ONLY_CLAIM =
    /\b(?:without (?:a )?(?:durable )?mutation|does not (?:mutate|write) durable state|read-only)\b/i;
const ENTITY_PREFIXES: Record<string, readonly string[]> = {
    agent: ["agent", "rigEvent"],
    audit: ["audit"],
    auth: ["account", "developmentToken", "magicLink", "oidcState", "session"],
    automation: ["automation"],
    backup: ["backup"],
    bot: ["bot"],
    call: ["call"],
    chat: [
        "channel",
        "chat",
        "directMessage",
        "file",
        "message",
        "syncEvent",
        "syncSequence",
        "user",
    ],
    "data-export": ["dataExport"],
    document: ["document"],
    draft: ["draft"],
    emoji: ["customEmoji"],
    file: ["file"],
    integration: ["apiCredential", "bot", "integration", "slashCommand", "user"],
    message: ["message"],
    moderation: ["accountBan", "moderation"],
    notification: ["chatNotification", "notification"],
    operations: ["audit", "syncEvent", "user"],
    permission: ["permission", "role", "user"],
    plugin: ["plugin"],
    "port-share": ["portShare"],
    presence: ["presence"],
    request: ["idempotency"],
    retention: ["retention"],
    "scheduled-message": ["scheduledMessage", "syncEvent", "syncSequence"],
    search: ["search"],
    server: ["server"],
    "server-profile": ["serverProfile"],
    setup: ["setup"],
    sync: ["chatSync", "sync"],
    thread: ["thread"],
    user: ["contact", "syncSequence", "user"],
    webhook: ["incomingWebhook", "outgoingWebhook", "webhook"],
};

interface ActionFunction {
    name: string;
    node: FunctionDeclaration | ArrowFunctionExpression | FunctionExpression;
    start: number;
}

interface SchemaImports {
    direct: Set<string>;
    namespaces: Set<string>;
}

export async function scanServerArchitecture(sourceRoot: string): Promise<ArchitectureViolation[]> {
    const violations: ArchitectureViolation[] = [];
    for (const file of await sourceFiles(sourceRoot)) {
        const source = await readFile(file, "utf8");
        inspectSource(sourceRoot, file, source, violations);
    }
    return violations.sort(
        (left, right) =>
            left.file.localeCompare(right.file) ||
            left.line - right.line ||
            left.message.localeCompare(right.message),
    );
}

function inspectSource(
    sourceRoot: string,
    file: string,
    source: string,
    violations: ArchitectureViolation[],
): void {
    const localFile = relative(sourceRoot, file).split(sep).join("/");
    if (localFile.endsWith(".test.ts") || localFile.endsWith(".d.ts")) return;
    const ast = parse(source, {
        sourceType: "module",
        sourceFilename: localFile,
        plugins: ["typescript", "importMeta"],
    });
    const exportedAsync = exportedAsyncFunctions(ast);
    const actionName = basename(file, ".ts");
    const matchingAction = exportedAsync.find((candidate) => candidate.name === actionName);
    const sharedImplementation = localFile.includes("/impl/") || localFile.includes("/utils/");
    const schemaNames = importedSchemaNames(ast);
    const mutationNodes: Node[] = [];
    const durableReadNodes: Node[] = [];

    visit(ast, (node) => {
        if (isClassDeclaration(node) && node.id && persistenceFacadeName(node.id.name))
            violations.push({
                file: localFile,
                line: line(node),
                message: `stateful persistence facade ${node.id.name} is forbidden`,
            });
        if (isCallExpression(node) && isDrizzleMutation(node, schemaNames))
            mutationNodes.push(node);
        if (isCallExpression(node) && isDrizzleRead(node, schemaNames)) durableReadNodes.push(node);
        if (isCallExpression(node) && isRawMutation(node)) mutationNodes.push(node);
        if (
            isCallExpression(node) &&
            isIdentifier(node.callee, { name: "sqliteTable" }) &&
            localFile !== "modules/schema.ts"
        )
            violations.push({
                file: localFile,
                line: line(node),
                message: "Drizzle table definitions belong only in modules/schema.ts",
            });
    });

    for (const statement of ast.program.body) {
        if (
            !isImportDeclaration(statement) ||
            !isStringLiteral(statement.source) ||
            !statement.source.value.startsWith(".")
        )
            continue;
        const target = posix.normalize(
            posix.join(posix.dirname(localFile), statement.source.value),
        );
        if (target.includes("/impl/") || target.includes("/utils/")) {
            const owner = productModule(localFile);
            const targetOwner = productModule(target);
            if (owner && targetOwner && owner !== targetOwner)
                violations.push({
                    file: localFile,
                    line: line(statement),
                    message: `module ${owner} must not import private ${targetOwner} implementation`,
                });
        }
    }

    for (const action of sharedImplementation ? [] : exportedAsync) {
        if (firstParameterIsExecutor(action) && action.name !== actionName)
            violations.push({
                file: localFile,
                line: line(action.node),
                message: `durable action ${action.name} must live in ${action.name}.ts`,
            });
    }

    if (mutationNodes.length > 0 && !approvedMutationLocation(localFile, matchingAction))
        violations.push({
            file: localFile,
            line: line(mutationNodes[0]!),
            message:
                "direct durable mutation must live in a same-named exported action or module impl/utils file",
        });

    if (
        matchingAction &&
        !sharedImplementation &&
        localFile !== "modules/server/serverSchemaMigrate.ts" &&
        (mutationNodes.length > 0 || durableReadNodes.length > 0) &&
        !firstParameterIsExecutor(matchingAction)
    )
        violations.push({
            file: localFile,
            line: line(matchingAction.node),
            message: `durable action ${actionName} must receive its Drizzle executor first`,
        });

    if (!matchingAction || sharedImplementation) return;
    if (exportedAsync.length !== 1)
        violations.push({
            file: localFile,
            line: line(matchingAction.node),
            message: "an action file must export exactly one async function",
        });
    if (!hasEntityPrefix(localFile, actionName))
        violations.push({
            file: localFile,
            line: line(matchingAction.node),
            message: `action ${actionName} must use entity-first naming`,
        });
    const comment = semanticCommentBefore(source, matchingAction.start);
    if (!comment)
        violations.push({
            file: localFile,
            line: line(matchingAction.node),
            message: `action ${actionName} needs a semantic doc comment`,
        });
    else if (mutationNodes.length > 0 && READ_ONLY_CLAIM.test(comment))
        violations.push({
            file: localFile,
            line: line(matchingAction.node),
            message: `action ${actionName} doc comment contradicts its durable mutation`,
        });
    else if (comment.length < 90 || semanticSentences(comment).length < 2)
        violations.push({
            file: localFile,
            line: line(matchingAction.node),
            message: `action ${actionName} doc comment must state specific semantics, durable effects, and boundary rationale`,
        });
    else {
        const changedTables = mutationNodes
            .filter((node): node is Extract<Node, { type: "CallExpression" }> =>
                isCallExpression(node),
            )
            .map((node) => drizzleMutationTable(node, schemaNames))
            .filter((name): name is string => Boolean(name));
        if (changedTables.length > 0 && !changedTables.some((table) => comment.includes(table)))
            violations.push({
                file: localFile,
                line: line(matchingAction.node),
                message: `action ${actionName} doc comment must name a changed durable table`,
            });
        if (
            mutationNodes.length > 1 &&
            ATOMICITY_CLAIM.test(comment) &&
            !firstParameterIsTransaction(matchingAction) &&
            !mutationsShareTransaction(matchingAction, mutationNodes)
        )
            violations.push({
                file: localFile,
                line: line(matchingAction.node),
                message: `action ${actionName} claims atomicity without a transaction boundary`,
            });
    }
}

function exportedAsyncFunctions(ast: File): ActionFunction[] {
    const localFunctions = new Map<string, ActionFunction>();
    for (const statement of ast.program.body) {
        const declaration = isExportNamedDeclaration(statement) ? statement.declaration : statement;
        if (!declaration) continue;
        if (isFunctionDeclaration(declaration) && declaration.async && declaration.id)
            localFunctions.set(declaration.id.name, {
                name: declaration.id.name,
                node: declaration,
                start: declaration.start ?? 0,
            });
        if (!isVariableDeclaration(declaration)) continue;
        for (const variable of declaration.declarations) {
            if (
                !isVariableDeclarator(variable) ||
                !isIdentifier(variable.id) ||
                !variable.init ||
                (!isArrowFunctionExpression(variable.init) &&
                    !isFunctionExpression(variable.init)) ||
                !variable.init.async
            )
                continue;
            localFunctions.set(variable.id.name, {
                name: variable.id.name,
                node: variable.init,
                start: declaration.start ?? variable.start ?? 0,
            });
        }
    }
    const functions: ActionFunction[] = [];
    for (const statement of ast.program.body) {
        if (!isExportNamedDeclaration(statement)) continue;
        if (statement.declaration) {
            const declared = isFunctionDeclaration(statement.declaration)
                ? statement.declaration.id?.name
                : isVariableDeclaration(statement.declaration)
                  ? statement.declaration.declarations
                        .map((declaration) =>
                            isIdentifier(declaration.id) ? declaration.id.name : undefined,
                        )
                        .filter((name): name is string => Boolean(name))
                  : [];
            for (const name of typeof declared === "string" ? [declared] : (declared ?? [])) {
                const action = localFunctions.get(name);
                if (action) functions.push(action);
            }
        }
        for (const specifier of statement.specifiers) {
            if (!isExportSpecifier(specifier) || !isIdentifier(specifier.local)) continue;
            const action = localFunctions.get(specifier.local.name);
            if (!action) continue;
            const exportedName = isIdentifier(specifier.exported)
                ? specifier.exported.name
                : specifier.exported.value;
            functions.push({ ...action, name: exportedName });
        }
    }
    return functions;
}

function importedSchemaNames(ast: File): SchemaImports {
    const direct = new Set<string>();
    const namespaces = new Set<string>();
    for (const statement of ast.program.body) {
        if (
            !isImportDeclaration(statement) ||
            !isStringLiteral(statement.source) ||
            !/(?:^|\/)schema\.js$/.test(statement.source.value)
        )
            continue;
        for (const specifier of statement.specifiers) {
            if (isImportSpecifier(specifier)) direct.add(specifier.local.name);
            if (isImportNamespaceSpecifier(specifier)) namespaces.add(specifier.local.name);
        }
    }
    return { direct, namespaces };
}

function isDrizzleMutation(
    node: Extract<Node, { type: "CallExpression" }>,
    schemaNames: SchemaImports,
) {
    if (!isMemberExpression(node.callee) || !isIdentifier(node.callee.property)) return false;
    if (!MUTATION_METHODS.has(node.callee.property.name)) return false;
    return isSchemaTable(node.arguments[0], schemaNames);
}

function drizzleMutationTable(
    node: Extract<Node, { type: "CallExpression" }>,
    schemaNames: SchemaImports,
): string | undefined {
    if (!isMemberExpression(node.callee) || !isIdentifier(node.callee.property)) return undefined;
    if (!MUTATION_METHODS.has(node.callee.property.name)) return undefined;
    const table = node.arguments[0];
    if (isIdentifier(table) && schemaNames.direct.has(table.name)) return table.name;
    if (
        isMemberExpression(table) &&
        isIdentifier(table.object) &&
        schemaNames.namespaces.has(table.object.name) &&
        isIdentifier(table.property)
    )
        return table.property.name;
    return undefined;
}

function isDrizzleRead(
    node: Extract<Node, { type: "CallExpression" }>,
    schemaNames: SchemaImports,
) {
    if (isMemberExpression(node.callee) && isIdentifier(node.callee.property, { name: "from" }))
        return isSchemaTable(node.arguments[0], schemaNames);
    if (
        !isMemberExpression(node.callee) ||
        !isIdentifier(node.callee.property) ||
        !new Set(["findFirst", "findMany"]).has(node.callee.property.name) ||
        !isMemberExpression(node.callee.object) ||
        !isIdentifier(node.callee.object.property) ||
        !isMemberExpression(node.callee.object.object) ||
        !isIdentifier(node.callee.object.object.property, { name: "query" })
    )
        return false;
    return true;
}

function isSchemaTable(value: Node | undefined | null, imports: SchemaImports): boolean {
    if (!value) return false;
    if (isIdentifier(value)) return imports.direct.has(value.name);
    return (
        isMemberExpression(value) &&
        isIdentifier(value.object) &&
        imports.namespaces.has(value.object.name) &&
        isIdentifier(value.property)
    );
}

function isRawMutation(node: Extract<Node, { type: "CallExpression" }>): boolean {
    if (
        !isMemberExpression(node.callee) ||
        !isIdentifier(node.callee.property, { name: "execute" }) ||
        node.arguments.length === 0
    )
        return false;
    const input = node.arguments[0];
    const text = isStringLiteral(input)
        ? input.value
        : isTemplateLiteral(input)
          ? input.quasis.map((part) => part.value.cooked ?? part.value.raw).join(" ")
          : "";
    return /\b(?:insert|update|delete|replace|create|alter|drop)\b/i.test(text);
}

function approvedMutationLocation(
    localFile: string,
    matchingAction: ActionFunction | undefined,
): boolean {
    return (
        localFile.includes("/impl/") ||
        localFile.includes("/utils/") ||
        matchingAction !== undefined
    );
}

function firstParameterIsExecutor(action: ActionFunction): boolean {
    const first = action.node.params[0];
    if (!first || !isIdentifier(first) || !first.typeAnnotation) return false;
    let durable = false;
    visit(first.typeAnnotation, (node) => {
        if (
            isTSTypeReference(node) &&
            isIdentifier(node.typeName) &&
            (node.typeName.name === "DrizzleExecutor" ||
                node.typeName.name === "DrizzleTransaction")
        )
            durable = true;
    });
    return durable;
}

function firstParameterIsTransaction(action: ActionFunction): boolean {
    const first = action.node.params[0];
    if (!first || !isIdentifier(first) || !first.typeAnnotation) return false;
    let transaction = false;
    visit(first.typeAnnotation, (node) => {
        if (isTSTypeReference(node) && isIdentifier(node.typeName, { name: "DrizzleTransaction" }))
            transaction = true;
    });
    return transaction;
}

function mutationsShareTransaction(action: ActionFunction, mutations: readonly Node[]): boolean {
    const transactionBodies: Node[] = [];
    visit(action.node, (node) => {
        if (!isCallExpression(node) || !isIdentifier(node.callee, { name: "withTransaction" }))
            return;
        const callback = node.arguments[1];
        if (isArrowFunctionExpression(callback) || isFunctionExpression(callback))
            transactionBodies.push(callback.body);
    });
    return transactionBodies.some((body) =>
        mutations.every(
            (mutation) =>
                body.start != null &&
                body.end != null &&
                mutation.start != null &&
                mutation.end != null &&
                body.start <= mutation.start &&
                mutation.end <= body.end,
        ),
    );
}

function productModule(localFile: string): string | undefined {
    const parts = localFile.split("/");
    const modules = parts.indexOf("modules");
    return parts[modules >= 0 ? modules + 1 : 0];
}

function hasEntityPrefix(localFile: string, actionName: string): boolean {
    const module = productModule(localFile);
    if (!module) return false;
    return (ENTITY_PREFIXES[module] ?? []).some(
        (prefix) =>
            actionName.startsWith(prefix) &&
            (actionName.length === prefix.length || /[A-Z]/.test(actionName[prefix.length]!)),
    );
}

function semanticCommentBefore(source: string, position: number): string | undefined {
    const match = /\/\*\*([\s\S]*?)\*\/\s*(?:export\s+)?$/.exec(source.slice(0, position));
    if (!match) return undefined;
    return match[1]!
        .split("\n")
        .map((line) => line.replace(/^\s*\*?\s?/, "").trim())
        .filter(Boolean)
        .join(" ");
}

function semanticSentences(comment: string): string[] {
    return comment
        .split(/[.!?](?:\s+|$)/)
        .map((sentence) => sentence.trim())
        .filter(Boolean);
}

function persistenceFacadeName(name: string): boolean {
    return name.endsWith("Repository") || name === "Database" || name.startsWith("Database");
}

function line(node: Node): number {
    return node.loc?.start.line ?? 1;
}

function visit(node: Node, inspect: (node: Node) => void): void {
    inspect(node);
    for (const key of VISITOR_KEYS[node.type] ?? []) {
        const child = (node as unknown as Record<string, unknown>)[key];
        if (Array.isArray(child)) {
            for (const value of child) if (isNode(value)) visit(value, inspect);
        } else if (isNode(child)) visit(child, inspect);
    }
}

function isNode(value: unknown): value is Node {
    return Boolean(value && typeof value === "object" && "type" in value);
}

async function sourceFiles(directory: string): Promise<string[]> {
    const files: string[] = [];
    for (const entry of await readdir(directory, { withFileTypes: true })) {
        const target = `${directory}/${entry.name}`;
        if (entry.isDirectory()) files.push(...(await sourceFiles(target)));
        else if (entry.isFile() && entry.name.endsWith(".ts")) files.push(target);
    }
    return files.sort();
}
