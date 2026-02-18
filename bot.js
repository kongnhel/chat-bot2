require("dotenv").config();
const { Telegraf } = require("telegraf");
const fs = require("fs");
const { GoogleGenerativeAI } = require("@google/generative-ai");

// Init Bot & Gemini
const bot = new Telegraf(process.env.BOT_TOKEN);
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
// ប្រើ Model flash ដើម្បីឱ្យលឿននិងចំណាយតិច
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

// =====================
// Simple JSON storage
// =====================
const DB_FILE = "./assignments.json";

function load() {
  try {
    if (!fs.existsSync(DB_FILE)) return [];
    const raw = fs.readFileSync(DB_FILE, "utf8");
    if (!raw.trim()) return [];
    return JSON.parse(raw);
  } catch (err) {
    console.error("❌ Failed to load DB:", err);
    return [];
  }
}

function save(data) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error("❌ Failed to save DB:", err);
  }
}

// Helper: Generate Short ID (4 digits)
function generateId() {
  return Math.floor(1000 + Math.random() * 9000);
}

// Helper: Random funny quote (សម្រាប់ Manual Add)
function getFunnyQuote() {
  const quotes = [
    "កុំភ្លេចធ្វើផង ប្រយ័ត្នសូន្យ!",
    "ដាក់ទៀតហើយ? ជីវិតពិតជាកំសត់មែន។",
    "Su su! តែបើខ្ជិល ដេកទៅ។",
    "អូខេ ចាំខ្ញុំទុកឱ្យ តែមិនជួយធ្វើទេណា។",
    "រៀនមិនរៀន ដាក់តែ Assignment ពេញហ្នឹង!",
  ];
  return quotes[Math.floor(Math.random() * quotes.length)];
}

// Helper: parse "Title | YYYY-MM-DD | note"
function parseAddUpdate(text) {
  const parts = text.split("|").map((s) => s.trim());
  const title = parts[0] || "";
  const due = parts[1] || "";
  const note = parts[2] || "";
  return { title, due, note };
}

// Helper: validate date
function isValidDate(due) {
  return /^\d{4}-\d{2}-\d{2}$/.test(due);
}

// Check if date is in the past
function isPastDate(due) {
  const today = new Date().toISOString().split("T")[0];
  return due < today;
}

// =====================
// AI BRAIN 🧠 (The New Part)
// =====================
async function askAI(message) {
  const today = new Date().toISOString().split("T")[0];
  
  // Prompt នេះប្រាប់ AI ឱ្យធ្វើជាអ្នកចាប់ Assignment និងជាអ្នកឌឺ
  const prompt = `
    You are a funny Khmer assistant bot. Today is ${today}.
    The user sent: "${message}"
    
    TASK:
    1. If the user is trying to add an assignment/homework/task, extract the data into this JSON format:
    {
      "isAssignment": true,
      "title": "Subject/Title (in Khmer or English)",
      "due": "YYYY-MM-DD",
      "note": "Any extra info or context",
      "reply": "A funny Khmer response confirming it was added (roast them a little)."
    }
    - Convert relative dates (e.g., "next friday", "tomorrow", "ស្អែក", "ខានស្អែក") to YYYY-MM-DD based on today (${today}).
    - If no specific date is mentioned, set "due" to tomorrow's date.
    
    2. If it is NOT an assignment (just chatting, greeting, or asking questions), return this JSON:
    {
      "isAssignment": false,
      "reply": "A funny/roasting Khmer response to the user's message."
    }

    IMPORTANT: Return ONLY raw JSON. Do not use Markdown formatting like \`\`\`json.
  `;

  try {
    const result = await model.generateContent(prompt);
    const response = await result.response;
    // Clean up if AI adds markdown backticks
    const text = response.text().replace(/```json|```/g, "").trim(); 
    return JSON.parse(text);
  } catch (e) {
    console.error("AI Error:", e);
    return { isAssignment: false, reply: "AI គាំងហើយប្រូ! ខួរក្បាល Load អត់ទាន់... សាកម្តងទៀតមើល៍?" };
  }
}

