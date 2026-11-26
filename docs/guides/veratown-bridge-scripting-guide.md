---
layout: default
title: Veratown bridge scripting guide
---

# Veratown bridge: event contract and scripting guide

This guide documents the XToys webhook contract implemented by Veratown and
shows how to build scripts at basic, advanced, and expert levels. It is the
cross-scenario reference for BC mirroring, arousal, room and chat notices, map
locations, game events, inbound controls, and delegation.

The bridge is disabled until an operator configures its credential key,
enables the room feature, and confirms the third-party notice. An importable
[arousal-to-vibration example](../working-instructions/arousal-vibe.html) and a broader
[event-control example](../working-instructions/veratown-event-control.html) are
available. The bridge and exports are offline-tested; the live XToys relay and
physical-device behavior have not been verified.

## 1. Setup, defaults, and opt-outs

1. The operator enables the bridge and chooses the maximum allowed event
   categories and game sources. This policy is an upper bound; a player cannot
   override it.
2. The player privately links their XToys webhook using
   `!xtoys link <webhook ID>`, reads the verification code in XToys, and replies
   with `!xtoys verify <code>`. Never share the webhook ID or verification code.
3. New player profiles enable all supported outbound event categories by
   default. The player can opt out at any time:

   ```text
   !xtoys mirror off arousal
   !xtoys mirror off chat
   !xtoys game off locations
   !xtoys mirror none
   !xtoys game none
   ```

   Use `!xtoys mirror on <category>` or `!xtoys game on <source>` to re-enable
   one, and `all` to enable all player-selectable categories within operator
   policy. Existing profiles preserve their saved category choices during
   migration; previous explicit opt-outs are not silently undone.
4. `!xtoys pause` / `!xtoys resume` gates all bridge output and inbound
   controls. A script should also have its own visible pause control and zero
   its local output on pause and on `bridgeStop`.
5. To adjust arousal event bandwidth, use
   `!xtoys arousal-step <1-100>`. The default is 10 percentage points. This is
   the bridge's event granularity, not a local XToys device cap.

Event-category defaults do not grant inbound `setVibe`, `emote`, or
`delegate` control. Inbound commands remain subject to operator capability,
player grant, consent, presence, observed state, location, and level limits.

## 2. Webhook message shape

The XToys webhook trigger exposes each JSON key as `{trigger-<key>}`. For
example, `{"action":"toyEvent","level":2}` exposes `{trigger-action}` and
`{trigger-level}` to that trigger's actions. Values are commonly strings in
XToys expressions; numeric expressions generally convert numeric strings.
`trigger-` values are trigger-scoped, so copy them into ordinary variables or
queued-job variables if later actions need them.

Most messages on an active connection include `seq`, a monotonically
increasing per-connection sequence number. Do not treat it as a timestamp or
persist it across reconnections. The initial verification message may not carry
it. Bridge events may also include:

| Field | Values and meaning |
| --- | --- |
| `origin` | `room`, `game`, or `bridge`. `bridge` identifies an observed toy change caused by bridge control; use it to prevent script feedback loops. |
| `relation` | `self`, `trusted`, or `other` for actor-related room events. Arousal updates always use `self`; not every event family has this field. |

XToys itself does not expose a raw parsed JSON object to a script. Match the
`action` and read each documented field through its `trigger-` variable.

## 3. Complete outbound event reference

### Lifecycle and control responses

| `action` | Fields | Meaning |
| --- | --- | --- |
| `bridgeVerify` | `code` | One-time private link verification code. Do not log, speak, or share it. |
| `bridgeTest` | — | Player-requested connection test. |
| `bridgeState` | `present`, `fresh`, `groups`, optional `requestId` | Response to `vtQueryState`; `groups` maps observed BC item-group keys to vibrator levels 0–4. |
| `bridgeStop` | `reason` | Stop request from the bot, safeword, disconnect, or shutdown. Immediately pause and zero local outputs. |
| `vtResult` | `request`, `status`, optional `requestId`, optional `reason` | Result of an inbound control request. `observed` means a matching BC room update was seen, not that a physical device acted. |

