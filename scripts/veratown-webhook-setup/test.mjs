import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { VERATOWN_ALL_ACTIONS } from "../shared/veratown-webhook.mjs";

const directory = dirname(fileURLToPath(import.meta.url));
const script = JSON.parse(
    await readFile(join(directory, "veratown-webhook-setup.json"), "utf8"),
);

assert.deepEqual(script.channels["webhook-a"], {
    type: "webhook",
    outbound: false,
    hideWebhookInfo: false,
});
assert.equal(script.controls.find((control) => control.id === "response").type, "textarea");
assert.equal("customFunctions" in script, false);

function triggerFor(action) {
    return script.globalTriggers.find(
        (trigger) => trigger.type === "componentState" && trigger.channel === "webhook-a" && trigger.action === action,
    );
}

for (const action of VERATOWN_ALL_ACTIONS) {
    assert.ok(triggerFor(action), `missing response trigger for ${action}`);
}

const verification = triggerFor("bridgeVerify").actions[0];
assert.equal(verification.type, "updateVariable");
assert.equal(verification.variable, "response");
assert.match(verification.value, /\{trigger-code\}/);
assert.match(verification.value, /!xtoys verify \{trigger-code\}/);

const result = triggerFor("vtResult").actions[0];
assert.match(result.value, /\{trigger-status\}/);

console.log("Veratown webhook setup checks passed.");
