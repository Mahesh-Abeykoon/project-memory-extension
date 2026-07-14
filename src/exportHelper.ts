import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { MemoryStore } from './memoryStore';

export function generateMarkdownReport(memoryStore: MemoryStore): string {
  const memories = memoryStore.getMemories();
  const links = memoryStore.getLinks();

  if (memories.length === 0) {
    return `# 🧠 Project Memory Report\n\n*No memories recorded in this workspace yet.*`;
  }

  const counts = {
    decision: memories.filter(m => m.type === 'decision').length,
    bug: memories.filter(m => m.type === 'bug').length,
    note: memories.filter(m => m.type === 'note').length,
    feature: memories.filter(m => m.type === 'feature').length
  };

  let md = `# 🧠 Project Memory Architecture Report\n\n`;
  md += `> Captured code reasoning, architectural decisions, and bug context for this workspace.\n\n`;

  md += `## 📊 Summary Stats\n`;
  md += `- **Total Memories**: ${memories.length}\n`;
  md += `- **Decisions 🧠**: ${counts.decision} | **Bugs 🐞**: ${counts.bug} | **Notes 📝**: ${counts.note} | **Features 🌟**: ${counts.feature}\n\n`;
  md += `---\n\n`;
  md += `## 📁 Code Reasoning Index\n\n`;

  // Group memories by file
  const fileMap = new Map<string, Array<{ memory: typeof memories[0]; link: typeof links[0] | undefined }>>();

  for (const m of memories) {
    const link = links.find(l => l.memory_id === m.id);
    const filePath = link ? link.file_path : 'Unlinked';
    if (!fileMap.has(filePath)) {
      fileMap.set(filePath, []);
    }
    fileMap.get(filePath)!.push({ memory: m, link });
  }

  for (const [filePath, items] of fileMap.entries()) {
    md += `### 📄 \`${filePath}\`\n\n`;

    for (const item of items) {
      const m = item.memory;
      const link = item.link;
      const typeEmoji = m.type === 'decision' ? '🧠' : m.type === 'bug' ? '🐞' : m.type === 'feature' ? '🌟' : '📝';
      const createdDate = new Date(m.created_at).toLocaleString();

      md += `#### ${typeEmoji} ${m.title}\n`;
      if (link) {
        md += `- **Location**: Lines \`L${link.line_start}-L${link.line_end}\``;
        if (link.symbol_name) {
          md += ` in \`${link.symbol_name}\` (${link.symbol_type || 'symbol'})`;
        }
        md += `\n`;
      }
      md += `- **Recorded By**: ${m.created_by} on *${createdDate}*\n`;
      if (m.tags && m.tags.length > 0) {
        md += `- **Tags**: ${m.tags.map(t => `\`#${t}\``).join(' ')}\n`;
      }
      md += `\n**Reasoning & Context**:\n${m.description}\n\n`;

      if (link && link.code_snippet) {
        md += `\`\`\`ts\n${link.code_snippet}\n\`\`\`\n\n`;
      }
    }

    md += `---\n\n`;
  }

  return md.trim() + '\n';
}

export async function exportMarkdownCommand(memoryStore: MemoryStore): Promise<void> {
  const markdown = generateMarkdownReport(memoryStore);
  
  const choice = await vscode.window.showQuickPick(
    [
      { label: '📄 Save to PROJECT_MEMORY.md in Workspace', value: 'file', description: 'Creates or updates file at root' },
      { label: '📋 Copy to Clipboard', value: 'clipboard', description: 'Perfect for PR descriptions or chat logs' }
    ],
    { placeHolder: 'Select export destination for Project Memories' }
  );

  if (!choice) return;

  if (choice.value === 'clipboard') {
    await vscode.env.clipboard.writeText(markdown);
    vscode.window.showInformationMessage('Project Memories copied to clipboard as Markdown!');
  } else if (choice.value === 'file') {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      vscode.window.showErrorMessage('No active workspace folder to save Markdown file.');
      return;
    }

    const targetUri = vscode.Uri.file(path.join(workspaceFolders[0].uri.fsPath, 'PROJECT_MEMORY.md'));
    fs.writeFileSync(targetUri.fsPath, markdown, 'utf8');
    
    const doc = await vscode.workspace.openTextDocument(targetUri);
    await vscode.window.showTextDocument(doc);
    vscode.window.showInformationMessage('Successfully saved and opened PROJECT_MEMORY.md!');
  }
}
