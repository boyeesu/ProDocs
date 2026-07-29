import fs from "node:fs/promises";
import path from "node:path";

const INTEGRATIONS = {
  "AGENTS.md": `# Documentation contract for coding agents

Before changing code:

1. Run \`prodocs context --path <area> --json\` to load the local architecture context.
2. Read \`docs/prodocs/SYSTEM_OVERVIEW.md\` for system-level constraints.

After changing code:

1. Run \`prodocs sync\` to refresh evidence-backed documentation.
2. Run \`prodocs check\` and the project test suite.
3. If behavior or an architectural decision changed, update the human-authored narrative docs as part of the same change.

Generated files under \`docs/prodocs\` contain facts derived from source. Do not hand-edit them.
`,
  "CLAUDE.md": `# ProDocs integration

Use \`prodocs context --path <area> --json\` before editing unfamiliar code.
After source changes, run \`prodocs sync\` and \`prodocs check\`.
Treat \`docs/prodocs/knowledge.json\` as the machine-readable codebase map.
`,
  "opencode.md": `# ProDocs integration

Load scoped context with \`prodocs context --path <area> --json\`.
Refresh generated evidence with \`prodocs sync\` after code changes.
Run \`prodocs check\` before completing a task.
`
};

export async function writeIntegrations(root) {
  const directory = path.join(root, ".prodocs", "integrations");
  await fs.mkdir(directory, { recursive: true });
  const results = [];

  for (const [name, contents] of Object.entries(INTEGRATIONS)) {
    const destination = path.join(directory, name);
    try {
      await fs.access(destination);
      results.push({ path: destination, created: false });
    } catch {
      await fs.writeFile(destination, contents);
      results.push({ path: destination, created: true });
    }
  }
  return results;
}
