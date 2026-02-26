export interface OAuthProviderConfig {
  name: string;
  displayName: string;
  type: "oauth2";
  clientId: string;
  clientSecret?: string;
  authorizationUrl: string;
  tokenUrl: string;
  tokenContentType?: "json" | "form";
  redirectUri: string;
  redirectPattern: RegExp;
  scopes: string;
  extraParams?: Record<string, string>;
}

export interface DeviceFlowProviderConfig {
  name: string;
  displayName: string;
  type: "device_flow";
  clientId: string;
  deviceCodeUrl: string;
  tokenUrl: string;
  scopes: string;
  headers?: Record<string, string>;
}

export interface ApiKeyProviderConfig {
  name: string;
  displayName: string;
  type: "api_key";
  instruction: string;
}

export type ProviderConfig = OAuthProviderConfig | DeviceFlowProviderConfig | ApiKeyProviderConfig;

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing environment variable: ${key}\nSet it in a .env file or export it before running.`);
  }
  return value;
}

interface ProviderFactory {
  displayName: string;
  build: () => ProviderConfig;
}

const PROVIDER_FACTORIES: Record<string, ProviderFactory> = {
  openai: {
    displayName: "OpenAI (Codex CLI)",
    build: () => ({
      name: "openai",
      displayName: "OpenAI (Codex CLI)",
      type: "oauth2",
      clientId: requireEnv("OPENAI_CLIENT_ID"),
      authorizationUrl: "https://auth.openai.com/oauth/authorize",
      tokenUrl: "https://auth.openai.com/oauth/token",
      redirectUri: "http://localhost:1455/auth/callback",
      redirectPattern: /localhost:1455\//,
      scopes: "openid profile email offline_access",
      extraParams: {
        id_token_add_organizations: "true",
        codex_cli_simplified_flow: "true",
      },
    }),
  },
  gemini: {
    displayName: "Gemini CLI",
    build: () => ({
      name: "gemini",
      displayName: "Gemini CLI",
      type: "oauth2",
      clientId: requireEnv("GEMINI_CLIENT_ID"),
      clientSecret: requireEnv("GEMINI_CLIENT_SECRET"),
      authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenUrl: "https://oauth2.googleapis.com/token",
      redirectUri: "http://127.0.0.1:14355/oauth2callback",
      redirectPattern: /^http:\/\/127\.0\.0\.1:\d+\/oauth2callback/,
      scopes: "https://www.googleapis.com/auth/cloud-platform https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile",
      extraParams: {
        access_type: "offline",
      },
    }),
  },
  copilot: {
    displayName: "GitHub Copilot",
    build: () => ({
      name: "copilot",
      displayName: "GitHub Copilot",
      type: "device_flow" as const,
      clientId: requireEnv("COPILOT_CLIENT_ID"),
      deviceCodeUrl: "https://github.com/login/device/code",
      tokenUrl: "https://github.com/login/oauth/access_token",
      scopes: "read:user",
      headers: {
        "editor-version": "Neovim/0.6.1",
        "editor-plugin-version": "copilot.vim/1.16.0",
        "user-agent": "GithubCopilot/1.155.0",
      },
    }),
  },
  claude: {
    displayName: "Claude Code",
    build: () => ({
      name: "claude",
      displayName: "Claude Code",
      type: "oauth2",
      clientId: requireEnv("CLAUDE_CLIENT_ID"),
      authorizationUrl: "https://claude.ai/oauth/authorize",
      tokenUrl: "https://console.anthropic.com/v1/oauth/token",
      tokenContentType: "json" as const,
      redirectUri: "https://platform.claude.com/oauth/code/callback",
      redirectPattern: /^https:\/\/platform\.claude\.com\/oauth\/code\/callback\?/,
      scopes: "org:create_api_key user:profile user:inference user:sessions:claude_code user:mcp_servers",
      extraParams: {
        code: "true",
      },
    }),
  },
};

export function getProvider(name: string): ProviderConfig | undefined {
  const factory = PROVIDER_FACTORIES[name.toLowerCase()];
  if (!factory) return undefined;
  return factory.build();
}

export function listProviderNames(): string[] {
  return Object.keys(PROVIDER_FACTORIES);
}
