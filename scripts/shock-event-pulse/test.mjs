import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { VERATOWN_LIFECYCLE_ACTIONS } from "../shared/veratown-webhook.mjs";

const script = JSON.parse(
    await readFile(new URL("./shock-event-pulse.json", import.meta.url), "utf8"),
);
const triggerFor = (action) =>
    script.globalTriggers.find(
        (trigger) =>
            trigger.type === "componentState" &&
            trigger.channel === "webhook-a" &&
            trigger.action === action,
    );

test("installs the standalone Veratown webhook lifecycle", () => {
    assert.deepEqual(script.channels["webhook-a"], {
        type: "webhook",
        outbound: false,
        hideWebhookInfo: false,
    });
    assert.equal(script.controls.find((control) => control.id === "response").type, "textarea");
    for (const action of VERATOWN_LIFECYCLE_ACTIONS) assert.ok(triggerFor(action), `missing ${action}`);
});

test("pulses only for shock events directed at the linked avatar", () => {
    const shockTrigger = triggerFor("activityEvent");
    assert.match(shockTrigger.requiredExpression, /ShockLow/);
    assert.match(shockTrigger.requiredExpression, /ShockMed/);
    assert.match(shockTrigger.requiredExpression, /ShockHigh/);
    assert.equal(shockTrigger.actions.find((action) => action.type === "updateJob").job, "ShockPulse");
    assert.equal(script.jobs.ShockPulse.steps.START.actions[0].channel, "part-vibrator-a");
    assert.equal(script.jobs.ShockPulse.steps.START.triggers[0].amount, "{pulseDuration}");
    assert.ok(!JSON.stringify(script).includes("setShock2"));
});

test("zeros output on stop and Veratown bridge shutdown", () => {
    for (const action of [...script.initialActions, ...script.finalActions]) {
        if (action.channel === "part-vibrator-a") assert.equal(action.percentVolume, "0");
    }
    const stopActions = triggerFor("bridgeStop").actions;
    assert.ok(stopActions.some((action) => action.type === "updateJob" && action.job === "ShockPulse"));
    assert.ok(stopActions.some((action) => action.channel === "part-vibrator-a" && action.percentVolume === "0"));
});