### BC mirror categories

The `origin` and `relation` metadata described above are present when provided
by the mapper; `seq` is connection metadata. The player and operator must both
allow the event category.

| Category | `action` and fields | Notes |
| --- | --- | --- |
| `toy` | `toyEvent {assetGroupName, itemName, assetName, level}` | Observed vibrator level 0–4; `assetName` is a compatibility alias for `itemName`. The first appearance observation establishes a baseline and is not emitted as a change. Bridge-originated changes use `origin:"bridge"` when matched. |
| `toy` | `inflationEvent {assetGroupName, itemName, level}` | Observed inflation level. Unsupported or unresolved item state is omitted, not interpreted as zero. |
| `arousal` | `arousalUpdate {progress, bucket, step, origin:"room", relation:"self"}` | BC arousal progress 0–100. `bucket` is floored to `step` (1–100, default 10), except 100 remains the final bucket. Initial state is sent when available; thereafter only bucket changes are sent. Changing the step sends the current bucket. |
| `items` | `itemAdded` / `itemRemoved {assetGroupName, assetName}` | Observed BC use, remove, or swap targeting the linked player. A swap emits removal before addition. |
| `activitySelf` | `activityEvent {assetGroupName, actionName, assetName}` | Supported BC Activity, Portal Link panties action, or observed broadcast shock directed at the linked player. Shock names: `ShockLow`, `ShockMed`, `ShockHigh`. |
| `activityOther` | `activityOnOtherEvent {assetGroupName, actionName, assetName}` | Supported BC activity the linked player performs on another member. |
| `room` | `vtRoomJoin` / `vtRoomLeave {who:"other"}` | Another member joined or left. Does not report the linked player's own room entry or exit. |
| `chat` | `vtSpokenTo {kind:"chat" \| "emote"}` | A public chat or emote mentioned the linked player's name. Text and speaker identity are not included. |

`activitySelf` and `items` also follow the player's trigger-source policy:
`self` (default), allowlisted actors, or anyone, subject to the denylist.
With the default `self` setting, actions by another member—including a
broadcast shock directed at the linked player—are suppressed. To receive them,
choose `!xtoys triggers allowlist` and `!xtoys allow <member>`, or explicitly
choose `!xtoys triggers anyone`.
Changing `!xtoys triggers` does not permit activity or item sources the
operator has disabled.

### Map location and game events

Location and game payloads are coarse and exclude member numbers, free text,
prompts, answers, and exact amounts. Their category is controlled by the
matching `!xtoys game` source.

| Source | `action` | Additional fields |
| --- | --- | --- |
| `locations` | `vtLocationEntered` / `vtLocationLeft` | `location`, `locationType` |
| `casino` | `vtCasinoResult` | `game`: `slots` or `roulette`; `outcome`: `win`, `loss`, or `push`; `stakeBand`: `none`, `low`, `medium`, or `high` |
| `hot-seat` | `vtHotSeatSelected` | None |
| `hot-seat` | `vtHotSeatReleased` | `outcome`: `bluff_exposed`, `bluff_fooled`, `truth_told`, `refused`, `respondent_left`, `answer_timeout`, or `insufficient_votes`; `settlement`: `forfeited`, `granted`, or `none` |
| `truth-dare` | `vtTruthDareAssigned` | `kind`: `truth` or `dare`; `role`: `winner` or `low` |
| `truth-dare` | `vtTruthDareResolved` | `role`: `winner` or `low`; `outcome`: `attested`, `declined`, `timed_out`, or `left` |
| `dilemma` | `vtDilemmaResult` | `role`: `decider` or `predictor`; `choice`: `a`, `b`, or `none`; `outcome`: `decided`, `correct`, `incorrect`, or `void` |
| `staged-table` | `vtStagedTablePhase` | `phase`: `warmup`, `progression`, `spotlight`, `complete`, or `safety_stopped` |
| `staged-table` | `vtStagedTableAppearance` | `state`: `stage_confirmed` or `released`; `stage`: a number |
| `shower` | `vtShowerStarted` | None |
| `shower` | `vtShowerEnded` | `reason`: `completed`, `left_location`, `interrupted`, or `recovery_required` |
| `trick-or-treat` | `vtTrickOrTreatOutcome` | `choice`: `treat`, `trick`, or `duel`; `outcome`: `reward`, `nothing`, `win`, `loss`, or `tie`; `rewardBand`: `none`, `low`, `medium`, or `high` |

