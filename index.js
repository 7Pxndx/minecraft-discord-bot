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

const PORT = process.env.PORT || 10000;

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const CHANNEL_ID = process.env.CHANNEL_ID;
const RESPAWNHOST_API_KEY = process.env.RESPAWNHOST_API_KEY;

const SERVER_IP = "5.175.214.105:25581";
const NETWORK_NAME = "BLOCKBANDE NETWORK";
const SERVER_FALLBACK_NAME = "BlockBanDE";

const UPDATE_INTERVAL = 60 * 1000;

if (!DISCORD_TOKEN) {
  throw new Error("DISCORD_TOKEN fehlt.");
}

if (!CLIENT_ID) {
  throw new Error("CLIENT_ID fehlt.");
}

if (!CHANNEL_ID) {
  throw new Error("CHANNEL_ID fehlt.");
}

if (!RESPAWNHOST_API_KEY) {
  throw new Error("RESPAWNHOST_API_KEY fehlt.");
}

// RENDER WEB SERVER

const webServer = http.createServer(function (req, res) {
  res.writeHead(200, {
    "Content-Type": "text/plain; charset=utf-8"
  });

  res.end("BLOCKBANDE NETWORK Bot läuft.");
});

webServer.listen(PORT, function () {
  console.log("Webserver läuft auf Port " + PORT);
});

// DISCORD CLIENT

const discord = new Client({
  intents: [
    GatewayIntentBits.Guilds
  ]
});

// DISCORD FEHLER

discord.on("error", function (error) {
  console.error("Discord Client Error:", error);
});

discord.on("shardError", function (error) {
  console.error("Discord Shard Error:", error);
});

discord.on("warn", function (message) {
  console.warn("Discord Warnung:", message);
});

discord.on("debug", function (message) {
  console.log("Discord Debug:", message);
});

discord.on("shardDisconnect", function (event, shardId) {
  console.warn(
    "Discord Shard getrennt. Shard:",
    shardId,
    "Code:",
    event && event.code
  );
});

discord.on("shardReconnecting", function (shardId) {
  console.log(
    "Discord versucht Verbindung wiederherzustellen. Shard:",
    shardId
  );
});

discord.on("shardReady", function (shardId) {
  console.log(
    "Discord Shard wieder verbunden. Shard:",
    shardId
  );
});

discord.on("invalidated", function () {
  console.error("Discord Session wurde invalidiert.");
});

// RESPAWNHOST

const respawnHost = new RespawnHostClient({
  apiKey: RESPAWNHOST_API_KEY
});

const servers = new ServersService(respawnHost);

let serverUuid = null;

// SERVER SUCHEN

async function findServer() {
  try {
    const result = await servers.list();

    const serverList = Array.isArray(result)
      ? result
      : result && (
          result.data ||
          result.servers ||
          []
        );

    if (!serverList.length) {
      console.log("Kein RespawnHost Server gefunden.");
      return null;
    }

    const foundServer =
      serverList.find(function (server) {
        const name =
          server && (
            server.alias ||
            server.name ||
            ""
          );

        return String(name)
          .toLowerCase()
          .includes("blockbande");
      }) || serverList[0];

    serverUuid =
      foundServer && (
        foundServer.panelUuid ||
        foundServer.uuid ||
        foundServer.id ||
        null
      );

    console.log("RespawnHost Server gefunden.");

    console.log(
      "Name:",
      foundServer && (
        foundServer.alias ||
        foundServer.name ||
        SERVER_FALLBACK_NAME
      )
    );

    console.log("UUID:", serverUuid);

    return foundServer;

  } catch (error) {
    console.error(
      "Fehler beim Suchen des Servers:",
      error
    );

    return null;
  }
}

// SERVER DETAILS

