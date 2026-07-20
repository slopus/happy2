import { expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";

// Comment timestamps render relative to the wall clock; freeze Date (only)
// so the screenshot baselines stay identical across days. Timers and
// requestAnimationFrame stay real for the polling waits below.
vi.useFakeTimers({ now: new Date("2026-07-20T12:00:00.000Z"), toFake: ["Date"] });
import { DocumentEditor, documentThreadsName } from "./index";
import { documentEditorSeedDoc } from "./documentEditorSeed";
import { createRenderer } from "./testing";

async function frames(count: number): Promise<void> {
    for (let index = 0; index < count; index += 1)
        await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));
}

async function appears(
    selector: string,
    containing?: string,
    timeoutMs = 5_000,
): Promise<HTMLElement> {
    const deadline = performance.now() + timeoutMs;
    for (;;) {
        const element = Array.from(document.querySelectorAll(selector)).find(
            (candidate) => !containing || candidate.textContent?.includes(containing),
        );
        if (element) return element as HTMLElement;
        if (performance.now() > deadline)
            throw new Error(`Timed out waiting for ${selector} ${containing ?? ""}`);
        await frames(1);
    }
}

const NAMES: Record<string, string> = {
    "user-ada": "Ada Lovelace",
    "user-grace": "Grace Hopper",
};

const resolveUsers = async (userIds: readonly string[]) =>
    userIds.map((id) => ({ id, username: NAMES[id] ?? "Someone" }));

it("threads a comment through the toolbar and shows it to another participant with resolved authors", async () => {
    const ydoc = documentEditorSeedDoc();
    const view = createRenderer().render(
        () => (
            <DocumentEditor
                commentUserId="user-ada"
                commentUsersResolve={resolveUsers}
                data-testid="editor-ada"
                user={{ name: "Ada", color: "#2baccc" }}
                ydoc={ydoc}
            />
        ),
        { width: 720, height: 560 },
    );
    await frames(5);

    // Triple-click selects exactly the heading line, so ProseMirror owns the
    // selection and the formatting toolbar offers the comment action.
    const heading = document.querySelector(
        '[data-testid="editor-ada"] [data-content-type="heading"]',
    ) as HTMLElement;
    await userEvent.tripleClick(heading);
    await appears(".bn-formatting-toolbar button");
    const toolbarButtons = Array.from(
        document.querySelectorAll(".bn-formatting-toolbar button"),
    ) as HTMLButtonElement[];
    const commentButton = toolbarButtons.find((button) =>
        `${button.getAttribute("aria-label")} ${button.getAttribute("data-test")} ${button.title}`.includes(
            "omment",
        ),
    );
    expect(
        commentButton,
        `comment action present in [${toolbarButtons
            .map((button) => button.getAttribute("data-test") ?? button.getAttribute("aria-label"))
            .join(", ")}]`,
    ).toBeDefined();
    await userEvent.click(commentButton!);
    await frames(4);

    // The floating composer opens; write the comment and save it.
    const composer = await appears(
        '.bn-comment-editor [contenteditable="true"], .bn-comment-editor',
    );
    await userEvent.click(composer);
    await userEvent.keyboard("Ship this by Friday");
    const save = Array.from(document.querySelectorAll("button")).find(
        (button) => button.textContent === "Save" && !(button as HTMLButtonElement).disabled,
    );
    expect(save, "composer save action").toBeDefined();
    await userEvent.click(save!);
    await frames(6);
    await userEvent.keyboard("{Escape}");
    await frames(2);

    // The thread lives in the shared Y.Doc, so it persists and syncs with the
    // document content itself.
    const threads = ydoc.getMap(documentThreadsName);
    expect(threads.size).toBe(1);

    // The text now carries the anchored thread mark.
    const mark = await appears('[data-testid="editor-ada"] .bn-thread-mark');
    expect(mark.textContent).toBe("Launch checklist");

    await view.screenshot("DocumentEditor.comments.test");

    // A second participant on the same document sees the anchored thread and
    // the resolved author identity, not a raw user id.
    const second = createRenderer().render(
        () => (
            <DocumentEditor
                commentUserId="user-grace"
                commentUsersResolve={resolveUsers}
                data-testid="editor-grace"
                user={{ name: "Grace", color: "#7d5ba6" }}
                ydoc={ydoc}
            />
        ),
        { width: 720, height: 560 },
    );
    const remoteMark = await appears('[data-testid="editor-grace"] .bn-thread-mark');
    expect(remoteMark.textContent).toBe("Launch checklist");
    await userEvent.click(remoteMark);
    const thread = await appears(".bn-thread", "Ship this by Friday");
    expect(thread.textContent).toContain("Ada Lovelace");

    await second.screenshot("DocumentEditor.comments.remote.test");
});
