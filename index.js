import {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  REST,
  Routes,
  SlashCommandBuilder
} from "discord.js";

import {
  RespawnHostClient,
  ServersService
} from "@respawnhost/sdk";

import http from "node:http";

// ======================================================
// BLOCKBANDE NETWORK
// Minecraft Discord Server Status Bot
// ======================================================

// ======================================================
// CONFIG
// ======================================================

const PORT = process.env.PORT || 10000;

const DISCORD_TOKEN =
  process.env.DISCORD_TOKEN;

const CLIENT_ID =
  process.env.CLIENT_ID;

const CHANNEL_ID =
  process.env.CHANNEL_ID;

const RESPAWNHOST_API_KEY =
  process.env.RESPAWNHOST_API_KEY;

// Feste Serverdaten
const SERVER_IP =
  "5.175.214.105:25581";

const NETWORK_NAME =
  "BLOCKBANDE NETWORK";

const SERVER_FALLBACK_NAME =
  "BlockBanDE";

// Update alle 60 Sekunden
const UPDATE_INTERVAL =
  60 * 1000;

// ======================================================
// ENVIRONMENT CHECK
// ======================================================

if (!DISCORD_TOKEN) {
  throw new Error(
    "DISCORD_TOKEN fehlt."
  );
}

if (!CLIENT_ID) {
  throw new Error(
    "CLIENT_ID fehlt."
  );
}

if (!CHANNEL_ID) {
  throw new Error(
    "CHANNEL_ID fehlt."
  );
}

if (!RESPAWNHOST_API_KEY) {
  throw new Error(
    "RESPAWNHOST_API_KEY fehlt."
  );
}

// ======================================================
// RENDER WEB SERVER
// ======================================================

const webServer =
  http.createServer(
    (req, res) => {

      res.writeHead(
        200,
        {
          "Content-Type":
            "text/plain; charset=utf-8"
        }
      );

      res.end(
        "BLOCKBANDE NETWORK Bot läuft."
      );
    }
  );

webServer.listen(
  PORT,
  () => {
    console.log(
      `🌐 Webserver läuft auf Port ${PORT}`
    );
  }
);

// ======================================================
// DISCORD CLIENT
// ======================================================

const discord =
  new Client({
    intents: [
      GatewayIntentBits.Guilds
    ]
  });

// ======================================================
// RESPAWNHOST
// ======================================================

const respawnHost =
  new RespawnHostClient({
    apiKey:
      RESPAWNHOST_API_KEY
  });

const servers =
  new ServersService(
    respawnHost
  );

let serverUuid = null;

// ======================================================
// SERVER SUCHEN
// ======================================================

async function findServer() {

  try {

    const result =
      await servers.list();

    const serverList =
      Array.isArray(result)
        ? result
        : result?.data ??
          result?.servers ??
          [];

    if (
      !serverList.length
    ) {

      console.log(
        "❌ Kein RespawnHost Server gefunden."
      );

      return null;
    }

    const foundServer =
      serverList.find(
        (server) => {

          const name =
            server?.alias ??
            server?.name ??
            "";

          return String(name)
            .toLowerCase()
            .includes(
              "blockbande"
            );
        }
      ) ??
      serverList[0];

    serverUuid =
      foundServer?.panelUuid ??
      foundServer?.uuid ??
      foundServer?.id ??
      null;

    console.log(
      "🎮 RespawnHost Server gefunden"
    );

    console.log(
      "Name:",
      foundServer?.alias ??
      foundServer?.name ??
      SERVER_FALLBACK_NAME
    );

    console.log(
      "UUID:",
      serverUuid
    );

    return foundServer;

  } catch (error) {

    console.error(
      "❌ Fehler beim Suchen des Servers:",
      error
    );

    return null;
  }
}

// ======================================================
// SERVER DETAILS
// ======================================================

async function getServerDetails() {

  if (!serverUuid) {
    return null;
  }

  try {

    const response =
      await fetch(
        `https://respawnhost.com/api/v1/servers/${serverUuid}`,
        {
          headers: {
            "X-Api-Key":
              RESPAWNHOST_API_KEY,

            "Accept":
              "application/json"
          }
        }
      );

    if (!response.ok) {

      throw new Error(
        `HTTP ${response.status}`
      );
    }

    const data =
      await response.json();

    console.log(
      "✅ Serverdetails geladen."
    );

    return data;

  } catch (error) {

    console.error(
      "❌ Fehler beim Laden der Serverdetails:",
      error
    );

    return null;
  }
}

