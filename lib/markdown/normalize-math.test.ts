import assert from "node:assert/strict";
import test from "node:test";
import { normalizeMathDelimiters } from "./normalize-math";

test("normalizes ChatGPT-style inline and display math delimiters", () => {
  assert.equal(
    normalizeMathDelimiters("Inline \\(x^2 + y^2\\) and display \\[\\int_0^1 x\\,dx\\]."),
    "Inline $x^2 + y^2$ and display \n$$\n\\int_0^1 x\\,dx\n$$\n.",
  );
});

test("leaves inline and fenced code examples untouched", () => {
  const markdown = "Use `\\(literal\\)` here.\n```tex\n\\[x + y\\]\n```\nThen \\(real\\).";
  assert.equal(
    normalizeMathDelimiters(markdown),
    "Use `\\(literal\\)` here.\n```tex\n\\[x + y\\]\n```\nThen $real$.",
  );
});

test("preserves existing dollar-delimited math", () => {
  assert.equal(normalizeMathDelimiters("$E=mc^2$ and $$x^2$$"), "$E=mc^2$ and $$x^2$$");
});
