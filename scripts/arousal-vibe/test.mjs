import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { VERATOWN_LIFECYCLE_ACTIONS } from "../shared/veratown-webhook.mjs";

const script = JSON.parse(
    await readFile(new URL("./arousal-vibe.json", import.meta.url), "utf8"),
);
const triggerFor = (action) =>
    script.globalTriggers.find(
        (trigger) =>
            trigger.type === "componentState" &&
            trigger.channel === "webhook-a" &&
            trigger.action === action,
    );

test("installs a standalone Veratown webhook with visible lifecycle responses", () => {
    assert.deepEqual(script.channels["webhook-a"], {
        type: "webhook",
        outbound: false,
        hideWebhookInfo: false,
    });
    assert.equal(script.controls.find((control) => control.id === "response").type, "textarea");
    for (const action of VERATOWN_LIFECYCLE_ACTIONS) assert.ok(triggerFor(action), `missing ${action}`);
});

test("maps only self-origin room arousal buckets to a capped vibration level", () => {
    const trigger = triggerFor("arousalUpdate");
    assert.ok(trigger.requiredExpression.includes('{paused} == "off"'));
    assert.ok(trigger.requiredExpression.includes('{trigger-origin} == "room"'));
    assert.ok(trigger.requiredExpression.includes('{trigger-relation} == "self"'));
    assert.ok(
        trigger.actions.some(
            (action) =>
                action.type === "updateVariable" &&
                action.variable === "response" &&
                action.value.includes("{trigger-progress}") &&
                action.value.includes("{trigger-bucket}") &&
                action.value.includes("{trigger-step}"),
        ),
    );
    const output = trigger.actions.find(
        (action) => action.type === "updateComponent" && action.channel === "part-vibrator-a",
    );
    assert.equal(
        output.percentVolume,
        "min({maxVibe}, max(0, {trigger-bucket}) * {maxVibe} / 100)",
    );
    assert.equal(script.controls.find((control) => control.id === "maxVibe").value, 20);
    assert.equal(script.controls.find((control) => control.id === "paused").value, "on");
});

test("starts, pauses, stops, and shuts down with zero vibration", () => {
    for (const action of [...script.initialActions, ...script.finalActions]) {
        if (action.channel === "part-vibrator-a") assert.equal(action.percentVolume, "0");
    }
    const pause = script.globalTriggers.find(
        (trigger) => trigger.type === "variableChange" && trigger.variable === "paused",
    );
    assert.ok(pause.actions.some((action) => action.channel === "part-vibrator-a" && action.percentVolume === "0"));
    const stop = triggerFor("bridgeStop");
    assert.ok(stop.actions.some((action) => action.type === "updateVariable" && action.variable === "paused"));
    assert.ok(stop.actions.some((action) => action.channel === "part-vibrator-a" && action.percentVolume === "0"));
    assert.ok(!JSON.stringify(script).includes("setShock2"));
});
