const vscode = acquireVsCodeApi();

let activeSelection = null;
let memoriesData = [];
let scannedCommentGroups = [];
let activeType = 'decision';
let currentFilter = 'all';
let activeTokenFilter = 'ALL';
let editingMemoryId = null;

// UI elements
const memTitleInput = document.getElementById('memTitle');
const memDescInput = document.getElementById('memDesc');
const memTagsInput = document.getElementById('memTags');
const saveBtn = document.getElementById('saveMemoryBtn');
const selectionStatus = document.getElementById('selectionStatus');
const memoriesList = document.getElementById('memoriesList');
const searchBar = document.getElementById('searchBar');
const refreshSelectionBtn = document.getElementById('refreshSelection');

const formContainer = document.getElementById('collapsibleFormContainer');
const formToggleBtn = document.getElementById('formToggleBtn');
const triggerText = formToggleBtn.querySelector('.trigger-text');

// Main Section Navigation Elements
const tabNavMemories = document.getElementById('tabNavMemories');
const tabNavComments = document.getElementById('tabNavComments');
const memoriesSection = document.getElementById('memoriesSection');
const commentsSection = document.getElementById('commentsSection');

// Comment UI Elements
const scanCommentsBtn = document.getElementById('scanCommentsBtn');
const commentsSearchBar = document.getElementById('commentsSearchBar');
const commentsList = document.getElementById('commentsList');

// Init
vscode.postMessage({ command: 'getMemories' });

// Main Section Tab Switcher
tabNavMemories.addEventListener('click', () => {
  tabNavMemories.classList.add('active');
  tabNavComments.classList.remove('active');
  memoriesSection.classList.add('active');
  commentsSection.classList.remove('active');
});

tabNavComments.addEventListener('click', () => {
  tabNavComments.classList.add('active');
  tabNavMemories.classList.remove('active');
  commentsSection.classList.add('active');
  memoriesSection.classList.remove('active');

  // Trigger scan if comments list is empty
  if (scannedCommentGroups.length === 0) {
    vscode.postMessage({ command: 'scanComments' });
  }
});

// Handle collapsible form toggle
formToggleBtn.addEventListener('click', () => {
  formContainer.classList.toggle('active');
  if (formContainer.classList.contains('active')) {
    triggerText.textContent = '➖ Hide Record Form';
    setTimeout(() => memTitleInput.focus(), 150);
  } else {
    triggerText.textContent = '➕ Record New Memory';
  }
});

// Handle selection pills
document.querySelectorAll('.type-pill').forEach(pill => {
  pill.addEventListener('click', () => {
    document.querySelectorAll('.type-pill').forEach(p => p.classList.remove('active'));
    pill.classList.add('active');
    activeType = pill.getAttribute('data-type');
  });
});

// Handle memory filter tabs
document.querySelectorAll('#tabsBar .tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('#tabsBar .tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    currentFilter = tab.getAttribute('data-filter');
    renderMemories();
  });
});

// Handle comment token filter tabs
document.querySelectorAll('#commentTokensBar .tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('#commentTokensBar .tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    activeTokenFilter = tab.getAttribute('data-token-filter');
    renderComments();
  });
});

// Handle search inputs
searchBar.addEventListener('input', () => {
  renderMemories();
});

commentsSearchBar.addEventListener('input', () => {
  renderComments();
});

// Refresh selection
refreshSelectionBtn.addEventListener('click', () => {
  vscode.postMessage({ command: 'refreshSelection' });
});

// Trigger comment scan
scanCommentsBtn.addEventListener('click', () => {
  commentsList.innerHTML = '<div class="empty-state">Scanning workspace comments...</div>';
  vscode.postMessage({ command: 'scanComments' });
});

// Export Markdown Report
const exportMarkdownBtn = document.getElementById('exportMarkdownBtn');
if (exportMarkdownBtn) {
  exportMarkdownBtn.addEventListener('click', () => {
    vscode.postMessage({ command: 'exportMarkdown' });
  });
}

