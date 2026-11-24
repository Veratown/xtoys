import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { installVeratownWebhook } from "../shared/veratown-webhook.mjs";

const directory = dirname(fileURLToPath(import.meta.url));
const scriptPath = join(directory, "veratown-event-control.json");
const outputChannels = [
    { id: "T", channel: "generic-1-a", type: "generic-1", label: "Tremblr", group: "ItemPelvis" },
    { id: "A", channel: "part-vibrator-a", type: "part-vibrator", label: "Vibrator A", group: "ItemVulva" },
    { id: "B", channel: "part-vibrator-b", type: "part-vibrator", label: "Vibrator B", group: "ItemButt" },
    { id: "C", channel: "part-vibrator-c", type: "part-vibrator", label: "Vibrator C", group: "ItemNipples" },
    { id: "D", channel: "part-vibrator-d", type: "part-vibrator", label: "Vibrator D", group: "ItemNeck" },
    { id: "R", channel: "part-rotator-a", type: "part-rotator", label: "Rotator A", group: "off" },
    { id: "E", channel: "part-estim-a", type: "part-estim", label: "DG-LAB A", group: "off", estim: true },
    { id: "F", channel: "part-estim-b", type: "part-estim", label: "DG-LAB B", group: "off", estim: true },
];
const mechanicalOutputs = outputChannels.filter((output) => !output.estim);
const targetOptions = ["off", ...outputChannels.map((output) => output.label), "All"];
const gameEvents = [
    { action: "vtCasinoResult", toggle: "gameCasino", target: "Casino", speech: "Casino result: {trigger-outcome}.", filter: '{trigger-outcome} == "loss"' },
    { action: "vtHotSeatSelected", toggle: "gameHotSeat", target: "Hot Seat selection", speech: "Hot Seat selection." },
    { action: "vtHotSeatReleased", toggle: "gameHotSeat", target: "Hot Seat result", speech: "Hot Seat result: {trigger-outcome}.", filter: '{trigger-outcome} == "bluff_exposed"' },
    { action: "vtTruthDareAssigned", toggle: "gameTruthDare", target: "Truth or Dare assigned", speech: "Truth or Dare: {trigger-kind} assigned." },
    { action: "vtTruthDareResolved", toggle: "gameTruthDare", target: "Truth or Dare result", speech: "Truth or Dare: {trigger-outcome}." },
    { action: "vtDilemmaResult", toggle: "gameDilemma", target: "Dilemma result", speech: "Dilemma result: {trigger-outcome}." },
    { action: "vtStagedTablePhase", toggle: "gameStagedTable", target: "Staged Table phase", speech: "Staged Table phase: {trigger-phase}." },
    { action: "vtStagedTableAppearance", toggle: "gameStagedTable", target: "Staged Table appearance", speech: "Staged Table: {trigger-state}." },
    { action: "vtShowerStarted", toggle: "gameShower", target: "Shower started", speech: "The shower sequence started." },
    { action: "vtShowerEnded", toggle: "gameShower", target: "Shower ended", speech: "Shower ended: {trigger-reason}." },
    { action: "vtTrickOrTreatOutcome", toggle: "gameTrickOrTreat", target: "Trick or treat result", speech: "Trick or treat: {trigger-outcome}." },
];
const locationSlots = 5;

