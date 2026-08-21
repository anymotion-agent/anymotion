# Anymotion

**AI motion graphics agent and studio, in your terminal.**

Built by [Ali Usman](https://aliusman.site) — AI product builder and product manager.

Describe an animation in plain language. Anymotion plans it, writes the HTML/CSS/JS, *looks at what it built* with a headless browser, fixes what is wrong, and renders a 1080p MP4.

Visit the official landing page: [anymotion.art](https://anymotion.art)

```
anymotion
› Build a 20-second SaaS analytics explainer, dark glass UI, teal accent
```

---

## What's New in v1.1.0 (Major Update)

- **🎨 Brand-Adaptive Semantic Theme Engine:** Automatically detects Dark/Light mode, extracts official brand palettes, and maps semantic color roles (`--bg-primary`, `--bg-secondary`, `--accent-primary`, `--accent-secondary`, contrast text).
- **✨ Modern Brand-Customized Cursor System:** Replaced generic retro arrows with sleek precision stealth pointers, frosted glass avatar badges (`backdrop-filter: blur(12px)`), and kinetic click ripple waves.
- **🛡️ Zero-Bug First-Pass Architecture:** Strict engineering standards that guarantee bulletproof scene isolation, 100% pure deterministic `window.seek(t)`, and centered 1920×1080 stage bounds from turn 1.
- **⚡ Interactive 60fps Playback Engine:** In-browser 60fps `requestAnimationFrame` loop, Spacebar keyboard shortcut, Play/Pause toggle, and real-time scrubber synchronization.
- **⏱️ Smart Duration Normalization:** Auto-converts millisecond/second units (e.g., `25000ms` → `25s`) and bounds clamps in the MP4 video renderer, preventing frame calculation freezes.
- **📊 Pre-Plan Action Transparency:** Live step-by-step terminal narration during website scraping, brand asset probing, craft intelligence loading, and beat-sheet choreography synthesis.

---

## Why it is not just a code agent

A general coding agent writing an animation is working blind. The HTML parses, the CSS is valid, and the result is still a card sitting on top of a headline at 3.2 seconds. Nothing in the source says so.

Anymotion gives the model eyes:

| Tool | What it does |
| --- | --- |
| `preview_frames` | Seeks to N timestamps, screenshots, hands the images back to the model |
| `check_composition` | Headless audit — console errors, element overlap, off-canvas elements, determinism |

Both drive the same Puppeteer + `window.seek(t)` contract the renderer uses, so anything that passes the audit also renders correctly.

---

## Install

**Requirements:** Node.js 18+ (and FFmpeg for MP4 video export).

### Quick Install (Recommended)

```bash
# Install globally from NPM
npm install -g @anymotion-agent/anymotion

# Or install directly from GitHub
npm install -g git+https://github.com/anymotion-agent/anymotion.git

# Or initialize directly via npx
npx @anymotion-agent/anymotion@latest init

# Run setup wizard (configures provider, API key & model)
anymotion setup
```

### Install from Source

```bash
git clone https://github.com/anymotion-agent/anymotion.git
cd anymotion
npm install
npm link          # makes `anymotion` available globally

anymotion install # initializes ~/.anymotion configuration & skills
anymotion setup   # configures provider, API key and model
anymotion doctor  # verifies environment & dependencies
```

### FFmpeg

| Platform | Command |
| --- | --- |
| Windows | `winget install Gyan.FFmpeg` |
| macOS | `brew install ffmpeg` |
| Linux | `sudo apt install ffmpeg` |

Only `anymotion render` needs it. Everything else works without it.

---

## Bring your own API key

Anymotion ships with no credentials. `anymotion setup` reads your key without echoing it and stores it in `~/.anymotion/motion.config.json`, which is outside the repo and gitignored. `anymotion config` masks it on output, so sharing your terminal is always safe.

### Supported AI Providers (22+ Ready)

Anymotion supports all major official APIs, high-speed routing gateways, and local offline models:

| Provider | Endpoint | Environment Variable | Default Model |
| --- | --- | --- | --- |
| **Anthropic** | `https://api.anthropic.com` | `ANTHROPIC_API_KEY` | `claude-3-7-sonnet-20250219` |
| **OpenRouter** | `https://openrouter.ai/api/v1` | `OPENROUTER_API_KEY` | `anthropic/claude-3.7-sonnet` |
| **AgentRouter** | `https://agentrouter.org` | `ANTHROPIC_AUTH_TOKEN` | `claude-opus-5` |
| **OpenCode Zen** | `https://opencode.ai/zen/v1` | `OPENCODE_API_KEY` | `deepseek-v4-flash-free` |
| **OpenCode Go** | `https://opencode.ai/zen/go/v1` | `OPENCODE_API_KEY` | `deepseek-v4-flash-free` |
| **TokenRouter** | `https://api.tokenrouter.com/v1` | `TOKENROUTER_API_KEY` | `gpt-4o` |
| **OpenAI** | `https://api.openai.com/v1` | `OPENAI_API_KEY` | `gpt-4o` |
| **Groq** | `https://api.groq.com/openai/v1` | `GROQ_API_KEY` | `llama-3.3-70b-versatile` |
| **DeepSeek** | `https://api.deepseek.com/v1` | `DEEPSEEK_API_KEY` | `deepseek-chat` |
| **Google Gemini** | `https://generativelanguage.googleapis.com/v1beta/openai` | `GEMINI_API_KEY` | `gemini-2.0-flash` |
| **xAI (Grok)** | `https://api.x.ai/v1` | `XAI_API_KEY` | `grok-2-latest` |
| **Kie AI** | `https://api.kie.ai/v1` | `KIE_API_KEY` | `deepseek-chat` |
| **PiAPI** | `https://api.piapi.ai/v1` | `PIAPI_API_KEY` | `gpt-4o` |
| **Together AI** | `https://api.together.xyz/v1` | `TOGETHER_API_KEY` | `meta-llama/Llama-3.3-70B-Instruct-Turbo` |
| **Mistral AI** | `https://api.mistral.ai/v1` | `MISTRAL_API_KEY` | `mistral-large-latest` |
| **Fireworks AI** | `https://api.fireworks.ai/inference/v1` | `FIREWORKS_API_KEY` | `llama-v3p3-70b-instruct` |
| **Perplexity AI** | `https://api.perplexity.ai` | `PPLX_API_KEY` | `sonar-pro` |
| **Cerebras** | `https://api.cerebras.ai/v1` | `CEREBRAS_API_KEY` | `llama-3.3-70b` |
| **SambaNova** | `https://api.sambanova.ai/v1` | `SAMBANOVA_API_KEY` | `Meta-Llama-3.3-70B-Instruct` |
| **SiliconFlow** | `https://api.siliconflow.cn/v1` | `SILICONFLOW_API_KEY` | `deepseek-ai/DeepSeek-V3` |
| **Ollama (Local)** | `http://localhost:11434/v1` | `OLLAMA_API_KEY` | `llama3.3` |
| **LM Studio (Local)** | `http://localhost:1234/v1` | `LM_STUDIO_API_KEY` | `local-model` |

You can skip the config file entirely and use the environment instead:

```bash
export ANTHROPIC_API_KEY=sk-...
anymotion
```

An environment key fills in for a placeholder but never overwrites a real saved one — see [.env.example](.env.example) for every variable.

---

## Commands

| Command | What it does |
| --- | --- |
| `anymotion` | Conversational agent REPL — the main way to use it |
| `anymotion generate "<prompt>"` | One-shot generation into a new project folder |
| `anymotion render` | Export to MP4 (`-r 720p\|1080p\|1440p\|4k`, `-f <fps>`) |
| `anymotion serve` | Web Studio Editor (Coming Soon 🚀) |
| `anymotion render` | Export to MP4 (`-r 720p\|1080p\|1440p\|4k`, `-f <fps>`) |
| `anymotion projects` | List every generated project, marking the active one |
| `anymotion config [key] [value]` | View or change settings (secrets shown masked) |
| `anymotion install` | First-run setup |
| `anymotion setup` | Provider / key / model wizard |
| `anymotion doctor` | Health check — Node, key, skills, FFmpeg, Puppeteer |
| `anymotion --version` | Print the installed version |

---

## How a project is laid out

Every generation gets its own folder, so a second request never overwrites the first:

```
~/anymotion-projects/
  saas-analytics-explainer/
    index.html        the composition
    style.css         glassmorphism & tokens
    timeline.js       seek engine & animation logic
    project.json      prompt, plan, model, timestamps
    exports/          rendered MP4s for this project only
```

The newest project becomes the active one — `serve` and `render` follow it automatically.

---

## The animation contract

Anymotion renders **deterministically**. It does not screen-record; it seeks. Every composition must expose two globals:

```js
window.DURATION = 20;        // seconds

window.seek = function (t) { // t in seconds — must be pure
  // position everything for exactly time t
};
```

Calling `seek(5)` must produce an identical frame every time, whether it is called first or last. That is what makes a 60fps export possible without dropped frames, and it is what `check_composition` verifies.

The stage is `1920×1080`, `#stage`.

---

## Web Studio Editor (Coming Soon 🚀)

The interactive Web Studio editor is currently being upgraded and will be released in an upcoming update. Currently, Anymotion outputs clean HTML5 compositions, beat-sheets, and 1080p 60fps MP4 renders directly into your project directory.


---

## Configuration

Resolution order for the config file:

1. `ANYMOTION_CONFIG` — explicit override, for CI and tests
2. `./motion.config.json` — a per-project config in the current folder
3. `~/.anymotion/motion.config.json` — the installed default

See [motion.config.example.json](motion.config.example.json) for every key.

| Key | Default | Notes |
| --- | --- | --- |
| `model` | `claude-opus-5` | |
| `provider` | `anthropic` | Picks the endpoint when `apiEndpoint` is empty |
| `thinking` | `high` | `off`, `low`, `medium`, `high`, `xhigh`, `max` |
| `defaultResolution` | `1080p` | `720p`, `1080p`, `1440p`, `4k`, or `WIDTHxHEIGHT` |
| `fps` | `60` | |
| `port` | `3000` | Live editor |
| `fileApprovalMode` | `manual` | `manual`, `auto`, `always` |

---

## Safety

The agent writes real files and can run shell commands, so both go through [src/agent/sandbox.js](src/agent/sandbox.js):

- Every path is resolved against the project root and refused if it escapes — absolute paths are rejected outright rather than silently re-rooted.
- `project.json` is managed by Anymotion and cannot be written by the model.
- Destructive shell commands are blocked *before* the approval prompt, so a mis-keyed `y` cannot authorise them: recursive deletes (POSIX and PowerShell), disk formats, raw device writes, pipe-to-shell installs, `git push`, `npm publish`, fork bombs.
- File writes default to `manual` approval.

---

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `No API key` | `anymotion setup`, or export `ANTHROPIC_API_KEY` |
| Render fails immediately | FFmpeg is not on PATH — see the install table above |
| `does not define window.seek(t)` | The composition is not seekable; ask the agent to fix it |
| Editor will not start | It is off by default — `anymotion config editorEnabled true`. If enabled, the port is in use: `anymotion serve --port 3100` |
| Anything else | `anymotion doctor` |

---

## Contributing

Anymotion is an open-source project and we welcome contributions of all kinds — from adding new motion skills and expanding LLM provider support to fixing bugs and refining the CLI UI studio.

### Quick Developer Setup

```bash
git clone https://github.com/anymotion-agent/anymotion.git
cd anymotion
npm install
npm link          # links your local development build to your global PATH

anymotion doctor  # verifies local dev setup
```

Check out our complete [CONTRIBUTING.md](CONTRIBUTING.md) for codebase architecture maps, skill matrix authoring guides, and pull request guidelines.

---

## Author

**Ali Usman** — AI product builder and product manager. [aliusman.site](https://aliusman.site)

Anymotion started from a product question rather than a coding one: why does an agent that writes an animation never look at the animation? The rest follows from answering it — the plan-first loop, the two visual audit tools, and the deterministic `seek(t)` contract that makes reviewing a single frame possible at all.

## License and name

The code is MIT — see [LICENSE](LICENSE). Fork it, change it, ship it commercially, no permission needed. Two things sit outside that grant:

- **Attribution.** MIT asks that the copyright notice travel with any copy or substantial portion of the code. Keep [LICENSE](LICENSE) in your fork and you have satisfied it.
- **The name.** *Anymotion* is the project's name, not part of the licence — copyright and trademark are separate things. Please ship a fork under your own name rather than as Anymotion, so users can tell the two apart.

MIT © 2026 Ali Usman
