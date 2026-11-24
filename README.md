# XToys scripting notes

Reference material for writing [XToys](https://xtoys.app) scripts, with a focus
on scripts driven by Bondage Club (BC) events.

| Document                                                                 | Contents                                                                   |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| [Scripting guide](docs/scripting-guide.md)                               | Concepts, workflow, expressions, JavaScript, webhooks, patterns, pitfalls  |
| [Script JSON reference](docs/script-json-reference.md)                   | Field-by-field reference of the exported script JSON                       |
| [JavaScript cookbook](docs/javascript-cookbook.md)                       | Recipes for custom JS: menus, timers, queues, teases, multi-user, inputs   |
| [BC XToys plugin analysis](docs/bc-xtoys-plugin-analysis.md)             | How the ItsNorin userscript works and the webhook event contract it emits  |
| [Veratown integration analysis](docs/veratown-integration-analysis.md)   | Whether and how the Veratown bot could feed XToys                          |
| [Veratown XToys bridge proposal](docs/veratown-xtoys-bridge-proposal.md) | Proposed design: use cases for all four options, controls, two-way control |
| [Example reviews](examples/README.md)                                    | Walkthroughs and bug reviews of supplied and public example scripts        |
| [Starter template](examples/bc-webhook-starter.json)                     | Minimal, importable BC-webhook script to build from                        |
| [Tremblr + DG-LAB template](examples/tremblr-dglab-webhook.json)         | Webhook script for an F-Machine Tremblr and both DG-LAB Coyote channels    |
| [Veratown bridge test](examples/veratown-bridge-test.json)               | Diagnostic script that exercises every Veratown bridge event and message   |
| [Veratown bridge harness](tools/veratown-bridge-harness.mjs)             | Node tool that impersonates the bot to test the script against XToys       |
| [BC room and chat sender](tools/bc-room-chat-sender.user.js)             | Userscript that sends room-entry and spoken-to events to your webhook      |
| [Veratown event router](scripts/veratown-event-router/README.md)          | Importable, configurable multi-output script and setup guide                 |

## Sources

- XToys guide, <https://guide.xtoys.app> (Script Creation, Tease Creation,
  Online Play, Tools, Webhook, and Scripted Pattern pages), read 2026-11-21.
- ItsNorin, _Bondage-Club-XToys-Integration_,
  <https://github.com/ItsNorin/Bondage-Club-XToys-Integration>, commit
  `ababa68f74106d78d3d8801065f64192a4e46607` (2025-06-11, v0.5.9). That repository
  has no license file, so this repository describes it but does not copy its code.
- Amanda-Cook, _xtoys_, <https://github.com/Amanda-Cook/xtoys>, commit `9a886a4`
  (2024-06-27). No license file; described, not copied.
- Five example script and tease exports supplied by the repository owner. The
  three stored in `examples/` (`script1.json`, `tease1.json`, `tease2.json`)
  are kept out of version control because their authorship is unknown.

The official guide is mostly screenshots of the script editor. Statements here
about raw JSON field names come from the example exports and are marked
_observed_ where no official schema confirms them.
