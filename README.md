# 🧠 Project Memory

Capture and visualize the **WHY** behind your codebase. Project Memory is a VS Code extension designed to document design decisions, bug contexts, notes, and feature backgrounds directly linked to specific lines or symbols in your source code.

Stop relying on fading memories, scattered Slack threads, or outdated wiki pages. Document code architecture where it lives—right in your editor.

---

## ✨ Features

* **🧠 Contextual Code Linking**: Select any code block and record a decision, bug workaround, note, or feature background.
* **⚡ Inline Highlights**: Color-coded, non-intrusive decorations overlay directly in the editor, providing instant visibility to lines with recorded memories.
* **💬 Rich Hover Tooltips**: Hover over memory-decorated lines to view details immediately (title, description, author, creation date).
* **🔍 Actionable Comment Scanner**: Scan your workspace for comment markers like `// TODO:`, `# FIXME:`, `/* REASON: */`, and instantly promote them to official Project Memories.
* **📁 Sidebar Explorer**: A gorgeous sidebar view displaying all memories, filtering by type, searching tags, and showing active/stale status.
* **🔄 Code Drift Resilience**: Automatically detects if code has been modified or if file lines have shifted, alerting you in the sidebar when snippets have drifted out of sync.
* **📄 Markdown Export**: Export your workspace memory index as a beautifully formatted markdown report (`PROJECT_MEMORY.md`) to attach to pull requests or include in project documentation.

---

## 🚀 How to Use

### 1. Recording a Memory
* Select the code block you want to document.
* Right-click and choose **🧠 Add to Project Memory** (or press the command via the Command Palette).
* Enter a title, description, select the memory category (Decision, Bug, Note, Feature), and optionally add tags.

### 2. Viewing Memories
* **In the Editor**: Code lines with memories will be highlighted with a subtle background and a label tag (e.g. `[Decision]`, `[Bug]`). Hovering over these lines shows a detailed pop-up.
* **In the Sidebar**: Open the **Project Memory** sidebar from the Activity Bar to browse, search, and delete memories.

### 3. Scanning Comments
* Run `Project Memory: Scan Workspace Comments` to scan for actionable comment tokens (like `TODO`, `FIXME`, `BUG`, `REASON`, `NOTE`, `OPTIMIZE`).
* Promising comments will appear in the sidebar list where they can be promoted to permanent Project Memories with one click.

### 4. Exporting Reports
* Run `Project Memory: Export Memories as Markdown`.
* Choose to either copy the report to your clipboard (perfect for Pull Request descriptions) or save it directly to the root of your workspace as `PROJECT_MEMORY.md`.

---

## 🛠️ Available Commands

| Command | Title | Description |
|---|---|---|
| `project-memory.addMemory` | **🧠 Add to Project Memory** | Links selected text to a new memory. |
| `project-memory.scanComments` | **Project Memory: Scan Workspace Comments** | Scans workspace code for actionable comments. |
| `project-memory.exportMarkdown` | **Project Memory: Export Memories as Markdown** | Generates a Markdown report of all memories. |
| `project-memory.focusSidebar` | **Project Memory: Focus Sidebar** | Shows the memory explorer sidebar. |
| `project-memory.clearAll` | **Project Memory: Clear All Memories** | Clears all memories in the workspace. |

---

## 📄 License

This extension is licensed under the [MIT License](LICENSE).
