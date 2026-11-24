import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { installVeratownWebhook, VERATOWN_LIFECYCLE_ACTIONS } from "../shared/veratown-webhook.mjs";

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
        ...outputChannels,
    };
    script.controls = script.controls.filter((control) => control.id !== "routeConfig");
    const header = script.controls.find(
        (control) => control.type === "header" && control.name === "Veratown event router",
    );
    if (!header) throw new Error("Missing Veratown event router header");
    header.description = "Fixed body-group, event, and location routes; no Routing JSON variable.";
    const statusControl = script.controls.find((control) => control.id === "status");
    if (!statusControl) throw new Error("Missing visible status control");
    statusControl.type = "textarea";
    statusControl.name = "Latest Veratown response";
    statusControl.description = "Verification code and latest Veratown response.";
    installVeratownWebhook(script, "status", VERATOWN_LIFECYCLE_ACTIONS);
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
