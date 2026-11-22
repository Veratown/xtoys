// ==UserScript==
// @name         BC room and chat events for XToys
// @namespace    https://github.com/Rarsus/xtoys
// @version      0.1.0
// @description  Sends room-entry and spoken-to events from your own BC client to your XToys webhook.
// @match        https://bondageprojects.elementfx.com/*
// @match        https://www.bondageprojects.elementfx.com/*
// @match        https://bondage-europe.com/*
// @match        https://www.bondage-europe.com/*
// @match        http://localhost:*/*
// @run-at       document-end
// @grant        none
// ==/UserScript==

/*
 * Events sent as JSON over wss://webhook.xtoys.app/<id>:
 *   {"action":"vtRoomJoin","who":"other","relation":"trusted"|"other"}
 *   {"action":"vtRoomLeave","who":"other","relation":"trusted"|"other"}
 *   {"action":"vtSpokenTo","kind":"chat"|"emote"|"whisper","relation":"trusted"|"other"}
 *
 * Payloads never contain message text, names, or member numbers. Blacklisted
 * members and the player's own messages produce no event. The webhook ID stays
 * in this browser's localStorage and is never printed or logged.
 */
(function () {
  "use strict";

  var STORAGE_KEY = "xtroomSender.v1";
  var COMMAND = "xtroom";
  var WEBHOOK_BASE = "wss://webhook.xtoys.app/";
  var MIN_INTERVAL_MS = 10000;
  var FIRST_BACKOFF_MS = 5000;
  var MAX_BACKOFF_MS = 60000;
  var KINDS = ["join", "leave", "chat", "emote", "whisper"];

  var settings = loadSettings();
  var socket = null;
  var reconnectTimer = null;
  var backoffMs = FIRST_BACKOFF_MS;
  var lastSentAt = {};
  var attachedServerSocket = null;
  var commandRegistered = false;

  function defaultSettings() {
    var sendKinds = {};
    KINDS.forEach(function (kind) {
      sendKinds[kind] = true;
    });
    return { webhookId: "", enabled: false, send: sendKinds };
  }

  function loadSettings() {
    var result = defaultSettings();
    try {
      var stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      if (isValidId(stored.webhookId)) result.webhookId = stored.webhookId;
      result.enabled = stored.enabled === true && result.webhookId !== "";
      if (stored.send && typeof stored.send === "object") {
        KINDS.forEach(function (kind) {
          if (typeof stored.send[kind] === "boolean") {
            result.send[kind] = stored.send[kind];
          }
        });
      }
    } catch (error) {
      console.warn("[xtroom] ignoring unreadable settings");
    }
    return result;
  }

  function saveSettings() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  }

  function isValidId(value) {
    return typeof value === "string" && /^[A-Za-z0-9_-]{4,128}$/.test(value);
  }

  /** Accepts a bare ID or an XToys webhook URL; any other host is rejected. */
  function parseWebhookId(input) {
    var text = String(input || "").trim();
    var match =
      /^(?:wss|https):\/\/webhook\.xtoys\.app\/([A-Za-z0-9_-]+)\/?(?:\?.*)?$/.exec(
        text
      );
    var id = match ? match[1] : text;
    return isValidId(id) ? id : null;
  }

  // ---- Transport ---------------------------------------------------------

  function connect() {
    disconnect();
    if (!settings.enabled || !settings.webhookId) return;
    var ws;
    try {
      ws = new WebSocket(WEBHOOK_BASE + settings.webhookId);
    } catch (error) {
      console.warn("[xtroom] could not open the webhook connection");
      scheduleReconnect();
      return;
    }
    socket = ws;
    ws.onopen = function () {
      backoffMs = FIRST_BACKOFF_MS;
      notify("Connected to your XToys webhook.");
    };
    ws.onclose = function () {
      // A socket closed by disconnect() is no longer current; ignore it.
      if (socket !== ws) return;
      socket = null;
      console.warn("[xtroom] webhook connection closed");
      scheduleReconnect();
    };
  }

  function disconnect() {
    if (reconnectTimer !== null) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    var ws = socket;
    socket = null;
    if (ws) {
      try {
        ws.close();
      } catch (error) {
        // Already closed.
      }
    }
  }

  function scheduleReconnect() {
    if (!settings.enabled || !settings.webhookId || reconnectTimer !== null) {
      return;
    }
    reconnectTimer = setTimeout(function () {
      reconnectTimer = null;
      connect();
    }, backoffMs);
    backoffMs = Math.min(backoffMs * 2, MAX_BACKOFF_MS);
  }

  /**
   * Sends at most one event per action every MIN_INTERVAL_MS. Events that
   * arrive too soon or while disconnected are dropped, never queued.
   */
  function send(payload) {
    if (!settings.enabled || !socket || socket.readyState !== 1) return false;
    var now = Date.now();
    var last = lastSentAt[payload.action];
    if (typeof last === "number" && now - last < MIN_INTERVAL_MS) return false;
    lastSentAt[payload.action] = now;
    socket.send(JSON.stringify(payload));
    return true;
  }

  // ---- BC observation ----------------------------------------------------

  function playerNumber() {
    return typeof Player === "object" &&
      Player !== null &&
      typeof Player.MemberNumber === "number"
      ? Player.MemberNumber
      : null;
  }

  function listHas(list, memberNumber) {
    return Array.isArray(list) && list.indexOf(memberNumber) >= 0;
  }

  function relationOf(memberNumber) {
    var trusted =
      listHas(Player.WhiteList, memberNumber) ||
      (typeof Player.IsOwnedByMemberNumber === "function" &&
        Player.IsOwnedByMemberNumber(memberNumber) === true) ||
      (typeof Player.IsLoverOfMemberNumber === "function" &&
        Player.IsLoverOfMemberNumber(memberNumber) === true);
    return trusted ? "trusted" : "other";
  }

  /** True for a member other than the player who is not blacklisted. */
  function isEligibleOther(memberNumber) {
    var self = playerNumber();
    return (
      self !== null &&
      typeof memberNumber === "number" &&
      memberNumber !== self &&
      !listHas(Player.BlackList, memberNumber)
    );
  }

  function escapeRegExp(text) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function mentionsPlayer(text) {
    if (typeof text !== "string" || text === "") return false;
    var names = [];
    [Player.Name, Player.Nickname].forEach(function (name) {
      if (typeof name !== "string") return;
      var trimmed = name.trim();
      if (trimmed !== "" && names.indexOf(trimmed) < 0) names.push(trimmed);
    });
    return names.some(function (name) {
      var pattern = new RegExp(
        "(^|[^\\p{L}\\p{N}_])" + escapeRegExp(name) + "($|[^\\p{L}\\p{N}_])",
        "iu"
      );
      return pattern.test(text);
    });
  }

  /** Gagged speech arrives garbled; the sender's client may attach the original. */
  function originalText(dictionary) {
    if (!Array.isArray(dictionary)) return "";
    for (var i = 0; i < dictionary.length; i++) {
      var entry = dictionary[i];
      if (
        entry &&
        Array.isArray(entry.Effects) &&
        typeof entry.Original === "string"
      ) {
        return entry.Original;
      }
    }
    return "";
  }

  function senderInRoom(memberNumber) {
    var characters = window.ChatRoomCharacter;
    return (
      Array.isArray(characters) &&
      characters.some(function (character) {
        return character && character.MemberNumber === memberNumber;
      })
    );
  }

  function onMemberJoin(data) {
    if (!settings.send.join || !data || typeof data !== "object") return;
    var other = data.SourceMemberNumber;
    if (!isEligibleOther(other)) return;
    send({ action: "vtRoomJoin", who: "other", relation: relationOf(other) });
  }

  function onMemberLeave(data) {
    if (!settings.send.leave || !data || typeof data !== "object") return;
    var other = data.SourceMemberNumber;
    if (!isEligibleOther(other)) return;
    send({ action: "vtRoomLeave", who: "other", relation: relationOf(other) });
  }

  /** Classifies a received message as speech aimed at the player, or null. */
  function spokenKind(data) {
    switch (data.Type) {
      case "Whisper":
        // The server delivers a whisper only to its target, so any whisper
        // received from someone else is addressed to the player.
        return "whisper";
      case "Chat":
        return mentionsPlayer(data.Content) ||
          mentionsPlayer(originalText(data.Dictionary))
          ? "chat"
          : null;
      case "Emote":
        return mentionsPlayer(data.Content) ? "emote" : null;
      default:
        return null;
    }
  }

  function onChatMessage(data) {
    if (!data || typeof data !== "object") return;
    if (typeof data.Content !== "string" || typeof data.Type !== "string") {
      return;
    }
    var other = data.Sender;
    if (!isEligibleOther(other) || !senderInRoom(other)) return;
    var kind = spokenKind(data);
    if (kind === null || !settings.send[kind]) return;
    send({ action: "vtSpokenTo", kind: kind, relation: relationOf(other) });
  }

  function guarded(handler) {
    return function (data) {
      try {
        handler(data);
      } catch (error) {
        console.warn("[xtroom] event handler failed", error && error.message);
      }
    };
  }

  /** Adds listeners next to BC's own; no BC function is replaced. */
  function attachToServerSocket() {
    var server = window.ServerSocket;
    if (!server || typeof server.on !== "function") return;
    if (server === attachedServerSocket) return;
    attachedServerSocket = server;
    server.on("ChatRoomSyncMemberJoin", guarded(onMemberJoin));
    server.on("ChatRoomSyncMemberLeave", guarded(onMemberLeave));
    server.on("ChatRoomMessage", guarded(onChatMessage));
  }

  // ---- Chat command ------------------------------------------------------

  function notify(text) {
    if (typeof window.ChatRoomSendLocal === "function") {
      try {
        window.ChatRoomSendLocal("[xtroom] " + text, 15000);
        return;
      } catch (error) {
        // Not in a room; fall through to the console.
      }
    }
    console.info("[xtroom] " + text);
  }

  function statusText() {
    var state;
    if (!settings.webhookId) state = "no webhook set";
    else if (!settings.enabled) state = "off";
    else if (socket && socket.readyState === 1) state = "connected";
    else state = "connecting";
    var kinds = KINDS.map(function (kind) {
      return kind + "=" + (settings.send[kind] ? "on" : "off");
    }).join(", ");
    return "Status: " + state + ". Events: " + kinds + ".";
  }

  var HELP =
    "/" +
    COMMAND +
    " connect <webhook ID or URL> | on | off | forget | status | send <" +
    KINDS.join("|") +
    "|all> <on|off>";

  function setKinds(kind, value) {
    if (
      (kind !== "all" && KINDS.indexOf(kind) < 0) ||
      !/^(on|off)$/.test(value)
    ) {
      notify(HELP);
      return;
    }
    (kind === "all" ? KINDS : [kind]).forEach(function (k) {
      settings.send[k] = value === "on";
    });
    saveSettings();
    notify(statusText());
  }

  function runCommand(args) {
    var parts = String(args || "")
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    switch ((parts[0] || "").toLowerCase()) {
      case "connect": {
        var id = parseWebhookId(parts[1]);
        if (id === null) {
          notify("That is not an XToys webhook ID or webhook.xtoys.app URL.");
          return;
        }
        settings.webhookId = id;
        settings.enabled = true;
        saveSettings();
        connect();
        notify("Webhook saved in this browser. Connecting.");
        return;
      }
      case "on":
        if (!settings.webhookId) {
          notify("Set a webhook first: /" + COMMAND + " connect <id>");
          return;
        }
        settings.enabled = true;
        saveSettings();
        connect();
        notify("Sending on.");
        return;
      case "off":
        settings.enabled = false;
        saveSettings();
        disconnect();
        notify("Sending off.");
        return;
      case "forget":
        settings.enabled = false;
        settings.webhookId = "";
        saveSettings();
        disconnect();
        notify("Webhook removed from this browser.");
        return;
      case "send":
        setKinds(
          (parts[1] || "").toLowerCase(),
          (parts[2] || "").toLowerCase()
        );
        return;
      case "status":
        notify(statusText());
        return;
      default:
        notify(HELP);
    }
  }

  function registerCommand() {
    if (commandRegistered || typeof window.CommandCombine !== "function") {
      return;
    }
    window.CommandCombine([
      {
        Tag: COMMAND,
        Description:
          "<connect|on|off|forget|status|send>: XToys room and chat events",
        Action: function (args) {
          runCommand(args);
        },
      },
    ]);
    commandRegistered = true;
  }

  // BC creates ServerSocket and its command list after page scripts load, so
  // poll until both exist, and re-attach if BC ever replaces the socket.
  function tick() {
    attachToServerSocket();
    registerCommand();
  }

  tick();
  setInterval(tick, 1000);
  connect();
})();