const controls = [
    { type: "header", name: "Veratown event control", description: "Standalone webhook, event routing, voice control, and TTS. Starts paused." },
    { id: "paused", type: "toggle", name: "Pause all local outputs", up: "off", down: "on", value: "on" },
    { id: "response", type: "textarea", name: "Latest Veratown response", value: "Waiting for a Veratown message.", description: "Verification codes appear here; they are not spoken aloud." },
    { id: "ttsEnabled", type: "toggle", name: "Speak game, location, and control updates", up: "off", down: "on", value: "on" },
    { id: "ttsCooldown", type: "slider", name: "TTS announcement interval (seconds)", min: 2, max: 10, value: 4 },
    { type: "header", name: "BC body-group routing", description: "Enter an exact BC Item group key for each output, or off. More than one output may use the same group." },
    { id: "followToyEvents", type: "toggle", name: "Follow observed BC vibration levels", up: "off", down: "on", value: "on" },
    { id: "rampSeconds", type: "slider", name: "Output ramp time (seconds)", min: 0, max: 5, value: 1 },
    { id: "followInflation", type: "toggle", name: "Mirror BC inflation level to a vibration output", up: "off", down: "on", value: "on" },
    { id: "inflationTarget", type: "select", name: "Inflation event vibration output", options: ["off", ...mechanicalOutputs.map((output) => output.label)], value: "Vibrator A" },
    { id: "itemPulses", type: "toggle", name: "Pulse when an item is worn", up: "off", down: "on", value: "off" },
    { id: "itemPercent", type: "slider", name: "Item pulse level (%)", min: 0, max: 15, value: 5 },
    { id: "itemSeconds", type: "slider", name: "Item pulse duration (seconds)", min: 0.5, max: 5, value: 1 },
    { id: "activityPulses", type: "toggle", name: "Pulse for non-shock BC activity", up: "off", down: "on", value: "off" },
    { id: "activityPercent", type: "slider", name: "Activity pulse level (%)", min: 0, max: 15, value: 5 },
    { id: "activitySeconds", type: "slider", name: "Activity pulse duration (seconds)", min: 0.5, max: 5, value: 1 },
    { id: "activityOtherPulses", type: "toggle", name: "Pulse when you act on another member", up: "off", down: "on", value: "off" },
    { id: "shockCueEnabled", type: "toggle", name: "Use vibration cue for observed BC shocks", up: "off", down: "on", value: "on" },
    { id: "shockCueMax", type: "slider", name: "Maximum shock-event vibration cue (%)", min: 0, max: 10, value: 5 },
    { id: "stimEnabled", type: "toggle", name: "Allow capped standard DG-LAB stimulation (no shock mode)", up: "off", down: "on", value: "off" },
    ...outputChannels.flatMap((output) => [
        { id: `group${output.id}`, type: "input", name: `${output.label} follows BC group`, value: output.group },
        { id: `max${output.id}`, type: "slider", name: `${output.label} maximum level (%)`, min: 0, max: output.estim ? 10 : 30, value: output.estim ? 0 : 20 },
    ]),
    { type: "header", name: "Game events" },
    { id: "gameTarget", type: "select", name: "Game event output", options: targetOptions, value: "off" },
    { id: "gamePercent", type: "slider", name: "Game pulse level (%)", min: 0, max: 20, value: 5 },
    { id: "gameSeconds", type: "slider", name: "Game pulse duration (seconds)", min: 0.5, max: 5, value: 1 },
    { id: "gameCasino", type: "toggle", name: "Casino losses", up: "off", down: "on", value: "on" },
    { id: "gameHotSeat", type: "toggle", name: "Hot Seat events", up: "off", down: "on", value: "on" },
    { id: "gameTruthDare", type: "toggle", name: "Truth or Dare events", up: "off", down: "on", value: "on" },
    { id: "gameDilemma", type: "toggle", name: "Dilemma events", up: "off", down: "on", value: "on" },
    { id: "gameStagedTable", type: "toggle", name: "Staged Table events", up: "off", down: "on", value: "on" },
    { id: "gameShower", type: "toggle", name: "Shower events", up: "off", down: "on", value: "on" },
    { id: "gameTrickOrTreat", type: "toggle", name: "Trick-or-treat events", up: "off", down: "on", value: "on" },
    { type: "header", name: "Room events" },
    { id: "roomEvents", type: "toggle", name: "Pulse for room and chat events", up: "off", down: "on", value: "off" },
    { id: "roomTarget", type: "select", name: "Room event output", options: targetOptions, value: "off" },
    { id: "roomPercent", type: "slider", name: "Room event pulse level (%)", min: 0, max: 15, value: 5 },
    { id: "roomSeconds", type: "slider", name: "Room event pulse duration (seconds)", min: 0.5, max: 5, value: 1 },
    { type: "header", name: "Location rules", description: "Five exact location-key slots. Slot 1 starts as asylum; blank keys are ignored." },
    ...Array.from({ length: locationSlots }, (_, index) => {
        const slot = index + 1;
        return [
            { type: "header", name: `Location slot ${slot}` },
            { id: `locationKey${slot}`, type: "input", name: `Location ${slot} key`, value: slot === 1 ? "asylum" : "" },
            { id: `locationSide${slot}`, type: "select", name: `Location ${slot} trigger`, options: ["both", "enter", "leave"], value: "both" },
            { id: `locationTarget${slot}`, type: "select", name: `Location ${slot} output`, options: targetOptions, value: "off" },
            { id: `locationPercent${slot}`, type: "slider", name: `Location ${slot} pulse level (%)`, min: 0, max: 20, value: 5 },
            { id: `locationSeconds${slot}`, type: "slider", name: `Location ${slot} pulse duration (seconds)`, min: 0.5, max: 5, value: 1 },
        ];
    }).flat(),
    { type: "header", name: "Voice commands" },
    { id: "voiceEnabled", type: "toggle", name: "Enable voice control", up: "off", down: "on", value: "on" },
    { id: "voiceGroup", type: "input", name: "BC group controlled by voice", value: "ItemVulva" },
    { id: "voiceLevel", type: "select", name: "Current BC vibrator level", options: ["off", "low", "medium", "high", "maximum"], value: "off" },
    { id: "voiceMax", type: "select", name: "Maximum BC vibrator level", options: ["off", "low", "medium", "high", "maximum"], value: "medium" },
    { id: "safeWord", type: "input", name: "Voice safeword phrase", value: "veratown stop" },
    { id: "voiceEmotes", type: "toggle", name: "Allow spoken emotes", up: "off", down: "on", value: "on" },
    { type: "header", name: "Safety notes", description: "BC shock events produce a capped vibration cue only. No shock or shock-collar output is included." },
];

