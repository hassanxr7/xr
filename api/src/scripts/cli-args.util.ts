import { createInterface } from "readline";

export function parseFlags(argv: string[]): Record<string, string> {
  const flags: Record<string, string> = {};
  for (const arg of argv) {
    const match = /^--([^=]+)=(.*)$/.exec(arg);
    if (match) flags[match[1]] = match[2];
  }
  return flags;
}

const ENTER_CODES = new Set([10, 13]); // \n, \r
const BACKSPACE_CODES = new Set([8, 127]); // backspace, DEL
const CTRL_C_CODE = 3;

// Minimal masked-input prompt for entering a password at the terminal
// without echoing it (used only for interactive fallback; CLI flags or env
// vars are the non-interactive path for scripted/Docker use).
export async function promptHidden(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const stdin = process.stdin as NodeJS.ReadStream & { setRawMode?: (mode: boolean) => void };
    process.stdout.write(question);
    let value = "";

    const onData = (chunk: Buffer) => {
      for (const byte of chunk) {
        if (ENTER_CODES.has(byte)) {
          stdin.setRawMode?.(false);
          stdin.removeListener("data", onData);
          process.stdout.write("\n");
          rl.close();
          resolve(value);
          return;
        }
        if (byte === CTRL_C_CODE) {
          process.exit(1);
        }
        if (BACKSPACE_CODES.has(byte)) {
          value = value.slice(0, -1);
          continue;
        }
        value += String.fromCharCode(byte);
      }
    };

    stdin.setRawMode?.(true);
    stdin.resume();
    stdin.on("data", onData);
  });
}

export async function promptPlain(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}
