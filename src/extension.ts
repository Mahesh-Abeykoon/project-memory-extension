import * as vscode from 'vscode';
import { MemoryStore } from './memoryStore';
import { SidebarProvider } from './sidebarProvider';
import { MemoryType } from './types';

// Global decoration types for memory categories
let decorationTypes: Record<string, vscode.TextEditorDecorationType> = {};

export function activate(context: vscode.ExtensionContext) {
  console.log('Project Memory extension is now active!');

  const memoryStore = new MemoryStore();
  const sidebarProvider = new SidebarProvider(context.extensionUri, memoryStore);

  // Initialize decoration rendering options
  initializeDecorationTypes();

  // Register Webview Sidebar
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      SidebarProvider.viewType,
      sidebarProvider
    )
  );

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand('project-memory.addMemory', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showErrorMessage('Open a file first to link a memory to code.');
        return;
      }

      const selection = editor.selection;
      const lineStart = selection.start.line + 1;
      const lineEnd = selection.end.line + 1;
      const filePath = editor.document.fileName;
      const selectedText = editor.document.getText(selection);

      // Step 1: Get Title
      const title = await vscode.window.showInputBox({
        prompt: 'Enter memory title (e.g., Why Redis was added for checkout)',
        placeHolder: 'Why X was implemented...',
        validateInput: (value) => value.trim() ? null : 'Title is required'
      });
      if (!title) {return;}

      // Step 2: Get Description
      const description = await vscode.window.showInputBox({
        prompt: 'Enter detailed reasoning/context',
        placeHolder: 'We used Redis because...',
        validateInput: (value) => value.trim() ? null : 'Description is required'
      });
      if (!description) {return;}

      // Step 3: Select Type
      const typeSelection = await vscode.window.showQuickPick(
        [
          { label: 'Decision 🧠', value: 'decision', description: 'Architectural or design choices' },
          { label: 'Bug 🐞', value: 'bug', description: 'Context regarding a past bug or workarounds' },
          { label: 'Note 📝', value: 'note', description: 'General notes, warnings, or explanations' },
          { label: 'Feature 🌟', value: 'feature', description: 'Feature implementation background' }
        ],
        {
          placeHolder: 'Select the memory type'
        }
      );
      if (!typeSelection) {return;}

      // Save memory
      const result = memoryStore.addMemory(
        title,
        description,
        typeSelection.value as MemoryType,
        filePath,
        lineStart,
        lineEnd,
        selectedText
      );

      if (result) {
        vscode.window.showInformationMessage(`Memory "${title}" saved successfully!`);
        sidebarProvider.sendMemories();
        updateDecorations(editor, memoryStore);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('project-memory.clearAll', async () => {
      const confirm = await vscode.window.showWarningMessage(
        'Are you sure you want to delete ALL memories in this workspace? This cannot be undone.',
        'Yes',
        'No'
      );
      if (confirm === 'Yes') {
        memoryStore.clearAll();
        sidebarProvider.sendMemories();
        triggerUpdateDecorations(memoryStore);
        vscode.window.showInformationMessage('All project memories cleared.');
      }
    })
  );

  // Command to force refresh decorations from webview operations
  context.subscriptions.push(
    vscode.commands.registerCommand('project-memory.refreshDecorations', () => {
      triggerUpdateDecorations(memoryStore);
    })
  );

  // Command to focus/reveal the sidebar panel
  context.subscriptions.push(
    vscode.commands.registerCommand('project-memory.focusSidebar', () => {
      vscode.commands.executeCommand('workbench.view.extension.project-memory');
    })
  );

  // Editor events
  vscode.window.onDidChangeActiveTextEditor(editor => {
    if (editor) {
      updateDecorations(editor, memoryStore);
    }
  }, null, context.subscriptions);

  vscode.workspace.onDidChangeTextDocument(event => {
    const editor = vscode.window.activeTextEditor;
    if (editor && event.document === editor.document) {
      updateDecorations(editor, memoryStore);
    }
  }, null, context.subscriptions);

  // Initial decoration run
  triggerUpdateDecorations(memoryStore);

  // Register CodeLens Provider
  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider(
      { scheme: 'file' },
      new MemoryCodeLensProvider(memoryStore)
    )
  );

  // Register Hover Provider
  context.subscriptions.push(
    vscode.languages.registerHoverProvider(
      { scheme: 'file' },
      new MemoryHoverProvider(memoryStore)
    )
  );
}

function initializeDecorationTypes() {
  decorationTypes = {
    decision: vscode.window.createTextEditorDecorationType({
      backgroundColor: 'rgba(138, 43, 226, 0.06)',
      isWholeLine: true,
      overviewRulerColor: 'rgba(138, 43, 226, 0.7)',
      overviewRulerLane: vscode.OverviewRulerLane.Right,
      after: {
        contentText: '  🧠 [Decision]',
        color: 'rgba(138, 43, 226, 0.55)',
        fontStyle: 'italic',
        margin: '0 0 0 1em'
      }
    }),
    bug: vscode.window.createTextEditorDecorationType({
      backgroundColor: 'rgba(220, 38, 38, 0.06)',
      isWholeLine: true,
      overviewRulerColor: 'rgba(220, 38, 38, 0.7)',
      overviewRulerLane: vscode.OverviewRulerLane.Right,
      after: {
        contentText: '  🐞 [Bug]',
        color: 'rgba(220, 38, 38, 0.55)',
        fontStyle: 'italic',
        margin: '0 0 0 1em'
      }
    }),
    note: vscode.window.createTextEditorDecorationType({
      backgroundColor: 'rgba(59, 130, 246, 0.06)',
      isWholeLine: true,
      overviewRulerColor: 'rgba(59, 130, 246, 0.7)',
      overviewRulerLane: vscode.OverviewRulerLane.Right,
      after: {
        contentText: '  📝 [Note]',
        color: 'rgba(59, 130, 246, 0.55)',
        fontStyle: 'italic',
        margin: '0 0 0 1em'
      }
    }),
    feature: vscode.window.createTextEditorDecorationType({
      backgroundColor: 'rgba(16, 185, 129, 0.06)',
      isWholeLine: true,
      overviewRulerColor: 'rgba(16, 185, 129, 0.7)',
      overviewRulerLane: vscode.OverviewRulerLane.Right,
      after: {
        contentText: '  🌟 [Feature]',
        color: 'rgba(16, 185, 129, 0.55)',
        fontStyle: 'italic',
        margin: '0 0 0 1em'
      }
    })
  };
}

