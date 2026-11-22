#!/usr/bin/env node
// Live test harness for examples/veratown-bridge-test.json.
//
// Impersonates the Veratown bot on your XToys webhook: it sends every bot event
// to the script, checks the script's probeAck echoes (including whether XToys
// substitutes {variables} in webhookData), then validates the control messages
// the script sends against the bot's inbound schema and answers them like the bot.
//
// Usage:
//   XTOYS_WEBHOOK_ID=<id or webhook URL> node tools/veratown-bridge-harness.mjs [--phase all|outbound|inbound]
//
// Requires Node 22+ (global WebSocket). The webhook ID is never printed.
// Do not run it while the bot is linked to the same webhook.

const DEFAULT_BASE = "wss://webhook.xtoys.app/";
const ACK_TIMEOUT_MS = 6_000;
const HANDSHAKE_TIMEOUT_MS = 180_000;
const RUN_ALL_TIMEOUT_MS = 240_000;
const SEND_GAP_MS = 400;

const args = process.argv.slice(2);
const phaseIndex = args.indexOf("--phase");
const phase = phaseIndex >= 0 ? args[phaseIndex + 1] : "all";
if (!["all", "outbound", "inbound"].includes(phase))
  fail("--phase must be all, outbound or inbound");
const verbose = args.includes("--verbose");
// --base is only for testing the harness against a local mock relay.
const baseIndex = args.indexOf("--base");
const BASE = baseIndex >= 0 ? args[baseIndex + 1] : DEFAULT_BASE;

const rawId = (process.env.XTOYS_WEBHOOK_ID ?? "").trim();
const webhookId =
  /^(?:wss|https):\/\/webhook\.xtoys\.app\/([A-Za-z0-9_-]+)\/?(?:\?.*)?$/.exec(
    rawId
  )?.[1] ?? rawId;
if (!/^[A-Za-z0-9_-]{4,128}$/.test(webhookId))
  fail("Set XTOYS_WEBHOOK_ID to your webhook ID or URL.");

// Sample bot events, mirroring the Veratown bridge contract; the probe echoes f1/f2.
const SAMPLES = [
  ["bridgeTest", {}],
  ["bridgeVerify", { code: "K7Q2ZP" }],
  [
    "toyEvent",
    {
      assetGroupName: "ItemVulva",
      itemName: "Egg",
      assetName: "VibratingEgg",
      level: 2,
      origin: "room",
      relation: "self",
    },
  ],
  [
    "inflationEvent",
    {
      assetGroupName: "ItemMouth",
      itemName: "Gag",
      level: 3,
      origin: "room",
      relation: "self",
    },
  ],
  [
    "itemAdded",
    {
      assetGroupName: "ItemNipples",
      assetName: "NippleClamp",
      origin: "room",
      relation: "trusted",
    },
  ],
  [
    "itemRemoved",
    {
      assetGroupName: "ItemNipples",
      assetName: "NippleClamp",
      origin: "room",
      relation: "trusted",
    },
  ],
  [
    "activityEvent",
    {
      assetGroupName: "ItemBreast",
      actionName: "Caress",
      assetName: "",
      origin: "room",
      relation: "other",
    },
  ],
  [
    "activityOnOtherEvent",
    {
      assetGroupName: "ItemArms",
      actionName: "ShockLow",
      assetName: "ShockRemote",
      origin: "room",
      relation: "self",
    },
  ],
  ["vtRoomJoin", { who: "other", origin: "room" }],
  ["vtRoomLeave", { who: "other", origin: "room" }],
  ["vtSpokenTo", { kind: "chat", origin: "room", relation: "other" }],
  [
    "vtLocationEntered",
    { location: "casino", locationType: "venue", origin: "room" },
  ],
  [
    "vtLocationLeft",
    { location: "casino", locationType: "venue", origin: "room" },
  ],
  [
    "vtCasinoResult",
    { game: "roulette", outcome: "loss", stakeBand: "medium", origin: "game" },
  ],
  ["vtHotSeatSelected", { origin: "game" }],
  [
    "vtHotSeatReleased",
    { outcome: "bluff_exposed", settlement: "penalty", origin: "game" },
  ],
  ["vtTruthDareAssigned", { kind: "dare", role: "target", origin: "game" }],
  [
    "vtTruthDareResolved",
    { role: "target", outcome: "attested", origin: "game" },
  ],
  [
    "vtDilemmaResult",
    { role: "chooser", choice: "left", outcome: "decided", origin: "game" },
  ],
  ["vtStagedTablePhase", { phase: "reveal", origin: "game" }],
  [
    "vtStagedTableAppearance",
    { state: "stage_confirmed", stage: "2", origin: "game" },
  ],
  ["vtShowerStarted", { origin: "game" }],
  ["vtShowerEnded", { reason: "timer", origin: "game" }],
  [
    "vtTrickOrTreatOutcome",
    { choice: "trick", outcome: "reward", rewardBand: "small", origin: "game" },
  ],
  [
    "bridgeState",
    { requestId: "h1", present: true, fresh: true, groups: { ItemVulva: 2 } },
  ],
  ["vtResult", { request: "vtSetVibe", status: "observed", requestId: "h2" }],
  ["bridgeStop", { reason: "harness" }],
];
// The probe's f1/f2 fields per event (same order as examples/veratown-bridge-test.json).
const ECHO_FIELDS = {
  bridgeVerify: ["code"],
  bridgeTest: [],
  bridgeState: ["present", "requestId"],
  vtResult: ["status", "requestId"],
  bridgeStop: ["reason"],
  toyEvent: ["assetGroupName", "level"],
  inflationEvent: ["assetGroupName", "level"],
  itemAdded: ["assetGroupName", "assetName"],
  itemRemoved: ["assetGroupName", "assetName"],
  activityEvent: ["assetGroupName", "actionName"],
  activityOnOtherEvent: ["assetGroupName", "actionName"],
  vtRoomJoin: ["who"],
  vtRoomLeave: ["who"],
  vtSpokenTo: ["kind"],
  vtLocationEntered: ["location", "locationType"],
  vtLocationLeft: ["location", "locationType"],
  vtCasinoResult: ["game", "outcome"],
  vtHotSeatSelected: [],
  vtHotSeatReleased: ["outcome", "settlement"],
  vtTruthDareAssigned: ["kind", "role"],
  vtTruthDareResolved: ["role", "outcome"],
  vtDilemmaResult: ["choice", "outcome"],
  vtStagedTablePhase: ["phase"],
  vtStagedTableAppearance: ["state", "stage"],
  vtShowerStarted: [],
  vtShowerEnded: ["reason"],
  vtTrickOrTreatOutcome: ["choice", "outcome"],
};
// Control tests by requestId step suffix: expected validity under the bot schema.
const CONTROL_TESTS = {
  1: ["query", true],
  2: ["setNamed", true],
  3: ["setNumber", true],
  4: ["setMember", true],
  5: ["emote", true],
  6: ["setOff", true],
  7: ["stop", true],
  8: ["badAction", false],
  9: ["badLevel", false],
};

