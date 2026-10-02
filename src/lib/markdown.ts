function replaceLineDelimiters(line: string): string {
  let result = "";
  let inlineCodeTicks = 0;

  for (let index = 0; index < line.length; ) {
    if (line[index] === "`") {
      let runLength = 1;
      while (line[index + runLength] === "`") {
        runLength += 1;
      }

      if (inlineCodeTicks === 0) {
        inlineCodeTicks = runLength;
      } else if (inlineCodeTicks === runLength) {
        inlineCodeTicks = 0;
      }

      result += line.slice(index, index + runLength);
      index += runLength;
      continue;
    }

    const next = line[index + 1];
    if (
      inlineCodeTicks === 0 &&
      line[index] === "\\" &&
      (next === "(" || next === ")" || next === "[" || next === "]")
    ) {
      let precedingSlashes = 0;
      for (let cursor = index - 1; cursor >= 0 && line[cursor] === "\\"; cursor -= 1) {
        precedingSlashes += 1;
      }

      if (precedingSlashes % 2 === 0) {
        result += next === "[" || next === "]" ? "$$" : "$";
        index += 2;
        continue;
      }
    }

    result += line[index];
    index += 1;
  }

  return result;
}

export function normalizeLatexDelimiters(markdown: string): string {
  let fence: { character: string; length: number } | null = null;

  return markdown
    .split("\n")
    .map((line) => {
      const fenceMatch = line.match(/^\s*(`{3,}|~{3,})/);
      if (fenceMatch) {
        const marker = fenceMatch[1];
        if (!fence) {
          fence = { character: marker[0], length: marker.length };
        } else if (
          marker[0] === fence.character &&
          marker.length >= fence.length
        ) {
          fence = null;
        }
        return line;
      }

      return fence ? line : replaceLineDelimiters(line);
    })
    .join("\n");
}
