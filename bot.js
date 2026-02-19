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

// ១. បង្កើត Schema សម្រាប់ Assignment
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

// ២. បង្កើត Schema ថ្មីសម្រាប់ទុក File (ZIP, Document, Photo) 📦
const fileSchema = new mongoose.Schema({
  fileName: String,
  fileId: String, // Telegram Cloud File ID
  fileType: String,
  fileSize: String,
  chatId: Number,
  uploadedBy: String,
  createdAt: { type: Date, default: Date.now },
});

const FileModel = mongoose.model("File", fileSchema);

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
    "អូខេ ចាំអូនទុកឱ្យ តែមិនជួយធ្វើទេណា។",
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
    Context: You are a funny,Your name is លក្ខិណា, roasting Khmer assistant bot and act like cute girl and have some joke. Today is ${today}.
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
    return {
      isAssignment: false,
      reply: "អូនលក្ខិណា វិលមុខហើយ! សាកម្តងទៀតមើល៍បង!",
    };
  }
}

// =====================
// COMMANDS
// =====================

bot.start((ctx) => {
  ctx.reply(
    "ហាយបង! អូនឈ្មោះ លក្ខិណា ជាកូន Bot កត់ Assignment និងទុក File ឱ្យបង (Cloud Version ☁️) 👧🏻🤖\n\n" +
      "ទិន្នន័យរបស់អ្នកត្រូវបានរក្សាទុកក្នុង Database មានសុវត្ថិភាព ១០០%!\n" +
      "👉 ប្រើ `/add` ដើម្បីកត់កិច្ចការ\n" +
      "👉 ផ្ញើ File (ZIP, រូបភាព) មក អូន Save ទុកឱ្យ\n" +
      "👉 វាយ `/getfiles` ដើម្បីយក File មកវិញ\n" +
      "ឬ Chat ប្រាប់អូនធម្មតាក៏បានចា៎។",
  );
});

// ADD (Manual)
bot.command("add", async (ctx) => {
  const text = ctx.message.text.replace("/add", "").trim();
  if (!text.includes("|")) {
    return ctx.reply(
      "ប្រើ AI ស្រួលជាងបង! Chat មកអូនហ្មងមក។\nបើចង់វាយដៃ: `/add Title | YYYY-MM-DD | note`",
    );
  }

  const { title, due, note } = parseAddUpdate(text);

  if (!title || !due)
    return ctx.reply("ដាក់ឱ្យគ្រប់មកបង! Title ឬ Date បាត់អស់ហើយ។");
  if (!isValidDate(due)) return ctx.reply("Format ខុសហើយ: YYYY-MM-DD");

  let extraRoast = "";
  if (isPastDate(due)) extraRoast = "\n⚠️ ហួសថ្ងៃហើយ! មាន Time Machine មែនបង?";

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
      `✅ **អូនដាក់ចូលហើយចា៎!** (ID: \`${newItem.id}\`)\n` +
        `📚 ${title}\n📅 ${due}` +
        (note ? `\n📝 ${note}` : "") +
        `\n\n💬 ${getFunnyQuote()}` +
        extraRoast,
      { parse_mode: "Markdown" },
    );
  } catch (err) {
    console.error(err);
    ctx.reply("❌ Error Saving to Database ចា៎។");
  }
});

// LIST
bot.command("list", async (ctx) => {
  try {
    const data = await Assignment.find({ chatId: ctx.chat.id }).sort({
      due: 1,
    });

    if (data.length === 0) return ctx.reply("Wow! ទំនេរស្អាត! ទៅដើរលេងទៅបង។");

    const lines = data.map(
      (a, i) =>
        `${i + 1}. \`[${a.id}]\` **${a.title}** — ${a.due}${a.note ? `\n   (_${a.note}_)` : ""}`,
    );

    ctx.reply(
      "📌 **បញ្ជីទុក្ខវេទនា (Cloud Assignments):**\n\n" +
        lines.join("\n\n") +
        "\n\n_P.S. កុំទុកចោលយូរពេកណា៎!_",
      { parse_mode: "Markdown" },
    );
  } catch (err) {
    ctx.reply("❌ Database Error.");
  }
});

// GET FILES (ទាញយកឯកសារដែលធ្លាប់ Save) 📦
bot.command("getfiles", async (ctx) => {
  try {
    // យក File ចុងក្រោយចំនួន ១០ មកបង្ហាញ
    const files = await FileModel.find({ chatId: ctx.chat.id })
      .sort({ createdAt: -1 })
      .limit(10);

    if (files.length === 0)
      return ctx.reply("📂 អត់មាន File អីសោះចា៎! ផ្ញើចូលមកចាំអូនទុកឱ្យ។");

    await ctx.reply("📂 **នេះជា File ដែលអូនលក្ខិណាបានលាក់ទុកឱ្យ៖**", {
      parse_mode: "Markdown",
    });

    // បញ្ជូន File ត្រឡប់ទៅ User វិញម្តងមួយៗ
    for (const f of files) {
      if (f.fileType.includes("image")) {
        await ctx.telegram.sendPhoto(ctx.chat.id, f.fileId, {
          caption: `📸 ${f.fileName} (${f.fileSize})`,
        });
      } else {
        await ctx.telegram.sendDocument(ctx.chat.id, f.fileId, {
          caption: `📄 ${f.fileName} (${f.fileSize})`,
        });
      }
    }
  } catch (err) {
    console.error(err);
    ctx.reply("❌ Error ទាញយក File ចា៎។");
  }
});

