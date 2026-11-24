var OUTPUTS = [
  { channel: "generic-1-a", job: "PulseA", seconds: "pulseSecondsA", kind: "vibe" },
  { channel: "part-vibrator-a", job: "PulseB", seconds: "pulseSecondsB", kind: "vibe" },
  { channel: "part-vibrator-b", job: "PulseC", seconds: "pulseSecondsC", kind: "vibe" },
  { channel: "part-vibrator-c", job: "PulseD", seconds: "pulseSecondsD", kind: "vibe" },
  { channel: "part-vibrator-d", job: "PulseE", seconds: "pulseSecondsE", kind: "vibe" },
  { channel: "part-rotator-a", job: "PulseF", seconds: "pulseSecondsF", kind: "rotator" },
  { channel: "part-rotator-b", job: "PulseG", seconds: "pulseSecondsG", kind: "rotator" },
  { channel: "part-rotator-c", job: "PulseH", seconds: "pulseSecondsH", kind: "rotator" },
  { channel: "part-estim-a", job: "PulseI", seconds: "pulseSecondsI", kind: "estim", shockJob: "ShockI", shockSeconds: "shockSecondsI" },
  { channel: "part-estim-b", job: "PulseJ", seconds: "pulseSecondsJ", kind: "estim", shockJob: "ShockJ", shockSeconds: "shockSecondsJ" },
  { channel: "part-estim-c", job: "PulseK", seconds: "pulseSecondsK", kind: "estim", shockJob: "ShockK", shockSeconds: "shockSecondsK" },
  { channel: "part-estim-d", job: "PulseL", seconds: "pulseSecondsL", kind: "estim", shockJob: "ShockL", shockSeconds: "shockSecondsL" },
  { channel: "part-estim-e", job: "PulseM", seconds: "pulseSecondsM", kind: "estim", shockJob: "ShockM", shockSeconds: "shockSecondsM" }
];

var GROUP_ROUTES = {
  ItemVulva: ["part-vibrator-a"],
  ItemVulvaPiercings: ["part-vibrator-a"],
  ItemButt: ["part-vibrator-b"],
  ItemNipples: ["part-vibrator-c"],
  ItemNipplesPiercings: ["part-vibrator-c"],
  ItemBreast: ["part-vibrator-c"],
  ItemNeck: ["part-vibrator-d"],
  ItemPelvis: ["part-vibrator-a"],
  ItemTorso: ["part-vibrator-c"]
};
var EVENT_ROUTES = {
  roomJoin: ["part-vibrator-a"],
  roomLeave: ["part-vibrator-a", "part-vibrator-b", "part-vibrator-c", "part-vibrator-d"],
  casinoLoss: ["part-estim-a"]
};
var LOCATION_ROUTES = [
  { key: "asylum", channels: ["part-estim-a"], percent: 100, seconds: 1 }
];
var groupLevels = {};
var outputsByChannel = {};
var pulseLevels = {};
var shockActive = {};

function isOn(name) {
  return String(getVariable(name)) === "on";
}

