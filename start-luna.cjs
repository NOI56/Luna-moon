// 🔧 Auto Kill Port + Start Luna Script (CommonJS version)
const { exec } = require("child_process");

const PORT = 8787; // เปลี่ยนได้ตามต้องการ เช่น 8788

console.log(`🌀 Checking for existing process on port ${PORT}...`);

exec(`netstat -ano | findstr :${PORT}`, (err, stdout) => {
  if (err || !stdout) {
    console.log("✅ No existing process found. Starting Luna...");
    startLuna();
    return;
  }

  const match = stdout.match(/LISTENING\s+(\d+)/);
  if (match) {
    const pid = match[1];
    console.log(`⚠️ Found process on port ${PORT} (PID: ${pid}). Killing it...`);

    exec(`taskkill /PID ${pid} /F`, (killErr) => {
      if (killErr) {
        console.error("❌ Failed to kill process:", killErr.message);
      } else {
        console.log("✅ Old process killed successfully.");
      }
      startLuna();
    });
  } else {
    console.log("✅ No listening process found, starting Luna...");
    startLuna();
  }
});

function startLuna() {
  console.log("🚀 Launching Luna server...");
  const process = exec("npm start");

  process.stdout.on("data", (data) => console.log(data.toString()));
  process.stderr.on("data", (data) => console.error(data.toString()));
}
