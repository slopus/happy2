import { parseSync, Visitor } from "oxc-parser";

/** Extracts module specifiers from real TypeScript import/export/require syntax. */
export function moduleSpecifiersParse(source: string, fileName = "source.ts"): string[] {
    const parsed = parseSync(fileName, source, { sourceType: "unambiguous" });
    const specifiers: string[] = [];
    const addLiteral = (node: { type: string; value?: unknown } | null): void => {
        if (node?.type === "Literal" && typeof node.value === "string") specifiers.push(node.value);
    };
    new Visitor({
        ImportDeclaration(node) {
            addLiteral(node.source);
        },
        ExportAllDeclaration(node) {
            addLiteral(node.source);
        },
        ExportNamedDeclaration(node) {
            addLiteral(node.source);
        },
        ImportExpression(node) {
            addLiteral(node.source);
        },
        CallExpression(node) {
            if (node.callee.type === "Identifier" && node.callee.name === "require")
                addLiteral(node.arguments[0] ?? null);
        },
        TSImportEqualsDeclaration(node) {
            if (node.moduleReference.type === "TSExternalModuleReference")
                addLiteral(node.moduleReference.expression);
        },
    }).visit(parsed.program);
    return specifiers;
}