// ======================================================
// RECURSIVE VALUE FINDER
// ======================================================

function findValue(
  object,
  keys
) {

  if (
    object === null ||
    object === undefined ||
    typeof object !==
      "object"
  ) {
    return null;
  }

  const wantedKeys =
    keys.map(
      (key) =>
        String(key).toLowerCase()
    );

  for (
    const [key, value]
    of Object.entries(object)
  ) {

    if (
      wantedKeys.includes(
        String(key).toLowerCase()
      )
    ) {

      return value;
    }
  }

  for (
    const value
    of Object.values(object)
  ) {

    if (
      value &&
      typeof value ===
        "object"
    ) {

      const found =
        findValue(
          value,
          keys
        );

      if (
        found !== null
      ) {

        return found;
      }
    }
  }

  return null;
}

// ======================================================
// SERVER STATE
// ======================================================

function getServerState(
  server,
  details,
  resources
) {

  const combinedData = {
    server,
    details,
    resources
  };

  const state =
    findValue(
      combinedData,
      [
        "state",
        "status",
        "powerState",
        "power_state",
        "serverState",
        "server_state",
        "currentState",
        "current_state",
        "serverStatus",
        "server_status"
      ]
    );

  console.log(
    "🔎 RespawnHost State:",
    state
  );

  if (
    state === null ||
    state === undefined
  ) {

    return "";
  }

  return String(state)
    .toLowerCase()
    .trim();
}

// ======================================================
// ONLINE STATUS
// ======================================================

function isServerOnline(
  server,
  details,
  resources
) {

  const state =
    getServerState(
      server,
      details,
      resources
    );

  const onlineStates = [
    "running",
    "online",
    "started",
    "active",
    "start",
    "on"
  ];

  return onlineStates.includes(
    state
  );
}

// ======================================================
// STATUS ABRUFEN
// ======================================================

async function getStatus() {

  try {

    const server =
      await findServer();

    if (!server) {
      return null;
    }

    const details =
      await getServerDetails();

    let resources =
      null;

    try {

      resources =
        await servers.getResourceUtilization(
          serverUuid
        );

    } catch (error) {

      console.error(
        "⚠️ Ressourcen konnten nicht geladen werden:",
        error
      );
    }

    console.log(
      "========== RESOURCES ==============="
    );

    console.log(
      "State:",
      getServerState(
        server,
        details,
        resources
      )
    );

    console.log(
      "CPU:",
      resources?.resources
        ?.cpu_absolute ??
        "N/A"
    );

    console.log(
      "RAM Bytes:",
      resources?.resources
        ?.memory_bytes ??
        "N/A"
    );

    console.log(
      "===================================="
    );

    return {
      server,
      details,
      resources
    };

  } catch (error) {

    console.error(
      "❌ Fehler beim Abrufen des Status:",
      error
    );

    return null;
  }
}

// ======================================================
// PLAYERS
// ======================================================

function getPlayers(
  server,
  details
) {

  const combinedData = {
    server,
    details
  };

  const value =
    findValue(
      combinedData,
      [
        "players",
        "playerCount",
        "playersOnline",
        "currentPlayers",
        "onlinePlayers",
        "player_count",
        "players_online"
      ]
    );

  if (
    typeof value ===
    "number"
  ) {

    return value;
  }

  if (
    typeof value ===
    "string" &&
    value.trim() !== ""
  ) {

    const number =
      Number(value);

    if (
      !Number.isNaN(
        number
      )
    ) {

      return number;
    }
  }

  if (
    value &&
    typeof value ===
      "object"
  ) {

    const nested =
      findValue(
        value,
        [
          "online",
          "current",
          "count",
          "value"
        ]
      );

    if (
      typeof nested ===
      "number"
    ) {

      return nested;
    }

    if (
      typeof nested ===
      "string"
    ) {

      const number =
        Number(nested);

      if (
        !Number.isNaN(
          number
        )
      ) {

        return number;
      }
    }
  }

  return null;
}

// ======================================================
// MAX PLAYERS
// ======================================================

function getMaxPlayers(
  server,
  details
) {

  const combinedData = {
    server,
    details
  };

  const value =
    findValue(
      combinedData,
      [
        "maxPlayers",
        "playerLimit",
        "maxPlayerCount",
        "playersMax",
        "max_players",
        "player_limit"
      ]
    );

  if (
    typeof value ===
    "number"
  ) {

    return value;
  }

  if (
    typeof value ===
    "string"
  ) {

    const number =
      Number(value);

    if (
      !Number.isNaN(
        number
      )
    ) {

      return number;
    }
  }

  return null;
}

