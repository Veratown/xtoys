# Veratown event router

Import [`veratown-event-router.json`](./veratown-event-router.json) into XToys.
The [script folder README](../README.md) defines the folder convention. The
standalone [JavaScript source](./router.js) is embedded in the export's
`customFunctions` field; after editing it, regenerate the export with
`node scripts/veratown-event-router/build-export.mjs`.

This script is a fixed-route receiver for the Veratown XToys bridge. It has one
universal output, four vibrator outputs, three rotator outputs, and five
DG-LAB e-stim channels. Connect compatible Lovense vibrators (including Hush,
Lush 4, or Gemini channels) to vibrator or universal blocks; use e-stim blocks
for DG-LAB channels. The body-group and event routes are fixed in the script;
there is no large Routing JSON variable to edit. It is not gender-locked.

## What it can receive

| Event | Script behavior |
| --- | --- |
| `toyEvent` | Follows the observed 0–4 wearable vibrator level for the configured body group. |
| `inflationEvent` | Optional; follows the observed inflation level as a toy level. |
| `itemAdded` | Optional, short pulse on outputs mapped to that group when the bot observes the room item event. |
| `itemRemoved` | Clears that group's followed toy level. |
| `activityEvent` | Optional pulse for an activity done to the linked player. |
| `activityOnOtherEvent` | Optional pulse, disabled by default. |
| `ShockLow`, `ShockMed`, `ShockHigh` | Only `activityEvent` shocks; explicit opt-in, sent only to DG-LAB channel A for fixed-route body groups, and capped by the Shock strength control. |
| `vtCasinoResult` | Optional pulse only when `outcome` is `loss`; no wager amount is sent. |
| `vtLocationEntered` / `vtLocationLeft` | Optional pulse for the fixed `asylum` location key. |
| `vtRoomJoin` / `vtRoomLeave` | Optional pulse when another member enters/leaves the room. These events do not signal the linked player's own room entry/exit. |
| `bridgeVerify`, `bridgeTest`, `bridgeStop` | Shows link/test status; `bridgeStop` pauses and zeros all channels. |

Veratown location events contain operator-defined location keys, not map
coordinates or character pose. The bridge does not currently send Bondage Club
pose/position events. The provided layout has no PawPrints sensor input block,
so this script cannot read DG-LAB PawPrints sensor data or compare physical
posture with a Bondage Club pose. It can react to Veratown map-location keys.
Likewise, a local wardrobe change only triggers if BC broadcasts an event the
bot can observe; prefer `toyEvent` for server-observed wearable levels.

## XToys setup

1. Sign in to your XToys account and open **My Scripts**.
2. Create or import a script, then import `veratown-event-router.json`.
3. Check that the **Webhook**, one **Generic output**, four **Vibrator**,
   three **Rotator**, and five **DG-LAB channel** blocks appear. XToys labels
   may differ by version.
4. Start the script once and use the plug icon to connect the toys you want.
   The universal, vibrator, and rotator blocks can be connected to compatible
   toys. Assign e-stim blocks only to the appropriate DG-LAB channels.
5. Leave **Pause** on while configuring. Outputs start at zero; all reactions
   are off except wearable toy-level following, which remains gated by Pause.
6. The routes are fixed:

    | Source | Output |
    | --- | --- |
    | Vulva, vulva piercings, pelvis | Vibrator A |
    | Butt | Vibrator B |
    | Nipples, nipple piercings, breast, torso | Vibrator C |
    | Neck | Vibrator D |
    | Another member joins | Vibrator A |
    | Another member leaves | Vibrators A–D |
    | Casino loss | DG-LAB channel A |
    | Entering or leaving location key `asylum` | DG-LAB channel A, 1 second |
    | An allowed BC shock event for a routed group | DG-LAB channel A |

    Outputs are capped at 30% for vibrator/rotator channels and 15% for
    DG-LAB channels. To change the fixed routes or the `asylum` key, the source
    code must be edited and the export regenerated; these are not user controls.
