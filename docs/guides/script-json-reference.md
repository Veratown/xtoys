---
layout: default
title: Script JSON reference
---

# Script JSON reference

This is the structure of an exported XToys script. XToys publishes no schema.
This reference is derived from real exports and the official guide. Fields
marked _observed_ were seen in exports but are not described in the guide.

## Top level

```jsonc
{
  "initialActions":  [Action],          // run on start
  "finalActions":    [Action],          // run on stop
  "globalTriggers":  [Trigger],         // always active
  "jobs":            { "<JobName>": Job },
  "queues":          [ "<queueName>" ], // queue names used by updateQueue
  "persistentVariables": [ "<var>" ],   // kept across sessions (observed, optional)
  "channels":        { "<channelId>": Channel },
  "controls":        [Control],
  "controlPresets":  [ ... ],           // saved control value sets
  "media":           { "audio": {}, "voices": {}, "patterns": {} },
  "customFunctions": "ES5 source string"
}
```

`media` maps a name to an entry: `{"type": "upload", "path": "<sha256>"}` for
uploaded audio or images (`"<sha256>.jpg"` for images). Tease exports add
`images` and `videos` keys. Empty media sections appear as `{}` or as `[]`
depending on the editor version _(observed)_.

## Channels

The channel key is `<type>-<letter>`; the letter disambiguates several blocks of
the same type (`part-vibrator-a`, `part-vibrator-b`, …).

```json
"part-vibrator-a": { "type": "part-vibrator", "name": "VibeButt" }
"webhook-a":       { "type": "webhook", "outbound": false, "hideWebhookInfo": false }
```

