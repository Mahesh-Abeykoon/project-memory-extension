export type MemoryType = 'decision' | 'bug' | 'note' | 'feature';

export interface Memory {
  id: string;
  title: string;
  description: string;
  type: MemoryType;
  created_by: string;
  created_at: string;
}

export interface MemoryLink {
  memory_id: string;
  file_path: string;       // Relative path from workspace root
  symbol_name?: string;    // Optional AST class/function name
  symbol_type?: string;    // e.g., "function", "class"
  line_start: number;      // 1-indexed line start
  line_end: number;        // 1-indexed line end
  content_hash?: string;   // Hash of lines for drift check
  context_before?: string; // Preceding lines for validation
  context_after?: string;  // Succeeding lines for validation
}

export interface Database {
  version: string;
  memories: Memory[];
  links: MemoryLink[];
}
