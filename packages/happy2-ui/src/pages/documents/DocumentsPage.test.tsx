import { expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { documentCollectionStoreCreate, type DocumentSummary } from "happy2-state";
import { DocumentsPage } from "../../index";
import { createRenderer } from "../../testing";

function summary(id: string, title: string, attachments: number): DocumentSummary {
    return {
        id,
        ownerUserId: "user-1",
        title,
        format: "blocknote",
        channelAttachments: Array.from({ length: attachments }, (_none, index) => ({
            chatId: `chat-${index + 1}`,
            attachedByUserId: "user-1",
            attachedAt: "2026-07-20T09:00:00.000Z",
        })),
        latestSequence: "4",
        createdAt: "2026-07-19T09:00:00.000Z",
        updatedAt: "2026-07-20T12:00:00.000Z",
    };
}

function loadedStore(documents: DocumentSummary[]) {
    const store = documentCollectionStoreCreate();
    store.getState().documentCollectionInput({ type: "documentCollectionLoaded", documents });
    return store;
}

it("lists the collection, opens rows, and deletes only through the confirmation", async () => {
    const onOpen = vi.fn();
    const onCreate = vi.fn();
    const onDelete = vi.fn();
    const store = loadedStore([summary("doc-1", "Launch plan — Q3", 1), summary("doc-2", "", 0)]);
    const view = createRenderer().render(
        () => (
            <DocumentsPage
                data-testid="page"
                onCreate={onCreate}
                onDelete={onDelete}
                onOpen={onOpen}
                store={store}
            />
        ),
        { width: 640, height: 400 },
    );

    const rows = document.querySelectorAll('[data-happy2-ui="documents-page-row"]');
    expect(rows).toHaveLength(2);
    expect(rows[0]?.textContent).toContain("Launch plan — Q3");
    expect(rows[0]?.textContent).toContain("In 1 channel");
    expect(rows[1]?.textContent).toContain("Untitled document");
    expect(rows[1]?.textContent).toContain("Not in a channel");

    await userEvent.click(rows[0] as HTMLButtonElement);
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onOpen.mock.calls[0]![0].id).toBe("doc-1");

    // Delete goes through the destructive dialog: cancel leaves the document,
    // confirm reports it exactly once.
    const deletes = document.querySelectorAll('[data-happy2-ui="documents-page-row-delete"]');
    expect(deletes).toHaveLength(2);

    // The delete action lives inside the row pill, vertically centered on it —
    // never floating beside or below the highlighted row.
    const itemBox = document.querySelector(".happy2-documents-page__item")!.getBoundingClientRect();
    const deleteBox = (deletes[0] as HTMLElement).getBoundingClientRect();
    expect(deleteBox.left).toBeGreaterThanOrEqual(itemBox.left);
    expect(deleteBox.right).toBeLessThanOrEqual(itemBox.right);
    expect(
        Math.abs(deleteBox.top + deleteBox.height / 2 - (itemBox.top + itemBox.height / 2)),
    ).toBeLessThan(1);

    await userEvent.click(deletes[0] as HTMLButtonElement);
    expect(onDelete).not.toHaveBeenCalled();
    let dialog = document.querySelector('[data-testid="documents-page-delete-dialog"]');
    expect(dialog?.textContent).toContain("Delete “Launch plan — Q3”?");

    // The confirmation is hosted on the centered modal scrim.
    expect(document.querySelector(".happy2-modal-overlay")).not.toBeNull();
    const cardBox = document.querySelector(".happy2-modal__dialog")!.getBoundingClientRect();
    expect(Math.abs(cardBox.left + cardBox.width / 2 - window.innerWidth / 2)).toBeLessThan(1);
    expect(Math.abs(cardBox.top + cardBox.height / 2 - window.innerHeight / 2)).toBeLessThan(1);
    await userEvent.click(
        Array.from(dialog!.querySelectorAll("button")).find(
            (button) => button.textContent === "Cancel",
        )!,
    );
    expect(onDelete).not.toHaveBeenCalled();
    expect(document.querySelector('[data-testid="documents-page-delete-dialog"]')).toBeNull();

    await userEvent.click(deletes[1] as HTMLButtonElement);
    dialog = document.querySelector('[data-testid="documents-page-delete-dialog"]');
    expect(dialog?.textContent).toContain("Delete “Untitled document”?");
    await userEvent.click(
        dialog!.querySelector('[data-testid="document-delete-confirm"]') as HTMLButtonElement,
    );
    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onDelete.mock.calls[0]![0].id).toBe("doc-2");

    (document.querySelector('[data-testid="page"] button') as HTMLButtonElement | null)?.blur();
    await view.screenshot("DocumentsPage.test");
});

it("shows the empty state with a create action", async () => {
    const onCreate = vi.fn();
    const view = createRenderer().render(
        () => (
            <DocumentsPage data-testid="page-empty" onCreate={onCreate} store={loadedStore([])} />
        ),
        { width: 640, height: 320 },
    );
    expect(document.querySelector('[data-testid="page-empty"]')?.textContent).toContain(
        "No documents yet",
    );
    const action = Array.from(document.querySelectorAll("button")).find(
        (button) => button.textContent === "New document",
    );
    await userEvent.click(action as HTMLButtonElement);
    expect(onCreate).toHaveBeenCalled();
    await view.screenshot("DocumentsPage.empty.test");
});
