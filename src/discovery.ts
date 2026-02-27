import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";

export interface Credentials {
  clientId: string;
  clientSecret?: string;
}

interface SourceConfig {
  url: string;
  patterns: {
    clientId: RegExp;
    clientSecret?: RegExp;
  };
}

interface DiscoveryEntry {
  envKeys: { clientId: string; clientSecret?: string };
  source?: SourceConfig;
  fallbackHint: string;
}

const DISCOVERY_CONFIG: Record<string, DiscoveryEntry> = {
  openai: {
    envKeys: { clientId: "OPENAI_CLIENT_ID" },
    source: {
      url: "https://raw.githubusercontent.com/openai/codex/main/codex-rs/core/src/auth.rs",
      patterns: {
        clientId: /CLIENT_ID:\s*&str\s*=\s*"([^"]+)"/,
      },
    },
    fallbackHint: 'Run "codex login" and paste the URL that opens in your browser',
  },
  gemini: {
    envKeys: { clientId: "GEMINI_CLIENT_ID", clientSecret: "GEMINI_CLIENT_SECRET" },
    source: {
      url: "https://raw.githubusercontent.com/google-gemini/gemini-cli/main/packages/core/src/code_assist/oauth2.ts",
      patterns: {
        clientId: /OAUTH_CLIENT_ID\s*=\s*'([^']+)'/,
        clientSecret: /OAUTH_CLIENT_SECRET\s*=\s*'([^']+)'/,
      },
    },
    fallbackHint: 'Run "gemini login" and paste the URL that opens in your browser',
  },
  claude: {
    envKeys: { clientId: "CLAUDE_CLIENT_ID" },
    fallbackHint: 'Run "claude login" and paste the URL that opens in your browser',
  },
  copilot: {
    envKeys: { clientId: "COPILOT_CLIENT_ID" },
    fallbackHint: 'Run "gh copilot" and paste the OAuth URL, or check copilot.vim source',
  },
};

function fromEnv(entry: DiscoveryEntry): Credentials | null {
  const clientId = process.env[entry.envKeys.clientId];
  if (!clientId) return null;

  const clientSecret = entry.envKeys.clientSecret
    ? process.env[entry.envKeys.clientSecret]
    : undefined;

  return { clientId, clientSecret };
}

async function fromSource(source: SourceConfig): Promise<Credentials | null> {
  try {
    const response = await fetch(source.url, {
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return null;

    const text = await response.text();

    const clientIdMatch = text.match(source.patterns.clientId);
    if (!clientIdMatch?.[1]) return null;

    let clientSecret: string | undefined;
    if (source.patterns.clientSecret) {
      const secretMatch = text.match(source.patterns.clientSecret);
      clientSecret = secretMatch?.[1];
    }

    return { clientId: clientIdMatch[1], clientSecret };
  } catch {
    return null;
  }
}

function fromUrl(rawUrl: string): Credentials | null {
  try {
    const url = new URL(rawUrl.trim());
    const clientId = url.searchParams.get("client_id");
    if (!clientId) return null;
    return { clientId };
  } catch {
    return null;
  }
}

export async function resolveCredentials(providerName: string): Promise<Credentials> {
  const entry = DISCOVERY_CONFIG[providerName.toLowerCase()];
  if (!entry) {
    throw new Error(`No discovery config for provider: ${providerName}`);
  }

  // Layer 1: env vars
  const envCreds = fromEnv(entry);
  if (envCreds) {
    return envCreds;
  }

  // Layer 2: fetch from source
  if (entry.source) {
    console.log("Fetching credentials from upstream source...");
    const sourceCreds = await fromSource(entry.source);
    if (sourceCreds) {
      console.log("Credentials discovered automatically.");
      return sourceCreds;
    }
    console.log("Could not fetch credentials from source.");
  }

  // Layer 3: ask user for OAuth URL
  console.log(`\nNo credentials found for ${providerName}.`);
  console.log(`${entry.fallbackHint}:\n`);

  const rl = createInterface({ input: stdin, output: stdout });
  const rawUrl = await rl.question("> ");
  rl.close();

  const urlCreds = fromUrl(rawUrl);
  if (!urlCreds) {
    throw new Error("Could not extract client_id from the URL provided.");
  }

  return urlCreds;
}
