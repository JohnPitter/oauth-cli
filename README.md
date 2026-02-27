# OAuth CLI

<div align="center">

![Node.js](https://img.shields.io/badge/Node.js-18+-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.7+-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![Playwright](https://img.shields.io/badge/Playwright-1.50+-2EAD33?style=for-the-badge&logo=playwright&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-blue?style=for-the-badge)

**Capture OAuth2 tokens from AI CLI tools via browser automation**

[Quick Start](#quick-start) •
[How It Works](#how-it-works) •
[Configuration](#configuration)

</div>

---

## Quick Start

### Requirements

- Node.js 18+
- Google Chrome (falls back to bundled Chromium, but some providers block it)

### Install

```bash
git clone https://github.com/JohnPitter/oauth-cli.git
cd oauth-cli
npm install
```

### Usage

```bash
npx tsx src/index.ts openai
npx tsx src/index.ts gemini
npx tsx src/index.ts claude
npx tsx src/index.ts copilot
```

No `.env` file needed — credentials are discovered automatically for OpenAI and Gemini. For Claude and Copilot, the CLI will ask you to paste a login URL (see [autodiscovery](#credential-autodiscovery)).

---

## Providers

| Provider | Auth Type | Token Lifetime | What You Get |
|----------|-----------|---------------|--------------|
| **OpenAI** | OAuth2 + PKCE | ~10 days | access_token (JWT), id_token, refresh_token |
| **Gemini** | OAuth2 + PKCE | ~1 hour | access_token (ya29...), id_token, refresh_token |
| **Claude Code** | OAuth2 + PKCE | ~8 hours | access_token (sk-ant-oat01-...), refresh_token |
| **GitHub Copilot** | Device Flow | Session | access_token (ghu_...) |

---

## How It Works

```
1. Discover credentials (env var → source fetch → URL fallback)
2. Generate PKCE code_verifier + code_challenge
3. Build OAuth authorization URL
4. Open Chrome via Playwright (headed mode)
5. User logs in manually in the browser
6. Capture the redirect via CDP (Chrome DevTools Protocol)
7. Exchange authorization code for tokens
8. Save tokens to ~/.oauth-cli/tokens.json
```

GitHub Copilot uses a [device flow](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps#device-flow) instead — the CLI displays a code, you enter it at github.com/login/device, and the token is received via polling. No browser automation needed.

### Token storage

Tokens are saved to `~/.oauth-cli/tokens.json`:

```json
{
  "openai": {
    "provider": "openai",
    "type": "oauth2",
    "accessToken": "eyJhbGciOi...",
    "idToken": "eyJhbGciOi...",
    "refreshToken": "re_...",
    "expiresAt": "2026-03-08T...",
    "tokenType": "Bearer",
    "createdAt": "2026-02-26T..."
  }
}
```

---

## Configuration

### Credential autodiscovery

The CLI resolves credentials in 3 layers, in order:

| Layer | How it works | Providers |
|-------|-------------|-----------|
| **1. Environment variable** | Checks `OPENAI_CLIENT_ID`, `GEMINI_CLIENT_ID`, etc. | All |
| **2. Upstream source fetch** | Fetches the provider's open-source CLI code from GitHub and extracts the `client_id` via regex | OpenAI, Gemini |
| **3. URL fallback** | Asks you to run the provider's login command and paste the OAuth URL | Claude, Copilot |

**Autodiscovery (OpenAI, Gemini):**
```
$ npx tsx src/index.ts openai
Fetching credentials from upstream source...
Credentials discovered automatically.
Authenticating with OpenAI (Codex CLI)...
```

**URL fallback (Claude, Copilot):**
```
$ npx tsx src/index.ts claude
No credentials found for claude.
Run "claude login" and paste the URL that opens in your browser:

> https://claude.ai/oauth/authorize?client_id=9d1c250a-...&scope=...
```

For the URL fallback: open another terminal, run the provider's login command (e.g. `claude login`), copy the URL from your browser's address bar, and paste it. The `client_id` is extracted from the query params automatically.

### Environment variables (optional)

You only need a `.env` file if you want to pin specific values or skip autodiscovery.

```bash
cp .env.example .env
```

| Variable | Provider |
|----------|----------|
| `OPENAI_CLIENT_ID` | OpenAI |
| `GEMINI_CLIENT_ID` | Gemini |
| `GEMINI_CLIENT_SECRET` | Gemini |
| `CLAUDE_CLIENT_ID` | Claude |
| `COPILOT_CLIENT_ID` | Copilot |

> **Why env vars instead of hardcoded?** GitHub Push Protection blocks commits containing OAuth client secrets. Keeping them in `.env` also makes it easy to update if providers rotate credentials.

---

## Project Structure

```
oauth-cli/
├── src/
│   ├── index.ts        # CLI entry point
│   ├── discovery.ts    # Credential autodiscovery (env → fetch → URL fallback)
│   ├── providers.ts    # Provider configs (URLs, scopes, redirect patterns)
│   ├── oauth.ts        # PKCE generation + token exchange
│   ├── browser.ts      # Playwright browser automation + CDP capture
│   └── store.ts        # Token persistence (~/.oauth-cli/tokens.json)
├── package.json
├── tsconfig.json
└── .env.example
```

---

## License

MIT License - see [LICENSE](LICENSE) file.
