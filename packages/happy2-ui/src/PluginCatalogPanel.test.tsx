import { expect, it } from "vitest";
import { type ReactNode } from "react";
import { server } from "vitest/browser";
import "./theme.css";
import "./styles/icon.css";
import "./styles/button.css";
import "./styles/badge.css";
import "./styles/banner.css";
import "./styles/empty-state.css";
import "./styles/checkbox.css";
import "./styles/modal.css";
import "./styles/modal-overlay.css";
import "./styles/text-field.css";
import "./styles/form-row.css";
import "./styles/select.css";
import "./styles/plugin-catalog-panel.css";
import {
    PluginCatalogPanel,
    type PluginCatalogEntry,
    type PluginPermissionSection,
} from "./PluginCatalogPanel";
import { createRenderer } from "./testing";

type Engine = "chromium" | "firefox" | "webkit";
type View = ReturnType<typeof createRenderer>;
const engine = () => server.browser as Engine;

const uiFamily = () =>
    engine() === "webkit"
        ? "happy2 Figtree, system-ui, sans-serif"
        : '"happy2 Figtree", system-ui, sans-serif';

const PERMISSIONS: readonly PluginPermissionSection[] = [
    {
        id: "plugins",
        displayName: "Plugins",
        readOnly: [
            {
                id: "plugins:list",
                displayName: "View plugins",
                description: "View installed plugins and their current status.",
            },
        ],
        mutations: [
            {
                id: "plugins:install",
                displayName: "Install plugins",
                description: "Install another plugin and choose the permissions granted to it.",
            },
            {
                id: "plugins:uninstall",
                displayName: "Uninstall plugins",
                description: "Stop and uninstall an existing plugin installation.",
            },
        ],
    },
];

/*
 * ModalOverlay is `position: fixed`; a transformed wrapper establishes a
 * containing block so each dialog specimen stays bounded and screenshot-safe.
 */
function Frame(props: { children: ReactNode; width?: number; height?: number }) {
    return (
        <div
            style={{
                position: "relative",
                width: `${props.width ?? 760}px`,
                height: `${props.height ?? 560}px`,
                overflow: "hidden",
                transform: "translateZ(0)",
                background: "#17161c",
                display: "flex",
            }}
        >
            {props.children}
        </div>
    );
}

const HELLO: PluginCatalogEntry = {
    shortName: "hello",
    displayName: "Hello",
    description: "A minimal skills-only example plugin bundled with the server.",
    version: "1.0.0",
    skills: [{ name: "hello", description: "Says hello." }],
    variables: [],
    apiPermissions: [],
    installed: true,
    installations: [
        { id: "ins-1", version: "1.0.0", status: "ready", grantedPermissions: [] },
        { id: "ins-2", version: "1.0.0", status: "preparing", grantedPermissions: [] },
    ],
};

const PROJECT_SEARCH: PluginCatalogEntry = {
    shortName: "project-search",
    displayName: "Project Search",
    description: "Searches source code and project documentation.",
    version: "2.1.0",
    skills: [],
    mcp: { type: "remote", container: "none" },
    variables: [
        {
            key: "PROJECT_API_TOKEN",
            displayName: "API token",
            description: "Token used by the MCP server.",
            kind: "secret",
        },
        {
            key: "PROJECT_REGION",
            displayName: "Region",
            description: "Region used for project queries.",
            kind: "text",
        },
    ],
    apiPermissions: PERMISSIONS,
    installed: true,
    installedVersion: "2.0.0",
    updateAvailable: true,
    installations: [
        {
            id: "ins-3",
            version: "2.0.0",
            status: "failed",
            detail: "MCP initialize timed out.",
            grantedPermissions: ["plugins:list", "plugins:install"],
        },
    ],
};

const RUNNER: PluginCatalogEntry = {
    shortName: "task-runner",
    displayName: "Task Runner",
    description: "Runs project automation through a stdio MCP in a selected container.",
    version: "0.4.2",
    skills: [
        { name: "run-task", description: "Runs one named automation task." },
        { name: "list-tasks", description: "Lists every automation task the project defines." },
    ],
    mcp: { type: "stdio", container: "selection_required" },
    variables: [
        {
            key: "RUNNER_TOKEN",
            displayName: "Runner token",
            description: "Token the runner uses against the project API.",
            kind: "secret",
        },
    ],
    apiPermissions: PERMISSIONS,
    installed: false,
    installations: [],
};

