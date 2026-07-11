export type Workspace = {
  id: string;
  mark: string;
  name: string;
  markClass: string;
};

type WorkspaceRailProps = {
  activeWorkspaceId: string;
  onWorkspaceChange: (workspaceId: string) => void;
  workspaces: Workspace[];
};

export function WorkspaceRail(props: WorkspaceRailProps) {
  return (
    <aside
      class="flex w-[84px] shrink-0 flex-col items-center border-r border-[#e1e7da]/10 bg-[#070908]/25 py-[22px]"
      aria-label="Workspace switcher"
    >
      <a
        class="grid h-11 w-11 place-items-center rounded-[14px] border border-[#e9eee4]/15 bg-[#252d27] font-serif text-xl font-bold text-[#eef2e9] shadow-[0_10px_24px_rgb(0_0_0_/_20%)]"
        href="#workspace"
        aria-label="Rigged home"
      >
        R
      </a>

      <nav class="mt-8 flex flex-col gap-3" aria-label="Workspaces">
        {props.workspaces.map((workspace) => {
          const isActive = () => props.activeWorkspaceId === workspace.id;

          return (
            <button
              class={`relative grid h-11 w-11 place-items-center rounded-[14px] border-0 bg-transparent p-0 transition hover:bg-[#ebf0e5]/10 focus-visible:bg-[#ebf0e5]/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#c7ed5f] ${isActive() ? "bg-[#ebf0e5]/10" : ""}`}
              type="button"
              aria-label={workspace.name}
              aria-pressed={isActive()}
              onClick={() => props.onWorkspaceChange(workspace.id)}
            >
              {isActive() && (
                <span
                  class="absolute -left-[19px] h-6 w-[3px] rounded-r bg-[#c7ed5f]"
                  aria-hidden="true"
                />
              )}
              <span
                class={`grid place-items-center border border-transparent font-sans text-sm font-extrabold tracking-[-0.03em] text-[#151816] shadow-[inset_0_1px_0_rgb(255_255_255_/_25%),0_5px_12px_rgb(0_0_0_/_16%)] transition ${workspace.markClass} ${isActive() ? "h-11 w-11 rounded-[14px] border-white/40" : "h-9 w-9 rounded-xl"}`}
                aria-hidden="true"
              >
                {workspace.mark}
              </span>
            </button>
          );
        })}
      </nav>
    </aside>
  );
}
