import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { VERATOWN_ALL_ACTIONS } from "../shared/veratown-webhook.mjs";

const script = JSON.parse(
    await readFile(new URL("./veratown-event-control.json", import.meta.url), "utf8"),
);
const outputIds = ["T", "A", "B", "C", "D", "R", "E", "F"];
const outputChannels = [
    "generic-1-a",
    "part-vibrator-a",
    "part-vibrator-b",
    "part-vibrator-c",
    "part-vibrator-d",
    "part-rotator-a",
    "part-estim-a",
    "part-estim-b",
];
const actionTrigger = (action) =>
    script.globalTriggers.find(
        (trigger) =>
            trigger.type === "componentState" &&
            trigger.channel === "webhook-a" &&
            trigger.action === action,
    );
const allActions = [
    ...script.initialActions,
    ...script.finalActions,
    ...script.globalTriggers.flatMap((trigger) => trigger.actions),
    ...Object.values(script.jobs).flatMap((job) =>
        Object.values(job.steps).flatMap((step) => [
            ...step.actions,
            ...step.triggers.flatMap((trigger) => trigger.actions),
        ]),
    ),
];

test("is a standalone native Veratown webhook script", () => {
    assert.equal(script.channels["webhook-a"].outbound, true);
    assert.equal(script.controls.find((control) => control.id === "response").type, "textarea");
    assert.ok(actionTrigger("bridgeVerify"));
    assert.ok(actionTrigger("bridgeState"));
    assert.ok(actionTrigger("bridgeStop"));
    assert.ok(actionTrigger("vtResult"));
    assert.equal("customFunctions" in script, false);
});

test("covers the documented Veratown event families and five location slots", () => {
    const actions = [
        "toyEvent",
        "inflationEvent",
        "itemAdded",
        "itemRemoved",
        "activityEvent",
        "activityOnOtherEvent",
        "vtRoomJoin",
        "vtRoomLeave",
        "vtSpokenTo",
        "vtLocationEntered",
        "vtLocationLeft",
        "vtCasinoResult",
        "vtHotSeatSelected",
        "vtHotSeatReleased",
        "vtTruthDareAssigned",
        "vtTruthDareResolved",
        "vtDilemmaResult",
        "vtStagedTablePhase",
        "vtStagedTableAppearance",
        "vtShowerStarted",
        "vtShowerEnded",
        "vtTrickOrTreatOutcome",
    ];
    for (const action of actions) assert.ok(actionTrigger(action), `missing ${action}`);
    for (const action of VERATOWN_ALL_ACTIONS) assert.ok(actionTrigger(action), `missing shared event ${action}`);
    for (let slot = 1; slot <= 5; slot++) {
        assert.ok(script.controls.some((control) => control.id === `locationKey${slot}`));
        assert.ok(script.controls.some((control) => control.id === `locationTarget${slot}`));
    }
    assert.equal(script.controls.find((control) => control.id === "locationKey1").value, "asylum");
    for (const id of outputIds) {
        assert.ok(script.controls.some((control) => control.id === `group${id}`));
        assert.ok(script.channels[outputChannels[outputIds.indexOf(id)]]);
    }
});

test("uses native, TTS-safe voice triggers and the supported inbound controls", () => {
    const voiceTriggers = script.globalTriggers.filter(
        (trigger) => trigger.type === "componentState" && trigger.channel === "speech-recognition-a",
    );
    assert.ok(voiceTriggers.length >= 9);
    for (const trigger of voiceTriggers) {
        assert.equal(trigger.isFinal, true);
        assert.equal(trigger.ignoreTTS, true);
    }
    for (const action of ["vtSetVibe", "vtStop", "vtQueryState", "vtEmote"]) {
        assert.ok(
            allActions.some(
                (entry) =>
                    entry.type === "updateComponent" &&
                    entry.channel === "webhook-a" &&
                    entry.webhookAction === action,
            ),
            `missing outbound ${action}`,
        );
    }
    assert.deepEqual(
        script.controls.find((control) => control.id === "voiceLevel").options,
        ["off", "low", "medium", "high", "maximum"],
    );
    const vibeLevels = allActions
        .filter((entry) => entry.type === "updateComponent" && entry.webhookAction === "vtSetVibe")
        .flatMap((entry) => entry.webhookData.filter((field) => field.key === "level").map((field) => field.value));
    assert.ok(vibeLevels.length > 0);
    assert.ok(vibeLevels.every((value) => value === "{voiceLevel}"));
});

test("starts and stops safely, with shock events limited to capped vibration cues", () => {
    assert.ok(
        script.initialActions.some(
            (action) => action.type === "updateVariable" && action.variable === "paused" && action.value === "on",
        ),
    );
    assert.ok(
        script.initialActions.some(
            (action) => action.type === "updateComponent" && action.action === "setVolume" && action.percentVolume === "0",
        ),
    );
    assert.ok(
        script.finalActions.some(
            (action) => action.type === "updateComponent" && action.action === "setVolume" && action.percentVolume === "0",
        ),
    );
    assert.equal(script.controls.find((control) => control.id === "shockCueMax").max, 10);
    assert.equal(script.controls.find((control) => control.id === "stimEnabled").value, "off");
    assert.equal(script.controls.find((control) => control.id === "maxE").value, 0);
    assert.equal(script.controls.find((control) => control.id === "maxF").value, 0);
    assert.ok(!allActions.some((action) => action.action === "setShock2" || action.shock === true));
    const shockPulseJobs = allActions
        .filter((action) => action.type === "updateJob" && action.job?.startsWith("Pulse"))
        .filter((action) => /trigger-actionName} == "Shock(?:Low|Med|High)"/.test(action.requiredExpression ?? ""));
    assert.ok(shockPulseJobs.length > 0);
    assert.ok(shockPulseJobs.every((action) => !["PulseE", "PulseF"].includes(action.job)));
});

test("all variable references are defined by controls or script state", () => {
    const known = new Set(script.controls.flatMap((control) => (control.id ? [control.id] : [])));
    for (const id of outputIds) {
        for (const prefix of ["toy", "inflate", "boost", "pulseSeconds"]) known.add(`${prefix}${id}`);
    }
    known.add("ttsText");
    const references = new Set(
        [...JSON.stringify(script).matchAll(/\{([A-Za-z][A-Za-z0-9-]*)\}/g)]
            .map((match) => match[1])
            .filter((name) => !name.startsWith("trigger-") && !name.startsWith("queue-")),
    );
    assert.deepEqual([...references].filter((name) => !known.has(name)), []);
    const ids = script.controls.map((control) => control.id).filter(Boolean);
    assert.equal(new Set(ids).size, ids.length);
});
