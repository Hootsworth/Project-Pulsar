# Intents - Chrome New Tab Extension

Replace your Chrome new tab page with **Intents** - a minimal, distraction-free search experience.

## 🚀 Installation

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable **Developer mode** (toggle in the top-right corner)
3. Click **Load unpacked**
4. Select this `chrome-extension` folder
5. The extension will ask for permission - click **Allow**
6. Open a new tab to see Intents!

## ✨ Features

### Search
- Clean, minimal search interface
- Multiple search engines (Google, DuckDuckGo, Bing, Brave)
- Intent-based curated results (Learn, Fix, Build, Chill)
- Recent searches with autocomplete
- Empty results failsafe - redirects to your default search engine

### Customization
- Quick links for your favorite sites

- Customizable theme (Dark/Light) with Stoic design language
- Time-based greeting (Good morning/afternoon/evening)

### 🎯 Intent Mode (NEW!)
Transform any webpage into a clean, focused reading experience optimized for thinking.

**How to use:**
1. Navigate to any article or webpage
2. **Right-click** anywhere on the page
3. Select **🎯 Intent Mode**
4. Choose your intent:
   - 📖 **Read** - Comfortable reading with warm tones
   - 📚 **Learn** - Structured layout with table of contents
   - 🔧 **Fix** - Code-focused with emphasized code blocks
   - 📝 **Study** - Academic style with note-taking affordances
   - 🪞 **Reflect** - Extra calm with minimal UI

**Features:**
- 📊 Reading progress bar
- ⏱️ Estimated reading time
- 📑 Auto-generated table of contents (for Learn/Fix/Study)
- 🔤 Adjustable font size (A+ / A-)
- ⌨️ Full keyboard navigation
- 🎨 Intent-specific color themes

**Note:** Intent Mode respects your attention. It does not track, does not inject ads, and fails silently if content cannot be confidently extracted.

### 💭 Hold That Thought
Save interesting snippets from any webpage for later!

**How to use:**
1. **Select text** on any webpage
2. **Right-click** → Choose "💭 Hold That Thought"
   - OR press **Alt+T** (keyboard shortcut)
3. **Choose options:**
   - 🏷️ Tag: Read Later, Idea, Note, Important, Reference, Question
   - 🎨 Color: Yellow, Green, Blue, Purple, Pink, Orange
   - ⚡ Importance: Low, Medium, High
   - 📝 Context: Add your own notes
4. Click **Save Thought**

**View your thoughts:**
- Click the 💭 button in the top-left corner of the new tab page
- Opens a sidebar with all your saved thoughts
- Click any thought to visit the original page
- Delete thoughts you no longer need

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `/` | Focus search box |
| `1-4` | Select intent (Learn/Fix/Build/Chill) |
| `Esc` | Close modals/panels or exit Intent Mode |
| `Alt+T` | Hold That Thought (on any page) |

### Intent Mode Shortcuts
| Shortcut | Action |
|----------|--------|
| `Esc` | Exit Intent Mode |
| `↑` / `↓` | Scroll smoothly |
| `T` | Toggle table of contents |
| `Ctrl++` / `Ctrl+-` | Adjust font size |

## 🔄 Updating

To get the latest features:
1. Pull/download the latest files
2. Go to `chrome://extensions/`
3. Click the refresh icon on the Intents extension card

## 🗑️ Uninstalling

1. Go to `chrome://extensions/`
2. Find "Intents New Tab" and click **Remove**

## 📝 Version History

- **v4.0.0** - Added "Intent Mode" for focused reading with 5 intent types
- **v3.0.0** - Added "Hold That Thought" feature with context menu, popup, and thoughts panel
- **v2.1.0** - Bundled files locally with CORS permissions for reliable API access
- **v2.0.0** - Added AI Taskbar, subtle mode, empty results failsafe, QoL improvements

