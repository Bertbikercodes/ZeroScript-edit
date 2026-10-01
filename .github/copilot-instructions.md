# Copilot instructions for ZeroScript-edit

## Project overview
This repository is a fork/edited version of ZeroScript, a Chrome/Edge browser extension that connects AI chat sites to Roblox Studio through a local bridge and the official Roblox Studio MCP server. The extension is not a standard app; it is a browser extension plus a small local bridge.

Primary goals:
- keep compatibility with the supported AI providers and browser extension environment
- preserve the provider-agnostic core architecture
- avoid breaking the bridge-to-Studio communication flow
- keep changes minimal and testable

## Repository structure
- `zeroscript-extension/` — main extension code and assets
  - `core/` — shared logic (config, parser, UI, state)
  - `providers/` — site-specific adapters for DeepSeek, ChatGPT, Gemini, Kimi, GLM, Qwen, Arena, Meta AI
  - `background.js` — background script and provider URL wiring
  - `manifest.json` — Chrome/Edge extension manifest and permissions
  - `test-parser.js` and `test-chatgpt.js` — lightweight smoke tests
- `bridge.py` and `launch_studio_mcp.py` — local bridge / MCP launcher logic
- `README.md` — project-level overview and usage

## Coding expectations
- Prefer targeted changes in the exact affected provider or shared core file.
- Keep browser-extension compatibility in mind: no Node-only APIs, no unsupported DOM assumptions, and no broad refactors without need.
- Preserve the abstraction boundary: `core/*` should stay provider-agnostic; site-specific behavior belongs in `providers/*`.
- If a change affects a provider, check related URL selectors, DOM behavior, and messaging flows for that provider.
- If a change touches extension permissions or host patterns, update `manifest.json` and related provider registration logic together.
- Do not introduce heavy dependencies or large build tooling unless the repo already uses them.

## Testing
Run smoke tests from the `zeroscript-extension` directory:
- `node test-parser.js`
- `node test-chatgpt.js`

If you change parser logic or provider-specific output handling, validate those paths first.

## Safety and compatibility rules
- Do not break support for Chrome/Edge extension loading or local bridge startup.
- Do not overwrite existing provider logic without understanding the integration point.
- Keep the code compatible with Roblox Studio MCP + local bridge behavior.
- Favor small, reversible changes over large rewrites.

## Guidance for Copilot and AI contributors
When proposing or making changes, assume the codebase is a browser extension that interacts with external AI websites and Roblox Studio. Favor compatibility, correctness, and low-risk edits. Explain any provider-specific assumptions clearly in commits or PR descriptions.
