import { expect, it } from "vitest";
import "./theme.css";
import "./styles/icon.css";
import "./styles/button.css";
import "./styles/file-editor.css";
import { FileEditor } from "./FileEditor";
import { createRenderer } from "./testing";

/*
 * FileEditor owns the editor surface contract: a 52px header (name + directory
 * subtitle + unsaved marker + Save/Revert/Close), a monospace code body on the
 * code surface, and a hairline status bar. Buttons and Icon are primitives
 * tuned in their own tests, so this file asserts layout, computed tokens, the
 * dirty/read-only affordances, and the intent callbacks.
 */

const fontUi = "happy2 Figtree, system-ui, sans-serif";
const fontMono = "happy2 Mono, ui-monospace, monospace";
const content = "const answer = 42;\nexport default answer;\n";

it("holds FileEditor header, code body, status bar, and dirty affordances", async () => {
    const view = createRenderer();

    view.render(
        () => (
            <div style={{ height: "360px", width: "560px" }}>
                <FileEditor
                    data-testid="clean"
                    onClose={() => {}}
                    onSave={() => {}}
                    path="src/model.ts"
                    status="1.0 KB"
                    value={content}
                />
            </div>
        ),
        { width: 600, height: 400, padding: 20 },
    );
    view.render(
        () => (
            <div style={{ height: "360px", width: "560px" }}>
                <FileEditor
                    data-testid="dirty"
                    dirty
                    onClose={() => {}}
                    onRevert={() => {}}
                    onSave={() => {}}
                    path="src/model.ts"
                    status="Modified"
                    value={content}
                />
            </div>
        ),
        { width: 600, height: 400, padding: 20 },
    );
    await view.ready();

    /* ---- Root + header -------------------------------------------------- */

    const root = view.$('[data-testid="clean"]');
    expect(root.element.tagName).toBe("SECTION");
    expect(root.computedStyles(["display", "flex-direction", "background-color"])).toEqual({
        display: "flex",
        "flex-direction": "column",
        "background-color": "rgb(28, 27, 34)",
    });

    const header = view.$('[data-testid="clean"] [data-happy2-ui="file-editor-header"]');
    expect(header.bounds().height).toBe(52);

    const name = view.$('[data-testid="clean"] [data-happy2-ui="file-editor-name"]');
    const nameMetrics = name.textMetrics();
    expect(nameMetrics.text).toBe("model.ts");
    expect(nameMetrics.font.family).toBe(fontUi);
    expect(nameMetrics.font.size).toBe(14);
    expect(nameMetrics.font.weight).toBe("600");
    expect(name.computedStyle("color")).toBe("rgb(237, 234, 242)");

    const subtitle = view.$('[data-testid="clean"] [data-happy2-ui="file-editor-subtitle"]');
    expect(subtitle.element.textContent).toBe("src/");
    expect(subtitle.textMetrics().font.family).toBe(fontMono);
    expect(subtitle.computedStyle("color")).toBe("rgb(117, 112, 133)");

    /* ---- Code body: monospace ink on the code surface ------------------- */

    const area = view.$('[data-testid="clean"] [data-happy2-ui="file-editor-area"]');
    expect(area.element.tagName).toBe("TEXTAREA");
    expect((area.element as HTMLTextAreaElement).value).toBe(content);
    /* Engines quote font family names with spaces (`"happy2 Mono"`); normalize. */
    expect(area.computedStyle("font-family").replace(/"/g, "")).toBe(fontMono);
    expect(
        area.computedStyles([
            "font-size",
            "line-height",
            "background-color",
            "white-space",
            "resize",
        ]),
    ).toEqual({
        "font-size": "13px",
        "line-height": "20px",
        "background-color": "rgb(20, 19, 25)",
        "white-space": "pre",
        resize: "none",
    });

    /* ---- Status bar ----------------------------------------------------- */

    const path = view.$('[data-testid="clean"] [data-happy2-ui="file-editor-path"]');
    expect(path.element.textContent).toBe("src/model.ts");
    expect(
        view.$('[data-testid="clean"] [data-happy2-ui="file-editor-status-text"]').element
            .textContent,
    ).toBe("1.0 KB");

    /* ---- Clean vs dirty: marker + Save/Revert --------------------------- */

    expect(root.element.getAttribute("data-dirty")).toBeNull();
    expect(
        view.container.querySelector('[data-testid="clean"] [data-happy2-ui="file-editor-marker"]'),
    ).toBeNull();
    const cleanActions = '[data-testid="clean"] [data-happy2-ui="file-editor-actions"]';
    const cleanSave = view.$(`${cleanActions} [data-happy2-ui="button"]`);
    expect(cleanSave.element.textContent).toBe("Save");
    expect((cleanSave.element as HTMLButtonElement).disabled).toBe(true);
    /* Clean state offers no Revert. */
    expect(
        Array.from(
            view.container.querySelectorAll(`${cleanActions} [data-happy2-ui="button"]`),
        ).map((button) => button.textContent),
    ).toEqual(["Save", ""]);

    const dirtyRoot = view.$('[data-testid="dirty"]');
    expect(dirtyRoot.element.getAttribute("data-dirty")).toBe("");
    const marker = view.$('[data-testid="dirty"] [data-happy2-ui="file-editor-marker"]');
    expect(marker.bounds().width).toBe(8);
    expect(marker.bounds().height).toBe(8);
    expect(marker.computedStyle("background-color")).toBe("rgb(139, 124, 247)");
    expect((await marker.visibleMetrics()).pixelCount).toBeGreaterThan(0);

    const dirtyActions = '[data-testid="dirty"] [data-happy2-ui="file-editor-actions"]';
    expect(
        Array.from(
            view.container.querySelectorAll(`${dirtyActions} [data-happy2-ui="button"]`),
        ).map((button) => button.textContent),
    ).toEqual(["Revert", "Save", ""]);
    const dirtySave = Array.from(
        view.container.querySelectorAll<HTMLButtonElement>(
            `${dirtyActions} [data-happy2-ui="button"]`,
        ),
    ).find((button) => button.textContent === "Save")!;
    expect(dirtySave.disabled).toBe(false);

    window.scrollTo(0, 0);
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    await view.screenshot("FileEditor.test");
}, 120_000);

it("routes edit, save, revert, and close intents and respects read-only", async () => {
    const changes: string[] = [];
    let saves = 0;
    let reverts = 0;
    let closes = 0;
    const view = createRenderer();

    view.render(
        () => (
            <div style={{ height: "300px", width: "520px" }}>
                <FileEditor
                    data-testid="live"
                    dirty
                    onClose={() => (closes += 1)}
                    onRevert={() => (reverts += 1)}
                    onSave={() => (saves += 1)}
                    onValueChange={(value) => changes.push(value)}
                    path="notes.md"
                    value="hello"
                />
                <FileEditor data-testid="ro" path="dist/out.js" readOnly value="frozen" />
            </div>
        ),
        { width: 560, height: 340, padding: 20 },
    );
    await view.ready();

    const area = view.$('[data-testid="live"] [data-happy2-ui="file-editor-area"]')
        .element as HTMLTextAreaElement;
    area.value = "hello world";
    area.dispatchEvent(new Event("input", { bubbles: true }));
    expect(changes).toEqual(["hello world"]);

    const button = (testid: string, label: string) =>
        Array.from(
            view.container.querySelectorAll<HTMLButtonElement>(
                `[data-testid="${testid}"] [data-happy2-ui="file-editor-actions"] [data-happy2-ui="button"]`,
            ),
        ).find((element) => element.textContent === label);
    button("live", "Save")!.click();
    button("live", "Revert")!.click();
    view.$(
        '[data-testid="live"] [data-happy2-ui="file-editor-actions"] [aria-label="Close file"]',
    ).element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(saves).toBe(1);
    expect(reverts).toBe(1);
    expect(closes).toBe(1);

    /* Cmd/Ctrl+S saves without leaving the keyboard. */
    view.$('[data-testid="live"]').element.dispatchEvent(
        new KeyboardEvent("keydown", { key: "s", metaKey: true, bubbles: true }),
    );
    expect(saves).toBe(2);

    /* Read-only: the textarea is locked and no Save/Revert render. */
    const roArea = view.$('[data-testid="ro"] [data-happy2-ui="file-editor-area"]')
        .element as HTMLTextAreaElement;
    expect(roArea.readOnly).toBe(true);
    expect(roArea.value).toBe("frozen");
    expect(
        Array.from(
            view.container.querySelectorAll(
                '[data-testid="ro"] [data-happy2-ui="file-editor-actions"] [data-happy2-ui="button"]',
            ),
        ).map((element) => element.textContent),
    ).toEqual([]);

    window.scrollTo(0, 0);
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    await view.screenshot("FileEditor.states");
}, 120_000);
