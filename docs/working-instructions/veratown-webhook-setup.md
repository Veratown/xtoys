---
layout: default
title: Veratown webhook setup
---

# Veratown webhook setup script

Import [`veratown-webhook-setup.json`](https://github.com/Veratown/xtoys/blob/main/scripts/veratown-webhook-setup/veratown-webhook-setup.json) into
XToys. This helper uses XToys' native webhook triggers and variables; it
contains no JavaScript. It has one webhook channel and one visible response
field, and does not connect to or activate toys.

## Create and register the webhook

1. Import the latest Script into XToys.
2. Start the script. Use the webhook channel's plug/menu control to create or
   reveal its private webhook ID, then copy it. XToys creates the ID; this
   script does not generate or store it.
3. Keep the ID private. Whisper the Veratown bot `/bot xtoys link <webhook ID>`.
4. Read the verification code in **Latest Veratown response**.
5. Whisper `/bot xtoys verify <code>` to the bot within five minutes.
6. Whisper `/bot xtoys test`. The latest response field should show the test
   receipt.

The response field shows the latest recognized Veratown event. It displays the
verification code and verify command for `bridgeVerify`, and status/reason
details for lifecycle and control replies. New messages replace the previous
display.

If no message appears, confirm that the Veratown XToys bridge is enabled for
the room and that the link command was sent privately. The operator must enable
the bridge before players can use it.

To check the generated export and its native triggers from the XToys repository
root:

```sh
node scripts/veratown-webhook-setup/build-export.mjs --check
node scripts/veratown-webhook-setup/test.mjs
```