const results = [];
const record = (area, name, status, detail = "") => {
  results.push({ area, name, status, detail });
  console.log(
    `${status.padEnd(4)} ${area.padEnd(8)} ${name}${detail ? ` - ${detail}` : ""}`
  );
};

let socket;
let finishing = false;
let reconnects = 0;
let seq = 0;
const waiters = new Set();
const inbound = [];

function fail(message) {
  console.error(message);
  process.exit(2);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function sendEvent(action, fields) {
  seq += 1;
  const frame = JSON.stringify({ action, ...fields, seq });
  if (socket?.readyState !== WebSocket.OPEN) {
    console.log(`     (not connected; ${action} not sent)`);
    return seq;
  }
  if (verbose) console.log("->", frame);
  socket.send(frame);
  return seq;
}

function waitFor(predicate, timeoutMs) {
  return new Promise((resolve) => {
    const waiter = { predicate, resolve };
    waiter.timer = setTimeout(() => {
      waiters.delete(waiter);
      resolve(undefined);
    }, timeoutMs);
    waiters.add(waiter);
  });
}

function onFrame(data) {
  if (typeof data !== "string")
    return record(
      "frame",
      "binary frame",
      "FAIL",
      "XToys sent a non-text frame"
    );
  if (verbose) console.log("<-", data.slice(0, 300));
  let message;
  try {
    message = JSON.parse(data);
  } catch {
    return record("frame", "invalid JSON", "FAIL", data.slice(0, 80));
  }
  for (const waiter of waiters) {
    if (waiter.predicate(message, data)) {
      clearTimeout(waiter.timer);
      waiters.delete(waiter);
      waiter.resolve({ message, data });
      return;
    }
  }
  if (message?.action !== "probeAck") inbound.push({ message, data });
}

// The bot accepts integers as JSON numbers or digit strings (XToys sends text).
function asInteger(value) {
  if (typeof value === "number")
    return Number.isSafeInteger(value) ? value : undefined;
  if (typeof value === "string" && /^(?:0|[1-9][0-9]{0,15})$/.test(value)) {
    const number = Number(value);
    return Number.isSafeInteger(number) ? number : undefined;
  }
  return undefined;
}

// Replica of the bot's strict inbound schema (src/adapters/xtoys/wire-protocol.ts).
function validateInbound(message, data) {
  const problems = [];
  if (Buffer.byteLength(data, "utf8") > 1024) problems.push("frame over 1 KiB");
  if (typeof message !== "object" || message === null || Array.isArray(message))
    return ["not an object"];
  const allowed = {
    vtQueryState: ["requestId"],
    vtStop: ["requestId"],
    vtSetVibe: ["group", "level", "member", "requestId"],
    vtEmote: ["template", "requestId"],
  }[message.action];
  if (!allowed) return [`unknown action ${JSON.stringify(message.action)}`];
  for (const key of Object.keys(message))
    if (key !== "action" && !allowed.includes(key))
      problems.push(`unexpected key ${key}`);
  const typed = (key, value) =>
    `${key}=${JSON.stringify(value)} (${typeof value})`;
  if (
    message.requestId !== undefined &&
    !(
      typeof message.requestId === "string" &&
      /^[A-Za-z0-9_-]{1,64}$/.test(message.requestId)
    )
  )
    problems.push(`bad ${typed("requestId", message.requestId)}`);
  if (message.action === "vtSetVibe") {
    if (!(
      typeof message.group === "string" &&
      /^[A-Za-z][A-Za-z0-9]{0,63}$/.test(message.group)
    ))
      problems.push(`bad ${typed("group", message.group)}`);
    const level = message.level;
    const named = ["off", "low", "medium", "high", "maximum"].includes(level);
    const levelNumber = asInteger(level);
    const numeric =
      levelNumber !== undefined && levelNumber >= 0 && levelNumber <= 100;
    if (!named && !numeric) problems.push(`bad ${typed("level", level)}`);
    if (message.member !== undefined && !((asInteger(message.member) ?? 0) > 0))
      problems.push(`bad ${typed("member", message.member)}`);
  }
  if (
    message.action === "vtEmote" &&
    !(
      typeof message.template === "string" &&
      /^[a-z][a-z0-9-]{0,31}$/.test(message.template)
    )
  )
    problems.push(`bad ${typed("template", message.template)}`);
  return problems;
}

function botReply(message) {
  const requestId =
    typeof message.requestId === "string"
      ? { requestId: message.requestId }
      : {};
  switch (message.action) {
    case "vtQueryState":
      return [
        "bridgeState",
        { ...requestId, present: true, fresh: true, groups: { ItemVulva: 1 } },
      ];
    case "vtSetVibe":
      return [
        "vtResult",
        { request: "vtSetVibe", status: "observed", ...requestId },
      ];
    default:
      return [
        "vtResult",
        { request: message.action, status: "accepted", ...requestId },
      ];
  }
}

async function handshake() {
  console.log(
    "Load examples/veratown-bridge-test.json in XToys, connect its webhook,"
  );
  console.log(
    'and switch "Echo events to harness" on. Waiting for the first probeAck...'
  );
  const deadline = Date.now() + HANDSHAKE_TIMEOUT_MS;
  while (Date.now() < deadline) {
    sendEvent("bridgeTest", {});
    const ack = await waitFor(
      (m) => m?.action === "probeAck" && m.event === "bridgeTest",
      3_000
    );
    if (ack) {
      record(
        "link",
        "probe echo",
        "PASS",
        `ack fields: ${Object.keys(ack.message).join(",")}`
      );
      await sleep(3_000);
      inbound.length = 0;
      return true;
    }
  }
  record(
    "link",
    "probe echo",
    "FAIL",
    "no probeAck; check the script, webhook ID and Echo toggle"
  );
  return false;
}

function compareEcho(expected, actual) {
  const text = actual === undefined ? undefined : String(actual);
  if (text === undefined) return "missing";
  if (text.includes("{")) return "not substituted";
  const want =
    typeof expected === "object" ? JSON.stringify(expected) : String(expected);
  return text === want
    ? "ok"
    : `got ${JSON.stringify(actual)}, want ${JSON.stringify(want)}`;
}

async function outboundPhase() {
  for (const [action, fields] of SAMPLES) {
    await sleep(SEND_GAP_MS);
    const sent = sendEvent(action, fields);
    // Ignore late acks of earlier sends; an unsubstituted seq still matches so it is reported.
    const ack = await waitFor(
      (m) =>
        m?.action === "probeAck" &&
        m.event === action &&
        (String(m.seq) === String(sent) || String(m.seq).includes("{")),
      ACK_TIMEOUT_MS
    );
    if (!ack) {
      record(
        "outbound",
        action,
        "FAIL",
        "no probeAck (trigger missing or event not delivered)"
      );
      continue;
    }
    const problems = [];
    const seqCheck = compareEcho(sent, ack.message.seq);
    if (seqCheck !== "ok") problems.push(`seq ${seqCheck}`);
    (ECHO_FIELDS[action] ?? []).forEach((field, index) => {
      const check = compareEcho(fields[field], ack.message[`f${index + 1}`]);
      if (check !== "ok") problems.push(`${field} ${check}`);
    });
    const types = ["seq", "count", "f1", "f2"]
      .filter((key) => key in ack.message)
      .map((key) => `${key}:${typeof ack.message[key]}`)
      .join(" ");
    record(
      "outbound",
      action,
      problems.length ? "FAIL" : "PASS",
      problems.join("; ") || types
    );
  }
}

async function inboundPhase() {
  console.log(
    'Now switch "Run all control tests" on in XToys (set "Delegated member" > 0 to include setMember).'
  );
  inbound.length = 0;
  const seen = new Set();
  let validReplies = 0;
  const done = waitFor(
    (m) => m?.action === "probeAck" && m.event === "runAllDone",
    RUN_ALL_TIMEOUT_MS
  );
  let finished;
  void done.then((value) => (finished = value ?? null));
  while (finished === undefined || inbound.length) {
    const next = inbound.shift();
    if (!next) {
      await sleep(100);
      continue;
    }
    const { message, data } = next;
    const step = /s(\d+)$/.exec(String(message?.requestId ?? ""))?.[1];
    const [name, expectValid] = CONTROL_TESTS[step] ?? [
      `unexpected ${message?.action}`,
      undefined,
    ];
    seen.add(name);
    const problems = validateInbound(message, data);
    const valid = problems.length === 0;
    const detail = `${valid ? "accepted by bot schema" : problems.join("; ")} | ${data.slice(0, 160)}`;
    const status =
      expectValid === undefined
        ? "WARN"
        : valid === expectValid
          ? "PASS"
          : "FAIL";
    record("inbound", name, status, detail);
    if (!valid) continue;
    const [action, fields] = botReply(message);
    await sleep(SEND_GAP_MS);
    sendEvent(action, fields);
    if (action === "vtResult") validReplies += 1;
    const ack = await waitFor(
      (m) =>
        m?.action === "probeAck" &&
        m.event === action &&
        String(m.f2) === String(fields.requestId),
      ACK_TIMEOUT_MS
    );
    record(
      "reply",
      `${action} for ${name}`,
      ack ? "PASS" : "FAIL",
      ack ? "script recorded the reply" : "no probeAck for reply"
    );
  }
  if (!finished) {
    record(
      "inbound",
      "run-all",
      "FAIL",
      "runAllDone not received; was Run all switched on?"
    );
    return;
  }
  for (const [step, [name]] of Object.entries(CONTROL_TESTS))
    if (!seen.has(name))
      record(
        "inbound",
        name,
        step === "4" ? "SKIP" : "FAIL",
        "message not received"
      );
  const { count, f1 } = finished.message;
  record(
    "inbound",
    "run-all summary",
    String(f1) === String(validReplies) ? "PASS" : "WARN",
    `script sent ${count}, counted ${f1} ok results, harness sent ${validReplies} vtResult replies`
  );
}

// Opens the webhook socket; on an unexpected close it reports why and reconnects.
function connect() {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${BASE}${webhookId}`);
    let opened = false;
    ws.addEventListener("message", (event) => onFrame(event.data));
    ws.addEventListener("error", (event) => {
      const cause = event.error?.cause?.code ?? event.error?.code ?? "";
      const message = event.message || event.error?.message || "no details";
      console.error(`WebSocket error: ${message}${cause ? ` (${cause})` : ""}`);
    });
    ws.addEventListener("open", () => {
      opened = true;
      reconnects = 0;
      socket = ws;
      resolve();
    });
    ws.addEventListener("close", (event) => {
      if (socket === ws) socket = undefined;
      if (finishing) return;
      console.error(
        `WebSocket closed: code ${event.code}${event.reason ? `, reason "${event.reason}"` : ""}${event.wasClean ? "" : ", not clean"}`
      );
      if (!opened && reconnects === 0)
        return reject(new Error("WebSocket closed before opening"));
      if (reconnects >= 5) return fail("Gave up after 5 reconnect attempts.");
      reconnects += 1;
      const delay = Math.min(10_000, 1_000 * 2 ** (reconnects - 1));
      console.error(
        `Reconnecting in ${delay / 1000} s (attempt ${reconnects})...`
      );
      setTimeout(() => {
        connect()
          .then(() => console.log("Reconnected."))
          .catch((error) => console.error(error.message));
      }, delay);
    });
  });
}

async function main() {
  await connect();
  console.log("Connected to the XToys webhook.");
  if (await handshake()) {
    if (phase !== "inbound") await outboundPhase();
    if (phase !== "outbound") await inboundPhase();
  }
  finishing = true;
  socket?.close(1000, "harness done");
  const count = (status) => results.filter((r) => r.status === status).length;
  console.log(
    `\n${count("PASS")} passed, ${count("FAIL")} failed, ${count("WARN")} warnings, ${count("SKIP")} skipped`
  );
  process.exit(count("FAIL") ? 1 : 0);
}

main().catch((error) =>
  fail(error instanceof Error ? error.message : String(error))
);
