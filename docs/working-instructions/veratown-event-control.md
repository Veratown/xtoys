---
layout: default
title: Veratown event control
---

# Veratown event control

Standalone XToys export with native webhook and speech triggers. The generated
script contains no embedded JavaScript. Build and verify it from the XToys
repository root:

```sh
node scripts/veratown-event-control/build-export.mjs
node --test scripts/veratown-event-control/test.mjs
```

## What it supports

- BC body-group routing for observed vibrator levels, item wear/removal, and
  optional activity pulses. Each output has its own exact BC group key.
- BC inflation events mirrored to one selected vibration output, restricted to
  that output's configured group.
- BC arousal updates displayed in the response panel, including observed
  progress, quantized bucket, and step size. This example does not route
  arousal to an output; see the [arousal-to-vibration example](arousal-vibe.html).
- Five exact location-key slots; slot 1 is prefilled with `asylum`. Each slot
  independently selects entry, exit, or both, and an output channel.
- All currently published Veratown game event actions: Casino, Hot Seat,
  Truth or Dare, Dilemma, Staged Table, Shower, and Trick-or-Treat. Casino
  stimulation is limited to losses; Hot Seat stimulation is limited to
  `bluff_exposed`. TTS can announce the other event results too.
- Optional room/chat pulses and speech announcements.
- Voice requests to raise/lower the wearer's BC vibrator in standard steps,
  query observed state, send one of the supported emotes, and invoke a
  configurable safeword.
- A visible Veratown response panel, including the private verification code.
  The code is deliberately not spoken by TTS.

The script starts paused. Game, room, and location targets start off. Output
channels are `generic-1-a` (Tremblr), `part-vibrator-a` through `d`,
`part-rotator-a`, and `part-estim-a` / `b` (DG-LAB). Assign compatible devices
to these XToys channels in XToys; BC itself does not identify physical toy
models. The actual Lovense/DG-LAB device connection must be supported by the
XToys app and your device layout.

## Setup

### 1. Enable the event sources in Veratown

New player profiles enable supported event categories by default; existing
profiles preserve their saved choices. Players can opt out or re-enable
categories, while operator policy remains the upper bound:

```text
!xtoys mirror off activityOther
!xtoys game off locations
!xtoys mirror on arousal
!xtoys arousal-step 10
```

Use `!xtoys test` to check the event link after linking. If an event does not
arrive, check `!xtoys status` and ask the operator to check the bot-side policy.
Player commands cannot override operator policy.

### 2. Import and configure the XToys script

