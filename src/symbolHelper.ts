import * as vscode from 'vscode';

export interface DiscoveredSymbol {
  name: string;
  kind: string;
}

/**
 * Finds the innermost enclosing symbol (class, function, method, interface, etc.)
 * at a given document position using VS Code's symbol provider API.
 */
export async function getEnclosingSymbol(
  document: vscode.TextDocument,
  position: vscode.Position
): Promise<DiscoveredSymbol | undefined> {
  try {
    const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
      'vscode.executeDocumentSymbolProvider',
      document.uri
    );

    if (!symbols || symbols.length === 0) {
      return undefined;
    }

    function findInnermost(items: vscode.DocumentSymbol[]): vscode.DocumentSymbol | undefined {
      let innermost: vscode.DocumentSymbol | undefined;
      for (const item of items) {
        if (item.range.contains(position)) {
          innermost = item;
          if (item.children && item.children.length > 0) {
            const childInnermost = findInnermost(item.children);
            if (childInnermost) {
              innermost = childInnermost;
            }
          }
        }
      }
      return innermost;
    }

    const symbol = findInnermost(symbols);
    if (symbol) {
      return {
        name: symbol.name,
        kind: vscode.SymbolKind[symbol.kind].toLowerCase()
      };
    }
  } catch (err) {
    console.warn('Failed to resolve document symbols:', err);
  }
  return undefined;
}
