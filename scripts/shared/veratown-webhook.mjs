export const VERATOWN_LIFECYCLE_ACTIONS = [
    "bridgeVerify",
    "bridgeTest",
    "bridgeState",
    "bridgeStop",
    "vtResult",
];

export const VERATOWN_ALL_ACTIONS = [
    ...VERATOWN_LIFECYCLE_ACTIONS,
    "toyEvent",
    "inflationEvent",
    "arousalUpdate",
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

function responseText(action) {
    switch (action) {
        case "bridgeVerify":
            return "Verification code: {trigger-code}\nWhisper !xtoys verify {trigger-code} within 5 minutes.";
        case "bridgeTest":
            return "Veratown test event received.";
        case "bridgeState":
            return "Veratown state response received. Present: {trigger-present}; fresh: {trigger-fresh}.";
        case "bridgeStop":
            return "Veratown stopped the bridge. Reason: {trigger-reason}.";
        case "vtResult":
            return "Veratown control result: {trigger-status}. Reason: {trigger-reason}.";
        case "arousalUpdate":
            return "BC arousal: {trigger-progress}% (bucket {trigger-bucket}%, step {trigger-step}%).";
        default:
            return `Veratown event received: ${action}`;
    }
}

export function installVeratownWebhook(
    script,
    responseVariable,
    actions = VERATOWN_LIFECYCLE_ACTIONS,
    { outbound = false } = {},
) {
    if (!script.channels || typeof script.channels !== "object") script.channels = {};
    if (!Array.isArray(script.controls)) {
        throw new Error("Script controls must include a visible Veratown response variable");
    }
    if (!script.controls.some((control) => control.id === responseVariable)) {
        throw new Error(`Missing visible response control: ${responseVariable}`);
    }

    script.channels["webhook-a"] = {
        type: "webhook",
        outbound,
        hideWebhookInfo: false,
    };

    const actionSet = new Set(actions);
    script.globalTriggers = (script.globalTriggers || []).filter(
        (trigger) =>
            trigger.type !== "componentState" ||
            trigger.channel !== "webhook-a" ||
            !actionSet.has(trigger.action),
    );
    script.globalTriggers.push(
        ...actions.map((action) => ({
            type: "componentState",
            channel: "webhook-a",
            action,
            actions: [
                {
                    type: "updateVariable",
                    variable: responseVariable,
                    value: responseText(action),
                },
            ],
        })),
    );

    return script;
}
