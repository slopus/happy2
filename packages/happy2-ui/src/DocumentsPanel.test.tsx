import { expect, it, vi } from "vitest";
import { DocumentsPanel } from "./index";
import { createRenderer } from "./testing";

const DOCUMENTS = [
    { id: "doc-1", title: "Launch checklist", detail: "Edited 12:04" },
    { id: "doc-2", title: "", detail: "Edited yesterday" },
];

it("holds DocumentsPanel header geometry, row content, and click intents", async () => {
    const onOpen = vi.fn();
    const onCreate = vi.fn();
    const onClose = vi.fn();
    const onDetach = vi.fn();
    const view = createRenderer().render(
        () => (
            <DocumentsPanel
                data-testid="panel"
                documents={DOCUMENTS}
                onClose={onClose}
                onCreate={onCreate}
                onDetach={onDetach}
                onOpen={onOpen}
            />
        ),
        { width: 320, height: 420 },
    );

    const header = view.$('[data-testid="panel"] .happy2-documents-panel__header');
    expect(header.bounds().height).toBe(56);
    expect(header.bounds().width).toBe(320);

    const rows = document.querySelectorAll('[data-happy2-ui="documents-panel-row"]');
    expect(rows).toHaveLength(2);
    expect(rows[0]?.textContent).toContain("Launch checklist");
    expect(rows[0]?.textContent).toContain("Edited 12:04");
    expect(rows[1]?.textContent).toContain("Untitled document");
    const rowBox = view.$('[data-happy2-ui="documents-panel-row"]');
    expect(rowBox.bounds().height).toBeGreaterThanOrEqual(32);
    expect(rowBox.computedStyle("border-radius")).toBe("6px");

    (rows[0] as HTMLButtonElement).click();
    expect(onOpen).toHaveBeenCalledWith("doc-1");
    // The unlink affordance sits beside the row, revealed on hover; clicking it
    // detaches without also opening the document.
    const detach = document.querySelectorAll('[data-happy2-ui="documents-panel-row-detach"]');
    expect(detach).toHaveLength(2);
    expect(detach[0]?.getAttribute("aria-label")).toBe("Unlink Launch checklist from this channel");
    (detach[1] as HTMLButtonElement).click();
    expect(onDetach).toHaveBeenCalledWith("doc-2");
    expect(onOpen).toHaveBeenCalledTimes(1);
    (document.querySelector('[aria-label="New document"]') as HTMLButtonElement).click();
    expect(onCreate).toHaveBeenCalledTimes(1);
    (document.querySelector('[aria-label="Close documents"]') as HTMLButtonElement).click();
    expect(onClose).toHaveBeenCalledTimes(1);

    await view.screenshot("DocumentsPanel.test");
});

it("renders the panel empty state with its create action", async () => {
    const onCreate = vi.fn();
    const view = createRenderer().render(
        () => (
            <DocumentsPanel
                data-testid="panel-empty"
                documents={[]}
                onClose={() => undefined}
                onCreate={onCreate}
            />
        ),
        { width: 320, height: 420 },
    );
    const panel = view.$('[data-testid="panel-empty"]');
    expect(panel.bounds().height).toBe(420);
    expect(document.querySelector('[data-testid="panel-empty"]')?.textContent).toContain(
        "No documents yet",
    );
    const action = [...document.querySelectorAll('[data-testid="panel-empty"] button')].find(
        (button) => button.textContent?.includes("New document"),
    ) as HTMLButtonElement;
    action.click();
    expect(onCreate).toHaveBeenCalledTimes(1);
    await view.screenshot("DocumentsPanel.empty.test");
});
