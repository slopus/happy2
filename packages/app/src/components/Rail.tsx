import type { JSX, ParentProps } from "solid-js";
import { Avatar } from "./Avatar";

type FeatureIconName = "home" | "agents" | "tasks" | "files" | "more";

export type Feature = {
  id: string;
  icon: FeatureIconName;
  name: string;
};

type RailProps = ParentProps<{
  activeFeatureId: string;
  features: Feature[];
  onFeatureChange: (featureId: string) => void;
  onQueryChange: (query: string) => void;
  query: string;
  showWindowControls: boolean;
  sidebar: JSX.Element;
}>;

function SearchIcon() {
  return (
    <svg
      class="h-3.5 w-3.5 shrink-0 fill-none stroke-current stroke-[1.8]"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle cx="10.8" cy="10.8" r="5.8" />
      <path d="m15.2 15.2 4.1 4.1" />
    </svg>
  );
}

function FeatureIcon(props: { name: FeatureIconName }) {
  const iconClass = "h-[21px] w-[21px] fill-none stroke-current stroke-[1.8]";

  switch (props.name) {
    case "home":
      return (
        <svg class={iconClass} viewBox="0 0 24 24" aria-hidden="true">
          <path d="m4 10 8-6.5 8 6.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 19Z" />
          <path d="M9.5 20.5v-6h5v6" />
        </svg>
      );
    case "agents":
      return (
        <svg class={iconClass} viewBox="0 0 24 24" aria-hidden="true">
          <path d="M8.2 18.8a7.5 7.5 0 1 1 3.8 1.1L7.3 22l.9-3.2Z" />
          <path d="M8.5 10.8h.01M12 10.8h.01M15.5 10.8h.01" stroke-linecap="round" />
        </svg>
      );
    case "tasks":
      return (
        <svg class={iconClass} viewBox="0 0 24 24" aria-hidden="true">
          <rect x="4" y="3.5" width="16" height="17" rx="2.5" />
          <path d="m8 9 1.4 1.4L12 7.8M14 9h2.5M8 15h8.5" />
        </svg>
      );
    case "files":
      return (
        <svg class={iconClass} viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6 3.5h8l4 4V20a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1Z" />
          <path d="M14 3.5V8h4M8.5 12h7M8.5 16h5" />
        </svg>
      );
    case "more":
      return (
        <svg class="h-[21px] w-[21px] fill-current" viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="5.5" cy="12" r="1.5" />
          <circle cx="12" cy="12" r="1.5" />
          <circle cx="18.5" cy="12" r="1.5" />
        </svg>
      );
  }
}

function ArrowIcon(props: { direction: "back" | "forward" }) {
  const direction = props.direction === "back" ? "M14.5 6 8.5 12l6 6" : "m9.5 6 6 6-6 6";

  return (
    <svg class="h-4 w-4 fill-none stroke-current stroke-[1.7]" viewBox="0 0 24 24" aria-hidden="true">
      <path d={direction} stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  );
}

