import fs from "node:fs";
import { VERSION } from "../src/constants.js";

function fail(message) {
  console.error(`release-check: ${message}`);
  process.exitCode = 1;
}

const packageMetadata = JSON.parse(fs.readFileSync("package.json", "utf8"));
const packageLock = JSON.parse(fs.readFileSync("package-lock.json", "utf8"));
const changelog = fs.readFileSync("CHANGELOG.md", "utf8");
const requestedTag = process.argv[2] ?? null;

if (packageMetadata.version !== VERSION) {
  fail(
    `package.json is ${packageMetadata.version}, but the CLI reports ${VERSION}.`
  );
}
if (packageLock.version !== VERSION) {
  fail(
    `package-lock.json is ${packageLock.version}, but the CLI reports ${VERSION}.`
  );
}
if (packageLock.packages?.[""]?.version !== VERSION) {
  fail("package-lock.json root package version is inconsistent.");
}
if (!changelog.includes(`## [${VERSION}] - `)) {
  fail(`CHANGELOG.md has no dated ${VERSION} release section.`);
}
if (packageMetadata.engines?.node !== ">=20") {
  fail("package.json must declare the tested Node.js support floor (>=20).");
}
if (packageMetadata.bin?.prodocs !== "bin/prodocs.js") {
  fail("package.json must publish the prodocs executable.");
}
if (packageMetadata.publishConfig?.access !== "public") {
  fail("package.json must declare public package access.");
}
for (const [name, version] of Object.entries(
  packageMetadata.dependencies ?? {}
)) {
  if (!/^\d+\.\d+\.\d+$/.test(version)) {
    fail(`runtime dependency ${name} must use an exact version, not ${version}.`);
  }
}
if (requestedTag && requestedTag !== `v${VERSION}`) {
  fail(`tag ${requestedTag} does not match package version v${VERSION}.`);
}

for (const schemaPath of [
  "schemas/prodocs-config.schema.json",
  "schemas/knowledge.schema.json",
  "schemas/context-packet.schema.json",
  "schemas/collector-result.schema.json",
  "schemas/impact.schema.json",
  "schemas/proposal.schema.json"
]) {
  const schema = JSON.parse(fs.readFileSync(schemaPath, "utf8"));
  if (!schema.$id || !schema.$schema) {
    fail(`${schemaPath} must publish both $id and $schema.`);
  }
}

if (!process.exitCode) {
  console.log(
    `Release metadata is consistent for ProDocs ${VERSION}${requestedTag ? ` (${requestedTag})` : ""}.`
  );
}