// The server permits skill names up to 64 characters; use a single unbroken
// maximum-length token as the worst case for a constrained catalog card.
const LONG_SKILL_NAME = "a".repeat(64);
const LONG_SKILL: PluginCatalogEntry = {
    shortName: "toolkit",
    displayName: "Toolkit",
    description: "A package whose skill uses the maximum-length name.",
    version: "1.0.0",
    skills: [
        {
            name: LONG_SKILL_NAME,
            description:
                "Runs a lengthy automation workflow that must stay readable beside a very long skill name.",
        },
    ],
    variables: [],
    apiPermissions: [],
    installed: false,
    installations: [],
};

const card = (shortName: string) =>
    `.happy2-plugin-catalog-panel__card[data-plugin-short-name="${shortName}"]`;

it("holds PluginCatalogPanel layout, capability badges, installation health, and install actions", async () => {
    const opened: string[] = [];
    const view = createRenderer().render(
        () => (
            <div
                style={{ width: "980px", height: "520px", background: "#17161c", display: "flex" }}
            >
                <PluginCatalogPanel
                    data-testid="panel"
                    onOpenInstall={(shortName) => opened.push(shortName)}
                    plugins={[HELLO, PROJECT_SEARCH, RUNNER]}
                    subtitle="Packages of Agent Skills and MCP servers bundled with the server."
                />
            </div>
        ),
        { width: 980, height: 520 },
    );
    await view.ready();

    // Root: a flex column that fills the container, dark theme text + UI font.
    const root = view.$('[data-testid="panel"]');
    expect(root.bounds()).toEqual({ x: 0, y: 0, width: 980, height: 520 });
    expect(
        root.computedStyles([
            "box-sizing",
            "color",
            "display",
            "flex-direction",
            "gap",
            "position",
        ]),
    ).toEqual({
        "box-sizing": "border-box",
        color: "rgb(237, 234, 242)",
        display: "flex",
        "flex-direction": "column",
        gap: "16px",
        position: "relative",
    });
    expect(root.computedStyle("font-family")).toBe(uiFamily());

    // Header title: 15/600 UI type; subtitle is muted.
    const title = view.$(".happy2-plugin-catalog-panel__title");
    expect(title.textMetrics().text).toBe("Plugins");
    expect(title.textMetrics().font).toEqual({
        family: "happy2 Figtree, system-ui, sans-serif",
        letterSpacing: 0,
        lineHeight: 20,
        size: 15,
        weight: "600",
    });
    expect(view.$(".happy2-plugin-catalog-panel__subtitle").computedStyle("color")).toBe(
        "rgb(117, 112, 133)",
    );

    // Card row: 40px icon slot with 8px radius, body fills, action pins right.
    const icon = view.$(`${card("hello")} .happy2-plugin-catalog-panel__icon`);
    expect(icon.bounds().width).toBe(40);
    expect(icon.bounds().height).toBe(40);
    expect(icon.computedStyle("border-radius")).toBe("8px");
    const cardBox = view.$(card("hello"));
    expect(cardBox.computedStyles(["display", "align-items", "gap", "border-radius"])).toEqual({
        display: "flex",
        "align-items": "flex-start",
        gap: "12px",
        "border-radius": "10px",
    });
    // Card actions pin right inside the 16px card padding and 1px border.
    const actions = view.$(`${card("hello")} .happy2-plugin-catalog-panel__card-actions`);
    expect(actions.offsets().right, "card actions right-aligned").toBe(17);

    // Name and version: 14/600 name, mono muted version.
    const name = view.$(`${card("hello")} [data-happy2-ui="plugin-catalog-name"]`);
    expect(name.textMetrics().text).toBe("Hello");
    expect(name.textMetrics().font.size).toBe(14);
    expect(name.textMetrics().font.weight).toBe("600");
    const version = view.$(`${card("hello")} [data-happy2-ui="plugin-catalog-version"]`);
    expect(version.element.textContent).toBe("v1.0.0");
    expect(version.computedStyle("font-family")).toContain("happy2 Mono");

    // An installed package pinned to an older version shows the stored version
    // and both Installed and Update badges.
    expect(
        view.$(`${card("project-search")} [data-happy2-ui="plugin-catalog-version"]`).element
            .textContent,
    ).toBe("v2.0.0");
    const badgeLabels = (shortName: string) =>
        Array.from(
            view
                .$(`${card(shortName)} .happy2-plugin-catalog-panel__name-row`)
                .element.querySelectorAll('[data-happy2-ui="badge-label"]'),
            (node) => node.textContent,
        );
    expect(badgeLabels("hello")).toEqual(["Installed"]);
    expect(badgeLabels("project-search")).toEqual(["Installed", "Update v2.1.0"]);
    expect(badgeLabels("task-runner")).toEqual([]);

    // Capability badges: skills count and MCP mode.
    const capabilities = (shortName: string) =>
        Array.from(
            view
                .$(`${card(shortName)} .happy2-plugin-catalog-panel__capabilities`)
                .element.querySelectorAll('[data-happy2-ui="badge-label"]'),
            (node) => node.textContent,
        );
    expect(capabilities("hello")).toEqual(["1 skill"]);
    expect(capabilities("project-search")).toEqual(["MCP · remote"]);
    expect(capabilities("task-runner")).toEqual(["2 skills", "MCP · stdio"]);

    // Agent Skills: every skill is discoverable by its exact name and
    // description, in declared order — not only a count badge. The container and
    // each row expose stable measurable markers that actually render.
    expect(
        view
            .$(card("task-runner"))
            .element.querySelector('[data-happy2-ui="plugin-catalog-skills"]'),
        "skills container renders its stable marker",
    ).not.toBeNull();
    const skillRows = (shortName: string) =>
        Array.from(
            view
                .$(card(shortName))
                .element.querySelectorAll('[data-happy2-ui="plugin-catalog-skill"]'),
        );
    const skillPairs = (shortName: string) =>
        skillRows(shortName).map((row) => [
            row.querySelector('[data-happy2-ui="plugin-catalog-skill-name"]')!.textContent,
            row.querySelector('[data-happy2-ui="plugin-catalog-skill-description"]')!.textContent,
        ]);
    expect(skillPairs("task-runner")).toEqual([
        ["run-task", "Runs one named automation task."],
        ["list-tasks", "Lists every automation task the project defines."],
    ]);
    expect(skillPairs("hello")).toEqual([["hello", "Says hello."]]);
    expect(
        view
            .$(card("project-search"))
            .element.querySelector('[data-happy2-ui="plugin-catalog-skills"]'),
        "no skills list for a skill-less package",
    ).toBeNull();

    // Skill row contract: a baseline-aligned flex row, an accent mono name
    // token at 12px, and 13px secondary-text description. Adjacent skill rows
    // keep the declared 6px column gap.
    const runTaskRow = view.$(`${card("task-runner")} [data-skill-name="run-task"]`);
    expect(runTaskRow.computedStyles(["display", "align-items", "gap"])).toEqual({
        display: "flex",
        "align-items": "baseline",
        gap: "8px",
    });
    const runTaskName = view.$(
        `${card("task-runner")} [data-skill-name="run-task"] [data-happy2-ui="plugin-catalog-skill-name"]`,
    );
    expect(runTaskName.textMetrics().text).toBe("run-task");
    expect(runTaskName.textMetrics().font.size).toBe(12);
    expect(runTaskName.computedStyle("color")).toBe("rgb(139, 124, 247)");
    expect(runTaskName.computedStyle("font-family")).toContain("happy2 Mono");
    const runTaskDescription = view.$(
        `${card("task-runner")} [data-skill-name="run-task"] [data-happy2-ui="plugin-catalog-skill-description"]`,
    );
    expect(runTaskDescription.textMetrics().font.size).toBe(13);
    expect(runTaskDescription.computedStyle("color")).toBe("rgb(165, 160, 176)");
    const rows = skillRows("task-runner");
    const first = rows[0]!.getBoundingClientRect();
    const second = rows[1]!.getBoundingClientRect();
    expect(Math.round(second.top - first.bottom), "6px gap between skill rows").toBe(6);

    // Installations: one status badge per independent installation, with the
    // bounded diagnostic in the health span's title attribute.
    const installations = view.$(`${card("hello")} .happy2-plugin-catalog-panel__installations`);
    expect(
        Array.from(
            installations.element.querySelectorAll('[data-happy2-ui="badge-label"]'),
            (node) => node.textContent,
        ),
    ).toEqual(["Ready", "Preparing"]);
    const failed = view.$(`${card("project-search")} [data-installation-id="ins-3"]`);
    expect(
        failed.element
            .querySelector(".happy2-plugin-catalog-panel__installation-health")!
            .getAttribute("title"),
    ).toBe("MCP initialize timed out.");
    expect(
        failed.element.querySelector('[data-happy2-ui="badge"]')!.getAttribute("data-variant"),
    ).toBe("danger");
    expect(
        view
            .$(card("task-runner"))
            .element.querySelector(".happy2-plugin-catalog-panel__installations"),
        "no installations row for an uninstalled package",
    ).toBeNull();

    // Install actions: primary for a first install, secondary for another
    // installation of an installed package; clicks flow through the callback.
    const button = (shortName: string) =>
        view.$(`${card(shortName)} .happy2-plugin-catalog-panel__card-actions button`);
    expect(button("task-runner").element.textContent).toContain("Install");
    expect(button("hello").element.textContent).toContain("Install again");
    (button("task-runner").element as HTMLButtonElement).click();
    (button("hello").element as HTMLButtonElement).click();
    expect(opened).toEqual(["task-runner", "hello"]);

    await view.screenshot("PluginCatalogPanel.test");
}, 120_000);

