import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { installVeratownWebhook, VERATOWN_LIFECYCLE_ACTIONS } from "../shared/veratown-webhook.mjs";

const directory = dirname(fileURLToPath(import.meta.url));
const scriptPath = join(directory, "arousal-vibe.json");
const script = {
    initialActions: [
        { type: "updateVariable", variable: "paused", value: "on" },
        { type: "updateVariable", variable: "response", value: "Waiting for a Veratown message." },
        { type: "updateComponent", channel: "part-vibrator-a", action: "setVolume", percentVolume: "0", rampTime: 0 },
    ],
    finalActions: [
        { type: "updateVariable", variable: "paused", value: "on" },
        { type: "updateComponent", channel: "part-vibrator-a", action: "setVolume", percentVolume: "0", rampTime: 0 },
    ],
    globalTriggers: [
        {
            type: "componentState",
            channel: "webhook-a",
            action: "arousalUpdate",
            requiredExpression:
                '{paused} == "off" and {trigger-origin} == "room" and {trigger-relation} == "self"',
            actions: [
                {
                    type: "updateVariable",
                    variable: "response",
                    value: "BC arousal {trigger-progress}% (bucket {trigger-bucket}%, step {trigger-step}%).",
                },
                {
                    type: "updateComponent",
                    channel: "part-vibrator-a",
                    action: "setVolume",
                    percentVolume: "min({maxVibe}, max(0, {trigger-bucket}) * {maxVibe} / 100)",
                    rampTime: "{rampSeconds}",
                },
            ],
        },
        {
            type: "variableChange",
            variable: "paused",
            valueChange: null,
            requiredExpression: '{paused} == "on"',
            actions: [
                { type: "updateComponent", channel: "part-vibrator-a", action: "setVolume", percentVolume: "0", rampTime: 0 },
            ],
        },
    ],
    jobs: {},
    queues: [],
    channels: {
        "part-vibrator-a": { type: "part-vibrator", name: "Arousal Vibe" },
    },
    controls: [
        {
            id: "paused",
            type: "toggle",
            name: "Pause output",
            up: "off",
            down: "on",
            value: "on",
            description: "Starts paused. Turning pause on immediately sets output to zero.",
        },
        {
            id: "maxVibe",
            type: "slider",
            name: "Maximum vibration (%)",
            min: 0,
            max: 25,
            value: 20,
            description: "Wearer-controlled local output ceiling; XToys device limits still apply.",
        },
        {
            id: "rampSeconds",
            type: "slider",
            name: "Ramp time (seconds)",
            min: 0,
            max: 5,
            value: 1,
        },
        {
            id: "response",
            type: "textarea",
            name: "Latest Veratown message",
            value: "Waiting for a Veratown message.",
            description: "Lifecycle responses and observed arousal values appear here.",
        },
    ],
    controlPresets: [],
    media: { audio: {}, voices: {}, patterns: {} },
    customFunctions: "",
};

installVeratownWebhook(script, "response", VERATOWN_LIFECYCLE_ACTIONS);
const stopTrigger = script.globalTriggers.find(
    (trigger) => trigger.type === "componentState" && trigger.channel === "webhook-a" && trigger.action === "bridgeStop",
);
if (!stopTrigger) throw new Error("Veratown webhook helper did not install bridgeStop");
stopTrigger.actions.push(
    { type: "updateVariable", variable: "paused", value: "on" },
    { type: "updateComponent", channel: "part-vibrator-a", action: "setVolume", percentVolume: "0", rampTime: 0 },
);

const output = `${JSON.stringify(script, null, 2)}\n`;
if (process.argv.includes("--check")) {
    const current = await readFile(scriptPath, "utf8");
    if (current !== output) {
        console.error("XToys export is stale; run node scripts/arousal-vibe/build-export.mjs");
        process.exitCode = 1;
    }
} else {
    await writeFile(scriptPath, output);
}
