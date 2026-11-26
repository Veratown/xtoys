# XToys JavaScript cookbook

Recipes for the custom JavaScript ("JS" button) of XToys scripts and teases.
The [scripting guide](scripting-guide.md#9-custom-javascript) covers the basics;
this page shows how to combine them. The recipes are derived from the official
[JavaScript page](https://guide.xtoys.app/script-creation/javascript.html) and
from the export patterns listed in [Sources](#sources).

All snippets are original ES5 written for this page. They are untested against a
live XToys session; import them into a script and check them in the editor. JSON
shapes marked _observed_ come from exports, not from official documentation.

## 1. Execution model

- The whole JS source is evaluated **once, when the script or tease starts**.
  Top-level statements run then; `function` declarations and `var` globals
  persist for the lifetime of the session.
- Every later call (from a `customCode` action, an expression such as
  `{x} * myFactor()`, or a `registerTrigger` callback) runs in that same global
  scope. JS globals are therefore the cheapest place for internal state.
- **XToys variables are a separate store.** Controls, expressions, triggers, and
  jobs see only XToys variables; JS sees them only through `getVariable` and
  `setVariable`.
- The code is interpreted (JS-Interpreter), ES5 only, with no DOM, no
  `setTimeout`/`setInterval`, and no `Promise`. A long loop blocks the script.
- `getVariable` returns whatever was stored. Control values and webhook fields
  are often **strings**; convert before arithmetic. A built-in such as
  `multi-user-mode` can be `null` _(observed)_, so guard against missing values.

## 2. Script skeleton

Keep start-up code in one function, call it at the bottom, and register triggers
there. Configuration that the user can change should be read on demand, not
cached at start-up.

```js
var DEBUG = false;
var state = { lastLevel: 0, busy: false };

function log(msg) {
  if (DEBUG) {
    console.log("[script] " + msg);
  }
}

function num(name, fallback) {
  var v = parseFloat(getVariable(name));
  return isNaN(v) ? fallback : v;
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function init() {
  DEBUG = getVariable("debug") == "ON";
  setVariable("outputLevel", 0);
  registerTrigger(
    { type: "variableChange", variable: "menu", valueChange: true },
    onMenu
  );
  log("started");
}

init();
```

`num()` and `clamp()` are reused in later recipes.

## 3. Calling JS from blocks

### `customCode` action

```json
{
  "type": "customCode",
  "code": "onLevel(lvl, grp);",
  "variables": [
    { "name": "lvl", "value": "trigger-level", "expression": null },
    { "name": "grp", "value": "trigger-assetGroupName", "expression": null }
  ],
  "storeResult": false,
  "resultVar": "result"
}
```

- `variables[].value` is an XToys variable name **without braces**. It may be a
  `trigger-…` value (only visible in that trigger's actions), a control `id`, or
  a `queue-…` value inside a queued job.
- Do not assume the JavaScript type of an injected value; controls give
  strings. Convert inside the function.
- With `"storeResult": true` the value of the code's last expression is written
  to `resultVar`. Newer exports also contain a `customVar` field with the same
  value _(observed)_, and tease exports may carry `"wait": false`
  _(observed, meaning not documented)_.

### Functions inside expressions

A function that returns a number or string can be used in any expression field:
`"percentVolume": "scaled({trigger-level})"`. Keep these functions pure and fast;
they may run every time the field is evaluated.

## 4. Configuration from a textarea

A `textarea` control can hold a JSON configuration that users edit without
touching the JS. Parse defensively and keep the previous good value on error.

```js
var config = { groups: {} };

function loadConfig() {
  var raw = getVariable("configJson");
  var parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    setVariable("configStatus", "Invalid JSON: " + e.message);
    return false;
  }
  if (!parsed || typeof parsed.groups !== "object") {
    setVariable("configStatus", "Missing 'groups' object");
    return false;
  }
  config = parsed;
  setVariable("configStatus", "Loaded");
  return true;
}
```

Wire a `push` control (for example `reloadConfig`) to a `variableChange` trigger,
or register it in `init()`:

```js
registerTrigger(
  { type: "variableChange", variable: "reloadConfig" },
  function () {
    loadConfig();
  }
);
```

Show `configStatus` in an `input` control so errors are visible.

## 5. Trigger dispatchers and menus

`registerTrigger(json, fn)` calls `fn(data, triggerJson)`. Observed `data`
shapes:

| Trigger                             | `data` keys                                                          |
| ----------------------------------- | -------------------------------------------------------------------- |
| `componentState` (webhook, dice, …) | `trigger-<key>` for each value, for example `data["trigger-result"]` |
| `variableChange`                    | `data["trigger"]` is the new value _(observed)_                      |
| `multiUser` `join`/`leave`          | `data["trigger-user"]`                                               |
| `multiUser` `action`                | `data["trigger-user"]`, `data["trigger"][<additionalData key>]`      |

Log `JSON.stringify(data)` once when wiring a new trigger to confirm its shape.

A **menu dispatcher** uses one variable for all buttons. Each tease button sets
`menu` to a command string, and one JS handler routes it:

```js
var menuHandlers = {
  start: function () {
    callAction({
      type: "updateJob",
      job: "Main",
      action: "start",
      restart: true,
    });
  },
  stop: function () {
    callAction({ type: "updateJob", job: "Main", action: "stop" });
  },
  more: function () {
    setVariable("intensityCap", clamp(num("intensityCap", 30) + 10, 0, 100));
  },
};

function onMenu(data) {
  var cmd = String(data["trigger"]);
  if (cmd === "") {
    return; // our own reset below
  }
  if (menuHandlers.hasOwnProperty(cmd)) {
    menuHandlers[cmd]();
  } else {
    log("unknown menu command " + cmd);
  }
  setVariable("menu", "");
}
```

Resetting `menu` to `""` lets the same button fire again. The reset itself is
a change, so the handler ignores the empty command.

## 6. Decide in JS, output in a job

Do not drive toys from many places. Compute a target in JS, store it in XToys
variables, and start a small job that applies it. The job owns the channel, and
the editor shows the device action clearly.

```js
function applyOutput(level, rampSeconds) {
  setVariable("outputLevel", clamp(Math.round(level), 0, 100));
  setVariable("outputRamp", clamp(rampSeconds, 0, 10));
  callAction({
    type: "updateJob",
    job: "Output",
    action: "start",
    restart: true,
  });
}
```

```json
"Output": {
  "steps": {
    "START": {
      "actions": [
        { "type": "updateComponent", "channel": "generic-1-a", "action": "setVolume",
          "percentVolume": "{outputLevel}", "rampTime": "{outputRamp}" },
        { "type": "updateJob", "job": "Output", "action": "stop" }
      ],
      "triggers": []
    }
  }
}
```

Use `callAction` directly for a single device call when a job adds nothing.

## 7. Delays and timers

There is no `setTimeout`. Choose by need:

| Need                                      | Recipe                                    |
| ----------------------------------------- | ----------------------------------------- |
| A pulse that a new event should extend    | Retriggerable job (§7.1)                  |
| A JS callback after N seconds             | Queue-based timeout (§7.2)                |
| Several independent overlapping durations | Fixed timer pool (§7.3)                   |
| A short pause inside one handler (< 1 s)  | `sleep(ms)` (blocks everything meanwhile) |
| A countdown visible to a tease user       | Tease `timer` part (§10)                  |

### 7.1 Retriggerable pulse

`START` sets the output, a step timer moves to `Off`, and `Off` zeroes the
channel and stops the job. Starting the job with `restart: true` while it is
running re-enters `START`, which restarts the timer and so extends the pulse.

```json
"Pulse": {
  "steps": {
    "START": {
      "actions": [ { "type": "updateComponent", "channel": "generic-1-a", "action": "setVolume",
                     "percentVolume": "{pulseLevel}", "rampTime": 0 } ],
      "triggers": [ { "type": "stepState", "event": "timer", "amount": "{pulseSeconds}",
                      "actions": [ { "type": "updateJob", "job": "Pulse", "action": "goTo", "step": "Off" } ] } ]
    },
    "Off": {
      "actions": [
        { "type": "updateComponent", "channel": "generic-1-a", "action": "setVolume",
          "percentVolume": "0", "rampTime": 0 },
        { "type": "updateJob", "job": "Pulse", "action": "stop" }
      ],
      "triggers": []
    }
  }
}
```

### 7.2 Queue-based timeout

Declare a queue name at the top level (`"queues": ["timeouts"]`, observed). A
generic `Timeout` job waits `{queue-delay}` seconds, then calls back into JS with
`{queue-tag}`. Tags are numbers, which avoids quoting strings in queue
expressions.

```js
var TAG_WARMUP_DONE = 1;

function after(seconds, tag) {
  callAction({
    type: "updateQueue",
    action: "add",
    queue: "timeouts",
    job: "Timeout",
    variables: [
      { name: "delay", expression: String(seconds) },
      { name: "tag", expression: String(tag) },
    ],
  });
}

function onTimeout(tag) {
  if (Number(tag) === TAG_WARMUP_DONE) {
    applyOutput(num("baseLevel", 20), 2);
  }
}
```

```json
"Timeout": {
  "steps": {
    "START": {
      "actions": [],
      "triggers": [ { "type": "stepState", "event": "timer", "amount": "{queue-delay}",
        "actions": [
          { "type": "customCode", "code": "onTimeout(tag);", "storeResult": false, "resultVar": "result",
            "variables": [ { "name": "tag", "value": "queue-tag", "expression": null } ] },
          { "type": "updateJob", "job": "Timeout", "action": "stop" }
        ] } ]
    }
  }
}
```

Queued jobs run **one at a time**, so timeouts in one queue are sequential, not
concurrent. Use separate queue names for independent timelines, and
`{"type":"updateQueue","queue":"timeouts","action":"clear"}` to cancel pending
ones. Queued jobs cannot start other jobs; do that from the JS callback.

### 7.3 Fixed timer pool

When several timed effects must overlap, create N identical jobs (`Timer0` …
`Timer4`). Each waits `{timerN}` seconds and then calls `onTimerDone(N)`. JS
picks a free slot:

```js
var POOL_SIZE = 5;
var slots = [null, null, null, null, null];

function startTimed(seconds, payload) {
  for (var i = 0; i < POOL_SIZE; i++) {
    if (slots[i] === null) {
      slots[i] = payload;
      setVariable("timer" + i, seconds);
      callAction({
        type: "updateJob",
        job: "Timer" + i,
        action: "start",
        restart: true,
      });
      return true;
    }
  }
  log("timer pool full");
  return false;
}

function onTimerDone(i) {
  var payload = slots[i];
  slots[i] = null;
  if (payload) {
    endEffect(payload);
  }
}
```

Each `TimerN` job stops itself after its callback. Decide explicitly what
happens when the pool is full (drop, replace the oldest, or extend).

## 8. Randomness

Expressions already offer `(1-5)` and `(a|b|c)`. In JS, use `Math.random()` for
weighted choices and probability rolls:

```js
function weightedPick(options) {
  var total = 0;
  var i;
  for (i = 0; i < options.length; i++) {
    total += options[i].weight;
  }
  var roll = Math.random() * total;
  for (i = 0; i < options.length; i++) {
    roll -= options[i].weight;
    if (roll < 0) {
      return options[i].value;
    }
  }
  return options[options.length - 1].value;
}

function chance(percent) {
  return Math.random() * 100 < percent;
}
```

## 9. Persistent state

A top-level `"persistentVariables": ["store"]` list _(observed)_ keeps those
XToys variables across sessions for the user. Store one JSON string and keep it
small.

```js
function loadStore() {
  var raw = getVariable("store");
  if (!raw) {
    return { version: 1, favourites: [] };
  }
  try {
    return JSON.parse(raw);
  } catch (e) {
    return { version: 1, favourites: [] };
  }
}

function saveStore(store) {
  setVariable("store", JSON.stringify(store));
}
```

Include a `version` field so a later script version can migrate old data, and
never store secrets or personal data there.

## 10. Teases from JS

Tease actions use `type: "updateTease"` and a `part`. Pass `true` as the second
`callAction` argument to wait for blocking parts: main text with a delay, input,
a timer with blocking enabled, and speech with blocking enabled.

```js
function say(text) {
  callAction(
    {
      type: "updateTease",
      part: "text",
      location: "main",
      text: { ops: [{ insert: text + "\n" }] },
      delay: "reading",
      clear: true,
    },
    true
  );
}

function ask(question, choices) {
  say(question);
  var buttons = [];
  for (var i = 0; i < choices.length; i++) {
    buttons.push({
      name: choices[i],
      setVariable: true,
      variable: "answer",
      variableValue: choices[i],
    });
  }
  callAction(
    {
      type: "updateTease",
      part: "input",
      inputType: "buttons",
      buttons: buttons,
    },
    true
  );
  return getVariable("answer");
}
```

Other observed parts:

| `part`   | Example fields                                                                        |
| -------- | ------------------------------------------------------------------------------------- |
| `text`   | `location: "status"`, `statusText: "Round {round}"` for the one-line status bar       |
| `input`  | `inputType: "text"` with `variable`; `"side-buttons"` for persistent side buttons     |
| `image`  | `source: "media"`, `image: "<media name>"`, or `source: "url"`, `url`                 |
| `video`  | `source: "url"` with `site` and `video` id; `source: "media"` with no media clears it |
| `timer`  | `timerType: "normal"`, `seconds`, optionally `setVariable`/`variable`/`variableValue` |
| `canvas` | `action: "create"` with `width`/`height`, then draw (below); `action: "remove"`       |
| `audio`  | `source: "media"`, `audio: "<media name>"` (also used by scripts via `updateScript`)  |
| general  | `{"part": "general", "action": "stop"}` stops the tease                               |

The text `ops` array is a Quill delta. Build it in the editor once and copy the
shape for formatted text.

### Canvas

After creating a canvas with a blocking `callAction`, a global `canvas` object
accepts a subset of the 2D-context API _(observed: `fillRect`, `clearRect`,
`fillText`, `font`, `fillStyle`, `textAlign`, `arc`, `drawImage`)_.

```js
function drawProgress(done, total) {
  var w = 300;
  canvas.clearRect(0, 0, w, 30);
  canvas.fillStyle = "#444";
  canvas.fillRect(0, 0, w, 30);
  canvas.fillStyle = "#c06";
  canvas.fillRect(0, 0, Math.round((w * done) / Math.max(total, 1)), 30);
  canvas.fillStyle = "#fff";
  canvas.font = "16px sans-serif";
  canvas.textAlign = "center";
  canvas.fillText(done + " / " + total, w / 2, 20);
}
```

Call `sleep(10)` after drawing inside a long loop so the frame can render.

## 11. Patterns from JS

`setPattern` plays a drawn or funscript-like pattern on a channel _(observed)_:

```js
function playWave(channel, periodMs) {
  var half = Math.round(periodMs / 2);
  callAction({
    type: "updateComponent",
    channel: channel,
    action: "setPattern",
    patternAction: "specific",
    restart: true,
    pattern: {
      name: "wave",
      type: "draw",
      patternData: {
        loop: true,
        channels: 1,
        channelData: {
          1: [
            { at: 0, pos: 10 },
            { at: half, pos: 90 },
            { at: periodMs, pos: 10 },
          ],
        },
      },
    },
    patternControls: { id: "off" },
  });
}
```

Points use funscript keys: `at` in milliseconds and `pos` from 0 to 100.
`videoSync: true` locks the pattern to the playing tease video. A stroker channel also takes
`mode: "position"`, and a combined two-channel block takes
`actionChannel: "all"` or a channel number. For media patterns, reference
`media.patterns` by name instead of inlining data. `getFilesInFolder(name)`
lists a local-folder media entry whose file names can be passed to video and
pattern actions.

## 12. Session introspection

`getConnectedBlocks()` returns an object keyed by block type, each holding the
connected devices _(observed)_. Use it to adapt to what the user connected and
to warn when nothing is connected:

```js
function hasBlock(type) {
  var blocks = getConnectedBlocks();
  return !!(blocks && blocks[type] && blocks[type].length > 0);
}

function checkDevices() {
  if (!hasBlock("generic-1") && !hasBlock("part-estim")) {
    return ask("No toy is connected. Continue anyway?", ["Yes", "No"]) == "Yes";
  }
  return true;
}
```

Log the full result once with `JSON.stringify` because keys for combined blocks
look like `"part-estim|part-estim-a"`. `getConnectedUsers()` lists users in an
online session and their access/control state.

## 13. Fetching data

`getXhr(url)` makes a **synchronous** GET and returns the response text. It
freezes the script until it returns, and it is subject to browser CORS rules.

```js
function fetchJson(url) {
  try {
    return JSON.parse(getXhr(url));
  } catch (e) {
    log("fetch failed for " + url + ": " + e.message);
    return null;
  }
}
```

Fetch once at start-up or on demand, cache in a global, and show progress for
large indexes. Never embed tokens in URLs; the script source is visible to
anyone who can import it.

## 14. Multi-user teases

Teases can run with a host and guests _(observed; not covered by the official
guide, whose online-play page says teases are not usable in online sessions,
so treat this as a newer feature)_. The built-in variable `multi-user-mode` is
`"host"`, `"guest"`, or `null` when the tease is not multi-user.

Send a message to everyone, or to specific users:

```js
function sendToGuests(name, payload, users) {
  var msg = {
    type: "multiUser",
    action: "send",
    multiUserAction: name,
    additionalData: [{ key: "payload", value: JSON.stringify(payload) }],
  };
  if (users) {
    msg.users = users;
  }
  callAction(msg);
}
```

Receive it:

```js
registerTrigger(
  {
    type: "multiUser",
    event: "action",
    multiUserMode: "guest",
    multiUserAction: "round",
  },
  function (data) {
    var payload = JSON.parse(data["trigger"]["payload"]);
    setVariable("roundTarget", payload.target);
  }
);
registerTrigger(
  { type: "multiUser", event: "join", multiUserMode: "host" },
  function (data) {
    sendToGuests("round", { target: num("roundTarget", 0) }, [
      data["trigger-user"],
    ]);
  }
);
```

Rules that keep host and guests consistent:

- Make the **host authoritative**: only the host advances rounds or runs timers
  (`requiredExpression: {multi-user-mode} == "host"`), and guests apply what
  they receive.
- Send the full current state when a guest joins; do not rely on earlier
  messages.
- `additionalData` values are strings; JSON-encode structured data.
- Validate every received value. A guest controls what it sends, so never let a
  guest message set another user's output above that user's own limits.

## 15. Input blocks

| Block                | Trigger JSON                                                                                                  | Value                                                                                      |
| -------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `keyboard`           | `{"type":"componentState","channel":"keyboard-a","state":"down"}`                                             | `{trigger}` is a `KeyboardEvent.code`: `KeyA`, `Digit1`, `Space`, `Backspace`, `ArrowLeft` |
| `speech-recognition` | `{"type":"componentState","channel":"speech-recognition-a","word":"<regex>","isFinal":true,"ignoreTTS":true}` | capture groups in `{trigger-1}`, `{trigger-2}`, …                                          |
| `sound-level`        | `{"type":"componentState","channel":"sound-level-a","event":"any"}`                                           | `{trigger}` is the current level                                                           |
| `push-button`        | `{"type":"componentState","channel":"push-button-a","state":"down"}`                                          | —                                                                                          |

Practical notes:

- **Keyboard**: map codes to characters in JS
  (`code.indexOf("Key") === 0 ? code.substring(3) : …`). Case and punctuation
  need extra handling for Shift. The block's _Anywhere_ connection mode reacts to
  typing in other apps.
- **Speech**: a two-group pattern such as `([a-z']+) ([a-z']+)` catches words
  more reliably than one trigger per word. Recognizers may duplicate the last
  word or insert words such as "period"; filter them. `isFinal: true` waits for
  the finished phrase.
- **Sound level**: a single reading is noisy. Sample a few times (for example a
  job taking five readings 0.2 s apart into separate variables) and use the
  maximum or average.
- **Text-to-speech**: guard `setText` on `speech-synthesis` with a "speaking"
  flag and a cool-down step so overlapping events do not queue long speech.

## 16. Debugging and gotchas

- Gate logs behind a `debug` toggle control; heavy logging slows the
  interpreter.
- Wrap handler bodies in `try { … } catch (e) { console.log(e.message); }`
  while developing. An exception aborts that call, but globals that were already
  changed stay changed.
- **No overloading.** Two `function` declarations with the same name do not
  overload by argument count; the last one replaces the first everywhere.
- **`Array.prototype.sort()` compares as strings** by default: `[9, 10].sort()`
  is `[10, 9]`. Pass a comparator: `arr.sort(function (a, b) { return a - b; })`.
- `sleep()` takes **milliseconds**; `sleep(0.5)` is half a millisecond.
- Avoid ES5-incompatible syntax that some editors accept silently: trailing
  commas in calls, `let`/`const`, arrow functions, template literals, default
  parameters, and `for … of`.
- Use `===` with known types, or convert first. `"10" == 10` is true, but
  `"10" > "9"` is false.
- The official page's second `registerTrigger` sample registers
  `onVariableChange` but defines `onTrigger`. Make the names match.
- `callAction` with the wrong JSON usually fails silently. Generate the JSON
  with **Add XToys Action** in the editor, then edit it.
- Keep the JS in a separate `.js` file in version control and paste it into the
  editor; diffs of the escaped `customFunctions` string are unreadable.

## Sources

- XToys guide, [JavaScript](https://guide.xtoys.app/script-creation/javascript.html),
  [Definitions](https://guide.xtoys.app/script-creation/definitions.html),
  [Tease Creation](https://guide.xtoys.app/tease-creation/overview.html),
  [Online Play](https://guide.xtoys.app/getting-started/online-play.html), and
  [Tools](https://guide.xtoys.app/introduction/tools.html), read 2026-11-21.
- Amanda-Cook, _xtoys_, <https://github.com/Amanda-Cook/xtoys>, commit
  `9a886a4` (2024-06-27): six scripts using speech recognition, sound level,
  keyboard, push-button, audio media, and shock collar blocks. The repository has
  no license file, so its code is described here, not copied.
- ItsNorin, _Bondage-Club-XToys-Integration_, companion script `xtoys_script.json`
  (see the [plugin analysis](bc-xtoys-plugin-analysis.md)); no license file.
- Four exports supplied by the repository owner, reviewed in the
  [example reviews](../examples/README.md).
