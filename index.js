const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  REST,
  Routes,
  SlashCommandBuilder
} = require("discord.js");

const {
  RespawnHostClient,
  ServersService
} = require("@respawnhost/sdk");

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const CHANNEL_ID = process.env.CHANNEL_ID;
const RESPAWNHOST_API_KEY = process.env.RESPAWNHOST_API_KEY;

if (!DISCORD_TOKEN || !CLIENT_ID || !CHANNEL_ID || !RESPAWNHOST_API_KEY) {
  console.error("❌ Es fehlen Environment Variables.");
  process.exit(1);
}

const discord = new Client({
  intents: [GatewayIntentBits.Guilds]
});

const respawnClient = new RespawnHostClient({
  apiKey: RESPAWNHOST_API_KEY
});

const servers = new ServersService(respawnClient);

let serverUuid = null;
let statusMessage = null;

const commands = [
  new SlashCommandBuilder()
    .setName("status")
    .setDescription("Zeigt den Minecraft Server Status")
].map(command => command.toJSON());

async function registerCommands() {
  const rest = new REST({ version: "10" }).setToken(DISCORD_TOKEN);

  await rest.put(
    Routes.applicationCommands(CLIENT_ID),
    { body: commands }
  );

  console.log("✅ Slash Command /status registriert");
}

async function findServer() {
  const result = await servers.list();

  if (!result.data || result.data.length === 0) {
    throw new Error("Keine RespawnHost Server gefunden.");
  }

  if (!serverUuid) {
    serverUuid = result.data[0].panelUuid;
  }

  return result.data[0];
}

function createEmbed(server, resources) {
  const running =
    server.state === "running" ||
    server.status === "running" ||
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

  const cpu = resources?.cpu ?? "?";
  const memory = resources?.memory ?? "?";

  const embed = new EmbedBuilder()
    .setTitle("🎮 Minecraft Server")
    .setDescription(
      running
        ? "🟢 **Server ist online**"
        : "🔴 **Server ist offline**"
    )
    .addFields(
      {
        name: "👥 Spieler",
        value: `${players} / ${maxPlayers}`,
        inline: true
      },
      {
        name: "🖥️ CPU",
        value: `${cpu}%`,
        inline: true
      },
      {
        name: "💾 RAM",
        value: `${memory} MB`,
        inline: true
      }
    )
    .setFooter({
      text: "RespawnHost • Automatischer Status"
    })
    .setTimestamp();

  return embed;
}

async function getStatus() {
  const server = await findServer();

  let resources = {};

  try {
    resources = await servers.getResourceUtilization(serverUuid);
  } catch (error) {
    console.log("⚠️ Ressourcen konnten nicht geladen werden.");
  }

  return {
    server,
    resources
  };
}

async function updateStatus() {
  try {
    const channel = await discord.channels.fetch(CHANNEL_ID);

    if (!channel) {
      console.error("❌ Discord Channel nicht gefunden.");
      return;
    }

    const { server, resources } = await getStatus();

    const embed = createEmbed(server, resources);

    if (!statusMessage) {
      const messages = await channel.messages.fetch({ limit: 10 });

      statusMessage = messages.find(
        message =>
          message.author.id === discord.user.id &&
          message.embeds.length > 0 &&
          message.embeds[0].title === "🎮 Minecraft Server"
      );
    }

    if (statusMessage) {
      await statusMessage.edit({ embeds: [embed] });
    } else {
      statusMessage = await channel.send({ embeds: [embed] });
    }

    console.log("✅ Status aktualisiert");
  } catch (error) {
    console.error("❌ Status Fehler:", error.message);
  }
}

discord.once("ready", async () => {
  console.log(`🤖 Bot online als ${discord.user.tag}`);

  await registerCommands();
  await updateStatus();

  setInterval(updateStatus, 60000);
});

discord.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === "status") {
    await interaction.deferReply();

    try {
      const { server, resources } = await getStatus();
      const embed = createEmbed(server, resources);

      await interaction.editReply({
        embeds: [embed]
      });
    } catch (error) {
      console.error(error);

      await interaction.editReply(
        "❌ Der Minecraft-Serverstatus konnte nicht geladen werden."
      );
    }
  }
});

discord.login(DISCORD_TOKEN);
