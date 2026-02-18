require("dotenv").config();
const { Telegraf } = require("telegraf");
const mongoose = require("mongoose"); // ប្រើ Mongoose ជំនួស fs
const { GoogleGenerativeAI } = require("@google/generative-ai");

// =====================
// SETUP & CONFIG
// =====================
const bot = new Telegraf(process.env.BOT_TOKEN);
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// ✅ ប្រើ Model 1.5 Flash (ដើម្បីឱ្យលឿន និងមានស្ថេរភាពលើ Server)
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

// =====================
// MONGODB CONNECTION 🍃
// =====================
// ភ្ជាប់ទៅកាន់ Database របស់ Railway
mongoose
  .connect(process.env.MONGO_URL)
  .then(() => console.log("✅ Connected to MongoDB! (ទិន្នន័យមានសុវត្ថិភាព)"))
  .catch((err) => console.error("❌ MongoDB Error:", err));

// បង្កើត Schema (រចនាសម្ព័ន្ធទិន្នន័យ)
const assignmentSchema = new mongoose.Schema({
  id: Number, // លេខកូដ ៤ ខ្ទង់ (ស្រួលលុប)
  title: String, // ឈ្មោះកិច្ចការ
  due: String, // ថ្ងៃផុតកំណត់
  note: String, // កំណត់ហេតុ
  chatId: Number, // លេខសម្គាល់ Group/User
  addedBy: String, // ឈ្មោះអ្នកដាក់
  createdAt: { type: Date, default: Date.now },
});

const Assignment = mongoose.model("Assignment", assignmentSchema);

// =====================
// HELPERS
// =====================
function generateId() {
  return Math.floor(1000 + Math.random() * 9000); // លេខ 4 ខ្ទង់ (1000-9999)
}

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

function parseAddUpdate(text) {
  const parts = text.split("|").map((s) => s.trim());
  return { title: parts[0] || "", due: parts[1] || "", note: parts[2] || "" };
}

function isValidDate(due) {
  return /^\d{4}-\d{2}-\d{2}$/.test(due);
}

function isPastDate(due) {
  const today = new Date().toISOString().split("T")[0];
  return due < today;
}

// =====================
// AI BRAIN 🧠
// =====================
async function askAI(message) {
  const today = new Date().toISOString().split("T")[0];

  const prompt = `
    Context: You are a funny, roasting Khmer assistant bot and act like cute girl and have some joke. Today is ${today}.
    User Input: "${message}"
    
    Instruction:
    1. Check if the user wants to add a task/assignment/homework.
    2. If YES, return JSON:
       {
         "isAssignment": true,
         "title": "Task Title",
         "due": "YYYY-MM-DD",
         "note": "Extra info",
         "reply": "Funny Khmer confirmation (roast them slightly)."
       }
    3. If NO (just chatting), return JSON:
       {
         "isAssignment": false,
         "reply": "Funny/Roasting Khmer reply."
       }
    
    IMPORTANT: Return ONLY valid JSON.
  `;

  try {
    const result = await model.generateContent(prompt);
    const response = await result.response;
    let text = response
      .text()
      .replace(/```json|```/g, "")
      .trim();
    return JSON.parse(text);
  } catch (e) {
    console.error("AI Error:", e);
    return { isAssignment: false, reply: "AI វិលមុខហើយ! សាកម្តងទៀតមើល៍!" };
  }
}

// =====================
// COMMANDS
// =====================

bot.start((ctx) => {
  ctx.reply(
    "ហាយ! ខ្ញុំជា Bot កត់ Assignment (Cloud Version ☁️) 🤖\n\n" +
      "ទិន្នន័យរបស់អ្នកត្រូវបានរក្សាទុកក្នុង Database មានសុវត្ថិភាព ១០០%!\n" +
      "ប្រើ `/add` ឬ Chat ប្រាប់ខ្ញុំក៏បាន។",
  );
});

// ADD (Manual)
bot.command("add", async (ctx) => {
  const text = ctx.message.text.replace("/add", "").trim();
  if (!text.includes("|")) {
    return ctx.reply(
      "ប្រើ AI ស្រួលជាង! Chat មកហ្មង។\nបើចង់វាយដៃ: `/add Title | YYYY-MM-DD | note`",
    );
  }

  const { title, due, note } = parseAddUpdate(text);

  if (!title || !due)
    return ctx.reply("ដាក់ឱ្យគ្រប់មកប្រូ! Title ឬ Date បាត់អស់ហើយ។");
  if (!isValidDate(due)) return ctx.reply("Format ខុស: YYYY-MM-DD");

  let extraRoast = "";
  if (isPastDate(due)) extraRoast = "\n⚠️ ហួសថ្ងៃហើយ! មាន Time Machine មែន?";

  try {
    const newItem = new Assignment({
      id: generateId(),
      title,
      due,
      note,
      chatId: ctx.chat.id,
      addedBy: ctx.from.username || ctx.from.first_name || "Unknown",
    });

    await newItem.save();

    ctx.reply(
      `✅ **បានដាក់ចូលហើយ!** (ID: \`${newItem.id}\`)\n` +
        `📚 ${title}\n📅 ${due}` +
        (note ? `\n📝 ${note}` : "") +
        `\n\n💬 ${getFunnyQuote()}` +
        extraRoast,
      { parse_mode: "Markdown" },
    );
  } catch (err) {
    console.error(err);
    ctx.reply("❌ Error Saving to Database.");
  }
});

