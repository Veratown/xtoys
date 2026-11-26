# Arousal to vibration

Import [`arousal-vibe.json`](./arousal-vibe.json) into XToys and connect a
vibration-compatible device to **Arousal Vibe**. When the Veratown bridge
reports a new arousal bucket, the script scales that bucket proportionally to
the selected local maximum. At the default 20% cap, a bucket of 50 produces
10% output.

The script starts paused. **Pause output** must be turned off manually before
it changes the local XToys device. Turning pause on, receiving `bridgeStop`, or
stopping the script sets the output to zero. This controls only the local
XToys device; it does not send `vtSetVibe` to BC.

## Setup

1. Import the JSON into XToys and connect your own device to **Arousal Vibe**.
2. Keep **Pause output** on while testing. Choose a wearer-owned **Maximum
   vibration** cap and ramp time; XToys device-level limits remain in effect.
3. Copy the script's private webhook ID and link it to Veratown with
   `!xtoys link <webhook ID>`.
4. The player profile enables `arousal` by default. If it was opted out, enable
   it with `!xtoys mirror on arousal`. Set bridge update granularity with
   `!xtoys arousal-step 10` (the default is 10 percentage points).
5. Run `!xtoys test` to verify the link. Then unpause when ready.

Veratown emits an `arousalUpdate` when the initial observed state is available
and whenever the quantized bucket changes. The payload includes raw
`progress`, `bucket`, and `step`; the script uses `bucket` so output changes
follow the configured bridge granularity. For a 10-point step, buckets are
0, 10, 20, …, 90, and 100. Values below 100 are floored to the step; 100 is
the final bucket.

This export is offline-tested only and has not been validated against a live
XToys session or physical device. To regenerate/check it and run focused tests
from the XToys repository root:

```sh
node scripts/arousal-vibe/build-export.mjs
node scripts/arousal-vibe/build-export.mjs --check
node --test scripts/arousal-vibe/test.mjs
```