// Save Memory
saveBtn.addEventListener('click', () => {
  const title = memTitleInput.value.trim();
  const description = memDescInput.value.trim();
  const tags = memTagsInput ? memTagsInput.value.trim() : '';

  if (!title || !description) {
    return; // basic validation
  }

  if (!activeSelection) {
    alert('Please select lines in the active editor before saving a memory.');
    return;
  }

  vscode.postMessage({
    command: 'addMemory',
    title,
    description,
    type: activeType,
    tags
  });

  // Clear input fields
  memTitleInput.value = '';
  memDescInput.value = '';
  if (memTagsInput) memTagsInput.value = '';

  // Collapse the form after saving
  formContainer.classList.remove('active');
  triggerText.textContent = '➕ Record New Memory';
});

// Handle click delegation on memories list
memoriesList.addEventListener('click', event => {
  const target = event.target;

  // Type pill selection inside Edit Form
  const editTypePill = target.closest('.edit-type-grid .type-pill');
  if (editTypePill) {
    event.stopPropagation();
    const parentGrid = editTypePill.closest('.edit-type-grid');
    parentGrid.querySelectorAll('.type-pill').forEach(p => p.classList.remove('active'));
    editTypePill.classList.add('active');
    return;
  }

  // Save Edit button click
  const saveEditBtn = target.closest('.btn-save-edit');
  if (saveEditBtn) {
    event.stopPropagation();
    const card = saveEditBtn.closest('.card');
    const id = card.getAttribute('data-id');
    const titleInput = card.querySelector('.edit-title-input');
    const descInput = card.querySelector('.edit-desc-input');
    const tagsInput = card.querySelector('.edit-tags-input');
    const activePill = card.querySelector('.edit-type-grid .type-pill.active');

    const title = titleInput ? titleInput.value.trim() : '';
    const description = descInput ? descInput.value.trim() : '';
    const tags = tagsInput ? tagsInput.value.trim() : '';
    const type = activePill ? activePill.getAttribute('data-type') : 'note';

    if (!title || !description) {
      return;
    }

    vscode.postMessage({
      command: 'updateMemory',
      id,
      title,
      description,
      type,
      tags
    });

    editingMemoryId = null;
    return;
  }

  // Cancel Edit button click
  const cancelEditBtn = target.closest('.btn-cancel-edit');
  if (cancelEditBtn) {
    event.stopPropagation();
    editingMemoryId = null;
    renderMemories();
    return;
  }

  // Edit icon button click
  const editBtn = target.closest('.action-edit');
  if (editBtn) {
    event.stopPropagation();
    const card = editBtn.closest('.card');
    const id = card.getAttribute('data-id');
    editingMemoryId = (editingMemoryId === id) ? null : id;
    renderMemories();
    return;
  }

  // Re-sync snippet button click
  const resyncBtn = target.closest('.action-resync');
  if (resyncBtn) {
    event.stopPropagation();
    const card = resyncBtn.closest('.card');
    const id = card.getAttribute('data-id');
    vscode.postMessage({
      command: 'resyncMemory',
      id
    });
    return;
  }

  // Copy button click
  const copyBtn = target.closest('.action-copy');
  if (copyBtn) {
    event.stopPropagation();
    copyMemoryText(copyBtn);
    return;
  }

  // Delete button click
  const deleteBtn = target.closest('.action-delete');
  if (deleteBtn) {
    event.stopPropagation();
    const card = deleteBtn.closest('.card');
    const id = card.getAttribute('data-id');
    vscode.postMessage({
      command: 'deleteMemory',
      id
    });
    return;
  }

  // Card click (jump to code)
  const card = target.closest('.card');
  if (card && !card.classList.contains('edit-mode-card')) {
    const filePath = card.getAttribute('data-file-path');
    const lineStart = parseInt(card.getAttribute('data-line-start'), 10);
    const lineEnd = parseInt(card.getAttribute('data-line-end'), 10);
    if (filePath) {
      jumpTo(filePath, lineStart, lineEnd);
    }
  }
});

