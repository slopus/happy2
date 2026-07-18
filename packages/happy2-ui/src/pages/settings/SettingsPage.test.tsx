import { UserError } from "happy2-state";
import { settingsStoreFixtureCreate } from "happy2-state/testing";
import { expect, it, onTestFinished } from "vitest";
import { createRenderer } from "../../testing";
import { SettingsPage } from "./SettingsPage";

const loaded = {
    profile: {
        id: "user-1",
        firstName: "Ada",
        lastName: "Lovelace",
        username: "ada",
        email: "ada@example.com",
    },
    presence: {
        userId: "user-1",
        availability: "online" as const,
        updatedAt: "2026-07-17T12:00:00.000Z",
    },
    notifications: {
        directMessages: "all" as const,
        mentions: "all" as const,
        threadReplies: "mentions" as const,
        reactions: "all" as const,
        calls: "all" as const,
        emailNotifications: false,
        desktopNotifications: true,
    },
};

it("renders ready settings, routes typed field actions, and follows authoritative updates", async () => {
    const fixture = settingsStoreFixtureCreate({ profile: loaded.profile });
    onTestFinished(() => fixture[Symbol.dispose]());
    fixture.input({ type: "settingsLoaded", ...loaded, avatarRevision: 0 });
    const view = createRenderer();
    view.render(() => <SettingsPage store={fixture.store} />, { width: 1024, height: 704 });
    await view.ready();

    const name = view.container.querySelector<HTMLInputElement>("#settings-name")!;
    name.value = "Grace Hopper";
    name.dispatchEvent(new Event("input", { bubbles: true }));
    expect(fixture.store.get().profile).toMatchObject({
        firstName: "Grace",
        lastName: "Hopper",
    });

    fixture.input({
        type: "settingsLoaded",
        ...loaded,
        profile: { ...loaded.profile, username: "remote-ada" },
        avatarRevision: 0,
    });
    await new Promise<void>((resolve) => queueMicrotask(resolve));
    expect(view.container.querySelector<HTMLInputElement>("#settings-username")?.value).toBe(
        "remote-ada",
    );

    fixture.input({ type: "profileSaveFailed", error: new UserError("Profile rejected") });
    expect(view.container.textContent).toContain("Profile rejected");
});

it("preserves the focused input node across synchronous typed field store updates", async () => {
    const fixture = settingsStoreFixtureCreate({ profile: loaded.profile });
    onTestFinished(() => fixture[Symbol.dispose]());
    fixture.input({ type: "settingsLoaded", ...loaded, avatarRevision: 0 });
    const view = createRenderer();
    view.render(() => <SettingsPage store={fixture.store} />, { width: 1024, height: 704 });
    await view.ready();

    const input = view.container.querySelector<HTMLInputElement>("#settings-name")!;
    input.focus();
    expect(document.activeElement).toBe(input);

    input.value = "Ada Byron";
    input.dispatchEvent(new InputEvent("input", { bubbles: true, data: "n" }));

    expect(fixture.store.get().profile).toMatchObject({
        firstName: "Ada",
        lastName: "Byron",
    });
    expect(view.container.querySelector("#settings-name")).toBe(input);
    expect(document.activeElement).toBe(input);

    fixture.input({ type: "profileSaving" });
    expect(view.container.querySelector("#settings-name")).toBe(input);
    expect(document.activeElement).toBe(input);
});
