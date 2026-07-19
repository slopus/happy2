import { UserError } from "happy2-state";
import { settingsStoreFixtureCreate } from "happy2-state/testing";
import { expect, it, onTestFinished, vi } from "vitest";
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
    expect(fixture.store.getState().profile).toMatchObject({
        firstName: "Grace",
        lastName: "Hopper",
    });

    fixture.input({
        type: "settingsLoaded",
        ...loaded,
        profile: { ...loaded.profile, username: "remote-ada" },
        avatarRevision: 0,
    });
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    expect(view.container.querySelector<HTMLInputElement>("#settings-username")?.value).toBe(
        "remote-ada",
    );

    fixture.input({ type: "profileSaveFailed", error: new UserError("Profile rejected") });
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
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

    expect(fixture.store.getState().profile).toMatchObject({
        firstName: "Ada",
        lastName: "Byron",
    });
    expect(view.container.querySelector("#settings-name")).toBe(input);
    expect(document.activeElement).toBe(input);

    fixture.input({ type: "profileSaving" });
    expect(view.container.querySelector("#settings-name")).toBe(input);
    expect(document.activeElement).toBe(input);
});

it("gates development tokens, prevents duplicate creation, copies, and clears the secret", async () => {
    const fixture = settingsStoreFixtureCreate({ profile: loaded.profile });
    onTestFinished(() => fixture[Symbol.dispose]());
    fixture.input({ type: "settingsLoaded", ...loaded, avatarRevision: 0 });
    let resolveCredential!: (credential: {
        token: string;
        sessionId: string;
        expiresAt: string;
    }) => void;
    const developmentTokenCreate = vi.fn(
        () =>
            new Promise<{
                token: string;
                sessionId: string;
                expiresAt: string;
            }>((resolve) => {
                resolveCredential = resolve;
            }),
    );
    const writeText = vi.fn().mockResolvedValue(undefined);
    const clipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, "clipboard");
    Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: { writeText },
    });
    onTestFinished(() => {
        if (clipboardDescriptor) Object.defineProperty(navigator, "clipboard", clipboardDescriptor);
        else Reflect.deleteProperty(navigator, "clipboard");
    });
    const view = createRenderer();
    view.render(
        () => (
            <SettingsPage
                developmentTokenActions={{ developmentTokenCreate }}
                store={fixture.store}
            />
        ),
        { width: 1024, height: 704 },
    );
    await view.ready();

    const buttonNamed = (name: string) =>
        Array.from(view.container.querySelectorAll<HTMLButtonElement>("button")).find(
            (button) => button.textContent?.trim() === name,
        );
    const create = buttonNamed("Create development token")!;
    create.click();
    create.click();
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    expect(developmentTokenCreate).toHaveBeenCalledTimes(1);
    expect(buttonNamed("Creating token…")?.disabled).toBe(true);

    const credential = {
        token: "happy2_dev_settings_secret",
        sessionId: "session-1",
        expiresAt: "2026-07-20T01:00:00.000Z",
    };
    resolveCredential(credential);
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    expect(view.container.querySelector('[data-testid="development-token-modal"]')).not.toBeNull();
    expect(view.container.textContent).toContain(credential.token);
    expect(view.container.textContent).toContain("UTC");

    view.container.querySelector<HTMLButtonElement>('button[aria-label="Hide secret"]')!.click();
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    expect(view.container.textContent).not.toContain(credential.token);
    view.container.querySelector<HTMLButtonElement>('button[aria-label="Reveal secret"]')!.click();
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    buttonNamed("Copy")!.click();
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    expect(writeText).toHaveBeenCalledWith(credential.token);
    expect(buttonNamed("Copied")).toBeTruthy();

    view.container.querySelector<HTMLButtonElement>('button[aria-label="Close"]')!.click();
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    expect(view.container.querySelector('[data-testid="development-token-modal"]')).toBeNull();
    expect(view.container.textContent).not.toContain(credential.token);
});

it("keeps the development-token row absent when disabled and localizes creation failures", async () => {
    const fixture = settingsStoreFixtureCreate({ profile: loaded.profile });
    onTestFinished(() => fixture[Symbol.dispose]());
    fixture.input({ type: "settingsLoaded", ...loaded, avatarRevision: 0 });
    const view = createRenderer();
    view.render(() => <SettingsPage store={fixture.store} />, { width: 1024, height: 704 });
    await view.ready();
    expect(view.container.textContent).not.toContain("Development token");

    const failed = createRenderer();
    failed.render(
        () => (
            <SettingsPage
                developmentTokenActions={{
                    developmentTokenCreate: () => Promise.reject(new Error("Issuance denied")),
                }}
                store={fixture.store}
            />
        ),
        { width: 1024, height: 704 },
    );
    await failed.ready();
    Array.from(failed.container.querySelectorAll<HTMLButtonElement>("button"))
        .find((button) => button.textContent?.trim() === "Create development token")!
        .click();
    await vi.waitFor(() =>
        expect(
            failed.container.querySelector('[data-testid="development-token-error"]')?.textContent,
        ).toContain("Issuance denied"),
    );
    expect(failed.container.querySelector('[data-testid="development-token-modal"]')).toBeNull();
});
