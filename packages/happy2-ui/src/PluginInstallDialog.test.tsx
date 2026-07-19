import { useState } from "react";
import { expect, it } from "vitest";
import "./theme.css";
import "./styles/icon.css";
import "./styles/button.css";
import "./styles/badge.css";
import "./styles/banner.css";
import "./styles/modal.css";
import "./styles/text-field.css";
import "./styles/form-row.css";
import "./styles/select.css";
import "./styles/plugin-install-dialog.css";
import {
    PluginInstallDialog,
    type PluginInstallDialogCandidate,
    type PluginInstallDialogSourceKind,
} from "./PluginInstallDialog";
import { createRenderer } from "./testing";

const ALPHA: PluginInstallDialogCandidate = {
    id: "token-alpha",
    displayName: "Alpha Tools",
    shortName: "alpha-tools",
    version: "1.4.0",
    description: "Project search and refactoring helpers.",
    sourceKind: "github",
    sourceReference: "https://github.com/example/toolbox",
    skills: [{ name: "alpha-search", description: "Searches the alpha index." }],
    variables: [
        {
            key: "ALPHA_API_TOKEN",
            displayName: "API token",
            description: "Token used by the MCP server.",
            kind: "secret",
        },
    ],
    mcp: { type: "stdio", container: "selection_required" },
};

const BETA: PluginInstallDialogCandidate = {
    id: "token-beta",
    displayName: "Beta Tools",
    shortName: "beta-tools",
    version: "0.9.2",
    description: "Release automation for the beta pipeline.",
    sourceKind: "github",
    sourceReference: "https://github.com/example/toolbox",
    skills: [],
    variables: [],
    mcp: { type: "remote", container: "none" },
};

const LINKED: PluginInstallDialogCandidate = {
    id: "token-linked",
    displayName: "Linked Tools",
    shortName: "linked-tools",
    version: "2.0.0",
    description: "A skills-only package downloaded from a ZIP URL.",
    sourceKind: "zip_url",
    sourceReference: "https://example.com/linked-tools.zip",
    skills: [{ name: "linked-lint", description: "Lints linked projects." }],
    variables: [],
};

function zipFile(name = "plugin.zip"): File {
    return new File([new Uint8Array([80, 75, 3, 4])], name, { type: "application/zip" });
}

