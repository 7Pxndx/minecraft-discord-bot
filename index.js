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

// =========================
// Render Webserver
// =========================

const port = Number(process.env.PORT || 10000);

const webServer = http.createServer((req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/plain; charset=utf-8"
  });

  res.end("BlockBanDE Minecraft Status Bot läuft.");
});

webServer.listen(port, "0.0.0.0", () => {
  console.log(`🌐 Webserver läuft auf Port ${port}`);
});

// =========================
// Environment Variables
// =========================

const {
  DISCORD_TOKEN,
  CLIENT_ID,
  CHANNEL_ID,
  RESPAWNHOST_API_KEY
} = process.env;

if (
  !DISCORD_TOKEN ||
  !CLIENT_ID ||
  !CHANNEL_ID ||
  !RESPAWNHOST_API_KEY
) {
  console.error("❌ Environment Variables fehlen.");
  process.exit(1);
}

// =========================
// Discord
// =========================

const discord = new Client({
  intents: [GatewayIntentBits.Guilds]
});

// =========================
// RespawnHost
// =========================

const respawnHost = new RespawnHostClient({
  apiKey: RESPAWNHOST_API_KEY
});

const servers = new ServersService(respawnHost);

let serverUuid = null;

// =========================
// Server suchen
// =========================

async function findServer() {
  const result = await servers.list();

  if (!result?.data || result.data.length === 0) {
    throw new Error("Kein RespawnHost Server gefunden.");
  }

  const server = result.data[0];

  serverUuid = server.panelUuid;

  console.log("=================================");
  console.log("🎮 RespawnHost Server gefunden");
  console.log("Name:", server.alias ?? server.name ?? "Unbekannt");
  console.log("UUID:", serverUuid);
  console.log("=================================");

  return server;
}

// =========================
// Server Details
// =========================

async function getServerDetails() {
  const response = await fetch(
    `https://respawnhost.com/api/v1/servers/${serverUuid}`,
    {
      method: "GET",
      headers: {
        "X-Api-Key": RESPAWNHOST_API_KEY
      }
    }
  );

  if (!response.ok) {
    throw new Error(
      `RespawnHost Serverdetails Fehler: HTTP ${response.status}`
    );
  }

  const result = await response.json();

  return result?.data ?? result;
}

// =========================
// Status + Ressourcen
// =========================

async function getStatus() {
  const basicServer = await findServer();

  let details = basicServer;
  let resources = null;

  try {
    details = await getServerDetails();

    console.log("✅ Serverdetails geladen.");
  } catch (error) {
    console.log("⚠️ Serverdetails konnten nicht geladen werden.");
    console.error(error.message);
  }

  try {
    resources = await servers.getResourceUtilization(serverUuid);

    console.log("========== RESOURCES ===============");

    console.log(
      "State:",
      resources?.current_state ?? "unbekannt"
    );

    console.log(
      "CPU:",
      resources?.resources?.cpu_absolute ?? "unbekannt"
    );

    console.log(
      "RAM Bytes:",
      resources?.resources?.memory_bytes ?? "unbekannt"
    );

    console.log("====================================");
  } catch (error) {
    console.log("❌ Ressourcen konnten nicht geladen werden.");
    console.error(error.message);
  }

  return {
    server: details,
    resources
  };
}

// =========================
// Rekursiv Werte suchen
// =========================

function findValue(object, possibleKeys) {
  if (!object || typeof object !== "object") {
    return null;
  }

  for (const key of possibleKeys) {
    if (
      Object.prototype.hasOwnProperty.call(object, key) &&
      object[key] !== null &&
      object[key] !== undefined
    ) {
      return object[key];
    }
  }

  for (const value of Object.values(object)) {
    if (value && typeof value === "object") {
      const result = findValue(value, possibleKeys);

      if (result !== null && result !== undefined) {
        return result;
      }
    }
  }

  return null;
}

// =========================
// Online Status
// =========================

function isServerOnline(resources, server) {
  const resourceState = String(
    resources?.current_state ?? ""
  ).toLowerCase();

  const serverState = String(
    server?.state ??
    server?.status ??
    ""
  ).toLowerCase();

  return (
    resourceState === "running" ||
    resourceState === "online" ||
    resourceState === "started" ||
    serverState === "running" ||
    serverState === "online" ||
    serverState === "started"
  );
}

// =========================
// Spieler
// =========================

function getPlayers(server) {
  const players = findValue(server, [
    "players",
    "playerCount",
    "playersOnline",
    "currentPlayers",
    "onlinePlayers",
    "player_count",
    "players_online"
  ]);

  if (typeof players === "number") {
    return players;
  }

  if (players && typeof players === "object") {
    const number = findValue(players, [
      "online",
      "current",
      "count",
      "value"
    ]);

    if (typeof number === "number") {
      return number;
    }
  }

  return null;
}

// =========================
// Max Spieler
// =========================

function getMaxPlayers(server) {
  const maxPlayers = findValue(server, [
    "maxPlayers",
    "playerLimit",
    "maxPlayerCount",
    "playersMax",
    "max_players",
    "player_limit"
  ]);

  if (typeof maxPlayers === "number") {
    return maxPlayers;
  }

  return null;
}

// =========================
// CPU
// =========================

function getCpu(resources) {
  const cpu = resources?.resources?.cpu_absolute;

  if (typeof cpu === "number") {
    return `${cpu.toFixed(2)}%`;
  }

  return "N/A";
}

// =========================
// RAM
// =========================

