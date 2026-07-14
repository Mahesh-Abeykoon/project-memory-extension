import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { Database, Memory, MemoryLink, MemoryType } from './types';

export function computeContentHash(text: string): string {
  if (!text) {return '';}
  const normalized = text.replace(/\r\n/g, '\n').trim();
  return crypto.createHash('sha256').update(normalized).digest('hex').substring(0, 16);
}

export class MemoryStore {
  private currentDb: Database = { version: "1.0", memories: [], links: [] };

  constructor() {
    this.ensureInitialized();
  }

  private getDbPath(): string | null {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (workspaceFolders && workspaceFolders.length > 0) {
      const rootPath = workspaceFolders[0].uri.fsPath;
      return path.join(rootPath, '.memory', 'db.json');
    }
    return null;
  }

  private ensureInitialized(): void {
    const dbPath = this.getDbPath();
    if (!dbPath) {return;}
    const dirPath = path.dirname(dbPath);
    try {
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
      }
      if (!fs.existsSync(dbPath)) {
        this.saveDatabase();
      } else {
        this.loadDatabase();
      }
    } catch (err) {
      console.error('Failed to initialize memory store directory:', err);
    }
  }

  /**
   * Reload database from disk.
   */
  public loadDatabase(): void {
    const dbPath = this.getDbPath();
    if (!dbPath || !fs.existsSync(dbPath)) {
      return;
    }
    try {
      const content = fs.readFileSync(dbPath, 'utf8');
      this.currentDb = JSON.parse(content);
      // Ensure arrays exist
      if (!this.currentDb.memories) {this.currentDb.memories = [];}
      if (!this.currentDb.links) {this.currentDb.links = [];}
    } catch (err) {
      console.error('Failed to load memory database:', err);
    }
  }

  /**
   * Save current database state to disk.
   */
  private saveDatabase(): void {
    const dbPath = this.getDbPath();
    if (!dbPath) {
      return;
    }
    try {
      const dirPath = path.dirname(dbPath);
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
      }
      fs.writeFileSync(dbPath, JSON.stringify(this.currentDb, null, 2), 'utf8');
    } catch (err) {
      console.error('Failed to save memory database:', err);
    }
  }

  /**
   * Normalize Windows paths to use forward slashes for cross-platform portability.
   */
  public normalizePath(filePath: string): string {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (workspaceFolders && workspaceFolders.length > 0) {
      const rootPath = workspaceFolders[0].uri.fsPath;
      if (filePath.startsWith(rootPath)) {
        filePath = path.relative(rootPath, filePath);
      }
    }
    return filePath.replace(/\\/g, '/');
  }

  /**
   * Add a memory and its associated code link.
   */
  public addMemory(
    title: string,
    description: string,
    type: MemoryType,
    filePath: string,
    lineStart: number,
    lineEnd: number,
    codeSnippet?: string,
    createdBy = 'Developer',
    symbolName?: string,
    symbolType?: string,
    tags?: string[]
  ): { memory: Memory; link: MemoryLink } | null {
    this.ensureInitialized(); // Re-check if workspace loaded late
    const dbPath = this.getDbPath();
    if (!dbPath) {
      vscode.window.showErrorMessage('Project Memory requires an active workspace folder to store memories.');
      return null;
    }

    const memoryId = this.generateId();
    const normalizedPath = this.normalizePath(filePath);

    const memory: Memory = {
      id: memoryId,
      title: title.trim(),
      description: description.trim(),
      type,
      tags: tags ? tags.map(t => t.trim().toLowerCase()).filter(Boolean) : [],
      created_by: createdBy,
      created_at: new Date().toISOString()
    };

    // Calculate optional hashes and context boundaries if snippet is provided
    let contextBefore = '';
    let contextAfter = '';
    if (codeSnippet && vscode.window.activeTextEditor) {
      const doc = vscode.window.activeTextEditor.document;
      const startLineIdx = Math.max(0, lineStart - 4);
      const endLineIdx = Math.min(doc.lineCount - 1, lineEnd + 2);
      
      try {
        contextBefore = doc.getText(new vscode.Range(startLineIdx, 0, Math.max(0, lineStart - 2), 0));
        contextAfter = doc.getText(new vscode.Range(Math.min(doc.lineCount - 1, lineEnd), 0, endLineIdx, 0));
      } catch (err) {
        console.warn('Failed to capture surrounding context:', err);
      }
    }

    const snippetText = codeSnippet ? codeSnippet.trim() : undefined;
    const link: MemoryLink = {
      memory_id: memoryId,
      file_path: normalizedPath,
      symbol_name: symbolName || undefined,
      symbol_type: symbolType || undefined,
      line_start: lineStart,
      line_end: lineEnd,
      code_snippet: snippetText,
      content_hash: snippetText ? computeContentHash(snippetText) : undefined,
      context_before: contextBefore || undefined,
      context_after: contextAfter || undefined
    };

    this.currentDb.memories.push(memory);
    this.currentDb.links.push(link);
    this.saveDatabase();

    return { memory, link };
  }

  /**
   * Validates whether a link's saved content hash matches the code currently on disk.
   */
  public checkLinkStaleStatus(link: MemoryLink): { isStale: boolean; reason?: 'modified' | 'file_not_found'; currentSnippet?: string } {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      return { isStale: false };
    }

    const rootPath = workspaceFolders[0].uri.fsPath;
    const absolutePath = path.join(rootPath, link.file_path);

    if (!fs.existsSync(absolutePath)) {
      return { isStale: true, reason: 'file_not_found' };
    }

    if (!link.content_hash && !link.code_snippet) {
      return { isStale: false };
    }

    try {
      const fileContent = fs.readFileSync(absolutePath, 'utf8');
      const lines = fileContent.split(/\r?\n/);
      const startIdx = Math.max(0, link.line_start - 1);
      const endIdx = Math.min(lines.length, link.line_end);

      if (startIdx >= lines.length) {
        return { isStale: true, reason: 'modified', currentSnippet: '' };
      }

      const currentSnippet = lines.slice(startIdx, endIdx).join('\n').trim();
      const currentHash = computeContentHash(currentSnippet);
      const targetHash = link.content_hash || (link.code_snippet ? computeContentHash(link.code_snippet) : '');

      if (targetHash && currentHash !== targetHash) {
        return { isStale: true, reason: 'modified', currentSnippet };
      }
    } catch (err) {
      console.warn('Failed to inspect file for stale memory check:', err);
    }

    return { isStale: false };
  }

  /**
   * Re-syncs a link's saved snippet and content hash with current file contents on disk.
   */
  public resyncMemorySnippet(memoryId: string): boolean {
    const link = this.currentDb.links.find(l => l.memory_id === memoryId);
    if (!link) {
      return false;
    }

    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      return false;
    }

    const rootPath = workspaceFolders[0].uri.fsPath;
    const absolutePath = path.join(rootPath, link.file_path);

    if (!fs.existsSync(absolutePath)) {
      return false;
    }

    try {
      const fileContent = fs.readFileSync(absolutePath, 'utf8');
      const lines = fileContent.split(/\r?\n/);
      const startIdx = Math.max(0, link.line_start - 1);
      const endIdx = Math.min(lines.length, link.line_end);

      const currentSnippet = lines.slice(startIdx, endIdx).join('\n').trim();
      link.code_snippet = currentSnippet;
      link.content_hash = computeContentHash(currentSnippet);
      this.saveDatabase();
      return true;
    } catch (err) {
      console.error('Failed to re-sync memory snippet:', err);
      return false;
    }
  }

  /**
   * Update an existing memory's details.
   */
  public updateMemory(memoryId: string, title: string, description: string, type: MemoryType, tags?: string[]): boolean {
    const memory = this.currentDb.memories.find(m => m.id === memoryId);
    if (!memory) {
      return false;
    }

    memory.title = title.trim();
    memory.description = description.trim();
    memory.type = type;
    if (tags !== undefined) {
      memory.tags = tags.map(t => t.trim().toLowerCase()).filter(Boolean);
    }
    this.saveDatabase();
    return true;
  }

  /**
   * Delete a memory and all its links.
   */
  public deleteMemory(memoryId: string): boolean {
    const memoryIndex = this.currentDb.memories.findIndex(m => m.id === memoryId);
    if (memoryIndex === -1) {
      return false;
    }

    this.currentDb.memories.splice(memoryIndex, 1);
    this.currentDb.links = this.currentDb.links.filter(l => l.memory_id !== memoryId);
    this.saveDatabase();
    return true;
  }

  /**
   * Clear all memories.
   */
  public clearAll(): void {
    this.currentDb.memories = [];
    this.currentDb.links = [];
    this.saveDatabase();
  }

  /**
   * Get all memories.
   */
  public getMemories(): Memory[] {
    this.loadDatabase();
    return this.currentDb.memories;
  }

  /**
   * Get all links.
   */
  public getLinks(): MemoryLink[] {
    this.loadDatabase();
    return this.currentDb.links;
  }

  /**
   * Get links for a specific file.
   */
  public getLinksForFile(filePath: string): MemoryLink[] {
    this.loadDatabase();
    const normalized = this.normalizePath(filePath);
    return this.currentDb.links.filter(link => link.file_path === normalized);
  }

  /**
   * Get memory by ID.
   */
  public getMemoryById(memoryId: string): Memory | undefined {
    return this.currentDb.memories.find(m => m.id === memoryId);
  }

  private generateId(): string {
    return Math.random().toString(36).substring(2, 11) + '_' + Date.now();
  }
}
