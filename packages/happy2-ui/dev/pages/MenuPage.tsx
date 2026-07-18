import { Menu, type MenuItem } from "../../src/Menu";
import { ComponentPage, DimensionRule, Specimen } from "../kit";

const messageActions: MenuItem[] = [
    { kind: "item", id: "copy", label: "Copy link", icon: "link", shortcut: "⌘C" },
    { kind: "item", id: "star", label: "Add to starred", icon: "star" },
    { kind: "item", id: "view", label: "View details", icon: "eye", shortcut: "⌘I" },
    { kind: "separator" },
    { kind: "item", id: "edit", label: "Edit message", icon: "edit", shortcut: "⌘E" },
    {
        kind: "item",
        id: "delete",
        label: "Delete message",
        icon: "close",
        danger: true,
        shortcut: "⇧⌘D",
    },
];

const grouped: MenuItem[] = [
    { kind: "label", label: "Sort by" },
    { kind: "item", id: "recent", label: "Most recent", icon: "clock" },
    { kind: "item", id: "unread", label: "Unread first", icon: "inbox" },
    { kind: "separator" },
    { kind: "label", label: "Filter" },
    { kind: "item", id: "mentions", label: "Only mentions", icon: "at" },
    { kind: "item", id: "muted", label: "Include muted", icon: "bell", disabled: true },
];

const textOnly: MenuItem[] = [
    { kind: "item", id: "rename", label: "Rename" },
    { kind: "item", id: "duplicate", label: "Duplicate", shortcut: "⌘D" },
    { kind: "item", id: "archive", label: "Archive" },
    { kind: "separator" },
    { kind: "item", id: "leave", label: "Leave channel", danger: true },
];

const states: MenuItem[] = [
    { kind: "item", id: "reply", label: "Reply", icon: "reply" },
    { kind: "item", id: "pin", label: "Pin (disabled)", icon: "star", disabled: true },
    { kind: "separator" },
    { kind: "item", id: "remove", label: "Remove", icon: "close", danger: true },
];

export function MenuPage() {
    return (
        <ComponentPage
            number="C-027"
            summary="Dropdown / context-menu popover — 220px raised card, 32px item rows, icon gutter, KeyCap shortcuts, mono section labels, danger items, and 1px separators."
            title="Menu"
        >
            <div className="specimen-grid">
                <Specimen
                    detail="220px card · 32px rows · icon gutter · ⌘ shortcuts · danger"
                    label="Context menu"
                    number="M-01"
                    stage="app"
                >
                    <div style={{ display: "grid", gap: "8px", padding: "28px" }}>
                        <div style={{ width: "220px" }}>
                            <DimensionRule label="width 220" />
                        </div>
                        <Menu items={messageActions} />
                    </div>
                </Specimen>

                <Specimen
                    detail="mono section labels · separators · disabled row"
                    label="Grouped"
                    number="M-02"
                    stage="app"
                >
                    <div style={{ padding: "28px" }}>
                        <Menu items={grouped} width={224} />
                    </div>
                </Specimen>
            </div>

            <div className="specimen-grid">
                <Specimen
                    detail="no icons — labels sit on the 10px edge, no gutter reserved"
                    label="Text only"
                    number="M-03"
                    stage="app"
                >
                    <div style={{ display: "grid", gap: "8px", padding: "28px" }}>
                        <div style={{ width: "192px" }}>
                            <DimensionRule label="width 192" />
                        </div>
                        <Menu items={textOnly} width={192} />
                    </div>
                </Specimen>

                <Specimen
                    detail="resting · disabled (0.4 alpha) · danger row"
                    label="States"
                    number="M-04"
                    stage="app"
                >
                    <div style={{ padding: "28px" }}>
                        <Menu items={states} width={200} />
                    </div>
                </Specimen>
            </div>
        </ComponentPage>
    );
}