it("holds the source step geometry, keyboard radio selection, and the file-picker boundary", async () => {
    const kinds: PluginInstallDialogSourceKind[] = [];
    const archives: string[] = [];
    const cleared: number[] = [];
    function Harness() {
        const [kind, setKind] = useState<PluginInstallDialogSourceKind>("upload");
        const [archive, setArchive] = useState<{ name: string; size: number }>();
        return (
            <div
                style={{ width: "720px", height: "460px", background: "#f5f5f5", display: "flex" }}
            >
                <PluginInstallDialog
                    archive={archive}
                    data-testid="dialog"
                    onArchiveClear={() => {
                        cleared.push(1);
                        setArchive(undefined);
                    }}
                    onArchiveSelect={(file) => {
                        archives.push(file.name);
                        setArchive({ name: file.name, size: file.size });
                    }}
                    onSourceKindChange={(next) => {
                        kinds.push(next);
                        setKind(next);
                    }}
                    sourceKind={kind}
                    step={{ step: "source" }}
                    url=""
                />
            </div>
        );
    }
    const view = createRenderer().render(() => <Harness />, { width: 720, height: 460 });
    await view.ready();

    // Medium modal card, one body column with the 16px flow gap.
    const dialog = view.$('[data-happy2-ui="modal-dialog"]');
    expect(dialog.bounds().width).toBe(480);
    const body = view.$('[data-testid="plugin-install-body"]');
    expect(body.computedStyles(["display", "flex-direction", "gap", "box-sizing"])).toEqual({
        display: "flex",
        "flex-direction": "column",
        gap: "16px",
        "box-sizing": "border-box",
    });

    // Three equal radio source cards inside one radiogroup with an 8px gap.
    const group = view.$('[data-testid="plugin-install-sources"]');
    expect(group.element.getAttribute("role")).toBe("radiogroup");
    expect(group.computedStyles(["display", "gap"])).toEqual({ display: "flex", gap: "8px" });
    const radios = Array.from(group.element.querySelectorAll<HTMLButtonElement>('[role="radio"]'));
    expect(radios.map((radio) => radio.dataset.sourceKind)).toEqual([
        "upload",
        "zip_url",
        "github",
    ]);
    expect(radios.map((radio) => radio.getAttribute("aria-checked"))).toEqual([
        "true",
        "false",
        "false",
    ]);
    const widths = radios.map((radio) => radio.getBoundingClientRect().width);
    expect(Math.abs(widths[0]! - widths[1]!)).toBeLessThanOrEqual(1);
    expect(Math.abs(widths[1]! - widths[2]!)).toBeLessThanOrEqual(1);
    // Roving tabindex: only the checked radio is tabbable.
    expect(radios.map((radio) => radio.tabIndex)).toEqual([0, -1, -1]);

    // Arrow keys move the selection and the focus together, wrapping around.
    radios[0]!.focus();
    radios[0]!.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    await view.ready();
    expect(kinds).toEqual(["zip_url"]);
    const zipRadio = view.$('[data-source-kind="zip_url"]');
    expect(document.activeElement).toBe(zipRadio.element);
    expect(zipRadio.element.getAttribute("aria-checked")).toBe("true");
    zipRadio.element.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }),
    );
    await view.ready();
    expect(kinds).toEqual(["zip_url", "upload"]);

    // The upload boundary is a hidden native file input; selecting a ZIP shows
    // the archive row with a mono formatted size, and clearing removes it.
    const input = view.container.querySelector<HTMLInputElement>(
        '[data-testid="plugin-install-file-input"]',
    )!;
    expect(input.type).toBe("file");
    expect(input.accept).toBe(".zip,application/zip");
    // A cancelled native picker fires change with no files and must be a no-op.
    input.dispatchEvent(new Event("change", { bubbles: true }));
    await view.ready();
    expect(archives).toEqual([]);
    const transfer = new DataTransfer();
    transfer.items.add(zipFile("project-search.zip"));
    input.files = transfer.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
    await view.ready();
    expect(archives).toEqual(["project-search.zip"]);
    const archiveRow = view.$('[data-testid="plugin-install-archive"]');
    expect(archiveRow.element.textContent).toContain("project-search.zip");
    expect(archiveRow.element.textContent).toContain("4 B");
    expect(
        view.$(".happy2-plugin-install-dialog__archive-size").computedStyle("font-family"),
    ).toContain("happy2 Mono");
    archiveRow.element
        .querySelector<HTMLButtonElement>('[aria-label="Remove selected ZIP"]')!
        .click();
    await view.ready();
    expect(cleared).toEqual([1]);
    expect(view.container.querySelector('[data-testid="plugin-install-archive"]')).toBeNull();

    await view.screenshot("PluginInstallDialog.source.test");
}, 120_000);

