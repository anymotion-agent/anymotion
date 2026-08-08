# Anymotion

**AI motion graphics agent and studio, in your terminal.**

Built by [Ali Usman](https://aliusman.site) — AI product builder and product manager.

Describe an animation in plain language. Anymotion plans it, writes the HTML/CSS/JS, *looks at what it built* with a headless browser, fixes what is wrong, and renders a 1080p MP4.

```
anymotion
› Build a 20-second SaaS analytics explainer, dark glass UI, teal accent
```

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

**Requirements:** Node.js 18+, and FFmpeg if you want to export video.

```bash
git clone https://github.com/anymotion/anymotion.git
cd anymotion
npm install
npm link          # makes `anymotion` available everywhere

anymotion install # creates ~/.anymotion, publishes skills, writes a config
anymotion setup   # asks for your provider, API key and model
anymotion doctor  # verifies everything is in place
```

`anymotion install` is idempotent — running it again never overwrites a config that already has a key in it.

### FFmpeg

| Platform | Command |
| --- | --- |
| Windows | `winget install Gyan.FFmpeg` |
| macOS | `brew install ffmpeg` |
| Linux | `sudo apt install ffmpeg` |

Only `anymotion render` needs it. Everything else works without it.

---

## Bring your own API key

Anymotion ships with no credentials. `anymotion setup` reads your key without echoing it and stores it in `~/.anymotion/motion.config.json`, which is outside the repo and gitignored anyway. `anymotion config` masks it on the way back out, so pasting your terminal into a bug report is safe.

Supported providers: **Anthropic**, OpenRouter, AgentRouter, OpenCode Zen, Groq, DeepSeek, Together, OpenAI, TokenRouter.

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
    style.css
    script.js
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

See [CONTRIBUTING.md](CONTRIBUTING.md). Run `npm test` before opening a PR.

---

## Author

**Ali Usman** — AI product builder and product manager. [aliusman.site](https://aliusman.site)

Anymotion started from a product question rather than a coding one: why does an agent that writes an animation never look at the animation? The rest follows from answering it — the plan-first loop, the two visual audit tools, and the deterministic `seek(t)` contract that makes reviewing a single frame possible at all.

## License and name

The code is MIT — see [LICENSE](LICENSE). Fork it, change it, ship it commercially, no permission needed. Two things sit outside that grant:

- **Attribution.** MIT asks that the copyright notice travel with any copy or substantial portion of the code. Keep [LICENSE](LICENSE) in your fork and you have satisfied it.
- **The name.** *Anymotion* is the project's name, not part of the licence — copyright and trademark are separate things. Please ship a fork under your own name rather than as Anymotion, so users can tell the two apart.

MIT © 2026 Ali Usman
