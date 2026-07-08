const vscode = acquireVsCodeApi();

let activeSelection = null;
let memoriesData = [];
let activeType = 'decision';
let currentFilter = 'all';

// UI elements
const memTitleInput = document.getElementById('memTitle');
const memDescInput = document.getElementById('memDesc');
const saveBtn = document.getElementById('saveMemoryBtn');
const selectionStatus = document.getElementById('selectionStatus');
const memoriesList = document.getElementById('memoriesList');
const searchBar = document.getElementById('searchBar');
const refreshSelectionBtn = document.getElementById('refreshSelection');

// Init
vscode.postMessage({ command: 'getMemories' });

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
        selectionStatus.style.borderColor = 'rgba(16, 185, 129, 0.3)';
        selectionStatus.style.background = 'rgba(16, 185, 129, 0.05)';
      } else {
        selectionStatus.innerText = 'No cursor selection active';
        selectionStatus.style.borderColor = 'rgba(255,255,255,0.15)';
        selectionStatus.style.background = 'rgba(255,255,255,0.05)';
      }
      break;
    }
  }
});

function renderMemories() {
  const query = searchBar.value.toLowerCase().trim();
  
  const filtered = memoriesData.filter(m => {
    // filter by type tab
    if (currentFilter !== 'all' && m.type !== currentFilter) {
      return false;
    }
    
    // search matching title, description or file path
    const matchesQuery = 
      m.title.toLowerCase().includes(query) || 
      m.description.toLowerCase().includes(query) || 
      (m.link && m.link.file_path.toLowerCase().includes(query));
      
    return matchesQuery;
  });

  if (filtered.length === 0) {
    memoriesList.innerHTML = '<div class="empty-state">No memories found</div>';
    return;
  }

  memoriesList.innerHTML = filtered.map(m => {
    const linkInfo = m.link ? `${m.link.file_path.split('/').pop()}: L${m.link.line_start}-${m.link.line_end}` : '';
    const fullLinkText = m.link ? `${m.link.file_path}#L${m.link.line_start}` : '';
    const createdDate = new Date(m.created_at).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    return `
      <div class="card" data-type="${m.type}">
        <div class="card-actions">
          <button class="action-btn action-delete" onclick="deleteMemory('${m.id}')" title="Delete Memory">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
          </button>
        </div>
        <div class="card-header">
          <h4 class="card-title">${escapeHtml(m.title)}</h4>
          <span class="card-type-tag tag-${m.type}">${m.type}</span>
        </div>
        <div class="card-desc">${escapeHtml(m.description)}</div>
        <div class="card-meta">
          ${m.link ? `
            <div class="card-link-path" onclick="jumpTo('${m.link.file_path}', ${m.link.line_start}, ${m.link.line_end})" title="Open ${fullLinkText}">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
              ${linkInfo}
            </div>
          ` : ''}
          <div style="opacity:0.7; font-size:10px; margin-top:2px;">${createdDate} by ${m.created_by}</div>
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

function deleteMemory(id) {
  if (confirm('Are you sure you want to delete this memory? This cannot be undone.')) {
    vscode.postMessage({
      command: 'deleteMemory',
      id
    });
  }
}

function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
