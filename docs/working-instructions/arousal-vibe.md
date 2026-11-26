---
layout: default
title: Arousal-scaled vibration patterns
---

# Arousal-scaled vibration patterns

Import [`arousal-vibe.json`](https://github.com/Veratown/xtoys/blob/main/scripts/arousal-vibe/arousal-vibe.json) into XToys and connect a
Lovense Lush 4 (or another compatible vibe) to **Arousal Vibe**. When the
Veratown bridge reports a new arousal bucket, the script scales that bucket
proportionally to **Maximum power**. Both arousal and the default maximum are
100%, so an arousal bucket of 50 targets 50% output by default. XToys and the
device may apply their own output limits.

Choose one of the patterns:

- **tease** slowly rises to the arousal-scaled target in ten steps, then repeats.
- **random** picks a random level from zero to the target on each step.
- **escalate** rises to the target in five steps, then repeats.

**Pattern step interval** controls the time between levels; **Ramp time**
smooths changes. The script starts paused. Turn **Pause output** off to enable
the connected device. Pausing, receiving `bridgeStop`, or stopping the script
stops its pattern and sets output to zero. Output is local to the connected
XToys device; it does not send `vtSetVibe` to BC.

## Proposed arousal-triggered item removal

The export also has five configurable item-removal stages, defaulting to
arousal thresholds of 20%, 40%, 60%, 80%, and 100%. For each stage, enter the
exact BC `assetGroupName` and `assetName`. Leave either field blank to skip
that stage. Set the thresholds in ascending order if you want removals to
happen in sequence.

**Request item removal** is off by default. When enabled, each configured
stage sends one `vtRemoveItem` request on an upward threshold crossing, at most
once per script run and in stage order (blank item fields skip a stage). The
first arousal update only establishes the baseline, so starting above a
threshold does not immediately send removals. The script does not retry or
report a removal as successful. `bridgeStop` also disables item-removal
requests; **Pause output** only pauses the local vibe and does not change the
separate item-removal toggle.

This is preparation for a proposed Veratown bridge feature only. The current
Veratown prototype does not support `vtRemoveItem`; requests may be rejected or
ignored. Do not enable this expecting items to be removed until the bridge has
implemented the capability and explicitly granted it. See the [bridge
proposal](../architecture/veratown-xtoys-bridge-proposal.html#98-proposed-arousal-triggered-item-removal).

## Setup

1. Import the JSON into XToys and connect your own device to **Arousal Vibe**.
2. Keep **Pause output** on while testing. Set a wearer-owned **Maximum power**
   cap, pattern, step interval, and ramp time.
3. Keep **Request item removal** off unless a future Veratown bridge version
   supports and you have explicitly granted the proposed capability. Configure
   thresholds and exact item group/name values only for items you intend to
   remove.
4. Copy the script's private webhook ID and link it to Veratown with
   `!xtoys link <webhook ID>`.
5. The player profile enables `arousal` by default. If it was opted out, enable
   it with `!xtoys mirror on arousal`. Set bridge update granularity with
   `!xtoys arousal-step 10` (the default is 10 percentage points).
6. Run `!xtoys test` to verify the link. Then unpause when ready.

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
