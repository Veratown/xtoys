---
layout: default
title: Example script reviews
---

# Example script reviews

Scripts supplied by the repository owner (examples 1–5) and public scripts
from the Amanda-Cook repository are reviewed here. Examples 1 and 2 were pasted
into the conversation and are not stored. Examples 3–5 are local exports in the
repository's `examples/` folder (`script1.json`, `tease2.json`, `tease1.json`), deliberately not
committed because their authorship and licensing are unknown. Recipes distilled
from these reviews are in the [JavaScript cookbook](../guides/javascript-cookbook.html).

Severity: **High** = wrong or unsafe behaviour; **Medium** = a feature
silently does not work; **Low** = cleanup.

## Example 1 – BC multi-toy router

A webhook-driven script for the [BC XToys plugin](../architecture/bc-xtoys-plugin-analysis.html).
It routes BC events to up to four e-stim channels (`part-estim-a…e`), several
vibrators, and a rotator, based on body location.

### How it is organised

- **Initial actions** zero the intensity variables and set factors such as
  `NipplesFactor`.
- **Global triggers** forward every webhook action (`toyEvent`, `activityEvent`,
  `activityOnOtherEvent`, `itemAdded`, `itemRemoved`) to JavaScript handlers
  through `customCode`, passing `trigger-…` values as arguments.
- The **JS handlers** decide what happened, set XToys variables
  (`buttIntensity`, `Location`, `shockIntensity`, `MaxButt`, …) with
  `setVariable`, and start jobs with `callAction`.
- **`variableChange` triggers** recompute `totalNippleIntensity` as a weighted
  average whenever an input changes.
- **Jobs**:
  - `Output*` jobs push an intensity to the vibrator or e-stim channel chosen by
    a `Vibe`/`Estim` control.
  - `Shock*` jobs fire `setShock2` on the location's channel and then restore the
    previous intensity after `{Duration}+1` s.
  - `Max*Job` jobs nudge the channel maximum up 5 % or down 10 %.
  - `Action` adds a temporary boost and removes it after 5 s.

This is a good pattern: logic in JavaScript, output in jobs, and controls for
per-user mapping.

### Findings

| #   | Sev    | Finding                                                                                                                                                                                         | Fix                                                                                        |
| --- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| 1   | High   | `itemAdded` calls `handleItemAddEvent`, which is not defined in `customFunctions` (only `handleItemRemoveEvent` and the others are). Every item-add event throws a `ReferenceError`.            | Define the function, or remove the trigger.                                                |
| 2   | High   | `ShockNeck` (and the breast/boobs shock job) contains copy-pasted `goTo` actions targeting **`ShockClit`**'s `Estim1`/`Vibe` steps, so a neck shock can also shock or vibrate the clit channel. | Remove those actions, or point them at the job's own steps.                                |
| 3   | Medium | `Max*Job` guards compare `{vibeButt}=="Vibrator"`, but the control's options are `"Vibe"`/`"Estim"`. The vibrator maximum is never adjusted.                                                    | Compare with `"Vibe"`.                                                                     |
| 4   | Medium | Only `MaxButtJob` resets its request variable to `"none"`. The clit, vulva, and nipple jobs keep `"Up"`/`"Down"`, so a later start re-applies a stale request.                                  | Add the reset to every `Max*Job`.                                                          |
| 5   | Medium | `Action` uses `&` in `requiredExpression` (`{Location}=="Butt" & {actionExtra}=="Low"`). In Math.js `&` is bitwise AND, which works on booleans only by accident.                               | Use `and`.                                                                                 |
| 6   | Medium | The `TotalNippleFactor` `variableChange` formula omits the `BreastFactor*breastIntensity` term that the other three formulas include.                                                           | Use the same formula everywhere, or compute it in one JavaScript function.                 |
| 7   | Medium | Weighted averages divide by `{TotalNippleFactor}`, which starts at 0. The result is `NaN`/`Infinity` until a factor is set.                                                                     | `{TotalNippleFactor} > 0 ? (...)/{TotalNippleFactor} : 0`.                                 |
| 8   | Medium | The `Action` job adds `+n` on start and `-n` after 5 s. If it is restarted, or the base intensity changes in between, the subtraction no longer matches and intensity drifts.                   | Keep a separate boost variable and compute the output as base + boost.                     |
| 9   | —      | Withdrawn. `{Location}=={estim1}` is the normal XToys form: published scripts compare variables unquoted and quote only literals.                                                               | None.                                                                                      |
| 10  | Low    | `ShockBody` handles only estim locations 1 and 2, while the other shock jobs handle more.                                                                                                       | Align the jobs, or document the limit.                                                     |
| 11  | Low    | The plugin never sends `ShockItem`; shocks arrive as `activityEvent` with `ShockLow`/`ShockMed`/`ShockHigh`. Branches for other names are dead code.                                            | Match the plugin contract.                                                                 |
| 12  | Low    | `activityOnOtherEvent` is routed into `handleActivityEvent`, which then ignores it. Every such event still costs an interpreter call and a console log.                                         | Remove the trigger, or give it its own handler if "done by me" events should do something. |
| 13  | Low    | `pelvisIntensity`, `outputIntensity`, `activeActivityWeight`, and `rampTimeMS` are initialised but never used.                                                                                  | Remove them.                                                                               |
| 14  | Low    | `toyEvent` indexes an intensity table with `level` directly. The plugin's range is 0–4; a malformed value would index out of range.                                                             | Clamp `level` to 0–4.                                                                      |
| 15  | Low    | `finalActions` is empty, so stopping the script leaves toys at their last intensity.                                                                                                            | Add `setVolume 0` for every output channel.                                                |

