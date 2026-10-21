import {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  REST,
  Routes,
  SlashCommandBuilder
} from "discord.js";

import { RespawnHostClient, ServersService } from "@respawnhost/sdk";
import http from "node:http";

// =========================
// Render Web Service
// =========================

const port = Number(process.env.PORT || 10000);

const webServer = http.createServer((req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/plain; charset=utf-8"
  });

  res.end("Minecraft Discord Bot läuft.");
});

webServer.listen(port, "0.0.0.0", () => {
  console.log(`Webserver läuft auf Port ${port}`);
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
  console.error("❌ Es fehlen Environment Variables.");
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
// Server finden
// =========================

async function findServer() {
  const result = await servers.list();

  if (!result?.data || result.data.length === 0) {
    throw new Error("Kein RespawnHost Server gefunden.");
  }

  const server = result.data[0];

  serverUuid = server.panelUuid;

  console.log(`Minecraft Server gefunden: ${server.name}`);
  console.log(`Server UUID: ${serverUuid}`);

  return server;
}

// =========================
// Server Status
// =========================

async function getStatus() {
  const server = await findServer();

  let resources = null;

  try {
    if (serverUuid) {
      resources = await servers.getResourceUtilization(serverUuid);
    }
  } catch (error) {
    console.log("⚠️ Ressourcen konnten nicht geladen werden.");
  }

  return {
    server,
    resources
  };
}

// =========================
// Discord Embed
// =========================

function createEmbed(server, resources) {
  const state = String(
    server.state ??
    server.status ??
    ""
  ).toLowerCase();

  const isOnline =
    state === "running" ||
    state === "online" ||
    server.online === true;

  const players =
    server.players ??
    server.playerCount ??
    server.playersOnline ??
    0;

  const maxPlayers =
    server.maxPlayers ??
    server.playerLimit ??
    "?";

  const cpu =
    resources?.cpu != null
      ? `${resources.cpu}%`
      : "?";

  const memory =
    resources?.memory != null
      ? `${resources.memory} MB`
      : "?";

  return new EmbedBuilder()
    .setTitle("🎮 Minecraft Server")
    .setDescription(
      isOnline
        ? "🟢 **Der Server ist ONLINE**"
        : "🔴 **Der Server ist OFFLINE**"
    )
    .addFields(
      {
        name: "👥 Spieler",
        value: `${players} / ${maxPlayers}`,
        inline: true
      },
      {
        name: "⚡ CPU",
        value: cpu,
        inline: true
      },
      {
        name: "🧠 RAM",
        value: memory,
        inline: true
      }
    )
    .setFooter({
      text: "RespawnHost • Automatischer Status"
    })
    .setTimestamp();
}

// =========================
// Status Nachricht aktualisieren
// =========================

async function updateStatus() {
  try {
    const channel = await discord.channels.fetch(CHANNEL_ID);

    if (!channel || !channel.isTextBased()) {
      throw new Error("Der angegebene Discord-Kanal wurde nicht gefunden.");
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

      console.log("✅ Neue Status-Nachricht erstellt.");
    }
  } catch (error) {
    console.error("❌ Fehler beim Aktualisieren des Status:");
    console.error(error);
  }
}

// =========================
// Slash Command registrieren
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
// Discord Bot gestartet
// =========================

discord.once("ready", async () => {
  console.log(`🤖 Bot ist online als ${discord.user.tag}`);

  try {
    await registerCommands();
    await updateStatus();
  } catch (error) {
    console.error("❌ Fehler beim Start:");
    console.error(error);
  }

  // Alle 60 Sekunden aktualisieren
  setInterval(updateStatus, 60000);
});

// =========================
// /status Command
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
// Bot Login
// =========================

discord.login(DISCORD_TOKEN);
