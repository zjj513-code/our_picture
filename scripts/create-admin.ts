import { stdin, stdout } from "node:process";
import { createInterface } from "node:readline/promises";
import { getDatabaseClient } from "@/database/client";
import { createAdminUser } from "@/lib/auth";

const username = await readUsername();
const password = await readPassword();

const client = getDatabaseClient();
try {
  const admin = await createAdminUser(username, password, client.db);
  console.log(`Created admin account: ${admin.username}`);
} finally {
  await client.pool.end();
}

async function readUsername(): Promise<string> {
  const supplied = process.argv[2] ?? process.env.ADMIN_USERNAME;
  if (supplied) return supplied;
  const terminal = createInterface({ input: stdin, output: stdout });
  try {
    return await terminal.question("Username: ");
  } finally {
    terminal.close();
  }
}

async function readPassword(): Promise<string> {
  if (process.env.ADMIN_PASSWORD) return process.env.ADMIN_PASSWORD;
  if (!stdin.isTTY || !stdin.setRawMode) {
    throw new Error(
      "Set ADMIN_PASSWORD in the environment when running without an interactive terminal.",
    );
  }

  const password = await hiddenQuestion("Password: ");
  const confirmation = await hiddenQuestion("Confirm password: ");
  if (password !== confirmation) throw new Error("Passwords do not match.");
  return password;
}

function hiddenQuestion(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    let value = "";
    stdout.write(prompt);
    stdin.setRawMode?.(true);
    stdin.resume();

    const finish = () => {
      stdin.off("data", onData);
      stdin.setRawMode?.(false);
      stdout.write("\n");
    };

    const onData = (chunk: Buffer) => {
      const input = chunk.toString("utf8");
      if (input === "\u0003") {
        finish();
        reject(new Error("Cancelled."));
        return;
      }
      if (input === "\r" || input === "\n") {
        finish();
        resolve(value);
        return;
      }
      if (input === "\u007f") {
        if (value.length > 0) {
          value = value.slice(0, -1);
          stdout.write("\b \b");
        }
        return;
      }
      value += input;
      stdout.write("*".repeat(Array.from(input).length));
    };

    stdin.on("data", onData);
  });
}
