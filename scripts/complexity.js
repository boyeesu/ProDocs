import fs from "node:fs";
import path from "node:path";
import babelParser from "@babel/parser";

const FILE_LIMIT = 109;
const FUNCTION_LIMIT = 52;

function files(directory) {
  return fs
    .readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) return files(target);
      return entry.isFile() && entry.name.endsWith(".js") ? [target] : [];
    })
    .sort();
}

function increment(node) {
  return [
    "IfStatement",
    "ForStatement",
    "ForInStatement",
    "ForOfStatement",
    "WhileStatement",
    "DoWhileStatement",
    "CatchClause",
    "ConditionalExpression"
  ].includes(node.type) ||
    (node.type === "SwitchCase" && node.test) ||
    (node.type === "LogicalExpression" && ["&&", "||", "??"].includes(node.operator));
}

function analyze(file) {
  const ast = babelParser.parse(fs.readFileSync(file, "utf8"), {
    sourceType: "unambiguous",
    errorRecovery: false,
    plugins: ["jsx", "typescript", "importAttributes"]
  });
  let fileComplexity = 1;
  let maximumFunction = 1;
  const functionStack = [];

  function visit(node) {
    if (!node || typeof node !== "object") return;
    const isFunction = [
      "FunctionDeclaration",
      "FunctionExpression",
      "ArrowFunctionExpression",
      "ObjectMethod",
      "ClassMethod"
    ].includes(node.type);
    if (isFunction) functionStack.push(1);
    if (increment(node)) {
      fileComplexity += 1;
      if (functionStack.length) functionStack[functionStack.length - 1] += 1;
    }
    for (const [key, value] of Object.entries(node)) {
      if (["loc", "start", "end", "extra", "errors"].includes(key)) continue;
      if (Array.isArray(value)) value.forEach(visit);
      else if (value && typeof value === "object" && value.type) visit(value);
    }
    if (isFunction) maximumFunction = Math.max(maximumFunction, functionStack.pop());
  }

  visit(ast.program);
  return { file, fileComplexity, maximumFunction };
}

const results = files("src").map(analyze);
const violations = results.filter(
  (item) => item.fileComplexity > FILE_LIMIT || item.maximumFunction > FUNCTION_LIMIT
);
if (violations.length) {
  for (const item of violations) {
    console.error(
      `${item.file}: file complexity ${item.fileComplexity}/${FILE_LIMIT}, max function ${item.maximumFunction}/${FUNCTION_LIMIT}`
    );
  }
  process.exitCode = 1;
} else {
  const maximumFile = Math.max(...results.map((item) => item.fileComplexity));
  const maximumFunction = Math.max(...results.map((item) => item.maximumFunction));
  console.log(
    `Complexity ratchet passed for ${results.length} files; maximum file ${maximumFile}/${FILE_LIMIT}, function ${maximumFunction}/${FUNCTION_LIMIT}.`
  );
}