async function getServerDetails() {
  if (!serverUuid) {
    return null;
  }

  try {
    const response = await fetch(
      "https://respawnhost.com/api/v1/servers/" + serverUuid,
      {
        headers: {
          "X-Api-Key": RESPAWNHOST_API_KEY,
          "Accept": "application/json"
        }
      }
    );

    if (!response.ok) {
      throw new Error(
        "HTTP " + response.status
      );
    }

    const data = await response.json();

    console.log("Serverdetails geladen.");

    return data;

  } catch (error) {
    console.error(
      "Fehler beim Laden der Serverdetails:",
      error
    );

    return null;
  }
}

// RECURSIVE VALUE FINDER

function findValue(object, keys) {
  if (
    object === null ||
    object === undefined ||
    typeof object !== "object"
  ) {
    return null;
  }

  const wantedKeys = keys.map(function (key) {
    return String(key).toLowerCase();
  });

  for (const entry of Object.entries(object)) {
    const key = entry[0];
    const value = entry[1];

    if (
      wantedKeys.includes(
        String(key).toLowerCase()
      )
    ) {
      return value;
    }
  }

  for (const value of Object.values(object)) {
    if (
      value &&
      typeof value === "object"
    ) {
      const found = findValue(
        value,
        keys
      );

      if (found !== null) {
        return found;
      }
    }
  }

  return null;
}

// SERVER STATE

