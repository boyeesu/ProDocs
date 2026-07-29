import babelParser from "@babel/parser";
import { defineCollector } from "./contract.js";

const { parse } = babelParser;

function parserPlugins(filePath) {
  const extension = filePath.slice(filePath.lastIndexOf(".")).toLowerCase();
  const plugins = ["decorators-legacy", "importAttributes"];
  if (extension === ".jsx" || extension === ".tsx") plugins.push("jsx");
  if ([".ts", ".tsx", ".mts", ".cts"].includes(extension)) {
    plugins.push("typescript");
  }
  return plugins;
}

function location(node) {
  return node?.loc?.start?.line ?? 1;
}

function nodeName(node) {
  if (!node) return null;
  if (node.type === "Identifier") return node.name;
  if (
    node.type === "StringLiteral" ||
    node.type === "NumericLiteral" ||
    node.type === "BigIntLiteral"
  ) {
    return String(node.value);
  }
  if (node.type === "PrivateName") {
    const name = nodeName(node.id);
    return name ? `#${name}` : null;
  }
  return null;
}

function bindingNames(node, names = []) {
  if (!node) return names;
  if (node.type === "Identifier") {
    names.push(node.name);
  } else if (node.type === "RestElement") {
    bindingNames(node.argument, names);
  } else if (node.type === "AssignmentPattern") {
    bindingNames(node.left, names);
  } else if (node.type === "ObjectPattern") {
    for (const property of node.properties) {
      if (property.type === "RestElement") bindingNames(property.argument, names);
      else bindingNames(property.value, names);
    }
  } else if (node.type === "ArrayPattern") {
    for (const element of node.elements) bindingNames(element, names);
  }
  return names;
}

function staticSpecifier(node) {
  if (!node) return null;
  if (node.type === "StringLiteral") return node.value;
  if (
    node.type === "TemplateLiteral" &&
    node.expressions.length === 0 &&
    node.quasis.length === 1
  ) {
    return node.quasis[0].value.cooked ?? node.quasis[0].value.raw;
  }
  return null;
}

function diagnosticFrom(error) {
  return {
    severity: "error",
    code: String(error.reasonCode ?? error.code ?? "BABEL_PARSE_ERROR"),
    message: String(error.message ?? "JavaScript/TypeScript parse error."),
    line: error.loc?.line ?? 1,
    column: (error.loc?.column ?? 0) + 1
  };
}

function isAstNode(value) {
  return Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      typeof value.type === "string"
  );
}

function collectAst(ast) {
  const symbols = [];
  const imports = [];

  function addSymbol(name, kind, node) {
    if (!name) return;
    symbols.push({ name, kind, line: location(node) });
  }

  function addImport(specifier, node) {
    if (!specifier) return;
    imports.push({ specifier, line: location(node) });
  }

  function visit(node, context = { container: null, topLevel: false }) {
    if (!isAstNode(node)) return;
    let childContext = context;

    switch (node.type) {
      case "FunctionDeclaration":
        addSymbol(nodeName(node.id) ?? "default", "function", node);
        break;
      case "ClassDeclaration": {
        const name = nodeName(node.id) ?? "default";
        addSymbol(name, "class", node);
        childContext = { ...context, container: name };
        break;
      }
      case "TSInterfaceDeclaration": {
        const name = nodeName(node.id);
        addSymbol(name, "type", node);
        childContext = { ...context, container: name };
        break;
      }
      case "TSTypeAliasDeclaration":
      case "TSEnumDeclaration":
        addSymbol(nodeName(node.id), "type", node);
        break;
      case "TSModuleDeclaration": {
        const name = nodeName(node.id);
        addSymbol(name, "namespace", node);
        childContext = { ...context, container: name };
        break;
      }
      case "VariableDeclaration":
        if (context.topLevel) {
          for (const declaration of node.declarations) {
            for (const name of bindingNames(declaration.id)) {
              addSymbol(name, "value", declaration);
            }
          }
        }
        break;
      case "ClassMethod":
      case "ClassPrivateMethod":
      case "TSDeclareMethod":
      case "TSMethodSignature": {
        const name = nodeName(node.key);
        if (name && context.container) {
          const kind = node.kind === "constructor" ? "constructor" : "method";
          addSymbol(`${context.container}.${name}`, kind, node);
        }
        break;
      }
      case "ImportDeclaration":
      case "ExportNamedDeclaration":
      case "ExportAllDeclaration":
        addImport(staticSpecifier(node.source), node.source ?? node);
        break;
      case "TSImportEqualsDeclaration":
        if (node.moduleReference?.type === "TSExternalModuleReference") {
          addImport(
            staticSpecifier(node.moduleReference.expression),
            node.moduleReference.expression
          );
        }
        break;
      case "ImportExpression":
        addImport(staticSpecifier(node.source), node.source ?? node);
        break;
      case "CallExpression":
        if (
          node.callee?.type === "Identifier" &&
          node.callee.name === "require"
        ) {
          addImport(staticSpecifier(node.arguments[0]), node.arguments[0] ?? node);
        } else if (node.callee?.type === "Import") {
          addImport(staticSpecifier(node.arguments[0]), node.arguments[0] ?? node);
        }
        break;
      default:
        break;
    }

    for (const [key, value] of Object.entries(node)) {
      if (
        key === "loc" ||
        key === "start" ||
        key === "end" ||
        key === "errors" ||
        key === "comments" ||
        key === "tokens"
      ) {
        continue;
      }
      if (Array.isArray(value)) {
        for (const child of value) {
          if (isAstNode(child)) {
            visit(child, {
              ...childContext,
              topLevel:
                node.type === "Program" ||
                (context.topLevel &&
                  (node.type === "ExportNamedDeclaration" ||
                    node.type === "ExportDefaultDeclaration"))
            });
          }
        }
      } else if (isAstNode(value)) {
        visit(value, {
          ...childContext,
          topLevel:
            node.type === "Program" ||
            (context.topLevel &&
              (node.type === "ExportNamedDeclaration" ||
                node.type === "ExportDefaultDeclaration"))
        });
      }
    }
  }

  visit(ast.program);
  return { symbols, imports };
}

export const javascriptTypeScriptCollector = defineCollector({
  id: "babel-javascript-typescript",
  version: 1,
  languages: ["JavaScript", "TypeScript"],
  extensions: [".js", ".jsx", ".mjs", ".cjs", ".ts", ".tsx", ".mts", ".cts"],
  collect({ source, filePath }) {
    let ast;
    try {
      ast = parse(source, {
        sourceFilename: filePath,
        sourceType: "unambiguous",
        allowAwaitOutsideFunction: true,
        allowReturnOutsideFunction: true,
        createImportExpressions: true,
        errorRecovery: true,
        plugins: parserPlugins(filePath)
      });
    } catch (error) {
      return {
        symbols: [],
        imports: [],
        diagnostics: [diagnosticFrom(error)]
      };
    }
    const evidence = collectAst(ast);
    return {
      ...evidence,
      diagnostics: ast.errors.map(diagnosticFrom)
    };
  }
});
