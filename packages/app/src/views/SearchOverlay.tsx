import { Show } from "solid-js";
import {
    EmptyState,
    SearchResults,
    type SearchResultGroup,
    type SearchResultItem,
    type SearchResultType,
} from "rigged-ui";

export type SearchOverlayProps = {
    query: string;
    groups: SearchResultGroup[];
    onSelect?: (type: SearchResultType, id: string) => void;
    onClose?: () => void;
};

/** Flattens a result's title (string or message segments) plus its meta into one
 * lowercase haystack so the overlay can match against everything the row shows. */
function itemHaystack(item: SearchResultItem): string {
    const title =
        typeof item.title === "string"
            ? item.title
            : item.title.map((segment) => segment.text).join(" ");
    return `${title} ${item.meta ?? ""}`.toLowerCase();
}

/** Narrows the mock/live result groups to items matching the trimmed needle,
 * dropping groups that end up empty so SearchResults only renders live sections. */
function filterGroups(groups: SearchResultGroup[], needle: string): SearchResultGroup[] {
    return groups
        .map((group) => ({
            type: group.type,
            results: group.results.filter((item) => itemHaystack(item).includes(needle)),
        }))
        .filter((group) => group.results.length > 0);
}

/**
 * Search results overlay driven by the shared TitleBar search value. A blank
 * query shows the priming EmptyState; a query filters `props.groups` and renders
 * the grouped SearchResults (channels · people · messages) with matches
 * highlighted, falling back to an EmptyState when nothing matches.
 */
export function SearchOverlay(props: SearchOverlayProps) {
    const needle = () => props.query.trim().toLowerCase();
    const groups = () => filterGroups(props.groups, needle());

    return (
        <Show
            when={needle()}
            fallback={
                <EmptyState
                    description="Matching channels, people, and messages appear here as you type."
                    icon="search"
                    title="Search"
                />
            }
        >
            <Show
                when={groups().length > 0}
                fallback={
                    <EmptyState
                        description={`No channels, people, or messages match “${props.query.trim()}”.`}
                        icon="search"
                        title="No results"
                    />
                }
            >
                <SearchResults groups={groups()} onSelect={props.onSelect} query={props.query} />
            </Show>
        </Show>
    );
}
