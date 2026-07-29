import dependency from "./dependency.js";
export * from "./shared.js";

const deceptive = 'import ignored from "./not-evidence.js"';

export default class Runner {
  constructor() {}

  async run() {
    return import("./lazy.js");
  }
}

export const load = () => require("./common.cjs");

function outer() {
  function inner() {
    return deceptive;
  }

  return inner();
}
