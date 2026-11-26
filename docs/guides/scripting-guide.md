---
layout: default
title: XToys scripting guide
---

# XToys scripting guide

This guide explains how XToys scripts work and how to write them. It is based on
the official guide at <https://guide.xtoys.app>, on the export format of real
scripts, and on the Bondage Club integration (see the
[plugin analysis](../architecture/bc-xtoys-plugin-analysis.html)). For a field-by-field list of
the JSON format see the [script JSON reference](script-json-reference.html); for
JavaScript recipes see the [JavaScript cookbook](javascript-cookbook.html).

For Veratown-specific payloads, privacy rules, player defaults, and examples
covering all bridge scenarios, see the
[Veratown bridge scripting guide](veratown-bridge-scripting-guide.html).

## 1. Mental model

An XToys script is a small event-driven state machine that runs inside the XToys
web app while your session is open. It has:

| Part                | Purpose                                                                                 |
| ------------------- | --------------------------------------------------------------------------------------- |
| **Blocks/channels** | The toys and tools the script talks to (vibrator, e-stim, webhook, speech, buttons, …). |
| **Controls**        | UI widgets that read and write script variables while the script runs.                  |
| **Initial actions** | Run once when the script starts (set variables, zero toys, start jobs).                 |
| **Final actions**   | Run once when the script stops (normally: set every toy to 0).                          |
| **Global triggers** | Always-active conditions; when one fires it runs its actions.                           |
| **Jobs**            | Named state machines made of **steps**. Each step has actions and step-scoped triggers. |
| **Queues**          | Run queued job instances one after another.                                             |
| **Media**           | Uploaded audio, images, and patterns referenced by name.                                |
| **Custom JS**       | ES5 functions callable from expressions and from `customCode` actions.                  |

