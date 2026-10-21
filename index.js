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

  res.end("Minecraft Discord Bot läuft.");
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
  console.log("State:", server.state);
  console.log("=================================");

  return server;
}

// =========================
// Status + Ressourcen
// =========================

async function getStatus() {
  const server = await findServer();

  let resources = null;

  try {
    resources = await servers.getResourceUtilization(serverUuid);

    console.log(
      `⚡ CPU: ${resources.cpu}% | 🧠 RAM: ${resources.memory} MB`
    );
  } catch (error) {
    console.log("⚠️ Ressourcen momentan nicht verfügbar.");
  }

  return {
    server,
    resources
  };
}

// =========================
// ONLINE erkennen
// =========================

function isServerOnline(server) {
  const state = String(server.state ?? "").toUpperCase();

  console.log("🔎 Server State:", state);

  return (
    state === "RUNNING" ||
    state === "ONLINE"
  );
}

// =========================
// Spielerzahl
// =========================

function getPlayers(server) {
  const players =
    server.players ??
    server.playerCount ??
    server.playersOnline ??
    server.currentPlayers;

  if (typeof players === "number") {
    return players;
  }

  return null;
}

function getMaxPlayers(server) {
  const maxPlayers =
    server.maxPlayers ??
    server.playerLimit ??
    server.maxPlayerCount;

  if (typeof maxPlayers === "number") {
    return maxPlayers;
  }

  return null;
}

// =========================
// Discord Embed
// =========================

function createEmbed(server, resources) {
  const online = isServerOnline(server);

  const players = getPlayers(server);
  const maxPlayers = getMaxPlayers(server);

  const playerText =
    players !== null
      ? `${players}${maxPlayers !== null ? ` / ${maxPlayers}` : ""}`
      : "Nicht verfügbar";

  const cpu =
    resources?.cpu != null
      ? `${resources.cpu}%`
      : "Nicht verfügbar";

  const ram =
    resources?.memory != null
      ? `${resources.memory} MB`
      : "Nicht verfügbar";

  const embed = new EmbedBuilder()
    .setTitle("🎮 Minecraft Server")
    .setDescription(
      online
        ? "🟢 **Der Server ist ONLINE**"
        : "🔴 **Der Server ist OFFLINE**"
    )
    .addFields(
      {
        name: "👥 Spieler",
        value: playerText,
        inline: true
      },
      {
        name: "⚡ CPU",
        value: cpu,
        inline: true
      },
      {
        name: "🧠 RAM",
        value: ram,
        inline: true
      }
    )
    .setFooter({
      text: "RespawnHost • Automatischer Status"
    })
    .setTimestamp();

  return embed;
}

// =========================
// Discord Status Nachricht
// =========================

async function updateStatus() {
  try {
    const channel = await discord.channels.fetch(CHANNEL_ID);

    if (!channel || !channel.isTextBased()) {
      throw new Error("Discord-Kanal nicht gefunden.");
    }

    const { server, resources } = await getStatus();

    const embed = createEmbed(server, resources);

    const messages = await channel.messages.fetch({
      limit: 10
    });

    const existingMessage = messages.find(
      message =>
        message.author.id === discord.user.id &&
        message.embeds.length > 0 &&
        message.embeds[0].title === "🎮 Minecraft Server"
    );

    if (existingMessage) {
      await existingMessage.edit({
        embeds: [embed]
      });

      console.log("✅ Status-Nachricht aktualisiert.");
    } else {
      await channel.send({
        embeds: [embed]
      });

      console.log("✅ Status-Nachricht erstellt.");
    }

  } catch (error) {
    console.error("❌ Fehler beim Aktualisieren des Status:");

    if (error?.message) {
      console.error(error.message);
    } else {
      console.error(error);
    }
  }
}

// =========================
// Slash Command
// =========================

async function registerCommands() {
  const command = new SlashCommandBuilder()
    .setName("status")
    .setDescription("Zeigt den aktuellen Minecraft Server Status.");

  const rest = new REST({
    version: "10"
  }).setToken(DISCORD_TOKEN);

  await rest.put(
    Routes.applicationCommands(CLIENT_ID),
    {
      body: [command.toJSON()]
    }
  );

  console.log("✅ /status wurde registriert.");
}

// =========================
// Bot Ready
// =========================

discord.once("ready", async () => {
  console.log("");
  console.log("=================================");
  console.log(`🤖 Bot online: ${discord.user.tag}`);
  console.log("=================================");

  try {
    await registerCommands();
    await updateStatus();
  } catch (error) {
    console.error("❌ Fehler beim Start:");
    console.error(error);
  }

  setInterval(updateStatus, 60000);
});

// =========================
// /status
// =========================

discord.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand()) {
    return;
  }

  if (interaction.commandName !== "status") {
    return;
  }

  try {
    await interaction.deferReply();

    const { server, resources } = await getStatus();

    const embed = createEmbed(server, resources);

    await interaction.editReply({
      embeds: [embed]
    });

  } catch (error) {
    console.error("❌ Fehler bei /status:");
    console.error(error);

    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(
        "❌ Der Minecraft Server Status konnte nicht abgerufen werden."
      );
    }
  }
});

// =========================
// Discord Login
// =========================

discord.login(DISCORD_TOKEN);
