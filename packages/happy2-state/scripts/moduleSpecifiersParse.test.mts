import { describe, expect, it } from "vitest";
import { moduleSpecifiersParse } from "./moduleSpecifiersParse.mjs";

describe("moduleSpecifiersParse", () => {
    it("ignores import-shaped text in comments, strings, and templates", () => {
        const source = `
            // import value from "comment-package";
            /* require("block-comment-package") */
            const text = 'import("string-package")';
            const template = \`export * from "template-package"\`;
        `;

        expect(moduleSpecifiersParse(source)).toEqual([]);
    });

    it("extracts static, dynamic, require, and import-equals specifiers with comments", () => {
        const source = `
            import/* lead */ value from/* before source */ "static-package";
            export { value } from/* before re-export */ "export-package";
            const lazy = import/* before call */("dynamic-package");
            const loaded = require/* before call */("required-package");
            import legacy = require/* before source */("equals-package");
        `;

        expect(moduleSpecifiersParse(source)).toEqual([
            "static-package",
            "export-package",
            "dynamic-package",
            "required-package",
            "equals-package",
        ]);
    });
});
