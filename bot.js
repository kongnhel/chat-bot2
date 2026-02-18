require("dotenv").config();
const { Telegraf } = require("telegraf");
const fs = require("fs");

const bot = new Telegraf(process.env.BOT_TOKEN);

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

// Helper: parse "Title | YYYY-MM-DD | note"
function parseAddUpdate(text) {
  const parts = text.split("|").map((s) => s.trim());
  const title = parts[0] || "";
  const due = parts[1] || "";
  const note = parts[2] || "";
  return { title, due, note };
}

// Helper: validate date (simple)
function isValidDate(due) {
  return /^\d{4}-\d{2}-\d{2}$/.test(due);
}

// =====================
// Commands
// =====================

bot.start((ctx) => {
  ctx.reply(
    "Hi! Commands:\n" +
      "/add Title | YYYY-MM-DD | note(optional)\n" +
      "/list\n" +
      "/del ID\n" +
      "/update ID Title | YYYY-MM-DD | note(optional)\n\n" +
      "Example:\n" +
      "/add Math HW | 2026-02-18 | for next week"
  );
});

// ADD
bot.command("add", (ctx) => {
  const text = ctx.message.text.replace("/add", "").trim();
  if (!text.includes("|")) {
    return ctx.reply("Format: /add Title | YYYY-MM-DD | note(optional)");
  }

  const { title, due, note } = parseAddUpdate(text);

  if (!title || !due) {
    return ctx.reply("Missing title or due date.\nFormat: /add Title | YYYY-MM-DD | note(optional)");
  }

  if (!isValidDate(due)) {
    return ctx.reply("Invalid date. Use format YYYY-MM-DD (example: 2026-02-18)");
  }

  const data = load();
  const item = {
    id: Date.now(), // simple unique id
    title,
    due,
    note,
    addedBy: ctx.from.username || ctx.from.first_name || "unknown",
    chatId: ctx.chat.id,
    createdAt: new Date().toISOString(),
  };

  data.push(item);
  save(data);

  ctx.reply(
    `✅ Added (ID: ${item.id}):\n` +
      `• ${title}\n` +
      `• Due: ${due}` +
      (note ? `\n• Note: ${note}` : "")
  );
});

// LIST
bot.command("list", (ctx) => {
  const data = load().filter((x) => x.chatId === ctx.chat.id);

  if (data.length === 0) return ctx.reply("No assignments yet. Add one with /add");

  const lines = data
    .sort((a, b) => a.due.localeCompare(b.due))
    .map(
      (a, i) =>
        `${i + 1}) [${a.id}] ${a.title} — ${a.due}${a.note ? ` (${a.note})` : ""}`
    );

  ctx.reply("📌 Assignments:\n" + lines.join("\n"));
});

// DELETE
bot.command("del", (ctx) => {
  const arg = ctx.message.text.replace("/del", "").trim();
  const id = Number(arg);

  if (!id) return ctx.reply("Format: /del ID\nExample: /del 1700000000000");

  const data = load();
  const before = data.length;

  const filtered = data.filter((x) => !(x.chatId === ctx.chat.id && x.id === id));
  if (filtered.length === before) return ctx.reply("❌ ID not found in this group.");

  save(filtered);
  ctx.reply(`🗑️ Deleted assignment with ID: ${id}`);
});

// UPDATE
bot.command("update", (ctx) => {
  const text = ctx.message.text.replace("/update", "").trim();

  // Expected: "ID Title | YYYY-MM-DD | note"
  const firstSpace = text.indexOf(" ");
  if (firstSpace === -1) {
    return ctx.reply("Format: /update ID Title | YYYY-MM-DD | note(optional)");
  }

  const idPart = text.slice(0, firstSpace).trim();
  const rest = text.slice(firstSpace + 1).trim();
  const id = Number(idPart);

  if (!id) return ctx.reply("Invalid ID.\nFormat: /update ID Title | YYYY-MM-DD | note(optional)");
  if (!rest.includes("|")) return ctx.reply("Format: /update ID Title | YYYY-MM-DD | note(optional)");

  const { title, due, note } = parseAddUpdate(rest);

  if (!title || !due) {
    return ctx.reply("Missing title or due date.\nFormat: /update ID Title | YYYY-MM-DD | note(optional)");
  }

  if (!isValidDate(due)) {
    return ctx.reply("Invalid date. Use format YYYY-MM-DD (example: 2026-02-18)");
  }

  const data = load();
  const idx = data.findIndex((x) => x.chatId === ctx.chat.id && x.id === id);

  if (idx === -1) return ctx.reply("❌ ID not found in this group.");

  data[idx] = {
    ...data[idx],
    title,
    due,
    note,
    updatedAt: new Date().toISOString(),
  };

  save(data);

  ctx.reply(
    `✏️ Updated (ID: ${id}):\n` +
      `• ${title}\n` +
      `• Due: ${due}` +
      (note ? `\n• Note: ${note}` : "")
  );
});
// DELETE ALL (with confirmation)
bot.command("clear", (ctx) => {
  const arg = ctx.message.text.replace("/clear", "").trim();

  if (arg !== "confirm") {
    return ctx.reply(
      "⚠️ This will delete ALL assignments in this group.\n\n" +
      "If you are sure, type:\n" +
      "/clear confirm"
    );
  }

  const data = load();
  const filtered = data.filter((x) => x.chatId !== ctx.chat.id);

  save(filtered);

  ctx.reply("🧹 All assignments for this group have been deleted.");
});

// =====================
// Launch (fix webhook + clean shutdown)
// =====================
(async () => {
  // Prevent webhook + polling conflicts, and drop old queued updates
  await bot.telegram.deleteWebhook({ drop_pending_updates: true });
  await bot.launch();
  console.log("Bot is running...");
})();

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
