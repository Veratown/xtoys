---
layout: default
title: Veratown XToys bridge proposal
---

# Veratown ↔ XToys bridge proposal

**Status:** Proposed. Nothing in this document is implemented. Commands,
collections, configuration variables, and event names are proposals, not
existing Veratown behavior. The design is written against
`Rarsus/veratown-prototype` as inspected on 2026-11-21 and follows its proposal
format, so it can be moved into `docs/proposals/` there on a topic branch.

Background: [Veratown integration analysis](veratown-integration-analysis.html),
[BC XToys plugin analysis](bc-xtoys-plugin-analysis.html), and
[scripting guide §10 (webhooks)](../guides/scripting-guide.html#10-webhooks-driving-a-script-from-outside).

## Contents

1. [Goals and non-goals](#1-goals-and-non-goals)
2. [The four options](#2-the-four-options)
3. [Use cases by option](#3-use-cases-by-option)
4. [Combined architecture](#4-combined-architecture)
5. [Player control model](#5-player-control-model)
6. [Operator control model](#6-operator-control-model)
7. [Linking and verifying a webhook](#7-linking-and-verifying-a-webhook)
8. [Outbound event contract](#8-outbound-event-contract)
9. [Two-way control](#9-two-way-control)
10. [Credential storage and privacy](#10-credential-storage-and-privacy)
11. [Safety, stopping, and liveness](#11-safety-stopping-and-liveness)
12. [Rate limiting and BC queue budget](#12-rate-limiting-and-bc-queue-budget)
13. [Fit with Veratown's architecture](#13-fit-with-veratowns-architecture)
14. [Testing and qualification](#14-testing-and-qualification)
15. [Delivery phases](#15-delivery-phases)
16. [Rejected or out-of-scope ideas](#16-rejected-or-out-of-scope-ideas)
17. [Open questions and decisions](#17-open-questions-and-decisions)

## 1. Goals and non-goals

**Goals**

- Players can connect XToys to Veratown play **without installing a BC mod**.
- Several players in a room can be served by the bot at the same time.
- **Flexibility:** players choose which events reach their XToys script, who may
  trigger them, which transport is used, and whether XToys may send
  instructions back.
- **Control:** every capability is opt-in, scoped to the player, capped,
  pausable, covered by `/bot safeword`, revocable, and reversible by deleting
  the link. Operators have global and per-feature switches.
- Existing XToys scripts written for the BC userscript keep working unchanged.

**Non-goals**

- Replacing the BC XToys userscript. It stays the full-fidelity option
  (option 1).
- Real-time, sub-second vibration mirroring. BC appearance changes are
  rate-limited and broadcast to the room, so XToys → BC control is
  "set a level", not a continuous waveform.
- Rooms the bot is not in, or cross-room presence.
- Changing anything a player has not explicitly granted.

## 2. The four options

| #   | Option                    | Direction            | Transport                         | Runs where                | Install burden for players         |
| --- | ------------------------- | -------------------- | --------------------------------- | ------------------------- | ---------------------------------- |
| 1   | BC XToys userscript       | BC → XToys           | Userscript → webhook              | Player's browser          | Userscript plus XToys script       |
| 2   | Bot bridge over WebSocket | BC ↔ XToys (two-way) | `wss://webhook.xtoys.app/<id>`    | Veratown bot (supervisor) | XToys script only; link by whisper |
| 3   | Bot bridge over HTTP POST | BC → XToys (one-way) | `POST https://webhook.xtoys.app/` | Veratown bot (supervisor) | XToys script only; link by whisper |
| 4   | Veratown game events      | Veratown → XToys     | Option 2 or 3 transport           | Veratown bot (supervisor) | XToys script only; link by whisper |

Options 2 and 3 are two **transports** for the same bridge. Option 4 is a
different **event source** that uses either transport. Option 1 is independent
and can run **alongside** option 4 (see [hybrid use](#36-hybrid-use-of-options)).

## 3. Use cases by option

Viability uses these labels:

- **Viable:** works with known BC and XToys behavior.
- **Viable after spike:** depends on an [open question](#17-open-questions-and-decisions)
  that a verification spike must answer first.
- **Not viable:** listed so nobody plans for it; see
  [section 16](#16-rejected-or-out-of-scope-ideas).

### 3.1 Option 1: BC XToys userscript

Veratown's role is documentation and curation only; no bot code.

| Use case                                                         | Viability | Notes                                                                                            |
| ---------------------------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------ |
| Full-fidelity solo play in any room, including outside Veratown  | Viable    | Sees local hooks the bot never sees: advanced vibrator modes, shock timing, futuristic triggers. |
| Players who do not want the bot to hold their webhook ID         | Viable    | Credential stays in the player's browser.                                                        |
| Veratown-published reviewed XToys script library                 | Viable    | For example a "Veratown router" script with caps and a `bridgeStop` handler.                     |
| Low-latency response to own vibrator changes                     | Viable    | Fires in the browser before the server sync.                                                     |
| Combine with Veratown game events (option 4) on the same webhook | Viable    | See [hybrid use](#36-hybrid-use-of-options).                                                     |

### 3.2 Option 2: Bot bridge over WebSocket (two-way)

One persistent WebSocket per linked player. It is the only option that can
carry XToys → bot messages.

| Use case                                                                           | Viability          | Notes                                                                                       |
| ---------------------------------------------------------------------------------- | ------------------ | ------------------------------------------------------------------------------------------- |
| Mirror own vibrator level to XToys (`toyEvent`) without a mod                      | Viable             | From observed appearance syncs; standard modes map to 0–3. Advanced modes only if synced.   |
| Mirror activities done **to** the player (`activityEvent`)                         | Viable after spike | Depends on BC broadcasting Activity messages to the bot.                                    |
| Mirror activities done **by** the player to others (`activityOnOtherEvent`)        | Viable after spike | Same dependency.                                                                            |
| Item added, removed, swapped, locked on the player (`itemAdded`, `itemRemoved`, …) | Viable             | From Action messages and appearance diffs.                                                  |
| Shock and inflation events                                                         | Viable after spike | Off by default; shock mirroring needs a separate explicit grant.                            |
| Someone enters or leaves the player's room (`vtRoomJoin`, `vtRoomLeave`)           | Viable             | From `ChatRoomSyncMemberJoin`/`Leave`; only `who` and `relation`, never names or numbers.   |
| Someone speaks to the player in room chat or an emote (`vtSpokenTo`)               | Viable after spike | Public messages only, matched to the player's name; whispers to the player are invisible.   |
| Mobile or locked-down browsers where userscripts are impractical                   | Viable             | Main reason for the bridge: only XToys is needed on the phone.                              |
| Several players in one room, each with their own toys                              | Viable             | One connection per player; fan-out from the same observations.                              |
| XToys tease or remote controller sets the player's own BC vibrator level           | Viable             | [Two-way control](#9-two-way-control), `vtSetVibe`, capped and coalesced.                   |
| XToys stops everything (button or tease end) and the bot sets own vibrators to Off | Viable             | `vtStop`, if the player granted "stop may change BC".                                       |
| XToys script asks for current state after reconnecting (`vtQueryState`)            | Viable             | The bot replies with the latest observed snapshot; no BC packet sent.                       |
| XToys sends a templated emote ("{name} squirms") into the room                     | Viable             | Fixed templates only, never free text; separate grant; room-rate-limited.                   |
| Delegated control: player A's XToys sets player B's vibrator                       | Viable after spike | B must grant A by whisper; BC item permissions must allow the bot; later phase.             |
| Script receives honest outcome reports for its requests (`vtResult`)               | Viable             | Statuses mirror Veratown's action outcomes.                                                 |
| Link verification by echo (script answers `bridgeVerify` automatically)            | Viable after spike | Needs the script's outbound send action; see [linking](#7-linking-and-verifying-a-webhook). |

### 3.3 Option 3: Bot bridge over HTTP POST (one-way)

Stateless: one request per event, no persistent connection.

| Use case                                                                  | Viability         | Notes                                                                    |
| ------------------------------------------------------------------------- | ----------------- | ------------------------------------------------------------------------ |
| Low-volume event mirroring (items, occasional activities)                 | Viable            | Simpler failure handling; no reconnect loop.                             |
| Shared webhooks with an auth token                                        | Viable            | `Authorization: Bearer <token>`; token stored encrypted like the ID.     |
| Players who do not want a standing connection to their session            | Viable            | Each event is a single request.                                          |
| Fallback when a player's WebSocket is repeatedly failing                  | Viable            | Outbound only; inbound control is suspended while on fallback.           |
| Veratown game events (option 4) for players who never use two-way control | Viable            | The natural default transport for option 4.                              |
| Continuous vibrator mirroring with frequent changes                       | Viable (poor fit) | One HTTP request per change; unknown XToys rate limits. Prefer option 2. |
| Any XToys → bot instruction                                               | Not viable        | HTTP webhooks are inbound to XToys only.                                 |

### 3.4 Option 4: Veratown game events

The bot sends its **own** domain events, not mirrored BC play. This is the
narrowest data egress: no other player's activity text or appearance leaves
Veratown, only events about the linked player's own game participation.

Each row requires the owning feature to publish an event on a new `core/`
contract (see [section 13](#13-fit-with-veratowns-architecture)); the bridge
does not reach into features.

| Source feature       | Example event (`action`)                                  | Example XToys reaction                                 | Viability |
| -------------------- | --------------------------------------------------------- | ------------------------------------------------------ | --------- |
| `casino`             | `vtCasinoResult` with `outcome: win\|lose`, `stakeBand`   | Lose → short pulse; win → reward pattern               | Viable    |
| `hot-seat`           | `vtHotSeatSelected`, `vtHotSeatReleased`                  | Ramp while in the hot seat                             | Viable    |
| `truth-dare`         | `vtDareAssigned`, `vtDareCompleted`, `vtDareRefused`      | Penalty pulse on refusal                               | Viable    |
| `dilemma`            | `vtDilemmaChoice` with a choice key                       | Pattern per choice                                     | Viable    |
| `staged-table`       | `vtStagedTablePhase` with a phase key                     | Intensity follows scene phase; `safety_stopped` → stop | Viable    |
| `map` / locations    | `vtLocationEntered`, `vtLocationLeft` with location key   | Location-themed patterns (shower, kennel, ward)        | Viable    |
| `shower`             | `vtShowerStarted`, `vtShowerEnded`                        | Themed pattern                                         | Viable    |
| `economy` / `shop`   | `vtPurchase` with an item category, `vtBalanceBand`       | Reward on purchase; tease on low balance               | Viable    |
| `trick-or-treat`     | `vtTrickOrTreat` with `outcome: trick\|treat`             | Trick → surprise pulse                                 | Viable    |
| `tutorial`           | `vtTutorialStep`                                          | Teach the link: a small test pulse on "XToys" step     | Viable    |
| `emergency-release`  | Always followed by `bridgeStop`                           | Stop all                                               | Viable    |
| Safety stop          | `bridgeStop` with `reason: "safeword"`                    | Stop all                                               | Viable    |
| Room scene broadcast | `vtScene` with a scene key, sent to every opted-in member | Synchronised group teases run by a room host           | Viable    |

Event payloads carry **keys and bands**, never free text, names, balances, or
other members' identities (see [section 8](#8-outbound-event-contract)).

### 3.5 Two-way control (summary)

Two-way control uses option 2's WebSocket. It is detailed in
[section 9](#9-two-way-control). In brief:

| Capability            | Default | Scope                                             |
| --------------------- | ------- | ------------------------------------------------- |
| `vtQueryState`        | On      | Read-only reply from observed state               |
| `vtStop`              | On      | Bridge-side stop; changing BC needs `stopChanges` |
| `vtSetVibe` (self)    | Off     | Own worn vibrators, granted groups, level cap     |
| `vtEmote` (templates) | Off     | Fixed templates, room-rate-limited                |
| Delegated `vtSetVibe` | Off     | Another member's vibrator, only with their grant  |

### 3.6 Hybrid use of options

Several options can share **one** XToys webhook, because any number of senders
can post to the same webhook ID:

| Combination                   | Result                                                                      | Required setting                                                                    |
| ----------------------------- | --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Option 1 + option 4           | Full BC fidelity from the userscript plus Veratown game events from the bot | Player sets bridge mirroring to off (`mirror bc off`) to avoid duplicate BC events. |
| Option 2 (control only) + 1   | Userscript reports BC events; bot only applies XToys → BC instructions      | Mirroring off; control grants on.                                                   |
| Option 3 + option 4           | One-way game events and low-volume mirroring, no standing connection        | Transport `post`.                                                                   |
| Option 2 mirroring + option 4 | Everything from the bot, no mod                                             | Transport `ws`.                                                                     |

The bot cannot detect whether a player also runs the userscript, so duplicate
suppression is the player's explicit choice.

## 4. Combined architecture

```
                  BC server
                     │ Socket.IO (only BcClient)
                     ▼
┌──────────── Veratown supervisor runtime ─────────────────────────────┐
│ BcClient ──message / appearance──► SharedAppearanceObservationBus     │
│    ▲                                     │                            │
│    │ journaled appearance action         ▼                            │
│ CharacterAppearanceApi ◄── xtoys-bridge feature ◄── GameEventBus      │
│                              │   ▲          (core, published by       │
│                              │   │           casino, hot-seat, …)     │
│                              ▼   │                                    │
│                       adapters/xtoys (no BC knowledge)                │
│                      ws connections │ http poster                     │
└─────────────────────────────────────┼──────────────────────────────────┘
                                      ▼
                         webhook.xtoys.app/<id> ──► player's XToys script
```

Proposed modules:

```
src/core/game-events.ts                 GameEventBus contract (keys and bands only)
src/adapters/xtoys/
  webhook-connection.ts                 one WebSocket per link: connect, backoff, send queue, close/drain
  webhook-poster.ts                     HTTP POST transport with timeout and per-link budget
  wire-schemas.ts                       zod schemas for outbound and inbound JSON
src/features/xtoys-bridge/
  plugin.ts                             BotPlugin lifecycle, safety-stop registration
  model.ts / repository.ts              link documents, profiles, consent records
  services/link-service.ts              link, verify, unlink, consent expiry
  services/bc-event-mapper.ts           observations → plugin-compatible events (options 2/3)
  services/game-event-mapper.ts         GameEventBus → vt* events (option 4)
  services/control-service.ts           inbound vt* → policy → CharacterAppearanceApi
  services/credential-cipher.ts         AES-256-GCM encryption of webhook secrets
  commands/xtoys-command-suite.ts       whisper-only commands
```

The bridge runs only in the **supervisor** runtime, like `/bot emergency-release`,
so helper bots never open XToys connections or hold credentials.

## 5. Player control model

### 5.1 Profile

Each linked player has one profile. All fields have conservative defaults.

| Setting          | Values                                                                                            | Default              | Purpose                                                       |
| ---------------- | ------------------------------------------------------------------------------------------------- | -------------------- | ------------------------------------------------------------- |
| `transport`      | `ws`, `post`                                                                                      | `post`               | `ws` is required for any two-way capability.                  |
| `mirrorBc`       | categories: `toy`, `activitySelf`, `activityOther`, `items`, `inflation`, `shock`, `room`, `chat` | none                 | Which BC mirror events (options 2/3) are sent.                |
| `gameEvents`     | per feature: `casino`, `hotSeat`, `truthDare`, …                                                  | none                 | Which option 4 events are sent.                               |
| `triggerSources` | `anyone`, `allowlist`, `self`                                                                     | `self`               | Whose actions on the player may produce mirrored events.      |
| `allowlist`      | member numbers                                                                                    | empty                | Used when `triggerSources` is `allowlist`.                    |
| `denylist`       | member numbers                                                                                    | empty                | Always wins over the allowlist.                               |
| `control`        | capabilities from [section 9](#9-two-way-control)                                                 | `queryState`, `stop` | What XToys may ask the bot to do.                             |
| `controlGroups`  | BC item groups, for example `ItemVulva`, `ItemBreast`                                             | empty                | Which worn vibrators `vtSetVibe` may change.                  |
| `levelCap`       | `low`, `medium`, `high`, `maximum`                                                                | `medium`             | Highest BC vibrator level that inbound control may set.       |
| `minIntervalSec` | 2–60                                                                                              | 5                    | Minimum time between inbound BC changes for this player.      |
| `stopChanges`    | `none`, `vibesOff`                                                                                | `none`               | Whether `vtStop`/safeword also sets granted vibrators to Off. |
| `rooms`          | `veratown` (all bot rooms) or a list of location keys                                             | `veratown`           | Where mirroring and control are active.                       |
| `consentExpiry`  | `session`, `24h`, `7d`, `30d`                                                                     | `24h`                | When grants lapse and must be re-confirmed by whisper.        |

`session` lapses when the player leaves the room or the bot reconnects.

### 5.2 Proposed commands

Whisper-only, sender-scoped, never accepting another member as the target
except in allow/deny lists and delegation grants. Names are proposals.

| Command                                      | Effect                                                                   |
| -------------------------------------------- | ------------------------------------------------------------------------ |
| `!xtoys link <webhookId> [authToken]`        | Starts linking; the bot never echoes the values.                         |
| `!xtoys verify <code>`                       | Completes linking with the code shown in XToys.                          |
| `!xtoys status`                              | Shows profile, connection state, and grants; never shows secrets.        |
| `!xtoys transport ws\|post`                  | Selects the transport.                                                   |
| `!xtoys mirror <category\|all\|off> on\|off` | Toggles BC mirror categories.                                            |
| `!xtoys game <feature\|all\|off> on\|off`    | Toggles game event sources.                                              |
| `!xtoys triggers self\|allowlist\|anyone`    | Sets who may produce mirrored events.                                    |
| `!xtoys allow\|deny <memberNumber>`          | Edits the allow or deny list. `unallow` and `undeny` remove entries.     |
| `!xtoys control <capability> on\|off`        | Grants or revokes an inbound capability; `on` asks for confirmation.     |
| `!xtoys groups <group,…>`                    | Sets which worn item groups inbound control may change.                  |
| `!xtoys cap low\|medium\|high\|maximum`      | Sets the level cap.                                                      |
| `!xtoys interval <seconds>`                  | Sets the minimum interval between inbound changes.                       |
| `!xtoys delegate <memberNumber> on\|off`     | Allows or revokes another member's XToys controlling your vibrators.     |
| `!xtoys test`                                | Sends `bridgeHello` and a short `vtTest` event.                          |
| `!xtoys pause` / `!xtoys resume`             | Stops all traffic both ways without losing settings.                     |
| `!xtoys unlink`                              | Sends `bridgeStop`, closes the connection, deletes the link and secrets. |
| `/bot safeword`                              | Existing shared safety stop; also pauses the bridge (see section 11).    |

Grants that let XToys change BC state (`setVibe`, `emote`, `stopChanges`,
`delegate`) require a confirmation whisper (`!xtoys confirm <nonce>`) that
restates exactly what is being granted.

### 5.3 Presets

To keep flexibility usable, `!xtoys preset <name>` applies a named bundle that
the player can then adjust:

| Preset       | Transport | Mirror                         | Game events | Control                                           |
| ------------ | --------- | ------------------------------ | ----------- | ------------------------------------------------- |
| `game-only`  | `post`    | none                           | all         | none                                              |
| `mirror`     | `ws`      | `toy`, `items`, `activitySelf` | none        | `queryState`, `stop`                              |
| `full`       | `ws`      | all except `shock`             | all         | `queryState`, `stop`                              |
| `controlled` | `ws`      | `toy`                          | all         | adds `setVibe` (needs confirmation), cap `medium` |

## 6. Operator control model

| Control                 | Where                        | Effect                                                                            |
| ----------------------- | ---------------------------- | --------------------------------------------------------------------------------- |
| `XTOYS_BRIDGE_ENABLED`  | Runtime config (`config.ts`) | Master switch; when false the plugin is not started.                              |
| `XTOYS_CREDENTIAL_KEY`  | Runtime config, secret       | 32-byte key for AES-256-GCM; key rotation via a key version field.                |
| Feature policy document | `prototypeXtoysPolicy`       | Allowed mirror categories, game features, capabilities, global level cap, limits. |
| Per-location enablement | Policy document              | For example disable control in the tutorial area.                                 |
| Limits                  | Policy document              | Max links, max open WebSockets, BC packet budget share, inbound rate ceilings.    |
| Revoke a link           | Admin Web (later phase)      | Marks a link revoked; the running bot adopts it on its next policy refresh.       |
| Metrics                 | Structured logs              | Counts by status and category only; never webhook IDs, tokens, or event payloads. |

Players can only narrow what the operator policy allows. If the operator
removes a capability, existing grants for it stop working immediately on
adoption and `status` shows them as disabled by policy.

Admin Web never connects to BC or XToys. It writes policy and revocations to
the pinned database; the bot adopts them on refresh and Admin Web must not
claim adoption.

## 7. Linking and verifying a webhook

The bot cannot see who owns a webhook ID, so linking proves that the person
whispering can **see** the XToys session behind it.

1. The player creates a **private** webhook in XToys (or a shared webhook with
   token) and loads a script that handles `bridgeVerify` by displaying the
   code, for example with a `setText` action.
2. They whisper `!xtoys link <id>`. The bot does not echo it, stores it
   encrypted in a `pending` link bound to the sender's member number, and sends
   `{"action":"bridgeVerify","code":"<6 digits>"}` to the webhook.
3. The player whispers `!xtoys verify <code>` within 5 minutes. Three wrong
   codes or expiry deletes the pending link.
4. On success the link becomes `active` with a consent record and
   [presets](#53-presets) or defaults.

Additional rules:

- A webhook ID fingerprint (HMAC of the ID) is unique across links, so the
  same webhook cannot be bound to two members.
- One active link per member.
- With an outbound-enabled script, step 3 can be automated by the script
  echoing the code back over the WebSocket. This proves a script is listening,
  but **not** who is at the keyboard, so the whispered code remains the
  default proof.
- If the ID was whispered in public chat by mistake, the bot refuses it and
  tells the player to regenerate the webhook.

## 8. Outbound event contract

### 8.1 BC mirror events (options 2 and 3)

Byte-compatible with the
[userscript contract](bc-xtoys-plugin-analysis.html#webhook-event-contract):
`toyEvent`, `activityEvent`, `activityOnOtherEvent`, `itemAdded`,
`itemRemoved`, and the remaining plugin events. Existing scripts keep working.

Bridge-specific additions, ignored by scripts without matching triggers:

| `action`       | Fields                                                                                  | When                                          |
| -------------- | --------------------------------------------------------------------------------------- | --------------------------------------------- |
| `bridgeHello`  | `version`, `capabilities`                                                               | On connect and on `!xtoys test`.              |
| `bridgeVerify` | `code`                                                                                  | During linking only.                          |
| `bridgeStop`   | `reason`: `pause`, `safeword`, `unlink`, `shutdown`, `policy`, `disconnect`             | Whenever traffic is about to stop.            |
| `bridgeState`  | `groups` with current levels                                                            | Reply to `vtQueryState`, and after reconnect. |
| `vtRoomJoin`   | `who`: `self`, `other`; `relation`: `trusted`, `other`                                  | Mirror category `room`: a member enters.      |
| `vtRoomLeave`  | `who`: `self`, `other`; `relation`: `trusted`, `other`                                  | Mirror category `room`: a member leaves.      |
| `vtSpokenTo`   | `kind`: `chat`, `emote`, `whisper` (client sender only); `relation`: `trusted`, `other` | Mirror category `chat`: see below.            |

Room and chat events carry no text, names, or member numbers. `relation` is
`trusted` when the other member is on the player's allowlist, and `other`
otherwise; denylisted members produce no event. `vtSpokenTo` fires for a
public `Chat` message that contains the player's name or nickname as a whole
word, or an `Emote` or `Activity` message whose target is the player, sent by
someone other than the player. The bot cannot see whispers between other
members, so a whisper to the player never produces an event. The bot sends at
most one `room` event and one `chat` event per player every 10 seconds, and
drops the rest rather than queueing them. XToys scripts should apply their own
cooldown as well.

A client-side sender for the same events already exists for players without
the bridge: [`bc-room-chat-sender.user.js`](https://github.com/Veratown/xtoys/blob/main/tools/bc-room-chat-sender.user.js)
([setup](../examples/example-reviews.html#room-and-chat-sender)). Because it runs in the
player's own client, it also sees whispers to the player and sends them as
`kind: "whisper"`. It does not send activities, which the BC XToys userscript
already reports. The bridge should keep the same field names so one XToys
script works with either sender.

Mirror events gain two optional fields: `origin` (`bc` or `bridge`, see
[feedback loops](#94-feedback-loop-suppression)) and `seq` (per-link counter).

### 8.2 Game events (option 4)

Every game event has `action` (prefixed `vt`), `seq`, and only enumerated keys
or numeric bands, for example:

```json
{ "action": "vtCasinoResult", "seq": 41, "outcome": "lose", "stakeBand": 2 }
```

Rules: no free text, no names, no exact balances, no other members' identities,
all strings from allowlists, all JSON produced by `JSON.stringify` from
validated objects.

### 8.3 Script side

A script consumes events with `componentState` triggers on the webhook channel;
extra keys arrive as `trigger-<key>`. The
[starter script](https://github.com/Veratown/xtoys/blob/main/examples/bc-webhook-starter.json) already handles
`toyEvent` and `bridgeStop`. A Veratown script would add triggers for the
`vt*` actions it wants and a `setText` action for `bridgeVerify`.

## 9. Two-way control

### 9.1 How messages flow back

- Only the WebSocket transport carries messages from XToys to the bot.
- The script's Webhook block must have **Script can send outbound messages**
  ticked; the script then sends JSON through the webhook block's send action.
  The exact export shape of that action still needs capturing from a real
  export.
- The bot receives the message on the link's own connection, so the **target
  is always the linked member** (or, with delegation, a member who granted the
  linked member). A message can never name an arbitrary target.

### 9.2 Inbound contract

All inbound frames are parsed with zod at the adapter boundary; unknown
actions, extra fields, or oversized frames (more than 1 KiB) are dropped and
counted.

| `action`       | Fields                                                                                         | Effect                                                                                        |
| -------------- | ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `vtQueryState` | `requestId?`                                                                                   | Replies `bridgeState` from the latest observed appearance. No BC packet.                      |
| `vtStop`       | `requestId?`                                                                                   | Clears pending inbound requests; with `stopChanges: vibesOff`, sets granted vibrators to Off. |
| `vtSetVibe`    | `group`, `level` (`off`, `low`, `medium`, `high`, `maximum` or 0–100), `requestId?`, `member?` | Configures a worn vibrator, after the policy checks below.                                    |
| `vtEmote`      | `template` (enumerated key), `requestId?`                                                      | Sends a fixed emote template naming the linked member.                                        |

Numeric levels from 0–100 map to BC steps: 0 → Off, 1–25 → Low,
26–50 → Medium, 51–75 → High, 76–100 → Maximum, then the `levelCap` applies.
Advanced modes (Escalate, Edge, …) are **not** accepted in the first version.

### 9.3 Policy checks for `vtSetVibe`

All must pass, in this order, before anything is dispatched:

1. Link is `active`, not paused, consent not expired, operator policy allows
   `setVibe`, and the player granted it.
2. Target is the linked member, or `member` names someone who has an active
   delegation grant to this linked member.
3. Target is in a room and location where the bridge is enabled, and the bot
   has a fresh observed appearance for them.
4. `group` is in the target's `controlGroups`, and the target **currently
   wears** a vibrating-archetype item in that group (from observed state). The
   bridge never adds, removes, swaps, or locks items.
5. Requested level ≤ target's `levelCap` and the operator cap.
6. Observed mode already equals the requested level → `already_satisfied`, no
   dispatch.
7. Interval since the last inbound change for this target ≥ `minIntervalSec`;
   otherwise the request is coalesced (latest wins per member and group).

Then it calls the existing
`CharacterAppearanceApi.execute(member, { operation: "configure", item, configuration: { kind: "vibrating", mode } })`,
which is journaled by the appearance action, respects BC permissions, and
reports an honest outcome.

### 9.4 Feedback loop suppression

A bot-made vibrator change is observed and would be mirrored as `toyEvent`,
which a script may react to again. The bridge records each dispatched inbound
change; the matching observation is mirrored with `origin: "bridge"`.
Scripts can ignore those, and the player can turn them off entirely.

### 9.5 Outcome reports

Every inbound request with a `requestId` gets one `vtResult`:

```json
{ "action": "vtResult", "requestId": "r7", "status": "observed" }
```

`status` is one of `rejected` (with `reason`: `not_granted`, `policy`,
`not_worn`, `cap`, `paused`, `stale_state`, …), `coalesced`, `already_satisfied`,
`dispatched_unconfirmed`, `observed`, or `timed_out_unobserved`. These match
Veratown's acknowledgement semantics: dispatch is never reported as success,
and timeouts are not retried blindly.

### 9.6 Who is really in control

Anyone who can send input to the player's XToys session can now change their
BC vibrator through the bot. That includes XToys remote-control links and
shared teases. The bot cannot tell them apart. The confirmation text for
`setVibe` says so explicitly, and the caps, groups, and intervals are the
player's protection.

### 9.7 Delegated control

Player B whispers `!xtoys delegate <A> on`. Player A's XToys script may then
send `vtSetVibe` with `member: <B>`. All of B's settings apply (groups, cap,
interval, rooms). B can revoke at any time; safeword revokes all delegations
B granted. Delegation is a later phase because it creates a
cross-member control path that needs dedicated review.

## 10. Credential storage and privacy

- Webhook IDs and tokens are encrypted with AES-256-GCM using
  `XTOYS_CREDENTIAL_KEY`; documents store ciphertext, IV, tag, and key version.
  A separate HMAC fingerprint enforces uniqueness without decryption.
- Plaintext exists only in memory for the life of a connection or request.
- Never log, journal, echo, or include in errors: IDs, tokens, frames, event
  payloads, or verification codes.
- Collections (in `veratown_prototype` / `veratown_prototype_test` only):
  `prototypeXtoysLinks` (link, profile, grants, consent records with
  timestamps and versions) and `prototypeXtoysPolicy`.
- `!xtoys unlink` deletes the link document, including ciphertext. Revoked or
  expired pending links are deleted, not archived.
- Data sent to XToys: only events about the linked player or their current
  room, as selected by them, without other members' identities or message text.
  The help text and confirmation state that this data goes to a third-party
  service.

## 11. Safety, stopping, and liveness

| Trigger                       | Outbound                  | Inbound                     | BC change                                             |
| ----------------------------- | ------------------------- | --------------------------- | ----------------------------------------------------- |
| `/bot safeword`               | `bridgeStop`, then paused | Paused, delegations revoked | Only if `stopChanges: vibesOff`, with safety priority |
| `!xtoys pause`                | `bridgeStop`, then paused | Paused                      | None                                                  |
| `vtStop` from XToys           | Continues                 | Pending requests cleared    | Only if `stopChanges: vibesOff`                       |
| Member leaves the room        | `bridgeStop`              | Ignored until return        | None                                                  |
| Consent expiry                | `bridgeStop`              | Paused until re-confirmed   | None                                                  |
| Operator policy removes a cap | `bridgeStop` (`policy`)   | Capability rejected         | None                                                  |
| Bot shutdown                  | `bridgeStop` (`shutdown`) | Fenced                      | None                                                  |
| WebSocket lost                | n/a                       | n/a                         | None; script ramps down on its own timeout            |

The bridge registers with `SafetyStopRegistry` as activity `xtoys-bridge` and
returns `true` when it stopped an active link.

Liveness rule for scripts: Veratown-published scripts must ramp to 0 when no
event or `bridgeHello` keep-alive has arrived for N seconds, because a lost
connection cannot deliver `bridgeStop`.

## 12. Rate limiting and BC queue budget

- **Outbound to XToys:** per-link token bucket (default 5 events/s, burst 10);
  `toyEvent` coalesces to the latest level per group. Unknown XToys limits →
  conservative defaults and exponential backoff on errors.
- **Inbound to BC:** per-target minimum interval, latest-wins coalescing, and a
  bridge-wide budget (for example at most 2 BC packets per 1.2 s window) so the
  bridge can never crowd out other features or safety work in `BcClient`'s
  14-packet queue. Only safeword-driven "vibes off" uses safety priority.
- **Emotes:** one per member per 30 s and a room-wide ceiling.
- **Connections:** operator-capped; reconnect with jittered backoff; a link
  failing persistently is moved to `post` fallback (outbound only) and the
  player is told by whisper.

## 13. Fit with Veratown's architecture

| Invariant             | How the design complies                                                                                                                 |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Single BC socket      | XToys traffic uses its own adapter; no BC packet is sent outside `BcClient`.                                                            |
| Static composition    | The plugin is imported and listed in `src/app/start.ts`, supervisor runtime only.                                                       |
| Dependency direction  | Feature → `core` contracts (`CharacterAppearanceApi`, `SafetyStopRegistry`, new `GameEventBus`) + adapters; no feature imports another. |
| Option 4 event source | New `core/game-events.ts` bus, following existing buses such as `MapLocationEventBus`; source features publish, the bridge subscribes.  |
| One journal owner     | BC changes go through the appearance action only; XToys sends are not BC actions and are not journaled as such.                         |
| Honest outcomes       | XToys sends are at best "dispatched"; BC changes report the appearance action's outcome.                                                |
| Observed state        | Mirroring and policy checks read observed appearance only; nothing is patched optimistically.                                           |
| Database isolation    | New collections only in the pinned databases.                                                                                           |
| Shutdown              | Fence events, send `bridgeStop`, close sockets, drain pending sends and repository work before Mongo closes (`DisposerStack`).          |
| Dependencies          | Node 26 global `WebSocket` and `fetch`; no new package.                                                                                 |
| Process               | Touches `src/core/` and `src/adapters/`, so it needs a topic branch and PR.                                                             |

## 14. Testing and qualification

Offline (`node:test`, registered in `package.json`, no network or Mongo):

- Fake WebSocket and fake HTTP poster adapters.
- Mapper tests: observation diffs → plugin-compatible events; trigger source
  filters; deny beats allow; `origin` tagging.
- Policy tests for every `vtSetVibe` rejection reason, level mapping, caps,
  coalescing, and `already_satisfied`.
- Link tests: verification code expiry, attempts, fingerprint uniqueness, no
  secret in any log call (assert on a captured logger).
- Lifecycle tests: stop fences inbound frames, sends `bridgeStop`, drains.
- Safety tests: safeword pauses, revokes delegations, and applies `vibesOff`
  only when granted.

Live qualification (only with explicit authorization, on a test account and
`veratown_prototype_test`): BC broadcast spike, XToys relay behavior, latency,
and the appearance-change round trip.

## 15. Delivery phases

| Phase | Scope                                                                                                                           | Depends on                   |
| ----- | ------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| 0     | Spikes: BC Activity broadcast, XToys relay semantics, outbound action export, rate limits.                                      | Authorization for live tests |
| 1     | Option 1 docs and a reviewed Veratown XToys script with `bridgeStop` and timeout ramp-down.                                     | None                         |
| 2     | Link/verify/unlink, encryption, profile, consent, safeword, `post` transport, option 4 for two features (casino, staged-table). | Phase 0 for verify display   |
| 3     | `ws` transport, BC mirroring (options 2/3), presets, `vtQueryState`, `vtStop`.                                                  | Phase 0 broadcast result     |
| 4     | Two-way `vtSetVibe` for self, feedback-loop tagging, `vtResult`, `vtEmote`.                                                     | Phase 3                      |
| 5     | Delegated control, room scene broadcasts, Admin Web policy and revocation.                                                      | Phase 4 plus review          |

Each phase is shippable alone and leaves every capability off by default.

## 16. Rejected or out-of-scope ideas

| Idea                                                        | Why not                                                                                |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Real-time waveform from XToys into BC vibrators             | BC changes are rate-limited, room-broadcast, and coarse (five standard levels).        |
| XToys adding, removing, swapping, or locking BC items       | Too much power for an unauthenticated input channel; not needed for vibration control. |
| Free-text chat from XToys through the bot                   | Spam and impersonation relay; only fixed templates are allowed.                        |
| Accepting webhook IDs in public chat or from another member | Credential leakage and impersonation.                                                  |
| Mirroring events for members who have not linked            | Sends their data to a third party without consent.                                     |
| Reporting XToys delivery as confirmed                       | XToys gives no delivery acknowledgement.                                               |
| Running the bridge in helper bots                           | Multiplies credential custody and connections.                                         |
| Advanced vibrator modes via inbound control (first version) | Depends on per-player BC permission settings; revisit after phase 4.                   |

## 17. Open questions and decisions

Spikes (phase 0):

1. Does BC deliver Activity and Action messages that target another member to
   every room member, including the bot?
2. On a shared WebSocket, which clients receive a frame sent by the script, and
   can a second client inject frames the bot would receive?
3. What is the exact JSON shape of the webhook "send outbound" action in a
   script export?
4. What are XToys's webhook rate and connection limits?
5. How reliably do appearance syncs reflect advanced-mode intensity changes?
6. Is whole-word name matching good enough for `vtSpokenTo`, and how should
   nicknames, short names, and false positives be handled?

Decisions for the project owner:

1. Default transport: `post` (safer) or `ws` (more capable)?
2. Default `consentExpiry`: 24 hours, or session only?
3. Is shock mirroring allowed at all, or permanently excluded?
4. Is delegated control in scope?
5. Which game features publish events first?
6. Should Veratown publish and maintain its own XToys script?
