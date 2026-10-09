function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

// tsconfig is JSON with comments and trailing commas. Strip only those tokens,
// preserving quoted strings (including URLs and escaped quotes); never eval it.
export function parseConfig(contents) {
  const characters = contents.replace(/^\uFEFF/, "").split("");
  let quoted = false;
  for (let index = 0; index < characters.length; index += 1) {
    const character = characters[index];
    if (quoted) {
      if (character === "\\") index += 1;
      else if (character === '"') quoted = false;
    } else if (character === '"') {
      quoted = true;
    } else if (character === "/" && characters[index + 1] === "/") {
      while (index < characters.length && !/[\r\n]/.test(characters[index])) {
        characters[index++] = " ";
      }
      index -= 1;
    } else if (character === "/" && characters[index + 1] === "*") {
      characters[index++] = " ";
      characters[index++] = " ";
      while (
        index < characters.length &&
        !(characters[index] === "*" && characters[index + 1] === "/")
      ) {
        if (!/[\r\n]/.test(characters[index])) characters[index] = " ";
        index += 1;
      }
      if (index >= characters.length) throw new Error("Unterminated block comment.");
      characters[index++] = " ";
      characters[index] = " ";
    }
  }

  quoted = false;
  for (let index = 0; index < characters.length; index += 1) {
    const character = characters[index];
    if (quoted) {
      if (character === "\\") index += 1;
      else if (character === '"') quoted = false;
    } else if (character === '"') {
      quoted = true;
    } else if (character === ",") {
      let next = index + 1;
      while (next < characters.length && /[ \t\r\n]/.test(characters[next])) next += 1;
      let previous = index - 1;
      while (previous >= 0 && /[ \t\r\n]/.test(characters[previous])) previous -= 1;
      if (
        (characters[next] === "}" || characters[next] === "]") &&
        !["{", "[", ","].includes(characters[previous])
      ) characters[index] = " ";
    }
  }
  const document = JSON.parse(characters.join(""));
  if (!isObject(document)) throw new Error("TypeScript configuration must be an object.");
  return document;
}