A **tease** is a script with a visual player: it adds text, images, video,
buttons, and timers on screen (see [§12](#12-teases-and-multi-user-play)).

Everything that happens is **trigger → actions**. Actions change toys, change
variables, or move jobs between steps. Triggers watch toy/tool state, variables,
expressions, or time.

## 2. Creating a script

1. Go to **My Scripts** and press **+**.
2. **General tab** – add a block for every toy and tool the script uses, for
   example a _Webhook_ plus a _Vibrator part_. You can give each block a
   user-facing name (`"name": "VibeButt"` in the export).
   - A script that connects to exactly **one tool** can be _embedded_ in that
     tool; it then starts and stops with the tool. Scripts that use several tools
     are standalone blocks that you start manually.
3. **Controls tab** – add the sliders, toggles, and inputs users should adjust.
4. **Start/Stop Actions tab** – initial and final actions.
5. **Global Triggers tab** – always-on reactions.
6. **Jobs tab** – timed or multi-step behaviour.
7. Optional: **JS** button in the toolbar – custom JavaScript.
8. Save, load the script into your session, press the **plug** icon to connect
   real toys to each block, and press **play**.

Settings changed in controls take effect immediately while the script runs.

## 3. Variables

- Variables hold a number or a string.
- Reference a variable in any text field with braces: `{myvar}`.
- Create or change a variable with the _Variable_ action (`updateVariable`) or
  from JavaScript with `setVariable()`.
- Every control writes to the variable named by its `id`.

Built-in variables:

| Variable            | Meaning                                                                                |
| ------------------- | -------------------------------------------------------------------------------------- |
| `{trigger-…}`       | Values produced by the trigger that fired. **Only** visible to that trigger's actions. |
| `{queue-…}`         | Values passed when a job was added to a queue; visible only to that job instance.      |
| `{timestamp}`       | Current Unix timestamp.                                                                |
| `{time-elapsed}`    | Milliseconds since the script started.                                                 |
| `{trigger}`         | Single value of a trigger without named fields (keyboard, sound level) _(observed)_.   |
| `{multi-user-mode}` | `host`, `guest`, or empty in a multi-user tease _(observed)_.                          |

Variables listed in the top-level `persistentVariables` array keep their value
across sessions _(observed)_. Store one JSON string there rather than many
variables.

**`trigger-` lifetime.** Copy a trigger value into a normal variable if anything
later (a job, another trigger) needs it:

```json
{ "type": "updateVariable", "variable": "seconds", "value": "{trigger-1}" }
```

For webhook triggers every key of the incoming JSON message becomes
`trigger-<key>`; for example `{"action":"toyEvent","level":3}` gives
`{trigger-action}` and `{trigger-level}` _(observed)_.

## 4. Expressions

Most numeric and text fields accept an expression, evaluated with
[Math.js](https://mathjs.org/docs/expressions/syntax.html) syntax plus XToys
extensions:

| Syntax                                             | Meaning                                                                       |
| -------------------------------------------------- | ----------------------------------------------------------------------------- |
| `{myvar}`                                          | Variable value                                                                |
| `+10`, `-5`                                        | Relative change of the current value (for example intensity +10 %)            |
| `(20\|40\|60)`                                     | Random pick from a list; repeat a value to weight it: `(1\|1\|1\|2\|3)`       |
| `(1-5)`                                            | Random number in a range                                                      |
| `a ? b : c`                                        | Conditional (Math.js)                                                         |
| `max(a,b)`, `min`, `round`                         | Any Math.js function, without the `math.` prefix                              |
| `gpsDistance(lat1,lng1,lat2,lng2)`                 | Metres between two coordinates                                                |
| `getSeconds(ts)`, `getMinutes(ts)`, `getHours(ts)` | Local-time parts of a timestamp                                               |
| `myFunc(x)`                                        | Any function you defined in custom JavaScript that returns a number or string |

Practical rules:

- **Quote string literals**: `{Location}=="Butt"`, `{trigger-1} == 'slow'`. An
  unquoted word such as `ON` in `{pause}==ON` is a Math.js _symbol_, not a
  string, and the comparison fails.
- **Do not quote the variable** itself. Published scripts consistently write
  `{EnableAutoClicker}=="Enabled"` and compare two variables as `{a} == {b}`,
  which indicates XToys inserts string values as strings _(observed)_. Writing
  `"{var}"` risks double quotes.
- Use Math.js logical operators **`and`, `or`, `not`**. `&` and `|` are _bitwise_
  operators in Math.js, and `|` inside parentheses is also XToys's
  random-choice syntax, so `(a | b)` does not mean "a or b".
- Guard divisions: `{total} > 0 ? {sum}/{total} : 0`.
- `requiredExpression` on an action or trigger makes it run only when the
  expression is truthy. An empty string means "always".

## 5. Actions

The available actions depend on the connected blocks. The common ones are:

| Editor name         | JSON `type` / `action`                | Notes                                                    |
| ------------------- | ------------------------------------- | -------------------------------------------------------- |
| Toy intensity       | `updateComponent` / `setVolume`       | `percentVolume` (0–100 or `+n`/`-n`), `rampTime` seconds |
| Toy maximum         | `updateComponent` / `setMaximum`      | Changes the block's max-intensity cap                    |
| Mode / pattern      | `updateComponent` / `setMode`         | for example e-stim `"mode": "standard"`                  |
| Shock               | `updateComponent` / `setShock2`       | `percentVolume`, `time` seconds, `"shock": true`         |
| Speak / text        | `updateComponent` / `setText`         | Text-to-speech or display text                           |
| Variable            | `updateVariable`                      | `variable`, `value` (expression)                         |
| Job start/stop/goto | `updateJob` / `start`, `stop`, `goTo` | `restart` on start; `step` on goTo                       |
| Script stop/status  | `updateScript` / `stop`, `setText`    |                                                          |
| Play audio          | `updateScript` / `part: "audio"`      | `source: "media"`, `audio: "<media name>"`               |
| Re-enter step       | `updateJob` / `restartStep`           | Re-runs the job's current step _(observed)_              |
| Queue job           | `updateQueue` / `add`, `clear`        | `queue`, `job`, `variables` → `{queue-…}`                |
| Play pattern        | `updateComponent` / `setPattern`      | Inline or media pattern on a channel _(observed)_        |
| Tease display       | `updateTease` / `part`                | text, input, image, video, timer, canvas, audio          |
| Multi-user message  | `multiUser` / `send`                  | `multiUserAction`, `additionalData`, optional `users`    |
| Run JavaScript      | `customCode`                          | Inline ES5 code with trigger variables injected          |

Actions in one list run **in order**. A list of mutually exclusive actions, each
with its own `requiredExpression`, is the usual way to branch.

## 6. Triggers

| Trigger kind      | JSON `type`                                  | Fires when                                                          |
| ----------------- | -------------------------------------------- | ------------------------------------------------------------------- |
| Block state       | `componentState`                             | A toy or tool event: webhook action, speech phrase, button, gamepad |
| Variable change   | `variableChange`                             | The named variable changes                                          |
| Expression        | `expressionState`                            | The expression becomes true                                         |
| Step time elapsed | `stepState` + `"event": "timer"`, or `timer` | `amount` seconds after the step started (job triggers only)         |
| Step finished     | `stepState` + `"event": "actionsComplete"`   | The step's (blocking) actions have all run _(observed)_             |
| Tease media       | `teaseState`                                 | For example `part: "video"`, `event: "started"`/`"stopped"`         |
| Multi-user        | `multiUser`                                  | A user joins or leaves, or a `send` message arrives _(observed)_    |

**Edge semantics.** Most triggers fire once when their condition becomes true
and will not fire again until the condition has been false. An
`expressionState` of `true == true` therefore fires exactly **once** when its
step is entered. This works as an "on enter" hook, but it is not a loop.

**Speech-recognition triggers** match phrases as regular expressions. A captured
group such as `([0-9]*)` fills `{trigger-1}`. The pattern can contain variables
(`"word": "{Mantra}"`). Set `isFinal` to wait for the finished phrase and
`ignoreTTS` so the script does not hear its own text-to-speech output. The
recognizer filters NSFW words, so match neutral phrases.

**Other input blocks** _(observed)_: a `keyboard` block fires on `state: "down"`
with the key code (`KeyA`, `Digit1`, `Space`, `Backspace`) in `{trigger}`; a
`sound-level` block fires on `event: "any"` with the level in `{trigger}`; a
`push-button` block fires on `state: "down"`. See the
[cookbook](javascript-cookbook.html#15-input-blocks) for handling them.

## 7. Jobs and steps

- Jobs never start by themselves. Start them with an `updateJob` `start` action
  (from initial actions, a trigger, or JavaScript).
- A job always begins at the step named **`START`**.
- A job is in exactly one step at a time. Entering a step runs its actions
  immediately, and only the current step's triggers are active.
- Change step with `goTo`. Going to the **current** step re-runs its actions and
  restarts its timers. This is the standard loop idiom:

```json
"START": {
  "actions": [
    { "type": "updateComponent", "channel": "generic-1-a", "action": "setVolume",
      "percentVolume": "+1", "rampTime": 0, "requiredExpression": "{current} < 100" }
  ],
  "triggers": [
    { "type": "stepState", "event": "timer", "amount": "{delay}",
      "actions": [ { "type": "updateJob", "job": "Ramp", "action": "goTo", "step": "START" } ] }
  ]
}
```

- Several jobs can run at once. Two jobs that drive the same channel will fight;
  stop one before starting the other.
- `start` with `"restart": false` does nothing if the job is already running;
  `"restart": true` resets it to `START`.
- `{"type":"updateJob","job":"Countdown","action":"restartStep"}` re-runs the
  current step without naming it _(observed)_.
- Jobs that end by themselves must `stop` themselves.
- Treat cross-job `goTo` (job A sending job B to a step) with care. It is easy
  to copy-paste the wrong job name, and the behaviour when job B is not running
  is not documented.

Common job shapes:

| Shape               | How it works                                                                                                      |
| ------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Retriggerable pulse | `START` sets the output; a timer goes to `Off`, which zeroes and stops. Restarting the job extends the pulse.     |
| Countdown           | A step decrements `{timeLeft}`, a 1 s timer re-runs the step, and an `expressionState` `{timeLeft} <= 0` exits.   |
| Sampler             | Steps `t1`…`t5` each copy `{trigger}` of a sensor into a variable 0.2 s apart; JS takes the maximum.              |
| One-shot output     | `START` applies a value computed elsewhere and stops itself (see the cookbook's "decide in JS, output in a job"). |
| Speaking guard      | A flag variable blocks new text-to-speech until a cool-down step clears it.                                       |

**Queues.** A job added to a queue runs only after the previous queued job has
stopped itself. Queued jobs cannot start other jobs, but they get their own
`{queue-…}` variables. Use queues when every incoming event, such as a tip or a
chat message, must be handled one at a time. Queue names are declared in the
top-level `queues` array _(observed)_, and jobs are added with:

```json
{
  "type": "updateQueue",
  "action": "add",
  "queue": "events",
  "job": "HandleEvent",
  "variables": [{ "name": "seconds", "expression": "{trigger-seconds}" }]
}
```

`{"type":"updateQueue","queue":"events","action":"clear"}` drops pending
entries. A queue can also emulate `setTimeout` for JavaScript; see the
[cookbook](javascript-cookbook.html#72-queue-based-timeout).

## 8. Controls

Controls display a widget that reads and writes the variable named by `id`.

| `type`         | Fields                                       | Value                           |
| -------------- | -------------------------------------------- | ------------------------------- |
| `slider`       | `min`, `max`, `value`                        | number                          |
| range slider   | (editor option)                              | range                           |
| `input`        | `value`                                      | string (convert in expressions) |
| `textarea`     | `value`                                      | string; good for JSON configs   |
| `select`       | `options`, `value`                           | one option                      |
| `multi-toggle` | `options`, `value`                           | one option (button group)       |
| `toggle`       | `up` (off value), `down` (on value), `value` | the `up` or `down` string       |
| `push`         | —                                            | momentary push button           |

Every control can have `name` and `description`. Use a control of
`"type": "header"` with a `name` (and optional `description`) as a section
heading _(observed)_. Older scripts fake headings with a `multi-toggle` that has
no `id` and `"value": null`. In a multi-user tease, `"hostOnly": true` hides a
control from guests _(observed)_. `controlPresets` stores saved value sets.

Remember that toggle values are strings. Compare them as strings:
`{MaxToggle}=="on"`.

## 9. Custom JavaScript

Open the **JS** button in the editor. The code runs once when the script starts,
which defines your functions and globals.

Limitations:

- **ES5 only**: `var`, `function`, no arrow functions, `let`/`const`, template
  literals, classes, or `async`.
- The code is interpreted by JS-Interpreter, so it is slow. Keep handlers small.
- There is no DOM access.
- JavaScript globals and XToys variables are **separate**. A JavaScript
  `var NipplesFactor` is not `{NipplesFactor}`. Read and write XToys variables
  only through the API:

| Function                                                                | Purpose                                                                |
| ----------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `getVariable(name)` / `setVariable(name, v)`                            | Read or write an XToys variable (name without braces)                  |
| `callAction(json[, block])`                                             | Run an XToys action. `true` blocks for blocking tease actions.         |
| `registerTrigger(json, fn)`                                             | Register a trigger. `fn(data, triggerJson)` receives `trigger-…` data. |
| `getXhr(url)`                                                           | Synchronous GET; returns the response text                             |
| `getConnectedBlocks()`, `getConnectedUsers()`, `getFilesInFolder(name)` | Session introspection                                                  |
| `sleep(ms)`, `console.log`, `Object.values`                             | Utilities                                                              |

> The function table on the official JavaScript page swaps the one-line
> descriptions of `callAction` and `registerTrigger`. The detailed sections on
> that page, and the table above, are correct.

Use the editor's **Add XToys Action / Add XToys Trigger** menu to generate the
exact JSON for `callAction` and `registerTrigger`.

`callAction(json, true)` waits for blocking tease actions: main text with a
delay, user input, a timer with blocking enabled, and speech with blocking
enabled. Other actions return immediately.

The [JavaScript cookbook](javascript-cookbook.html) has recipes for start-up
structure, configuration, menus, timers without `setTimeout`, persistent data,
device detection, canvas drawing, patterns, and multi-user messaging.

A `customCode` action runs inline code. Its `variables` array injects trigger
values as local JavaScript variables:

```json
{
  "type": "customCode",
  "code": "handleToyEvent(group, level);",
  "variables": [
    { "name": "group", "value": "trigger-assetGroupName", "expression": null },
    { "name": "level", "value": "trigger-level", "expression": null }
  ],
  "storeResult": false,
  "resultVar": "result"
}
```

Recommended structure for event-heavy scripts: keep **decision logic in
JavaScript** (one `handleX` function per event type that sets variables) and keep
**device output in jobs** (`callAction` starts an `OutputX` job that reads those
variables). That is how the
[BC example](../examples/example-reviews.html#example-1--bc-multi-toy-router) is organised.

Validate untrusted input in handlers: check `typeof`, ranges, and known names
before indexing arrays or calling actions.

## 10. Webhooks: driving a script from outside

Webhooks let other programs send events to a running script.

1. On your XToys profile, create a **Private Webhook** (it has an ID only) or a
   **Shared Webhook** (it has an ID and an auth token).
2. Add a **Webhook** block to the script. Tick _Script can send outbound
   messages_ only if the script must talk back.
3. Add `componentState` triggers on the webhook channel, one per `action` value.

Ways to send an event:

| Transport | Endpoint                                      | Body                                                                            |
| --------- | --------------------------------------------- | ------------------------------------------------------------------------------- |
| GET       | `https://webhook.xtoys.app/<id>?action=x&k=v` | query string                                                                    |
| POST      | `https://webhook.xtoys.app/<id>`              | JSON with an `action` key                                                       |
| WebSocket | `wss://webhook.xtoys.app/<id>`                | JSON text frames with an `action` key; the only transport for outbound messages |

Shared webhooks additionally require the header
`Authorization: Bearer <authtoken>`. Treat a **private webhook ID like a
password**: anyone who knows it can send events to your script. A shared
webhook's auth token must never be given out; share only its ID.

The receiving trigger matches on `action`. Every other key becomes a
`trigger-<key>` variable for that trigger's actions.

The Bondage Club userscript uses this channel; its message catalogue is in the
[plugin analysis](../architecture/bc-xtoys-plugin-analysis.html#webhook-event-contract).

## 11. Scripted patterns

Scripted patterns are patterns that support controls, initial actions, global
triggers, and jobs. Each pattern is a set of **sections** made of **blocks** of
sliders. Block settings:

- **Type**: Square (jump), Straight (linear), or Sine (smooth).
- **Step size**: transition time per slider. It can be `{var}`.
- **Loops**, **Scale %**.
- **After each loop** and **At end of block**: change a variable.

Use them when the waveform is the product and scripts only adjust its
parameters, for example a `{speed}` slider or a job that randomizes `{height}`
every 5 s.

## 12. Teases and multi-user play

Teases use the same editor as scripts, plus a **Media** tab and tease actions
(`updateTease`). Text, user input, and blocking timers hold the action list
until they finish, so one step can alternate "show text → change toy → show
text".

| `part`   | Purpose                                                                     |
| -------- | --------------------------------------------------------------------------- |
| `text`   | Main speech bubble (`location: "main"`) or one-line status bar (`"status"`) |
| `input`  | Buttons, side buttons, or a text field that set a variable or go to a step  |
| `image`  | Show a media image (`cute-(1-3)` picks one at random) or an image URL       |
| `video`  | Show a media or hosted video                                                |
| `timer`  | Visible countdown that sets a variable or blocks                            |
| `audio`  | Play uploaded audio                                                         |
| `canvas` | Create a drawing surface for JavaScript _(observed)_                        |

Button choices can jump directly to a step of the current job with
`goToPage: true` and `page: "<StepName>"` _(observed)_.

**Multi-user teases** _(observed; the official online-play page says teases are
not usable in online sessions, so this appears to be newer than the guide)_:
a host and guests run the same tease. `{multi-user-mode}` tells each copy its
role; `multiUser` actions send named messages with `additionalData`, and
`multiUser` triggers receive them as `{trigger-<key>}` plus `{trigger-user}`.
Keep the host authoritative: only the host runs round timers
(`requiredExpression: {multi-user-mode} == "host"`), and it sends the full
state to every guest that joins. See the
[cookbook](javascript-cookbook.html#14-multi-user-teases).

## 13. Safety and quality checklist

- [ ] Final actions set **every** output channel to 0 and stop shocks.
- [ ] A consent step cannot be skipped. Do not add a `1==1` expression trigger
      next to the consent phrase.
- [ ] A spoken or visible **stop** path exists (for example a global speech
      trigger `stop` → `updateScript stop`).
- [ ] Shock intensities and durations are bounded by controls the wearer owns,
      and default to **0** or low.
- [ ] Every job that should end calls `stop` on itself; no runaway `goTo` loops
      without a timer.
- [ ] String comparisons are quoted and match the control's actual `options`
      exactly (`"Vibe"` ≠ `"Vibrator"`).
- [ ] No division by a variable that can be 0.
- [ ] Every function called from `customCode` exists in the custom JavaScript.
- [ ] Every webhook `action` the sender emits is either handled or deliberately
      ignored.
- [ ] Do not hand-edit `parsed*` fields. The editor regenerates them, and stale
      values (for example `parsedWord: "dit is een test"` beside
      `word: "{mantra}"`) are misleading.
- [ ] Never put webhook IDs, auth tokens, or personal data in a published
      script's defaults.
- [ ] Guest-sent multi-user values are validated and cannot exceed the
      receiving user's own limits.
- [ ] Speech, keyboard, and sound triggers tolerate misrecognition; a false
      positive must not escalate punishment without a cap.

## 14. Debugging

- Open the browser developer console. `console.log` output from custom
  JavaScript and from `customCode` appears there, together with JavaScript
  errors such as a `ReferenceError` for a missing function.
- Temporarily add a `textarea` or `input` control bound to an internal variable
  to watch its value live.
- Test webhook handling with `curl`:
  `curl -X POST https://webhook.xtoys.app/<id> -H 'Content-Type: application/json' -d '{"action":"toyEvent","assetGroupName":"ItemVulva","level":2,"itemName":"VibratingEgg"}'`
- Edit in the editor, then **Export** to inspect the JSON. Re-importing
  hand-edited JSON works, but keep `parsed*` fields out of hand edits.
