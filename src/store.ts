import { readFile, writeFile, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const STORE_DIR = join(homedir(), ".oauth-cli");
const TOKENS_FILE = join(STORE_DIR, "tokens.json");

export interface TokenData {
  provider: string;
  type: "oauth2" | "api_key";
  accessToken?: string;
  idToken?: string;
  refreshToken?: string;
  apiKey?: string;
  expiresAt?: string;
  scopes?: string[];
  tokenType?: string;
  createdAt: string;
}

export type TokenStore = Record<string, TokenData>;

async function ensureDir(): Promise<void> {
  await mkdir(STORE_DIR, { recursive: true });
}

export async function loadTokens(): Promise<TokenStore> {
  try {
    await ensureDir();
    const data = await readFile(TOKENS_FILE, "utf-8");
    return JSON.parse(data) as TokenStore;
  } catch {
    return {};
  }
}

export async function saveToken(provider: string, data: TokenData): Promise<void> {
  const store = await loadTokens();
  store[provider] = data;
  await ensureDir();
  await writeFile(TOKENS_FILE, JSON.stringify(store, null, 2), "utf-8");
}

export async function getToken(provider: string): Promise<TokenData | null> {
  const store = await loadTokens();
  return store[provider] ?? null;
}
