# BC XToys plugin analysis

Subject: ItsNorin, _Bondage-Club-XToys-Integration_, commit
`ababa68f74106d78d3d8801065f64192a4e46607` (v0.5.9, 2025-06-11). The README says
the project is no longer maintained. The repository has no license, so its code
is described here but not reproduced.

## What it is

The plugin is a browser **userscript** for Tampermonkey or Violentmonkey that
runs inside the Bondage Club page:

1. A tiny loader userscript injects `BC-XToys.user.js` from
   `itsnorin.github.io` at page load. There is **no integrity pin**, so whoever
   controls that site controls code running in your logged-in BC tab.
2. It waits for `bcModSdk` and registers itself as a mod.
3. It opens a plain browser `WebSocket` to `wss://webhook.xtoys.app/<id>` (any
   `ws://`/`wss://` URL is accepted) and **only sends** JSON events. It never
   reads XToys replies.
4. On the XToys side, the official script (`xtoys_script.json` in the repo) or a
   custom one like [example 1](../examples/README.md#example-1--bc-multi-toy-router)
   turns events into toy output.

All observation happens **from the player's own client**, so the plugin sees
what that player's BC client sees: local state, local function calls, and
messages delivered to that player.

## Chat command

`/bcxtoys` supports `connect <url|id>`, `disconnect`, `list`, `pause`, `resume`,
`auto_connect`, `auto_reconnect`, `punish_shock_level`, and `help`. Connected
URLs are stored in `localStorage`. Auto-reconnect makes up to three attempts.

## Event sources

| Source                              | Purpose                                                                             |
| ----------------------------------- | ----------------------------------------------------------------------------------- |
| `ChatRoomMessage` socket listener   | Activities, item add/remove/swap by others, shock-trigger messages, text-only items |
| Mod SDK hook `VibratorModePublish`  | Vibe level changes, including advanced modes                                        |
| `ExtendedItemSetOption`             | Option changes on worn items (vibe levels, inflation)                               |
| `InventoryWear` / `InventoryRemove` | Items the player adds or removes themselves                                         |
| `PropertyShockPublishAction`        | Shock items triggered                                                               |
| Futuristic belt hooks               | Training-belt vibe mode and chastity-belt punishment shocks (`punish_shock_level`)  |
| `ServerSetConnected`                | Auto-connect after login                                                            |

The message filter drops Content values `BCXMsg`, `BCEMsg`, `Preference`,
`Wardrobe`, `SlowLeaveAttempt`, `ServerUpdateRoom`, and `bctMsg`, and drops Types
`Status` and `Hidden`. Dictionary parsing accepts both the current
`{FocusGroupName: …}` style and the older `{Tag: …}` style.

Handlers:

- **Activities** (`Type: "Activity"`): reads `FocusAssetGroup`/`FocusGroupName`,
  `ActivityName`, `ActivityAsset`, `TargetCharacter`, and `SourceCharacter`.
  The event is `activityEvent` when the player is the target and
  `activityOnOtherEvent` when the player is the source.
- **Portal link** (`PortalLinkFunctionActivity*` with `PortalPanties`): mapped
  to activities.
- **Item equip** (`ActionUse`, `ActionRemove`, `ActionSwap` from others): mapped
  to `itemAdded`, `itemRemoved`, and `itemSwapped`.
- **Toy events**: reads the player's `Appearance`, plus `TriggerShock0/1/2`
  contents.
- **Text-only items**: regular expressions over Content for `LactationPump`,
  `NippleSuctionCups`, `PlateClamps`, and `ButtPump`.

## Webhook event contract

Every frame is a JSON object with an `action` key. The JSON is built by string
concatenation without escaping; `null` values are sent as the string `"none"`.

| `action`                | Other keys                                       | Meaning                                                                               |
| ----------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------- |
| `toyEvent`              | `assetGroupName`, `level`, `itemName`            | Worn vibrating item level. `level` = BC `Property.Intensity + 1`, so **0–4**; 0 = off |
| `inflationEvent`        | `assetGroupName`, `level`, `itemName`            | Inflatable item level (`InflateLevel`)                                                |
| `activityEvent`         | `assetGroupName`, `actionName`, `assetName`      | Activity done **to** the player                                                       |
| `activityOnOtherEvent`  | `assetGroupName`, `actionName`, `assetName`      | Activity done **by** the player to someone else                                       |
| `itemAdded`             | `assetGroupName`, `assetName`                    | Item put on the player                                                                |
| `itemRemoved`           | `assetGroupName`, `assetName`                    | Item taken off the player                                                             |
| `itemSwapped`           | `assetGroupName`, `assetName`, `prevAssetName`   | Item replaced                                                                         |
| `activityEvent` (shock) | `actionName` = `ShockLow`/`ShockMed`/`ShockHigh` | Shock item triggered (level 0/1/2). Deduplicated per slot and level within 500 ms.    |

`assetGroupName` uses BC group names such as `ItemVulva`, `ItemButt`,
`ItemNipples`, `ItemNipplesPiercings`, `ItemBreast`, `ItemVulvaPiercings`,
`ItemPelvis`, and `ItemNeck`. For dynamic groups the plugin uses
`DynamicGroupName`.

## Official XToys script

The companion script has one webhook channel and one `generic-1` output. Its
behaviour is configured through JSON in `textarea` controls:

- **Toy events**: `[{Name, Weight, RampTimeMS}]` – which groups drive the toy and
  how much.
- **Vibe intensities**: a 5-element array mapping level 0–4 to output, for
  example `[0, 0.25, 0.5, 0.75, 1.0]`.
- **Actions**: `[{Type: OnSelf|OnOther, Intensity, DurationMS, RampTimeMS, Names[], Actions[], Items[]}]`,
  where `*` is a wildcard.
- **Blend slider**: mixes toy-event and activity output.

Up to five activity boosts run concurrently through `Timer0`–`Timer4` jobs and
add up. For several toys you load several **instances** of the script, each
with its own config and connected toy, all listening to the same webhook.

## Assessment

| Aspect      | Notes                                                                                                                                            |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Coverage    | Very good for the player's own state, because it hooks client functions the server never broadcasts.                                             |
| Robustness  | Hand-built JSON (no escaping), string `"none"` for null, Mod SDK hooks that break when BC renames functions.                                     |
| Security    | Remote code loaded without integrity checks; webhook ID kept in `localStorage`.                                                                  |
| Privacy     | Item and activity names go to XToys servers. Chat text is not sent.                                                                              |
| Maintenance | Unmaintained; may break with BC updates.                                                                                                         |
| Consent     | Anyone in the room can trigger toy activity and shocks on a connected player through normal BC interaction; filtering is up to the XToys script. |
