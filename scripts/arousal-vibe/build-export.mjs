import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { installVeratownWebhook, VERATOWN_LIFECYCLE_ACTIONS } from "../shared/veratown-webhook.mjs";

const directory = dirname(fileURLToPath(import.meta.url));
const scriptPath = join(directory, "arousal-vibe.json");
const patternJobs = ["Tease", "Random", "Escalate"];
const targetExpression = "min({maxVibe}, max(0, {arousalBucket}) * {maxVibe} / 100)";
const removalStages = [1, 2, 3, 4, 5];

function removalGate(stage) {
    return [
        '{removeItems} == "on"',
        '{arousalInitialized} == "on"',
        `{removalSent${stage}} == "off"`,
        ...removalStages.slice(0, stage - 1).map(
            (previous) =>
                `({removeGroup${previous}} == "" or {removeAsset${previous}} == "" or {removalSent${previous}} == "on")`,
        ),
        `{trigger-bucket} >= {removeAt${stage}}`,
        `{arousalBucket} < {removeAt${stage}}`,
        `{removeGroup${stage}} != ""`,
        `{removeAsset${stage}} != ""`,
    ].join(" and ");
}

function removalActions(stage) {
    const gate = removalGate(stage);
    return [
        {
            type: "updateComponent",
            channel: "webhook-a",
            action: "send",
            webhookAction: "vtRemoveItem",
            webhookData: [
                { key: "assetGroupName", value: `{removeGroup${stage}}` },
                { key: "assetName", value: `{removeAsset${stage}}` },
                { key: "requestId", value: `arousal-stage-${stage}-{timestamp}` },
            ],
            requiredExpression: gate,
        },
        {
            type: "updateVariable",
            variable: `removalSent${stage}`,
            value: "on",
            requiredExpression: gate,
        },
    ];
}

function stopPatternActions() {
    return patternJobs.map((job) => ({ type: "updateJob", job, action: "stop" }));
}

function startSelectedPatternActions(requiredExpression = '{paused} == "off"') {
    return patternJobs.map((job) => ({
        type: "updateJob",
        job,
        action: "start",
        restart: true,
        requiredExpression: `${requiredExpression} and {patternMode} == "${job.toLowerCase()}"`,
    }));
}

function patternJob(name, levels, interval = "{patternSeconds}") {
    const steps = {};
    levels.forEach((level, index) => {
        const step = index === 0 ? "START" : `STEP${index + 1}`;
        const nextStep = index === levels.length - 1 ? "START" : `STEP${index + 2}`;
        steps[step] = {
            actions: [
                {
                    type: "updateComponent",
                    channel: "part-vibrator-a",
                    action: "setVolume",
                    percentVolume: typeof level === "number" ? `{targetVibe} * ${level}` : level,
                    rampTime: "{rampSeconds}",
                },
            ],
            triggers: [
                {
                    type: "stepState",
                    event: "timer",
                    amount: interval,
                    actions: [{ type: "updateJob", job: name, action: "goTo", step: nextStep }],
                },
            ],
        };
    });
    return { steps };
}

