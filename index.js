const { Client, GatewayIntentBits } = require("discord.js");

const BOT_TOKEN = process.env.BOT_TOKEN;
const PLAYERS_API = "https://fivem-proxy-five.vercel.app/api/players";
const WEBSITE_LINK = "https://itachiwho.github.io/fivem-player-list/";

const NORMAL_CHANNEL_ID = "1000818131574468718"; // Server 1 normal channel
const FORUM_CHANNEL_ID = "1319930898510254172";  // Server 2 forum channel

const UPDATE_INTERVAL = 30 * 1000;           // 30s
const MAX_CHARS_PER_CHUNK = 1500;            // safety margin under 2000

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

let lastPlayers = [];
let normalMessageIds = []; // multiple messages in normal channel
let forumThreadId = null;
let forumMessageIds = [];  // multiple messages inside forum thread

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

// ✅ Build aligned rows for all players
function buildPlayerRows(players) {
  if (!players.length) return ["No players online."];

  const maxNameLength = Math.max(
    ...players.map(p => (p.name || "Unknown").length),
    10
  );

  return players.map((p, i) => {
    const num = `${i + 1}.`.padEnd(4, " ");
    const name = (p.name || "Unknown").padEnd(maxNameLength + 2, " ");
    const ping = `${p.ping}ms`.padStart(6, " ");
    return `${num} [${p.id}]  ${name}${ping}`;
  });
}

// ✅ Split array of lines into chunks by character limit
function chunkLines(lines, maxChars) {
  const chunks = [];
  let current = [];

  let currentLen = 0;

  for (const line of lines) {
    const lineWithNewline = line + "\n";
    if (currentLen + lineWithNewline.length > maxChars && current.length) {
      chunks.push(current.join("\n"));
      current = [];
      currentLen = 0;
    }
    current.push(line);
    currentLen += lineWithNewline.length;
  }

  if (current.length) {
    chunks.push(current.join("\n"));
  }

  return chunks;
}

// ✅ Build content chunks for live dashboard (header only on first)
function buildDashboardChunks() {
  const time = getBDTime();
  const rows = buildPlayerRows(lastPlayers);
  const bodyChunks = chunkLines(rows, MAX_CHARS_PER_CHUNK);

  if (!bodyChunks.length) {
    return [
      `**Legacy Roleplay Bangladesh — Live Players**\n` +
      `**Online:** 0\n\n` +
      `No players online.\n` +
      `Last update: **${time}**\n` +
      `Full Player List: ${WEBSITE_LINK}`
    ];
  }

  const chunks = [];

  // ✅ First message: header + first chunk + footer
  const first =
    `**Legacy Roleplay Bangladesh — Live Players**\n` +
    `**Online:** ${lastPlayers.length}\n\n` +
    "```" +
    "\n" +
    bodyChunks[0] +
    "\n```" +
    `\nLast update: **${time}**` +
    `\nFull Player List: ${WEBSITE_LINK}`;

  chunks.push(first);

  // ✅ Remaining chunks: only code blocks (no header)
  for (let i = 1; i < bodyChunks.length; i++) {
    const content =
      "```" +
      "\n" +
      bodyChunks[i] +
      "\n```";
    chunks.push(content);
  }

  return chunks;
}

// ✅ Ensure Forum Thread Exists (and keep its starter message as first)
async function ensureForumThread() {
  const forum = await client.channels.fetch(FORUM_CHANNEL_ID);

  if (forumThreadId) {
    try {
      const thread = await forum.threads.fetch(forumThreadId);
      if (thread?.archived) await thread.setArchived(false);
      return thread;
    } catch {
      // fall through and recreate
    }
  }

  const thread = await forum.threads.create({
    name: "🟢 Live FiveM Player List",
    message: { content: "Initializing live player list..." }
  });

  forumThreadId = thread.id;

  // Use the starter message as first dashboard message
  const starter = await thread.fetchStarterMessage();
  forumMessageIds = [starter.id];

  return thread;
}

// ✅ Update a location (normal channel OR thread) with N chunks
async function updateLocationMessages(channelOrThread, messageIdsArray, chunks) {
  // Edit or send messages as needed
  for (let i = 0; i < chunks.length; i++) {
    const content = chunks[i];

    if (messageIdsArray[i]) {
      try {
        const msg = await channelOrThread.messages.fetch(messageIdsArray[i]);
        await msg.edit(content);
      } catch {
        // If fetch/edit fails (deleted, etc.), send a new one
        const newMsg = await channelOrThread.send(content);
        messageIdsArray[i] = newMsg.id;
      }
    } else {
      const newMsg = await channelOrThread.send(content);
      messageIdsArray[i] = newMsg.id;
    }
  }

  // If we have more old messages than chunks, delete extras
  if (messageIdsArray.length > chunks.length) {
    const extraIds = messageIdsArray.slice(chunks.length);
    for (const id of extraIds) {
      try {
        const msg = await channelOrThread.messages.fetch(id);
        await msg.delete();
      } catch {
        // ignore if already gone
      }
    }
    messageIdsArray.length = chunks.length; // trim array
  }
}

// ✅ Main update: fetch players, build chunks, update both locations
async function updateAll() {
  try {
    await fetchPlayers();
    const chunks = buildDashboardChunks();

    // ✅ Normal Channel
    const normalChannel = await client.channels.fetch(NORMAL_CHANNEL_ID);
    await updateLocationMessages(normalChannel, normalMessageIds, chunks);

    // ✅ Forum Thread
    const thread = await ensureForumThread();
    await updateLocationMessages(thread, forumMessageIds, chunks);

  } catch (err) {
    console.error("Update Failed:", err.message);
  }
}

// ✅ Bot Ready
client.once("ready", () => {
  console.log(`✅ Bot online as ${client.user.tag}`);
  updateAll();
  setInterval(updateAll, UPDATE_INTERVAL);
});

client.login(BOT_TOKEN);

// ✅ !players Command (Full list, auto-split plain messages)
client.on("messageCreate", async message => {
  if (message.author.bot) return;
  if (message.content.toLowerCase() !== "!players") return;

  if (!lastPlayers.length) {
    return message.reply("⚠️ Player list is not available yet.");
  }

  const time = getBDTime();
  const rows = buildPlayerRows(lastPlayers);

  const header =
`**Legacy Roleplay Bangladesh — Full Player List**
**Online:** ${lastPlayers.length}
**Last update:** ${time}

`;

  const fullText = header + rows.join("\n");

  // ✅ Auto-split into chunks under 1900 chars
  const chunks = [];
  let currentChunk = "";

  for (const line of fullText.split("\n")) {
    if ((currentChunk + line + "\n").length > 1900 && currentChunk) {
      chunks.push(currentChunk);
      currentChunk = "";
    }
    currentChunk += line + "\n";
  }

  if (currentChunk) chunks.push(currentChunk);

  for (let i = 0; i < chunks.length; i++) {
    await message.channel.send("```" + chunks[i] + "\n```");
  }
});
