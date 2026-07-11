import { createEffect, createMemo, createSignal, For, Show } from "solid-js";
import { Avatar } from "./Avatar";

type DiffLine = {
    id: string;
    newNumber?: number;
    oldNumber?: number;
    text: string;
    type: "add" | "context" | "remove";
};

type ReviewFile = {
    additions: number;
    deletions: number;
    id: string;
    lines: DiffLine[];
    name: string;
    path: string;
    status: "added" | "modified";
};

type ReviewComment = {
    fileId: string;
    id: string;
    lineId: string;
    text: string;
};

type ReviewState = "approved" | "changes-requested" | "pending";
export type ReviewTab = "changes" | "checks";

type ChangeReviewWorkspaceProps = {
    activeFileId: string;
    activeTab: ReviewTab;
    onFileChange: (fileId: string) => void;
    onTabChange: (tab: ReviewTab) => void;
    query: string;
};

const reviewFiles: ReviewFile[] = [
    {
        id: "workspace-creator",
        name: "WorkspaceCreator.tsx",
        path: "packages/app/src/workspace",
        additions: 32,
        deletions: 10,
        status: "modified",
        lines: [
            {
                id: "creator-14",
                oldNumber: 14,
                newNumber: 14,
                type: "context",
                text: "export function WorkspaceCreator(props: WorkspaceCreatorProps) {",
            },
            {
                id: "creator-remove-15",
                oldNumber: 15,
                type: "remove",
                text: '  const [workspaceName, setWorkspaceName] = createSignal("");',
            },
            {
                id: "creator-add-15",
                newNumber: 15,
                type: "add",
                text: "  const defaultName = () => deriveWorkspaceName(props.projectPath);",
            },
            {
                id: "creator-add-16",
                newNumber: 16,
                type: "add",
                text: "  const [workspaceName, setWorkspaceName] = createSignal(defaultName());",
            },
            { id: "creator-17", oldNumber: 16, newNumber: 17, type: "context", text: "" },
            {
                id: "creator-add-18",
                newNumber: 18,
                type: "add",
                text: "  const createWorkspace = () => {",
            },
            { id: "creator-add-19", newNumber: 19, type: "add", text: "    props.onCreate({" },
            {
                id: "creator-add-20",
                newNumber: 20,
                type: "add",
                text: '      name: workspaceName().trim() || "Untitled workspace",',
            },
            {
                id: "creator-add-21",
                newNumber: 21,
                type: "add",
                text: "      projectPath: props.projectPath",
            },
            { id: "creator-add-22", newNumber: 22, type: "add", text: "    });" },
            { id: "creator-add-23", newNumber: 23, type: "add", text: "  };" },
            { id: "creator-24", oldNumber: 17, newNumber: 24, type: "context", text: "" },
            { id: "creator-25", oldNumber: 18, newNumber: 25, type: "context", text: "  return (" },
            {
                id: "creator-remove-26",
                oldNumber: 19,
                type: "remove",
                text: "    <WorkspaceNameStep value={workspaceName()} onChange={setWorkspaceName} />",
            },
            {
                id: "creator-add-26",
                newNumber: 26,
                type: "add",
                text: "    <ProjectSummary name={workspaceName()} path={props.projectPath} />",
            },
            { id: "creator-27", oldNumber: 20, newNumber: 27, type: "context", text: "  );" },
            { id: "creator-28", oldNumber: 21, newNumber: 28, type: "context", text: "}" },
        ],
    },
    {
        id: "workspace-header",
        name: "WorkspaceHeader.tsx",
        path: "packages/app/src/workspace",
        additions: 41,
        deletions: 12,
        status: "modified",
        lines: [
            {
                id: "header-8",
                oldNumber: 8,
                newNumber: 8,
                type: "context",
                text: "export function WorkspaceHeader(props: WorkspaceHeaderProps) {",
            },
            {
                id: "header-add-9",
                newNumber: 9,
                type: "add",
                text: "  const [isRenaming, setIsRenaming] = createSignal(false);",
            },
            {
                id: "header-add-10",
                newNumber: 10,
                type: "add",
                text: "  const [draftName, setDraftName] = createSignal(props.workspace.name);",
            },
            { id: "header-11", oldNumber: 9, newNumber: 11, type: "context", text: "" },
            { id: "header-add-12", newNumber: 12, type: "add", text: "  const saveName = () => {" },
            {
                id: "header-add-13",
                newNumber: 13,
                type: "add",
                text: '    props.onRename(draftName().trim() || "Untitled workspace");',
            },
            { id: "header-add-14", newNumber: 14, type: "add", text: "    setIsRenaming(false);" },
            { id: "header-add-15", newNumber: 15, type: "add", text: "  };" },
            { id: "header-16", oldNumber: 10, newNumber: 16, type: "context", text: "" },
            {
                id: "header-remove-17",
                oldNumber: 11,
                type: "remove",
                text: "  return <h1>{props.workspace.name}</h1>;",
            },
            { id: "header-add-17", newNumber: 17, type: "add", text: "  return isRenaming() ? (" },
            {
                id: "header-add-18",
                newNumber: 18,
                type: "add",
                text: "    <InlineWorkspaceName value={draftName()} onSave={saveName} />",
            },
            { id: "header-add-19", newNumber: 19, type: "add", text: "  ) : (" },
            {
                id: "header-add-20",
                newNumber: 20,
                type: "add",
                text: "    <button onClick={() => setIsRenaming(true)}>{props.workspace.name}</button>",
            },
            { id: "header-add-21", newNumber: 21, type: "add", text: "  );" },
            { id: "header-22", oldNumber: 12, newNumber: 22, type: "context", text: "}" },
        ],
    },
    {
        id: "workspace-test",
        name: "workspace.test.ts",
        path: "packages/app/src/workspace",
        additions: 29,
        deletions: 0,
        status: "added",
        lines: [
            {
                id: "test-add-1",
                newNumber: 1,
                type: "add",
                text: 'describe("workspace naming", () => {',
            },
            {
                id: "test-add-2",
                newNumber: 2,
                type: "add",
                text: '  it("derives the initial name from the project folder", () => {',
            },
            {
                id: "test-add-3",
                newNumber: 3,
                type: "add",
                text: '    expect(deriveWorkspaceName("/work/rigged")).toBe("rigged");',
            },
            { id: "test-add-4", newNumber: 4, type: "add", text: "  });" },
            { id: "test-add-5", newNumber: 5, type: "add", text: "" },
            {
                id: "test-add-6",
                newNumber: 6,
                type: "add",
                text: '  it("falls back when no folder name is available", () => {',
            },
            {
                id: "test-add-7",
                newNumber: 7,
                type: "add",
                text: '    expect(deriveWorkspaceName("")).toBe("Untitled workspace");',
            },
            { id: "test-add-8", newNumber: 8, type: "add", text: "  });" },
            { id: "test-add-9", newNumber: 9, type: "add", text: "" },
            {
                id: "test-add-10",
                newNumber: 10,
                type: "add",
                text: '  it("preserves an existing saved name", () => {',
            },
            {
                id: "test-add-11",
                newNumber: 11,
                type: "add",
                text: '    expect(resolveWorkspaceName(savedWorkspace)).toBe("Zagreb");',
            },
            { id: "test-add-12", newNumber: 12, type: "add", text: "  });" },
            { id: "test-add-13", newNumber: 13, type: "add", text: "});" },
        ],
    },
];

