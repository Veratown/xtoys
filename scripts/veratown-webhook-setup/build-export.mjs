import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { installVeratownWebhook, VERATOWN_ALL_ACTIONS } from "../shared/veratown-webhook.mjs";

const directory = dirname(fileURLToPath(import.meta.url));
const scriptPath = join(directory, "veratown-webhook-setup.json");
const script = {
    initialActions: [
        {
            type: "updateVariable",
            variable: "response",
            value: "Waiting for a Veratown message.",
        },
    ],
    finalActions: [],
    globalTriggers: [],
    jobs: {},
    queues: [],
    channels: {},
    controls: [
        {
            type: "header",
            name: "Veratown webhook setup",
            description: "Create a private XToys webhook and display the latest Veratown response without JavaScript.",
        },
        {
            id: "response",
            type: "textarea",
            name: "Latest Veratown response",
            value: "Waiting for a Veratown message.",
            description: "The verification code appears here after !xtoys link.",
        },
    ],
    controlPresets: [],
    media: {
        audio: {},
        voices: {},
        patterns: {},
    },
};
installVeratownWebhook(script, "response", VERATOWN_ALL_ACTIONS);
const output = `${JSON.stringify(script, null, 2)}\n`;

if (process.argv.includes("--check")) {
    const current = await readFile(scriptPath, "utf8");
    if (current !== output) {
        console.error("XToys export is stale; run node scripts/veratown-webhook-setup/build-export.mjs");
        process.exitCode = 1;
    }
} else {
    await writeFile(scriptPath, output);
}
