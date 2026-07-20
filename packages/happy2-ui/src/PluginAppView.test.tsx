import { expect, it, vi } from "vitest";
import "./theme.css";
import "./styles/icon.css";
import "./styles/button.css";
import "./styles/empty-state.css";
import "./styles/plugin-glyph.css";
import "./styles/plugin-app-view.css";
import { PluginAppView } from "./PluginAppView";
import { PluginAssetGlyph } from "./PluginAssetGlyph";
import { createRenderer } from "./testing";

const MASK =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

it("renders a page-quality header and the loading state", async () => {
    const view = createRenderer().render(
        () => (
            <PluginAppView
                data-testid="view"
                description="Shared task lists"
                glyph={<PluginAssetGlyph maskUrl={MASK} size={24} />}
                status="loading"
                title="TODO Lists"
            />
        ),
        { width: 640, height: 360 },
    );
    const header = view.$('[data-happy2-ui="plugin-app-view-header"]');
    // The header uses the 56px surface header row.
    expect(header.bounds().height).toBe(56);
    expect(view.$('[data-happy2-ui="plugin-app-view-title"]').element.textContent).toBe(
        "TODO Lists",
    );
    expect(view.$('[data-happy2-ui="plugin-app-view-description"]').element.textContent).toBe(
        "Shared task lists",
    );
    expect(view.$('[data-happy2-ui="plugin-app-view-loading"]').element).not.toBeNull();
    await view.screenshot("PluginAppView.loading.test");
}, 120000);

it("renders unavailable and error states with a retry action", async () => {
    const onReload = vi.fn(() => undefined);
    const view = createRenderer()
        .render(
            () => (
                <PluginAppView
                    data-testid="unavailable"
                    onReload={onReload}
                    status="unavailable"
                    title="TODO Lists"
                />
            ),
            { width: 560, height: 320 },
        )
        .render(
            () => (
                <PluginAppView
                    data-testid="error"
                    error="The plugin crashed."
                    onReload={onReload}
                    status="error"
                    title="TODO Lists"
                />
            ),
            { width: 560, height: 320 },
        );
    expect(view.$('[data-testid="unavailable"]').element.textContent).toContain("App unavailable");
    const errorView = view.$('[data-testid="error"]');
    expect(errorView.element.textContent).toContain("The plugin crashed.");
    const retry = errorView.element.querySelector("button") as HTMLButtonElement;
    retry.click();
    expect(onReload).toHaveBeenCalled();
    await view.screenshot("PluginAppView.states.test");
}, 120000);
