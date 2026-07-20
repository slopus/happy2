import { type HappyState, UserError } from "happy2-state";
import { settingsStoreFixtureCreate } from "happy2-state/testing";
import { expect, it, onTestFinished, vi } from "vitest";
import { server } from "vitest/browser";
import "../../styles.css";
import { createRenderer } from "../../testing";
import { SettingsPage } from "./SettingsPage";

type AvatarUploadResult = Awaited<ReturnType<HappyState["avatarUpload"]>>;

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

function readyFixture() {
    const fixture = settingsStoreFixtureCreate({ profile: loaded.profile });
    onTestFinished(() => fixture[Symbol.dispose]());
    fixture.input({ type: "settingsLoaded", ...loaded, avatarRevision: 0 });
    return fixture;
}

function nextFrame() {
    return new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}

function buttonNamed(root: ParentNode, name: string) {
    return Array.from(root.querySelectorAll<HTMLButtonElement>("button")).find(
        (button) => button.textContent?.trim() === name,
    );
}

function rect(element: Element) {
    const bounds = element.getBoundingClientRect();
    return { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height };
}

const pageHostStyle = {
    background: "var(--happy2-bg-app)",
    display: "flex",
    height: "100%",
    width: "100%",
} as const;

it("is silent at rest and keeps an empty save-status slot", async () => {
    const fixture = readyFixture();
    const view = createRenderer();
    view.render(() => <SettingsPage store={fixture.store} />, { width: 1024, height: 704 });
    await view.ready();

    const status = view.$('[data-happy2-ui="settings-save-status"]');
    expect(status.element.getAttribute("role")).toBe("status");
    expect(status.element.textContent).toBe("");
    expect(view.container.querySelector('[data-happy2-ui="banner"]')).toBeNull();
    expect(view.container.textContent).not.toContain("All changes saved");
    expect(view.container.textContent).not.toContain(
        "Profile and notification settings are up to date.",
    );
});

it("shows quiet pending copy for dirty, saving, and avatar-uploading states", async () => {
    const fixture = readyFixture();
    let resolveUpload!: (value: AvatarUploadResult) => void;
    const avatarUpload = vi.fn(
        () =>
            new Promise<AvatarUploadResult>((resolve) => {
                resolveUpload = resolve;
            }),
    );
    const avatarSet = vi.fn().mockResolvedValue(undefined);
    const view = createRenderer();
    view.render(
        () => <SettingsPage avatarActions={{ avatarSet, avatarUpload }} store={fixture.store} />,
        { width: 1024, height: 704 },
    );
    await view.ready();

    const status = () =>
        view.container.querySelector('[data-happy2-ui="settings-save-status"]')?.textContent;
    fixture.store.getState().displayNameUpdate("Grace", "Hopper");
    await nextFrame();
    expect(status()).toBe("Saving…");

    const submitted = fixture.store.getState().profile;
    fixture.input({ type: "profileSaving" });
    await nextFrame();
    expect(status()).toBe("Saving…");

    fixture.input({ type: "profileSaved", profile: submitted, submitted });
    await nextFrame();
    expect(status()).toBe("");

    const fileInput = view.container.querySelector<HTMLInputElement>('input[type="file"]')!;
    Object.defineProperty(fileInput, "files", {
        configurable: true,
        value: [new File(["face"], "face.png", { type: "image/png" })],
    });
    fileInput.dispatchEvent(new Event("change", { bubbles: true }));
    await nextFrame();
    expect(status()).toBe("Saving…");
    expect(buttonNamed(view.container, "Uploading…")?.disabled).toBe(true);

    resolveUpload({
        id: "avatar-1",
        originalName: "face.png",
        contentType: "image/png",
        isPublic: true,
        kind: "photo",
        size: 4,
    });
    await vi.waitFor(() => expect(status()).toBe(""));
    expect(avatarSet).toHaveBeenCalledWith("avatar-1");
});

