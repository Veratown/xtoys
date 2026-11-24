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

var config = null;
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
  callAction({ type: "updateScript", action: "setText", text: message });
}

function validChannel(channel) {
  for (var i = 0; i < OUTPUTS.length; i++) {
    if (OUTPUTS[i].channel === channel) return true;
  }
  return false;
}

function validateRoutes(candidate) {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return false;
  if (!candidate.groups || typeof candidate.groups !== "object" || Array.isArray(candidate.groups)) {
    return false;
  }
  if (!candidate.caps || typeof candidate.caps !== "object" || Array.isArray(candidate.caps)) {
    return false;
  }
  if (!candidate.events || typeof candidate.events !== "object" || Array.isArray(candidate.events)) {
    return false;
  }
  if (!Array.isArray(candidate.locations)) return false;

  var key;
  for (key in candidate.groups) {
    if (!candidate.groups.hasOwnProperty(key)) continue;
    if (!/^[A-Za-z0-9_]{1,64}$/.test(key) || !Array.isArray(candidate.groups[key])) return false;
    for (var i = 0; i < candidate.groups[key].length; i++) {
      if (!validChannel(candidate.groups[key][i])) return false;
    }
  }
  for (key in candidate.caps) {
    if (!candidate.caps.hasOwnProperty(key)) continue;
    if (!validChannel(key) || !isFinite(Number(candidate.caps[key])) ||
        Number(candidate.caps[key]) < 0 || Number(candidate.caps[key]) > 100) return false;
  }
  var eventName;
  for (eventName in candidate.events) {
    if (!candidate.events.hasOwnProperty(eventName)) continue;
    if (!Array.isArray(candidate.events[eventName])) return false;
    for (var j = 0; j < candidate.events[eventName].length; j++) {
      if (!validChannel(candidate.events[eventName][j])) return false;
    }
  }
  for (var locationIndex = 0; locationIndex < candidate.locations.length; locationIndex++) {
    var location = candidate.locations[locationIndex];
    if (!location || typeof location.key !== "string" ||
        !/^[A-Za-z0-9_.:-]{1,64}$/.test(location.key)) return false;
    if (location.percent !== undefined && (!isFinite(Number(location.percent)) ||
        Number(location.percent) < 0 || Number(location.percent) > 100)) return false;
    if (location.seconds !== undefined && (!isFinite(Number(location.seconds)) ||
        Number(location.seconds) < 0.25 || Number(location.seconds) > 10)) return false;
    if (location.enter !== undefined && !Array.isArray(location.enter)) return false;
    if (location.leave !== undefined && !Array.isArray(location.leave)) return false;
    var sides = [location.enter || [], location.leave || []];
    for (var side = 0; side < sides.length; side++) {
      if (!Array.isArray(sides[side])) return false;
      for (var channelIndex = 0; channelIndex < sides[side].length; channelIndex++) {
        if (!validChannel(sides[side][channelIndex])) return false;
      }
    }
  }
  return true;
}

function outputCap(output) {
  var value = config && config.caps ? config.caps[output.channel] : undefined;
  var fallback = output.kind === "estim" ? 15 : 30;
  return clamp(asNumber(value, fallback), 0, 100);
}