it("contains a maximum-length skill name inside a constrained catalog card", async () => {
    const view = createRenderer().render(
        () => (
            // A deliberately narrow desktop catalog card stresses containment.
            <div
                style={{ width: "360px", height: "320px", background: "#17161c", display: "flex" }}
            >
                <PluginCatalogPanel
                    data-testid="panel"
                    onOpenInstall={() => undefined}
                    plugins={[LONG_SKILL]}
                />
            </div>
        ),
        { width: 360, height: 320 },
    );
    await view.ready();

    const cardRect = view.$(card("toolkit")).element.getBoundingClientRect();
    const body = view
        .$(`${card("toolkit")} .happy2-plugin-catalog-panel__body`)
        .element.getBoundingClientRect();
    const actions = view
        .$(`${card("toolkit")} .happy2-plugin-catalog-panel__card-actions`)
        .element.getBoundingClientRect();
    const nameEl = view.$(
        `${card("toolkit")} [data-happy2-ui="plugin-catalog-skill-name"]`,
    ).element;
    const descEl = view.$(
        `${card("toolkit")} [data-happy2-ui="plugin-catalog-skill-description"]`,
    ).element;
    const nameRect = nameEl.getBoundingClientRect();
    const descRect = descEl.getBoundingClientRect();

    // The exact 64-character name is present in full and never overflows its
    // box horizontally — it wraps instead of clipping.
    expect(nameEl.textContent).toBe(LONG_SKILL_NAME);
    expect(LONG_SKILL_NAME.length).toBe(64);
    expect(nameEl.scrollWidth, "skill name never overflows horizontally").toBeLessThanOrEqual(
        nameEl.clientWidth + 1,
    );
    expect(nameRect.height, "long name wraps to multiple 18px lines").toBeGreaterThanOrEqual(36);

    // The card stays inside the constrained 360px container, and the name and
    // description both paint within the card body.
    expect(cardRect.width, "card stays within the constrained width").toBeLessThanOrEqual(360.5);
    expect(nameRect.left).toBeGreaterThanOrEqual(body.left - 0.5);
    expect(nameRect.right).toBeLessThanOrEqual(body.right + 0.5);
    expect(descRect.left).toBeGreaterThanOrEqual(body.left - 0.5);
    expect(descRect.right).toBeLessThanOrEqual(body.right + 0.5);

    // The name is capped at half the row, so the description keeps at least the
    // other half and stays readable.
    expect(nameRect.width, "name capped at half the row").toBeLessThanOrEqual(body.width * 0.5 + 1);
    expect(descRect.width, "description keeps a readable width").toBeGreaterThanOrEqual(
        body.width * 0.5 - 10,
    );
    expect(descEl.textContent).toContain("must stay readable");

    // The skills body never collides with the pinned install action.
    expect(body.right, "skills body clears the install action").toBeLessThanOrEqual(
        actions.left + 0.5,
    );

    await view.screenshot("PluginCatalogPanel.constrained.test");
}, 120_000);