const checks = [
    { name: "App component tests", detail: "15 tests passed", duration: "1.5s" },
    { name: "TypeScript", detail: "3 projects checked", duration: "1.2s" },
    { name: "Desktop build", detail: "Renderer and main process", duration: "0.4s" },
    { name: "Workspace migration", detail: "4 compatibility fixtures", duration: "2.8s" },
];

const totalAdditions = reviewFiles.reduce((total, file) => total + file.additions, 0);
const totalDeletions = reviewFiles.reduce((total, file) => total + file.deletions, 0);
export const changeReviewFileItems = reviewFiles.map(
    ({ additions, deletions, id, name, path, status }) => ({
        additions,
        deletions,
        id,
        name,
        path,
        status,
    }),
);

function FileStatusIcon(props: { status: ReviewFile["status"] }) {
    return (
        <span
            class={`grid h-5 w-5 shrink-0 place-items-center rounded-[5px] font-mono text-[0.52rem] font-black ${props.status === "added" ? "bg-[#e1f0e5] text-[#347749]" : "bg-[#eee9f0] text-[#735b78]"}`}
        >
            {props.status === "added" ? "A" : "M"}
        </span>
    );
}

export function ChangeReviewWorkspace(props: ChangeReviewWorkspaceProps) {
    const [reviewState, setReviewState] = createSignal<ReviewState>("pending");
    const [comments, setComments] = createSignal<ReviewComment[]>([]);
    const [commentingLine, setCommentingLine] = createSignal<string>();
    const [commentDraft, setCommentDraft] = createSignal("");
    const [requestChangesOpen, setRequestChangesOpen] = createSignal(false);
    const [reviewNote, setReviewNote] = createSignal("");

    const visibleFiles = createMemo(() => {
        const normalizedQuery = props.query.trim().toLowerCase();
        if (!normalizedQuery) return reviewFiles;
        return reviewFiles.filter((file) =>
            `${file.path}/${file.name}`.toLowerCase().includes(normalizedQuery),
        );
    });
    const activeFile = createMemo(
        () => visibleFiles().find((file) => file.id === props.activeFileId) ?? visibleFiles()[0],
    );

    createEffect(() => {
        const file = activeFile();
        if (file && file.id !== props.activeFileId) props.onFileChange(file.id);
    });

    const beginComment = (fileId: string, lineId: string) => {
        setCommentingLine(`${fileId}:${lineId}`);
        setCommentDraft("");
    };
    const addComment = (fileId: string, lineId: string) => {
        const text = commentDraft().trim();
        if (!text) return;
        setComments((current) => [
            ...current,
            { id: `comment-${Date.now()}`, fileId, lineId, text },
        ]);
        setCommentingLine(undefined);
        setCommentDraft("");
    };
    const resetReview = () => {
        setReviewState("pending");
        setReviewNote("");
    };

    return (
        <section
            class="relative flex min-h-0 min-w-0 flex-1 flex-col bg-white"
            id="feature"
            aria-label="Change review workspace"
        >
            <header class="flex h-[72px] shrink-0 items-center justify-between border-b border-[#ded9df] px-5">
                <div class="min-w-0">
                    <div class="flex items-center gap-2.5">
                        <Avatar
                            backgroundClass="bg-[linear-gradient(145deg,#ef566d,#8056c7)]"
                            initials="F"
                            size="sm"
                            type="bot"
                        />
                        <div class="min-w-0">
                            <div class="flex items-center gap-2">
                                <h1 class="truncate font-serif text-[1.2rem] font-semibold tracking-[-0.035em] text-[#2f292e]">
                                    Review Forge’s changes
                                </h1>
                                <span
                                    class={`shrink-0 rounded-full px-2 py-1 text-[0.53rem] font-extrabold ${reviewState() === "approved" ? "bg-[#e3f1e7] text-[#347648]" : reviewState() === "changes-requested" ? "bg-[#f5e5e5] text-[#994b4b]" : "bg-[#f4e8d2] text-[#855f21]"}`}
                                >
                                    {reviewState() === "approved"
                                        ? "Approved"
                                        : reviewState() === "changes-requested"
                                          ? "Changes requested"
                                          : "Needs review"}
                                </span>
                            </div>
                            <p class="mt-0.5 truncate font-mono text-[0.56rem] text-[#8d858c]">
                                agent/forge/workspace-naming · default workspace names
                            </p>
                        </div>
                    </div>
                </div>

                <div class="ml-4 flex shrink-0 items-center gap-2">
                    <Show
                        when={reviewState() === "pending"}
                        fallback={
                            <button
                                class="h-8 rounded-[7px] border border-[#d3ccd4] bg-white px-3 text-[0.6rem] font-extrabold text-[#655c64] hover:bg-[#f4f1f4] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#6f4b92]"
                                type="button"
                                onClick={resetReview}
                            >
                                Reopen review
                            </button>
                        }
                    >
                        <button
                            class="h-8 rounded-[7px] border border-[#d0c8d1] bg-white px-3 text-[0.6rem] font-extrabold text-[#6b5555] hover:border-[#c99c9c] hover:bg-[#fcf4f4] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#995959]"
                            type="button"
                            onClick={() => setRequestChangesOpen(true)}
                        >
                            Request changes
                        </button>
                        <button
                            class="h-8 rounded-[7px] border border-[#37754a] bg-[#3f8254] px-3 text-[0.6rem] font-extrabold text-white shadow-[0_2px_5px_rgb(31_90_51_/_16%)] hover:bg-[#347346] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#347346]"
                            type="button"
                            onClick={() => setReviewState("approved")}
                        >
                            Approve changes
                        </button>
                    </Show>
                </div>
            </header>

            <nav
                class="flex h-10 shrink-0 items-end gap-5 border-b border-[#e3dfe4] px-5"
                aria-label="Review views"
            >
                <button
                    class={`h-full border-0 border-b-2 bg-transparent px-0 text-[0.64rem] font-extrabold ${props.activeTab === "changes" ? "border-[#6c4773] text-[#46364a]" : "border-transparent text-[#80787f] hover:text-[#4e464d]"}`}
                    type="button"
                    aria-pressed={props.activeTab === "changes"}
                    onClick={() => props.onTabChange("changes")}
                >
                    Changes{" "}
                    <span class="ml-1 rounded-full bg-[#eee9ef] px-1.5 py-0.5 text-[0.5rem]">
                        {reviewFiles.length}
                    </span>
                </button>
                <button
                    class={`h-full border-0 border-b-2 bg-transparent px-0 text-[0.64rem] font-extrabold ${props.activeTab === "checks" ? "border-[#6c4773] text-[#46364a]" : "border-transparent text-[#80787f] hover:text-[#4e464d]"}`}
                    type="button"
                    aria-pressed={props.activeTab === "checks"}
                    onClick={() => props.onTabChange("checks")}
                >
                    Checks{" "}
                    <span class="ml-1 rounded-full bg-[#e3f1e7] px-1.5 py-0.5 text-[0.5rem] text-[#357548]">
                        4/4
                    </span>
                </button>
            </nav>

            <Show when={props.activeTab === "changes"}>
                <div class="flex h-11 shrink-0 items-center gap-5 border-b border-[#e7e3e7] bg-[#faf9fa] px-5 text-[0.58rem] font-bold text-[#756d74]">
                    <span>{reviewFiles.length} changed files</span>
                    <span class="text-[#3c8050]">+{totalAdditions}</span>
                    <span class="text-[#a85151]">−{totalDeletions}</span>
                    <span class="h-4 w-px bg-[#ddd8de]" />
                    <span class="flex items-center gap-1.5 text-[#3f7d50]">
                        <span class="grid h-4 w-4 place-items-center rounded-full bg-[#dcecdf] text-[0.5rem] font-black">
                            ✓
                        </span>{" "}
                        All checks passed
                    </span>
                    <Show when={props.query.trim()}>
                        <span class="ml-auto rounded-md bg-[#eee9f0] px-2 py-1 text-[#705f75]">
                            Filtering files for “{props.query}”
                        </span>
                    </Show>
                </div>

                <main
                    class="min-h-0 min-w-0 flex-1 overflow-auto bg-[#f3f1f2] p-3"
                    aria-label="File diff"
                >
                    <Show
                        when={activeFile()}
                        fallback={
                            <div class="grid h-full place-items-center text-[0.68rem] text-[#8c848b]">
                                No file selected.
                            </div>
                        }
                    >
                        {(file) => (
                            <article
                                class="min-w-[520px] overflow-hidden rounded-[9px] border border-[#d5cfd6] bg-white shadow-[0_2px_8px_rgb(42_31_43_/_5%)]"
                                aria-label={`${file().name} unified diff`}
                            >
                                <header class="flex h-10 items-center gap-2 border-b border-[#ddd8de] bg-[#faf9fa] px-3">
                                    <FileStatusIcon status={file().status} />
                                    <div class="min-w-0 flex-1">
                                        <h2 class="truncate text-[0.62rem] font-extrabold text-[#3e373d]">
                                            {file().name}
                                        </h2>
                                        <p class="truncate font-mono text-[0.48rem] text-[#938b92]">
                                            {file().path}/{file().name}
                                        </p>
                                    </div>
                                    <span class="text-[0.52rem] font-bold text-[#3c8050]">
                                        +{file().additions}
                                    </span>
                                    <span class="text-[0.52rem] font-bold text-[#a85151]">
                                        −{file().deletions}
                                    </span>
                                </header>

                                <div class="border-b border-[#d8d1df] bg-[#f3eef6] px-3 py-1.5 font-mono text-[0.5rem] text-[#74657a]">
                                    @@ workspace naming flow @@
                                </div>

                                <div class="overflow-x-auto">
                                    <For each={file().lines}>
                                        {(line) => {
                                            const lineKey = `${file().id}:${line.id}`;
                                            const lineComments = () =>
                                                comments().filter(
                                                    (comment) =>
                                                        comment.fileId === file().id &&
                                                        comment.lineId === line.id,
                                                );
                                            const rowStyle =
                                                line.type === "add"
                                                    ? "bg-[#edf7ef]"
                                                    : line.type === "remove"
                                                      ? "bg-[#fbeeee]"
                                                      : "bg-white";
                                            const marker =
                                                line.type === "add"
                                                    ? "+"
                                                    : line.type === "remove"
                                                      ? "−"
                                                      : " ";
                                            return (
                                                <>
                                                    <div
                                                        class={`group grid min-h-6 grid-cols-[28px_34px_34px_minmax(0,1fr)] border-b border-[#eee9ed] font-mono text-[0.54rem] leading-6 ${rowStyle}`}
                                                    >
                                                        <button
                                                            class="grid place-items-center border-0 border-r border-[#e1dce1] bg-transparent p-0 text-[0.7rem] font-bold text-[#77537e] opacity-0 hover:bg-[#e7dfea] focus:opacity-100 focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-[#6f4b92] group-hover:opacity-100"
                                                            type="button"
                                                            aria-label={`Comment on ${file().name} line ${line.newNumber ?? line.oldNumber}`}
                                                            onClick={() =>
                                                                beginComment(file().id, line.id)
                                                            }
                                                        >
                                                            +
                                                        </button>
                                                        <span class="border-r border-[#e4dfe4] px-1 text-right tabular-nums text-[#aaa2a9]">
                                                            {line.oldNumber ?? ""}
                                                        </span>
                                                        <span class="border-r border-[#e4dfe4] px-1 text-right tabular-nums text-[#aaa2a9]">
                                                            {line.newNumber ?? ""}
                                                        </span>
                                                        <code class="whitespace-pre px-2 text-[#433d42]">
                                                            <span
                                                                class={`mr-2 select-none ${line.type === "add" ? "text-[#35804b]" : line.type === "remove" ? "text-[#a54b4b]" : "text-[#a29ba1]"}`}
                                                            >
                                                                {marker}
                                                            </span>
                                                            {line.text}
                                                        </code>
                                                    </div>

                                                    <Show when={commentingLine() === lineKey}>
                                                        <form
                                                            class="border-b border-[#ded6e1] bg-[#faf7fb] px-3 py-2.5 pl-[98px]"
                                                            onSubmit={(event) => {
                                                                event.preventDefault();
                                                                addComment(file().id, line.id);
                                                            }}
                                                        >
                                                            <textarea
                                                                class="block min-h-[58px] w-full resize-none rounded-[7px] border border-[#cfc6d1] bg-white px-2.5 py-2 text-[0.62rem] leading-4 text-[#3f373e] outline-none placeholder:text-[#999098] focus:border-[#76517e] focus:ring-2 focus:ring-[#76517e]/10"
                                                                aria-label="Review comment"
                                                                placeholder="Leave a focused comment on this line…"
                                                                value={commentDraft()}
                                                                onInput={(event) =>
                                                                    setCommentDraft(
                                                                        event.currentTarget.value,
                                                                    )
                                                                }
                                                            />
                                                            <div class="mt-2 flex justify-end gap-2">
                                                                <button
                                                                    class="h-7 rounded-md border border-[#d4cdd5] bg-white px-2.5 text-[0.55rem] font-extrabold text-[#6f666e] hover:bg-[#f2eff2]"
                                                                    type="button"
                                                                    onClick={() =>
                                                                        setCommentingLine(undefined)
                                                                    }
                                                                >
                                                                    Cancel
                                                                </button>
                                                                <button
                                                                    class="h-7 rounded-md border border-[#68456e] bg-[#704b76] px-2.5 text-[0.55rem] font-extrabold text-white hover:bg-[#5e3b64] disabled:border-[#d6d0d7] disabled:bg-[#ddd8de]"
                                                                    type="submit"
                                                                    disabled={
                                                                        !commentDraft().trim()
                                                                    }
                                                                >
                                                                    Add comment
                                                                </button>
                                                            </div>
                                                        </form>
                                                    </Show>

                                                    <For each={lineComments()}>
                                                        {(comment) => (
                                                            <div
                                                                class="flex items-start gap-2 border-b border-[#ded6e1] bg-[#faf7fb] px-3 py-2.5 pl-[98px]"
                                                                aria-label="Review comment by Steve"
                                                            >
                                                                <Avatar
                                                                    backgroundClass="bg-[linear-gradient(145deg,#3ca8a4,#4b5fb0_52%,#d14c78)]"
                                                                    initials="ST"
                                                                    size="xs"
                                                                    type="human"
                                                                />
                                                                <div>
                                                                    <p class="text-[0.56rem] font-extrabold text-[#4b4249]">
                                                                        Steve{" "}
                                                                        <span class="ml-1 font-medium text-[#9a9199]">
                                                                            Now
                                                                        </span>
                                                                    </p>
                                                                    <p class="mt-1 text-[0.6rem] leading-4 text-[#5d555c]">
                                                                        {comment.text}
                                                                    </p>
                                                                </div>
                                                            </div>
                                                        )}
                                                    </For>
                                                </>
                                            );
                                        }}
                                    </For>
                                </div>
                            </article>
                        )}
                    </Show>
                </main>
            </Show>

            <Show when={props.activeTab === "checks"}>
                <div
                    class="min-h-0 flex-1 overflow-y-auto bg-[#f5f3f5] p-5"
                    aria-label="Verification checks"
                >
                    <section class="mx-auto max-w-[760px] overflow-hidden rounded-[11px] border border-[#d9d4da] bg-white shadow-[0_3px_10px_rgb(43_33_44_/_5%)]">
                        <header class="flex items-center justify-between border-b border-[#e3dfe3] px-4 py-3.5">
                            <div>
                                <h2 class="font-serif text-[1rem] font-semibold text-[#332d32]">
                                    Verification evidence
                                </h2>
                                <p class="mt-1 text-[0.6rem] text-[#827a81]">
                                    All required checks completed against Forge’s branch.
                                </p>
                            </div>
                            <span class="flex items-center gap-1.5 rounded-full bg-[#e3f1e7] px-2.5 py-1 text-[0.56rem] font-extrabold text-[#347548]">
                                <span class="grid h-4 w-4 place-items-center rounded-full bg-[#55a56b] text-[0.48rem] text-white">
                                    ✓
                                </span>{" "}
                                4 passed
                            </span>
                        </header>

                        <For each={checks}>
                            {(check) => (
                                <article class="grid grid-cols-[28px_minmax(0,1fr)_80px] items-center gap-3 border-b border-[#ece8ec] px-4 py-3 last:border-b-0">
                                    <span class="grid h-6 w-6 place-items-center rounded-[7px] bg-[#e3f1e7] text-[0.65rem] font-black text-[#347548]">
                                        ✓
                                    </span>
                                    <div>
                                        <h3 class="text-[0.66rem] font-extrabold text-[#433c42]">
                                            {check.name}
                                        </h3>
                                        <p class="mt-0.5 text-[0.55rem] text-[#8b838a]">
                                            {check.detail}
                                        </p>
                                    </div>
                                    <span class="text-right font-mono text-[0.54rem] text-[#8e868d]">
                                        {check.duration}
                                    </span>
                                </article>
                            )}
                        </For>

                        <footer class="flex items-center gap-4 border-t border-[#dfd9df] bg-[#faf9fa] px-4 py-3 text-[0.54rem] font-bold text-[#7f777e]">
                            <span>Desktop · macOS</span>
                            <span>Node 22</span>
                            <span>Commit eb0fb8a</span>
                            <span class="ml-auto text-[#438157]">No regressions found</span>
                        </footer>
                    </section>
                </div>
            </Show>

            <Show when={requestChangesOpen()}>
                <div
                    class="absolute inset-0 z-30 grid place-items-center bg-[#2d2730]/28 px-6 backdrop-blur-[1px]"
                    role="presentation"
                >
                    <form
                        class="w-full max-w-[460px] overflow-hidden rounded-[12px] border border-[#cfc8d1] bg-white shadow-[0_22px_58px_rgb(42_27_45_/_24%)]"
                        role="dialog"
                        aria-label="Request changes"
                        onSubmit={(event) => {
                            event.preventDefault();
                            if (!reviewNote().trim()) return;
                            setReviewState("changes-requested");
                            setRequestChangesOpen(false);
                        }}
                    >
                        <div class="border-b border-[#e4dfe4] px-4 py-3.5">
                            <h2 class="font-serif text-[1rem] font-semibold text-[#342e33]">
                                Request changes from Forge
                            </h2>
                            <p class="mt-1 text-[0.6rem] text-[#827a81]">
                                Summarize what must change before this work can be approved.
                            </p>
                        </div>
                        <div class="px-4 py-4">
                            <textarea
                                class="block min-h-[100px] w-full resize-none rounded-[8px] border border-[#cec7cf] px-3 py-2.5 text-[0.68rem] leading-5 text-[#3d363c] outline-none placeholder:text-[#999098] focus:border-[#76517e] focus:ring-2 focus:ring-[#76517e]/10"
                                aria-label="Change request summary"
                                placeholder="Describe the required changes…"
                                value={reviewNote()}
                                onInput={(event) => setReviewNote(event.currentTarget.value)}
                            />
                        </div>
                        <div class="flex justify-end gap-2 border-t border-[#e4dfe4] bg-[#faf9fa] px-4 py-3">
                            <button
                                class="h-8 rounded-md border border-[#d2cbd3] bg-white px-3 text-[0.58rem] font-extrabold text-[#6d646c] hover:bg-[#f1eef1]"
                                type="button"
                                onClick={() => setRequestChangesOpen(false)}
                            >
                                Cancel
                            </button>
                            <button
                                class="h-8 rounded-md border border-[#9d5555] bg-[#a85a5a] px-3 text-[0.58rem] font-extrabold text-white hover:bg-[#944b4b] disabled:border-[#d7d1d7] disabled:bg-[#ded9de]"
                                type="submit"
                                disabled={!reviewNote().trim()}
                            >
                                Send change request
                            </button>
                        </div>
                    </form>
                </div>
            </Show>
        </section>
    );
}
