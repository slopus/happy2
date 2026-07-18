import assert from "node:assert/strict";
import { test } from "node:test";
import css from "@eslint/css";
import { Linter } from "eslint";
import layoutPolicy from "../../../eslint/layout-policy.mjs";

const policyRules = {
    "happy2-layout/require-layout-exception-reason": "error",
    "happy2-layout/scrollport-no-spacing": "error",
    "happy2-layout/use-flex-layout": "error",
};

function lintCss(code) {
    const linter = new Linter({ configType: "flat" });
    return linter.verify(
        code,
        [
            {
                files: ["**/*.css"],
                language: "css/css",
                plugins: { css, "happy2-layout": layoutPolicy },
                rules: policyRules,
            },
        ],
        { filename: "fixture.css" },
    );
}

function lintJsx(code) {
    const linter = new Linter({ configType: "flat" });
    return linter.verify(
        code,
        [
            {
                files: ["**/*.jsx"],
                languageOptions: {
                    ecmaVersion: "latest",
                    parserOptions: { ecmaFeatures: { jsx: true } },
                    sourceType: "module",
                },
                plugins: { "happy2-layout": layoutPolicy },
                rules: policyRules,
            },
        ],
        { filename: "fixture.jsx" },
    );
}

test("accepts flexbox and non-layout display values", () => {
    assert.deepEqual(lintCss(".row { display: flex; } .hidden { display: none; }"), []);
});

test("rejects alternative CSS layout mechanisms", () => {
    const messages = lintCss(
        ".grid { display: grid; } .newspaper { column-count: 2; } .legacy { float: left; }",
    );
    assert.equal(messages.length, 3);
    assert.ok(messages.every(({ ruleId }) => ruleId === "happy2-layout/use-flex-layout"));
});

test("accepts a local exception with a concrete reason", () => {
    assert.deepEqual(
        lintCss(`.matrix {
    /* eslint-disable-next-line happy2-layout/use-flex-layout -- Genuine two-dimensional data matrix. */
    display: grid;
}`),
        [],
    );
});

test("rejects an unexplained or perfunctory exception", () => {
    for (const reason of ["", " -- grid"]) {
        const messages = lintCss(`.matrix {
    /* eslint-disable-next-line happy2-layout/use-flex-layout${reason} */
    display: grid;
}`);
        assert.deepEqual(
            messages.map(({ ruleId }) => ruleId),
            ["happy2-layout/require-layout-exception-reason"],
        );
    }
});

test("rejects block-wide layout exceptions even when they have a reason", () => {
    const messages =
        lintCss(`/* eslint-disable happy2-layout/use-flex-layout -- Grid throughout this file. */
.matrix { display: grid; }`);
    assert.deepEqual(
        messages.map(({ ruleId, messageId }) => [ruleId, messageId]),
        [["happy2-layout/require-layout-exception-reason", "nonLocalException"]],
    );
});

test("checks inline JSX style objects too", () => {
    assert.deepEqual(lintJsx('<div style={{ display: "flex" }} />;'), []);
    assert.deepEqual(
        lintJsx('<div style={{ display: "inline-grid" }} />;').map(({ ruleId }) => ruleId),
        ["happy2-layout/use-flex-layout"],
    );
});

test("rejects spacing on a scrollport and accepts it on an inner wrapper", () => {
    assert.deepEqual(
        lintCss(".scrollport { overflow-y: auto; padding: 8px; margin-top: 4px; }").map(
            ({ ruleId }) => ruleId,
        ),
        ["happy2-layout/scrollport-no-spacing", "happy2-layout/scrollport-no-spacing"],
    );
    assert.deepEqual(
        lintCss(
            ".scrollport { overflow-y: auto; padding: 0; margin: 0; } .content { padding: 8px; }",
        ),
        [],
    );
    assert.deepEqual(
        lintJsx('<div style={{ overflowY: "auto", padding: "8px" }} />;').map(
            ({ ruleId }) => ruleId,
        ),
        ["happy2-layout/scrollport-no-spacing"],
    );
});

test("rejects scrollport spacing split across matching CSS rules", () => {
    assert.deepEqual(
        lintCss(".scrollport { overflow: auto; } .scrollport { padding: 8px; }").map(
            ({ ruleId }) => ruleId,
        ),
        ["happy2-layout/scrollport-no-spacing"],
    );
});

test("rejects numeric inline scrollport spacing and accepts numeric zero", () => {
    assert.deepEqual(
        lintJsx('<div style={{ overflowY: "auto", padding: 8 }} />;').map(({ ruleId }) => ruleId),
        ["happy2-layout/scrollport-no-spacing"],
    );
    assert.deepEqual(lintJsx('<div style={{ overflowY: "auto", padding: 0 }} />;'), []);
});

test("forbids disabling the full-bleed scrollport rule", () => {
    const messages = lintCss(`.scrollport {
    overflow: auto;
    /* eslint-disable-next-line happy2-layout/scrollport-no-spacing -- Legacy scrollport owns its spacing. */
    padding: 8px;
}`);
    assert.deepEqual(
        messages.map(({ ruleId, messageId }) => [ruleId, messageId]),
        [["happy2-layout/require-layout-exception-reason", "forbiddenScrollportException"]],
    );
});