// Handle click delegation on comments list
commentsList.addEventListener('click', event => {
  const target = event.target;

  // Convert comment to Memory button
  const convertBtn = target.closest('.action-convert-comment');
  if (convertBtn) {
    event.stopPropagation();
    const commentCard = convertBtn.closest('.comment-card');
    const filePath = commentCard.getAttribute('data-file-path');
    const line = parseInt(commentCard.getAttribute('data-line'), 10);
    const token = commentCard.getAttribute('data-token');
    const body = commentCard.getAttribute('data-body');
    const text = commentCard.getAttribute('data-text');

    vscode.postMessage({
      command: 'convertCommentToMemory',
      filePath,
      line,
      token,
      body,
      text
    });
    return;
  }

  // Jump to code when clicking on a comment card
  const commentCard = target.closest('.comment-card');
  if (commentCard) {
    const filePath = commentCard.getAttribute('data-file-path');
    const line = parseInt(commentCard.getAttribute('data-line'), 10);
    if (filePath && !isNaN(line)) {
      jumpTo(filePath, line, line);
    }
  }
});

// Receive messages from extension
window.addEventListener('message', event => {
  const message = event.data;
  switch (message.command) {
    case 'setMemories': {
      memoriesData = message.memories;
      renderMemories();
      break;
    }
    case 'setComments': {
      scannedCommentGroups = message.commentGroups || [];
      renderComments();
      break;
    }
    case 'setActiveSelection': {
      activeSelection = message.selection;
      if (activeSelection) {
        selectionStatus.innerHTML = `${activeSelection.file.split('/').pop()}: L${activeSelection.lineStart}-${activeSelection.lineEnd}`;
        selectionStatus.style.borderColor = 'rgba(16, 185, 129, 0.35)';
        selectionStatus.style.background = 'rgba(16, 185, 129, 0.05)';
      } else {
        selectionStatus.innerText = 'No cursor selection active';
        selectionStatus.style.borderColor = 'var(--vscode-input-border, rgba(255,255,255,0.08))';
        selectionStatus.style.background = 'rgba(255,255,255,0.02)';
      }
      break;
    }
  }
});

// Relative time formatter helper
function getRelativeTimeString(dateString) {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (isNaN(date.getTime())) {
    return 'unknown date';
  }

  if (diffMins < 1) {
    return 'Just now';
  } else if (diffMins < 60) {
    return `${diffMins}m ago`;
  } else if (diffHours < 24) {
    return `${diffHours}h ago`;
  } else if (diffDays === 1) {
    return 'Yesterday';
  } else if (diffDays < 7) {
    return `${diffDays}d ago`;
  } else {
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }
}

// Copy reasoning to clipboard with visual feedback
function copyMemoryText(btn) {
  const card = btn.closest('.card');
  const descEl = card.querySelector('.card-desc');
  if (!descEl) return;
  const text = descEl.innerText;

  navigator.clipboard.writeText(text).then(() => {
    const originalHtml = btn.innerHTML;
    btn.classList.add('copied');
    btn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
    btn.title = 'Copied!';
    
    setTimeout(() => {
      btn.classList.remove('copied');
      btn.innerHTML = originalHtml;
      btn.title = 'Copy Reasoning';
    }, 1500);
  }).catch(err => {
    console.error('Failed to copy text: ', err);
  });
}