it("shows deterministic preparation progress with cancellation and terminal failure retry", async () => {
    const cancelled: number[] = [];
    const retried: number[] = [];
    const view = createRenderer()
        .render(
            () => (
                <div
                    style={{
                        width: "720px",
                        height: "380px",
                        background: "#f5f5f5",
                        display: "flex",
                    }}
                >
                    <PluginInstallDialog
                        data-testid="downloading"
                        onCancelPrepare={() => cancelled.push(1)}
                        sourceKind="zip_url"
                        step={{
                            step: "preparing",
                            progress: {
                                stage: "downloading",
                                detail: "Downloading plugin archive",
                                receivedBytes: 2_097_152,
                                totalBytes: 8_388_608,
                            },
                        }}
                        url="https://example.com/plugin.zip"
                    />
                </div>
            ),
            { width: 720, height: 380 },
        )
        .render(
            () => (
                <div
                    style={{
                        width: "720px",
                        height: "380px",
                        background: "#f5f5f5",
                        display: "flex",
                    }}
                >
                    <PluginInstallDialog
                        data-testid="verifying"
                        onCancelPrepare={() => undefined}
                        sourceKind="upload"
                        step={{
                            step: "preparing",
                            progress: { stage: "verifying", detail: "Verifying package structure" },
                        }}
                        url=""
                    />
                </div>
            ),
            { width: 720, height: 380 },
        )
        .render(
            () => (
                <div
                    style={{
                        width: "720px",
                        height: "360px",
                        background: "#f5f5f5",
                        display: "flex",
                    }}
                >
                    <PluginInstallDialog
                        data-testid="failed"
                        onRetry={() => retried.push(1)}
                        sourceKind="zip_url"
                        step={{
                            step: "failed",
                            error: "A plugin ZIP must contain exactly one plugin.json",
                            canRetry: true,
                        }}
                        url="https://example.com/plugin.zip"
                    />
                </div>
            ),
            { width: 720, height: 360 },
        );
    await view.ready();

    // The byte-driven bar renders its exact percentage; the track is a 6px pill.
    const downloading = view.$('[data-testid="downloading"]');
    const track = downloading.element.querySelector('[data-testid="plugin-install-progress"]')!;
    expect(track.getAttribute("role")).toBe("progressbar");
    expect(track.getAttribute("aria-valuenow")).toBe("25");
    const trackBounds = track.getBoundingClientRect();
    expect(trackBounds.height).toBe(6);
    const fill = track.querySelector(".happy2-plugin-install-dialog__progress-fill")!;
    expect(
        Math.abs(fill.getBoundingClientRect().width - trackBounds.width * 0.25),
    ).toBeLessThanOrEqual(1);
    expect(downloading.element.textContent).toContain("Downloading package");
    expect(downloading.element.textContent).toContain("2.0 MiB of 8.0 MiB");
    downloading.element
        .querySelector<HTMLButtonElement>('[data-testid="plugin-install-cancel-prepare"]')!
        .click();
    expect(cancelled).toEqual([1]);

    // Verification without byte totals shows the dimmed indeterminate fill.
    const verifying = view.$('[data-testid="verifying"]');
    const verifyingFill = verifying.element.querySelector<HTMLElement>(
        '[data-indeterminate="true"]',
    )!;
    expect(getComputedStyle(verifyingFill).opacity).toBe("0.35");
    expect(
        verifying.element
            .querySelector('[data-testid="plugin-install-progress"]')!
            .getAttribute("aria-valuenow"),
    ).toBeNull();
    expect(verifying.element.textContent).toContain("Verifying package");

    // A terminal failure keeps the message visible and retries through the footer.
    const failed = view.$('[data-testid="failed"]');
    const banner = failed.element.querySelector('[data-testid="plugin-install-failure"]')!;
    expect(banner.textContent).toContain("A plugin ZIP must contain exactly one plugin.json");
    failed.element
        .querySelector<HTMLButtonElement>('[data-testid="plugin-install-retry"]')!
        .click();
    expect(retried).toEqual([1]);

    await view.screenshot("PluginInstallDialog.progress.test");
}, 120_000);