function groupTargets(group) {
  if (!config || !config.groups || !Array.isArray(config.groups[group])) return [];
  return config.groups[group];
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

function loadConfig() {
  var candidate;
  try {
    candidate = JSON.parse(String(getVariable("routeConfig")));
  } catch (error) {
    config = null;
    setVariable("paused", "on");
    stopAllOutputs();
    setStatus("Route JSON invalid; paused and outputs stopped.");
    return false;
  }
  if (!validateRoutes(candidate)) {
    config = null;
    setVariable("paused", "on");
    stopAllOutputs();
    setStatus("Route JSON has an invalid group, channel, cap, or location key; paused.");
    return false;
  }

  config = candidate;
  outputsByChannel = {};
  for (var i = 0; i < OUTPUTS.length; i++) {
    outputsByChannel[OUTPUTS[i].channel] = OUTPUTS[i];
  }
  setStatus("Routes loaded. Check device caps, then turn Pause off to start.");
  return true;
}

function pulseOutput(channel, percent, seconds) {
  if (!config || isOn("paused") || !validChannel(channel)) return;
  var output = outputsByChannel[channel];
  var level = clamp(asNumber(percent, 0), 0, outputCap(output));
  if (level <= 0) return;

  pulseLevels[channel] = Math.max(asNumber(pulseLevels[channel], 0), level);
  setVariable(output.seconds, String(clamp(asNumber(seconds, 1), 0.25, 10)));
  setOutput(channel, baseLevel(channel), 0);
  armIdleStop();
  callAction({ type: "updateJob", job: output.job, action: "start", restart: true });
}

function shockOutput(channel, percent, seconds) {
  if (!config || isOn("paused") || !validChannel(channel)) return;
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

function shockTargets(channels, percent, seconds) {
  if (!Array.isArray(channels)) return;
  for (var i = 0; i < channels.length; i++) {
    shockOutput(channels[i], percent, seconds);
  }
}

function finishPulse(channel) {
  if (!validChannel(channel)) return;
  pulseLevels[channel] = 0;
  refreshOutput(channel, getVariable("rampSeconds"));
}

function finishShock(channel) {
  if (!validChannel(channel)) return;
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
  if (!config || isOn("paused") || !isOn("followToyEvents")) return;
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
  if (!config || isOn("paused") || !isOn("itemPulses")) return;
  var group = String(data["trigger-assetGroupName"] || "");
  var channels = groupTargets(group);
  pulseTargets(channels, getVariable("itemPercent"), getVariable("itemSeconds"));
}

function onItemRemoved(data) {
  if (!config || isOn("paused")) return;
  var group = String(data["trigger-assetGroupName"] || "");
  if (!group) return;
  groupLevels[group] = 0;
  armIdleStop();
  refreshGroup(group);
}

function onActivity(data, isOther) {
  if (!config || isOn("paused")) return;
  var actionName = String(data["trigger-actionName"] || "");
  var group = String(data["trigger-assetGroupName"] || "");
  if (!group) return;

  if (actionName === "ShockLow" || actionName === "ShockMed" || actionName === "ShockHigh") {
    if (!isOn("allowShockEvents") || isOther) return;
    var fraction = actionName === "ShockLow" ? 1 / 3 :
      (actionName === "ShockMed" ? 2 / 3 : 1);
    shockTargets(
      groupTargets(group),
      asNumber(getVariable("shockCap"), 10) * fraction,
      getVariable("shockSeconds")
    );
    return;
  }
  if (!isOn("activityPulses") || (isOther && !isOn("allowOtherActivities"))) return;
  pulseTargets(groupTargets(group), getVariable("activityPercent"), getVariable("activitySeconds"));
}

function onRoomEvent(data, eventName) {
  if (!config || isOn("paused") || !isOn("roomPulses")) return;
  if (String(data["trigger-who"] || "") !== "other") return;
  pulseTargets(config.events[eventName] || [], getVariable("eventPercent"), getVariable("eventSeconds"));
}

function onCasinoResult(data) {
  if (!config || isOn("paused") || !isOn("casinoPulses")) return;
  if (String(data["trigger-outcome"] || "") !== "loss") return;
  pulseTargets(config.events.casinoLoss || [], getVariable("eventPercent"), getVariable("eventSeconds"));
}

function onLocation(data, entered) {
  if (!config || isOn("paused") || !isOn("locationPulses")) return;
  var key = String(data["trigger-location"] || "");
  for (var i = 0; i < config.locations.length; i++) {
    var rule = config.locations[i];
    if (rule.key !== key) continue;
    var channels = entered ? (rule.enter || []) : (rule.leave || []);
    var percent = rule.percent === undefined ? getVariable("eventPercent") : rule.percent;
    var seconds = rule.seconds === undefined ? getVariable("eventSeconds") : rule.seconds;
    pulseTargets(channels, percent, seconds);
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
  registerWebhook("bridgeVerify", function (data) {
    setStatus("Link code: " + String(data["trigger-code"] || "check the bot reply"));
  });
  registerWebhook("bridgeTest", function () { setStatus("Veratown bridge test received."); });
  registerWebhook("bridgeStop", handleBridgeStop);
  registerWebhook("bridgeState", function () { setStatus("Veratown state response received."); });
  registerWebhook("vtResult", function (data) {
    setStatus("Veratown control result: " + String(data["trigger-status"] || "received"));
  });
  registerTrigger({ type: "variableChange", variable: "paused", valueChange: null }, onPauseChanged);
  registerTrigger({ type: "variableChange", variable: "routeConfig", valueChange: null }, function () {
    setVariable("paused", "on");
    stopAllOutputs();
    loadConfig();
  });

  loadConfig();
  setVariable("paused", "on");
  stopAllOutputs();
  setStatus("Configured safely: paused, all outputs zero.");
}

initVeratownRouter();