7. Enable only the event toggles you intend to use. Keep **Allow BC shock
   events** off unless you and the wearer have explicitly agreed to this. Its
   maximum starts at 10%; accepted shock events use only DG-LAB channel A and
   only for body groups in the fixed route table.
8. Test with **Pause** still on, then run `!xtoys test` from the linked
   Veratown account and confirm XToys reports the test event. The test event
   does not activate a toy.
9. When ready, turn **Pause** off. The idle safety timer starts on the first
    routed event and zeros outputs after 120 seconds without another one by
    default. Turning Pause on, stopping the script, or receiving `bridgeStop`
    also stops pulse/shock jobs and sets every output to zero.

The large editable JSON routing field has been removed. This avoids passing a
large nested JSON value through XToys' variable expansion. After importing the
updated export, no routing field needs to be edited.

To check the embedded JavaScript and the offline event-routing cases from the
xtoys repository root, run:

```sh
node scripts/veratown-event-router/build-export.mjs --check
node scripts/veratown-event-router/test.mjs
```

## Veratown setup

An operator must enable the bridge; players cannot enable it themselves.

1. **Operator: prepare the bot.** Set `XTOYS_CREDENTIAL_KEY` to a base64-encoded
   32-byte key in the bot's runtime environment. Keep the key private. If it is
   changed or lost, players must link again.
2. **Operator: enable the room feature.** In Admin Web, open **Feature
   management → XToys bridge** for the main room. Enable it and confirm the
   third-party notice in the room rules. Select allowed mirror categories and
   game sources. For this script, allow `toy`, `items`, `activitySelf`, and
   optionally `activityOther` and `room`; allow the `locations` and `casino`
   game sources for location and casino triggers. The bridge remains disabled
   until both the credential key and valid room policy are present.
3. **Player: create a private XToys webhook.** Copy the webhook ID. Treat it
   like a password; do not post it in public chat.
4. **Player: link privately.** Whisper the bot `!xtoys link <webhook ID>`.
   Linking is accepted only in private. The bot sends a short verification
   code to XToys and holds the pending link for five minutes.
5. **Player: verify.** Read the code in the script's **Veratown / script
   output** control and whisper `!xtoys verify <code>` to the bot within five
   minutes. Then run `!xtoys test`; its receipt appears in that same output
   control.
6. **Player: select event sources.** Use `!xtoys mirror toy items activitySelf`
   and, if desired, `!xtoys mirror room activityOther`. Use
   `!xtoys game locations casino`. These are player choices constrained by the
   operator's allowlist. For shocks caused by another member, the trigger-source
   setting must also allow that member; its default is `self`. To opt in to
   listed members, use `!xtoys triggers allowlist` and `!xtoys allow <member>`.
7. **Player: verify status and safety.** Whisper `!xtoys status`; use
   `!xtoys pause` / `!xtoys resume` for the bot-side link, independently of the
   XToys script's Pause control. The shared bot safeword sends `bridgeStop` and
   stops the script outputs.

The bridge is not a continuous pose feed. It sends map-location transitions
only when Veratown publishes them; this script reacts only to the fixed
`asylum` key.
Room join/leave notifications refer to other room members, not the linked
player. BC shock actions are observable only when the BC client broadcasts
them; client-local shocks may not reach the bot.

For the authoritative player commands, operator fields, event privacy, and
safety behavior, see Veratown's
[XToys Bridge Help](https://github.com/Rarsus/veratown-prototype/blob/main/docs/features/xtoys-bridge/HELP.md)
and [bridge reference](https://github.com/Rarsus/veratown-prototype/blob/main/docs/features/xtoys-bridge/README.md).

## Limitations

- The script has not been tested with a live XToys session or physical toys.
- The export supplied for this work contains no PawPrints input block; PawPrints
  position sensing is not implemented here.
- Veratown's current bridge exposes configured map-location keys, not physical
  posture or exact avatar coordinates.
- Shock events are independent of room activity controls and are disabled by
  default. Keep the device's own output limits enabled as well.