// =====================
// Commands
// =====================

bot.start((ctx) => {
  ctx.reply(
    "ហាយ! នេះគឺជា Bot កត់ Assignment ឆ្លាតវៃ (AI Powered) 🤖🧠\n\n" +
      "អ្នកអាច Chat ធម្មតាដាក់ខ្ញុំបាន មិនបាច់ចាំ Command ទេ!\n" +
      "Ex: 'ស្អែកមានកិច្ចការផ្ទះគណិត' ឬ 'អាទិត្យក្រោយប្រឡង History'\n\n" +
      "ឬប្រើ Command ចាស់ក៏បាន:\n" +
      "👉 `/add` : ដាក់ Assignment (Manual)\n" +
      "👉 `/list` : មើលទុក្ខវេទនា (Assignment)\n" +
      "👉 `/del ID` : លុបចោល\n" +
      "👉 `/update` : កែប្រែ\n" +
      "👉 `/clear` : លុបទាំងអស់"
  );
});

// ADD (Manual)
bot.command("add", (ctx) => {
  const text = ctx.message.text.replace("/add", "").trim();
  if (!text.includes("|")) {
    return ctx.reply("ប្រើ AI ស្រួលជាងប្រូ! គ្រាន់តែ Chat មក។\nបើចង់ប្រើ Command វាយ: `/add Title | YYYY-MM-DD | note`");
  }

  const { title, due, note } = parseAddUpdate(text);

  if (!title || !due) {
    return ctx.reply("ដាក់ឱ្យគ្រប់មកប្រូ! Title ឬ ថ្ងៃខែ បាត់ទៅណាអស់ហើយ?");
  }

  if (!isValidDate(due)) {
    return ctx.reply("Format ថ្ងៃខែខុសហើយ: YYYY-MM-DD");
  }

  let extraRoast = "";
  if (isPastDate(due)) {
    extraRoast = "\n⚠️ ថ្ងៃហ្នឹងវាហួសហើយ! មាន Time Machine ជិះមែន? តែដាក់ឱ្យក៏បានដែរ...";
  }

  const data = load();
  const item = {
    id: generateId(),
    title,
    due,
    note,
    addedBy: ctx.from.username || ctx.from.first_name || "Unknown",
    chatId: ctx.chat.id,
    createdAt: new Date().toISOString(),
  };

  data.push(item);
  save(data);

  ctx.reply(
    `✅ **បានដាក់ចូលហើយ!** (ID: \`${item.id}\`)\n` +
      `📚 មុខវិជ្ជា: ${title}\n` +
      `📅 ថ្ងៃផុតកំណត់: ${due}` +
      (note ? `\n📝 Note: ${note}` : "") +
      `\n\n💬 ${getFunnyQuote()}` + 
      extraRoast,
      { parse_mode: "Markdown" }
  );
});

// LIST
bot.command("list", (ctx) => {
  const data = load().filter((x) => x.chatId === ctx.chat.id);

  if (data.length === 0) return ctx.reply("Wow! អត់មាន Assignment ទេ? ឬកុហក? 🤔\nទៅដេកទៅចឹង!");

  const lines = data
    .sort((a, b) => a.due.localeCompare(b.due))
    .map(
      (a, i) =>
        `${i + 1}. \`[${a.id}]\` **${a.title}** — ${a.due}${a.note ? `\n   (_${a.note}_)` : ""}`
    );

  ctx.reply(
    "📌 **បញ្ជីទុក្ខវេទនារបស់អ្នក (Assignments):**\n\n" + lines.join("\n\n") + 
    "\n\n_P.S. មើលហើយប្រញាប់ធ្វើផង កុំទុកចោល!_",
    { parse_mode: "Markdown" }
  );
});