const script = {
    initialActions: [
        { type: "updateVariable", variable: "paused", value: "on" },
        { type: "updateVariable", variable: "arousalBucket", value: "0" },
        { type: "updateVariable", variable: "arousalInitialized", value: "off" },
        { type: "updateVariable", variable: "targetVibe", value: "0" },
        { type: "updateVariable", variable: "removeItems", value: "off" },
        ...removalStages.map((stage) => ({
            type: "updateVariable",
            variable: `removalSent${stage}`,
            value: "off",
        })),
        { type: "updateVariable", variable: "response", value: "Waiting for a Veratown message." },
        { type: "updateComponent", channel: "part-vibrator-a", action: "setVolume", percentVolume: "0", rampTime: 0 },
    ],
    finalActions: [
        { type: "updateVariable", variable: "paused", value: "on" },
        { type: "updateVariable", variable: "removeItems", value: "off" },
        ...stopPatternActions(),
        { type: "updateComponent", channel: "part-vibrator-a", action: "setVolume", percentVolume: "0", rampTime: 0 },
    ],
    globalTriggers: [
        {
            type: "componentState",
            channel: "webhook-a",
            action: "arousalUpdate",
            requiredExpression: '{trigger-origin} == "room" and {trigger-relation} == "self"',
            actions: [
                {
                    type: "updateVariable",
                    variable: "response",
                    value: "BC arousal {trigger-progress}% (bucket {trigger-bucket}%, step {trigger-step}%).",
                },
                ...removalStages.flatMap(removalActions),
                { type: "updateVariable", variable: "arousalBucket", value: "{trigger-bucket}" },
                { type: "updateVariable", variable: "targetVibe", value: targetExpression },
                ...stopPatternActions(),
                ...startSelectedPatternActions(),
                {
                    type: "updateVariable",
                    variable: "arousalInitialized",
                    value: "on",
                    requiredExpression: '{arousalInitialized} == "off"',
                },
            ],
        },
        {
            type: "variableChange",
            variable: "paused",
            valueChange: null,
            actions: [
                ...stopPatternActions(),
                {
                    type: "updateComponent",
                    channel: "part-vibrator-a",
                    action: "setVolume",
                    percentVolume: "0",
                    rampTime: 0,
                    requiredExpression: '{paused} == "on"',
                },
                ...startSelectedPatternActions(),
            ],
        },
        {
            type: "variableChange",
            variable: "patternMode",
            valueChange: null,
            actions: [...stopPatternActions(), ...startSelectedPatternActions()],
        },
        {
            type: "variableChange",
            variable: "maxVibe",
            valueChange: null,
            actions: [
                { type: "updateVariable", variable: "targetVibe", value: targetExpression },
                ...stopPatternActions(),
                ...startSelectedPatternActions(),
            ],
        },
    ],
    jobs: {
        Tease: patternJob("Tease", Array.from({ length: 10 }, (_, index) => (index + 1) / 10)),
        Random: patternJob(
            "Random",
            ["({targetVibe} * 0 | {targetVibe} * 0.25 | {targetVibe} * 0.5 | {targetVibe} * 0.75 | {targetVibe})"],
        ),
        Escalate: patternJob("Escalate", [0.2, 0.4, 0.6, 0.8, 1]),
    },
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
            name: "Maximum power (%)",
            min: 0,
            max: 100,
            value: 100,
            description: "Wearer-controlled local output ceiling. Arousal 100% reaches this cap; device limits still apply.",
        },
        {
            id: "patternMode",
            type: "select",
            name: "Vibration pattern",
            options: ["tease", "random", "escalate"],
            value: "tease",
            description: "Tease rises slowly in ten steps; random picks a level; escalate rises in five steps. Each tops out at the arousal-scaled target.",
        },
        {
            id: "removeItems",
            type: "toggle",
            name: "Request item removal",
            up: "off",
            down: "on",
            value: "off",
            description: "Off by default. Sends proposed vtRemoveItem requests only when enabled and a configured arousal threshold is crossed upward. The current Veratown bridge does not support this request yet.",
        },
        ...removalStages.flatMap((stage) => [
            {
                id: `removeAt${stage}`,
                type: "slider",
                name: `Removal threshold ${stage} (%)`,
                min: 1,
                max: 100,
                value: stage * 20,
            },
            {
                id: `removeGroup${stage}`,
                type: "input",
                name: `Removal ${stage} item group`,
                value: "",
                description: "Exact BC assetGroupName; leave blank to skip this stage.",
            },
            {
                id: `removeAsset${stage}`,
                type: "input",
                name: `Removal ${stage} item name`,
                value: "",
                description: "Exact BC assetName for the item to remove; leave blank to skip this stage.",
            },
        ]),
        {
            id: "patternSeconds",
            type: "slider",
            name: "Pattern step interval (seconds)",
            min: 1,
            max: 10,
            value: 4,
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

installVeratownWebhook(script, "response", VERATOWN_LIFECYCLE_ACTIONS, { outbound: true });
const stopTrigger = script.globalTriggers.find(
    (trigger) => trigger.type === "componentState" && trigger.channel === "webhook-a" && trigger.action === "bridgeStop",
);
if (!stopTrigger) throw new Error("Veratown webhook helper did not install bridgeStop");
stopTrigger.actions.push(
    { type: "updateVariable", variable: "paused", value: "on" },
    { type: "updateVariable", variable: "removeItems", value: "off" },
    ...stopPatternActions(),
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
