const vscode = acquireVsCodeApi();

let activeSelection = null;
let memoriesData = [];
let activeType = 'decision';
let currentFilter = 'all';
let editingMemoryId = null;

// UI elements
const memTitleInput = document.getElementById('memTitle');
const memDescInput = document.getElementById('memDesc');
const saveBtn = document.getElementById('saveMemoryBtn');
const selectionStatus = document.getElementById('selectionStatus');
const memoriesList = document.getElementById('memoriesList');
const searchBar = document.getElementById('searchBar');
const refreshSelectionBtn = document.getElementById('refreshSelection');

const formContainer = document.getElementById('collapsibleFormContainer');
const formToggleBtn = document.getElementById('formToggleBtn');
const triggerText = formToggleBtn.querySelector('.trigger-text');

// Init
vscode.postMessage({ command: 'getMemories' });

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

// Handle filter tabs
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    currentFilter = tab.getAttribute('data-filter');
    renderMemories();
  });
});

// Handle search input
searchBar.addEventListener('input', () => {
  renderMemories();
});

// Refresh selection
refreshSelectionBtn.addEventListener('click', () => {
  vscode.postMessage({ command: 'refreshSelection' });
});

// Save Memory
saveBtn.addEventListener('click', () => {
  const title = memTitleInput.value.trim();
  const description = memDescInput.value.trim();

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
    type: activeType
  });

  // Clear input fields
  memTitleInput.value = '';
  memDescInput.value = '';

  // Collapse the form after saving
  formContainer.classList.remove('active');
  triggerText.textContent = '➕ Record New Memory';
});

// Handle click delegation on memories list (resolves CSP block on inline onclicks)
memoriesList.addEventListener('click', event => {
  const target = event.target;

  // 1. Type pill selection inside Edit Form
  const editTypePill = target.closest('.edit-type-grid .type-pill');
  if (editTypePill) {
    event.stopPropagation();
    const parentGrid = editTypePill.closest('.edit-type-grid');
    parentGrid.querySelectorAll('.type-pill').forEach(p => p.classList.remove('active'));
    editTypePill.classList.add('active');
    return;
  }

  // 2. Save Edit button click
  const saveEditBtn = target.closest('.btn-save-edit');
  if (saveEditBtn) {
    event.stopPropagation();
    const card = saveEditBtn.closest('.card');
    const id = card.getAttribute('data-id');
    const titleInput = card.querySelector('.edit-title-input');
    const descInput = card.querySelector('.edit-desc-input');
    const activePill = card.querySelector('.edit-type-grid .type-pill.active');

    const title = titleInput ? titleInput.value.trim() : '';
    const description = descInput ? descInput.value.trim() : '';
    const type = activePill ? activePill.getAttribute('data-type') : 'note';

    if (!title || !description) {
      return;
    }

    vscode.postMessage({
      command: 'updateMemory',
      id,
      title,
      description,
      type
    });

    editingMemoryId = null;
    return;
  }

  // 3. Cancel Edit button click
  const cancelEditBtn = target.closest('.btn-cancel-edit');
  if (cancelEditBtn) {
    event.stopPropagation();
    editingMemoryId = null;
    renderMemories();
    return;
  }

  // 4. Edit icon button click
  const editBtn = target.closest('.action-edit');
  if (editBtn) {
    event.stopPropagation();
    const card = editBtn.closest('.card');
    const id = card.getAttribute('data-id');
    editingMemoryId = (editingMemoryId === id) ? null : id;
    renderMemories();
    return;
  }

  // 5. Copy button click
  const copyBtn = target.closest('.action-copy');
  if (copyBtn) {
    event.stopPropagation();
    copyMemoryText(copyBtn);
    return;
  }

  // 6. Delete button click
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

  // 7. Card click (jump to code)
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

// Receive messages from extension
window.addEventListener('message', event => {
  const message = event.data;
  switch (message.command) {
    case 'setMemories': {
      memoriesData = message.memories;
      renderMemories();
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
  
  const filtered = memoriesData.filter(m => {
    if (currentFilter !== 'all' && m.type !== currentFilter) {
      return false;
    }
    
    const matchesQuery = 
      m.title.toLowerCase().includes(query) || 
      m.description.toLowerCase().includes(query) || 
      (m.link && m.link.file_path.toLowerCase().includes(query));
      
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
      <div class="card" data-id="${m.id}" data-type="${m.type}" data-has-link="${!!m.link}" data-file-path="${m.link ? m.link.file_path : ''}" data-line-start="${m.link ? m.link.line_start : 0}" data-line-end="${m.link ? m.link.line_end : 0}" title="${m.link ? 'Click to jump to code' : ''}">
        <div class="card-actions">
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
        <div class="card-header">
          <h4 class="card-title">${escapeHtml(m.title)}</h4>
        </div>
        <div class="card-desc">${escapeHtml(m.description)}</div>
        ${m.link && m.link.code_snippet ? `
          <div class="card-code-container">
            <pre class="card-code-snippet"><code>${escapeHtml(m.link.code_snippet)}</code></pre>
          </div>
        ` : ''}
        <div class="card-meta">
          ${m.link ? `
            <div class="card-link-path" title="${fullLinkText}">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
              ${linkInfo}
            </div>
          ` : ''}
          <div class="card-footer-row">
            <span class="modern-badge badge-${m.type}">
              <span class="badge-dot"></span>
              ${m.type}
            </span>
            <span class="footer-dot">•</span>
            <span title="${absoluteDate}">${relativeDate}</span>
            <span class="footer-dot">•</span>
            <span>${m.created_by}</span>
          </div>
        </div>
      </div>
    `;
  }).join('');
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
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
