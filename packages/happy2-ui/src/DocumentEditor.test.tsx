import { expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { useState } from "react";
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
        document.querySelector('[data-happy2-ui="document-editor"] [data-content-type="heading"]'),
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
    const editable = document.querySelector('[data-happy2-ui="document-editor"] [contenteditable]');
    expect(editable?.getAttribute("contenteditable")).toBe("false");
    expect(view.$('[data-happy2-ui="document-editor"]').bounds().width).toBe(520);
});

it("drops files into native BlockNote blocks, resolves media, and opens durable file references", async () => {
    const ydoc = documentEditorSeedDoc();
    const onFileUpload = vi.fn(async (file: File) => ({
        id: `${file.type.split("/")[0]}-file`,
        name: file.name,
    }));
    const onFileUrlResolve = vi.fn(async (fileId: string) => {
        if (fileId === "image-file")
            return "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==";
        return `data:${fileId.replace("-file", "")}/mp4;base64,`;
    });
    const onFileOpen = vi.fn();
    let detachResolve!: () => void;
    const detachGate = new Promise<void>((resolve) => {
        detachResolve = resolve;
    });
    const onFileAttach = vi.fn(async () => undefined);
    const onFileDetach = vi.fn(() => detachGate);
    const view = createRenderer().render(
        () => (
            <DocumentEditor
                onFileAttach={onFileAttach}
                onFileDetach={onFileDetach}
                onFileOpen={onFileOpen}
                onFileUpload={onFileUpload}
                onFileUrlResolve={onFileUrlResolve}
                user={{ name: "Ada", color: "#2baccc" }}
                ydoc={ydoc}
            />
        ),
        { width: 640, height: 440 },
    );
    await frames(3);
    const heading = document.querySelector(
        '[data-happy2-ui="document-editor"] [data-content-type="heading"]',
    )!;
    const paragraph = document.querySelector<HTMLElement>(
        '[data-happy2-ui="document-editor"] [data-content-type="paragraph"]',
    )!;
    const paragraphBounds = paragraph.getBoundingClientRect();
    const editor = document.querySelector<HTMLElement>('[data-happy2-ui="document-editor"]')!;

    const image = new File(["image"], "diagram.png", { type: "image/png" });
    const imageTransfer = new DataTransfer();
    imageTransfer.items.add(image);
    editor.dispatchEvent(
        new DragEvent("dragenter", { bubbles: true, dataTransfer: imageTransfer }),
    );
    await frames(1);
    expect(editor.getAttribute("data-drag-active")).toBe("");
    expect(editor.textContent).toContain("Drop files into the document");
    paragraph.dispatchEvent(
        new DragEvent("drop", {
            bubbles: true,
            clientX: paragraphBounds.left + 8,
            clientY: paragraphBounds.bottom - 2,
            dataTransfer: imageTransfer,
        }),
    );
    await vi.waitFor(() => expect(onFileUpload).toHaveBeenCalledTimes(1));
    expect(onFileUpload.mock.calls[0]?.[0]).toBe(image);
    await vi.waitFor(() =>
        expect(
            document.querySelector(
                '[data-happy2-ui="document-editor"] [data-content-type="image"]',
            ),
        ).not.toBeNull(),
    );
    await vi.waitFor(() => expect(onFileUrlResolve).toHaveBeenCalledWith("image-file"));
    expect(editor.getAttribute("data-drag-active")).toBeNull();
    expect(
        document.querySelector('[data-happy2-ui="document-editor"] [data-content-type="heading"]'),
    ).toBe(heading);

    for (const [type, name] of [
        ["video/mp4", "walkthrough.mp4"],
        ["audio/mpeg", "briefing.mp3"],
    ] as const) {
        const transfer = new DataTransfer();
        transfer.items.add(new File([type], name, { type }));
        paragraph.dispatchEvent(
            new DragEvent("drop", {
                bubbles: true,
                clientX: paragraphBounds.left + 8,
                clientY: paragraphBounds.bottom - 2,
                dataTransfer: transfer,
            }),
        );
    }
    await vi.waitFor(() => expect(onFileUpload).toHaveBeenCalledTimes(3));
    for (const type of ["video", "audio"])
        expect(document.querySelector(`[data-content-type="${type}"]`)).not.toBeNull();
    await vi.waitFor(() => expect(onFileUrlResolve).toHaveBeenCalledWith("video-file"));
    await vi.waitFor(() => expect(onFileUrlResolve).toHaveBeenCalledWith("audio-file"));

    const textTransfer = new DataTransfer();
    textTransfer.items.add(new File(["notes"], "notes.txt", { type: "text/plain" }));
    paragraph.dispatchEvent(
        new DragEvent("drop", {
            bubbles: true,
            clientX: paragraphBounds.left + 8,
            clientY: paragraphBounds.bottom - 2,
            dataTransfer: textTransfer,
        }),
    );
    await vi.waitFor(() => expect(onFileUpload).toHaveBeenCalledTimes(4));
    const fileButton = await vi.waitFor(() => {
        const element = document.querySelector<HTMLElement>(
            '[data-content-type="file"] .bn-file-name-with-icon[role="button"]',
        );
        expect(element).not.toBeNull();
        return element!;
    });
    expect(fileButton.getAttribute("aria-label")).toBe("Open notes.txt");
    await userEvent.click(fileButton);
    expect(onFileOpen).toHaveBeenCalledWith("text-file");
    fileButton.focus();
    await userEvent.keyboard("{Enter}");
    expect(onFileOpen).toHaveBeenCalledTimes(2);
    expect(fileButton.closest('[data-content-type="file"]')).not.toBeNull();
    expect(JSON.stringify(ydoc.getXmlFragment("document").toJSON())).toContain(
        "/v0/files/text-file",
    );
    await userEvent.keyboard("{Backspace}");
    await vi.waitFor(() => expect(onFileDetach).toHaveBeenCalledWith("text-file"));
    document.querySelector<HTMLElement>('[contenteditable="true"]')!.focus();
    await userEvent.keyboard("{Control>}z{/Control}");
    await vi.waitFor(() =>
        expect(document.querySelector('[data-content-type="file"]')).not.toBeNull(),
    );
    detachResolve();
    await vi.waitFor(() => expect(onFileAttach).toHaveBeenCalledWith("text-file"));
    expect(onFileAttach).toHaveBeenCalledTimes(1);

    expect(view.$('[data-happy2-ui="document-editor"]').bounds().width).toBe(640);
});

