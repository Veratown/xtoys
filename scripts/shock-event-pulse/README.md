# Shock event pulse

Import [`shock-event-pulse.json`](./shock-event-pulse.json) into XToys and
connect a vibration-compatible device to **Vibrator**. The script sends a short
vibration cue when its webhook receives an `activityEvent` whose `actionName`
is `ShockLow`, `ShockMed`, or `ShockHigh`.

This is a vibration notification only: it does not send an electrical shock.
It can respond only to BC shock actions that Veratown receives and forwards;
client-local actions that are not broadcast cannot trigger it.

## Setup

1. Import the JSON into XToys and connect your device to **Vibrator**.
2. Keep the pulse level low; the default is 5%, with a 0.5-second duration.
   Both values can be adjusted in the script controls.
3. Copy the script's private webhook ID and link it to Veratown with
   `!xtoys link <webhook ID>`.
4. The player profile enables `activitySelf` by default. Ask the operator to
   allow the category; if you previously opted out, re-enable it with
   `!xtoys mirror on activitySelf`.
5. To receive shocks initiated by another member, set
   `!xtoys triggers anyone`, or use `!xtoys triggers allowlist` and
   `!xtoys allow <member>`. The default trigger-source policy is `self`, so it
   suppresses other members' actions even when the event category is enabled.
6. Test with a broadcast shock action. Only events directed at the linked
   avatar and forwarded by the bridge can trigger the pulse.

Regenerate or check the export and run its focused test from the repository
root:

```sh
node scripts/shock-event-pulse/build-export.mjs
node --test scripts/shock-event-pulse/test.mjs
```
