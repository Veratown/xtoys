---
layout: default
title: Veratown integration analysis
---

# Veratown integration analysis

Question: can the BC XToys integration run inside the Veratown bot
(`Rarsus/veratown-prototype`) instead of as a userscript in each player's
browser?

**Short answer:** partly. A bot-side bridge is technically feasible for events
the bot can observe in its own room. However, it is less complete than the
userscript, and it moves a sensitive control channel (other people's toys and
e-stim) onto shared infrastructure. Treat it as an opt-in feature that needs a
reviewed proposal, not a quick add-on. No Veratown code was changed for this
analysis.

## How the two approaches differ

|                      | Userscript (today)                                 | Veratown bridge (hypothetical)                                                         |
| -------------------- | -------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Runs where           | Each player's browser tab                          | The bot process, one BC account                                                        |
| Sees                 | The player's own client: local hooks, own messages | Only what BC broadcasts to the bot's room: chat/activity messages and appearance syncs |
| Credential holder    | The player (webhook ID in `localStorage`)          | The bot operator (stored webhook IDs for every opted-in player)                        |
| Rooms                | Any room the player is in                          | Only Veratown rooms the bot is in                                                      |
| Install burden       | Userscript plus remote loader                      | None for players; register by whisper                                                  |
| Failure blast radius | One player                                         | Every opted-in player at once                                                          |

## What the bot can observe

From the current code:

- `BcClient` (`src/adapters/bc/client.ts`) emits
  `message` for each parsed `ChatRoomMessage`. This includes room-broadcast
  `Activity` and `Action` messages (`ActionUse`, `ActionRemove`, `ActionSwap`,
  `TriggerShock*`, …) with their `Dictionary`, which is enough to rebuild
  `activityEvent`, `activityOnOtherEvent`, `itemAdded`, `itemRemoved`,
  `itemSwapped`, and shock events for any room member.
- `appearanceObserved` / `appearanceItemApplied` deliver authoritative
  appearance snapshots (`BcAppearanceObservation`, `BcAppearanceItemApplied` in
  `src/adapters/bc/appearance-protocol.ts`). Vibrator `Property.Intensity` and
  `InflateLevel` changes appear here, which gives `toyEvent` and
  `inflationEvent`.
- `appearance-vibrator.ts` (`src/adapters/bc/appearance-vibrator.ts`)
  already models vibrator modes (standard intensity −1..3 and advanced modes).

What the bot **cannot** see:

- Anything outside rooms the bot is in.
- Whispers between other players, `Hidden` messages addressed elsewhere, and
  purely local client state.
- The plugin's Mod SDK hook points: `ExtendedItemSetOption` before sync,
  `PropertyShockPublishAction` timing, Futuristic belt script triggers, and
  advanced-mode intensity changes that the client never syncs.
- Real-time precision. Appearance syncs arrive with server latency and may
  coalesce several changes.

