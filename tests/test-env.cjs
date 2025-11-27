require("dotenv").config();

console.log("OPENROUTER_KEY =", process.env.OPENROUTER_KEY ? "FOUND" : "MISSING");
console.log("ELEVEN_KEY =", process.env.ELEVEN_KEY ? `SET (length=${process.env.ELEVEN_KEY.length})` : "MISSING");
