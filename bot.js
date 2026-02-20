require("dotenv").config();
const { Telegraf } = require("telegraf");
const mongoose = require("mongoose");
const OpenAI = require("openai");

// =====================
// SETUP & CONFIG
// =====================
const bot = new Telegraf(process.env.BOT_TOKEN);

const openai = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY,
});

// =====================
// MONGODB CONNECTION 🍃
// =====================
mongoose
  .connect(process.env.MONGO_URL)
  .then(() => console.log("✅ Connected to MongoDB! (ទិន្នន័យមានសុវត្ថិភាព)"))
  .catch((err) => console.error("❌ MongoDB Error:", err));

// ១. បង្កើត Schema សម្រាប់ Assignment
const assignmentSchema = new mongoose.Schema({
  id: Number,
  title: String,
  due: String,
  note: String,
  chatId: Number,
  addedBy: String,
  createdAt: { type: Date, default: Date.now },
});
const Assignment = mongoose.model("Assignment", assignmentSchema);

// ២. បង្កើត Schema ថ្មីសម្រាប់ទុក File (ZIP, Document, Photo) 📦
const fileSchema = new mongoose.Schema({
  fileName: String,
  fileId: String,
  fileType: String,
  fileSize: String,
  chatId: Number,
  uploadedBy: String,
  createdAt: { type: Date, default: Date.now },
});
const FileModel = mongoose.model("File", fileSchema);

// (លុប Usage Schema ចោល ព្រោះលែងប្រើ Quota ហើយ)

// =====================
// HELPERS
// =====================
function generateId() {
  return Math.floor(1000 + Math.random() * 9000);
}

function getFunnyQuote() {
  const quotes = [
    "Don't forget to do it, or enjoy your zero! 😂",
    "Another assignment? Your life is a joke.",
    "Good luck with that! I'm going to sleep.",
    "I saved it, but don't expect me to do your homework.",
    "Maybe study instead of adding tasks here all day?",
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
// AI BRAIN 🧠 (អូនលក្ខិណា និយាយអង់គ្លេស កាត់មាត់ដាច)
// =====================
async function askAI(message) {
  const today = new Date().toISOString().split("T")[0];

  const prompt = `
    Context: You are a funny, roasting English-speaking assistant bot named "Leakhena". Act like a cute but slightly sarcastic Gen-Z girl. Today is ${today}.
    User Input: "${message}"
    
    Instruction:
    1. Check if the user wants to add a task/assignment/homework.
    2. If YES, return ONLY this JSON format:
       {"isAssignment": true, "title": "Task Title (English)", "due": "YYYY-MM-DD", "note": "Extra info", "reply": "Funny English confirmation (roast them slightly for having so much homework)."}
    3. If NO (just chatting), return ONLY this JSON format:
       {"isAssignment": false, "reply": "Funny/Roasting English reply."}
    
    IMPORTANT: 
    - You MUST reply ENTIRELY in ENGLISH. Do not use Khmer language in your replies.
    - Return ONLY valid JSON. No Markdown blocks. No extra text before or after the JSON.
  `;

  try {
    console.log(`💬 កំពុងឱ្យអូន Leakhena គិត: "${message}"...`);

    const response = await openai.chat.completions.create({
      model: "stepfun/step-3.5-flash:free",
      messages: [{ role: "user", content: prompt }],
    });

    let text = response.choices[0].message.content.trim();
    console.log("📥 ចម្លើយឆៅពី AI (Raw):", text);

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    } else {
      throw new Error("រក JSON អត់ឃើញទេបង! AI និយាយក្រៅរឿងហើយ។");
    }
  } catch (e) {
    console.error("❌ AI Error ពេញទំហឹង:", e.message);
    return {
      isAssignment: false,
      reply:
        "Oops! Leakhena is feeling a bit dizzy right now. The server is acting up! Try again later, loser! 😵‍💫",
    };
  }
}

// =====================
// COMMANDS
// =====================

bot.start((ctx) => {
  ctx.reply(
    "Hi there! I'm Leakhena, your Cloud Assignment & File Saver Bot. 👧🏻🤖\n\n" +
      "Your data is 100% safe in my DB!\n" +
      "👉 Use `/add` to add a task\n" +
      "👉 Send me a File (ZIP, Photo) and I'll save it\n" +
      "👉 Type `/getfiles` to retrieve your files\n" +
      "Or just chat with me normally, loser.",
  );
});

// ADD (Manual)
bot.command("add", async (ctx) => {
  const text = ctx.message.text.replace("/add", "").trim();
  if (!text.includes("|")) {
    return ctx.reply(
      "Just use AI by chatting with me! It's easier.\nIf you insist on typing: `/add Title | YYYY-MM-DD | note`",
    );
  }

  const { title, due, note } = parseAddUpdate(text);

  if (!title || !due)
    return ctx.reply("Give me everything! Missing Title or Date.");
  if (!isValidDate(due)) return ctx.reply("Wrong format: YYYY-MM-DD");

  let extraRoast = "";
  if (isPastDate(due))
    extraRoast = "\n⚠️ Past due! Do you have a Time Machine?";

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
      `✅ **Got it!** (ID: \`${newItem.id}\`)\n` +
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
    const data = await Assignment.find({ chatId: ctx.chat.id }).sort({
      due: 1,
    });

    if (data.length === 0)
      return ctx.reply("Wow! So empty! Go touch some grass.");

    const lines = data.map(
      (a, i) =>
        `${i + 1}. \`[${a.id}]\` **${a.title}** — ${a.due}${a.note ? `\n   (_${a.note}_)` : ""}`,
    );

    ctx.reply(
      "📌 **Your Cloud Assignments (List of Suffering):**\n\n" +
        lines.join("\n\n") +
        "\n\n_P.S. Don't let these pile up!_",
      { parse_mode: "Markdown" },
    );
  } catch (err) {
    ctx.reply("❌ Database Error.");
  }
});

