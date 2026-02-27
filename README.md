# OAuth CLI

<div align="center">

![Node.js](https://img.shields.io/badge/Node.js-18+-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.7+-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![Playwright](https://img.shields.io/badge/Playwright-1.50+-2EAD33?style=for-the-badge&logo=playwright&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-blue?style=for-the-badge)

**Capture OAuth2 tokens from AI CLI tools via browser automation**

*Authenticate with OpenAI, Gemini, Claude Code, and GitHub Copilot using their real OAuth flows*

[Quick Start](#quick-start) •
[Providers](#providers) •
[How It Works](#how-it-works) •
[Configuration](#configuration)

</div>

---

## Overview

OAuth CLI opens a real browser window, lets you log in manually, and automatically captures the OAuth tokens when the provider redirects back. Tokens are saved locally for use with other tools.

**Supported providers:**
- **OpenAI** — Codex CLI OAuth tokens (access_token + id_token + refresh_token)
- **Gemini** — Google Gemini CLI OAuth tokens (access_token + refresh_token)
- **Claude Code** — Anthropic Claude Code OAuth tokens (access_token + refresh_token)
- **GitHub Copilot** — Copilot OAuth token via device flow (access_token)

---

## Quick Start

### Requirements

| Requirement | Version |
|-------------|---------|
| Node.js     | 18+     |
| Google Chrome | Any recent version |

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

The CLI **automatically discovers credentials** — no `.env` file needed for most providers. A Chrome window will open, you log in normally, and the CLI captures the redirect and saves your tokens.

#### Credential autodiscovery

The CLI resolves credentials in 3 layers, in order:

| Layer | How it works | Providers |
|-------|-------------|-----------|
| **1. Environment variable** | Checks `OPENAI_CLIENT_ID`, `GEMINI_CLIENT_ID`, etc. from `.env` or environment | All |
| **2. Upstream source fetch** | Fetches the provider's open-source CLI code from GitHub and extracts the `client_id` via regex | OpenAI, Gemini |
| **3. URL fallback** | Asks you to run the provider's login command and paste the OAuth URL that opens in the browser | Claude, Copilot |

**Example — autodiscovery (no .env needed):**
```
$ npx tsx src/index.ts openai
Fetching credentials from upstream source...
Credentials discovered automatically.
Authenticating with OpenAI (Codex CLI)...
Opening browser...
```

**Example — URL fallback (Claude, Copilot):**
```
$ npx tsx src/index.ts claude
No credentials found for claude.
Run "claude login" and paste the URL that opens in your browser:

> https://claude.ai/oauth/authorize?client_id=9d1c250a-...&scope=...
Authenticating with Claude Code...
Opening browser...
```

In the fallback case, you need to:
1. Open another terminal and run the provider's login command (e.g. `claude login`)
2. Copy the URL that opens in your browser's address bar
3. Paste it back in the CLI prompt — the `client_id` is extracted from the URL query params automatically

**Example — with .env (explicit):**
```
$ npx tsx src/index.ts openai
Authenticating with OpenAI (Codex CLI)...
Opening browser...
```

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
6. Monitor network requests via CDP (Chrome DevTools Protocol)
7. Capture the redirect URL containing the authorization code
8. Exchange code for tokens (POST to token endpoint)
9. Save tokens to ~/.mcp-oauth/tokens.json
10. Close browser
```

**For GitHub Copilot**, a simpler [device flow](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps#device-flow) is used instead — no browser automation needed. The CLI displays a code, you enter it at github.com/login/device, and the token is received via polling.

**Key technical details:**
- Uses real Chrome (`channel: "chrome"`) to avoid "browser not secure" blocks from OAuth providers
- Monitors requests via CDP `Network.requestWillBeSent` — catches redirects even when localhost isn't running
- Falls back to bundled Chromium if Chrome is not installed
- Supports both `application/x-www-form-urlencoded` and `application/json` token exchange formats
- GitHub Copilot uses OAuth 2.0 device authorization grant (no Playwright required)

---

## Token Storage

Tokens are saved to `~/.mcp-oauth/tokens.json`:

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

### Environment Variables (optional)

Credentials are **discovered automatically** for most providers (see [autodiscovery](#credential-autodiscovery) above). You only need a `.env` file if you want to pin specific values or skip the autodiscovery step.

```bash
cp .env.example .env
```

Edit `.env` with the values below. You only need to configure the providers you plan to use.

| Variable | Required For | Where to Find |
|----------|-------------|---------------|
| `OPENAI_CLIENT_ID` | OpenAI | From [Codex CLI source](https://github.com/openai/codex) — look for `client_id` in the auth flow |
| `GEMINI_CLIENT_ID` | Gemini | From [Gemini CLI source](https://github.com/google-gemini/gemini-cli) — Google OAuth "installed app" client |
| `GEMINI_CLIENT_SECRET` | Gemini | Same source — Google's convention for installed apps includes a public client_secret |
| `CLAUDE_CLIENT_ID` | Claude | From [Claude Code](https://github.com/anthropics/claude-code) — look for `client_id` in the OAuth flow |
| `COPILOT_CLIENT_ID` | GitHub Copilot | From [copilot.vim](https://github.com/github/copilot.vim) — shared across all Copilot integrations |

#### Tested values (from official CLI sources)

These are the public OAuth credentials extracted from each CLI's source code. All four were tested and confirmed working as of February 2026:

```bash
# OpenAI (Codex CLI)
OPENAI_CLIENT_ID=app_EMoamEEZ73f0CkXaXp7hrann

# Gemini CLI (Google "installed app" OAuth — client_secret is public by design)
GEMINI_CLIENT_ID=681255809395-oo8ft2oprdrnp9e3aqf6av3hmdib135j.apps.googleusercontent.com
GEMINI_CLIENT_SECRET=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

# Claude Code (Anthropic)
CLAUDE_CLIENT_ID=9d1c250a-e61b-44d9-88ed-5944d1962f5e

# GitHub Copilot (shared across copilot.vim, copilot.el, Copilot CLI, etc.)
COPILOT_CLIENT_ID=Iv1.b507a08c87ecfe98
```

> **If these values stop working**, the providers may have rotated their credentials. You can grab the updated ones by running the login command of each CLI and intercepting the auth URL:
> - **OpenAI:** `codex login` — look for `client_id` in the browser URL
> - **Gemini:** `gemini login` — look for `client_id` in the browser URL
> - **Claude:** `claude login` — look for `client_id` in the browser URL
> - **GitHub Copilot:** `gh copilot` or check [copilot.vim source](https://github.com/github/copilot.vim) for the `client_id`
>
> **Why env vars instead of hardcoded?** GitHub Push Protection blocks commits containing OAuth client secrets. Since these values may also change when CLIs update, keeping them in `.env` makes it easy to update without code changes.

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
│   └── store.ts        # Token persistence (~/.mcp-oauth/tokens.json)
├── package.json
├── tsconfig.json
└── .env.example
```

---

## Compatibility

| OS | Chrome | Status |
|----|--------|--------|
| Windows 10/11 | Any recent | Tested |
| macOS | Any recent | Should work |
| Linux | Any recent | Should work |

> **Note:** If Chrome is not installed, Playwright falls back to bundled Chromium. Some OAuth providers may block Chromium as "not a secure browser".

---

## License

MIT License - see [LICENSE](LICENSE) file.

---

## Contributing

Contributions are welcome! Please:
1. Fork the repository
2. Create a feature branch
3. Submit a pull request

---

## Support

- **Issues:** [GitHub Issues](https://github.com/JohnPitter/oauth-cli/issues)
