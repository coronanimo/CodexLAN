type Node = { type: string; value?: string; children?: Node[] };

// Standard Markdown parsing remains in remark. This last remark pass bounds the
// size of the tree handed to React/KaTeX, including pathological short input.
export function renderBudget(options: { preserveText?: boolean } = {}) {
  return (tree: Node, file: { value: unknown }) => {
    let count = 0, math = 0, formulas = 0, exceeded = false;
    const visit = (node: Node, depth: number) => {
      if (++count > 600 || depth > 20) { exceeded = true; return; }
      if (node.type === "math" || node.type === "inlineMath") {
        math += node.value?.length || 0;
        if (++formulas > 12 || (node.value?.length || 0) > 1000 || math > 2000) exceeded = true;
      }
      if (!exceeded) for (const child of node.children || []) { visit(child, depth + 1); if (exceeded) break; }
    };
    visit(tree, 0);
    if (exceeded) tree.children = options.preserveText ? [{ type: "code", value: String(file.value) }]
      : [{ type: "paragraph", children: [{ type: "text", value: String(file.value).slice(0, 2000) + "\n…内容较复杂，完整内容请查看输出或下载。" }] }];
  };
}
