# Contributing to Anymotion

First off, thank you for considering contributing to **Anymotion**! 🚀

Anymotion is an open-source autonomous AI motion graphics engine & CLI studio built by [Ali Usman](https://aliusman.site). We welcome contributions from software engineers, motion designers, creative coders, and AI enthusiasts.

---

## 🎯 How You Can Contribute

There are many ways you can help improve Anymotion:

1. 🎨 **Add New Animation Skills (`skills/`)**
   - Create new motion skill packs (e.g., 3D CSS transforms, canvas particles, kinetic typography, Lottie integration).
   - Enhance existing skill guidance in `skills/saas-explainer-motion` or `skills/css-animations`.

2. 🛠️ **Core Agent & Tools (`src/agent/`)**
   - Add support for new LLM providers or API endpoints in `src/agent/ai-engine.js`.
   - Improve headless browser visual audit logic in `src/agent/tools/motion-tools.js` (`check_composition`, `preview_frames`).
   - Enhance sound design asset matching in `add_sfx`.

3. 💻 **CLI Studio UI (`bin/`)**
   - Refine terminal aesthetics, animations, and REPL controls in `bin/chat-ui.js` and `bin/banner.js`.
   - Add new helper CLI subcommands in `bin/motion-cli.js`.

4. 📚 **Documentation & Examples**
   - Improve guides, fix typos, or share impressive prompt examples.

---

## 🛠️ Local Development Setup

Setting up Anymotion locally for development takes under 2 minutes:

### 1. Fork & Clone
```bash
# Fork the repository on GitHub, then clone your fork:
git clone https://github.com/YOUR-USERNAME/anymotion.git
cd anymotion
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Link Executable Globally
```bash
# Links your local development folder to your global PATH
npm link
```

Now running `anymotion` anywhere in your terminal will execute your local dev codebase!

### 4. Verify Your Setup
```bash
anymotion doctor
```

---

## 🗺️ Codebase Architecture Map

Here is a quick overview of how the repository is structured:

```
anymotion-cli/
├── bin/                      # CLI Entry Scripts & Terminal UI
│   ├── motion-cli.js         # Main Commander entry point (cli flags & routing)
│   ├── chat.js               # REPL session orchestrator
│   ├── chat-ui.js            # Terminal UI renderer (colors, spinners, layout)
│   └── banner.js             # ASCII art & branding headers
├── src/                      # Core Agent Engine
│   ├── agent/
│   │   ├── ai-engine.js      # Multi-provider LLM API client (Anthropic, OpenRouter, etc.)
│   │   ├── agent-loop.js     # Autonomous Plan -> Build -> Inspect -> Fix loop
│   │   └── tools/            # Agent tool definitions (fs, web, motion, sfx, render)
│   ├── config/
│   │   └── config-manager.js # Zero-break config resolver (~/.anymotion/motion.config.json)
│   └── render/
│       └── video-renderer.js # Puppeteer + FFmpeg 1080p 60fps MP4 exporter
├── skills/                   # Prompt Engineering & Motion Skill Matrix
│   ├── saas-explainer-motion/# SaaS Liquid Glass UI & beat-sheet guidelines
│   ├── css-animations/       # 60fps GPU acceleration keyframe rules
│   ├── motion-audio/         # Sound design & frame-sync audio rules
│   └── svg-shape-morphing/   # Dynamic SVG morphing rules
└── scripts/                  # Global installer, doctor & setup wizard
    └── install.js
```

---

## 📋 Pull Request (PR) Workflow

1. **Create a Feature Branch:**
   ```bash
   git checkout -b feat/your-feature-name
   # or
   git checkout -b fix/your-bugfix-name
   ```

2. **Make Your Changes & Test:**
   - Test generating animations locally: `anymotion generate "SaaS glass UI card reveal"`
   - Test rendering MP4s: `anymotion render`
   - Run health check: `anymotion doctor`

3. **Commit & Push:**
   ```bash
   git add .
   git commit -m "feat: add support for kinetic typography skill"
   git push origin feat/your-feature-name
   ```

4. **Open a Pull Request:**
   - Head to [github.com/anymotion-agent/anymotion](https://github.com/anymotion-agent/anymotion) and click **New Pull Request**.
   - Provide a concise description of your changes and any screenshots/videos if applicable.

---

## 💬 Community & Questions

Got questions or ideas?
- Open an **Issue** or **Discussion** on GitHub: [github.com/anymotion-agent/anymotion/issues](https://github.com/anymotion-agent/anymotion/issues)
- Creator: **Ali Usman** ([aliusman.site](https://aliusman.site) • [@aliusm_n](https://twitter.com/aliusm_n))

Thank you for building the future of autonomous AI motion graphics with us! ✨