## Example 2 – Mantra trainer (Dutch)

A speech-recognition script. The wearer must say a consent phrase, then repeat a
mantra. Correct repetitions reward with vibration; misses or silence escalate an
e-stim punishment (`severity`). Text-to-speech gives instructions.

### How it is organised

- A `Disclaimer` step speaks the rules and waits for the phrase "Ik wil".
- From `BEGIN` onward, the script announces the mantra (`{mantra}`) and waits
  for it through a `componentState` speech trigger with `word: "{mantra}"`.
- `Pleasure` and `Shock` jobs drive the vibrator and e-stim channels.
  `severity` grows by a random factor (`*(1.5|2|5)`) and resets when it reaches
  100 or more.
- A `pause` toggle and a `stop` speech trigger provide control.

### Findings

| #   | Sev    | Finding                                                                                                                                                                     | Fix                                                                  |
| --- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| 1   | High   | **Consent bypass.** The `Disclaimer` step has an `expressionState` trigger `1==1` that fires on entry and jumps to `BEGIN`, so the "Ik wil" consent phrase is never needed. | Remove the `1==1` trigger; leave only the consent phrase to advance. |
| 2   | High   | The `Shock` job sets e-stim volume and moves to `END`, but nothing returns the volume to 0 or stops the job. The channel stays at the shock level.                          | In `END`, set volume 0, then `stop`.                                 |
| 3   | High   | `severity` multiplies by up to 5× per miss and resets only at ≥ 100. One step from 30 can jump to 150 before the reset check, so the first value used can exceed the cap.   | Clamp before use: `min({severity}*(1.5\|2\|5), {maxSeverity})`.      |
| 4   | Medium | `{pause}==ON` compares with an unquoted `ON`, which is a Math.js symbol, not a string. Pause never matches.                                                                 | `{pause}=="ON"`.                                                     |
| 5   | Medium | `percentVolume: " {severity}"` has a leading space. It may parse, but it is fragile.                                                                                        | Remove the space.                                                    |
| 6   | Medium | The `stop` speech trigger is English while all prompts are Dutch; speakers following Dutch prompts may not know it.                                                         | Match `stop\|stoppen` and announce it in the disclaimer.             |
| 7   | Low    | `Pleasure` uses `expressionState` `true == true` as an "on enter" hook. It fires once per entry, not repeatedly, which is correct but easy to misread.                      | Comment it in the step name, or use a step timer of 0.               |
| 8   | Low    | `finalActions` contains `updateScript stop`. The script is already stopping, so this is redundant and possibly recursive.                                                   | Replace it with `setVolume 0` on every channel.                      |
| 9   | Low    | `parsedWord` is cached as `"dit is een test"` while `word` is `{mantra}`. This is harmless, but misleading when reading the JSON.                                           | Let the editor regenerate it.                                        |
| 10  | Low    | `customFunctions` contains only an unused `myAddFunc` template.                                                                                                             | Remove it.                                                           |
| 11  | Low    | `updateScript setText "Consent Received"` is fine, but it is the only visible status; nothing shows the current severity.                                                   | Add a status line with `{severity}`.                                 |

