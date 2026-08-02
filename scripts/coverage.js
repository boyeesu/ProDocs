import { spawnSync } from "node:child_process";

const thresholds = {
  lines: 85,
  branches: 80,
  functions: 90
};

const result = spawnSync(
  process.execPath,
  ["--test", "--experimental-test-coverage"],
  {
    cwd: process.cwd(),
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024
  }
);

process.stdout.write(result.stdout ?? "");
process.stderr.write(result.stderr ?? "");

if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);

const summary = (result.stdout ?? "")
  .split(/\r?\n/)
  .find((line) => line.includes("all files") && line.includes("|"));
if (!summary) {
  throw new Error("Could not read the aggregate Node.js coverage summary.");
}

const values = summary
  .split("|")
  .slice(1, 4)
  .map((value) => Number.parseFloat(value.trim()));
const actual = {
  lines: values[0],
  branches: values[1],
  functions: values[2]
};

for (const [metric, minimum] of Object.entries(thresholds)) {
  if (!Number.isFinite(actual[metric]) || actual[metric] < minimum) {
    throw new Error(
      `Coverage ${metric} is ${actual[metric]}%; production minimum is ${minimum}%.`
    );
  }
}

console.log(
  `Coverage gates passed: ${actual.lines}% lines, ${actual.branches}% branches, ${actual.functions}% functions.`
);