function updateDecorations(editor: vscode.TextEditor, memoryStore: MemoryStore) {
  if (!editor) {return;}

  const filePath = editor.document.fileName;
  const links = memoryStore.getLinksForFile(filePath);

  const decorationRanges: Record<string, vscode.DecorationOptions[]> = {
    decision: [],
    bug: [],
    note: [],
    feature: []
  };

  for (const link of links) {
    const memory = memoryStore.getMemoryById(link.memory_id);
    if (!memory) {continue;}

    const docLineCount = editor.document.lineCount;
    // Bounds checking
    const lineStart = Math.min(docLineCount, Math.max(1, link.line_start)) - 1;
    const lineEnd = Math.min(docLineCount, Math.max(1, link.line_end)) - 1;

    const range = new vscode.Range(
      new vscode.Position(lineStart, 0),
      new vscode.Position(lineEnd, 999)
    );

    const type = memory.type as string;
    if (decorationRanges[type]) {
      decorationRanges[type].push({
        range,
        hoverMessage: new vscode.MarkdownString(
          `### 🧠 Project Memory: **${memory.title}** [_${memory.type.toUpperCase()}_]\n\n` +
          `> ${memory.description}\n\n` +
          `*Created by **${memory.created_by}** on ${new Date(memory.created_at).toLocaleDateString()}*`
        )
      });
    }
  }

  // Apply decorations
  Object.keys(decorationTypes).forEach(key => {
    editor.setDecorations(decorationTypes[key], decorationRanges[key] || []);
  });
}

function triggerUpdateDecorations(memoryStore: MemoryStore) {
  const visibleEditors = vscode.window.visibleTextEditors;
  for (const editor of visibleEditors) {
    updateDecorations(editor, memoryStore);
  }
}

/**
 * CodeLens Provider to show indicators above memory-linked ranges.
 */
class MemoryCodeLensProvider implements vscode.CodeLensProvider {
  constructor(private readonly memoryStore: MemoryStore) {}

  public provideCodeLenses(
    document: vscode.TextDocument,
    _token: vscode.CancellationToken
  ): vscode.CodeLens[] {
    const lenses: vscode.CodeLens[] = [];
    const filePath = document.fileName;
    const links = this.memoryStore.getLinksForFile(filePath);

    for (const link of links) {
      const memory = this.memoryStore.getMemoryById(link.memory_id);
      if (!memory) {continue;}

      const lineIdx = Math.min(document.lineCount - 1, Math.max(1, link.line_start) - 1);
      const range = new vscode.Range(lineIdx, 0, lineIdx, 999);

      const codeLens = new vscode.CodeLens(range, {
        title: `🧠 Memory: ${memory.title} (${memory.type})`,
        command: 'project-memory.focusSidebar',
      });
      lenses.push(codeLens);
    }

    return lenses;
  }
}

/**
 * Hover Provider to show quick details when hovering over annotated text.
 */
class MemoryHoverProvider implements vscode.HoverProvider {
  constructor(private readonly memoryStore: MemoryStore) {}

  public provideHover(
    document: vscode.TextDocument,
    position: vscode.Position,
    _token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.Hover> {
    const filePath = document.fileName;
    const links = this.memoryStore.getLinksForFile(filePath);

    // Find if hover cursor is within any memory links
    const targetLink = links.find(link => {
      const start = link.line_start - 1;
      const end = link.line_end - 1;
      return position.line >= start && position.line <= end;
    });

    if (!targetLink) {
      return null;
    }

    const memory = this.memoryStore.getMemoryById(targetLink.memory_id);
    if (!memory) {
      return null;
    }

    const typeEmoji: Record<string, string> = {
      decision: '🧠',
      bug: '🐞',
      note: '📝',
      feature: '🌟'
    };

    const emoji = typeEmoji[memory.type] || '📝';

    const hoverMarkdown = new vscode.MarkdownString();
    hoverMarkdown.isTrusted = true;
    hoverMarkdown.appendMarkdown(`### ${emoji} Project Memory: **${memory.title}**\n\n`);
    hoverMarkdown.appendMarkdown(`**Category:** \`${memory.type.toUpperCase()}\`  \n`);
    hoverMarkdown.appendMarkdown(`**Reasoning:**  \n${memory.description}  \n\n`);
    hoverMarkdown.appendMarkdown(`*Recorded on ${new Date(memory.created_at).toLocaleDateString()} by ${memory.created_by}*`);

    return new vscode.Hover(hoverMarkdown);
  }
}

export function deactivate() {
  // Clear all decoration styles
  Object.values(decorationTypes).forEach(dec => dec.dispose());
}