// LIST
bot.command("list", async (ctx) => {
  try {
    // រកមើល Assignment ក្នុង Group នេះ
    const data = await Assignment.find({ chatId: ctx.chat.id }).sort({
      due: 1,
    });

    if (data.length === 0) return ctx.reply("Wow! ទំនេរស្អាត! ទៅដើរលេងទៅ។");

    const lines = data.map(
      (a, i) =>
        `${i + 1}. \`[${a.id}]\` **${a.title}** — ${a.due}${a.note ? `\n   (_${a.note}_)` : ""}`,
    );

    ctx.reply(
      "📌 **បញ្ជីទុក្ខវេទនា (Cloud Assignments):**\n\n" +
        lines.join("\n\n") +
        "\n\n_P.S. កុំទុកចោលយូរពេក!_",
      { parse_mode: "Markdown" },
    );
  } catch (err) {
    ctx.reply("❌ Database Error.");
  }
});

// DELETE
bot.command("del", async (ctx) => {
  const arg = ctx.message.text.replace("/del", "").trim();
  const id = Number(arg);

  if (!id) return ctx.reply("លុបអី? ដាក់លេខ ID មក! Ex: `/del 1234`");

  try {
    // លុបតាម ID និង ChatID (កុំឱ្យច្រឡំលុបរបស់ Group ផ្សេង)
    const result = await Assignment.findOneAndDelete({
      id: id,
      chatId: ctx.chat.id,
    });

    if (!result) return ctx.reply("❌ រកលេខ ID ហ្នឹងអត់ឃើញទេ។");

    ctx.reply(`🗑️ លុប Assignment លេខ \`${id}\` ចោលហើយ!`, {
      parse_mode: "Markdown",
    });
  } catch (err) {
    ctx.reply("❌ Error deleting.");
  }
});

// UPDATE
bot.command("update", async (ctx) => {
  const text = ctx.message.text.replace("/update", "").trim();
  const firstSpace = text.indexOf(" ");

  if (firstSpace === -1)
    return ctx.reply("Format: `/update ID Title | YYYY-MM-DD | note`");

  const id = Number(text.slice(0, firstSpace).trim());
  const rest = text.slice(firstSpace + 1).trim();

  if (!id || !rest.includes("|"))
    return ctx.reply("សរសេរឱ្យត្រូវមើល! `/update ID Title | ...`");

  const { title, due, note } = parseAddUpdate(rest);
  if (!isValidDate(due)) return ctx.reply("Date ខុសហើយ: YYYY-MM-DD");

  try {
    const updated = await Assignment.findOneAndUpdate(
      { id: id, chatId: ctx.chat.id },
      { title, due, note },
      { new: true }, // Return new data
    );

    if (!updated) return ctx.reply("❌ រក ID ហ្នឹងអត់ឃើញទេ។");

    ctx.reply(`✏️ **កែរួចរាល់!**\nឥឡូវក្លាយជា: **${title}** - ${due}`, {
      parse_mode: "Markdown",
    });
  } catch (err) {
    ctx.reply("❌ Update Error.");
  }
});

// CLEAR ALL
bot.command("clear", async (ctx) => {
  const arg = ctx.message.text.replace("/clear", "").trim();
  if (arg !== "confirm") {
    return ctx.reply(
      "⚠️ **ប្រាកដអត់?**\nវាយ `/clear confirm` ដើម្បីលុបទាំងអស់។",
      { parse_mode: "Markdown" },
    );
  }

  try {
    await Assignment.deleteMany({ chatId: ctx.chat.id });
    ctx.reply("🧹 **ស្អាតចែស!** លុបអស់ពី Database ហើយ។");
  } catch (err) {
    ctx.reply("❌ Error clearing DB.");
  }
});

// =====================
// AI HANDLE TEXT
// =====================
bot.on("text", async (ctx) => {
  if (ctx.message.text.startsWith("/")) return;

  await ctx.sendChatAction("typing");
  const aiRes = await askAI(ctx.message.text);

  if (aiRes.isAssignment) {
    try {
      // Save to MongoDB
      const newItem = new Assignment({
        id: generateId(), // បង្កើត Short ID ដាក់ចូល DB
        title: aiRes.title,
        due: aiRes.due,
        note: aiRes.note,
        addedBy: ctx.from.first_name || "AI",
        chatId: ctx.chat.id,
      });

      await newItem.save();

      ctx.reply(
        `✅ **AI បានចាប់យក Assignment!**\n` +
          `📚 ${newItem.title}\n📅 ${newItem.due}\n` +
          (newItem.note ? `📝 ${newItem.note}\n` : "") +
          `\n💬 ${aiRes.reply}`,
        { parse_mode: "Markdown" },
      );
    } catch (err) {
      console.error(err);
      ctx.reply("❌ សុំទោស! Save ចូល Database អត់បាន។");
    }
  } else {
    ctx.reply(aiRes.reply);
  }
});

// =====================
// LAUNCH
// =====================
(async () => {
  // លុប Webhook ចាស់ចោលការពារ Error 409
  await bot.telegram.deleteWebhook({ drop_pending_updates: true });

  bot.launch();
  console.log("🚀 Bot is running with MongoDB & Gemini 1.5 Flash...");
})();

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