it("keeps save and local failures loud with source-specific titles", async () => {
    const saveFixture = readyFixture();
    const localFixture = readyFixture();
    const view = createRenderer();
    view.render(() => <SettingsPage store={saveFixture.store} />, { width: 1024, height: 704 });
    view.render(() => <SettingsPage store={localFixture.store} />, { width: 1024, height: 704 });
    await view.ready();
    const [saveSurface, localSurface] =
        view.container.querySelectorAll<HTMLElement>("[data-gym-surface]");

    saveFixture.input({
        type: "profileSaveFailed",
        error: new UserError("Profile rejected"),
    });
    await nextFrame();
    const saveAlert = saveSurface!.querySelector<HTMLElement>('[role="alert"]')!;
    expect(saveAlert.querySelector('[data-happy2-ui="banner-title"]')?.textContent).toBe(
        "Changes were not saved",
    );
    expect(saveAlert.querySelector('[data-happy2-ui="banner-message"]')?.textContent).toBe(
        "Profile rejected",
    );
    expect(saveAlert.getAttribute("data-tone")).toBe("danger");
    saveFixture.store.getState().availabilityUpdate("away");
    await nextFrame();
    expect(saveSurface!.querySelector('[data-happy2-ui="settings-save-status"]')).toBeNull();
    expect(saveSurface!.querySelector('[role="alert"]')?.textContent).toContain("Profile rejected");

    const username = localSurface!.querySelector<HTMLInputElement>("#settings-username")!;
    username.value = "x";
    username.dispatchEvent(new Event("input", { bubbles: true }));
    await nextFrame();
    buttonNamed(localSurface!, "Confirm username")!.click();
    await nextFrame();
    buttonNamed(localSurface!, "Change username")!.click();
    await nextFrame();
    const localAlert = localSurface!.querySelector<HTMLElement>('[role="alert"]')!;
    expect(localAlert.querySelector('[data-happy2-ui="banner-title"]')?.textContent).toBe(
        "Settings need attention",
    );
    expect(localAlert.querySelector('[data-happy2-ui="banner-message"]')?.textContent).toContain(
        "Username must be 3–32 lowercase letters",
    );
});

it("moves from failure through retry and saving back to silence", async () => {
    const fixture = readyFixture();
    const view = createRenderer();
    view.render(() => <SettingsPage store={fixture.store} />, { width: 1024, height: 704 });
    await view.ready();

    fixture.input({ type: "profileSaveFailed", error: new UserError("Profile rejected") });
    await nextFrame();
    expect(view.container.querySelector('[role="alert"]')?.textContent).toContain(
        "Profile rejected",
    );

    fixture.store.getState().displayNameUpdate("Grace", "Hopper");
    await nextFrame();
    expect(view.container.querySelector('[role="alert"]')).toBeNull();
    expect(
        view.container.querySelector('[data-happy2-ui="settings-save-status"]')?.textContent,
    ).toBe("Saving…");

    const submitted = fixture.store.getState().profile;
    fixture.input({ type: "profileSaving" });
    await nextFrame();
    expect(
        view.container.querySelector('[data-happy2-ui="settings-save-status"]')?.textContent,
    ).toBe("Saving…");

    fixture.input({ type: "profileSaved", profile: submitted, submitted });
    await nextFrame();
    expect(
        view.container.querySelector('[data-happy2-ui="settings-save-status"]')?.textContent,
    ).toBe("");
});

