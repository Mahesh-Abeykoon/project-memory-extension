import * as vscode from 'vscode';
import { execSync } from 'child_process';
import * as os from 'os';

/**
 * Resolves the author name for memories.
 * Checks VS Code configuration, Git config, system username, and falls back to 'Developer'.
 */
export function resolveAuthorName(): string {
  // 1. Check VS Code settings configuration
  const config = vscode.workspace.getConfiguration('project-memory');
  const configuredName = config.get<string>('authorName');
  if (configuredName && configuredName.trim()) {
    return configuredName.trim();
  }

  // 2. Try Git username
  try {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    const cwd = workspaceFolders && workspaceFolders.length > 0 ? workspaceFolders[0].uri.fsPath : undefined;
    const gitName = execSync('git config user.name', { encoding: 'utf8', timeout: 1000, cwd }).trim();
    if (gitName) {
      return gitName;
    }
  } catch (err) {
    // Ignore and proceed to OS username
  }

  // 3. Try OS system username
  try {
    const systemUser = os.userInfo().username;
    if (systemUser) {
      return systemUser;
    }
  } catch (err) {
    // Ignore and proceed to default
  }

  // 4. Default fallback
  return 'Developer';
}
