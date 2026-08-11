import assert from "node:assert/strict";
import test from "node:test";

import { renderMarkdownDocument } from "../public/markdown-preview.js";

class TestNode {
  constructor(tagName = "#text", text = "") {
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.className = "";
    this.attributes = new Map();
    this.value = text;
    this.classList = { add: (...names) => { this.className = [this.className, ...names].filter(Boolean).join(" "); } };
  }

  append(...children) {
    this.children.push(...children);
  }

  replaceChildren(...children) {
    this.children = [...children];
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  set textContent(value) {
    this.value = String(value);
    this.children = [];
  }

  get textContent() {
    return this.tagName === "#TEXT" ? this.value : `${this.value || ""}${this.children.map((child) => child.textContent).join("")}`;
  }
}

test("renders assistant-style Markdown blocks instead of exposing fence markers", () => {
  const previousDocument = globalThis.document;
  globalThis.document = {
    createElement: (tagName) => new TestNode(tagName),
    createTextNode: (value) => new TestNode("#text", String(value)),
  };

  try {
    const container = new TestNode("article");
    renderMarkdownDocument(container, [
      "## Result",
      "",
      "A **formatted** response.",
      "",
      "```text",
      "line one",
      "line two",
      "```",
      "",
      "- first",
      "- second",
    ].join("\n"));

    assert.deepEqual(container.children.map((child) => child.tagName), ["H2", "P", "FIGURE", "UL"]);
    const codeFigure = container.children[2];
    assert.equal(codeFigure.className, "markdown-code-block");
    assert.equal(codeFigure.children[0].tagName, "FIGCAPTION");
    assert.equal(codeFigure.children[0].textContent, "text");
    assert.equal(codeFigure.children[1].children[0].textContent, "line one\nline two");
    assert.equal(container.textContent.includes("```"), false);
  } finally {
    globalThis.document = previousDocument;
  }
});

test("renders inline and block formulas without interpreting fenced code as math", () => {
  const previousDocument = globalThis.document;
  const previousKatex = globalThis.katex;
  globalThis.document = {
    createElement: (tagName) => new TestNode(tagName),
    createTextNode: (value) => new TestNode("#text", String(value)),
  };
  globalThis.katex = {
    render: (value, element, options) => {
      element.setAttribute("data-display", options.displayMode);
      element.textContent = `MATH:${value}`;
    },
  };

  try {
    const container = new TestNode("article");
    renderMarkdownDocument(container, [
      "Energy is $E = mc^2$.",
      "",
      "Angles use \\(a^2+b^2=c^2\\).",
      "",
      "设第 \\(k\\) 类量化策略根据公共数据 \\(x_{i,t}\\) 形成目标持仓。",
      "",
      "$$",
      "\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}",
      "$$",
      "",
      "```text",
      "$not_math$",
      "```",
    ].join("\n"));

    assert.deepEqual(container.children.map((child) => child.tagName), ["P", "P", "P", "DIV", "FIGURE"]);
    assert.equal(container.children[0].children.some((child) => child.className.includes("markdown-math-inline")), true);
    assert.equal(container.children[1].children.some((child) => child.className.includes("markdown-math-inline")), true);
    assert.deepEqual(container.children[2].children.filter((child) => child.className.includes("markdown-math-inline")).map((child) => child.textContent), ["MATH:k", "MATH:x_{i,t}"]);
    assert.equal(container.children[2].textContent, "设第 MATH:k 类量化策略根据公共数据 MATH:x_{i,t} 形成目标持仓。");
    assert.equal(container.children[3].attributes.get("data-display"), "true");
    assert.equal(container.children[3].textContent.includes("\\frac"), true);
    assert.equal(container.children[4].textContent, "text$not_math$");
  } finally {
    globalThis.document = previousDocument;
    globalThis.katex = previousKatex;
  }
});
