require("dotenv").config();
const OpenAI = require("openai"); // ប្តូរមកប្រើ OpenAI Library វិញ

async function runTest() {
  // 1. ឆែកមើលថាមាន API Key នៅ? (ឥឡូវយើងប្រើ OPENROUTER_API_KEY វិញ)
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    console.error("❌ រកមិនឃើញ OPENROUTER_API_KEY ក្នុង file .env ទេបងអើយ!");
    return;
  }
  console.log(`🔑 ឃើញ API Key: ${apiKey.substring(0, 12)}... (មានសង្ឃឹមហើយបង)`);

  // 2. ភ្ជាប់ទៅ OpenRouter
  try {
    const openai = new OpenAI({
      baseURL: "https://openrouter.ai/api/v1",
      apiKey: apiKey,
    });

    console.log("📡 កំពុងហៅទៅកាន់ Step 3.5 Flash... (រង់ចាំបន្តិចបង!)...");
    
    // ប្រើ Model របស់ OpenRouter
    const response = await openai.chat.completions.create({
      model: "stepfun/step-3.5-flash:free", 
      messages: [
        { role: "user", content: "សួស្តី! តើអ្នកចេះនិយាយខ្មែរទេ? សូមឆ្លើយមកវិញខ្លីៗកំប្លែងៗមើល៍។" }
      ]
    });

    // ចាប់យកចម្លើយចេញមកក្រៅ
    const text = response.choices[0].message.content;

    console.log("\n✅ AI ដើរហើយបងអើយ! (Success):");
    console.log("------------------------------------------------");
    console.log(text);
    console.log("------------------------------------------------");

  } catch (error) {
    console.error("\n❌ AI បរាជ័យ (Error Details):");
    console.error("------------------------------------------------");
    // បង្ហាញ Error ជាក់លាក់របស់ OpenRouter
    if (error.status === 401) {
      console.error("⚠️ API Key ខុសហើយបង! ទៅ Copy ថ្មីពីវេបសាយ OpenRouter មកដាក់ម្ដងទៀត។");
    } else if (error.status === 429) {
      console.error("⚠️ Error 429: ជាប់ Rate Limit ហើយ! គេកំពុងដណ្តើមគ្នាប្រើរបស់ហ្វ្រី ចាំផឹកទឹកមួយកែវសិនចាំ Run ម្ដងទៀត។");
    } else if (error.status === 404) {
      console.error("⚠️ រក Model មិនឃើញទេ។ ឆែកមើលឈ្មោះ Model (stepfun/step-3.5-flash:free) មើល៍សរសេរត្រូវអត់។");
    } else {
      console.error("បញ្ហាផ្សេងៗ:", error.message || error);
    }
    console.error("------------------------------------------------");
  }
}

runTest();