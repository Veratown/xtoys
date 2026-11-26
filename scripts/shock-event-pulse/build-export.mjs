import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { installVeratownWebhook, VERATOWN_LIFECYCLE_ACTIONS } from "../shared/veratown-webhook.mjs";

const directory = dirname(fileURLToPath(import.meta.url));
const scriptPath = join(directory, "shock-event-pulse.json");
const script = {
    initialActions: [
        { type: "updateVariable", variable: "response", value: "Waiting for a Veratown message." },
        { type: "updateComponent", channel: "part-vibrator-a", action: "setVolume", percentVolume: "0", rampTime: 0 },
    ],
    finalActions: [
        { type: "updateJob", job: "ShockPulse", action: "stop" },
        { type: "updateComponent", channel: "part-vibrator-a", action: "setVolume", percentVolume: "0", rampTime: 0 },
    ],
    globalTriggers: [
        {
            type: "componentState",
            channel: "webhook-a",
            action: "activityEvent",
            requiredExpression:
                '({trigger-actionName} == "ShockLow" or {trigger-actionName} == "ShockMed" or {trigger-actionName} == "ShockHigh")',
            actions: [
                { type: "updateVariable", variable: "response", value: "Shock event received: {trigger-actionName}." },
                { type: "updateJob", job: "ShockPulse", action: "start", restart: true },
            ],
        },
    ],
    jobs: {
        ShockPulse: {
            steps: {
                START: {
                    actions: [
                        {
                            type: "updateComponent",
                            channel: "part-vibrator-a",
                            action: "setVolume",
                            percentVolume: "{pulseLevel}",
                            rampTime: "0.1",
                        },
                    ],
                    triggers: [
                        {
                            type: "stepState",
                            event: "timer",
                            amount: "{pulseDuration}",
                            actions: [
                                {
                                    type: "updateComponent",
                                    channel: "part-vibrator-a",
                                    action: "setVolume",
                                    percentVolume: "0",
                                    rampTime: "0.1",
                                },
                                { type: "updateJob", job: "ShockPulse", action: "stop" },
                            ],
                        },
                    ],
                },
            },
        },
    },
    queues: [],
    channels: {
        "part-vibrator-a": { type: "part-vibrator", name: "Vibrator" },
    },
    controls: [
        {
            id: "pulseLevel",
            type: "slider",
            name: "Pulse level (%)",
            min: 0,
            max: 10,
            value: 5,
        },
        {
            id: "pulseDuration",
            type: "slider",
            name: "Pulse duration (s)",
            min: 0.1,
            max: 2,
            value: 0.5,
        },
        {
            id: "response",
            type: "textarea",
            name: "Latest Veratown response",
            value: "Waiting for a Veratown message.",
            description: "Verification codes and received shock events appear here.",
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
    { type: "updateJob", job: "ShockPulse", action: "stop" },
    { type: "updateComponent", channel: "part-vibrator-a", action: "setVolume", percentVolume: "0", rampTime: 0 },
);

const output = `${JSON.stringify(script, null, 2)}\n`;
if (process.argv.includes("--check")) {
    const current = await readFile(scriptPath, "utf8");
    if (current !== output) {
        console.error("XToys export is stale; run node scripts/shock-event-pulse/build-export.mjs");
        process.exitCode = 1;
    }
} else {
    await writeFile(scriptPath, output);
}