const script = {
    initialActions: [
        { type: "updateVariable", variable: "paused", value: "on" },
        { type: "updateVariable", variable: "response", value: "Waiting for a Veratown message." },
        { type: "updateVariable", variable: "ttsText", value: "" },
        ...outputChannels.flatMap((output) => [
            { type: "updateVariable", variable: `toy${output.id}`, value: "0" },
            { type: "updateVariable", variable: `inflate${output.id}`, value: "0" },
            { type: "updateVariable", variable: `boost${output.id}`, value: "0" },
            { type: "updateVariable", variable: `pulseSeconds${output.id}`, value: "1" },
            ...(output.estim ? [{ type: "updateComponent", channel: output.channel, action: "setMode", mode: "standard" }] : []),
            { type: "updateComponent", channel: output.channel, action: "setVolume", percentVolume: "0", rampTime: 0 },
        ]),
    ],
    finalActions: outputChannels.flatMap((output) => [
        { type: "updateJob", job: `Pulse${output.id}`, action: "stop" },
        ...(output.estim ? [{ type: "updateComponent", channel: output.channel, action: "setMode", mode: "standard" }] : []),
        { type: "updateComponent", channel: output.channel, action: "setVolume", percentVolume: "0", rampTime: 0 },
    ]),
    globalTriggers: [],
    jobs: {},
    queues: [],
    channels: {
        ...Object.fromEntries(outputChannels.map((output) => [
            output.channel,
            { type: output.type, name: output.label },
        ])),
        "speech-recognition-a": { type: "speech-recognition", name: "Veratown voice commands" },
        "speech-synthesis-a": { type: "speech-synthesis", name: "Veratown announcements" },
    },
    controls,
    controlPresets: [],
    media: { audio: {}, voices: {}, patterns: {} },
};

installVeratownWebhook(script, "response", undefined, { outbound: true });

function condition(expression) {
    return { requiredExpression: expression };
}

function updateVariable(variable, value, requiredExpression) {
    return {
        type: "updateVariable",
        variable,
        value,
        ...(requiredExpression ? condition(requiredExpression) : {}),
    };
}

