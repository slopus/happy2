import type { ClientWorkspace } from "happy2-state";
import type { FileTreeNode } from "./ChatPageComponents.js";

export function workspaceNodes(
    workspace: ClientWorkspace,
    expanded: ReadonlySet<string>,
    loading: ReadonlySet<string>,
): FileTreeNode[] {
    const statusByPath = new Map(workspace.gitStatus.map((entry) => [entry.path, entry.status]));
    const incomplete = new Set(
        workspace.directories
            .filter((directory) => !directory.complete)
            .map((directory) => directory.directory),
    );
    const roots: FileTreeNode[] = [];
    const directories = new Map<string, FileTreeNode>();
    for (const path of workspace.paths) {
        const directory = path.endsWith("/");
        const segments = (directory ? path.slice(0, -1) : path).split("/");
        let siblings = roots;
        let prefix = "";
        segments.forEach((segment, index) => {
            if (index === segments.length - 1 && !directory) {
                const filePath = prefix + segment;
                siblings.push({
                    id: filePath,
                    name: segment,
                    kind: "file",
                    gitStatus: statusByPath.get(filePath),
                });
                return;
            }
            const directoryPath = `${prefix}${segment}/`;
            let node = directories.get(directoryPath);
            if (!node) {
                node = { id: directoryPath, name: segment, kind: "directory", children: [] };
                directories.set(directoryPath, node);
                siblings.push(node);
            }
            siblings = node.children!;
            prefix = directoryPath;
        });
    }
    for (const [path, node] of directories) {
        node.gitStatus = statusByPath.get(path);
        node.expanded = expanded.has(path);
        node.loading = loading.has(path);
        node.hasMore = incomplete.has(path);
    }
    const sort = (nodes: FileTreeNode[]) => {
        nodes.sort((left, right) =>
            left.kind === right.kind
                ? left.name.localeCompare(right.name)
                : left.kind === "directory"
                  ? -1
                  : 1,
        );
        for (const node of nodes) if (node.children) sort(node.children);
        return nodes;
    };
    return sort(roots);
}
