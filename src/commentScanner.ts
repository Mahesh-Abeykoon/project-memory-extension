import * as vscode from 'vscode';
import * as path from 'path';

export interface ScannedComment {
  id: string;
  filePath: string;      // Relative path from workspace root
  fullPath: string;      // Absolute disk path
  line: number;          // 1-indexed line number
  text: string;          // Full comment line text
  token: string;         // E.g., 'TODO' | 'FIXME' | 'BUG' | 'REASON' | 'MEMORY' | 'NOTE' | 'OPTIMIZE'
  body: string;          // Description text after token
}

export interface FileCommentGroup {
  filePath: string;
  fileName: string;
  comments: ScannedComment[];
}

export class CommentScanner {
  private static readonly EXCLUDE_GLOB = '**/{node_modules,.git,dist,build,out,coverage,.vscode,*.vsix,*.log}/**';
  private static readonly SUPPORTED_TOKENS = ['TODO', 'FIXME', 'BUG', 'REASON', 'MEMORY', 'NOTE', 'OPTIMIZE'];

  /**
   * Scans the active workspace for actionable code comments.
   */
  public async scanWorkspace(): Promise<FileCommentGroup[]> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      return [];
    }

    const rootUri = workspaceFolders[0].uri;
    const rootPath = rootUri.fsPath;

    // Find readable workspace files
    const files = await vscode.workspace.findFiles('**/*', CommentScanner.EXCLUDE_GLOB, 500);
    const results: ScannedComment[] = [];

    const tokenRegex = new RegExp(`(?:\\/\\/|#|--|\\/\\*|<!--)\\s*\\b(${CommentScanner.SUPPORTED_TOKENS.join('|')})\\b(?::|\\b)?\\s*(.*)`, 'i');

    for (const fileUri of files) {
      try {
        const doc = await vscode.workspace.openTextDocument(fileUri);
        const text = doc.getText();
        const lines = text.split(/\r?\n/);

        const relativePath = path.relative(rootPath, fileUri.fsPath).replace(/\\/g, '/');

        for (let idx = 0; idx < lines.length; idx++) {
          const lineText = lines[idx];
          const match = tokenRegex.exec(lineText);
          if (match) {
            const token = match[1].toUpperCase();
            const rawBody = match[2] ? match[2].replace(/\*\/|-->/, '').trim() : '';
            const body = rawBody || lineText.trim();

            results.push({
              id: `${relativePath}:${idx + 1}:${token}`,
              filePath: relativePath,
              fullPath: fileUri.fsPath,
              line: idx + 1,
              text: lineText.trim(),
              token,
              body
            });
          }
        }
      } catch (err) {
        // Skip unreadable / binary files silently
      }
    }

    // Group comments by relative file path
    const groupedMap = new Map<string, ScannedComment[]>();
    for (const item of results) {
      if (!groupedMap.has(item.filePath)) {
        groupedMap.set(item.filePath, []);
      }
      groupedMap.get(item.filePath)!.push(item);
    }

    const groups: FileCommentGroup[] = [];
    groupedMap.forEach((comments, filePath) => {
      groups.push({
        filePath,
        fileName: path.basename(filePath),
        comments
      });
    });

    // Sort groups alphabetically by file path
    groups.sort((a, b) => a.filePath.localeCompare(b.filePath));
    return groups;
  }
}