function updateVolume(output, percentVolume, requiredExpression) {
    const actions = [];
    if (output.estim) {
        actions.push({
            type: "updateComponent",
            channel: output.channel,
            action: "setMode",
            mode: "standard",
            ...(requiredExpression ? condition(requiredExpression) : {}),
        });
    }
    actions.push({
        type: "updateComponent",
        channel: output.channel,
        action: "setVolume",
        percentVolume,
        rampTime: "{rampSeconds}",
        ...(requiredExpression ? condition(requiredExpression) : {}),
    });
    return actions;
}

function outputBase(output) {
    return `max({toy${output.id}}, {inflate${output.id}})`;
}

function pulseActionsForOutput(output, targetVariable, level, seconds, requiredExpression, targetGroup) {
    const targetMatches = targetGroup
        ? `{group${output.id}} == {trigger-assetGroupName}`
        : `({${targetVariable}} == "All" or {${targetVariable}} == "${output.label}")`;
    const requirements = [
        '{paused} == "off"',
        requiredExpression,
        targetMatches,
        ...(output.estim ? ['{stimEnabled} == "on"'] : []),
    ].filter(Boolean);
    const gate = requirements.join(" and ");
    return [
        updateVariable(`boost${output.id}`, `min({max${output.id}}, max({boost${output.id}}, ${level}))`, gate),
        updateVariable(`pulseSeconds${output.id}`, seconds, gate),
        {
            type: "updateJob",
            job: `Pulse${output.id}`,
            action: "start",
            restart: true,
            ...condition(gate),
        },
    ];
}

function voiceLevelActions(level, responseText, speechText) {
    return [
        updateVariable("voiceLevel", level),
        {
            type: "updateComponent",
            channel: "webhook-a",
            action: "send",
            webhookAction: "vtSetVibe",
            webhookData: [
                { key: "group", value: "{voiceGroup}" },
                { key: "level", value: "{voiceLevel}" },
            ],
        },
        updateVariable("response", responseText),
        ...speakActions(speechText),
    ];
}

function pulseActions(targetVariable, level, seconds, requiredExpression, targetGroup) {
    return outputChannels.flatMap((output) =>
        pulseActionsForOutput(output, targetVariable, level, seconds, requiredExpression, targetGroup),
    );
}

function speakActions(text, extraGate) {
    const gate = [
        '{ttsEnabled} == "on"',
        ...(extraGate ? [`(${extraGate})`] : []),
    ].join(" and ");
    return [
        updateVariable("ttsText", text, gate),
        {
            type: "updateJob",
            job: "Speak",
            action: "start",
            restart: true,
            ...condition(gate),
        },
    ];
}

for (const output of outputChannels) {
    script.jobs[`Pulse${output.id}`] = {
        steps: {
            START: {
                actions: updateVolume(output, `max(${outputBase(output)}, {boost${output.id}})`),
                triggers: [
                    {
                        type: "stepState",
                        event: "timer",
                        amount: `{pulseSeconds${output.id}}`,
                        actions: [
                            updateVariable(`boost${output.id}`, "0"),
                            ...updateVolume(output, outputBase(output)),
                            { type: "updateJob", job: `Pulse${output.id}`, action: "stop" },
                        ],
                    },
                ],
            },
        },
    };
}

script.jobs.Speak = {
    steps: {
        START: {
            actions: [
                { type: "updateComponent", channel: "speech-synthesis-a", action: "setText", text: "{ttsText}" },
            ],
            triggers: [
                {
                    type: "stepState",
                    event: "timer",
                    amount: "{ttsCooldown}",
                    actions: [{ type: "updateJob", job: "Speak", action: "stop" }],
                },
            ],
        },
    },
};

const pauseActions = [
    ...outputChannels.flatMap((output) => [
        { type: "updateJob", job: `Pulse${output.id}`, action: "stop", ...condition('{paused} == "on"') },
        updateVariable(`toy${output.id}`, "0", '{paused} == "on"'),
        updateVariable(`inflate${output.id}`, "0", '{paused} == "on"'),
        updateVariable(`boost${output.id}`, "0", '{paused} == "on"'),
        ...updateVolume(output, "0", '{paused} == "on"'),
    ]),
];
script.globalTriggers.push({
    type: "variableChange",
    variable: "paused",
    valueChange: null,
    actions: pauseActions,
});

