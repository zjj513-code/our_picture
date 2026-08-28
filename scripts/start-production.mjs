import { spawn } from "node:child_process";

const migration = spawn(process.execPath, ["scripts/migrate-production.mjs"], {
  stdio: "inherit",
});
const migrationExitCode = await new Promise((resolve, reject) => {
  migration.once("error", reject);
  migration.once("exit", resolve);
});

if (migrationExitCode !== 0) {
  process.exit(typeof migrationExitCode === "number" ? migrationExitCode : 1);
}

const server = spawn(process.execPath, ["server.js"], {
  stdio: "inherit",
  env: process.env,
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.kill(signal));
}

server.once("error", (error) => {
  console.error(error);
  process.exit(1);
});
server.once("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
