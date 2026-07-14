import * as path from 'path';
import * as vscode from 'vscode';
import { MemoryStore } from './memoryStore';
import { MemoryType } from './types';
import { getEnclosingSymbol } from './symbolHelper';
import { CommentScanner } from './commentScanner';

export class SidebarProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'project-memory.sidebar';
  private _view?: vscode.WebviewView;
  private readonly _commentScanner: CommentScanner = new CommentScanner();

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
        case 'scanComments': {
          await this.sendScannedComments();
          break;
        }
        case 'convertCommentToMemory': {
          await this.convertCommentToMemory(data);
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

          // Auto-detect enclosing code symbol (function, class, method)
          const symbolInfo = await getEnclosingSymbol(doc, selection.start);

          // Parse optional tags if sent from webview
          const tags = Array.isArray(data.tags) ? data.tags : (typeof data.tags === 'string' ? data.tags.split(',').map((t: string) => t.trim()).filter(Boolean) : []);

          const result = this._memoryStore.addMemory(
            data.title,
            data.description,
            data.type as MemoryType,
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
            vscode.window.showInformationMessage(`Memory "${data.title}" successfully added!`);
            this.sendMemories();
            // Trigger an editor decoration update (refresh)
            vscode.commands.executeCommand('project-memory.refreshDecorations');
          }
          break;
        }
        case 'updateMemory': {
          const tags = Array.isArray(data.tags) ? data.tags : (typeof data.tags === 'string' ? data.tags.split(',').map((t: string) => t.trim()).filter(Boolean) : undefined);
          const success = this._memoryStore.updateMemory(data.id, data.title, data.description, data.type as MemoryType, tags);
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
        case 'resyncMemory': {
          const success = this._memoryStore.resyncMemorySnippet(data.id);
          if (success) {
            vscode.window.showInformationMessage('Memory snippet re-synced with current code!');
            this.sendMemories();
            vscode.commands.executeCommand('project-memory.refreshDecorations');
          } else {
            vscode.window.showErrorMessage('Failed to re-sync memory.');
          }
          break;
        }
        case 'exportMarkdown': {
          vscode.commands.executeCommand('project-memory.exportMarkdown');
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

    // Listen to document content changes & saves to update stale checks and live diffs in real-time
    let debouncedTimer: NodeJS.Timeout | undefined;
    vscode.workspace.onDidChangeTextDocument(e => {
      if (e.document.uri.scheme !== 'file') {return;}
      if (debouncedTimer) {clearTimeout(debouncedTimer);}
      debouncedTimer = setTimeout(() => {
        this.sendMemories();
        vscode.commands.executeCommand('project-memory.refreshDecorations');
      }, 400);
    });

    vscode.workspace.onDidSaveTextDocument(doc => {
      if (doc.uri.scheme === 'file') {
        this.sendMemories();
        vscode.commands.executeCommand('project-memory.refreshDecorations');
      }
    });
  }

  /**
   * Scans workspace comments and sends results to the webview.
   */
  public async sendScannedComments() {
    if (!this._view) {return;}
    const commentGroups = await this._commentScanner.scanWorkspace();
    this._view.webview.postMessage({
      command: 'setComments',
      commentGroups
    });
  }

  /**
   * Converts a scanned code comment into a permanent Project Memory record.
   */
  private async convertCommentToMemory(data: {
    filePath: string;
    line: number;
    token: string;
    body: string;
    text: string;
  }) {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      vscode.window.showErrorMessage('No active workspace folder found.');
      return;
    }

    const rootPath = workspaceFolders[0].uri.fsPath;
    const fullPath = path.join(rootPath, data.filePath);

    let doc: vscode.TextDocument;
    try {
      doc = await vscode.workspace.openTextDocument(vscode.Uri.file(fullPath));
    } catch (err) {
      vscode.window.showErrorMessage(`Unable to open target file for comment conversion: ${data.filePath}`);
      return;
    }

    const pos = new vscode.Position(Math.max(0, data.line - 1), 0);
    const symbolInfo = await getEnclosingSymbol(doc, pos);

    // Map comment token to MemoryType
    let memoryType: MemoryType = 'note';
    const token = data.token.toUpperCase();
    if (token === 'FIXME' || token === 'BUG') {
      memoryType = 'bug';
    } else if (token === 'REASON' || token === 'MEMORY') {
      memoryType = 'decision';
    } else if (token === 'OPTIMIZE') {
      memoryType = 'feature';
    } else {
      memoryType = 'note';
    }

    const title = `[${data.token}] ${data.body || 'Actionable Comment'}`;
    const description = `Promoted from codebase comment on Line ${data.line}:\n\`${data.text}\``;
    const tags = ['comment-scanner', data.token.toLowerCase()];

    const result = this._memoryStore.addMemory(
      title,
      description,
      memoryType,
      fullPath,
      data.line,
      data.line,
      data.text,
      'Developer (Promoted)',
      symbolInfo?.name,
      symbolInfo?.kind,
      tags
    );

    if (result) {
      vscode.window.showInformationMessage(`🧠 Comment promoted to Project Memory: "${title}"!`);
      this.sendMemories();
      await this.sendScannedComments();
      vscode.commands.executeCommand('project-memory.refreshDecorations');
    }
  }

  /**
   * Send the current list of memories combined with their links to the Webview.
   */
  public sendMemories() {
    if (!this._view) {return;}
    
    const memories = this._memoryStore.getMemories();
    const links = this._memoryStore.getLinks();

    // Join memories with their links and check stale status
    const enrichedMemories = memories.map(memory => {
      const link = links.find(l => l.memory_id === memory.id);
      let staleInfo = { isStale: false, reason: undefined as 'modified' | 'file_not_found' | undefined, currentSnippet: undefined as string | undefined };
      if (link) {
        staleInfo = this._memoryStore.checkLinkStaleStatus(link);
      }

      return {
        ...memory,
        link: link || null,
        is_stale: staleInfo.isStale,
        stale_reason: staleInfo.reason || null,
        current_snippet: staleInfo.currentSnippet !== undefined ? staleInfo.currentSnippet : null
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
    <div class="header-actions">
      <button class="action-btn" id="exportMarkdownBtn" title="Export Memories as Markdown (PR / Docs)">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
      </button>
      <button class="action-btn" id="refreshSelection" title="Refresh Cursor Selection">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
      </button>
    </div>
  </div>

  <!-- Main View Navigation Tabs -->
  <div class="main-view-tabs">
    <button class="main-tab active" id="tabNavMemories" data-target="memoriesSection">
      <span>🧠 Memories</span>
    </button>
    <button class="main-tab" id="tabNavComments" data-target="commentsSection">
      <span>⚡ Comments</span>
    </button>
  </div>

  <!-- SECTION 1: MEMORIES SECTION -->
  <div class="section-container active" id="memoriesSection">
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
            <input type="text" id="memTags" placeholder="Tags (e.g. security, perf, refactor)" />
          </div>
          
          <div class="form-group">
            <label>Linked Code Context</label>
            <div id="selectionStatus" class="selection-tag">No cursor selection active</div>
          </div>

          <button class="btn-primary" id="saveMemoryBtn">Save Memory</button>
        </div>
      </div>
    </div>

    <!-- Search and Filtering for Memories -->
    <div class="search-container">
      <span class="search-icon">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
      </span>
      <input type="text" id="searchBar" class="search-input" placeholder="Search memories..." />
    </div>

    <div class="tabs" id="tabsBar">
      <div class="tab active" data-filter="all">All <span class="tab-count" id="countAll">0</span></div>
      <div class="tab" data-filter="decision">Decisions <span class="tab-count" id="countDecision">0</span></div>
      <div class="tab" data-filter="bug">Bugs <span class="tab-count" id="countBug">0</span></div>
      <div class="tab" data-filter="note">Notes <span class="tab-count" id="countNote">0</span></div>
      <div class="tab" data-filter="feature">Features <span class="tab-count" id="countFeature">0</span></div>
      <div class="tab tab-stale-filter" data-filter="stale">Stale ⚠️ <span class="tab-count" id="countStale">0</span></div>
    </div>

    <!-- Memories List -->
    <div class="memories-list" id="memoriesList">
      <div class="empty-state">Loading memories...</div>
    </div>
  </div>

  <!-- SECTION 2: COMMENTS SECTION -->
  <div class="section-container" id="commentsSection">
    <div class="comments-toolbar">
      <button class="btn-primary" id="scanCommentsBtn" title="Scan workspace for actionable comments">
        ⚡ Scan Workspace Comments
      </button>
    </div>

    <div class="search-container">
      <span class="search-icon">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
      </span>
      <input type="text" id="commentsSearchBar" class="search-input" placeholder="Search comments..." />
    </div>

    <div class="tabs" id="commentTokensBar">
      <div class="tab active" data-token-filter="ALL">All <span class="tab-count" id="countTokenAll">0</span></div>
      <div class="tab" data-token-filter="TODO">TODO <span class="tab-count" id="countTokenTODO">0</span></div>
      <div class="tab" data-token-filter="FIXME">FIXME <span class="tab-count" id="countTokenFIXME">0</span></div>
      <div class="tab" data-token-filter="BUG">BUG <span class="tab-count" id="countTokenBUG">0</span></div>
      <div class="tab" data-token-filter="REASON">REASON/MEM <span class="tab-count" id="countTokenREASON">0</span></div>
      <div class="tab" data-token-filter="NOTE">NOTE/OPT <span class="tab-count" id="countTokenNOTE">0</span></div>
    </div>

    <div class="comments-list" id="commentsList">
      <div class="empty-state">Click "Scan Workspace Comments" to inspect actionable code comments.</div>
    </div>
  </div>

  <script src="${scriptUri}"></script>
</body>
</html>`;
  }
}