// ======================================================
// CPU
// ======================================================

function getCpu(
  resources
) {

  const cpu =
    resources?.resources
      ?.cpu_absolute;

  if (
    cpu === null ||
    cpu === undefined
  ) {

    return "N/A";
  }

  const number =
    Number(cpu);

  if (
    Number.isNaN(
      number
    )
  ) {

    return "N/A";
  }

  return `${number.toFixed(2)}%`;
}

// ======================================================
// RAM
// ======================================================

function getRam(
  resources
) {

  const bytes =
    resources?.resources
      ?.memory_bytes;

  if (
    bytes === null ||
    bytes === undefined
  ) {

    return "N/A";
  }

  const number =
    Number(bytes);

  if (
    Number.isNaN(
      number
    )
  ) {

    return "N/A";
  }

  const gb =
    number /
    1024 /
    1024 /
    1024;

  if (
    gb >= 1
  ) {

    return `${gb.toFixed(2)} GB`;
  }

  const mb =
    number /
    1024 /
    1024;

  return `${mb.toFixed(0)} MB`;
}

// ======================================================
// PLAYER BAR
// ======================================================

function getPlayerBar(
  players,
  maxPlayers
) {

  if (
    players === null ||
    maxPlayers === null ||
    maxPlayers <= 0
  ) {

    return "▱▱▱▱▱▱▱▱▱▱";
  }

  const totalBlocks =
    10;

  const percentage =
    Math.min(
      players /
        maxPlayers,
      1
    );

  const filled =
    Math.round(
      percentage *
        totalBlocks
    );

  return (
    "▰".repeat(
      filled
    ) +
    "▱".repeat(
      totalBlocks -
        filled
    )
  );
}

// ======================================================
// UPTIME TEXT
// ======================================================

function getStatusText(
  online
) {

  if (online) {

    return {
      title:
        "ONLINE",

      description:
        "All systems operational",

      color:
        0x22c55e
    };
  }

  return {
    title:
      "OFFLINE",

    description:
      "Server is currently unavailable",

    color:
      0xef4444
  };
}

// ======================================================
// PREMIUM EMBED
// ======================================================

function createEmbed(
  server,
  details,
  resources
) {

  const online =
    isServerOnline(
      server,
      details,
      resources
    );

  const players =
    getPlayers(
      server,
      details
    );

  const maxPlayers =
    getMaxPlayers(
      server,
      details
    );

  const playerText =
    players !== null
      ? maxPlayers !== null
        ? `**${players} / ${maxPlayers}**`
        : `**${players}**`
      : "**N/A**";

  const playerBar =
    getPlayerBar(
      players,
      maxPlayers
    );

  const cpu =
    getCpu(
      resources
    );

  const ram =
    getRam(
      resources
    );

  const serverName =
    server?.alias ??
    server?.name ??
    SERVER_FALLBACK_NAME;

  const status =
    getStatusText(
      online
    );

  const state =
    getServerState(
      server,
      details,
      resources
    );

  let systemText;

  if (online) {

    systemText =
      "🟢 **Operational**";

  } else if (
    state === "starting" ||
    state === "start"
  ) {

    systemText =
      "🟡 **Starting**";

  } else {

    systemText =
      "🔴 **Offline**";
  }

  return new EmbedBuilder()

    // ==================================================
    // MAIN COLOR
    // ==================================================

    .setColor(
      status.color
    )

    // ==================================================
    // HEADER
    // ==================================================

    .setAuthor({
      name:
        `${NETWORK_NAME} • SERVER MONITOR`
    })

    .setTitle(
      `⛏️ ${serverName}`
    )

    .setDescription(
      online
        ? `🟢 **ONLINE**\n${status.description}`
        : `🔴 **OFFLINE**\n${status.description}`
    )

    // ==================================================
    // SERVER INFORMATION
    // ==================================================

    .addFields({

      name:
        "🌐 SERVER ADDRESS",

      value:
        `\`${SERVER_IP}\``,

      inline:
        false
    })

    .addFields(

      {
        name:
          "👥 PLAYERS",

        value:
          `${playerText}\n` +
          `\`${playerBar}\``,

        inline:
          true
      },

      {
        name:
          "⚡ CPU LOAD",

        value:
          `**${cpu}**\n` +
          "Processor usage",

        inline:
          true
      },

      {
        name:
          "🧠 MEMORY",

        value:
          `**${ram}**\n` +
          "Memory usage",

        inline:
          true
      }
    )

    // ==================================================
    // SYSTEM STATUS
    // ==================================================

    .addFields({

      name:
        "📡 SYSTEM STATUS",

      value:
        `${systemText}\n` +
        `\`${state || "unknown"}\``,

      inline:
        false
    })

    // ==================================================
    // NETWORK
    // ==================================================

    .addFields({

      name:
        "🛡️ NETWORK",

      value:
        "BlockBanDE Minecraft Network",

      inline:
        true
    })

    .addFields({

      name:
        "🔄 UPDATE",

      value:
        "Automatic • 60 seconds",

      inline:
        true
    })

    // ==================================================
    // FOOTER
    // ==================================================

    .setFooter({

      text:
        `${NETWORK_NAME} • LIVE SERVER MONITOR`
    })

    .setTimestamp();
}

