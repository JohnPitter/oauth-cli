# OAuth CLI

<div align="center">

![Node.js](https://img.shields.io/badge/Node.js-18+-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.7+-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![Playwright](https://img.shields.io/badge/Playwright-1.50+-2EAD33?style=for-the-badge&logo=playwright&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-blue?style=for-the-badge)

**Capture OAuth2 tokens from AI CLI tools via browser automation**

*Authenticate with OpenAI, Gemini, and Claude Code using their real OAuth flows*

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

### Configure

Copy the example env file and fill in the credentials for the providers you want to use:

```bash
cp .env.example .env
```

Edit `.env` with the client IDs/secrets from each provider's OAuth configuration. You only need to set the variables for providers you plan to use.

### Usage

```bash
# Load env vars and authenticate with a provider
source .env  # or use dotenv, direnv, etc.
npx tsx src/index.ts openai
npx tsx src/index.ts gemini
npx tsx src/index.ts claude
```

A Chrome window will open. Log in normally. The CLI captures the redirect automatically and saves your tokens.

```
$ npx tsx src/index.ts openai
Authenticating with OpenAI (Codex CLI)...
Opening browser for OpenAI (Codex CLI) authentication...
Redirect captured!

Exchanging authorization code for tokens...
Token exchange successful.

Tokens saved for openai. Check ~/.mcp-oauth/tokens.json
```

---

## Providers

| Provider | Auth Type | Token Lifetime | What You Get |
|----------|-----------|---------------|--------------|
| **OpenAI** | OAuth2 + PKCE | ~10 days | access_token (JWT), id_token, refresh_token |
| **Gemini** | OAuth2 + PKCE | ~1 hour | access_token (ya29...), id_token, refresh_token |
| **Claude Code** | OAuth2 + PKCE | ~8 hours | access_token (sk-ant-oat01-...), refresh_token |

---

## How It Works

```
1. Generate PKCE code_verifier + code_challenge
2. Build OAuth authorization URL
3. Open Chrome via Playwright (headed mode)
4. User logs in manually in the browser
5. Monitor network requests via CDP (Chrome DevTools Protocol)
6. Capture the redirect URL containing the authorization code
7. Exchange code for tokens (POST to token endpoint)
8. Save tokens to ~/.mcp-oauth/tokens.json
9. Close browser
```

**Key technical details:**
- Uses real Chrome (`channel: "chrome"`) to avoid "browser not secure" blocks from OAuth providers
- Monitors requests via CDP `Network.requestWillBeSent` — catches redirects even when localhost isn't running
- Falls back to bundled Chromium if Chrome is not installed
- Supports both `application/x-www-form-urlencoded` and `application/json` token exchange formats

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

### Environment Variables

Set the credentials for each provider you want to use in a `.env` file:

| Variable | Required For | Description |
|----------|-------------|-------------|
| `OPENAI_CLIENT_ID` | OpenAI | OAuth client ID from OpenAI |
| `GEMINI_CLIENT_ID` | Gemini | Google OAuth client ID |
| `GEMINI_CLIENT_SECRET` | Gemini | Google OAuth client secret |
| `CLAUDE_CLIENT_ID` | Claude | Anthropic OAuth client ID |

```bash
cp .env.example .env
# Edit .env with your credentials
```

> **Note:** You only need to configure the providers you plan to use. Missing env vars will result in a clear error message when you try to use that provider.

---

## Project Structure

```
oauth-cli/
├── src/
│   ├── index.ts        # CLI entry point
│   ├── providers.ts    # Provider configs (URLs, client IDs, scopes)
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