export function Rail(props: RailProps) {
  return (
    <main class="app-rail grid h-screen min-h-[704px] min-w-[1024px] grid-cols-[76px_288px_minmax(0,1fr)] grid-rows-[38px_minmax(0,1fr)] overflow-hidden font-sans text-[#292426]">
      <header
        class="col-span-3 col-start-1 row-start-1 grid h-[38px] min-w-0 grid-cols-[76px_88px_minmax(0,1fr)_88px] items-center"
        aria-label="Window navigation"
      >
        <div
          class="flex items-center justify-center gap-[6px]"
          data-testid={props.showWindowControls ? "window-controls" : undefined}
          aria-hidden="true"
        >
          {props.showWindowControls && (
            <>
              <span class="h-[9px] w-[9px] rounded-full bg-[#ff695e] shadow-[inset_0_0_0_0.5px_rgb(90_16_21_/_28%)]" />
              <span class="h-[9px] w-[9px] rounded-full bg-[#ffbd44] shadow-[inset_0_0_0_0.5px_rgb(90_55_7_/_25%)]" />
              <span class="h-[9px] w-[9px] rounded-full bg-[#30c553] shadow-[inset_0_0_0_0.5px_rgb(7_70_27_/_25%)]" />
            </>
          )}
        </div>

        <div class="flex items-center gap-1 text-white/65">
          <button
            class="grid h-7 w-7 place-items-center rounded-md border-0 bg-transparent p-0 transition hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-white"
            type="button"
            aria-label="Go back"
          >
            <ArrowIcon direction="back" />
          </button>
          <button
            class="grid h-7 w-7 place-items-center rounded-md border-0 bg-transparent p-0 transition hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-white"
            type="button"
            aria-label="Go forward"
          >
            <ArrowIcon direction="forward" />
          </button>
        </div>

        <label class="mx-auto flex h-[26px] w-[min(430px,46vw)] items-center gap-2 rounded-[7px] border border-white/15 bg-black/14 px-2.5 text-white/70 shadow-[inset_0_1px_1px_rgb(33_7_35_/_18%)] transition focus-within:border-white/35 focus-within:bg-black/20 focus-within:text-white focus-within:ring-2 focus-within:ring-white/10">
          <SearchIcon />
          <input
            class="min-w-0 flex-1 border-0 bg-transparent text-center text-[0.72rem] font-medium text-white outline-0 placeholder:text-white/65"
            aria-label="Search Rigged"
            type="search"
            value={props.query}
            placeholder="Search Rigged"
            onInput={(event) => props.onQueryChange(event.currentTarget.value)}
          />
        </label>

        <div class="flex justify-center">
          <button
            class="grid h-7 w-7 place-items-center rounded-full border border-white/35 bg-transparent p-0 text-xs font-bold text-white/80 transition hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-white"
            type="button"
            aria-label="Help"
          >
            ?
          </button>
        </div>
      </header>

      <aside
        class="col-start-1 row-start-2 flex min-h-0 w-[76px] flex-col items-center overflow-hidden pb-3 pt-3"
        aria-label="Feature rail"
      >
        <a
          class="relative grid h-10 w-10 place-items-center rounded-[11px] border border-white/35 bg-[linear-gradient(145deg,#ffd348_0%,#ff7b43_48%,#e63589_100%)] font-serif text-lg font-black text-white shadow-[0_8px_18px_rgb(24_8_36_/_25%),inset_0_1px_0_rgb(255_255_255_/_45%)] transition hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          href="#feature"
          aria-label="Rigged home"
        >
          R
          <span
            class="absolute -right-1 -top-1 h-3 w-3 rounded-full border-2 border-[#6d2a72] bg-[#45d17b]"
            aria-hidden="true"
          />
        </a>

        <nav class="mt-4 flex w-full flex-col items-center gap-1" aria-label="Features">
          {props.features.map((feature) => {
            const isActive = () => props.activeFeatureId === feature.id;

            return (
              <button
                class={`group flex h-[54px] w-[62px] flex-col items-center justify-center gap-1 rounded-[9px] border-0 p-0 text-white transition focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-white ${isActive() ? "bg-white/24 shadow-[inset_0_1px_0_rgb(255_255_255_/_16%)]" : "bg-transparent text-white/72 hover:bg-white/9 hover:text-white"}`}
                type="button"
                aria-label={feature.name}
                aria-pressed={isActive()}
                onClick={() => props.onFeatureChange(feature.id)}
              >
                <FeatureIcon name={feature.icon} />
                <span class="text-[0.61rem] font-semibold leading-none tracking-[-0.01em]">
                  {feature.name}
                </span>
              </button>
            );
          })}
        </nav>

        <button
          class="mt-auto rounded-full border-0 bg-transparent p-0 shadow-[0_7px_17px_rgb(28_8_37_/_24%)] transition hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          type="button"
          aria-label="Open profile"
        >
          <Avatar
            backgroundClass="bg-[radial-gradient(circle_at_68%_25%,#f7cf70_0_18%,transparent_19%),linear-gradient(145deg,#3ca8a4_0%,#3265a8_48%,#dc4d78_100%)]"
            initials="ST"
            size="md"
            type="human"
          />
        </button>
      </aside>

      <div
        class="col-span-2 col-start-2 row-start-2 m-2 grid min-h-[620px] min-w-0 grid-cols-[288px_minmax(0,1fr)] overflow-hidden rounded-[14px] border border-white/20 bg-white shadow-[0_12px_34px_rgb(30_7_38_/_18%)]"
        data-testid="content-shell"
      >
        <div class="min-h-0 min-w-0 overflow-hidden">
          {props.sidebar}
        </div>

        <div class="flex min-h-0 min-w-0 flex-col overflow-hidden border-l border-[#ded7df] bg-white">
          {props.children}
        </div>
      </div>
    </main>
  );
}