## Example 3 – Webhook "desire" mirror (`script1.json`)

A minimal webhook script. One `GetData` webhook trigger copies six values
(`CockDesire`, `MouthDesire`, `BoobsDesire`, `PussyDesire`, `ButtDesire`,
`Pleasure`) into variables and sends job `J_Intensity` to `START`, which sets a
generic toy and a stroker (`part-linear-actuator-position`, `"mode": "speed"`)
to `{Pleasure}` with a 1 s ramp.

| #   | Sev    | Finding                                                                                                     | Fix                                                               |
| --- | ------ | ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| 1   | High   | `finalActions` is empty, so stopping the script leaves both toys running.                                   | Add `setVolume 0` for both channels.                              |
| 2   | Medium | `{Pleasure}` from the webhook is used unchecked; a missing field or a value outside 0–100 reaches the toys. | `min(max({trigger-Pleasure}, 0), 100)` or validate in JavaScript. |
| 3   | Medium | `goTo START` on a job that was never started relies on undocumented behaviour.                              | Use `updateJob start` with `"restart": true`.                     |
| 4   | Low    | Five `*Desire` variables are stored but never used, and there are no controls for a wearer-owned maximum.   | Remove them, or use them with a `maxIntensity` slider.            |

## Example 4 – Multi-user pleasure/pain choice game (`tease2.json`)

A two-player tease. Each round, a countdown runs; each player picks "pleasure"
or "pain"; the combination decides who gets vibration or a shock.

### How it is organised

- **Roles** come from `{multi-user-mode}`. On guest `join`, the host sends a
  `settings` message with the round time (`timer`, a `hostOnly` slider) to that
  guest and starts the `Timer` job; guests copy `{trigger-timer}`.
- **Timer job**: `Countdown` decrements `timeRemaining`, re-runs itself every
  second with `restartStep`, and an `expressionState` on `{timeRemaining} == 0`
  goes to `TimeUp`. Only the host advances rounds.
- **MakeChoice job** shows buttons with `updateTease input`; a button sets
  `choice` and jumps to `SendChoice` with `goToPage`. The choice is sent with a
  `multiUser` `choice` message; the receiver stores it as `otherChoice`.
- A `customCode` action compares both choices and calls `setVolume` and
  `setShock2` through `callAction`.

### Findings

| #   | Sev    | Finding                                                                                                                            | Fix                                                                              |
| --- | ------ | ---------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| 1   | High   | Shock strengths 30, 60, and 100 % are hard-coded in JavaScript. Nothing lets a player cap their own shock level.                   | Add a per-player maximum control (not `hostOnly`) and scale by it.               |
| 2   | High   | There is no consent step or stop/safe-word button; the only exit is stopping the tease.                                            | Add a start confirmation and a side button that stops rounds and zeroes outputs. |
| 3   | Medium | `finalActions` zeroes the vibrator only. A shock is momentary, but the shock channel is never explicitly reset.                    | Add `setShock2` with `shock: false` and 0.                                       |
| 4   | Medium | A received `choice` is stored without validation; any string other than the expected values falls through the comparison silently. | Accept only `"pleasure"`/`"pain"`, otherwise ignore and log.                     |
| 5   | Low    | The `leave` handler stops the timer and clears the text, but gives the remaining player no message or way to restart.              | Show "partner left" and offer a restart button.                                  |

## Example 5 – Video tease engine (`tease1.json`)

A large tease (≈ 137 KB of custom JavaScript) that browses a remote video index,
plays videos, and drives toys with funscript-like patterns synchronised to the
video. It is the richest source for the
[JavaScript cookbook](../guides/javascript-cookbook.html).

### How it is organised

- Start-up code reads `getConnectedBlocks()` to find connected outputs
  (single channel, dual channel `generic-1|generic-1-a`, stroker, e-stim) and
  warns with Yes/No buttons when none is connected.