function getServerState(
  server,
  details,
  resources
) {
  const combinedData = {
    server: server,
    details: details,
    resources: resources
  };

  const state = findValue(
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
    "RespawnHost State:",
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

// ONLINE STATUS

function isServerOnline(
  server,
  details,
  resources
) {
  const state = getServerState(
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

  return onlineStates.includes(state);
}

// STATUS

async function getStatus() {
  try {
    const server = await findServer();

    if (!server) {
      return null;
    }

    const details =
      await getServerDetails();

    let resources = null;

    try {
      resources =
        await servers.getResourceUtilization(
          serverUuid
        );
    } catch (error) {
      console.error(
        "Ressourcen konnten nicht geladen werden:",
        error
      );
    }

    console.log(
      "========== SERVER STATUS =========="
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
      resources &&
      resources.resources &&
      resources.resources.cpu_absolute !== undefined
        ? resources.resources.cpu_absolute
        : "N/A"
    );

    console.log(
      "RAM Bytes:",
      resources &&
      resources.resources &&
      resources.resources.memory_bytes !== undefined
        ? resources.resources.memory_bytes
        : "N/A"
    );

    console.log(
      "===================================="
    );

    return {
      server: server,
      details: details,
      resources: resources
    };

  } catch (error) {
    console.error(
      "Fehler beim Abrufen des Status:",
      error
    );

    return null;
  }
}

// PLAYERS

function getPlayers(
  server,
  details
) {
  const combinedData = {
    server: server,
    details: details
  };

  const value = findValue(
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

  if (typeof value === "number") {
    return value;
  }

  if (
    typeof value === "string" &&
    value.trim() !== ""
  ) {
    const number = Number(value);

    if (!Number.isNaN(number)) {
      return number;
    }
  }

  if (
    value &&
    typeof value === "object"
  ) {
    const nested = findValue(
      value,
      [
        "online",
        "current",
        "count",
        "value"
      ]
    );

    if (typeof nested === "number") {
      return nested;
    }

    if (typeof nested === "string") {
      const number = Number(nested);

      if (!Number.isNaN(number)) {
        return number;
      }
    }
  }

  return null;
}

// MAX PLAYERS

function getMaxPlayers(
  server,
  details
) {
  const combinedData = {
    server: server,
    details: details
  };

  const value = findValue(
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

  if (typeof value === "number") {
    return value;
  }

  if (typeof value === "string") {
    const number = Number(value);

    if (!Number.isNaN(number)) {
      return number;
    }
  }

  return null;
}

// CPU

function getCpu(resources) {
  const cpu =
    resources &&
    resources.resources &&
    resources.resources.cpu_absolute;

  if (
    cpu === null ||
    cpu === undefined
  ) {
    return "N/A";
  }

  const number = Number(cpu);

  if (Number.isNaN(number)) {
    return "N/A";
  }

  return number.toFixed(2) + "%";
}

// RAM

function getRam(resources) {
  const bytes =
    resources &&
    resources.resources &&
    resources.resources.memory_bytes;

  if (
    bytes === null ||
    bytes === undefined
  ) {
    return "N/A";
  }

  const number = Number(bytes);

  if (Number.isNaN(number)) {
    return "N/A";
  }

  const gb =
    number /
    1024 /
    1024 /
    1024;

  if (gb >= 1) {
    return gb.toFixed(2) + " GB";
  }

  const mb =
    number /
    1024 /
    1024;

  return mb.toFixed(0) + " MB";
}

// PLAYER BAR

function getPlayerBar(
  players,
  maxPlayers
) {
  if (
    players === null ||
    maxPlayers === null ||
    maxPlayers <= 0
  ) {
    return "----------";
  }

  const totalBlocks = 10;

  const percentage = Math.min(
    players / maxPlayers,
    1
  );

  const filled = Math.round(
    percentage * totalBlocks
  );

  return (
    "#".repeat(filled) +
    "-".repeat(
      totalBlocks - filled
    )
  );
}

// STATUS TEXT

function getStatusText(online) {
  if (online) {
    return {
      title: "ONLINE",
      description:
        "All systems operational",
      color: 0x22c55e
    };
  }

  return {
    title: "OFFLINE",
    description:
      "Server is currently unavailable",
    color: 0xef4444
  };
}

// EMBED

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

  let playerText = "N/A";

  if (players !== null) {
    if (maxPlayers !== null) {
      playerText =
        players +
        " / " +
        maxPlayers;
    } else {
      playerText =
        String(players);
    }
  }

  const playerBar =
    getPlayerBar(
      players,
      maxPlayers
    );

  const cpu =
    getCpu(resources);

  const ram =
    getRam(resources);

  const serverName =
    server &&
    (
      server.alias ||
      server.name
    )
      ? (
          server.alias ||
          server.name
        )
      : SERVER_FALLBACK_NAME;

  const status =
    getStatusText(online);

  const state =
    getServerState(
      server,
      details,
      resources
    );

  let systemText = "OFFLINE";

  if (online) {
    systemText = "ONLINE";
  } else if (
    state === "starting" ||
    state === "start"
  ) {
    systemText = "STARTING";
  }

  return new EmbedBuilder()
    .setColor(status.color)
    .setAuthor({
      name:
        NETWORK_NAME +
        " - SERVER MONITOR"
    })
    .setTitle(
      "Minecraft Server: " +
      serverName
    )
    .setDescription(
      systemText +
      "\n" +
      status.description
    )
    .addFields(
      {
        name: "SERVER ADDRESS",
        value: SERVER_IP,
        inline: false
      },
      {
        name: "PLAYERS",
        value:
          playerText +
          "\n[" +
          playerBar +
          "]",
        inline: true
      },
      {
        name: "CPU LOAD",
        value: cpu,
        inline: true
      },
      {
        name: "MEMORY",
        value: ram,
        inline: true
      },
      {
        name: "RESPAWNHOST STATE",
        value: state || "unknown",
        inline: true
      }
    )
    .setFooter({
      text:
        NETWORK_NAME +
        " | Automatic Server Monitor"
    })
    .setTimestamp();
}

// STATUS MESSAGE

let statusMessageId = null;

async function updateStatus() {
  try {
    console.log(
      "Starte Status-Update..."
    );

    const channel =
      await discord.channels.fetch(
        CHANNEL_ID
      );

    if (!channel) {
      console.error(
        "Discord Channel nicht gefunden."
      );
      return;
    }

    const status =
      await getStatus();

    if (!status) {
      console.error(
        "Kein Serverstatus verfügbar."
      );
      return;
    }

    const embed =
      createEmbed(
        status.server,
        status.details,
        status.resources
      );

    let message = null;

    if (statusMessageId) {
      try {
        message =
          await channel.messages.fetch(
            statusMessageId
          );
      } catch (error) {
        console.log(
          "Alte Statusnachricht nicht gefunden."
        );
      }
    }

    if (!message) {
      const messages =
        await channel.messages.fetch({
          limit: 20
        });

      message =
        messages.find(function (msg) {
          return (
            msg.author.id ===
            discord.user.id
          );
        });
    }

    if (message) {
      await message.edit({
        embeds: [embed]
      });

      statusMessageId =
        message.id;

      console.log(
        "Statusnachricht aktualisiert."
      );

    } else {
      const newMessage =
        await channel.send({
          embeds: [embed]
        });

      statusMessageId =
        newMessage.id;

      console.log(
        "Neue Statusnachricht erstellt."
      );
    }

  } catch (error) {
    console.error(
      "Fehler beim Status-Update:",
      error
    );
  }
}

// SLASH COMMAND

const statusCommand =
  new SlashCommandBuilder()
    .setName("status")
    .setDescription(
      "Zeigt den aktuellen Minecraft Server Status."
    );

// COMMANDS REGISTRIEREN

async function registerCommands() {
  try {
    const rest =
      new REST({
        version: "10"
      }).setToken(
        DISCORD_TOKEN
      );

    await rest.put(
      Routes.applicationCommands(
        CLIENT_ID
      ),
      {
        body: [
          statusCommand.toJSON()
        ]
      }
    );

    console.log(
      "Slash Command /status registriert."
    );

  } catch (error) {
    console.error(
      "Fehler beim Registrieren der Slash Commands:",
      error
    );
  }
}

// INTERACTION

discord.on(
  "interactionCreate",
  async function (interaction) {
    try {
      if (
        !interaction.isChatInputCommand()
      ) {
        return;
      }

      if (
        interaction.commandName ===
        "status"
      ) {
        await interaction.deferReply();

        const status =
          await getStatus();

        if (!status) {
          await interaction.editReply(
            "Der Serverstatus konnte nicht abgerufen werden."
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
          embeds: [embed]
        });
      }

    } catch (error) {
      console.error(
        "Fehler bei Interaction:",
        error
      );

      try {
        if (
          interaction.deferred ||
          interaction.replied
        ) {
          await interaction.editReply(
            "Beim Ausführen des Befehls ist ein Fehler aufgetreten."
          );
        } else {
          await interaction.reply({
            content:
              "Beim Ausführen des Befehls ist ein Fehler aufgetreten.",
            ephemeral: true
          });
        }
      } catch (replyError) {
        console.error(
          "Fehler beim Senden der Fehlerantwort:",
          replyError
        );
      }
    }
  }
);

// READY

discord.once(
  "clientReady",
  async function () {
    console.log(
      "Discord Bot ist vollständig verbunden."
    );

    console.log(
      "Bot:",
      discord.user.tag
    );

    console.log(
      "Bot ID:",
      discord.user.id
    );

    await registerCommands();

    await updateStatus();

    setInterval(
      updateStatus,
      UPDATE_INTERVAL
    );
  }
);

// PROCESS ERROR HANDLER

process.on(
  "unhandledRejection",
  function (error) {
    console.error(
      "Unhandled Promise Rejection:",
      error
    );
  }
);

process.on(
  "uncaughtException",
  function (error) {
    console.error(
      "Uncaught Exception:",
      error
    );
  }
);

// LOGIN

console.log(
  "Starte Discord Bot..."
);

discord
  .login(DISCORD_TOKEN)
  .then(function () {
    console.log(
      "Discord Login erfolgreich."
    );
  })
  .catch(function (error) {
    console.error(
      "Discord Login fehlgeschlagen:",
      error
    );
  });
