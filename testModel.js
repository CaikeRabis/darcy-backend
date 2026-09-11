const { GoogleGenerativeAI } = require("@google/generative-ai");
require('dotenv').config({ path: 'c:/Users/caike/Documents/Escrita com Ciência/Darcy/darcy-backend/.env' });

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-3.5-flash-lite" });

async function run() {
  try {
    const result = await model.generateContent("Hello, what is your model name?");
    console.log(result.response.text());
  } catch (error) {
    console.error(error.message);
  }
}
run();
