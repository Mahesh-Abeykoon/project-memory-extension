import * as vscode from 'vscode';
import { MemoryStore } from './memoryStore';
import { SidebarProvider } from './sidebarProvider';
import { MemoryType } from './types';
import { getEnclosingSymbol } from './symbolHelper';
import { exportMarkdownCommand } from './exportHelper';
import { CommentHighlighter } from './commentHighlighter';

// Global decoration types for memory categories
let decorationTypes: Record<string, vscode.TextEditorDecorationType> = {};
let commentHighlighter: CommentHighlighter | undefined;

export function activate(context: vscode.ExtensionContext) {
  console.log('Project Memory extension is now active!');

  const memoryStore = new MemoryStore();
  const sidebarProvider = new SidebarProvider(context.extensionUri, memoryStore);

  // Initialize comment highlighter for glowing comment tokens
  commentHighlighter = new CommentHighlighter();
  context.subscriptions.push({
    dispose: () => commentHighlighter?.dispose()
  });

  // Initialize decoration rendering options for memory links
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

      // Step 4: Get Optional Tags
      const tagsInput = await vscode.window.showInputBox({
        prompt: 'Enter tags separated by commas (optional)',
        placeHolder: 'security, performance, temporary-workaround...'
      });
      const tags = tagsInput ? tagsInput.split(',').map(t => t.trim()).filter(Boolean) : [];

      // Auto-detect enclosing code symbol (function, class, method)
      const symbolInfo = await getEnclosingSymbol(editor.document, selection.start);

      // Save memory
      const result = memoryStore.addMemory(
        title,
        description,
        typeSelection.value as MemoryType,
        filePath,
        lineStart,
        lineEnd,
        selectedText,
        'Developer',
        symbolInfo?.name,
        symbolInfo?.kind,
        tags
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

  // Command to scan workspace comments
  context.subscriptions.push(
    vscode.commands.registerCommand('project-memory.scanComments', async () => {
      await sidebarProvider.sendScannedComments();
      vscode.commands.executeCommand('project-memory.focusSidebar');
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

  // Command to export memories as Markdown
  context.subscriptions.push(
    vscode.commands.registerCommand('project-memory.exportMarkdown', () => {
      exportMarkdownCommand(memoryStore);
    })
  );

  // Editor events
  vscode.window.onDidChangeActiveTextEditor(editor => {
    if (editor) {
      updateDecorations(editor, memoryStore);
      commentHighlighter?.updateEditor(editor);
    }
  }, null, context.subscriptions);

  vscode.workspace.onDidChangeTextDocument(event => {
    const editor = vscode.window.activeTextEditor;
    if (editor && event.document === editor.document) {
      updateDecorations(editor, memoryStore);
      commentHighlighter?.updateEditor(editor);
    }
  }, null, context.subscriptions);

  // Initial decoration run
  triggerUpdateDecorations(memoryStore);
  if (vscode.window.activeTextEditor) {
    commentHighlighter.updateEditor(vscode.window.activeTextEditor);
  }

}

function initializeDecorationTypes() {
  decorationTypes = {
    decision: vscode.window.createTextEditorDecorationType({
      backgroundColor: 'rgba(138, 43, 226, 0.06)',
      isWholeLine: true,
      overviewRulerColor: 'rgba(138, 43, 226, 0.7)',
      overviewRulerLane: vscode.OverviewRulerLane.Right,
      after: {
        contentText: '  [Decision]',
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
        contentText: '  [Bug]',
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
        contentText: '  [Note]',
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
        contentText: '  [Feature]',
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
    const lineStart = Math.min(docLineCount, Math.max(1, link.line_start)) - 1;
    const lineEnd = Math.min(docLineCount, Math.max(1, link.line_end)) - 1;

    const range = new vscode.Range(
      new vscode.Position(lineStart, 0),
      new vscode.Position(lineEnd, 999)
    );

    // Build hover markdown scoped to this decoration range (prevents duplicate provider calls)
    const hover = new vscode.MarkdownString();
    hover.isTrusted = true;
    hover.appendMarkdown(`### Project Memory: **${memory.title}**\n`);
    hover.appendMarkdown(`_${memory.type.toUpperCase()}_\n\n`);
    hover.appendMarkdown(`${memory.description}\n\n`);
    hover.appendMarkdown(`---\n`);
    hover.appendMarkdown(`*Recorded on ${new Date(memory.created_at).toLocaleDateString()} by ${memory.created_by}*`);

    const type = memory.type as string;
    if (decorationRanges[type]) {
      decorationRanges[type].push({ range, hoverMessage: hover });
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

export function deactivate() {
  Object.values(decorationTypes).forEach(dec => dec.dispose());
  commentHighlighter?.dispose();
}