it("keeps a retryable native file block and shows a dismissible error when upload fails", async () => {
    const view = createRenderer().render(
        () => (
            <DocumentEditor
                onFileUpload={async () => {
                    throw new Error("Storage is unavailable.");
                }}
                user={{ name: "Ada", color: "#2baccc" }}
                ydoc={documentEditorSeedDoc()}
            />
        ),
        { width: 560, height: 360 },
    );
    await frames(3);
    const paragraph = document.querySelector<HTMLElement>('[data-content-type="paragraph"]')!;
    const bounds = paragraph.getBoundingClientRect();
    const transfer = new DataTransfer();
    transfer.items.add(new File(["notes"], "failed.txt", { type: "text/plain" }));
    paragraph.dispatchEvent(
        new DragEvent("drop", {
            bubbles: true,
            clientX: bounds.left + 8,
            clientY: bounds.bottom - 2,
            dataTransfer: transfer,
        }),
    );
    await vi.waitFor(() => expect(document.body.textContent).toContain("Storage is unavailable."));
    await vi.waitFor(() =>
        expect(
            document.querySelector('[data-content-type="file"] .bn-add-file-button'),
        ).not.toBeNull(),
    );
    await userEvent.click(document.querySelector<HTMLButtonElement>('[aria-label="Dismiss"]')!);
    expect(document.body.textContent).not.toContain("Storage is unavailable.");
    expect(view.$('[data-happy2-ui="document-editor"]').bounds().width).toBe(560);
});

it("detaches a completed relation if its editor unmounts before BlockNote stores the reference", async () => {
    let uploadResolve!: (uploaded: { id: string; name: string }) => void;
    const uploadGate = new Promise<{ id: string; name: string }>((resolve) => {
        uploadResolve = resolve;
    });
    const onFileUpload = vi.fn(() => uploadGate);
    const onFileDetach = vi.fn(async () => undefined);
    const view = createRenderer().render(
        () => (
            <DocumentEditor
                onFileDetach={onFileDetach}
                onFileUpload={onFileUpload}
                user={{ name: "Ada", color: "#2baccc" }}
                ydoc={documentEditorSeedDoc()}
            />
        ),
        { width: 560, height: 360 },
    );
    await frames(3);
    const paragraph = document.querySelector<HTMLElement>('[data-content-type="paragraph"]')!;
    const bounds = paragraph.getBoundingClientRect();
    const transfer = new DataTransfer();
    transfer.items.add(new File(["notes"], "pending.txt", { type: "text/plain" }));
    paragraph.dispatchEvent(
        new DragEvent("drop", {
            bubbles: true,
            clientX: bounds.left + 8,
            clientY: bounds.bottom - 2,
            dataTransfer: transfer,
        }),
    );
    await vi.waitFor(() => expect(onFileUpload).toHaveBeenCalledOnce());
    view.destroy();
    uploadResolve({ id: "pending-file", name: "pending.txt" });
    await vi.waitFor(() => expect(onFileDetach).toHaveBeenCalledWith("pending-file"));
});

it("cleans up an in-flight upload through its originating document after identity changes", async () => {
    const firstDoc = documentEditorSeedDoc();
    const secondDoc = documentEditorSeedDoc();
    let uploadResolve!: (uploaded: { id: string; name: string }) => void;
    const uploadGate = new Promise<{ id: string; name: string }>((resolve) => {
        uploadResolve = resolve;
    });
    const firstDetach = vi.fn(async () => undefined);
    const secondDetach = vi.fn(async () => undefined);
    let documentSwitch!: () => void;
    function Harness() {
        const [second, setSecond] = useState(false);
        documentSwitch = () => setSecond(true);
        return (
            <DocumentEditor
                onFileDetach={second ? secondDetach : firstDetach}
                onFileUpload={() => uploadGate}
                user={{ name: "Ada", color: "#2baccc" }}
                ydoc={second ? secondDoc : firstDoc}
            />
        );
    }
    createRenderer().render(() => <Harness />, { width: 560, height: 360 });
    await frames(3);
    const paragraph = document.querySelector<HTMLElement>('[data-content-type="paragraph"]')!;
    const bounds = paragraph.getBoundingClientRect();
    const transfer = new DataTransfer();
    transfer.items.add(new File(["notes"], "switching.txt", { type: "text/plain" }));
    paragraph.dispatchEvent(
        new DragEvent("drop", {
            bubbles: true,
            clientX: bounds.left + 8,
            clientY: bounds.bottom - 2,
            dataTransfer: transfer,
        }),
    );
    documentSwitch();
    await frames(2);
    uploadResolve({ id: "first-file", name: "switching.txt" });
    await vi.waitFor(() => expect(firstDetach).toHaveBeenCalledWith("first-file"));
    expect(secondDetach).not.toHaveBeenCalled();
});
