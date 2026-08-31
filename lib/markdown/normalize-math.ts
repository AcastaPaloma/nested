function normalizeOutsideInlineCode(line: string) {
  let result = "";
  let cursor = 0;
  let codeFenceLength = 0;

  while (cursor < line.length) {
    if (line[cursor] === "`") {
      let end = cursor;
      while (line[end] === "`") end += 1;
      const length = end - cursor;
      if (codeFenceLength === 0) codeFenceLength = length;
      else if (length === codeFenceLength) codeFenceLength = 0;
      result += line.slice(cursor, end);
      cursor = end;
      continue;
    }

    if (codeFenceLength === 0 && line[cursor] === "\\") {
      const delimiter = line[cursor + 1];
      if (delimiter === "(" || delimiter === ")") {
        result += "$";
        cursor += 2;
        continue;
      }
      if (delimiter === "[" || delimiter === "]") {
        result += "\n$$\n";
        cursor += 2;
        continue;
      }
    }

    result += line[cursor];
    cursor += 1;
  }

  return result;
}

/**
 * remark-math uses dollar delimiters, while Codex and ChatGPT frequently emit
 * the equivalent LaTeX \(...\) and \[...\] forms. Normalize only prose so
 * examples inside inline or fenced code remain exact.
 */
export function normalizeMathDelimiters(markdown: string) {
  let fenced = false;
  let marker = "";
  return markdown.split("\n").map((line) => {
    const match = line.match(/^\s*(`{3,}|~{3,})/);
    if (match) {
      const nextMarker = match[1][0];
      if (!fenced) {
        fenced = true;
        marker = nextMarker;
      } else if (nextMarker === marker) {
        fenced = false;
        marker = "";
      }
      return line;
    }
    return fenced ? line : normalizeOutsideInlineCode(line);
  }).join("\n");
}
