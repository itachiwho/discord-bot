const { 
  Client, 
  GatewayIntentBits, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle 
} = require("discord.js");

// ✅ YOUR REAL BOT TOKEN
const BOT_TOKEN = process.env.BOT_TOKEN;

// ✅ YOUR DISCORD CHANNEL ID
const CHANNEL_ID = "1000818131574468718";

// ✅ YOUR FIVE M PROXY API
const PLAYERS_API = "https://fivem-proxy-five.vercel.app/api/players";

// ✅ UPDATE INTERVAL (30 SECONDS)
const UPDATE_INTERVAL = 30000;

// ✅ PLAYERS PER PAGE
const PER_PAGE = 30;

// ✅ YOUR WEBSITE LINK
const WEBSITE_LINK = "https://itachiwho.github.io/fivem-player-list/";

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

let messageId = null;
let currentPage = 0;
let lastPlayers = [];

// ✅ Pad text for clean column alignment
function padRight(text, length) {
  text = String(text);
  return text + " ".repeat(Math.max(0, length - text.length));
}

// ✅ Format a single page
function formatPlayersPage(players, page) {
  if (!players.length) return "No players online.";

  const start = page * PER_PAGE;
  const end = start + PER_PAGE;
  const pagePlayers = players.slice(start, end);

  const maxNameLength = Math.min(
    Math.max(...pagePlayers.map(p => p.name.length), 6),
    20
  );

  let lines = pagePlayers.map((p, i) => {
    const num = `${start + i + 1}.`.padEnd(4, " ");
    const id = padRight(`[ID: ${p.id}]`, 10);
    const name = padRight(p.name.slice(0, 20), maxNameLength + 2);
    const ping = padRight(`${p.ping}ms`, 6);

    return `${num} ${id} ${name} ${ping}`;
  });

  return lines.join("\n");
}

// ✅ Build buttons
function getButtons(totalPages) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("prev")
      .setLabel("◀️ Prev")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(currentPage === 0),

    new ButtonBuilder()
      .setCustomId("next")
      .setLabel("Next ▶️")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(currentPage >= totalPages - 1)
  );
}

// ✅ Main update function
async function updatePlayerList() {
  try {
    const res = await fetch(PLAYERS_API);
    const data = await res.json();

let players = Array.isArray(data) ? data : (data.players || []);

// ✅ SORT BY SERVER ID (LOW → HIGH)
players.sort((a, b) => a.id - b.id);

lastPlayers = players;

    const totalPages = Math.max(1, Math.ceil(players.length / PER_PAGE));
    if (currentPage >= totalPages) currentPage = totalPages - 1;

const time = new Date().toLocaleTimeString("en-BD", {
  timeZone: "Asia/Dhaka",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: true
});

const content = `
**Legacy Roleplay Bangladesh — Live Players**
**Online:** ${players.length}${data.max ? " / " + data.max : ""}  |  **Page ${currentPage + 1} / ${totalPages}**

\`\`\`
${formatPlayersPage(players, currentPage)}
\`\`\`
Full Player List: ${WEBSITE_LINK}
Last update: **${time}**
    `;

    const channel = await client.channels.fetch(CHANNEL_ID);

    if (!messageId) {
      const msg = await channel.send({
        content,
        components: [getButtons(totalPages)]
      });
      messageId = msg.id;
      console.log("✅ Live paged player message created.");
    } else {
      await channel.messages.edit(messageId, {
        content,
        components: [getButtons(totalPages)]
      });
      console.log("✅ Player list updated at", time);
    }

  } catch (err) {
    console.error("❌ Failed to update player list:", err.message);
  }
}

// ✅ Button interaction handler
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isButton()) return;

  if (interaction.customId === "prev") {
    currentPage--;
  } 
  if (interaction.customId === "next") {
    currentPage++;
  }

  await interaction.deferUpdate();
  await updatePlayerList();
});

client.once("ready", async () => {
  console.log(`✅ Bot is now online as: ${client.user.tag}`);
  await updatePlayerList();
  setInterval(updatePlayerList, UPDATE_INTERVAL);
});

client.login(BOT_TOKEN);