it("disables the install action while an install is in flight", async () => {
    const view = createRenderer().render(
        () => (
            <div
                style={{ width: "760px", height: "240px", background: "#17161c", display: "flex" }}
            >
                <PluginCatalogPanel
                    busyShortNames={["hello"]}
                    data-testid="panel"
                    onOpenInstall={() => undefined}
                    plugins={[HELLO, RUNNER]}
                />
            </div>
        ),
        { width: 760, height: 240 },
    );
    await view.ready();

    const button = (shortName: string) =>
        view.$(`${card(shortName)} .happy2-plugin-catalog-panel__card-actions button`)
            .element as HTMLButtonElement;
    expect(button("hello").disabled, "busy install disabled").toBe(true);
    expect(button("hello").textContent).toContain("Installing…");
    expect(button("task-runner").disabled, "idle install enabled").toBe(false);
}, 120_000);

it("renders the install dialog with masked variables, image selection, grouped permissions, and submit gating", async () => {
    const closed: number[] = [];
    const submitted: number[] = [];
    const changes: [string, string][] = [];
    const images: string[] = [];
    const permissionToggles: [string, boolean][] = [];
    const view = createRenderer()
        .render(
            () => (
                <Frame>
                    <PluginCatalogPanel
                        containerImageOptions={[
                            { value: "img-1", label: "daycare-full" },
                            { value: "img-2", label: "daycare-minimal" },
                        ]}
                        data-testid="empty-draft"
                        draftPermissions={[]}
                        draftValues={{}}
                        installOpen="task-runner"
                        onCloseInstall={() => closed.push(1)}
                        onDraftContainerImageChange={(value) => images.push(value)}
                        onDraftPermissionToggle={(id, checked) =>
                            permissionToggles.push([id, checked])
                        }
                        onDraftValueChange={(key, value) => changes.push([key, value])}
                        onSubmitInstall={() => submitted.push(1)}
                        plugins={[RUNNER]}
                    />
                </Frame>
            ),
            { width: 760, height: 560, padding: 0 },
        )
        .render(
            () => (
                <Frame>
                    <PluginCatalogPanel
                        containerImageOptions={[{ value: "img-1", label: "daycare-full" }]}
                        data-testid="filled-draft"
                        draftContainerImageId="img-1"
                        draftPermissions={["plugins:list"]}
                        draftValues={{ RUNNER_TOKEN: "secret-value" }}
                        installOpen="task-runner"
                        onSubmitInstall={() => submitted.push(2)}
                        plugins={[RUNNER]}
                    />
                </Frame>
            ),
            { width: 760, height: 560, padding: 0 },
        )
        .render(
            () => (
                <Frame height={460}>
                    <PluginCatalogPanel
                        data-testid="no-config"
                        installOpen="hello"
                        onSubmitInstall={() => submitted.push(3)}
                        plugins={[HELLO]}
                    />
                </Frame>
            ),
            { width: 760, height: 460, padding: 0 },
        );
    await view.ready();

    // The dialog is hosted by the shared ModalOverlay (fixed, dimmed scrim).
    const overlay = view.$('[data-testid="empty-draft"] [data-happy2-ui="modal-overlay"]');
    expect(
        overlay.computedStyles(["position", "display", "align-items", "justify-content"]),
    ).toEqual({
        position: "fixed",
        display: "flex",
        "align-items": "center",
        "justify-content": "center",
    });
    expect(overlay.computedStyle("background-color")).toBe("rgba(0, 0, 0, 0.6)");
    // Contained by the transformed Frame, the overlay covers it exactly.
    expect(overlay.bounds()).toMatchObject({ width: 760, height: 560 });

    // Empty draft: the secret value field is masked, the image select empty,
    // and submit gated on the required variable and container image.
    const secretInput = view
        .$('[data-testid="empty-draft"]')
        .element.querySelector<HTMLInputElement>("input")!;
    expect(secretInput.value).toBe("");
    expect(secretInput.type, "secret variables are masked").toBe("password");
    expect(modalSubmit(view, "empty-draft").disabled, "submit gated on empty draft").toBe(true);
    secretInput.value = "token";
    secretInput.dispatchEvent(new Event("input", { bubbles: true }));
    expect(changes.at(-1)).toEqual(["RUNNER_TOKEN", "token"]);
    const select = view
        .$('[data-testid="empty-draft"]')
        .element.querySelector<HTMLSelectElement>("select")!;
    select.value = "img-2";
    select.dispatchEvent(new Event("change", { bubbles: true }));
    expect(images.at(-1)).toBe("img-2");

    // Permissions are grouped by access class with a checkbox each; nothing is
    // preselected for a fresh install draft, and toggling emits one intent.
    const groupLabels = Array.from(
        view
            .$('[data-testid="empty-draft"] .happy2-plugin-catalog-panel__permissions')
            .element.querySelectorAll(".happy2-plugin-catalog-panel__permission-group-label"),
        (node) => node.textContent,
    );
    expect(groupLabels).toEqual(["Read only", "Can make changes"]);
    const permissionRow = (testId: string, permissionId: string) =>
        view.$(
            `[data-testid="${testId}"] [data-permission-id="${permissionId}"] [data-happy2-ui="checkbox-control"]`,
        ).element as HTMLInputElement;
    expect(permissionRow("empty-draft", "plugins:list").checked).toBe(false);
    expect(permissionRow("empty-draft", "plugins:install").checked).toBe(false);
    permissionRow("empty-draft", "plugins:install").click();
    expect(permissionToggles.at(-1)).toEqual(["plugins:install", true]);
    // Install is never blocked by permissions: submit is gated only on variables.
    expect(modalSubmit(view, "empty-draft").disabled, "permissions never block install").toBe(true);

    // Filled draft: value, image, and a preselected permission mirror the props;
    // submit enables and fires.
    expect(permissionRow("filled-draft", "plugins:list").checked).toBe(true);
    const filledSubmit = modalSubmit(view, "filled-draft");
    expect(filledSubmit.disabled, "submit enabled with a full draft").toBe(false);
    filledSubmit.click();
    expect(submitted).toEqual([2]);

    // A no-configuration package (no variables, container, or permissions)
    // explains itself and submits immediately.
    expect(
        view.$('[data-testid="no-config"] .happy2-plugin-catalog-panel__form-note').element
            .textContent,
    ).toContain("This package needs no configuration.");
    expect(
        view
            .$('[data-testid="no-config"]')
            .element.querySelectorAll(
                '[data-happy2-ui="modal-dialog"] input, [data-happy2-ui="modal-dialog"] select',
            ).length,
        "no fields for a no-configuration package",
    ).toBe(0);
    expect(modalSubmit(view, "no-config").disabled).toBe(false);

    // Cancel closes via callback.
    modalCancel(view, "empty-draft").click();
    expect(closed).toEqual([1]);

    await view.screenshot("PluginCatalogPanel.install.test");
}, 120_000);

