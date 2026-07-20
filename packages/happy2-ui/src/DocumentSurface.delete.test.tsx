import { expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { DocumentSurface } from "./index";
import { documentEditorSeedDoc } from "./documentEditorSeed";
import { createRenderer } from "./testing";

it("deletes only after the trash action is confirmed in the dialog", async () => {
    const onDelete = vi.fn();
    const view = createRenderer().render(
        () => (
            <DocumentSurface
                data-testid="surface"
                onClose={() => undefined}
                onDelete={onDelete}
                saveState="idle"
                title="Launch plan — Q3"
                user={{ name: "Ada", color: "#2baccc" }}
                ydoc={documentEditorSeedDoc()}
            />
        ),
        { width: 640, height: 420 },
    );

    const trash = document.querySelector('[aria-label="Delete document"]') as HTMLButtonElement;
    expect(trash).not.toBeNull();
    await userEvent.click(trash);
    expect(onDelete).not.toHaveBeenCalled();
    const dialog = document.querySelector('[data-testid="document-surface-delete-dialog"]');
    expect(dialog?.textContent).toContain("Delete “Launch plan — Q3”?");

    // The confirmation sits on the centered modal scrim, never in the pane flow.
    expect(document.querySelector(".happy2-modal-overlay")).not.toBeNull();
    const card = document.querySelector(".happy2-modal__dialog") as HTMLElement;
    const cardBox = card.getBoundingClientRect();
    expect(cardBox.width).toBe(360);
    expect(Math.abs(cardBox.left + cardBox.width / 2 - window.innerWidth / 2)).toBeLessThan(1);
    expect(Math.abs(cardBox.top + cardBox.height / 2 - window.innerHeight / 2)).toBeLessThan(1);

    // Cancel dismisses without deleting; a confirmed pass deletes exactly once.
    await userEvent.click(
        Array.from(dialog!.querySelectorAll("button")).find(
            (button) => button.textContent === "Cancel",
        )!,
    );
    expect(onDelete).not.toHaveBeenCalled();
    expect(document.querySelector('[data-testid="document-surface-delete-dialog"]')).toBeNull();
    await userEvent.click(trash);
    await userEvent.click(
        document.querySelector('[data-testid="document-delete-confirm"]') as HTMLButtonElement,
    );
    expect(onDelete).toHaveBeenCalledTimes(1);
    await view.screenshot("DocumentSurface.delete.test");
});
