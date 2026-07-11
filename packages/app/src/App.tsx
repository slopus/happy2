import { createSignal } from "solid-js";
import { WorkspaceRail, type Workspace } from "./components/WorkspaceRail";

const workspaces: Workspace[] = [
  { id: "rigged", name: "Rigged", mark: "R", markClass: "bg-[#f29d83]" },
  { id: "northstar", name: "Northstar", mark: "N", markClass: "bg-[#b9db58]" },
  { id: "orbit", name: "Orbit", mark: "O", markClass: "bg-[#79bedc]" }
];

function SearchIcon() {
  return (
    <svg
      class="h-4 w-4 shrink-0 fill-none stroke-current stroke-[1.7]"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle cx="10.8" cy="10.8" r="5.8" />
      <path d="m15.2 15.2 4.1 4.1" />
    </svg>
  );
}

export function App() {
  const [activeWorkspaceId, setActiveWorkspaceId] = createSignal("rigged");
  const [query, setQuery] = createSignal("");
  const activeWorkspace = () =>
    workspaces.find((workspace) => workspace.id === activeWorkspaceId()) ?? workspaces[0]!;

  return (
    <main class="flex min-h-screen min-w-[1024px] overflow-hidden bg-[#111413] font-sans text-[#e8e9e4]">
      <WorkspaceRail
        workspaces={workspaces}
        activeWorkspaceId={activeWorkspaceId()}
        onWorkspaceChange={setActiveWorkspaceId}
      />

      <section class="flex min-w-0 flex-1 flex-col gap-[18px] px-[26px] py-[22px] pb-[26px]" aria-label={`${activeWorkspace().name} workspace`}>
        <header class="flex h-[50px] shrink-0 items-center">
          <label class="flex h-11 w-[580px] items-center gap-2.5 rounded-[13px] border border-[#e1e7da]/10 bg-[#1e2320] px-[14px] py-0 text-[#9da49d] shadow-[inset_0_1px_0_rgb(255_255_255_/_2%)] transition focus-within:border-[#c7ed5f]/50 focus-within:bg-[#202621] focus-within:text-[#c7ed5f] focus-within:ring-3 focus-within:ring-[#c7ed5f]/10">
            <SearchIcon />
            <input
              class="min-w-0 flex-1 border-0 bg-transparent text-sm text-[#f0f2eb] outline-0 placeholder:text-[#778078]"
              aria-label="Search the workspace"
              type="search"
              value={query()}
              placeholder="Search projects, files, and commands"
              onInput={(event) => setQuery(event.currentTarget.value)}
            />
            <kbd class="rounded-md border border-[#e1e7da]/10 bg-[#e1e7da]/5 px-1.5 py-0.5 font-mono text-[0.66rem] text-[#9fa79f]">
              ⌘ K
            </kbd>
          </label>
        </header>

        <section
          class="flex min-h-[620px] flex-1 flex-col rounded-[23px] border border-[#e1e7da]/16 bg-[#1b201e] p-12 shadow-[0_23px_50px_rgb(0_0_0_/_17%),inset_0_1px_0_rgb(255_255_255_/_3%)]"
          id="workspace"
          aria-labelledby="workspace-heading"
        >
          <p class="m-0 text-[0.68rem] font-extrabold uppercase tracking-[0.12em] text-[#aeb5aa]">
            Workspace · {activeWorkspace().name}
          </p>
          <h1
            class="mt-3 font-serif text-5xl font-semibold tracking-[-0.055em] text-[#f4f5ef]"
            id="workspace-heading"
          >
            {activeWorkspace().name}
          </h1>
          <p class="mt-3 text-[0.98rem] text-[#9a9f98]">
            {query()
              ? `Searching ${activeWorkspace().name} for “${query()}”`
              : "Use search to find projects, files, and commands."}
          </p>
        </section>
      </section>
    </main>
  );
}
