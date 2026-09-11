const { GoogleGenerativeAI } = require("@google/generative-ai");
require('dotenv').config({ path: '.env' });

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ 
  model: "gemini-flash-latest", 
  generationConfig: { responseMimeType: "application/json", temperature: 0.2 },
  systemInstruction: `Você é DARCY...
Formato de Saída:
{
  "mensagem": "string",
  "diagnostico": { "coerencia": 100, "completude": 100, "pontosFortes": ["string"] }
}`
});

async function run() {
  const prompt = `Gere o Resumo Acadêmico final consolidado juntando as seções aprovadas:
Contexto: A linguagem...
Objetivo: Analisar...
Metodologia: Estudo qualitativo...
Fundamentação Teórica: Sociolinguística...
Resultados: O fenômeno...

Aja como DARCY. Retorne apenas o texto coeso do resumo final no campo 'mensagem'.`;

  const result = await model.generateContent(prompt);
  console.log(result.response.text());
}
run();