for (const output of outputChannels) {
    const groupMatch = `{trigger-assetGroupName} == {group${output.id}}`;
    const enabled = [
        '{paused} == "off"',
        '{followToyEvents} == "on"',
        groupMatch,
        ...(output.estim ? ['{stimEnabled} == "on"'] : []),
    ].join(" and ");
    const volume = `max(${outputBase(output)}, {boost${output.id}})`;
    script.globalTriggers.push({
        type: "componentState",
        channel: "webhook-a",
        action: "toyEvent",
        actions: [
            updateVariable(`toy${output.id}`, `min({max${output.id}}, max(0, {trigger-level}) * {max${output.id}} / 4)`, enabled),
            ...updateVolume(output, volume, enabled),
        ],
    });

    if (!output.estim) {
        const inflationGate = [
            '{paused} == "off"',
            '{followInflation} == "on"',
            `{inflationTarget} == "${output.label}"`,
            groupMatch,
        ].join(" and ");
        script.globalTriggers.push({
            type: "componentState",
            channel: "webhook-a",
            action: "inflationEvent",
            actions: [
                updateVariable(`inflate${output.id}`, `min({max${output.id}}, max(0, {trigger-level}) * {max${output.id}} / 4)`, inflationGate),
                ...updateVolume(output, volume, inflationGate),
            ],
        });
    }

    const removedGate = [
        '{paused} == "off"',
        groupMatch,
        ...(output.estim ? ['{stimEnabled} == "on"'] : []),
    ].join(" and ");
    script.globalTriggers.push({
        type: "componentState",
        channel: "webhook-a",
        action: "itemRemoved",
        actions: [
            updateVariable(`toy${output.id}`, "0", removedGate),
            ...updateVolume(output, volume, removedGate),
        ],
    });
}

script.globalTriggers.push({
    type: "componentState",
    channel: "webhook-a",
    action: "itemAdded",
    actions: pulseActions("", "{itemPercent}", "{itemSeconds}", '{itemPulses} == "on"', true),
});

script.globalTriggers.push({
    type: "componentState",
    channel: "webhook-a",
    action: "activityEvent",
    actions: [
        ...pulseActions(
            "",
            "{activityPercent}",
            "{activitySeconds}",
            [
                '{activityPulses} == "on"',
                '{trigger-actionName} != "ShockLow"',
                '{trigger-actionName} != "ShockMed"',
                '{trigger-actionName} != "ShockHigh"',
            ].join(" and "),
            true,
        ),
        ...mechanicalOutputs.flatMap((output) =>
            ["ShockLow", "ShockMed", "ShockHigh"].flatMap((actionName, index) => {
                const level = [3, 5, 7][index];
                const shockGate = [
                    '{paused} == "off"',
                    '{shockCueEnabled} == "on"',
                    `{group${output.id}} == {trigger-assetGroupName}`,
                    `{trigger-actionName} == "${actionName}"`,
                ].join(" and ");
                return [
                    updateVariable(`boost${output.id}`, `min({max${output.id}}, min({shockCueMax}, ${level}))`, shockGate),
                    updateVariable(`pulseSeconds${output.id}`, "0.5", shockGate),
                    {
                        type: "updateJob",
                        job: `Pulse${output.id}`,
                        action: "start",
                        restart: true,
                        ...condition(`{paused} == "off" and ${shockGate}`),
                    },
                ];
            }),
        ),
        updateVariable(
            "response",
            "Observed a BC shock event.",
            '{trigger-actionName} == "ShockLow" or {trigger-actionName} == "ShockMed" or {trigger-actionName} == "ShockHigh"',
        ),
        ...speakActions(
            "Observed a BC shock event.",
            '{trigger-actionName} == "ShockLow" or {trigger-actionName} == "ShockMed" or {trigger-actionName} == "ShockHigh"',
        ),
    ],
});

script.globalTriggers.push({
    type: "componentState",
    channel: "webhook-a",
    action: "activityOnOtherEvent",
    actions: [
        updateVariable("response", "Veratown observed an activity you performed on another member."),
        ...pulseActions(
            "",
            "{activityPercent}",
            "{activitySeconds}",
            [
                '{activityOtherPulses} == "on"',
                '{trigger-actionName} != "ShockLow"',
                '{trigger-actionName} != "ShockMed"',
                '{trigger-actionName} != "ShockHigh"',
            ].join(" and "),
            true,
        ),
    ],
});