Import [`veratown-event-control.json`](https://github.com/Veratown/xtoys/blob/main/scripts/veratown-event-control/veratown-event-control.json) into
XToys and connect your devices to the available output channels. Configure the
visible controls before unpausing:

1. For each output, enter the exact BC body-group key it should follow, such as
   `ItemVulva`, `ItemNipples`, `ItemButt`, `ItemPelvis`, `ItemArms`, or
   `ItemHands`. Other valid keys in the BC asset list include
   `ItemVulvaPiercings`, `ItemNipplesPiercings`, `ItemBreast`, `ItemTorso`,
   `ItemLegs`, `ItemFeet`, `ItemBoots`, and `ItemNeck`. Keys are case-sensitive.
   The same group can be assigned to multiple outputs; enter `off` to disable a
   route. Use the group name shown by BC/Veratown for your character.
2. Set each output's maximum level. Physical channels default to 20%; the
   script scales observed BC levels (0–4) to that configured maximum.
3. Select an inflation output. Its group setting must match the group that
   contains the inflatable BC item. Inflation observations are also 0–4.
4. Configure up to five location slots with the exact location keys supplied
   by the Veratown operator. `asylum` is only a starter value; other slots are
   blank. Select the entry/exit mode and target output for each key.
5. Game targets default to `off`; choose one channel or `All` if desired.
   Select the events to mute using the per-game toggles. Room/chat pulses and
   item/activity pulses are independently disabled by default.
6. Shock events use a short vibration cue on the matching mapped group only:
   3%, 5%, or 7% before the configurable maximum (5% by default, capped at
   10%). This never sends an electrical shock command.
7. DG-LAB `part-estim` channels are disabled by default (`stimEnabled` off and
   maximum 0%). Only enable standard stimulation if you deliberately want it;
   the script does not use XToys shock mode.
8. Set **Current BC vibrator level** to the wearer's current level if it is
   already nonzero; later observed `toyEvent`s synchronize it. Voice raise and
   lower move one BC standard level at a time. **Maximum BC vibrator level**
   limits local voice requests; the Veratown profile and operator cap remain
   authoritative.

### 3. Create and verify the private webhook

Open the imported script and let XToys create its `webhook-a` channel. Copy its
private webhook ID from the XToys webhook controls. In a private whisper to
Veratown:

```text
!xtoys link <webhook ID>
```

Read the verification code in the script's **Latest Veratown response** panel
and whisper it back within five minutes:

```text
!xtoys verify <code>
```

Do not share the webhook ID or verification code. The script has its own
outbound webhook channel; it does not depend on another XToys script.

### 4. Grant only the controls you need

To use voice-based BC vibrator control, allow the needed capabilities and
groups on your Veratown profile:

```text
!xtoys control queryState stop setVibe emote
!xtoys groups ItemVulva ItemBreast
!xtoys cap medium
```

Replace the example groups with the exact groups configured in `voiceGroup`.
The bot asks for a separate confirmation for privileged capabilities; complete
the prompted `!xtoys confirm <code>` step. Veratown will still enforce consent,
room presence, fresh observed appearance, allowed groups, item type, location,
and the effective player/operator level cap.

If you want Veratown's `vtStop` to turn off allowed BC vibrators as well as
cancel pending control, configure `!xtoys stopchanges vibesOff` and confirm
that privileged change. Without it, `vtStop` only cancels pending control.
The XToys pause toggle always stops this script's local outputs.

### 5. Test, then unpause

Keep **Pause all local outputs** on while testing the link. Run `!xtoys test`
and confirm that the response panel updates. Then select one low-level output
route, trigger a known event, and confirm the mapping before enabling other
routes. Unpause only when the device mapping, maximum levels, and stop behavior
are understood.

Voice phrases (speech recognition must be enabled in XToys):

- `Veratown raise`
- `Veratown lower`
- `Veratown status`
- `Veratown emote shiver`, `squirm`, `gasp`, `blush`, or `moan`
- The configurable safeword, `Veratown stop` by default

The safeword pauses local outputs and requests `vtStop` from Veratown. Whether
the BC vibrator is also turned off depends on the Veratown `stopchanges`
setting, consent, and grants. TTS announcements cover game, location, shock
cue, room, and control events. Voice triggers ignore TTS output.

## BC and bridge capability checks

These are source-level capabilities, not live-service guarantees:

| BC/bridge source | What this script can do | Important limit |
| --- | --- | --- |
| Observed vibrator appearance | Route `toyEvent` levels 0–4 by exact BC item group. | The first appearance observation establishes a baseline; it does not generate a level-change event. |
| Observed inflation appearance | Mirror `inflationEvent` levels 0–4 to the selected output and its configured group. | Unsupported or unresolved inflation options are omitted, not treated as level 0. |
| Worn item actions | Pulse on `itemAdded`; clear that group's mirrored vibrator level on `itemRemoved`. | The bridge needs a received BC action message. Self-applied or client-local changes may not be observable. |
| Shock actions | Map `ShockLow`, `ShockMed`, and `ShockHigh` to the capped vibration cue. | The bridge can only mirror broadcast `TriggerShock0`–`2` actions; BC currently sends these when `ShowText` is enabled. No electrical shock is generated. |
| Map locations | Match `vtLocationEntered` / `vtLocationLeft` against the five exact keys. | The Veratown map feature/operator must publish the location transition. The script does not infer coordinates or define forbidden areas. |
| Room changes | Pulse/announce `vtRoomJoin` and `vtRoomLeave` when another member joins or leaves. | The current bridge contract does not publish this character's own room-entry/exit event. Use configured location transitions for supported area changes. |
| Inbound voice controls | Send `vtSetVibe`, `vtQueryState`, `vtEmote`, and `vtStop`. | Veratown applies its own grants, consent, freshness, target, location, and cap checks. |

BC and the BC server describe asset groups and room messages; they do not
identify Lovense Hush/Gemini/Lush/Ferri or Tremblr hardware. Device/model
compatibility is determined by the XToys channel configuration and has not
been live-tested here.