// DELETE
bot.command("del", async (ctx) => {
  const arg = ctx.message.text.replace("/del", "").trim();
  const id = Number(arg);

  if (!id) return ctx.reply("លុបអី? ដាក់លេខ ID មក! Ex: `/del 1234`");

  try {
    const result = await Assignment.findOneAndDelete({
      id: id,
      chatId: ctx.chat.id,
    });

    if (!result) return ctx.reply("❌ រកលេខ ID ហ្នឹងអត់ឃើញទេចា៎។");

    ctx.reply(`🗑️ លក្ខិណាលុប Assignment លេខ \`${id}\` ចោលហើយ!`, {
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
    return ctx.reply("សរសេរឱ្យត្រូវមើលបង! `/update ID Title | ...`");

  const { title, due, note } = parseAddUpdate(rest);
  if (!isValidDate(due)) return ctx.reply("Date ខុសហើយចា៎: YYYY-MM-DD");

  try {
    const updated = await Assignment.findOneAndUpdate(
      { id: id, chatId: ctx.chat.id },
      { title, due, note },
      { new: true },
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
      "⚠️ **ប្រាកដអត់បង?**\nវាយ `/clear confirm` ដើម្បីលុបទាំងអស់។",
      { parse_mode: "Markdown" },
    );
  }

  try {
    await Assignment.deleteMany({ chatId: ctx.chat.id });
    // ចុះបើចង់លុប File ចោលទាំងអស់ដែរ អាចដោះ Comment ខាងក្រោម:
    // await FileModel.deleteMany({ chatId: ctx.chat.id });
    ctx.reply("🧹 **ស្អាតចែស!** អូនលុបអស់ពី Database ហើយ។");
  } catch (err) {
    ctx.reply("❌ Error clearing DB.");
  }
});

// =====================
// FILE HANDLERS (ឯកសារ & រូបភាព) 📦
// =====================

// ចាប់យកឯកសារ (ZIP, PDF, Word...)
bot.on("document", async (ctx) => {
  const doc = ctx.message.document;
  const isZip =
    doc.mime_type === "application/zip" || doc.file_name.endsWith(".zip");

  try {
    const newFile = new FileModel({
      fileName: doc.file_name,
      fileId: doc.file_id,
      fileType: doc.mime_type || "unknown",
      fileSize: (doc.file_size / 1024 / 1024).toFixed(2) + " MB",
      chatId: ctx.chat.id,
      uploadedBy: ctx.from.first_name || "Unknown",
    });

    await newFile.save();

    ctx.reply(
      `✅ **អូនលក្ខិណា Save ${isZip ? "ZIP 📦" : "ឯកសារ 📄"} ទុកឱ្យហើយចា៎!**\n` +
        `📂 ឈ្មោះ: ${doc.file_name}\n` +
        `💾 ទំហំ: ${newFile.fileSize}\n\n` +
        `_(វាយ /getfiles ដើម្បីឱ្យអូនទាញយកវាមកវិញពេលក្រោយ)_`,
      { parse_mode: "Markdown" },
    );
  } catch (err) {
    console.error(err);
    ctx.reply("❌ សុំទោសបង អូន Save File អត់បានទេ! Database Error.");
  }
});

// ចាប់យករូបភាព (Photos)
bot.on("photo", async (ctx) => {
  const photo = ctx.message.photo[ctx.message.photo.length - 1]; // យករូបធំជាងគេ
  try {
    const newFile = new FileModel({
      fileName: `Photo_${Date.now()}.jpg`,
      fileId: photo.file_id,
      fileType: "image/jpeg",
      fileSize: (photo.file_size / 1024 / 1024).toFixed(2) + " MB",
      chatId: ctx.chat.id,
      uploadedBy: ctx.from.first_name || "Unknown",
    });

    await newFile.save();

    ctx.reply(
      `📸 **អូន Save រូបភាពនេះទុកឱ្យហើយចា៎!** (វាយ /getfiles ដើម្បីទាញយកវិញ)`,
    );
  } catch (err) {
    console.error(err);
    ctx.reply("❌ សុំទោសបង អូន Save រូបភាពអត់បានទេ!");
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
        `✅ **អូនលក្ខិណា បានកត់ Assignment ឱ្យហើយ!**\n` +
          `📚 ${newItem.title}\n📅 ${newItem.due}\n` +
          (newItem.note ? `📝 ${newItem.note}\n` : "") +
          `\n💬 ${aiRes.reply}`,
        { parse_mode: "Markdown" },
      );
    } catch (err) {
      console.error(err);
      ctx.reply("❌ សុំទោស! Save ចូល Database អត់បានចា៎។");
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
  console.log(
    "🚀 Bot is running with MongoDB, File Saver, & Gemini 2.5 Flash...",
  );
})();

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