The [unverified](#open-questions) assumption is that BC broadcasts the relevant
Activity/Action messages to every room member, including the bot.

## Architecture sketch that respects Veratown's invariants

If pursued, it would look roughly like this:

```
src/adapters/xtoys/            new outbound adapter (no BC knowledge)
  webhook-client.ts            one WebSocket per subscriber to wss://webhook.xtoys.app/<id>,
                               bounded reconnect, send queue + rate limit, close/drain on stop
  event-contract.ts            zod schemas for the plugin-compatible event JSON
src/features/xtoys-bridge/
  plugin.ts                    BotPlugin: subscribes to BcClient message/appearance events
  services/event-mapper.ts     BC observation -> XToys event, only for opted-in members
  commands/                    whisper-only: register, pause, resume, forget
  repository.ts + model.ts     subscriptions in veratown_prototype(_test); webhook ID encrypted
```

Constraints that follow from the repository rules:

1. **Separate adapter, separate socket.** `BcClient` stays the only BC
   Socket.IO owner. XToys traffic is a different external service and gets its
   own adapter. Node ≥ 22 has a global `WebSocket` client, so no new
   dependency is needed.
2. **Static wiring and lifecycle.** The plugin is registered in
   `src/app/start.ts`. In `stop()` it fences new events, sends an "all off"
   event to every connection, closes sockets, and drains pending sends before
   Mongo closes.
3. **Safety stop.** The bridge registers with
   `SafetyStopRegistry` (`src/core/safety/safety-stop-registry.ts`)
   so the existing emergency path pauses a participant's bridge immediately.
   This requires the receiving XToys script to handle a dedicated stop event
   (see below).
4. **Not a BC action.** Sending to XToys does not change BC state, so it does
   not go through `ActionCoordinator`. Its outcomes are at best "dispatched"
   because XToys sends no delivery acknowledgement. They must not be reported as
   anything stronger.
5. **Validation.** BC payloads are already parsed at the adapter boundary. The
   mapper must still check group and action names against an allowlist and cap
   string lengths, and must send JSON produced by `JSON.stringify` rather than
   string concatenation.
6. **Secrets.** A webhook ID or token is a credential. Accept it only by
   whisper, never echo it, never log or journal it, store it encrypted, and let
   the user delete it.
7. **Pinned databases.** Subscriptions live only in `veratown_prototype` /
   `veratown_prototype_test`.
8. **Process.** The change touches `src/adapters/`, so it needs a topic branch
   and a PR. Write it up first as a proposal under `docs/proposals/`.

## Compatibility with existing XToys scripts

If the bridge emits the [plugin's event contract](bc-xtoys-plugin-analysis.html#webhook-event-contract)
unchanged, the official script and the
[example 1 script](../examples/example-reviews.html#example-1--bc-multi-toy-router) keep
working without edits. Two additions are recommended. Older scripts ignore them
because they have no trigger for the new actions:

- `{"action":"bridgeStop"}` – sent on safety stop, pause, and bot shutdown.
  Scripts should map it to "all channels 0, stop jobs".
- `{"action":"bridgeHello","version":1}` – sent on connect, so a script can
  show which source is connected.

## Risks

| Risk                     | Why it matters                                                                       | Mitigation                                                                                            |
| ------------------------ | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| Physical harm via e-stim | Room members can trigger shocks on a subscriber; a bot bug affects everyone at once. | Opt-in per event type; shocks off by default; caps live in the XToys script; safety stop              |
| Credential custody       | The bot stores secrets that drive other people's devices.                            | Encrypt at rest, whisper-only registration, delete command, no logging                                |
| Third-party data egress  | Activity and item data about players goes to XToys servers.                          | Send only for consenting subscribers; document it clearly                                             |
| Impersonation and abuse  | Someone registers another person's webhook, or griefs a subscriber with shocks.      | Webhook IDs belong to the registrant; per-source rate limit; optional allowlist of who may trigger    |
| Liveness                 | Lost connection leaves a toy at its last level.                                      | XToys script timeout (for example, ramp down when no event for N seconds); `bridgeStop` on disconnect |
| Coverage gap             | Players expect the userscript's full fidelity.                                       | Document what is not observable                                                                       |
| Unknown XToys limits     | Webhook rate limits and connection limits are undocumented.                          | Conservative per-connection rate limit; backoff                                                       |

## Options

1. **Keep the userscript (recommended default).** Zero bot risk. Veratown could
   document it and publish a reviewed XToys script.
2. **Bot bridge for Veratown rooms only**, as sketched above. Feasible. Medium
   effort, mainly for consent UX, credential storage, safety-stop integration,
   and tests.
3. **Bot-side HTTP POST instead of WebSocket.** Simpler, with no long-lived
   sockets, but it opens one request per event and has unknown rate limits.
   Acceptable for low-volume events only.
4. **Expose sanitized Veratown events** (for example a game state such as
   "staged table phase") and let users point their own XToys scripts at them.
   This is the narrowest and safest bot-side value-add, because it sends
   Veratown's own game events rather than mirroring BC play.

**Recommendation:** start with option 1, or option 4 if Veratown-specific game
events are wanted. Pursue option 2 only through a proposal that settles consent,
credential storage, and the stop contract before any code is written.

That proposal is the
[Veratown XToys bridge proposal](veratown-xtoys-bridge-proposal.html). It covers
use cases for all four options, player and operator controls, and two-way
control (XToys → BC vibrator changes) over the WebSocket transport.

## Open questions

- Does BC deliver every `Activity` and `Action` message targeting another member
  to all room members, including the bot? Verify against the pinned
  Bondage-College server code before relying on it.
- How reliably do appearance syncs reflect vibrator intensity changes made from
  advanced modes?
- What are the XToys webhook rate and connection limits?
