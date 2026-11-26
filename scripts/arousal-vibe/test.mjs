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
        outbound: true,
        hideWebhookInfo: false,
    });
    assert.equal(script.controls.find((control) => control.id === "response").type, "textarea");
    for (const action of VERATOWN_LIFECYCLE_ACTIONS) assert.ok(triggerFor(action), `missing ${action}`);
});

test("maps only self-origin room arousal buckets to a capped vibration level", () => {
    const trigger = triggerFor("arousalUpdate");
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
    assert.ok(
        trigger.actions.some(
            (action) =>
                action.type === "updateVariable" &&
                action.variable === "targetVibe" &&
                action.value === "min({maxVibe}, max(0, {arousalBucket}) * {maxVibe} / 100)",
        ),
    );
    const maximum = script.controls.find((control) => control.id === "maxVibe");
    assert.equal(maximum.max, 100);
    assert.equal(maximum.value, 100);
    assert.equal(script.controls.find((control) => control.id === "paused").value, "on");
});

test("sends configured item-removal requests only on enabled upward threshold crossings", () => {
    const trigger = triggerFor("arousalUpdate");
    const removalToggle = script.controls.find((control) => control.id === "removeItems");
    assert.equal(removalToggle.value, "off");
    assert.equal(script.initialActions.find((action) => action.variable === "arousalInitialized").value, "off");
    for (let stage = 1; stage <= 5; stage++) {
        assert.equal(
            script.controls.find((control) => control.id === `removeAt${stage}`).value,
            stage * 20,
        );
        const send = trigger.actions.find(
            (action) =>
                action.type === "updateComponent" &&
                action.action === "send" &&
                action.webhookAction === "vtRemoveItem" &&
                action.webhookData.some(
                    (field) => field.key === "requestId" && field.value === `arousal-stage-${stage}-{timestamp}`,
                ),
        );
        assert.ok(send, `missing item-removal request for stage ${stage}`);
        assert.ok(send.requiredExpression.includes('{removeItems} == "on"'));
        assert.ok(send.requiredExpression.includes('{arousalInitialized} == "on"'));
        assert.ok(send.requiredExpression.includes(`{trigger-bucket} >= {removeAt${stage}}`));
        assert.ok(send.requiredExpression.includes(`{arousalBucket} < {removeAt${stage}}`));
        assert.ok(send.requiredExpression.includes(`{removalSent${stage}} == "off"`));
        if (stage > 1) {
            assert.ok(
                send.requiredExpression.includes(
                    `({removeGroup${stage - 1}} == "" or {removeAsset${stage - 1}} == "" or {removalSent${stage - 1}} == "on")`,
                ),
            );
        }
        assert.ok(send.requiredExpression.includes(`{removeGroup${stage}} != ""`));
        assert.ok(send.requiredExpression.includes(`{removeAsset${stage}} != ""`));
        assert.deepEqual(
            send.webhookData.slice(0, 2),
            [
                { key: "assetGroupName", value: `{removeGroup${stage}}` },
                { key: "assetName", value: `{removeAsset${stage}}` },
            ],
        );
    }
    assert.ok(!trigger.actions.some((action) => action.webhookAction === "vtRemoveItem" && !action.requiredExpression));
});

test("provides arousal-scaled tease, random, and escalating patterns", () => {
    assert.deepEqual(
        script.controls.find((control) => control.id === "patternMode").options,
        ["tease", "random", "escalate"],
    );
    const tease = script.jobs.Tease.steps;
    assert.equal(Object.keys(tease).length, 10);
    assert.equal(tease.START.actions[0].percentVolume, "{targetVibe} * 0.1");
    assert.equal(tease.STEP10.actions[0].percentVolume, "{targetVibe} * 1");
    assert.equal(tease.STEP10.triggers[0].actions[0].step, "START");

    const random = script.jobs.Random.steps.START;
    assert.match(random.actions[0].percentVolume, /0\.25/);
    assert.match(random.actions[0].percentVolume, /0\.75/);
    assert.equal(random.triggers[0].actions[0].step, "START");

    const escalate = script.jobs.Escalate.steps;
    assert.equal(Object.keys(escalate).length, 5);
    assert.equal(escalate.START.actions[0].percentVolume, "{targetVibe} * 0.2");
    assert.equal(escalate.STEP5.actions[0].percentVolume, "{targetVibe} * 1");
    assert.equal(escalate.STEP5.triggers[0].actions[0].step, "START");
});

test("starts, pauses, stops, and shuts down with zero vibration", () => {
    for (const action of [...script.initialActions, ...script.finalActions]) {
        if (action.channel === "part-vibrator-a") assert.equal(action.percentVolume, "0");
    }
    const pause = script.globalTriggers.find(
        (trigger) => trigger.type === "variableChange" && trigger.variable === "paused",
    );
    assert.ok(pause.actions.some((action) => action.type === "updateJob" && action.action === "stop"));
    assert.ok(
        pause.actions.some(
            (action) =>
                action.channel === "part-vibrator-a" &&
                action.percentVolume === "0" &&
                action.requiredExpression === '{paused} == "on"',
        ),
    );
    const stop = triggerFor("bridgeStop");
    assert.ok(stop.actions.some((action) => action.type === "updateVariable" && action.variable === "paused"));
    assert.ok(stop.actions.some((action) => action.type === "updateVariable" && action.variable === "removeItems" && action.value === "off"));
    assert.ok(stop.actions.some((action) => action.type === "updateJob" && action.action === "stop"));
    assert.ok(stop.actions.some((action) => action.channel === "part-vibrator-a" && action.percentVolume === "0"));
    assert.ok(!JSON.stringify(script).includes("setShock2"));
});