function renderMemories() {
  const query = searchBar.value.toLowerCase().trim();
  
  // Calculate Live Counts
  const countAll = memoriesData.length;
  const countDecision = memoriesData.filter(m => m.type === 'decision').length;
  const countBug = memoriesData.filter(m => m.type === 'bug').length;
  const countNote = memoriesData.filter(m => m.type === 'note').length;
  const countFeature = memoriesData.filter(m => m.type === 'feature').length;
  const countStale = memoriesData.filter(m => m.is_stale).length;

  const countAllEl = document.getElementById('countAll');
  if (countAllEl) countAllEl.textContent = countAll;
  const countDecisionEl = document.getElementById('countDecision');
  if (countDecisionEl) countDecisionEl.textContent = countDecision;
  const countBugEl = document.getElementById('countBug');
  if (countBugEl) countBugEl.textContent = countBug;
  const countNoteEl = document.getElementById('countNote');
  if (countNoteEl) countNoteEl.textContent = countNote;
  const countFeatureEl = document.getElementById('countFeature');
  if (countFeatureEl) countFeatureEl.textContent = countFeature;
  const countStaleEl = document.getElementById('countStale');
  if (countStaleEl) countStaleEl.textContent = countStale;

  const filtered = memoriesData.filter(m => {
    if (currentFilter === 'stale') {
      if (!m.is_stale) return false;
    } else if (currentFilter !== 'all' && m.type !== currentFilter) {
      return false;
    }
    
    const matchesQuery = 
      m.title.toLowerCase().includes(query) || 
      m.description.toLowerCase().includes(query) || 
      (m.link && m.link.file_path.toLowerCase().includes(query)) ||
      (m.link && m.link.symbol_name && m.link.symbol_name.toLowerCase().includes(query)) ||
      (m.tags && m.tags.some(t => t.toLowerCase().includes(query)));
      
    return matchesQuery;
  });

  if (filtered.length === 0) {
    memoriesList.innerHTML = `
      <div class="empty-state">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <span>No memories found</span>
        <span style="font-size: 10px; opacity: 0.7; max-width: 180px; margin-top: 4px; line-height: 1.3;">Select text in the editor, right click to record a memory or use the form above.</span>
      </div>
    `;
    return;
  }

  memoriesList.innerHTML = filtered.map(m => {
    const linkInfo = m.link ? `${m.link.file_path.split('/').pop()}: L${m.link.line_start}-${m.link.line_end}` : '';
    const fullLinkText = m.link ? `${m.link.file_path}#L${m.link.line_start}` : '';
    const absoluteDate = new Date(m.created_at).toLocaleString();
    const relativeDate = getRelativeTimeString(m.created_at);

    // If card is currently being edited, render inline edit form
    if (editingMemoryId === m.id) {
      return `
        <div class="card edit-mode-card" data-id="${m.id}" data-type="${m.type}">
          <div class="edit-form">
            <div class="form-group">
              <label>Edit Title</label>
              <input type="text" class="edit-title-input" value="${escapeHtml(m.title)}" required />
            </div>
            <div class="form-group">
              <label>Edit Reasoning</label>
              <textarea class="edit-desc-input" rows="3" required>${escapeHtml(m.description)}</textarea>
            </div>
            <div class="form-group">
              <label>Edit Tags</label>
              <input type="text" class="edit-tags-input" value="${m.tags ? escapeHtml(m.tags.join(', ')) : ''}" placeholder="security, perf..." />
            </div>
            <div class="form-group">
              <label>Memory Type</label>
              <div class="type-grid edit-type-grid">
                <div class="type-pill ${m.type === 'decision' ? 'active' : ''}" data-type="decision">🧠 Decision</div>
                <div class="type-pill ${m.type === 'bug' ? 'active' : ''}" data-type="bug">🐞 Bug</div>
                <div class="type-pill ${m.type === 'note' ? 'active' : ''}" data-type="note">📝 Note</div>
                <div class="type-pill ${m.type === 'feature' ? 'active' : ''}" data-type="feature">🌟 Feature</div>
              </div>
            </div>
            <div class="edit-actions-row">
              <button class="btn-primary btn-save-edit">Save Changes</button>
              <button class="btn-secondary btn-cancel-edit">Cancel</button>
            </div>
          </div>
        </div>
      `;
    }

    return `
      <div class="card ${m.is_stale ? 'card-stale' : ''}" data-id="${m.id}" data-type="${m.type}" data-has-link="${!!m.link}" data-file-path="${m.link ? m.link.file_path : ''}" data-line-start="${m.link ? m.link.line_start : 0}" data-line-end="${m.link ? m.link.line_end : 0}" title="${m.link ? 'Click to jump to code' : ''}">
        <div class="card-header">
          <div class="card-title-row">
            <span class="modern-badge badge-${m.type}">
              <span class="badge-dot"></span>
              ${m.type}
            </span>
            <h4 class="card-title">${escapeHtml(m.title)}</h4>
          </div>
          <div class="card-actions">
            ${m.is_stale ? `
              <button class="action-btn action-resync" title="Re-sync code snippet with current file lines">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
              </button>
            ` : ''}
            <button class="action-btn action-edit" title="Edit Memory">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </button>
            <button class="action-btn action-copy" title="Copy Reasoning">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
            </button>
            <button class="action-btn action-delete" title="Delete Memory">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
            </button>
          </div>
        </div>

        ${m.link ? `
          <div class="card-location-row">
            <div class="card-link-path" title="${fullLinkText}">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
              ${linkInfo}
            </div>
            ${m.link.symbol_name ? `
              <span class="symbol-badge" title="${m.link.symbol_type || 'symbol'}: ${escapeHtml(m.link.symbol_name)}">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 18l6-6-6-6"/><path d="M8 6l-6 6 6 6"/></svg>
                ${escapeHtml(m.link.symbol_name)}
              </span>
            ` : ''}
            ${m.is_stale ? `
              <span class="stale-badge" title="${m.stale_reason === 'file_not_found' ? 'Linked file not found on disk' : 'Target lines code has been modified'}">
                ⚠️ ${m.stale_reason === 'file_not_found' ? 'File Missing' : 'Code Modified'}
              </span>
            ` : ''}
          </div>
        ` : ''}

        <div class="card-desc">${escapeHtml(m.description)}</div>
        ${m.tags && m.tags.length > 0 ? `
          <div class="card-tags-row">
            ${m.tags.map(t => `<span class="tag-badge">#${escapeHtml(t)}</span>`).join('')}
          </div>
        ` : ''}
        ${m.is_stale ? `
          <div class="card-code-container diff-container">
            <div class="diff-block diff-old">
              <div class="diff-header-label">- Recorded Code (Original):</div>
              <pre class="card-code-snippet diff-snippet-old"><code>${m.link && m.link.code_snippet ? escapeHtml(m.link.code_snippet) : '(No original snippet captured)'}</code></pre>
            </div>
            ${m.current_snippet !== null && m.current_snippet !== '' ? `
              <div class="diff-block diff-new">
                <div class="diff-header-label">+ Current Code (On Disk):</div>
                <pre class="card-code-snippet diff-snippet-new"><code>${escapeHtml(m.current_snippet)}</code></pre>
              </div>
            ` : `
              <div class="diff-block diff-missing-notice">
                <div class="diff-header-label">⚠️ Linked file deleted or lines removed on disk</div>
              </div>
            `}
          </div>
        ` : (m.link && m.link.code_snippet ? `
          <div class="card-code-container">
            <pre class="card-code-snippet"><code>${escapeHtml(m.link.code_snippet)}</code></pre>
          </div>
        ` : '')}
        <div class="card-meta">
          <div class="card-footer-row">
            <span title="${absoluteDate}">${relativeDate}</span>
            <span class="footer-dot">•</span>
            <span>${m.created_by}</span>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function renderComments() {
  const query = commentsSearchBar.value.toLowerCase().trim();

  // Aggregate all comments across file groups
  let allComments = [];
  scannedCommentGroups.forEach(group => {
    group.comments.forEach(comment => {
      allComments.push(comment);
    });
  });

  // Calculate live counts
  const countAll = allComments.length;
  const countTODO = allComments.filter(c => c.token === 'TODO').length;
  const countFIXME = allComments.filter(c => c.token === 'FIXME').length;
  const countBUG = allComments.filter(c => c.token === 'BUG').length;
  const countREASON = allComments.filter(c => c.token === 'REASON' || c.token === 'MEMORY').length;
  const countNOTE = allComments.filter(c => c.token === 'NOTE' || c.token === 'OPTIMIZE').length;

  document.getElementById('countTokenAll').textContent = countAll;
  document.getElementById('countTokenTODO').textContent = countTODO;
  document.getElementById('countTokenFIXME').textContent = countFIXME;
  document.getElementById('countTokenBUG').textContent = countBUG;
  document.getElementById('countTokenREASON').textContent = countREASON;
  document.getElementById('countTokenNOTE').textContent = countNOTE;

  // Filter groups
  const filteredGroups = [];

  scannedCommentGroups.forEach(group => {
    const matchingComments = group.comments.filter(c => {
      // Token filter match
      if (activeTokenFilter === 'TODO' && c.token !== 'TODO') return false;
      if (activeTokenFilter === 'FIXME' && c.token !== 'FIXME') return false;
      if (activeTokenFilter === 'BUG' && c.token !== 'BUG') return false;
      if (activeTokenFilter === 'REASON' && (c.token !== 'REASON' && c.token !== 'MEMORY')) return false;
      if (activeTokenFilter === 'NOTE' && (c.token !== 'NOTE' && c.token !== 'OPTIMIZE')) return false;

      // Text query match
      if (query) {
        const matchesText =
          c.text.toLowerCase().includes(query) ||
          c.body.toLowerCase().includes(query) ||
          c.token.toLowerCase().includes(query) ||
          c.filePath.toLowerCase().includes(query);
        if (!matchesText) return false;
      }

      return true;
    });

    if (matchingComments.length > 0) {
      filteredGroups.push({
        ...group,
        comments: matchingComments
      });
    }
  });

  if (filteredGroups.length === 0) {
    commentsList.innerHTML = `
      <div class="empty-state">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
        <span>No matching comments found</span>
        <span style="font-size: 10px; opacity: 0.7; max-width: 180px; margin-top: 4px; line-height: 1.3;">Click "Scan Workspace Comments" or change token filter.</span>
      </div>
    `;
    return;
  }

  commentsList.innerHTML = filteredGroups.map(group => `
    <div class="comment-file-group">
      <div class="file-group-header">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
        <span class="file-group-path">${escapeHtml(group.filePath)}</span>
        <span class="file-group-count">${group.comments.length}</span>
      </div>

      <div class="file-comments-body">
        ${group.comments.map(c => `
          <div class="comment-card comment-token-${c.token.toLowerCase()}" data-file-path="${escapeHtml(c.filePath)}" data-line="${c.line}" data-token="${escapeHtml(c.token)}" data-body="${escapeHtml(c.body)}" data-text="${escapeHtml(c.text)}">
            <div class="comment-card-top">
              <span class="token-badge badge-${c.token.toLowerCase()}">${c.token}</span>
              <span class="comment-line-num">L${c.line}</span>
            </div>
            <div class="comment-body-text">${escapeHtml(c.body || c.text)}</div>
            <div class="comment-card-actions">
              <button class="btn-convert-memory action-convert-comment" title="Promote comment into a permanent Project Memory">
                🧠 Convert to Memory
              </button>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `).join('');
}

function jumpTo(filePath, lineStart, lineEnd) {
  vscode.postMessage({
    command: 'jumpTo',
    filePath,
    lineStart,
    lineEnd
  });
}

function escapeHtml(str) {
  return (str || '')
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
