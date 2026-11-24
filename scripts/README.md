# Xtoys Scripts folder

For each solution, create a subfolder containing its importable script `.json`
and optional `.js` source files.

Every Veratown-connected export must be standalone; XToys scripts are not
chained. Include its own `webhook-a` channel, a visible response control, and
the native lifecycle triggers from
[`shared/veratown-webhook.mjs`](./shared/veratown-webhook.mjs). Use
`installVeratownWebhook()` in the export builder rather than relying only on
JavaScript listeners. This keeps private webhook creation, verification-code
display, and bot responses consistent across scripts.

| Solution | Files | Purpose |
| --- | --- | --- |
| [Veratown webhook setup](./veratown-webhook-setup/README.md) | [XToys export](./veratown-webhook-setup/veratown-webhook-setup.json) | Create a private webhook and display Veratown responses for registration. |
| [Veratown event router](./veratown-event-router/README.md) | [XToys export](./veratown-event-router/veratown-event-router.json), [JavaScript source](./veratown-event-router/router.js) | Route Veratown BC, game, room, and configured map-location events to connected toys. |
| [Veratown event control](./veratown-event-control/README.md) | [XToys export](./veratown-event-control/veratown-event-control.json), [export builder](./veratown-event-control/build-export.mjs) | Native event routing, bounded voice control, and TTS with BC capability notes. |