function asNumber(value, fallback) {
  var number = Number(value);
  return isFinite(number) ? number : fallback;
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function setStatus(message) {
  setVariable("status", String(message));
  callAction({ type: "updateScript", action: "setText", text: message });
}

function outputCap(output) {
  return output.kind === "estim" ? 15 : 30;
}

function groupTargets(group) {
  return GROUP_ROUTES[group] || [];
}

function setOutput(channel, level, rampSeconds) {
  var output = outputsByChannel[channel];
  if (!output) return;
  var cap = outputCap(output);
  var base = clamp(asNumber(level, 0), 0, cap);
  var pulse = clamp(asNumber(pulseLevels[channel], 0), 0, cap);
  var target = Math.max(base, pulse);
  if (output.kind === "estim" && shockActive[channel]) return;
  if (output.kind === "estim") {
    callAction({ type: "updateComponent", channel: channel, action: "setMode", mode: "standard" });
  }
  callAction({
    type: "updateComponent",
    channel: channel,
    action: "setVolume",
    percentVolume: target,
    rampTime: clamp(asNumber(rampSeconds, 0), 0, 5)
  });
}

function baseLevel(channel) {
  var maximum = 0;
  var group;
  for (group in groupLevels) {
    if (!groupLevels.hasOwnProperty(group) || groupTargets(group).indexOf(channel) < 0) continue;
    maximum = Math.max(maximum, clamp(asNumber(groupLevels[group], 0), 0, 4) / 4);
  }
  return outputCap(outputsByChannel[channel]) * maximum;
}

function refreshOutput(channel, rampSeconds) {
  setOutput(channel, baseLevel(channel), rampSeconds);
}

function refreshGroup(group) {
  var targets = groupTargets(group);
  for (var i = 0; i < targets.length; i++) {
    refreshOutput(targets[i], getVariable("rampSeconds"));
  }
}

function stopAllOutputs() {
  callAction({ type: "updateJob", job: "IdleStop", action: "stop" });
  for (var i = 0; i < OUTPUTS.length; i++) {
    var output = OUTPUTS[i];
    pulseLevels[output.channel] = 0;
    callAction({ type: "updateJob", job: output.job, action: "stop" });
    if (output.kind === "estim") {
      shockActive[output.channel] = false;
      callAction({ type: "updateJob", job: output.shockJob, action: "stop" });
      callAction({
        type: "updateComponent",
        channel: output.channel,
        action: "setShock2",
        percentVolume: 0,
        time: 0,
        shock: false
      });
    }
    callAction({
      type: "updateComponent",
      channel: output.channel,
      action: "setVolume",
      percentVolume: 0,
      rampTime: 0
    });
  }
  groupLevels = {};
}

function armIdleStop() {
  if (!isOn("idleStop") || isOn("paused")) return;
  callAction({
    type: "updateJob",
    job: "IdleStop",
    action: "start",
    restart: true
  });
}

function onIdleTimeout() {
  stopAllOutputs();
  setStatus("No recent Veratown events; outputs stopped by idle safety timer.");
}

function pulseOutput(channel, percent, seconds) {
  if (isOn("paused")) return;
  var output = outputsByChannel[channel];
  if (!output) return;
  var level = clamp(asNumber(percent, 0), 0, outputCap(output));
  if (level <= 0) return;

  pulseLevels[channel] = Math.max(asNumber(pulseLevels[channel], 0), level);
  setVariable(output.seconds, String(clamp(asNumber(seconds, 1), 0.25, 10)));
  setOutput(channel, baseLevel(channel), 0);
  armIdleStop();
  callAction({ type: "updateJob", job: output.job, action: "start", restart: true });
}

function shockOutput(channel, percent, seconds) {
  if (isOn("paused")) return;
  var output = outputsByChannel[channel];
  if (!output || output.kind !== "estim") return;
  var cap = Math.min(outputCap(output), clamp(asNumber(getVariable("shockCap"), 0), 0, 20));
  var level = clamp(asNumber(percent, 0), 0, cap);
  if (level <= 0) return;

  var duration = clamp(asNumber(seconds, 0.5), 0.5, 2);
  callAction({
    type: "updateComponent",
    channel: channel,
    action: "setShock2",
    percentVolume: level,
    time: duration,
    shock: true
  });
  shockActive[channel] = true;
  setVariable(output.shockSeconds, String(duration));
  armIdleStop();
  callAction({ type: "updateJob", job: output.shockJob, action: "start", restart: true });
}

function pulseTargets(channels, percent, seconds) {
  if (!Array.isArray(channels)) return;
  for (var i = 0; i < channels.length; i++) {
    var output = outputsByChannel[channels[i]];
    if (!output) continue;
    pulseOutput(output.channel, percent, seconds);
  }
}

function finishPulse(channel) {
  if (!outputsByChannel[channel]) return;
  pulseLevels[channel] = 0;
  refreshOutput(channel, getVariable("rampSeconds"));
}

function finishShock(channel) {
  if (!outputsByChannel[channel]) return;
  shockActive[channel] = false;
  callAction({
    type: "updateComponent",
    channel: channel,
    action: "setShock2",
    percentVolume: 0,
    time: 0,
    shock: false
  });
  callAction({ type: "updateComponent", channel: channel, action: "setMode", mode: "standard" });
  refreshOutput(channel, getVariable("rampSeconds"));
}

function onToyEvent(data, inflation) {
  if (isOn("paused") || !isOn("followToyEvents")) return;
  if (String(data["trigger-origin"] || "") === "bridge") return;
  if (inflation && !isOn("followInflation")) return;
  var group = String(data["trigger-assetGroupName"] || "");
  var level = Number(data["trigger-level"]);
  if (!group || !isFinite(level)) return;
  groupLevels[group] = clamp(level, 0, 4);
  armIdleStop();
  refreshGroup(group);
}

function onItemAdded(data) {
  if (isOn("paused") || !isOn("itemPulses")) return;
  var group = String(data["trigger-assetGroupName"] || "");
  var channels = groupTargets(group);
  pulseTargets(channels, getVariable("itemPercent"), getVariable("itemSeconds"));
}

function onItemRemoved(data) {
  if (isOn("paused")) return;
  var group = String(data["trigger-assetGroupName"] || "");
  if (!group) return;
  groupLevels[group] = 0;
  armIdleStop();
  refreshGroup(group);
}

function onActivity(data, isOther) {
  if (isOn("paused")) return;
  var actionName = String(data["trigger-actionName"] || "");
  var group = String(data["trigger-assetGroupName"] || "");
  if (!group) return;

  if (actionName === "ShockLow" || actionName === "ShockMed" || actionName === "ShockHigh") {
    if (!isOn("allowShockEvents") || isOther || !groupTargets(group).length) return;
    var fraction = actionName === "ShockLow" ? 1 / 3 :
      (actionName === "ShockMed" ? 2 / 3 : 1);
    shockOutput(
      "part-estim-a",
      asNumber(getVariable("shockCap"), 10) * fraction,
      getVariable("shockSeconds")
    );
    return;
  }
  if (!isOn("activityPulses") || (isOther && !isOn("allowOtherActivities"))) return;
  pulseTargets(groupTargets(group), getVariable("activityPercent"), getVariable("activitySeconds"));
}

function onRoomEvent(data, eventName) {
  if (isOn("paused") || !isOn("roomPulses")) return;
  if (String(data["trigger-who"] || "") !== "other") return;
  pulseTargets(EVENT_ROUTES[eventName] || [], getVariable("eventPercent"), getVariable("eventSeconds"));
}

function onCasinoResult(data) {
  if (isOn("paused") || !isOn("casinoPulses")) return;
  if (String(data["trigger-outcome"] || "") !== "loss") return;
  pulseTargets(EVENT_ROUTES.casinoLoss, getVariable("eventPercent"), getVariable("eventSeconds"));
}

function onLocation(data, entered) {
  if (isOn("paused") || !isOn("locationPulses")) return;
  var key = String(data["trigger-location"] || "");
  for (var i = 0; i < LOCATION_ROUTES.length; i++) {
    var rule = LOCATION_ROUTES[i];
    if (rule.key !== key) continue;
    pulseTargets(rule.channels, rule.percent, rule.seconds);
  }
}

function onPauseChanged() {
  if (!isOn("paused")) {
    setStatus("Live. Use Pause or the script stop button to zero all outputs.");
    return;
  }
  stopAllOutputs();
  setStatus("Paused. All outputs set to zero.");
}

function handleBridgeStop(data) {
  setVariable("paused", "on");
  stopAllOutputs();
  setStatus("Veratown stopped the bridge (" + String(data["trigger-reason"] || "stop") + ").");
}

function registerWebhook(action, callback) {
  registerTrigger(
    { type: "componentState", channel: "webhook-a", action: action },
    callback
  );
}

function initVeratownRouter() {
  for (var i = 0; i < OUTPUTS.length; i++) {
    outputsByChannel[OUTPUTS[i].channel] = OUTPUTS[i];
    pulseLevels[OUTPUTS[i].channel] = 0;
    shockActive[OUTPUTS[i].channel] = false;
  }

  registerWebhook("toyEvent", function (data) { onToyEvent(data, false); });
  registerWebhook("inflationEvent", function (data) { onToyEvent(data, true); });
  registerWebhook("itemAdded", onItemAdded);
  registerWebhook("itemRemoved", onItemRemoved);
  registerWebhook("activityEvent", function (data) { onActivity(data, false); });
  registerWebhook("activityOnOtherEvent", function (data) { onActivity(data, true); });
  registerWebhook("vtRoomJoin", function (data) { onRoomEvent(data, "roomJoin"); });
  registerWebhook("vtRoomLeave", function (data) { onRoomEvent(data, "roomLeave"); });
  registerWebhook("vtCasinoResult", onCasinoResult);
  registerWebhook("vtLocationEntered", function (data) { onLocation(data, true); });
  registerWebhook("vtLocationLeft", function (data) { onLocation(data, false); });
  registerWebhook("bridgeStop", handleBridgeStop);
  registerTrigger({ type: "variableChange", variable: "paused", valueChange: null }, onPauseChanged);
  setVariable("paused", "on");
  stopAllOutputs();
  setStatus("Fixed routes loaded safely: paused, all outputs zero.");
}

initVeratownRouter();