it("edits an installation grant set through an accessible permissions dialog", async () => {
    const opened: string[] = [];
    const toggles: [string, boolean][] = [];
    const saved: number[] = [];
    const closed: number[] = [];
    const view = createRenderer()
        .render(
            () => (
                <Frame height={320}>
                    <PluginCatalogPanel
                        data-testid="cards"
                        onOpenPermissions={(id) => opened.push(id)}
                        plugins={[PROJECT_SEARCH]}
                    />
                </Frame>
            ),
            { width: 760, height: 320, padding: 0 },
        )
        .render(
            () => (
                <Frame>
                    <PluginCatalogPanel
                        data-testid="editing"
                        draftPermissions={["plugins:list", "plugins:install"]}
                        onClosePermissions={() => closed.push(1)}
                        onDraftPermissionToggle={(id, checked) => toggles.push([id, checked])}
                        onSubmitPermissions={() => saved.push(1)}
                        permissionsOpen="ins-3"
                        plugins={[PROJECT_SEARCH]}
                    />
                </Frame>
            ),
            { width: 760, height: 560, padding: 0 },
        )
        .render(
            () => (
                <Frame>
                    <PluginCatalogPanel
                        data-testid="saving"
                        draftPermissions={["plugins:list"]}
                        onSubmitPermissions={() => saved.push(2)}
                        permissionsBusyInstallationIds={["ins-3"]}
                        permissionsOpen="ins-3"
                        plugins={[PROJECT_SEARCH]}
                    />
                </Frame>
            ),
            { width: 760, height: 560, padding: 0 },
        );
    await view.ready();

    // Each installation exposes an accessible Permissions action keyed by id,
    // labelled with its current grant count.
    const trigger = view
        .$('[data-testid="cards"] [data-installation-id="ins-3"]')
        .element.querySelector<HTMLButtonElement>("button")!;
    expect(trigger.textContent).toContain("Permissions · 2");
    trigger.click();
    expect(opened).toEqual(["ins-3"]);

    // The editor dialog pre-checks the current grant set and reflects toggles.
    const control = (testId: string, permissionId: string) =>
        view.$(
            `[data-testid="${testId}"] [data-permission-id="${permissionId}"] [data-happy2-ui="checkbox-control"]`,
        ).element as HTMLInputElement;
    expect(control("editing", "plugins:list").checked).toBe(true);
    expect(control("editing", "plugins:install").checked).toBe(true);
    expect(control("editing", "plugins:uninstall").checked).toBe(false);
    control("editing", "plugins:uninstall").click();
    expect(toggles.at(-1)).toEqual(["plugins:uninstall", true]);

    // Save fires the typed submit; cancel closes.
    const save = modalFooterButton(view, "editing", "Save permissions");
    expect(save.disabled).toBe(false);
    save.click();
    expect(saved).toEqual([1]);
    modalFooterButton(view, "editing", "Cancel").click();
    expect(closed).toEqual([1]);

    // While a save is in flight the checkboxes and save action lock.
    expect(control("saving", "plugins:list").disabled, "in-flight checkbox disabled").toBe(true);
    const savingButton = modalFooterButton(view, "saving", "Saving…");
    expect(savingButton.disabled, "in-flight save disabled").toBe(true);

    await view.screenshot("PluginCatalogPanel.permissions.test");
}, 120_000);

