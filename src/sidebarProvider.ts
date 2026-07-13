import * as path from 'path';
import * as vscode from 'vscode';
import { MemoryStore } from './memoryStore';
import { MemoryType } from './types';

export class SidebarProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'project-memory.sidebar';
  private _view?: vscode.WebviewView;

  constructor(
    private readonly _extensionUri: vscode.Uri,
    private readonly _memoryStore: MemoryStore
  ) {}

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ) {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri]
    };

    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

    // Register message listeners
    webviewView.webview.onDidReceiveMessage(async (data) => {
      switch (data.command) {
        case 'getMemories': {
          this.sendMemories();
          this.sendActiveSelection();
          break;
        }
        case 'refreshSelection': {
          this.sendActiveSelection();
          break;
        }
        case 'addMemory': {
          const editor = vscode.window.activeTextEditor;
          if (!editor) {
            vscode.window.showErrorMessage('Open a file first to link this memory to your code.');
            break;
          }
          
          const doc = editor.document;
          const selection = editor.selection;
          
          const lineStart = selection.start.line + 1;
          const lineEnd = selection.end.line + 1;
          const filePath = doc.fileName;
          const selectedText = doc.getText(selection);

          const result = this._memoryStore.addMemory(
            data.title,
            data.description,
            data.type as MemoryType,
            filePath,
            lineStart,
            lineEnd,
            selectedText
          );

          if (result) {
            vscode.window.showInformationMessage(`Memory "${data.title}" successfully added!`);
            this.sendMemories();
            // Trigger an editor decoration update (refresh)
            vscode.commands.executeCommand('project-memory.refreshDecorations');
          }
          break;
        }
        case 'updateMemory': {
          const success = this._memoryStore.updateMemory(data.id, data.title, data.description, data.type as MemoryType);
          if (success) {
            vscode.window.showInformationMessage(`Memory "${data.title}" updated successfully!`);
            this.sendMemories();
            vscode.commands.executeCommand('project-memory.refreshDecorations');
          } else {
            vscode.window.showErrorMessage('Failed to update memory.');
          }
          break;
        }
        case 'deleteMemory': {
          const memory = this._memoryStore.getMemoryById(data.id);
          const titleLabel = memory ? `"${memory.title}"` : 'this memory';
          const confirm = await vscode.window.showWarningMessage(
            `Are you sure you want to delete ${titleLabel}?`,
            { modal: true },
            'Delete'
          );
          
          if (confirm === 'Delete') {
            const success = this._memoryStore.deleteMemory(data.id);
            if (success) {
              vscode.window.showInformationMessage('Memory deleted.');
              this.sendMemories();
              vscode.commands.executeCommand('project-memory.refreshDecorations');
            } else {
              vscode.window.showErrorMessage('Failed to delete memory.');
            }
          }
          break;
        }
        case 'jumpTo': {
          const workspaceFolders = vscode.workspace.workspaceFolders;
          if (workspaceFolders && workspaceFolders.length > 0) {
            const rootPath = workspaceFolders[0].uri.fsPath;
            const fullPath = vscode.Uri.file(path.join(rootPath, data.filePath));
            
            try {
              const doc = await vscode.workspace.openTextDocument(fullPath);
              const editor = await vscode.window.showTextDocument(doc);
              
              // Set selection/highlighting
              const startPos = new vscode.Position(data.lineStart - 1, 0);
              const endPos = new vscode.Position(data.lineEnd - 1, 9999);
              editor.selection = new vscode.Selection(startPos, endPos);
              editor.revealRange(new vscode.Range(startPos, endPos), vscode.TextEditorRevealType.InCenter);
            } catch (err) {
              vscode.window.showErrorMessage(`Failed to open file: ${data.filePath}`);
            }
          }
          break;
        }
      }
    });

    // Listen to changes in the active editor selection to dynamically update UI form context
    vscode.window.onDidChangeActiveTextEditor(() => this.sendActiveSelection());
    vscode.window.onDidChangeTextEditorSelection(() => this.sendActiveSelection());
  }

  /**
   * Send the current list of memories combined with their links to the Webview.
   */
  public sendMemories() {
    if (!this._view) {return;}
    
    const memories = this._memoryStore.getMemories();
    const links = this._memoryStore.getLinks();

    // Join memories with their links
    const enrichedMemories = memories.map(memory => {
      const link = links.find(l => l.memory_id === memory.id);
      return {
        ...memory,
        link: link || null
      };
    });

    // Sort by newest first
    enrichedMemories.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    this._view.webview.postMessage({
      command: 'setMemories',
      memories: enrichedMemories
    });
  }

  /**
   * Send current cursor selection data to pre-populate the memory form.
   */
  public sendActiveSelection() {
    if (!this._view) {return;}

    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      this._view.webview.postMessage({
        command: 'setActiveSelection',
        selection: null
      });
      return;
    }

    const doc = editor.document;
    const selection = editor.selection;
    const relativePath = this._memoryStore.normalizePath(doc.fileName);

    this._view.webview.postMessage({
      command: 'setActiveSelection',
      selection: {
        file: relativePath,
        lineStart: selection.start.line + 1,
        lineEnd: selection.end.line + 1
      }
    });
  }

  private _getHtmlForWebview(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'sidebar.js'));
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'sidebar.css'));

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src ${webview.cspSource}; img-src ${webview.cspSource} https:;">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Project Memory</title>
  <link href="${styleUri}" rel="stylesheet">
