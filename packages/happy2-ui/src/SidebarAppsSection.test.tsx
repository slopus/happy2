import { expect, it, vi } from "vitest";
import "./theme.css";
import "./styles/icon.css";
import "./styles/button.css";
import "./styles/avatar.css";
import "./styles/badge.css";
import "./styles/sidebar.css";
import "./styles/plugin-glyph.css";
import "./styles/sidebar-apps.css";
import { SidebarAppsSection, type SidebarAppEntry } from "./SidebarAppsSection";
import { createRenderer } from "./testing";

const MASK =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

const apps: readonly SidebarAppEntry[] = [
    { id: "inst-1", title: "TODO Lists", maskUrl: MASK, available: true },
    { id: "inst-2", title: "Groceries", maskUrl: MASK, available: false },
];

it("lists visible app instances as stable-keyed rows with masked glyphs", async () => {
    const onAppSelect = vi.fn((_id: string) => undefined);
    const view = createRenderer().render(
        () => (
            <SidebarAppsSection
                activeAppId="inst-1"
                apps={apps}
                data-testid="apps"
                onAppSelect={onAppSelect}
                onManage={() => undefined}
            />
        ),
        { width: 320, height: 520 },
    );
    const root = view.$('[data-testid="apps"]');
    const rows = root.element.querySelectorAll("[data-happy2-ui='sidebar-item']");
    expect(rows.length).toBe(2);
    // Rows are keyed and addressable by instance id, in order.
    expect(rows[0]!.getAttribute("data-item-id")).toBe("inst-1");
    expect(rows[1]!.getAttribute("data-item-id")).toBe("inst-2");
    // The active instance is marked current.
    expect(rows[0]!.getAttribute("aria-current")).toBe("page");
    // Each row renders the authenticated monochrome glyph (currentColor mask).
    expect(rows[0]!.querySelector("[data-happy2-ui='plugin-glyph']")).not.toBeNull();
    // The unavailable instance stays in place but reads muted (archived).
    expect(rows[1]!.getAttribute("data-archived")).toBe("");
    // Selecting a row reports its instance id.
    (rows[1] as HTMLButtonElement).click();
    expect(onAppSelect).toHaveBeenCalledWith("inst-2");
    await view.screenshot("SidebarAppsSection.test");
}, 120000);