// ======================================================
// STATUS NACHRICHT AKTUALISIEREN
// ======================================================

async function updateStatus() {

  try {

    const channel =
      await discord.channels.fetch(
        CHANNEL_ID
      );

    if (!channel) {

      console.error(
        "❌ Discord Channel nicht gefunden."
      );

      return;
    }

    const status =
      await getStatus();

    if (!status) {

      console.error(
        "❌ Kein Serverstatus verfügbar."
      );

      return;
    }

    const {
      server,
      details,
      resources
    } = status;

    const embed =
      createEmbed(
        server,
        details,
        resources
      );

    const messages =
      await channel.messages.fetch({
        limit:
          20
      });

    const existingMessage =
      messages.find(
        (message) =>

          message.author?.id ===
            discord.user.id &&

          message.embeds?.[0]
            ?.author?.name ===
            `${NETWORK_NAME} • SERVER MONITOR`
      );

    if (
      existingMessage
    ) {

      await existingMessage.edit({
        embeds: [
          embed
        ]
      });

      console.log(
        "✅ Status-Nachricht aktualisiert."
      );

    } else {

      await channel.send({
        embeds: [
          embed
        ]
      });

      console.log(
        "✅ Neue Status-Nachricht gesendet."
      );
    }

  } catch (error) {

    console.error(
      "❌ Fehler beim Aktualisieren der Status-Nachricht:",
      error
    );
  }
}

// ======================================================
// SLASH COMMAND
// ======================================================

const commands = [

  new SlashCommandBuilder()

    .setName(
      "status"
    )

    .setDescription(
      "Zeigt den aktuellen Minecraft Server Status."
    )

    .toJSON()
];

const rest =
  new REST({
    version:
      "10"
  }).setToken(
    DISCORD_TOKEN
  );

// ======================================================
// BOT READY
// ======================================================

discord.once(
  "clientReady",
  async () => {

    console.log(
      `🤖 Bot online: ${discord.user.tag}`
    );

    try {

      await rest.put(

        Routes.applicationCommands(
          CLIENT_ID
        ),

        {
          body:
            commands
        }
      );

      console.log(
        "✅ /status wurde registriert."
      );

    } catch (error) {

      console.error(
        "❌ Slash Command Fehler:",
        error
      );
    }

    // Erste Statusmeldung
    await updateStatus();

    // Danach jede Minute
    setInterval(
      updateStatus,
      UPDATE_INTERVAL
    );
  }
);

// ======================================================
// INTERACTIONS
// ======================================================

discord.on(
  "interactionCreate",
  async (
    interaction
  ) => {

    if (
      !interaction.isChatInputCommand()
    ) {

      return;
    }

    if (
      interaction.commandName !==
      "status"
    ) {

      return;
    }

    try {

      await interaction.deferReply();

      const status =
        await getStatus();

      if (!status) {

        await interaction.editReply(
          "❌ Der Serverstatus konnte nicht geladen werden."
        );

        return;
      }

      const embed =
        createEmbed(
          status.server,
          status.details,
          status.resources
        );

      await interaction.editReply({

        embeds: [
          embed
        ]

      });

    } catch (error) {

      console.error(
        "❌ /status Fehler:",
        error
      );

      if (
        interaction.deferred ||
        interaction.replied
      ) {

        await interaction.editReply(
          "❌ Beim Abrufen des Serverstatus ist ein Fehler aufgetreten."
        );
      }
    }
  }
);

// ======================================================
// LOGIN
// ======================================================

discord.login(
  DISCORD_TOKEN
);
