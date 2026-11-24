import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const directory = dirname(fileURLToPath(import.meta.url));
const script = JSON.parse(
    await readFile(join(directory, "veratown-event-router.json"), "utf8"),
);
const source = await readFile(join(directory, "router.js"), "utf8");

assert.equal(script.customFunctions, source, "export must contain the current JavaScript source");
assert.equal(script.channels["webhook-a"].type, "webhook");
assert.equal(script.channels["part-estim-a"].type, "part-estim");
assert.equal(script.controls.find((control) => control.id === "paused").value, "on");
assert.ok(script.finalActions.some((action) => action.action === "setVolume" && action.percentVolume === "0"));

const variables = Object.fromEntries(
    script.controls
        .filter((control) => control.id)
        .map((control) => [control.id, control.value]),
);
const calls = [];
const triggers = new Map();
const context = {
    getVariable: (name) => variables[name],
    setVariable: (name, value) => {
        variables[name] = value;
    },
    callAction: (action) => calls.push(action),
    registerTrigger: (trigger, callback) => {
        triggers.set(`${trigger.type}:${trigger.action || trigger.variable}`, callback);
    },
};

vm.runInNewContext(script.customFunctions, context, { timeout: 1_000 });
const outputIds = Array.from(context.OUTPUTS, (output) => output.channel);
assert.deepEqual(outputIds, Object.keys(script.channels).filter((channel) => channel !== "webhook-a"));
for (const output of context.OUTPUTS) {
    assert.ok(script.jobs[output.job], `missing pulse timer ${output.job}`);
    if (output.shockJob) assert.ok(script.jobs[output.shockJob], `missing shock timer ${output.shockJob}`);
}

function fire(action, fields = {}) {
    const handler = triggers.get(`componentState:${action}`);
    assert.ok(handler, `missing handler for ${action}`);
    handler(
        Object.fromEntries(
            Object.entries(fields).map(([key, value]) => [`trigger-${key}`, value]),
        ),
    );
}

function lastComponentAction(channel, action) {
    return calls
        .filter((call) => call.type === "updateComponent" && call.channel === channel && call.action === action)
        .at(-1);
}

variables.paused = "off";
fire("toyEvent", { assetGroupName: "ItemVulva", level: 2 });
assert.equal(lastComponentAction("generic-1-a", "setVolume").percentVolume, 15);
fire("itemRemoved", { assetGroupName: "ItemVulva" });
assert.equal(lastComponentAction("generic-1-a", "setVolume").percentVolume, 0);

variables.casinoPulses = "on";
calls.length = 0;
fire("vtCasinoResult", { outcome: "win" });
assert.equal(calls.some((call) => call.type === "updateJob" && call.action === "start"), false);
fire("vtCasinoResult", { outcome: "loss" });
assert.ok(calls.some((call) => call.type === "updateJob" && call.job === "PulseA" && call.action === "start"));

const routeConfig = JSON.parse(variables.routeConfig);
routeConfig.groups.ItemButt = ["part-estim-a"];
routeConfig.locations = [
    { key: "test-forbidden-area", enter: ["part-vibrator-a"], leave: [], percent: 12, seconds: 1 },
];
variables.routeConfig = JSON.stringify(routeConfig);
triggers.get("variableChange:routeConfig")();
variables.paused = "off";
variables.locationPulses = "on";
calls.length = 0;
fire("vtLocationEntered", { location: "not-the-configured-key" });
assert.equal(calls.some((call) => call.type === "updateJob" && call.action === "start"), false);
fire("vtLocationEntered", { location: "test-forbidden-area" });
assert.ok(calls.some((call) => call.type === "updateJob" && call.job === "PulseB" && call.action === "start"));

variables.allowShockEvents = "on";
variables.shockCap = 10;
variables.shockSeconds = 0.5;
calls.length = 0;
fire("activityEvent", { assetGroupName: "ItemButt", actionName: "ShockHigh" });
const shock = lastComponentAction("part-estim-a", "setShock2");
assert.equal(shock.percentVolume, 10);
assert.equal(shock.time, 0.5);
assert.equal(shock.shock, true);
assert.ok(calls.some((call) => call.type === "updateJob" && call.job === "IdleStop" && call.action === "start"));
fire("activityOnOtherEvent", { assetGroupName: "ItemButt", actionName: "ShockHigh" });
assert.equal(calls.filter((call) => call.type === "updateComponent" && call.action === "setShock2").length, 1);

fire("bridgeStop", { reason: "safeword" });
assert.ok(calls.some((call) => call.type === "updateJob" && call.job === "ShockI" && call.action === "stop"));
assert.equal(lastComponentAction("part-estim-a", "setShock2").shock, false);

console.log("Veratown event router checks passed.");