it("shows loading, error, and empty affordances", async () => {
    const view = createRenderer()
        .render(
            () => (
                <div
                    style={{
                        width: "560px",
                        height: "200px",
                        background: "#17161c",
                        display: "flex",
                    }}
                >
                    <PluginCatalogPanel data-testid="loading" loading plugins={[]} />
                </div>
            ),
            { width: 560, height: 200, padding: 0 },
        )
        .render(
            () => (
                <div
                    style={{
                        width: "560px",
                        height: "200px",
                        background: "#17161c",
                        display: "flex",
                    }}
                >
                    <PluginCatalogPanel
                        data-testid="error"
                        error="You must be a server administrator."
                        plugins={[]}
                    />
                </div>
            ),
            { width: 560, height: 200, padding: 0 },
        )
        .render(
            () => (
                <div
                    style={{
                        width: "560px",
                        height: "220px",
                        background: "#17161c",
                        display: "flex",
                    }}
                >
                    <PluginCatalogPanel data-testid="empty" plugins={[]} />
                </div>
            ),
            { width: 560, height: 220, padding: 0 },
        );
    await view.ready();

    // Loading: an empty-state, no cards.
    expect(
        view.$('[data-testid="loading"]').element.querySelector('[data-happy2-ui="empty-state"]'),
        "loading empty-state",
    ).not.toBeNull();
    expect(
        view
            .$('[data-testid="loading"]')
            .element.querySelector(".happy2-plugin-catalog-panel__card"),
        "no cards while loading",
    ).toBeNull();

    // Error: a danger banner replaces the list entirely.
    const errorBanner = view.$('[data-testid="error"] [data-happy2-ui="banner"]');
    expect(errorBanner.element.getAttribute("data-tone")).toBe("danger");
    expect(errorBanner.element.textContent).toContain("You must be a server administrator.");

    // Empty (loaded, zero packages): the catalog empty-state.
    expect(
        view.$('[data-testid="empty"] [data-happy2-ui="empty-state"]').element.textContent,
    ).toContain("No plugins yet");

    await view.screenshot("PluginCatalogPanel.variants.test");
}, 120_000);

function modalSubmit(view: View, testId: string): HTMLButtonElement {
    return modalFooterButton(view, testId, "Install plugin");
}

function modalCancel(view: View, testId: string): HTMLButtonElement {
    return modalFooterButton(view, testId, "Cancel");
}

function modalFooterButton(view: View, testId: string, label: string): HTMLButtonElement {
    const buttons = view
        .$(`[data-testid="${testId}"] [data-happy2-ui="modal-footer"]`)
        .element.querySelectorAll<HTMLButtonElement>("button");
    const match = Array.from(buttons).find((button) => button.textContent?.includes(label));
    if (!match) throw new Error(`No “${label}” button in the ${testId} modal footer.`);
    return match;
}
