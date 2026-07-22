import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import {
    happyStateCreate,
    type PluginAppSummary,
    type PluginAppView,
    type PluginContributionSummary,
} from "happy2-state";
import { createFakeServer as createBareFakeServer, jsonResponse } from "happy2-state/testing";
import { afterEach, beforeEach, expect, it, onTestFinished } from "vitest";
import { DesktopApp } from "./components/DesktopApp";
import { desktopNavigationCreate } from "./navigation/desktopNavigationCreate";

afterEach(cleanup);
beforeEach(() => history.replaceState(null, "", "/chats"));

const NOW = "2026-07-20T00:00:00.000Z";

function appSummary(overrides: Partial<PluginAppSummary> = {}): PluginAppSummary {
    return {
        id: "inst-todos-index",
        installationId: "install-1",
        pluginId: "plugin-todos",
        pluginShortName: "todos",
        instanceKey: "todos:index",
        resourceUri: "ui://happy2-todos/index.html",
        title: "TODO Lists",
        description: "Shared task lists",
        assetId: "todo-mark",
        available: true,
        context: { dataRevision: 1 },
        dataRevision: 1,
        scope: "all_users",
        presentation: "sidebar",
        position: 10,
        revision: 1,
        hidden: false,
        createdAt: NOW,
        updatedAt: NOW,
        ...overrides,
    };
}

function appView(app: PluginAppSummary): PluginAppView {
    return {
        app,
        resource: {
            html: "<!doctype html><meta charset=utf-8><body><main id=root></main></body>",
            contentHashSha256: "a".repeat(64),
        },
        hostContext: {
            "happy2/instance": {
                id: app.id,
                key: app.instanceKey,
                context: app.context,
                dataRevision: app.dataRevision,
                definitionRevision: 1,
            },
        },
    };
}

function baseServer(apps: PluginAppSummary[], contributions: PluginContributionSummary[] = []) {
    const server = createBareFakeServer();
    server.respond("GET", "/v0/drafts", jsonResponse(200, { drafts: [], serverTime: NOW }));
    server.respond(
        "GET",
        "/v0/sync/state",
        jsonResponse(200, {
            state: { protocolVersion: 1, generation: "g", sequence: "0" },
            serverTime: NOW,
        }),
    );
    server.respond("GET", "/v0/chats", jsonResponse(200, { chats: [] }));
    server.respond("GET", "/v0/projects", jsonResponse(200, { projects: [] }));
    server.respond(
        "GET",
        "/v0/contacts",
        jsonResponse(200, { users: [], presence: [], statuses: [] }),
    );
    server.respond("GET", "/v0/apps", jsonResponse(200, { apps }));
    server.respond("GET", /^\/v0\/contributions(\?|$)/u, jsonResponse(200, { contributions }));
    server.respond("GET", /^\/v0\/apps\/[^/]+$/u, jsonResponse(200, appView(apps[0]!)));
    server.respond(
        "GET",
        /^\/v0\/pluginInstallations\/.+\/uiAssets\/.+$/u,
        jsonResponse(404, { error: "no asset" }),
    );
    return server;
}

it("navigates the Apps sidebar to a durable app page", async () => {
    const server = baseServer([appSummary()]);
    const state = happyStateCreate({ transport: server.transport });
    await state.syncStart();
    const navigation = desktopNavigationCreate();
    onTestFinished(() => {
        navigation[Symbol.dispose]();
        state[Symbol.dispose]();
        server.close();
    });
    const screen = render(<DesktopApp navigation={navigation} state={state} />);
    // Open the Apps area from the workspace nav.
    const appsNav = await screen.findByRole("button", { name: "Apps" });
    fireEvent.click(appsNav);
    await waitFor(() => expect(location.pathname).toBe("/apps"));
    // The plural Apps sidebar lists the visible instance; selecting it routes to its page.
    const appRow = await screen.findByRole("button", { name: "TODO Lists" });
    fireEvent.click(appRow);
    await waitFor(() => expect(location.pathname).toBe("/apps/inst-todos-index"));
    await waitFor(() =>
        expect(
            screen.container.querySelector('[data-happy2-ui="plugin-app-view-title"]')?.textContent,
        ).toBe("TODO Lists"),
    );
});

it("hides a durable app instance from the Apps settings panel", async () => {
    let updated: PluginAppSummary | undefined;
    const server = baseServer([appSummary()]);
    server.route("POST", "/v0/me/updateAppPresentation", (request) => {
        const body = (request.body ?? {}) as { hidden?: boolean };
        updated = appSummary({ hidden: body.hidden ?? false });
        return jsonResponse(200, { app: updated });
    });
    const state = happyStateCreate({ transport: server.transport });
    await state.syncStart();
    history.replaceState(null, "", "/apps");
    const navigation = desktopNavigationCreate();
    onTestFinished(() => {
        navigation[Symbol.dispose]();
        state[Symbol.dispose]();
        server.close();
    });
    const screen = render(<DesktopApp navigation={navigation} state={state} />);
    const toggle = await waitFor(() => {
        const el = screen.container.querySelector<HTMLButtonElement>(
            '[data-happy2-ui="plugin-settings-row"] [role="switch"]',
        );
        if (!el) throw new Error("app row switch not found");
        return el;
    });
    expect(toggle.getAttribute("aria-checked")).toBe("true");
    fireEvent.click(toggle);
    await waitFor(() => expect(updated?.hidden).toBe(true));
});

it("opens a durable app instance as a modal and full-window overlay by route", async () => {
    const server = baseServer([appSummary()]);
    const state = happyStateCreate({ transport: server.transport });
    await state.syncStart();
    history.replaceState(null, "", "/apps?overlay=app&app=inst-todos-index&present=modal");
    const navigation = desktopNavigationCreate();
    onTestFinished(() => {
        navigation[Symbol.dispose]();
        state[Symbol.dispose]();
        server.close();
    });
    const screen = render(<DesktopApp navigation={navigation} state={state} />);
    const overlay = await waitFor(() => {
        const el = screen.container.querySelector<HTMLElement>(
            '[data-happy2-ui="plugin-app-overlay"]',
        );
        if (!el) throw new Error("app overlay not found");
        return el;
    });
    expect(overlay.getAttribute("data-presentation")).toBe("modal");
    expect(overlay.getAttribute("role")).toBe("dialog");
    expect(overlay.getAttribute("aria-modal")).toBe("true");

    // Switching the route to fullscreen keeps the overlay but changes presentation.
    history.replaceState(null, "", "/apps?overlay=app&app=inst-todos-index&present=fullscreen");
    navigation.navigate(
        {
            primary: { kind: "apps" },
            overlay: { kind: "app", instanceId: "inst-todos-index", presentation: "fullscreen" },
            files: { filter: "all", query: "" },
        },
        { replace: true },
    );
    await waitFor(() =>
        expect(
            screen.container
                .querySelector('[data-happy2-ui="plugin-app-overlay"]')
                ?.getAttribute("data-presentation"),
        ).toBe("fullscreen"),
    );
});
