const { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");

const BOT_TOKEN = process.env.BOT_TOKEN;
const PLAYERS_API = "https://fivem-proxy-five.vercel.app/api/players";
const WEBSITE_LINK = "https://itachiwho.github.io/fivem-player-list/";

const NORMAL_CHANNEL_ID = "1000818131574468718"; // Server 1 normal channel
const FORUM_CHANNEL_ID = "1319930898510254172";  // Server 2 forum channel

const PER_PAGE = 30;
const UPDATE_INTERVAL = 30 * 1000;

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

let lastPlayers = [];
let currentPage = 0;
let normalMessageId = null;
let forumThreadId = null;
let forumMessageId = null;

// ✅ Bangladesh Time
function getBDTime() {
  return new Date().toLocaleTimeString("en-BD", {
    timeZone: "Asia/Dhaka",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true
  });
}

// ✅ Fetch Players
async function fetchPlayers() {
  const res = await fetch(PLAYERS_API);
  const data = await res.json();

  let players = Array.isArray(data) ? data : (data.players || []);

  // ✅ Sort by Server ID
  players.sort((a, b) => a.id - b.id);

  lastPlayers = players;
}

// ✅ Format Page
function formatPlayersPage(players, page) {
  const start = page * PER_PAGE;
  const pagePlayers = players.slice(start, start + PER_PAGE);

  if (!pagePlayers.length) return "No players online.";

  return pagePlayers.map((p, i) => {
    const num = `${start + i + 1}.`.padEnd(4, " ");
    const name = (p.name || "Unknown").padEnd(15, " ");
    return `${num} [ID: ${p.id}]  ${name}  ${p.ping}ms`;
  }).join("\n");
}

// ✅ Build Message
function buildMessage() {
  const totalPages = Math.max(1, Math.ceil(lastPlayers.length / PER_PAGE));
  if (currentPage >= totalPages) currentPage = 0;

  const time = getBDTime();

  return {
    content:
`**Legacy Roleplay Bangladesh — Live Players**
**Online:** ${lastPlayers.length}  |  **Page ${currentPage + 1} / ${totalPages}**

\`\`\`
${formatPlayersPage(lastPlayers, currentPage)}
\`\`\`
Full Player List: ${WEBSITE_LINK}
Last update: **${time}**`,
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("prev").setLabel("◀ Prev").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId("next").setLabel("Next ▶").setStyle(ButtonStyle.Primary)
      )
    ]
  };
}

// ✅ Ensure Forum Thread Exists
async function ensureForumThread() {
  const forum = await client.channels.fetch(FORUM_CHANNEL_ID);

  if (forumThreadId) {
    try {
      const thread = await forum.threads.fetch(forumThreadId);
      if (thread?.archived) await thread.setArchived(false);
      return thread;
    } catch {}
  }

  const thread = await forum.threads.create({
    name: "🟢 Live FiveM Player List",
    message: { content: "Initializing live player list..." }
  });

  forumThreadId = thread.id;
  const msg = await thread.fetchStarterMessage();
  forumMessageId = msg.id;

  return thread;
}

// ✅ Update Both Locations
async function updateAll() {
  try {
    await fetchPlayers();
    const payload = buildMessage();

    // ✅ Normal Channel Update
    const normalChannel = await client.channels.fetch(NORMAL_CHANNEL_ID);
    if (!normalMessageId) {
      const msg = await normalChannel.send(payload);
      normalMessageId = msg.id;
    } else {
      const msg = await normalChannel.messages.fetch(normalMessageId);
      await msg.edit(payload);
    }

    // ✅ Forum Thread Update
    const thread = await ensureForumThread();
    const forumMsg = await thread.messages.fetch(forumMessageId);
    await forumMsg.edit(payload);

  } catch (err) {
    console.error("Update Failed:", err.message);
  }
}

// ✅ Button Interaction
client.on("interactionCreate", async interaction => {
  if (!interaction.isButton()) return;

  const totalPages = Math.max(1, Math.ceil(lastPlayers.length / PER_PAGE));

  if (interaction.customId === "prev") {
    currentPage = (currentPage - 1 + totalPages) % totalPages;
  }

  if (interaction.customId === "next") {
    currentPage = (currentPage + 1) % totalPages;
  }

  await interaction.deferUpdate();
  await updateAll();
});

// ✅ Bot Ready
client.once("ready", () => {
  console.log(`✅ Bot online as ${client.user.tag}`);
  updateAll();
  setInterval(updateAll, UPDATE_INTERVAL);
});

client.login(BOT_TOKEN);