The bridge does not publish pose, PawPrints sensor readings, exact coordinates,
free-form chat, or every client-local BC action. Shock forwarding depends on a
matching broadcast room action; local-only actions are not observable.

## 4. Inbound messages: XToys to Veratown

Scripts send a JSON message through a `webhook-a` channel with `outbound:true`.
In an exported action, this is represented by `updateComponent`, `action:"send"`,
`webhookAction`, and `webhookData` key/value entries. For example:

```json
{
  "type": "updateComponent",
  "channel": "webhook-a",
  "action": "send",
  "webhookAction": "vtQueryState",
  "webhookData": [
    { "key": "requestId", "value": "status-check-1" }
  ]
}
```

Supported messages:

| Message | Player capability | Fields |
| --- | --- | --- |
| `vtQueryState` | `queryState` | Optional `requestId`; replies with `bridgeState`. |
| `vtStop` | `stop` | Optional `requestId`; cancels pending control. Turning off allowed BC vibrators additionally requires the separately confirmed `stopChanges:vibesOff` setting. |
| `vtSetVibe` | `setVibe` or delegated access | `group`, `level`, optional delegated `member`, optional `requestId`. `level` is `off`, `low`, `medium`, `high`, `maximum`, or an integer 0–100. |
| `vtEmote` | `emote` | Fixed `template` (`shiver`, `squirm`, `gasp`, `blush`, `moan`), optional `requestId`. |

Every command is additionally restricted by operator policy, player grants,
consent, room presence, fresh observed appearance, location rules, permitted
item groups, and the effective level cap. Unknown or invalid JSON is dropped.
Inbound payloads are limited to 1 KiB and at most 10 messages per second per
link. Outbound payloads are limited to 2 KiB. These are protocol limits, not
reasons to send sensitive data.

Delegation is explicit: the target player grants `delegate`, confirms the
privileged change, then enables an individual delegate. A delegated `vtSetVibe`
specifies the target member; the target's own policy, pause state, consent,
location, observed wearable, and caps still apply. Revoking the grant or
delegate removes access. Never build an unbounded controller or assume a
delegated action succeeded; inspect `vtResult`.

## 5. Basic scripts: listen, inspect, and map

Start with one event, one output, and a visible response control. Import the
[arousal example](../working-instructions/arousal-vibe.html) if you want a ready-made
starter. The essential native trigger shape is:

```json
{
  "type": "componentState",
  "channel": "webhook-a",
  "action": "toyEvent",
  "actions": [
    {
      "type": "updateVariable",
      "variable": "lastEvent",
      "value": "{trigger-action}: {trigger-assetGroupName} level {trigger-level}"
    }
  ]
}
```

Begin with a textarea or response variable to display what arrived. Do not
assume every event has every optional field. Add an exact `requiredExpression`
filter before adding any device output. For example, guard `toyEvent` by
`{trigger-assetGroupName} == "ItemVulva"` and keep a player-controlled maximum
on the mapped channel.

For arousal, the bridge controls event bandwidth and the script controls the
local output mapping:

```text
!xtoys arousal-step 10
```

Use `{trigger-bucket}` for stable stepped output. A simple proportional mapping
with a local cap is
`min({maxVibe}, {trigger-bucket} * {maxVibe} / 100)`. The default 10-point
bucket granularity yields at most 11 updates across the 0–100 range. Output
must remain paused until deliberately enabled, and pause/stop must zero the
device. This local mapping is not the same as inbound `vtSetVibe`.