// DELETE
bot.command("del", (ctx) => {
  const arg = ctx.message.text.replace("/del", "").trim();
  const id = Number(arg);

  if (!id) return ctx.reply("លុបអី? ដាក់លេខ ID មកផង! Ex: `/del 1234`");

  const data = load();
  const before = data.length;

  const filtered = data.filter((x) => !(x.chatId === ctx.chat.id && x.id === id));
  if (filtered.length === before) return ctx.reply("❌ រកលេខ ID ហ្នឹងអត់ឃើញទេ។");

  save(filtered);
  ctx.reply(`🗑️ លុប Assignment លេខ \`${id}\` ចោលហើយ! \n(សង្ឃឹមថាធ្វើហើយចុះ កុំចេះតែលុបគេចវេស)។`, { parse_mode: "Markdown" });
});

// UPDATE
bot.command("update", (ctx) => {
  const text = ctx.message.text.replace("/update", "").trim();
  const firstSpace = text.indexOf(" ");
  
  if (firstSpace === -1) {
    return ctx.reply("Format ខុស: `/update ID Title | YYYY-MM-DD | note`");
  }

  const idPart = text.slice(0, firstSpace).trim();
  const rest = text.slice(firstSpace + 1).trim();
  const id = Number(idPart);

  if (!id) return ctx.reply("ID ខុសហើយ! រកមើលក្នុង /list សិនទៅ។");
  if (!rest.includes("|")) return ctx.reply("ភ្លេចដាក់សញ្ញា | ហើយប្រូ!");

  const { title, due, note } = parseAddUpdate(rest);
  if (!isValidDate(due)) return ctx.reply("កាលបរិច្ឆេទខុសទៀតហើយ! YYYY-MM-DD");

  const data = load();
  const idx = data.findIndex((x) => x.chatId === ctx.chat.id && x.id === id);

  if (idx === -1) return ctx.reply("❌ រក ID ហ្នឹងអត់ឃើញទេ។");

  data[idx] = {
    ...data[idx],
    title,
    due,
    note,
    updatedAt: new Date().toISOString(),
  };

  save(data);
  ctx.reply(`✏️ **កែរួចរាល់!** (ID: \`${id}\`)\nឥឡូវក្លាយជា: **${title}** - ${due}`, { parse_mode: "Markdown" });
});

// DELETE ALL
bot.command("clear", (ctx) => {
  const arg = ctx.message.text.replace("/clear", "").trim();
  if (arg !== "confirm") {
    return ctx.reply("⚠️ **ប្រាកដចិត្តអត់?**\nវាយ `/clear confirm` ដើម្បីលុបទាំងអស់។", { parse_mode: "Markdown" });
  }
  const data = load();
  const filtered = data.filter((x) => x.chatId !== ctx.chat.id);
  save(filtered);
  ctx.reply("🧹 **ស្អាតចែស!** លុបអស់ហើយ។");
});

// =====================
// AI HANDLE TEXT (Magic Happens Here) 🪄
// =====================
bot.on("text", async (ctx) => {
  // Ignore commands starting with / so they don't trigger AI
  if (ctx.message.text.startsWith("/")) return;

  // Show "Typing..." action
  await ctx.sendChatAction("typing");

  // Call Gemini AI
  const aiRes = await askAI(ctx.message.text);

  if (aiRes.isAssignment) {
    // Save to DB automatically
    const data = load();
    const item = {
      id: generateId(),
      title: aiRes.title,
      due: aiRes.due,
      note: aiRes.note,
      addedBy: ctx.from.first_name || "AI Buddy",
      chatId: ctx.chat.id,
      createdAt: new Date().toISOString(),
    };

    data.push(item);
    save(data);

    // Reply with confirmation + AI roast
    ctx.reply(
      `✅ **AI បានចាប់យក Assignment!**\n` +
      `📚 ${item.title}\n📅 ${item.due}\n` +
      (item.note ? `📝 ${item.note}\n` : "") +
      `\n💬 ${aiRes.reply}`, 
      { parse_mode: "Markdown" }
    );
  } else {
    // Just Chatting (Roast/Fun)
    ctx.reply(aiRes.reply);
  }
});

// =====================
// Launch
// =====================
(async () => {
  await bot.telegram.deleteWebhook({ drop_pending_updates: true });
  await bot.launch();
  console.log("Bot (With AI 🧠) is running...");
})();

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));