</head>
<body>

  <div class="header">
    <h3 class="title">Project Memory</h3>
    <button class="action-btn" id="refreshSelection" title="Refresh Cursor Selection">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
    </button>
  </div>

  <!-- Collapsible Form to Record Memory -->
  <div class="collapsible-container" id="collapsibleFormContainer">
    <button class="collapsible-trigger" id="formToggleBtn" title="Toggle memory creation form">
      <span class="trigger-text">➕ Record New Memory</span>
      <svg class="chevron-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
    </button>
    <div class="collapsible-content" id="formContent">
      <div class="glass-panel">
        <div class="form-group">
          <input type="text" id="memTitle" placeholder="Title (e.g. Why Redis was added)" required />
        </div>
        <div class="form-group">
          <textarea id="memDesc" rows="3" placeholder="Explain the reasoning/context behind this code..." required></textarea>
        </div>
        <div class="form-group">
          <label>Memory Type</label>
          <div class="type-grid">
            <div class="type-pill active" data-type="decision">🧠 Decision</div>
            <div class="type-pill" data-type="bug">🐞 Bug</div>
            <div class="type-pill" data-type="note">📝 Note</div>
            <div class="type-pill" data-type="feature">🌟 Feature</div>
          </div>
        </div>
        
        <div class="form-group">
          <label>Linked Code Context</label>
          <div id="selectionStatus" class="selection-tag">No cursor selection active</div>
        </div>

        <button class="btn-primary" id="saveMemoryBtn">Save Memory</button>
      </div>
    </div>
  </div>

  <!-- Search and Filtering -->
  <div class="search-container">
    <span class="search-icon">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
    </span>
    <input type="text" id="searchBar" class="search-input" placeholder="Search memories..." />
  </div>

  <div class="tabs">
    <div class="tab active" data-filter="all">All</div>
    <div class="tab" data-filter="decision">Decisions</div>
    <div class="tab" data-filter="bug">Bugs</div>
    <div class="tab" data-filter="note">Notes</div>
    <div class="tab" data-filter="feature">Features</div>
  </div>

  <!-- Memories List -->
  <div class="memories-list" id="memoriesList">
    <div class="empty-state">Loading memories...</div>
  </div>

  <script src="${scriptUri}"></script>
</body>
</html>`;
  }
}
