const { GoogleGenerativeAI } = require("@google/generative-ai");
require('dotenv').config({ path: 'c:/Users/caike/Documents/Escrita com Ciência/Darcy/darcy-backend/.env' });

async function run() {
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${process.env.GEMINI_API_KEY}`);
  const data = await response.json();
  data.models.forEach(m => console.log(m.name));
}
run();