- It downloads a JSON index with `getXhr`, drawing a progress bar on a tease
  `canvas`.
- Navigation is a set of buttons that set variables (`navigate`, `videoChoice`,
  `videosPage`, …); `registerTrigger` `variableChange` handlers dispatch them.
- `teaseState` triggers on `video` `started`/`stopped` start and stop patterns.
  Patterns are built in JavaScript and played with `setPattern` (`videoSync`).
- Four queues provide delays: `timeout` (a `setTimeout` emulation that calls
  back into JavaScript with `{queue-delay}`), `rampup`, `images`, and
  `indexcheck`.
- Favourites and history are stored as JSON in the persistent variable
  `cookies`.
- In multi-user mode the host and guests exchange `status`, `activity`,
  `follow`, `forceActivity`, and `identification` messages.

### Findings

| #   | Sev    | Finding                                                                                                                                                                     | Fix                                                                       |
| --- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| 1   | Medium | `clearPattern()` checks whether **any** stroker is connected inside its device loop, so with a stroker connected it sends the stroker's `setPosition` to every device type. | Compare the loop's `deviceType` with the stroker type.                    |
| 2   | Medium | The video index, thumbnails, and videos come from external hosts (a CloudFront distribution and Reddit image hosts). The tease breaks, or changes content, if they change.  | Document the dependency, and handle fetch failure with a visible message. |
| 3   | Medium | A guest can send `forceActivity`/`follow` messages that change what the host plays; incoming values are decoded and used without a schema check.                            | Validate message fields and restrict which roles may send each action.    |
| 4   | Low    | `displayTextAndWait` is declared twice. ES5 keeps the last (4-argument) declaration, so the 1-argument wrapper with defaults is dead code.                                  | Rename the wrapper, or default missing arguments inside one function.     |
| 5   | Low    | The `indexcheck` queue job waits an hour, runs a commented-out call, and never stops itself, so anything queued after it on `indexcheck` would never run.                   | Remove the job, or restore the call and stop the job.                     |
| 6   | Low    | `sleep(0.5)` is used as if it were seconds; `sleep` takes milliseconds.                                                                                                     | Use `sleep(500)` or remove it.                                            |
| 7   | Low    | Debug logging is gated by a `debug` toggle, but many handlers log `JSON.stringify(data)` unconditionally.                                                                   | Route all logs through one debug-gated helper.                            |

## Public scripts: Amanda-Cook/xtoys

<https://github.com/Amanda-Cook/xtoys> (commit `9a886a4`, 2024-06-27) publishes
six scripts, each as an export plus a separate `.js` file for diff-friendly
version control. The repository has no license file, so this section describes
the scripts without reproducing their code.

| Script                                        | Blocks                                                       | Technique worth reusing                                                                                                                |
| --------------------------------------------- | ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| Clicker Conditioning                          | generic toy, push button, speech recognition, text-to-speech | Uploaded click sound via `updateScript part: "audio"`; an `isSpeaking` flag and 2 s cool-down step keep speech from overlapping.       |
| Cruel Clicker Conditioning                    | generic toy, push button, shock collar                       | JavaScript probability roll decides between `Reward` and `Punish` jobs, with "allow both" and "allow neither" options.                 |
| Mantra – Punishments and Intermittent Rewards | generic toy, shock collar, sound level, speech in/out        | Every intensity and duration is a random value within user-set min/max controls; reward frequency decays towards a floor.              |
| Mantra – Vocal Control                        | vibrator, sound level, speech in/out                         | A five-step job samples the sound level every 0.2 s; the loudest sample scales the reward.                                             |
| Talk Dumb                                     | generic toy, shock collar, speech recognition                | A two-word capture regex feeds JavaScript that estimates syllables and escalates intensity with sustained speech.                      |
| Type Dumb                                     | generic toy, shock collar, keyboard, text-to-speech          | Keyboard `KeyboardEvent.code` values are mapped to letters to check typed phrases; status text is updated with `updateScript setText`. |

Good practice shown throughout: every script's `finalActions` zeroes each toy
and, where a shock collar is used, sends a zero, non-shock `setShock2`.
Punishment levels come from wearer-editable controls.

