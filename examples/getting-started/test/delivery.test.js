import assert from "node:assert/strict";
import test from "node:test";
import { retryDelivery } from "../src/delivery.js";

test("delivery retries stop after three attempts", () => {
  assert.equal(retryDelivery(1), "retry");
  assert.equal(retryDelivery(3), "failed");
});
