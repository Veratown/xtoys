---
layout: default
title: Script catalog and contributor workflow
---

# XToys script catalog

Importable scripts and their builders, source, and tests are kept in the
repository's `scripts/` directory. This page is the documentation catalog;
the runnable sources stay with their script directories.

Every Veratown-connected export must be standalone; XToys scripts are not
chained. Include its own `webhook-a` channel, a visible response control, and
the native lifecycle triggers from
[`shared/veratown-webhook.mjs`](https://github.com/Veratown/xtoys/blob/main/scripts/shared/veratown-webhook.mjs). Use
`installVeratownWebhook()` in the export builder rather than relying only on
JavaScript listeners. This keeps private webhook creation, verification-code
display, and bot responses consistent across scripts.

| Solution | Files | Purpose |
| --- | --- | --- |
| [Veratown webhook setup](veratown-webhook-setup.html) | [XToys export](https://github.com/Veratown/xtoys/blob/main/scripts/veratown-webhook-setup/veratown-webhook-setup.json) | Create a private webhook and display Veratown responses for registration. |
| [Veratown event router](veratown-event-router.html) | [XToys export](https://github.com/Veratown/xtoys/blob/main/scripts/veratown-event-router/veratown-event-router.json), [JavaScript source](https://github.com/Veratown/xtoys/blob/main/scripts/veratown-event-router/router.js) | Route Veratown BC, game, room, and configured map-location events to connected toys. |
| [Veratown event control](veratown-event-control.html) | [XToys export](https://github.com/Veratown/xtoys/blob/main/scripts/veratown-event-control/veratown-event-control.json), [export builder](https://github.com/Veratown/xtoys/blob/main/scripts/veratown-event-control/build-export.mjs) | Native event routing, bounded voice control, and TTS with BC capability notes. |
| [Arousal-scaled vibration patterns](arousal-vibe.html) | [XToys export](https://github.com/Veratown/xtoys/blob/main/scripts/arousal-vibe/arousal-vibe.json), [export builder](https://github.com/Veratown/xtoys/blob/main/scripts/arousal-vibe/build-export.mjs) | Map stepped BC arousal updates to a wearer-capped Lush 4-compatible vibe with tease, random, or escalate patterns; starts paused and zeros output on pause or bridge stop. |
| [Shock event pulse](shock-event-pulse.html) | [XToys export](https://github.com/Veratown/xtoys/blob/main/scripts/shock-event-pulse/shock-event-pulse.json) | Send a short vibration cue for broadcast shock events directed at the linked avatar. |
