import { expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { useState } from "react";
import { Composer, type Mentionable } from "./index";
import { createRenderer } from "./testing";

const MENTIONS: Mentionable[] = [
    { id: "ada", initials: "AL", name: "Ada", tone: "mint" },
    { id: "grace", initials: "GH", name: "Grace" },
    { id: "document:doc-1", initials: "", kind: "document", name: "Launch plan — Q3" },
    { id: "document:doc-2", initials: "", kind: "document", name: "Grace notes" },
];

function Host(props: { onMentionSelect: (mention: Mentionable) => void }) {
    const [value, setValue] = useState("");
    return (
        <div
            style={{
                display: "flex",
                flexDirection: "column",
                justifyContent: "flex-end",
                width: "100%",
                height: "100%",
            }}
        >
            <Composer
                data-testid="composer"
                mentions={MENTIONS}
                onMentionSelect={props.onMentionSelect}
                onSend={() => undefined}
                onValueChange={setValue}
                value={value}
            />
        </div>
    );
}

it("groups document mentions under their own subsection and reports selection", async () => {
    const onMentionSelect = vi.fn();
    const view = createRenderer().render(() => <Host onMentionSelect={onMentionSelect} />, {
        width: 560,
        height: 420,
    });
    const textarea = document.querySelector(
        '[data-testid="composer"] textarea',
    ) as HTMLTextAreaElement;
    await userEvent.click(textarea);
    await userEvent.keyboard("@");

    // People render first; the Documents subsection header separates the
    // document rows, which carry the doc glyph instead of an avatar.
    const rows = Array.from(document.querySelectorAll('[data-happy2-ui="mention-picker-row"]'));
    expect(rows.map((row) => row.getAttribute("data-mention-id"))).toEqual([
        "ada",
        "grace",
        "document:doc-1",
        "document:doc-2",
    ]);
    const documentsHeader = document.querySelector(
        '[data-happy2-ui="mention-picker-documents-header"]',
    );
    expect(documentsHeader?.textContent).toBe("Documents");
    // The header sits between the last person and first document row.
    const headerTop = documentsHeader!.getBoundingClientRect().top;
    expect(headerTop).toBeGreaterThan(rows[1]!.getBoundingClientRect().top);
    expect(headerTop).toBeLessThan(rows[2]!.getBoundingClientRect().top);
    expect(rows[2]!.querySelector('[data-happy2-ui="mention-picker-doc-glyph"]')).not.toBeNull();
    expect(rows[0]!.querySelector('[data-happy2-ui="mention-picker-doc-glyph"]')).toBeNull();

    // Filtering matches across both groups while keeping people first.
    await userEvent.keyboard("grace");
    const filtered = Array.from(document.querySelectorAll('[data-happy2-ui="mention-picker-row"]'));
    expect(filtered.map((row) => row.getAttribute("data-mention-id"))).toEqual([
        "grace",
        "document:doc-2",
    ]);

    // Picking the document inserts its title and reports the document mention.
    await userEvent.click(filtered[1]!);
    expect(textarea.value).toBe("@Grace notes ");
    expect(onMentionSelect).toHaveBeenCalledTimes(1);
    expect(onMentionSelect.mock.calls[0]![0]).toMatchObject({
        id: "document:doc-2",
        kind: "document",
    });

    // Reopen for the capture with both groups visible.
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    await userEvent.keyboard(" @");
    expect(
        document.querySelector('[data-happy2-ui="mention-picker-documents-header"]'),
    ).not.toBeNull();
    await view.screenshot("Composer.document-mentions.test");
});