for (const event of gameEvents) {
    const gameGate = [
        `{${event.toggle}} == "on"`,
        ...(event.filter ? [event.filter] : []),
    ].join(" and ");
    const actions = [
        updateVariable("response", `Veratown game event: ${event.target}.`),
        ...pulseActions("gameTarget", "{gamePercent}", "{gameSeconds}", gameGate),
        ...speakActions(`Veratown game event: ${event.speech}`),
    ];
    script.globalTriggers.push({
        type: "componentState",
        channel: "webhook-a",
        action: event.action,
        actions,
    });
}

for (const eventAction of ["vtLocationEntered", "vtLocationLeft"]) {
    const entered = eventAction === "vtLocationEntered";
    const side = entered ? "enter" : "leave";
    const responseText = entered ? "Entered location {trigger-location}." : "Left location {trigger-location}.";
    const actions = [
        updateVariable("response", `Veratown: ${responseText}`),
        ...speakActions(`Veratown: ${responseText}`),
    ];
    for (let slot = 1; slot <= locationSlots; slot++) {
        const sideMatch = `{locationSide${slot}} == "both" or {locationSide${slot}} == "${side}"`;
        const slotGate = [
            `{locationKey${slot}} != ""`,
            `{trigger-location} == {locationKey${slot}}`,
            `(${sideMatch})`,
        ].join(" and ");
        actions.push(
            ...pulseActions(
                `locationTarget${slot}`,
                `{locationPercent${slot}}`,
                `{locationSeconds${slot}}`,
                slotGate,
            ),
        );
    }
    script.globalTriggers.push({
        type: "componentState",
        channel: "webhook-a",
        action: eventAction,
        actions,
    });
}

for (const [action, eventText] of [
    ["vtRoomJoin", "Another room member joined."],
    ["vtRoomLeave", "Another room member left."],
    ["vtSpokenTo", "Someone spoke to you."],
]) {
    const actions = [
        updateVariable("response", `Veratown: ${eventText}`),
        ...pulseActions("roomTarget", "{roomPercent}", "{roomSeconds}", '{roomEvents} == "on"'),
        ...speakActions(`Veratown: ${eventText}`),
    ];
    script.globalTriggers.push({
        type: "componentState",
        channel: "webhook-a",
        action,
        actions,
    });
}

script.globalTriggers.push({
    type: "variableChange",
    variable: "stimEnabled",
    valueChange: null,
    actions: outputChannels.filter((output) => output.estim).flatMap((output) => [
        { type: "updateJob", job: `Pulse${output.id}`, action: "stop", ...condition('{stimEnabled} == "off"') },
        updateVariable(`toy${output.id}`, "0", '{stimEnabled} == "off"'),
        updateVariable(`inflate${output.id}`, "0", '{stimEnabled} == "off"'),
        updateVariable(`boost${output.id}`, "0", '{stimEnabled} == "off"'),
        ...updateVolume(output, "0", '{stimEnabled} == "off"'),
    ]),
});

script.globalTriggers.push({
    type: "componentState",
    channel: "webhook-a",
    action: "toyEvent",
    requiredExpression: "{trigger-assetGroupName} == {voiceGroup}",
    actions: [
        updateVariable(
            "voiceLevel",
            '{trigger-level} <= 0 ? "off" : {trigger-level} == 1 ? "low" : {trigger-level} == 2 ? "medium" : {trigger-level} == 3 ? "high" : "maximum"',
        ),
    ],
});

script.globalTriggers.push({
    type: "componentState",
    channel: "speech-recognition-a",
    word: "{safeWord}",
    isFinal: true,
    ignoreTTS: true,
    actions: [
        updateVariable("paused", "on"),
        { type: "updateComponent", channel: "webhook-a", action: "send", webhookAction: "vtStop", webhookData: [] },
        updateVariable("response", "Safeword received. Local outputs stopped; Veratown stop requested."),
        ...speakActions("Safeword received. Outputs stopped."),
    ],
});

