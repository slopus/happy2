import { createSignal } from "solid-js";
import { Rail, type Feature } from "./components/Rail";

const features: Feature[] = [
  { id: "home", name: "Home", icon: "home" },
  { id: "agents", name: "Agents", icon: "agents" },
  { id: "tasks", name: "Tasks", icon: "tasks" },
  { id: "files", name: "Files", icon: "files" },
  { id: "more", name: "More", icon: "more" }
];

type AppProps = {
  platform?: "desktop" | "web";
};

export function App(props: AppProps) {
  const [activeFeatureId, setActiveFeatureId] = createSignal("home");
  const [query, setQuery] = createSignal("");
  const activeFeature = () =>
    features.find((feature) => feature.id === activeFeatureId()) ?? features[0]!;

  return (
    <Rail
      features={features}
      activeFeatureId={activeFeatureId()}
      query={query()}
      onFeatureChange={setActiveFeatureId}
      onQueryChange={setQuery}
      showWindowControls={props.platform === "desktop"}
    >
      <section
        class="flex min-h-full min-w-0 flex-1 flex-col p-10"
        id="feature"
        aria-labelledby="feature-heading"
        aria-label={`${activeFeature().name} view`}
      >
        <p class="m-0 text-[0.68rem] font-extrabold uppercase tracking-[0.12em] text-[#aeb5aa]">
          Feature · {activeFeature().name}
        </p>
        <h1
          class="mt-3 font-serif text-[2.65rem] font-semibold tracking-[-0.05em] text-[#2b2528]"
          id="feature-heading"
        >
          {activeFeature().name}
        </h1>
        <p class="mt-3 text-[0.98rem] text-[#797175]">
          {query()
            ? `Searching ${activeFeature().name} for “${query()}”`
            : "Use search to find agents, tasks, files, and commands."}
        </p>
      </section>
    </Rail>
  );
}
