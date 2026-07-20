import { expect, it, vi } from "vitest";
import * as Y from "yjs";
import { Awareness, applyAwarenessUpdate } from "y-protocols/awareness";
import { DocumentEditor } from "./index";
import { documentEditorSeedDoc } from "./documentEditorSeed";
import { createRenderer } from "./testing";

async function frames(count: number): Promise<void> {
    for (let index = 0; index < count; index += 1)
        await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));
}

function base64Decode(value: string): Uint8Array {
    return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}

it("renders seeded blocks, applies remote updates in place, and announces local awareness", async () => {
    const ydoc = documentEditorSeedDoc();
    const onPresence = vi.fn();
    const view = createRenderer().render(
        () => (
            <DocumentEditor
                data-testid="editor"
                onPresence={onPresence}
                user={{ name: "Ada", color: "#2baccc" }}
                ydoc={ydoc}
            />
        ),
        { width: 640, height: 420 },
    );
    await frames(3);

    const heading = document.querySelector(
        '[data-happy2-ui="document-editor"] [data-content-type="heading"]',
    );
    expect(heading?.textContent).toBe("Launch checklist");
    const bullets = document.querySelectorAll(
        '[data-happy2-ui="document-editor"] [data-content-type="bulletListItem"]',
    );
    expect(bullets).toHaveLength(3);
    const editorBox = view.$('[data-happy2-ui="document-editor"]');
    expect(editorBox.bounds().width).toBe(640);
    expect(editorBox.computedStyle("background-color")).toBe("rgb(255, 255, 255)");

    // The mounted editor announced its local awareness; the payload must decode
    // with y-protocols on the other side and carry the collaboration user.
    expect(onPresence).toHaveBeenCalled();
    const payload = onPresence.mock.calls.at(-1)![0] as {
        update: string;
        awarenessClientId: number;
    };
    expect(payload.awarenessClientId).toBe(ydoc.clientID);
    const probe = new Awareness(new Y.Doc());
    applyAwarenessUpdate(probe, base64Decode(payload.update), "test");
    expect(probe.getStates().get(payload.awarenessClientId)?.user).toMatchObject({
        name: "Ada",
        color: "#2baccc",
    });
    probe.destroy();

    // A remote edit reconciles the paragraph without replacing the heading's
    // DOM node — identity survival is the collaboration rendering contract.
    const headingNode = heading!;
    const remote = documentEditorSeedDoc();
    const fragment = remote.getXmlFragment("document");
    const blockGroup = fragment.get(0) as Y.XmlElement;
    const paragraphContainer = blockGroup.get(1) as Y.XmlElement;
    const paragraph = paragraphContainer.get(0) as Y.XmlElement;
    (paragraph.get(0) as Y.XmlText).insert(0, "Updated: ");
    Y.applyUpdate(ydoc, Y.encodeStateAsUpdate(remote, Y.encodeStateVector(ydoc)));
    await frames(2);
    const updatedParagraph = document.querySelector(
        '[data-happy2-ui="document-editor"] [data-content-type="paragraph"]',
    );
    expect(updatedParagraph?.textContent).toBe(
        "Updated: Everything in this page syncs live to every member of the channel.",
    );
    expect(
        document.querySelector(
            '[data-happy2-ui="document-editor"] [data-content-type="heading"]',
        ),
    ).toBe(headingNode);

    await view.screenshot("DocumentEditor.test");
});

it("honors the read-only flag on the underlying contenteditable surface", async () => {
    const view = createRenderer().render(
        () => (
            <DocumentEditor
                data-testid="editor-readonly"
                editable={false}
                user={{ name: "Ada", color: "#2baccc" }}
                ydoc={documentEditorSeedDoc()}
            />
        ),
        { width: 520, height: 320 },
    );
    await frames(3);
    const editable = document.querySelector(
        '[data-happy2-ui="document-editor"] [contenteditable]',
    );
    expect(editable?.getAttribute("contenteditable")).toBe("false");
    expect(view.$('[data-happy2-ui="document-editor"]').bounds().width).toBe(520);
});
