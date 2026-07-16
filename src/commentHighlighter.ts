import * as vscode from 'vscode';

export interface CommentTokenStyle {
  token: string;
  color: string;
  backgroundColor: string;
  overviewRulerColor: string;
  borderRadius?: string;
  fontWeight?: string;
}

export const DEFAULT_COMMENT_TOKENS: Record<string, CommentTokenStyle> = {
  TODO: {
    token: 'TODO',
    color: '#f59e0b',
    backgroundColor: 'rgba(245, 158, 11, 0.14)',
    overviewRulerColor: '#f59e0b',
    borderRadius: '3px',
    fontWeight: 'bold'
  },
  FIXME: {
    token: 'FIXME',
    color: '#ef4444',
    backgroundColor: 'rgba(239, 68, 68, 0.14)',
    overviewRulerColor: '#ef4444',
    borderRadius: '3px',
    fontWeight: 'bold'
  },
  BUG: {
    token: 'BUG',
    color: '#f43f5e',
    backgroundColor: 'rgba(244, 63, 94, 0.16)',
    overviewRulerColor: '#f43f5e',
    borderRadius: '3px',
    fontWeight: 'bold'
  },
  REASON: {
    token: 'REASON',
    color: '#c084fc',
    backgroundColor: 'rgba(192, 132, 252, 0.15)',
    overviewRulerColor: '#c084fc',
    borderRadius: '3px',
    fontWeight: 'bold'
  },
  MEMORY: {
    token: 'MEMORY',
    color: '#a855f7',
    backgroundColor: 'rgba(168, 85, 247, 0.16)',
    overviewRulerColor: '#a855f7',
    borderRadius: '3px',
    fontWeight: 'bold'
  },
  NOTE: {
    token: 'NOTE',
    color: '#38bdf8',
    backgroundColor: 'rgba(56, 189, 248, 0.14)',
    overviewRulerColor: '#38bdf8',
    borderRadius: '3px',
    fontWeight: 'bold'
  },
  OPTIMIZE: {
    token: 'OPTIMIZE',
    color: '#34d399',
    backgroundColor: 'rgba(52, 211, 153, 0.14)',
    overviewRulerColor: '#34d399',
    borderRadius: '3px',
    fontWeight: 'bold'
  }
};

export class CommentHighlighter {
  private decorationTypes: Map<string, vscode.TextEditorDecorationType> = new Map();
  private customTokens: Map<string, CommentTokenStyle> = new Map();

  constructor() {
    this.initDecorationTypes();
  }

  /**
   * Initializes decoration types for default and custom comment tokens.
   */
  private initDecorationTypes() {
    this.dispose();

    const allStyles = { ...DEFAULT_COMMENT_TOKENS };
    this.customTokens.forEach((style, key) => {
      allStyles[key] = style;
    });

    Object.entries(allStyles).forEach(([token, style]) => {
      const dec = vscode.window.createTextEditorDecorationType({
        color: style.color,
        backgroundColor: style.backgroundColor,
        borderRadius: style.borderRadius || '3px',
        fontWeight: style.fontWeight || 'bold',
        overviewRulerColor: style.overviewRulerColor,
        overviewRulerLane: vscode.OverviewRulerLane.Right,
        after: {
          margin: '0 0 0 10px',
          contentText: `⚡ [${token}]`,
          color: style.color,
          fontStyle: 'italic',
          fontWeight: 'normal'
        }
      });
      this.decorationTypes.set(token.toUpperCase(), dec);
    });
  }

  /**
   * Add or update custom comment tokens.
   */
  public setCustomToken(token: string, style: CommentTokenStyle) {
    this.customTokens.set(token.toUpperCase(), style);
    this.initDecorationTypes();
  }

  /**
   * Scans document lines and applies glowing decorations to active editor.
   */
  public updateEditor(editor?: vscode.TextEditor) {
    if (!editor) {
      return;
    }

    const doc = editor.document;
    const text = doc.getText();

    // Prepare range maps for each token type
    const rangeMap: Map<string, vscode.DecorationOptions[]> = new Map();
    this.decorationTypes.forEach((_, key) => rangeMap.set(key, []));

    // Pattern matching line & block comments containing actionable tokens
    // Matches: // TODO:, # FIXME:, -- BUG:, /* REASON: */, <!-- NOTE: -->
    const tokenKeys = Array.from(this.decorationTypes.keys());
    if (tokenKeys.length === 0) {
      return;
    }

    const patternString = `(?:\\/\\/|#|--|\\/\\*|<!--)\\s*\\b(${tokenKeys.join('|')})\\b(?::|\\b)(.*)`;
    const regex = new RegExp(patternString, 'gi');

    const lines = text.split(/\r?\n/);
    for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
      const lineText = lines[lineIdx];
      let match: RegExpExecArray | null;

      // Reset regex index for each line match
      regex.lastIndex = 0;
      while ((match = regex.exec(lineText)) !== null) {
        const tokenMatch = match[1].toUpperCase();
        const startPos = lineText.indexOf(match[0]);
        const endPos = lineText.length;

        if (startPos !== -1 && rangeMap.has(tokenMatch)) {
          const range = new vscode.Range(
            new vscode.Position(lineIdx, startPos),
            new vscode.Position(lineIdx, endPos)
          );

          const commentText = match[0].trim();
          rangeMap.get(tokenMatch)!.push({
            range,
            hoverMessage: new vscode.MarkdownString(
              `### ⚡ Actionable Comment: \`${tokenMatch}\`\n\n` +
              `> ${commentText}\n\n` +
              `*Line ${lineIdx + 1} in \`${doc.fileName.split(/[\\/]/).pop()}\`*`
            )
          });
        }
      }
    }

    // Set decorations on the editor
    this.decorationTypes.forEach((decType, tokenKey) => {
      const ranges = rangeMap.get(tokenKey) || [];
      editor.setDecorations(decType, ranges);
    });
  }

  public dispose() {
    this.decorationTypes.forEach(dec => dec.dispose());
    this.decorationTypes.clear();
  }
}
