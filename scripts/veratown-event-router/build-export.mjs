import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const directory = dirname(fileURLToPath(import.meta.url));
const scriptPath = join(directory, "veratown-event-router.json");
const sourcePath = join(directory, "router.js");
const source = await readFile(sourcePath, "utf8");
const current = JSON.parse(await readFile(scriptPath, "utf8"));
const outputs = [
    { channel: "generic-1-a", job: "PulseA", seconds: "pulseSecondsA", kind: "vibe" },
    { channel: "part-vibrator-a", job: "PulseB", seconds: "pulseSecondsB", kind: "vibe" },
    { channel: "part-vibrator-b", job: "PulseC", seconds: "pulseSecondsC", kind: "vibe" },
    { channel: "part-vibrator-c", job: "PulseD", seconds: "pulseSecondsD", kind: "vibe" },
    { channel: "part-vibrator-d", job: "PulseE", seconds: "pulseSecondsE", kind: "vibe" },
    { channel: "part-rotator-a", job: "PulseF", seconds: "pulseSecondsF", kind: "rotator" },
    { channel: "part-rotator-b", job: "PulseG", seconds: "pulseSecondsG", kind: "rotator" },
    { channel: "part-rotator-c", job: "PulseH", seconds: "pulseSecondsH", kind: "rotator" },
    {
        channel: "part-estim-a",
        job: "PulseI",
        seconds: "pulseSecondsI",
        kind: "estim",
        shockJob: "ShockI",
        shockSeconds: "shockSecondsI",
    },
    {
        channel: "part-estim-b",
        job: "PulseJ",
        seconds: "pulseSecondsJ",
        kind: "estim",
        shockJob: "ShockJ",
        shockSeconds: "shockSecondsJ",
    },
    {
        channel: "part-estim-c",
        job: "PulseK",
        seconds: "pulseSecondsK",
        kind: "estim",
        shockJob: "ShockK",
        shockSeconds: "shockSecondsK",
    },
    {
        channel: "part-estim-d",
        job: "PulseL",
        seconds: "pulseSecondsL",
        kind: "estim",
        shockJob: "ShockL",
        shockSeconds: "shockSecondsL",
    },
    {
        channel: "part-estim-e",
        job: "PulseM",
        seconds: "pulseSecondsM",
        kind: "estim",
        shockJob: "ShockM",
        shockSeconds: "shockSecondsM",
    },
];

function timeoutJob(job, secondsVariable, code) {
    return {
        steps: {
            START: {
                actions: [],
                triggers: [
                    {
                        type: "stepState",
                        event: "timer",
                        amount: `{${secondsVariable}}`,
                        actions: [
                            { type: "customCode", code, variables: [] },
                            { type: "updateJob", job, action: "stop" },
                        ],
                    },
                ],
            },
        },
    };
}

function makeExport(template) {
    const script = JSON.parse(JSON.stringify(template));
    const outputChannels = Object.fromEntries(
        outputs.map((output) => [
            output.channel,
            {
                type:
                    output.kind === "vibe"
                        ? output.channel === "generic-1-a"
                            ? "generic-1"
                            : "part-vibrator"
                        : output.kind === "rotator"
                          ? "part-rotator"
                          : "part-estim",
                name:
                    output.channel === "generic-1-a"
                        ? "Universal output / Tremblr"
                        : `${output.kind === "estim" ? "DG-LAB channel" : output.kind === "rotator" ? "Rotator" : "Vibrator"} ${output.channel.slice(-1).toUpperCase()}`,
            },
        ]),
    );
    script.channels = {
        "webhook-a": { type: "webhook", outbound: false, hideWebhookInfo: false },
        ...outputChannels,
    };
    script.initialActions = [{ type: "updateVariable", variable: "paused", value: "on" }];
    script.finalActions = [];
    script.jobs = {};

    for (const output of outputs) {
        script.initialActions.push({
            type: "updateVariable",
            variable: output.seconds,
            value: "1",
        });
        if (output.kind === "estim") {
            script.initialActions.push({
                type: "updateVariable",
                variable: output.shockSeconds,
                value: "0.5",
            });
        }
        script.initialActions.push({
            type: "updateComponent",
            channel: output.channel,
            action: "setVolume",
            percentVolume: "0",
            rampTime: 0,
        });
        if (output.kind === "estim") {
            script.initialActions.splice(script.initialActions.length - 1, 0, {
                type: "updateComponent",
                channel: output.channel,
                action: "setMode",
                mode: "standard",
            });
            script.initialActions.push({
                type: "updateComponent",
                channel: output.channel,
                action: "setShock2",
                percentVolume: "0",
                time: "0",
                shock: false,
            });
        }
        script.finalActions.push(
            ...(output.kind === "estim"
                ? [
                      {
                          type: "updateComponent",
                          channel: output.channel,
                          action: "setShock2",
                          percentVolume: "0",
                          time: "0",
                          shock: false,
                      },
                      {
                          type: "updateComponent",
                          channel: output.channel,
                          action: "setMode",
                          mode: "standard",
                      },
                  ]
                : []),
            {
                type: "updateComponent",
                channel: output.channel,
                action: "setVolume",
                percentVolume: "0",
                rampTime: 0,
            },
        );
        script.jobs[output.job] = timeoutJob(
            output.job,
            output.seconds,
            `finishPulse('${output.channel}');`,
        );
        if (output.kind === "estim") {
            script.jobs[output.shockJob] = timeoutJob(
                output.shockJob,
                output.shockSeconds,
                `finishShock('${output.channel}');`,
            );
        }
    }

    script.initialActions.push(
        { type: "updateVariable", variable: "idleSeconds", value: "120" },
    );
    script.jobs.IdleStop = timeoutJob("IdleStop", "idleSeconds", "onIdleTimeout();");
    const routes = {
        groups: {
            ItemNeck: ["part-vibrator-a"],
            ItemNeckAccessories: ["part-vibrator-a"],
            ItemNipples: ["part-vibrator-b"],
            ItemNipplesPiercings: ["part-vibrator-b"],
            ItemBreast: ["part-vibrator-b"],
            ItemArms: ["part-vibrator-c"],
            ItemTorso: ["part-vibrator-c"],
            ItemLegs: ["part-vibrator-d"],
            ItemFeet: ["part-vibrator-d"],
            ItemBoots: ["part-vibrator-d"],
            ItemPelvis: ["generic-1-a"],
            ItemVulva: ["generic-1-a"],
            ItemVulvaPiercings: ["generic-1-a"],
            ItemButt: ["part-rotator-a"],
        },
        caps: Object.fromEntries(outputs.map((output) => [output.channel, output.kind === "estim" ? 15 : 30])),
        events: {
            roomJoin: ["generic-1-a"],
            roomLeave: ["generic-1-a"],
            casinoLoss: ["generic-1-a"],
        },
        locations: [],
    };
    const routeControl = script.controls.find((control) => control.id === "routeConfig");
    if (!routeControl) throw new Error("Missing routeConfig control");
    routeControl.value = JSON.stringify(routes);
    script.customFunctions = source;
    return script;
}

const expected = makeExport(current);

if (process.argv.includes("--check")) {
    if (JSON.stringify(current) !== JSON.stringify(expected)) {
        console.error("Script export is stale; run node scripts/veratown-event-router/build-export.mjs");
        process.exitCode = 1;
    }
} else {
    await writeFile(scriptPath, `${JSON.stringify(expected, null, 2)}\n`);
}