it("holds save-status geometry, typography, alignment, and profile identity", async () => {
    const fixture = readyFixture();
    const constrainedFixture = readyFixture();
    const failedFixture = readyFixture();
    failedFixture.input({
        type: "profileSaveFailed",
        error: new UserError("Profile rejected"),
    });
    const view = createRenderer();
    view.render(
        () => (
            <div style={pageHostStyle}>
                <SettingsPage store={fixture.store} />
            </div>
        ),
        { width: 1024, height: 704 },
    );
    view.render(
        () => (
            <div style={pageHostStyle}>
                <SettingsPage store={constrainedFixture.store} />
            </div>
        ),
        { width: 480, height: 240 },
    );
    view.render(
        () => (
            <div style={pageHostStyle}>
                <SettingsPage store={failedFixture.store} />
            </div>
        ),
        { width: 640, height: 220 },
    );
    await view.ready();
    expect(window.devicePixelRatio).toBe(2);

    const [surface, constrainedSurface, failedSurface] =
        view.container.querySelectorAll<HTMLElement>("[data-gym-surface]");
    const status = view.$('[data-gym-surface]:first-child [data-happy2-ui="settings-save-status"]');
    const profileNode = surface!.querySelector('[data-happy2-ui="profile-card"]')!;
    const statusBounds = status.bounds();
    const initialStatusRect = rect(status.element);
    const initialProfileRect = rect(profileNode);

    expect(getComputedStyle(status.element.parentElement!).gap).toBe("16px");
    expect(statusBounds).toMatchObject({ width: 640, height: 20 });
    expect(statusBounds.x).toBe(192);
    expect(statusBounds.y).toBe(32);
    const computedFontFamily =
        server.browser === "webkit"
            ? "happy2 Figtree, system-ui, sans-serif"
            : '"happy2 Figtree", system-ui, sans-serif';
    expect(
        status.computedStyles([
            "align-items",
            "color",
            "display",
            "font-family",
            "font-size",
            "font-synthesis",
            "font-weight",
            "height",
            "justify-content",
            "line-height",
        ]),
    ).toEqual({
        "align-items": "center",
        color: "rgb(142, 142, 147)",
        display: "flex",
        "font-family": computedFontFamily,
        "font-size": "13px",
        "font-synthesis": "none",
        "font-weight": "400",
        height: "20px",
        "justify-content": "flex-end",
        "line-height": "20px",
    });
    expect(
        profileNode.getBoundingClientRect().y - status.element.getBoundingClientRect().bottom,
    ).toBe(16);

    fixture.store.getState().displayNameUpdate("Grace", "Hopper");
    await nextFrame();
    expect(surface!.querySelector('[data-happy2-ui="profile-card"]')).toBe(profileNode);
    expect(rect(status.element)).toEqual(initialStatusRect);
    expect(rect(profileNode)).toEqual(initialProfileRect);
    expect(status.element.textContent).toBe("Saving…");
    const statusLabel = view.$(
        '[data-gym-surface]:first-child [data-happy2-ui="settings-save-status-label"]',
    );
    expect(statusLabel.bounds().x + statusLabel.bounds().width).toBe(
        status.bounds().x + status.bounds().width,
    );
    const statusText = statusLabel.textMetrics();
    expect(statusText).toMatchObject({
        font: {
            family: "happy2 Figtree, system-ui, sans-serif",
            lineHeight: 20,
            size: 13,
            weight: "400",
        },
        text: "Saving…",
    });
    expect(statusText.baseline.fromElementTop).toBeGreaterThan(0);
    expect(statusText.baseline.fromElementTop).toBeLessThan(20);
    const ink = await statusLabel.visibleMetrics();
    expect(ink.pixelCount).toBeGreaterThan(0);
    expect(ink.bounds.y).toBeGreaterThan(0);
    expect(ink.bounds.y + ink.bounds.height).toBeLessThan(20);
    expect(ink.bounds.x).toBeGreaterThanOrEqual(0);
    expect(ink.bounds.x + ink.bounds.width).toBeLessThanOrEqual(statusLabel.bounds().width);

    const submitted = fixture.store.getState().profile;
    fixture.input({ type: "profileSaving" });
    await nextFrame();
    expect(surface!.querySelector('[data-happy2-ui="profile-card"]')).toBe(profileNode);
    expect(rect(status.element)).toEqual(initialStatusRect);
    expect(rect(profileNode)).toEqual(initialProfileRect);

    fixture.input({ type: "profileSaved", profile: submitted, submitted });
    await nextFrame();
    expect(surface!.querySelector('[data-happy2-ui="profile-card"]')).toBe(profileNode);
    expect(rect(status.element)).toEqual(initialStatusRect);
    expect(rect(profileNode)).toEqual(initialProfileRect);
    expect(status.element.textContent).toBe("");

    const constrainedStatus = constrainedSurface!.querySelector<HTMLElement>(
        '[data-happy2-ui="settings-save-status"]',
    )!;
    const constrainedProfile = constrainedSurface!.querySelector<HTMLElement>(
        '[data-happy2-ui="profile-card"]',
    )!;
    const constrainedSurfaceBounds = constrainedSurface!.getBoundingClientRect();
    expect(rect(constrainedStatus)).toMatchObject({ width: 432, height: 20 });
    expect(constrainedStatus.getBoundingClientRect().x - constrainedSurfaceBounds.x).toBe(24);
    expect(constrainedStatus.getBoundingClientRect().y - constrainedSurfaceBounds.y).toBe(32);
    expect(constrainedProfile.getBoundingClientRect().width).toBe(432);
    expect(
        constrainedProfile.getBoundingClientRect().y -
            constrainedStatus.getBoundingClientRect().bottom,
    ).toBe(16);

    const failedBanner = failedSurface!.querySelector<HTMLElement>('[role="alert"]')!;
    const failedProfile = failedSurface!.querySelector<HTMLElement>(
        '[data-happy2-ui="profile-card"]',
    )!;
    expect(failedBanner.getBoundingClientRect().width).toBe(592);
    expect(
        failedProfile.getBoundingClientRect().y - failedBanner.getBoundingClientRect().bottom,
    ).toBeCloseTo(16, 3);

    fixture.store.getState().emailUpdate("grace@example.com");
    await nextFrame();
    await view.screenshot("SettingsPage.test");
});

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
    await expect.poll(() => buttonNamed("Copied")).toBeTruthy();

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