| `type` (observed)               | Block                                                             |
| ------------------------------- | ----------------------------------------------------------------- |
| `generic-1`                     | Generic single-channel output (any toy)                           |
| `part-vibrator`                 | Vibrator part                                                     |
| `part-rotator`                  | Rotation part                                                     |
| `part-estim`                    | E-stim channel (intensity, mode, shock)                           |
| `shockcollar`                   | Shock collar                                                      |
| `part-linear-actuator-position` | Stroker position; `setVolume` with `"mode": "speed"` _(observed)_ |
| `webhook`                       | Webhook tool. `outbound` enables sending messages back.           |
| `speech-recognition`            | Speech input                                                      |
| `speech-synthesis`              | Text-to-speech                                                    |
| `push-button`                   | On-screen push button tool                                        |
| `keyboard`                      | Key presses (optionally from other apps)                          |
| `sound-level`                   | Microphone level                                                  |
| `dice`                          | Dice tool (from the guide's `registerTrigger` sample)             |

`name` is the label users see when connecting; `null` uses the default label.

A **combined block** joins two channels under one key such as
`"generic-1|generic-1-a"` with `"type": "generic-1|generic-1"`. Actions on it
take `"actionChannel": "all"` or a channel number _(observed)_.

## Action

All actions share `type` and an optional `requiredExpression`. An empty string or
a missing field means the action always runs.

### `updateComponent`

| `action`     | Fields                                                                                       |
| ------------ | -------------------------------------------------------------------------------------------- |
| `setVolume`  | `channel`, `percentVolume` (expr, `+n`/`-n` relative), `rampTime` (s)                        |
| `setMaximum` | `channel`, `percentVolume` (absolute or relative)                                            |
| `setMode`    | `channel`, `mode` (for example `"standard"` for e-stim)                                      |
| `setShock2`  | `channel`, `percentVolume`, `time` (s), `shock: true`; `shock: false` with 0 stops           |
| `setText`    | `channel` (speech-synthesis), `text` (supports `{vars}`)                                     |
| `setPattern` | `channel`, `patternAction: "specific"`, `pattern`, `restart`, `videoSync`, `patternControls` |

`setPattern` example _(observed)_; points use funscript `at` (ms) and `pos`
(0–100):

```json
{
  "type": "updateComponent",
  "channel": "generic-1-a",
  "action": "setPattern",
  "patternAction": "specific",
  "restart": true,
  "pattern": {
    "name": "wave",
    "type": "draw",
    "patternData": {
      "loop": true,
      "channels": 1,
      "channelData": {
        "1": [
          { "at": 0, "pos": 10 },
          { "at": 500, "pos": 90 }
        ]
      }
    }
  },
  "patternControls": { "id": "off" }
}
```

### `updateVariable`

```json
{
  "type": "updateVariable",
  "variable": "severity",
  "value": "{severity}*(1.5|2|5)"
}
```

### `updateJob`

```json
{ "type": "updateJob", "job": "Output", "action": "start", "restart": false }
{ "type": "updateJob", "job": "Output", "action": "stop" }
{ "type": "updateJob", "job": "Output", "action": "goTo", "step": "Vibe" }
{ "type": "updateJob", "job": "Output", "action": "restartStep" }
```

`restartStep` re-runs the job's current step _(observed)_.

### `updateQueue`

```json
{ "type": "updateQueue", "action": "add", "queue": "events", "job": "Handle",
  "variables": [ { "name": "seconds", "expression": "{trigger-seconds}" } ] }
{ "type": "updateQueue", "action": "clear", "queue": "events" }
```

Each `variables` entry becomes `{queue-<name>}` inside that job instance.

### `updateScript`

```json
{ "type": "updateScript", "action": "stop" }
{ "type": "updateScript", "action": "setText", "text": "Consent Received" }
{ "type": "updateScript", "part": "audio", "source": "media", "audio": "Click" }
```

### `customCode`

```json
{
  "type": "customCode",
  "code": "doThing(x);",
  "variables": [{ "name": "x", "value": "trigger-level", "expression": null }],
  "storeResult": false,
  "resultVar": "result"
}
```

`variables[].value` names an XToys variable, often a `trigger-…` one, that is
injected as JavaScript local `name`. `expression` _(observed, always `null`)_
appears to allow an expression instead. With `storeResult: true` the code's
result is written to the variable named by `resultVar`. Newer exports also
carry `customVar` (same value as `resultVar`) and, in teases, `"wait": false`
_(observed)_.

### `updateTease`

Tease-only actions, selected by `part` _(observed except where the guide shows
them)_:

```json
{ "type": "updateTease", "part": "text", "location": "main",
  "text": { "ops": [ { "insert": "Hello\n" } ] }, "delay": "reading", "clear": true }
{ "type": "updateTease", "part": "text", "location": "status", "statusText": "Round {round}" }
{ "type": "updateTease", "part": "input", "inputType": "text", "variable": "myvar" }
{ "type": "updateTease", "part": "input", "inputType": "buttons", "buttons": [
    { "name": "Go", "setVariable": true, "variable": "choice", "variableValue": "go",
      "goToPage": true, "page": "NextStep" } ] }
{ "type": "updateTease", "part": "image", "source": "media", "image": "cute-(1-3)" }
{ "type": "updateTease", "part": "video", "source": "url", "site": "<site>", "video": "<id>" }
{ "type": "updateTease", "part": "timer", "timerType": "normal", "seconds": "30",
  "setVariable": true, "variable": "timeUp", "variableValue": "1" }
{ "type": "updateTease", "part": "canvas", "action": "create", "width": "300", "height": "50" }
{ "type": "updateTease", "part": "canvas", "action": "remove", "clear": true }
{ "type": "updateTease", "part": "general", "action": "stop" }
```

`inputType` can also be `side-buttons`. `text.ops` is a Quill delta; the editor
also caches `parsedText`. `delay` is `"none"` or `"reading"` (with
`delayTime`).

### `multiUser`

```json
{
  "type": "multiUser",
  "action": "send",
  "multiUserAction": "settings",
  "users": ["{trigger-user}"],
  "additionalData": [{ "key": "level", "value": "{level}" }]
}
```

Omit `users` to send to everyone _(observed)_.

## Trigger

All triggers share `type`, `actions: [Action]`, and an optional
`requiredExpression`.

| `type`            | Fields                                                                                                                      |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `componentState`  | `channel` plus a block-specific condition (see below)                                                                       |
| `variableChange`  | `variable`, `valueChange` (`null` = any change)                                                                             |
| `expressionState` | `expression`                                                                                                                |
| `stepState`       | `event: "timer"`, `amount` (seconds, expression). Valid only inside job steps.                                              |
| `timer`           | `amount` (seconds). Older or alternative step-timer form _(observed)_.                                                      |
| `stepState`       | `event: "actionsComplete"`: the step's actions have finished _(observed)_.                                                  |
| `teaseState`      | `part` (for example `video`), `event` (`started`, `stopped`) _(observed)_.                                                  |
| `multiUser`       | `event` (`join`, `leave`, `action`), `multiUserMode` (`host`, `guest`, `both`), `multiUserAction` for `action` _(observed)_ |

A `multiUser` trigger provides `{trigger-user}` and one `{trigger-<key>}` per
`additionalData` key of the received message.

`componentState` conditions by block:

| Block                | Condition fields                                            | Trigger variables                            |
| -------------------- | ----------------------------------------------------------- | -------------------------------------------- |
| `webhook`            | `action`                                                    | `trigger-action`, `trigger-<every JSON key>` |
| `speech-recognition` | `word` (regex, may contain `{var}`), `isFinal`, `ignoreTTS` | `trigger-1`, `trigger-2`, … capture groups   |
| `push-button`        | `state: "down"`                                             | —                                            |
| `keyboard`           | `state: "down"`                                             | `trigger` (key code such as `KeyA`)          |
| `sound-level`        | `event: "any"`                                              | `trigger` (level)                            |
| `dice`               | `eventType: "rolled"`                                       | `trigger-result`                             |

### Editor-cached fields

`parsedAction`, `parsedWord`, `parsedAmount`, and `parsedRampTime` hold the
editor's pre-evaluated copy of the matching field. They can be stale, so treat
the unprefixed field as the source of truth and do not hand-maintain the
`parsed*` copies.

## Job

```json
"MyJob": {
  "steps": {
    "START": { "actions": [Action], "triggers": [Trigger] },
    "Next":  { "actions": [Action], "triggers": [Trigger] }
  }
}
```

The `START` step is mandatory. Step names are free text and are referenced by
`goTo`.

## Control

```json
{ "id": "rampTime", "type": "slider", "name": "Ramp (s)", "min": 0, "max": 5, "value": 2,
  "description": "optional help text" }
{ "id": "pause", "type": "toggle", "up": "OFF", "down": "ON", "value": "OFF" }
{ "id": "mode", "type": "multi-toggle", "options": ["Vibe", "Estim"], "value": "Vibe" }
{ "id": "loc",  "type": "select", "options": ["off", "Neck"], "value": "off" }
{ "id": "cfg",  "type": "textarea", "value": "[ ... JSON ... ]" }
{ "id": "go",   "type": "push" }
{ "type": "header", "name": "Vibe settings", "description": "optional" }
{ "type": "multi-toggle", "name": "SECTION HEADING:", "value": null }
```

`header` is the proper section heading _(observed)_; the null `multi-toggle` is
an older trick. Any control can carry `"hostOnly": true` in a multi-user tease
_(observed)_.