it("navigates the candidate listbox with the keyboard and chooses one candidate", async () => {
    const chosen: string[] = [];
    const view = createRenderer().render(
        () => (
            <div
                style={{ width: "720px", height: "460px", background: "#f5f5f5", display: "flex" }}
            >
                <PluginInstallDialog
                    data-testid="dialog"
                    onCandidateChoose={(id) => chosen.push(id)}
                    sourceKind="github"
                    step={{ step: "choose", candidates: [ALPHA, BETA] }}
                    url="https://github.com/example/toolbox"
                />
            </div>
        ),
        { width: 720, height: 460 },
    );
    await view.ready();

    const listbox = view.$('[data-testid="plugin-install-candidates"]');
    expect(listbox.element.getAttribute("role")).toBe("listbox");
    const options = Array.from(
        listbox.element.querySelectorAll<HTMLButtonElement>('[role="option"]'),
    );
    expect(options.map((option) => option.dataset.candidateId)).toEqual([
        "token-alpha",
        "token-beta",
    ]);
    // Roving tabindex starts on the first candidate.
    expect(options.map((option) => option.tabIndex)).toEqual([0, -1]);
    expect(options[0]!.getAttribute("aria-selected")).toBe("true");

    options[0]!.focus();
    options[0]!.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    await view.ready();
    expect(document.activeElement).toBe(options[1]);
    expect(options[1]!.getAttribute("aria-selected")).toBe("true");
    expect(options[1]!.tabIndex).toBe(0);
    // ArrowDown wraps back to the first candidate.
    options[1]!.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    await view.ready();
    expect(document.activeElement).toBe(options[0]);

    options[0]!.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(chosen).toEqual(["token-alpha"]);
    options[1]!.click();
    expect(chosen).toEqual(["token-alpha", "token-beta"]);

    await view.screenshot("PluginInstallDialog.candidates.test");
}, 120_000);