script.globalTriggers.push({
    type: "componentState",
    channel: "speech-recognition-a",
    word: "veratown raise",
    isFinal: true,
    ignoreTTS: true,
    requiredExpression: '{voiceEnabled} == "on" and {paused} == "off"',
    actions: voiceLevelActions(
        '{voiceMax} == "off" ? "off" : {voiceLevel} == "off" ? "low" : {voiceLevel} == "low" ? ({voiceMax} == "low" ? "low" : "medium") : {voiceLevel} == "medium" ? ({voiceMax} == "low" ? "low" : {voiceMax} == "medium" ? "medium" : "high") : {voiceLevel} == "high" ? ({voiceMax} == "maximum" ? "maximum" : {voiceMax}) : {voiceMax}',
        "Asked Veratown to raise the BC vibrator one standard step.",
        "Raising the BC vibrator one standard step.",
    ),
});

script.globalTriggers.push({
    type: "componentState",
    channel: "speech-recognition-a",
    word: "veratown lower",
    isFinal: true,
    ignoreTTS: true,
    requiredExpression: '{voiceEnabled} == "on" and {paused} == "off"',
    actions: voiceLevelActions(
        '{voiceLevel} == "maximum" ? ({voiceMax} == "maximum" ? "high" : {voiceMax}) : {voiceLevel} == "high" ? ({voiceMax} == "off" ? "off" : {voiceMax} == "low" ? "low" : "medium") : {voiceLevel} == "medium" ? ({voiceMax} == "off" ? "off" : "low") : "off"',
        "Asked Veratown to lower the BC vibrator one standard step.",
        "Lowering the BC vibrator one standard step.",
    ),
});

script.globalTriggers.push({
    type: "componentState",
    channel: "speech-recognition-a",
    word: "veratown status",
    isFinal: true,
    ignoreTTS: true,
    requiredExpression: '{voiceEnabled} == "on"',
    actions: [
        {
            type: "updateComponent",
            channel: "webhook-a",
            action: "send",
            webhookAction: "vtQueryState",
            webhookData: [],
        },
        updateVariable("response", "Requested observed state from Veratown."),
        ...speakActions("Checking Veratown state."),
    ],
});

for (const emote of ["shiver", "squirm", "gasp", "blush", "moan"]) {
    script.globalTriggers.push({
        type: "componentState",
        channel: "speech-recognition-a",
        word: `veratown emote ${emote}`,
        isFinal: true,
        ignoreTTS: true,
        requiredExpression: '{voiceEnabled} == "on" and {voiceEmotes} == "on"',
        actions: [
            {
                type: "updateComponent",
                channel: "webhook-a",
                action: "send",
                webhookAction: "vtEmote",
                webhookData: [{ key: "template", value: emote }],
            },
            updateVariable("response", `Asked Veratown to send the ${emote} emote.`),
            ...speakActions(`Requested ${emote}.`),
        ],
    });
}

for (const action of ["bridgeVerify", "bridgeTest", "bridgeState", "bridgeStop", "vtResult"]) {
    const trigger = script.globalTriggers.find(
        (entry) => entry.type === "componentState" && entry.channel === "webhook-a" && entry.action === action,
    );
    if (!trigger) throw new Error(`Missing shared webhook trigger: ${action}`);
    const tts = {
        bridgeVerify: "Veratown sent a verification code. Check the response panel.",
        bridgeTest: "Veratown test event received.",
        bridgeState: "Veratown returned observed state.",
        bridgeStop: "Veratown stopped the bridge.",
        vtResult: "Veratown replied to a control request.",
    }[action];
    trigger.actions.push(...speakActions(tts));
    if (action === "bridgeStop") trigger.actions.push(updateVariable("paused", "on"));
}

const output = `${JSON.stringify(script, null, 2)}\n`;
if (process.argv.includes("--check")) {
    const current = await readFile(scriptPath, "utf8");
    if (current !== output) {
        console.error("XToys export is stale; run node scripts/veratown-event-control/build-export.mjs");
        process.exitCode = 1;
    }
} else {
    await writeFile(scriptPath, output);
}