## 6. Advanced scripts: routing, state, and consent

- **Prevent feedback loops.** Ignore `toyEvent` when
  `{trigger-origin} == "bridge"` unless intentionally reflecting bridge
  changes.
- **Route location events.** Compare `{trigger-location}` to exact
  operator-provided location keys. Route entry and exit separately. Do not
  infer coordinates or assume that a missing location key is a wildcard.
- **Route room and chat notices.** Treat `vtRoomJoin` / `vtRoomLeave` as other
  participants only. `vtSpokenTo` contains a kind, not message content or a
  sender; do not try to recover or announce either.
- **Filter activities.** Check the exact action (`ShockLow`, `ShockMed`,
  `ShockHigh`, or another supported `actionName`) and group. Shock events
  should map only to an agreed, capped vibration cue; never translate them to
  an electrical shock command.
- **Use game outcomes, not hidden data.** Match exact action and enumerated
  outcome values. Events intentionally omit prompt text, answers, member
  identifiers, and exact stakes or rewards.
- **Keep triggers small.** Copy values needed later into ordinary variables.
  Use jobs for timed output, queues when every incoming event must be handled
  serially, and latest-wins/coalescing only when dropping intermediate updates
  is acceptable.
- **Separate consent surfaces.** The Veratown player profile controls bridge
  categories and inbound grants. The XToys script controls local output,
  device selection, and its own pause. Configure both; neither replaces the
  other.

## 7. Expert scripts: inbound controls and robust operation

Use inbound controls only when the feature needs Veratown to change BC state.
The output script should identify the exact `webhookAction` and send only
documented fields. Example:

```json
{
  "type": "updateComponent",
  "channel": "webhook-a",
  "action": "send",
  "webhookAction": "vtSetVibe",
  "webhookData": [
    { "key": "group", "value": "ItemVulva" },
    { "key": "level", "value": "low" },
    { "key": "requestId", "value": "local-request-1" }
  ]
}
```

Before using it, the operator must permit the capability and the player must
grant it; privileged `setVibe`, `emote`, and `delegate` changes require
confirmation. Treat the response as authoritative: correlate `requestId`,
display `vtResult.status` and `reason`, and never describe a sent command as
successful until an `observed` result arrives. `observed` still confirms BC
state, not physical hardware feedback.

For delegated control, the target player must explicitly grant and enable the
delegate. Send `member` only for that selected target. A script must not scan
members, guess identifiers, automate consent, or retry rejected/uncertain
commands. Provide a separate local XToys pause/stop control;
`vtStop` cancels bot-side pending control and does not stop local XToys output.
Keep output paused by default, cap intensity locally, zero outputs on
pause/final action and `bridgeStop`, and avoid storing webhook IDs, verification
codes, member numbers, or sensitive text in script state or logs.

## 8. Testing and source of truth

1. Inspect the event in a visible status control using `!xtoys test` and safe
   room events before connecting an output.
2. Test category opt-outs, operator-denied sources, pause/resume, bridge stop,
   missing fields, and reconnection behavior.
3. Test every inbound path with denied grants and boundary values before
   enabling it. Check the `vtResult` response; do not assume live device action.
4. Keep output limits configured in XToys and the device app. This repository's
   example exports are offline-tested and should be reviewed in the XToys
   editor before use.

For XToys variable scope, expressions, action JSON, jobs, queues, and custom
JavaScript limits, see the [scripting guide](scripting-guide.html), [script JSON
reference](script-json-reference.html), and [JavaScript cookbook](javascript-cookbook.html).
The authoritative bridge implementation and player commands are in the
[Veratown bridge reference](https://github.com/Veratown/veratown-prototype/blob/main/docs/features/xtoys-bridge/README.md)
and [help page](https://github.com/Veratown/veratown-prototype/blob/main/docs/features/xtoys-bridge/HELP.md).