function getRam(resources) {
  const memoryBytes =
    resources?.resources?.memory_bytes;

  if (typeof memoryBytes === "number") {
    const memoryGB =
      memoryBytes / 1024 / 1024 / 1024;

    if (memoryGB >= 1) {
      return `${memoryGB.toFixed(2)} GB`;
    }

    const memoryMB =
      memoryBytes / 1024 / 1024;

    return `${memoryMB.toFixed(0)} MB`;
  }

  return "N/A";
}

// =========================
// Spieler-Auslastung
// =========================

function getPlayerBar(players, maxPlayers) {
  if (
    players === null ||
    maxPlayers === null ||
    maxPlayers <= 0
  ) {
    return "━━━━━━━━━━━━━━━━";
  }

  const percentage = Math.min(
    players / maxPlayers,
    1
  );

  const totalBlocks = 16;
  const filled = Math.round(
    percentage * totalBlocks
  );

  return (
    "▰".repeat(filled) +
    "▱".repeat(totalBlocks - filled)
  );
}

// =========================
// Discord Embed
// =========================

function createEmbed(server, resources) {
  const online = isServerOnline(
    resources,
    server
  );

  const players = getPlayers(server);
  const maxPlayers = getMaxPlayers(server);

  const playerText =
    players !== null
      ? maxPlayers !== null
        ? `**${players}** / ${maxPlayers}`
        : `**${players}**`
      : "**N/A**";

  const playerBar = getPlayerBar(
    players,
    maxPlayers
  );

  const cpu = getCpu(resources);
  const ram = getRam(resources);

  const serverName =
    server?.alias ??
    server?.name ??
    "BlockBanDE";

  const statusText = online
    ? "ONLINE"
    : "OFFLINE";

  const statusDescription = online
    ? "Server is running normally"
    : "Server is currently unavailable";

  return new EmbedBuilder()
    .setColor(
      online ? 0x57f287 : 0xed4245
    )

    .setAuthor({
      name: "BLOCKBANDE • SERVER STATUS"
    })

    .setTitle(`◈ ${serverName}`)

    .setDescription(
      online
        ? `🟢  **${statusText}**\n${statusDescription}`
        : `🔴  **${statusText}**\n${statusDescription}`
    )

    .addFields(
      {
        name: "PLAYERS",
        value:
          `${playerText}\n` +
          `\`${playerBar}\``,
        inline: true
      },
      {
        name: "CPU",
        value: `**${cpu}**\nProcessor usage`,
        inline: true
      },
      {
        name: "MEMORY",
        value: `**${ram}**\nMemory usage`,
        inline: true
      }
    )

    .addFields({
      name: "SERVER STATUS",
      value:
        online
          ? "🟢 **Operational**"
          : "🔴 **Offline**",
      inline: false
    })

    .setFooter({
      text: "BLOCKBANDE • Minecraft Network"
    })

    .setTimestamp();
}

// =========================
// Status Nachricht
// =========================

async function updateStatus() {
  try {
    const channel =
      await discord.channels.fetch(CHANNEL_ID);

    if (!channel || !channel.isTextBased()) {
      throw new Error(
        "Discord-Kanal nicht gefunden."
      );
    }

    const {
      server,
      resources
    } = await getStatus();

    const embed =
      createEmbed(
        server,
        resources
      );

    const messages =
      await channel.messages.fetch({
        limit: 10
      });

    const existingMessage =
      messages.find(
        message =>
          message.author.id === discord.user.id &&
          message.embeds.length > 0 &&
          message.embeds[0].author?.name ===
            "BLOCKBANDE • SERVER STATUS"
      );

    if (existingMessage) {
      await existingMessage.edit({
        embeds: [embed]
      });

      console.log(
        "✅ Status-Nachricht aktualisiert."
      );
    } else {
      await channel.send({
        embeds: [embed]
      });

      console.log(
        "✅ Status-Nachricht erstellt."
      );
    }
  } catch (error) {
    console.error(
      "❌ Fehler beim Aktualisieren des Status:"
    );

    console.error(error);
  }
}

// =========================
// Slash Command
// =========================

async function registerCommands() {
  const command =
    new SlashCommandBuilder()
      .setName("status")
      .setDescription(
        "Zeigt den aktuellen Minecraft Server Status."
      );

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
        command.toJSON()
      ]
    }
  );

  console.log(
    "✅ /status wurde registriert."
  );
}

// =========================
// Bot Ready
// =========================

discord.once("ready", async () => {
  console.log("");
  console.log("=================================");
  console.log(
    `🤖 Bot online: ${discord.user.tag}`
  );
  console.log("=================================");

  try {
    await registerCommands();
    await updateStatus();
  } catch (error) {
    console.error(
      "❌ Fehler beim Start:"
    );

    console.error(error);
  }

  setInterval(
    updateStatus,
    60000
  );
});

// =========================
// /status
// =========================

discord.on(
  "interactionCreate",
  async interaction => {
    if (!interaction.isChatInputCommand()) {
      return;
    }

    if (
      interaction.commandName !== "status"
    ) {
      return;
    }

    try {
      await interaction.deferReply();

      const {
        server,
        resources
      } = await getStatus();

      const embed =
        createEmbed(
          server,
          resources
        );

      await interaction.editReply({
        embeds: [embed]
      });
    } catch (error) {
      console.error(
        "❌ Fehler bei /status:"
      );

      console.error(error);

      if (
        interaction.deferred ||
        interaction.replied
      ) {
        await interaction.editReply(
          "❌ Der Minecraft Server Status konnte nicht abgerufen werden."
        );
      }
    }
  }
);

// =========================
// Discord Login
// =========================

discord.login(
  DISCORD_TOKEN
);