it("previews the verified candidate, masks secrets, gates install, and surfaces install errors", async () => {
    const installed: number[] = [];
    const values: [string, string][] = [];
    const view = createRenderer()
        .render(
            () => (
                <div
                    style={{
                        width: "720px",
                        height: "660px",
                        background: "#f5f5f5",
                        display: "flex",
                    }}
                >
                    <PluginInstallDialog
                        containerImageOptions={[{ value: "img-1", label: "daycare-full" }]}
                        data-testid="empty-draft"
                        draftValues={{}}
                        onDraftValueChange={(key, value) => values.push([key, value])}
                        onInstall={() => installed.push(1)}
                        sourceKind="github"
                        step={{ step: "configure", candidate: ALPHA, candidateCount: 2 }}
                        url="https://github.com/example/toolbox"
                    />
                </div>
            ),
            { width: 720, height: 660 },
        )
        .render(
            () => (
                <div
                    style={{
                        width: "720px",
                        height: "660px",
                        background: "#f5f5f5",
                        display: "flex",
                    }}
                >
                    <PluginInstallDialog
                        containerImageOptions={[{ value: "img-1", label: "daycare-full" }]}
                        data-testid="filled-draft"
                        draftContainerImageId="img-1"
                        draftValues={{ ALPHA_API_TOKEN: "secret-value" }}
                        onInstall={() => installed.push(2)}
                        sourceKind="github"
                        step={{ step: "configure", candidate: ALPHA, candidateCount: 2 }}
                        url="https://github.com/example/toolbox"
                    />
                </div>
            ),
            { width: 720, height: 660 },
        )
        .render(
            () => (
                <div
                    style={{
                        width: "720px",
                        height: "620px",
                        background: "#f5f5f5",
                        display: "flex",
                    }}
                >
                    <PluginInstallDialog
                        data-testid="conflict"
                        installError="This remote plugin has changed since its installed snapshot"
                        sourceKind="zip_url"
                        step={{ step: "configure", candidate: LINKED, candidateCount: 1 }}
                        url="https://example.com/linked-tools.zip"
                    />
                </div>
            ),
            { width: 720, height: 620 },
        )
        .render(
            () => (
                <div
                    style={{
                        width: "720px",
                        height: "660px",
                        background: "#f5f5f5",
                        display: "flex",
                    }}
                >
                    <PluginInstallDialog
                        containerImageOptions={[{ value: "img-1", label: "daycare-full" }]}
                        data-testid="installing"
                        draftContainerImageId="img-1"
                        draftValues={{ ALPHA_API_TOKEN: "secret-value" }}
                        sourceKind="github"
                        step={{ step: "installing", candidate: ALPHA }}
                        url="https://github.com/example/toolbox"
                    />
                </div>
            ),
            { width: 720, height: 660 },
        );
    await view.ready();

    // Verified preview: name, mono version, source badge, reference, skill, MCP badges.
    const preview = view.$('[data-testid="empty-draft"] [data-testid="plugin-install-preview"]');
    expect(
        preview.element.querySelector('[data-happy2-ui="plugin-install-preview-name"]')!
            .textContent,
    ).toBe("Alpha Tools");
    expect(preview.element.textContent).toContain("v1.4.0");
    const badges = Array.from(
        preview.element.querySelectorAll('[data-happy2-ui="badge-label"]'),
        (node) => node.textContent,
    );
    expect(badges).toEqual(["GitHub", "MCP · stdio", "Container image required"]);
    expect(preview.element.textContent).toContain("https://github.com/example/toolbox");
    const skills = view.$('[data-testid="empty-draft"] [data-testid="plugin-install-skills"]');
    expect(skills.element.textContent).toContain("alpha-search");
    expect(skills.element.textContent).toContain("Searches the alpha index.");
    // The 40px thumb slot renders even before any PNG exists.
    const thumb = view.$('[data-testid="empty-draft"] [data-happy2-ui="plugin-install-thumb"]');
    expect(thumb.bounds().width).toBe(40);
    expect(thumb.bounds().height).toBe(40);

    // The secret is a masked password input; typing routes the draft callback.
    const secret = view.container.querySelector<HTMLInputElement>(
        '[data-testid="empty-draft"] [data-testid="plugin-install-preview"] input',
    )!;
    expect(secret.type).toBe("password");
    secret.value = "typed";
    secret.dispatchEvent(new Event("input", { bubbles: true }));
    expect(values).toEqual([["ALPHA_API_TOKEN", "typed"]]);

    // Install gates on both the declared variable and the container image.
    const submit = (testId: string) =>
        view.container.querySelector<HTMLButtonElement>(
            `[data-testid="${testId}"] [data-testid="plugin-install-submit"]`,
        )!;
    expect(submit("empty-draft").disabled).toBe(true);
    expect(submit("filled-draft").disabled).toBe(false);
    submit("filled-draft").click();
    expect(installed).toEqual([2]);
    // The Back action appears only for multi-candidate repositories.
    expect(
        view.container.querySelector(
            '[data-testid="filled-draft"] [data-testid="plugin-install-back"]',
        ),
    ).not.toBeNull();
    expect(
        view.container.querySelector(
            '[data-testid="conflict"] [data-testid="plugin-install-back"]',
        ),
    ).toBeNull();

    // A terminal install failure renders inside the configure step for retry.
    expect(
        view.$('[data-testid="conflict"] [data-testid="plugin-install-error"]').element.textContent,
    ).toContain("has changed since its installed snapshot");
    // Without declared variables the preview states that no configuration is needed.
    expect(view.$('[data-testid="conflict"]').element.textContent).toContain(
        "needs no configuration",
    );

    // While installing, the submit action shows progress and every field disables.
    expect(submit("installing").disabled).toBe(true);
    expect(submit("installing").textContent).toContain("Installing…");
    expect(
        view.container.querySelector<HTMLInputElement>('[data-testid="installing"] input')!
            .disabled,
    ).toBe(true);
    expect(
        Array.from(
            view.container.querySelectorAll<HTMLButtonElement>(
                '[data-testid="installing"] [data-happy2-ui="modal-footer"] button',
            ),
        ).every((button) => button.disabled),
    ).toBe(true);
    expect(
        view.container.querySelector('[data-testid="installing"] .happy2-modal__close'),
    ).toBeNull();

    await view.screenshot("PluginInstallDialog.configure.test");
}, 120_000);