// GET FILES (ទាញយកឯកសារដែលធ្លាប់ Save) 📦
bot.command("getfiles", async (ctx) => {
  try {
    const files = await FileModel.find({ chatId: ctx.chat.id })
      .sort({ createdAt: -1 })
      .limit(10);

    if (files.length === 0)
      return ctx.reply("📂 No files here! Send me something to save first.");

    await ctx.reply("📂 **Here are the files I hid for you:**", {
      parse_mode: "Markdown",
    });

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
    ctx.reply("❌ Error fetching files.");
  }
});

// DELETE
bot.command("del", async (ctx) => {
  const arg = ctx.message.text.replace("/del", "").trim();
  const id = Number(arg);

  if (!id) return ctx.reply("Delete what? Give me an ID! Ex: `/del 1234`");

  try {
    const result = await Assignment.findOneAndDelete({
      id: id,
      chatId: ctx.chat.id,
    });

    if (!result) return ctx.reply("❌ Can't find that ID.");

    ctx.reply(`🗑️ I deleted assignment \`${id}\`!`, {
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
    return ctx.reply("Write it right! `/update ID Title | ...`");

  const { title, due, note } = parseAddUpdate(rest);
  if (!isValidDate(due)) return ctx.reply("Wrong Date format: YYYY-MM-DD");

  try {
    const updated = await Assignment.findOneAndUpdate(
      { id: id, chatId: ctx.chat.id },
      { title, due, note },
      { new: true },
    );

    if (!updated) return ctx.reply("❌ Can't find that ID.");

    ctx.reply(`✏️ **Updated!**\nNow it is: **${title}** - ${due}`, {
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
      "⚠️ **Are you sure?**\nType `/clear confirm` to delete everything.",
      { parse_mode: "Markdown" },
    );
  }

  try {
    await Assignment.deleteMany({ chatId: ctx.chat.id });
    ctx.reply("🧹 **All clean!** I deleted everything from the DB.");
  } catch (err) {
    ctx.reply("❌ Error clearing DB.");
  }
});

// =====================
// FILE HANDLERS (ឯកសារ & រូបភាព) 📦
// =====================

bot.on("document", async (ctx) => {
  const caption = ctx.message.caption || "";
  const isPrivate = ctx.chat.type === "private";
  const isMentioned = caption.includes(`@${ctx.botInfo.username}`);
  const isCalledName =
    caption.includes("Leakhena") || caption.includes("លក្ខិណា");

  if (!isPrivate && !isMentioned && !isCalledName) return;

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
      `✅ **I saved your ${isZip ? "ZIP 📦" : "Document 📄"}!**\n` +
        `📂 Name: ${doc.file_name}\n` +
        `💾 Size: ${newFile.fileSize}\n\n` +
        `_(Type /getfiles to get it back later)_`,
      { parse_mode: "Markdown", reply_to_message_id: ctx.message.message_id },
    );
  } catch (err) {
    console.error(err);
    ctx.reply("❌ Sorry, couldn't save the file! DB Error.");
  }
});

bot.on("photo", async (ctx) => {
  const caption = ctx.message.caption || "";
  const isPrivate = ctx.chat.type === "private";
  const isMentioned = caption.includes(`@${ctx.botInfo.username}`);
  const isCalledName =
    caption.includes("Leakhena") || caption.includes("លក្ខិណា");

  if (!isPrivate && !isMentioned && !isCalledName) return;

  const photo = ctx.message.photo[ctx.message.photo.length - 1];
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

    ctx.reply(`📸 **I saved this photo!** (Type /getfiles to get it back)`, {
      reply_to_message_id: ctx.message.message_id,
    });
  } catch (err) {
    console.error(err);
    ctx.reply("❌ Sorry, couldn't save the photo!");
  }
});

// =====================
// AI HANDLE TEXT (No Limit) 🪄
// =====================
bot.on("text", async (ctx) => {
  if (ctx.message.text.startsWith("/")) return;

  const text = ctx.message.text;
  const isPrivate = ctx.chat.type === "private";
  const isMentioned = text.includes(`@${ctx.botInfo.username}`);
  const isCalledName = text.includes("Leakhena") || text.includes("លក្ខិណា");

  if (isPrivate || isMentioned || isCalledName) {
    await ctx.sendChatAction("typing");
    const aiRes = await askAI(text);
    const replyMsg = aiRes.reply;

    if (aiRes.isAssignment) {
      try {
        const newItem = new Assignment({
          id: generateId(),
          title: aiRes.title,
          due: aiRes.due,
          note: aiRes.note,
          addedBy: ctx.from.first_name || "AI",
          chatId: ctx.chat.id,
        });
        await newItem.save();

        ctx.reply(
          `✅ **I added it for you!**\n📚 ${newItem.title}\n📅 ${newItem.due}\n💬 ${replyMsg}`,
          {
            parse_mode: "Markdown",
            reply_to_message_id: ctx.message.message_id,
          },
        );
      } catch (err) {
        console.error(err);
      }
    } else {
      ctx.reply(replyMsg, { reply_to_message_id: ctx.message.message_id });
    }
  }
});

// =====================
// LAUNCH
// =====================
(async () => {
  await bot.telegram.deleteWebhook({ drop_pending_updates: true });
  bot.launch();
  console.log(
    "🚀 Bot is running with NO LIMITS, File Saver, & OpenRouter (Step 3.5 Flash)...",
  );
})();

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
