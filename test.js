require("dotenv").config();
const { GoogleGenerativeAI } = require("@google/generative-ai");

async function runTest() {
  // 1. ឆែកមើលថាមាន API Key នៅ?
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("❌ រកមិនឃើញ GEMINI_API_KEY ក្នុង file .env ទេ!");
    return;
  }
  console.log(`🔑 ឃើញ API Key: ${apiKey.substring(0, 5)}... (ត្រឹមត្រូវ)`);

  // 2. ភ្ជាប់ទៅ Google AI
  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    
    // ប្រើ Model 'gemini-1.5-flash' (វាដើរស្រួលជាង 2.0 សម្រាប់គណនីខ្លះ)
    const model = genAI.getGenerativeModel({ model: "gemini-3.0-flash" });

    console.log("📡 កំពុងផ្ញើទៅ Google... (Sending request...)");
    
    const prompt = "សួស្តី! តើអ្នកចេះនិយាយខ្មែរទេ? សូមឆ្លើយមកវិញខ្លីៗ។";
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    console.log("\n✅ AI ដើរហើយ! (Success):");
    console.log("------------------------------------------------");
    console.log(text);
    console.log("------------------------------------------------");

  } catch (error) {
    console.error("\n❌ AI បរាជ័យ (Error Details):");
    console.error("------------------------------------------------");
    // បង្ហាញ Error ជាក់លាក់
    if (error.message.includes("API key not valid")) {
      console.error("⚠️  API Key ខុសហើយ! សូមទៅ Copy ថ្មីពី Google AI Studio។");
    } else if (error.message.includes("404")) {
      console.error("⚠️  រក Model មិនឃើញ (Model Not Found)។ សាកដូរឈ្មោះ Model។");
    } else {
      console.error(error);
    }
    console.error("------------------------------------------------");
  }
}

runTest();