Issues observed:

| #   | Sev    | Script                     | Finding                                                                                                                                                   |
| --- | ------ | -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Medium | Both Mantra scripts        | The loudest sound sample is chosen with `sort()` then `reverse()`. Default `sort()` compares strings, so a level of 9 ranks above 10.                     |
| 2   | Medium | Talk Dumb                  | `Intensity` grows by 5 with no upper bound in JavaScript, and `getVariable` results are used in arithmetic without `Number()` conversion.                 |
| 3   | Medium | Clicker Conditioning       | Initial actions set `isSpeaking` to an unquoted `FALSE` while later actions set `"TRUE"`/`"FALSE"` as quoted strings; the first comparison may not match. |
| 4   | Low    | Type Dumb                  | The committed `.script` file has its quotes stripped and is not valid JSON, so it cannot be imported; only the `.js` file is usable.                      |
| 5   | Low    | Cruel Clicker Conditioning | In "multiple allowed" mode with "allow neither" disabled, a die roll exactly equal to a chance value fails both tests and nothing happens.                |
| 6   | Low    | Mantra – Vocal Control     | A `customCode` action carries leftover `value`/`variable` fields from another action type.                                                                |

## Lessons for new scripts

See the [safety and quality checklist](../guides/scripting-guide.html#13-safety-and-quality-checklist).
The recurring problems are copy-paste between jobs, unquoted strings, missing
"all off" final actions, and consent or stop paths that can be bypassed.
The larger scripts add a second group: unvalidated input from webhooks and
other players, hard-coded intensities, string-versus-number confusion in
JavaScript, and dependencies on external hosts.

## Starter template

[`bc-webhook-starter.json`](https://github.com/Veratown/xtoys/blob/main/examples/bc-webhook-starter.json) is a minimal script that
can be imported into XToys. It listens for the plugin's `toyEvent` on a chosen
body group, clamps `level` to 0–4, and scales it by a wearer-owned maximum.
It also offers a pause toggle, zeroes the toy on stop, and handles the proposed
`bridgeStop` event. Untested against a live XToys session; import it and check
it in the editor before use.

## Tremblr and DG-LAB template

[`tremblr-dglab-webhook.json`](https://github.com/Veratown/xtoys/blob/main/examples/tremblr-dglab-webhook.json) drives two devices
from the same webhook events as the starter template:

- an **F-Machine Tremblr** on a Generic Output block (`generic-1-a`). Generic
  Output connects to any toy, and the Tremblr's intensity is its stroke speed.
- a **DG-LAB Coyote** on two e-stim blocks, `part-estim-a` and `part-estim-b`,
  one for each Coyote channel. Connect channel A and channel B to the matching
  blocks when the script starts.

Each output follows the BC body group chosen in its control (`off` disables
it). Behaviour:

| Event                                          | Effect                                                                                                       |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `toyEvent` on a mapped group                   | Output = `level × max / 4` (level clamped to 0–4), ramped over _Ramp (s)_.                                   |
| `inflationEvent` on a mapped group             | With _Inflation counts as level_ on (default): same as `toyEvent`.                                           |
| `activityEvent` on a mapped group (not shocks) | Adds _Activity boost %_ of that output's max for _Activity boost duration_; never above max.                 |
| `ShockLow`/`ShockMed`/`ShockHigh` on A or B    | Only with _Allow shock events_ on and not paused: one timed shock at 1/3, 2/3, or all of _Shock strength %_. |
| `itemRemoved` on a mapped group                | That output's level returns to 0.                                                                            |
| `vtRoomJoin` with `who: "other"`               | Boosts the outputs chosen in _Someone enters the room_ by _Room entry boost %_.                              |
| `vtSpokenTo`                                   | Boosts the outputs chosen in _Someone speaks to me_ by _Spoken-to boost %_.                                  |
| Game events (see below)                        | Boost the outputs chosen in _Game events boost_ by _Game boost %_, if that event's toggle is on.             |
| `bridgeVerify`                                 | Shows the Veratown link code in the status text.                                                             |
| `bridgeTest`                                   | Shows "Veratown bridge test received".                                                                       |
| `bridgeStop`                                   | Stops all jobs, sets every output to 0 without ramping, and shows the reason.                                |
| `bridgeState` / `vtResult`                     | Shows the bot's answer to a two-way request in the status text.                                              |

Game events and their toggles (each also needs `!xtoys game <source>`):

| Toggle                                     | Event                                                                       |
| ------------------------------------------ | --------------------------------------------------------------------------- |
| _Casino loss_                              | `vtCasinoResult` with `outcome: "loss"`                                     |
| _Picked for the Hot Seat or bluff exposed_ | `vtHotSeatSelected`, or `vtHotSeatReleased` with `outcome: "bluff_exposed"` |
| _Truth or Dare challenge assigned_         | `vtTruthDareAssigned`                                                       |
| _Dilemma prediction wrong_                 | `vtDilemmaResult` with `outcome: "incorrect"`                               |
| _Trick-or-treat loss or nothing_           | `vtTrickOrTreatOutcome` with `outcome` `loss` or `nothing`                  |
| _Staged Table stage confirmed_             | `vtStagedTableAppearance` with `state: "stage_confirmed"`                   |
| _Shower starts_                            | `vtShowerStarted`                                                           |

Two-way controls send JSON back over the same webhook with the webhook block's
`send` action (`webhookAction` plus `webhookData` key/value pairs, captured
from a real export). The webhook block has _Script can send outbound messages_
ticked. The bot answers with `vtResult` or `bridgeState`, shown in the status
text.

| Control                      | Sends                                             | Bot grant needed |
| ---------------------------- | ------------------------------------------------- | ---------------- |
| _Set BC vibrator level_      | `vtSetVibe {group, level}`                        | `setVibe`        |
| _Send emote_                 | `vtEmote {template}`                              | `emote`          |
| _Ask bot for state_          | `vtQueryState`                                    | `queryState`     |
| _Stop bot control_           | `vtStop`                                          | `stop`           |
| _Pause everything_ (when on) | `vtStop`, if _Pause also stops bot control_ is on | `stop`           |

Levels are sent as names (`off` to `maximum`), because webhook values may
arrive at the bot as text. A level the bot sets changes the BC vibrator; the
bot then sends the observed change back as `toyEvent` (with
`origin: "bridge"`), so an output that follows that group moves with it.

Safety defaults: the e-stim maximums start at 20 %, shocks are off, a shock lasts
0.5–2 s, pause zeroes every output at once and cancels running shocks, and
stopping the script sets all outputs to 0. _Idle stop_ (off by default) zeroes
everything when no event arrives for the chosen time. Neither the Veratown bot
nor the BC userscript sends keep-alives, so a quiet room also stops the
outputs. Also set channel limits in the DG-LAB settings,
because the script's sliders are a second limit, not the only one.

Design notes:

- Each output is computed in one `Apply` job from separate level and boost
  variables, so overlapping boosts cannot drift (see Example 1, finding 8).
- Boosts and shocks run in per-output jobs that are restarted, not stacked.
- Room and chat reactions are off by default. Each kind has its own
  cooldown (_Room/chat cooldown_, 30 s by default) so a busy room cannot keep
  an output boosted, and neither runs while paused. _Only trusted members_
  reacts only to events marked `relation: "trusted"`. Room and chat events
  never cause shocks.
- One trigger per event evaluates the cooldown flag once; per-output actions
  carry their own `requiredExpression`. Separate triggers per output would each
  re-read a flag that the first one had already cleared.
- A room or chat boost replaces a running activity boost on the same output
  rather than adding to it, and restarts its timer.
- Each game trigger only increments `gameHit`; one `variableChange` trigger on
  it applies the boost to the outputs chosen in _Game events boost_, so the
  routing exists once. Game events never
  cause shocks and do nothing while paused.
- Using it with the Veratown bot: whisper `!xtoys link <webhook ID>`, then
  `!xtoys verify <code>` with the code from the status text. Choose events with
  `!xtoys mirror` and `!xtoys game`; grant two-way control with
  `!xtoys control` and `!xtoys groups`. The bot's
  `docs/features/xtoys-bridge/README.md` is the current contract.

Checked offline only: every variable, job, and channel reference resolves, and
the expressions evaluate in Math.js when variables are inserted the way
published scripts imply. Not tested in XToys: the block choices for the
Tremblr and Coyote, `setMode "standard"` on the Coyote, and whether `setShock2` accepts a variable for `time`. Live-confirmed:
`bridgeVerify` shows the link code, and `webhookData` values substitute
`{variables}` (sent as strings; see the
[bridge test](#veratown-bridge-test-script)). Import the script and check it in the editor
before use.

### Room and chat sender

The BC XToys userscript does not send room-entry or chat events; its only chat
hook shows its own help text when the player enters a room. The
[room and chat sender](https://github.com/Veratown/xtoys/blob/main/tools/bc-room-chat-sender.user.js) is a small
userscript that fills this gap from the player's own BC client:

| BC packet received by the player                                   | Event sent                                       |
| ------------------------------------------------------------------ | ------------------------------------------------ |
| `ChatRoomSyncMemberJoin` for another member                        | `vtRoomJoin`, `who: "other"`                     |
| `ChatRoomSyncMemberLeave` for another member                       | `vtRoomLeave`, `who: "other"` (template ignores) |
| `Whisper` from another member (the server delivers it only to you) | `vtSpokenTo`, `kind: "whisper"`                  |
| `Chat` that names you (name or nickname, whole word)               | `vtSpokenTo`, `kind: "chat"`                     |
| `Emote` that names you                                             | `vtSpokenTo`, `kind: "emote"`                    |

Every event also carries `relation`: `trusted` when the other member is on
your whitelist, your owner, or a lover, and `other` otherwise. Your own
messages and blacklisted members produce nothing. Events carry no text, names,
or member numbers. Gagged chat is matched against the ungarbled text that the
sender's client attaches, when present. Activities are not sent, because the BC
XToys userscript already sends them as `activityEvent`.

Setup:

1. Install the BC XToys userscript and this sender in Tampermonkey or
   Violentmonkey. Both send to the same webhook over separate connections and
   use different `action` names. Two simultaneous connections to one webhook
   have not been tested.
2. In BC, type `/xtroom connect <webhook ID>` (a `webhook.xtoys.app` URL also
   works). The ID is stored in this browser's `localStorage`, and the sender
   reconnects on its own after a page reload.
3. In the XToys script, choose outputs under _Someone enters the room_ and
   _Someone speaks to me_.

Other commands: `/xtroom status`, `on`, `off`, `forget` (removes the ID), and
`send <join|leave|chat|emote|whisper|all> <on|off>` to choose which events
leave your browser. The sender sends at most one event per event name every
10 seconds and drops the rest instead of queueing them. The script's _Room/chat
cooldown_ adds its own limit. Only private webhooks are supported, because a
shared webhook's token would have to be stored in the browser.

The proposed Veratown bridge could send the same events for every linked
player in its room
([contract](../architecture/veratown-xtoys-bridge-proposal.html#81-bc-mirror-events-options-2-and-3)).
A bot cannot see whispers between other members, so through the bot,
_Someone speaks to me_ cannot react to whispers.

The sender has been checked offline only: a Node harness with fake BC globals
and a fake WebSocket checks the exact payloads, self and blacklist filtering,
whole-word matching, rate limits, reconnect backoff, the commands, and that the
webhook ID never appears in chat or console output. It has not been run in a
live BC session or against a live XToys webhook.

## Veratown bridge test script

[`veratown-bridge-test.json`](https://github.com/Veratown/xtoys/blob/main/examples/veratown-bridge-test.json) is a diagnostic script
for the Veratown bot's XToys bridge. It has one trigger for each event the bot
sends, test controls for each control message the script can send to the bot,
and an optional low-power vibrator. It does not use e-stim.

| Part              | What it does                                                                                                                                                                                                     |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Event triggers    | All 27 bot events (`bridgeVerify` … `vtTrickOrTreatOutcome`). Each trigger increments a per-event counter `c<Event>` and `received`, and shows the event and its key fields in the status text.                  |
| _Echo to harness_ | When on, every event is echoed back as `probeAck` with `event`, `seq`, `count`, and up to two fields `f1`/`f2`. Off by default; the bot drops `probeAck` frames.                                                 |
| _Send one test_   | Sends one control message: `query`, `setNamed` (`low`), `setNumber` (`"40"`), `setMember`, `emote`, `setOff`, `stop`, `badAction` (`vtBogus`), or `badLevel` (`ultra`). The last two must be dropped by the bot. |
| _Run all_         | Job `RunAll` sends all nine tests, _Seconds between tests_ apart, with `requestId` `r<run>s<step>`, then shows a summary. `setMember` is skipped while _Delegated member number_ is 0.                           |
| Result tracking   | `vtResult` increments `resOther`, or `resRejected` when `status` is `rejected`; `bridgeState` is counted in `cBridgeState`. _Show summary_ reports totals and how many of the 27 event types arrived.            |
| Optional test toy | _Toy follows toyEvent_ maps BC levels 0–4 to 0–_Toy max_ %, capped at 50 %. _Pulse toy for 3 s_ checks the device. `bridgeStop`, pause, and closing the script set it to 0.                                      |

### Harness: test the script against XToys without the bot

[`tools/veratown-bridge-harness.mjs`](https://github.com/Veratown/xtoys/blob/main/tools/veratown-bridge-harness.mjs)
connects to your webhook in place of the bot (Node 22 or newer, no
dependencies). Do not run it while the bot is linked to the same webhook.

1. Import the test script in XToys, connect its webhook, and turn on _Echo to
   harness_.
2. Run `XTOYS_WEBHOOK_ID=<id or URL> node tools/veratown-bridge-harness.mjs`
   (add `--phase outbound` or `--phase inbound` to run one half, `--verbose`
   to print frames). The ID is never printed.
3. Outbound phase: the harness sends every bot event with sample fields and
   checks that the echo returns the same `seq` and field values. A `{...}`
   value means XToys did not substitute variables in `webhookData`.
4. When prompted, turn on _Run all control tests_. For each message, the
   harness checks it against a copy of the bot's strict inbound schema, prints
   the raw frame with field types, replies as the bot would (`bridgeState` or
   `vtResult` with the same `requestId`), and checks that the script recorded
   the reply.
5. The exit code is 0 when nothing failed. `setMember` is `SKIP` unless a
   delegated member number is set.

Live result (XToys, November 2026): every event round-tripped with the same
`seq` and field values, `{variables}` in `webhookData` are substituted, and
every `webhookData` value arrives as a JSON string, so `level: "40"` and
`member: "12345"` are text. The bot accepts digit strings for these integer
fields from the version that added this test script; older bot builds drop
`setNumber` and `setMember`.

### Testing with the bot

With _Echo to harness_ off, link the script and work through the checklist.
Each line names the expected counter or status text.

| Step                                                                       | Expected                                                                                  |
| -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `!xtoys link <webhook ID>`                                                 | `bridgeVerify` shows the code; `!xtoys verify <code>` completes the link                  |
| `!xtoys test`                                                              | `cBridgeTest` increases                                                                   |
| `!xtoys mirror` on; change a worn vibrator, add/remove an item, act on you | `toyEvent`, `itemAdded`, `itemRemoved`, `activityEvent`; inflation items `inflationEvent` |
| Do an activity on someone else                                             | `activityOnOtherEvent`                                                                    |
| Another member joins or leaves; someone names you in chat or an emote      | `vtRoomJoin`, `vtRoomLeave`, `vtSpokenTo`                                                 |
| Walk into and out of a mapped location                                     | `vtLocationEntered`, `vtLocationLeft`                                                     |
| `!xtoys game` on; play casino, hot seat, truth or dare, and so on          | The matching `vt…` game event                                                             |
| Grant control (`!xtoys control`, `!xtoys groups`, `!xtoys confirm`)        | _Run all_: `query` → `bridgeState`; the others → `vtResult` with the same `requestId`     |
| Run all without grants                                                     | `vtResult` `rejected` (`not_granted`); `badAction` and `badLevel` get no reply            |
| `!xtoys pause`, then `!xtoys unlink`                                       | `vtQueryState` returns `rejected` (`paused`); unlink sends `bridgeStop` with a reason     |

The status text shows the last event. Use _Show summary_ for totals and _Reset
counters_ between runs.
