const DB_NAME = 'study-organizer-local';
const DB_VERSION = 1;
const STORE_NAME = 'library';
const LIBRARY_KEY = 'main';
const PRESET_TERMS = ['Prelims', 'Midterms', 'Finals'];
const pageContent = document.getElementById('page-content');
const modalRoot = document.getElementById('modal-root');
const navButtons = [...document.querySelectorAll('[data-page]')];
let db;
let page = 'dashboard';
let currentSearch = '';
let currentClassFilter = 'all';
let state = { classes: [], materials: [], notes: [], tools: [] };
let pendingSave = Promise.resolve();

const id = () => crypto.randomUUID();
const esc = (value = '') => String(value).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const dateValue = (value) => value ? new Date(`${value}T12:00:00`) : null;
const dateLabel = (value, options = { month: 'short', day: 'numeric', year: 'numeric' }) => {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? '' : date.toLocaleDateString(undefined, options);
};
const formatBytes = (bytes = 0) => bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
const allTopics = () => state.classes.flatMap((course) => (course.topics || []).map((topic) => ({ ...topic, classId: course.id, className: course.name })));
const topicById = (topicId) => allTopics().find((topic) => topic.id === topicId);
const classById = (classId) => state.classes.find((course) => course.id === classId);
const termOf = (topic) => topic?.term || '';
const isDueSoon = (value) => {
  if (!value) return false;
  const due = new Date(`${value}T23:59:59`);
  const now = new Date();
  const next = new Date(); next.setDate(now.getDate() + 14); next.setHours(23, 59, 59, 999);
  return due >= new Date(now.getFullYear(), now.getMonth(), now.getDate()) && due <= next;
};

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME, { keyPath: 'key' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function readLibrary() {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const request = transaction.objectStore(STORE_NAME).get(LIBRARY_KEY);
    request.onsuccess = () => resolve(request.result?.data || { classes: [], materials: [], notes: [], tools: [] });
    request.onerror = () => reject(request.error);
  });
}

function persist() {
  const status = document.getElementById('save-status');
  if (status) { status.textContent = 'Saving…'; status.classList.add('saving'); }
  pendingSave = pendingSave.then(() => new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).put({ key: LIBRARY_KEY, data: state });
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error || new Error('Could not save the library.'));
  })).then(() => {
    const currentStatus = document.getElementById('save-status');
    if (currentStatus) { currentStatus.textContent = 'All changes saved'; currentStatus.classList.remove('saving'); }
  }).catch((error) => {
    const currentStatus = document.getElementById('save-status');
    if (currentStatus) { currentStatus.textContent = 'Save failed'; currentStatus.classList.remove('saving'); }
    toast(`Could not save locally: ${error.message}`, true);
  });
  return pendingSave;
}

function toast(message, error = false) {
  const region = document.getElementById('toast-region');
  const item = document.createElement('div'); item.className = `toast${error ? ' error' : ''}`; item.textContent = message;
  region.append(item); setTimeout(() => item.remove(), 3500);
}

function navigate(nextPage) {
  page = nextPage; currentSearch = ''; currentClassFilter = 'all';
  navButtons.forEach((button) => button.classList.toggle('active', button.dataset.page === page));
  const labels = { dashboard: 'Overview', classes: 'Classes', materials: 'Materials', notes: 'Notes', tools: 'Study Tools' };
  document.getElementById('breadcrumb').innerHTML = `Your workspace <span>/</span> ${labels[page]}`;
  render();
}

function render() {
  const pages = { dashboard: renderDashboard, classes: renderClasses, materials: renderMaterials, notes: renderNotes, tools: renderTools };
  (pages[page] || renderDashboard)();
}

function pageHeading(title, description, action = '') {
  return `<div class="page-heading"><div><div class="eyebrow">Study Organizer</div><h1>${title}</h1><p>${description}</p></div>${action ? `<div class="heading-actions">${action}</div>` : ''}</div>`;
}

function blankState(title, text, button = '') {
  return `<div class="empty-state"><div class="empty-illustration">✳</div><strong>${title}</strong>${text}${button ? `<div>${button}</div>` : ''}</div>`;
}

function renderDashboard() {
  const dueItems = state.materials.filter((item) => isDueSoon(item.deadline)).sort((a, b) => a.deadline.localeCompare(b.deadline)).slice(0, 5);
  const recent = [...state.materials].sort((a, b) => (b.addedAt || '').localeCompare(a.addedAt || '')).slice(0, 5);
  pageContent.innerHTML = `
    <div class="welcome-card"><div class="welcome-copy"><div class="eyebrow">Your study space</div><h2>Everything in its place.</h2><p>Keep class materials, notes, and study tools together on this device.</p></div><div class="welcome-mark" aria-hidden="true">✳</div></div>
    <div class="section-title"><h2>Your classes</h2><button class="text-action" data-action="navigate-classes">View all classes →</button></div>
    ${state.classes.length ? `<div class="class-grid">${state.classes.slice(0, 6).map((course) => `<article class="class-card" data-open-class="${course.id}" tabindex="0"><div class="class-card-top"><div class="class-color">${esc(course.name.slice(0, 1).toUpperCase())}</div><span class="card-arrow">↗</span></div><h3>${esc(course.name)}</h3><p>${course.topics.length} ${course.topics.length === 1 ? 'topic' : 'topics'} · ${state.materials.filter((material) => material.topicIds?.some((topicId) => course.topics.some((topic) => topic.id === topicId))).length} materials</p></article>`).join('')}</div>` : blankState('Start with a class', 'Create a class to give your materials and notes a home.', '<button class="button button-primary" data-action="new-class">＋ Add a class</button>')}
    <div class="dashboard-lower"><section class="panel"><div class="panel-heading"><h2>Recently added</h2><button class="text-action" data-action="navigate-materials">All materials →</button></div>${recent.length ? `<div class="list-stack">${recent.map((item) => materialRow(item)).join('')}</div>` : blankState('No materials yet', 'Upload a file to start building your library.', '<button class="button button-secondary" data-action="new-material">Add material</button>')}</section>
    <section class="panel"><div class="panel-heading"><h2>Coming up</h2><span>Next 14 days</span></div>${dueItems.length ? `<div class="list-stack">${dueItems.map((item) => `<div class="list-row"><div class="mini-icon">◷</div><div class="row-copy"><strong>${esc(item.name)}</strong><span>${topicNames(item.topicIds)}</span></div><span class="row-date">${dateLabel(item.deadline, { month: 'short', day: 'numeric' })}</span></div>`).join('')}</div>` : blankState('A little breathing room', 'Optional material deadlines will show here when they’re coming up.')}</section></div>`;
}

function materialRow(item) {
  const ext = (item.name.split('.').pop() || 'file').toLowerCase();
  const typeClass = /pdf/.test(ext) ? 'pdf' : /png|jpg|jpeg|gif|webp/.test(ext) ? 'image' : /ppt|pptx/.test(ext) ? 'slide' : '';
  return `<div class="list-row"><div class="file-icon ${typeClass}">${esc(ext.slice(0, 4).toUpperCase())}</div><div class="row-copy"><strong>${esc(item.name)}</strong><span>${topicNames(item.topicIds) || 'Unassigned'} · ${formatBytes(item.size)}</span></div><span class="row-date">${dateLabel(item.addedAt, { month: 'short', day: 'numeric' })}</span></div>`;
}

function topicNames(topicIds = []) {
  return (topicIds || []).map((topicId) => { const topic = topicById(topicId); return topic ? `${topic.className} · ${topic.name}` : ''; }).filter(Boolean).join(', ');
}

function renderClasses() {
  pageContent.innerHTML = `${pageHeading('Classes', 'Build a clear structure for your courses and topics.', '<button class="button button-primary" data-action="new-class">＋ Add class</button>')}
    ${state.classes.length ? `<div class="class-list">${state.classes.map((course) => `<section class="class-detail content-card"><div class="class-detail-head"><div><h3>${esc(course.name)}</h3><p>${course.topics.length} ${course.topics.length === 1 ? 'topic' : 'topics'}</p></div><div class="heading-actions"><button class="button button-secondary" data-action="edit-class" data-id="${course.id}">Edit</button><button class="button button-secondary" data-action="add-topic" data-class-id="${course.id}">＋ Add topic</button></div></div>
    <div class="topic-chips">${course.topics.map((topic) => `<div class="topic-chip"><button class="topic-chip-main" data-action="filter-topic" data-topic-id="${topic.id}"><strong>${esc(topic.name)}</strong>${termOf(topic) ? `<span class="term-label">${esc(termOf(topic))}</span>` : '<span>No term</span>'}</button><button class="topic-chip-edit" data-action="edit-topic" data-topic-id="${topic.id}" aria-label="Edit ${esc(topic.name)}">···</button></div>`).join('')}${course.topics.length ? '' : '<span class="form-help">Add topics to organize this class.</span>'}</div></section>`).join('')}</div>` : blankState('No classes yet', 'Add a class, then create topics and organize your materials.', '<button class="button button-primary" data-action="new-class">＋ Add a class</button>')}`;
}

function searchToolbar(kind, filters = true) {
  const classOptions = state.classes.map((course) => `<optgroup label="${esc(course.name)}"><option value="class:${course.id}" ${currentClassFilter === `class:${course.id}` ? 'selected' : ''}>All ${esc(course.name)} topics</option>${course.topics.map((topic) => `<option value="topic:${topic.id}" ${currentClassFilter === `topic:${topic.id}` ? 'selected' : ''}>${esc(topic.name)}${topic.term ? ` · ${esc(topic.term)}` : ''}</option>`).join('')}</optgroup>`).join('');
  return `<div class="toolbar-row"><label class="search-bar"><span>⌕</span><input id="content-search" type="search" placeholder="Search ${kind}…" value="${esc(currentSearch)}" /></label>${filters ? `<div class="filters"><select id="class-filter" class="select-filter"><option value="all">All classes and topics</option><option value="unassigned" ${currentClassFilter === 'unassigned' ? 'selected' : ''}>Unassigned</option>${classOptions}</select></div>` : ''}</div>`;
}

function filteredByTopicIds(items) {
  return items.filter((item) => {
    const topicIds = item.topicIds || (item.topicId ? [item.topicId] : []);
    const matchClass = currentClassFilter === 'all' || (currentClassFilter === 'unassigned' ? !topicIds.length : currentClassFilter.startsWith('topic:') ? topicIds.includes(currentClassFilter.slice(6)) : topicIds.some((topicId) => topicById(topicId)?.classId === currentClassFilter.slice(6)));
    const matchSearch = !currentSearch || `${item.name || item.title} ${topicNames(topicIds)}`.toLowerCase().includes(currentSearch.toLowerCase());
    return matchClass && matchSearch;
  });
}

function renderMaterials() {
  const materials = filteredByTopicIds(state.materials).sort((a, b) => (b.addedAt || '').localeCompare(a.addedAt || ''));
  pageContent.innerHTML = `${pageHeading('Materials', 'Files you’ve collected for your classes and topics.', '<button class="button button-primary" data-action="new-material">＋ Add material</button>')}${searchToolbar('materials')}
    ${materials.length ? `<div class="material-grid">${materials.map((item) => materialCard(item)).join('')}</div>` : blankState('No matching materials', state.materials.length ? 'Try a different search or class filter.' : 'Upload PDFs, documents, slides, or images to build your library.', state.materials.length ? '' : '<button class="button button-primary" data-action="new-material">＋ Add material</button>')}`;
}

function materialCard(item) {
  const ext = (item.name.split('.').pop() || 'file').toLowerCase();
  const typeClass = /pdf/.test(ext) ? 'pdf' : /png|jpg|jpeg|gif|webp/.test(ext) ? 'image' : /ppt|pptx/.test(ext) ? 'slide' : '';
  const labels = (item.topicIds || []).map((topicId) => { const topic = topicById(topicId); return topic ? `<span class="tag">${esc(topic.name)}</span>` : ''; }).filter(Boolean).join('');
  return `<article class="material-card content-card"><div class="material-card-head"><div class="file-icon ${typeClass}">${esc(ext.slice(0, 4).toUpperCase())}</div><div><div class="material-title">${esc(item.name)}</div><div class="material-meta">${formatBytes(item.size)} · Added ${dateLabel(item.addedAt, { month: 'short', day: 'numeric' })}</div></div></div><div class="material-tags">${labels || '<span class="tag muted">Unassigned</span>'}${item.deadline ? `<span class="tag muted">Due ${dateLabel(item.deadline, { month: 'short', day: 'numeric' })}</span>` : ''}</div><div class="material-footer"><span>${item.sourceDate ? `Source ${dateLabel(item.sourceDate, { month: 'short', day: 'numeric', year: 'numeric' })}` : 'Local file'}</span><div><button data-action="delete-material" data-id="${item.id}">Remove</button><button data-action="open-material" data-id="${item.id}">Open ↗</button></div></div></article>`;
}

function renderNotes() {
  const notes = filteredByTopicIds(state.notes).sort((a, b) => (b.updatedAt || b.addedAt || '').localeCompare(a.updatedAt || a.addedAt || ''));
  pageContent.innerHTML = `${pageHeading('Notes', 'Your written notes, organized alongside your classes.', '<button class="button button-primary" data-action="new-note">＋ New note</button>')}${searchToolbar('notes')}
    ${notes.length ? `<div class="note-grid">${notes.map((note) => `<article class="note-card content-card" data-action="edit-note" data-id="${note.id}" tabindex="0"><h3>${esc(note.title)}</h3><div class="note-preview">${notePreview(note.body)}</div><div class="material-tags">${note.topicId && topicById(note.topicId) ? `<span class="tag">${esc(topicById(note.topicId).className)} · ${esc(topicById(note.topicId).name)}</span>` : '<span class="tag muted">Unassigned</span>'}</div><div class="note-date">Updated ${dateLabel(note.updatedAt || note.addedAt, { month: 'short', day: 'numeric' })}</div></article>`).join('')}</div>` : blankState('A place for your thinking', 'Create formatted notes and keep them organized by class and topic.', '<button class="button button-primary" data-action="new-note">＋ New note</button>')}`;
}

function notePreview(html = '') {
  const parsed = new DOMParser().parseFromString(sanitizeHtml(html), 'text/html');
  return esc(parsed.body.textContent.trim() || 'An empty note.');
}

function renderTools() {
  const tools = filteredByTopicIds(state.tools).sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
  pageContent.innerHTML = `${pageHeading('Study Tools', 'Flashcards and quizzes, separate from your notes and grouped by class and topic.', '<button class="button button-primary" data-action="new-tool">＋ Create study set</button>')}${searchToolbar('study tools')}
    ${tools.length ? `<div class="tool-grid">${tools.map((tool) => `<article class="tool-card content-card"><div class="tool-card-head"><div class="tool-type ${tool.type === 'quiz' ? 'quiz' : ''}">${tool.type === 'quiz' ? '❔' : '▱'}</div><div><h3>${esc(tool.title)}</h3><span class="badge">${tool.type === 'quiz' ? 'Quiz' : 'Flashcards'} · ${(tool.items || []).length} ${(tool.items || []).length === 1 ? 'item' : 'items'}</span></div></div><p>${tool.topicId && topicById(tool.topicId) ? `${esc(topicById(tool.topicId).className)} · ${esc(topicById(tool.topicId).name)}` : 'Not assigned to a class or topic'}</p><button class="button button-secondary" data-action="study-tool" data-id="${tool.id}">Study set →</button></article>`).join('')}</div>` : blankState('Make a set of your own', 'Write the flashcards and quiz questions you want to practice, then organize the set by class and topic.', '<button class="button button-primary" data-action="new-tool">＋ Create study set</button>')}`;
}

function topicsForClass(classId = '') {
  const courses = classId ? state.classes.filter((course) => course.id === classId) : state.classes;
  return courses.flatMap((course) => course.topics.map((topic) => ({ ...topic, classId: course.id, className: course.name })));
}

function topicSelect(name = 'topicId', selected = '', required = false) {
  return `<select name="${name}" ${required ? 'required' : ''}><option value="">${required ? 'Choose a topic' : 'No topic (optional)'}</option>${topicsForClass().map((topic) => `<option value="${topic.id}" ${topic.id === selected ? 'selected' : ''}>${esc(topic.className)} · ${esc(topic.name)}</option>`).join('')}</select>`;
}

function topicChecklist(selectedIds = []) {
  if (!allTopics().length) return '<div class="form-help">Add a class and topic first, or save this material unassigned.</div>';
  return `<div class="checklist">${topicsForClass().map((topic) => `<label class="check-row"><input type="checkbox" name="topicIds" value="${topic.id}" ${selectedIds.includes(topic.id) ? 'checked' : ''}/><span>${esc(topic.className)} · ${esc(topic.name)}</span></label>`).join('')}</div>`;
}

function showModal(title, description, body, className = '') {
  modalRoot.innerHTML = `<div class="modal-backdrop" data-action="backdrop-close"><section class="modal ${className}" role="dialog" aria-modal="true" aria-label="${esc(title)}"><div class="modal-head"><div><h2>${esc(title)}</h2>${description ? `<p>${esc(description)}</p>` : ''}</div><button class="close-button" data-action="close-modal" aria-label="Close">×</button></div>${body}</section></div>`;
  const modal = modalRoot.querySelector('.modal');
  modalRoot.querySelector('.modal-backdrop').addEventListener('click', (event) => { if (event.target === event.currentTarget) closeModal(); });
  const first = modal.querySelector('input,select,textarea,button,[contenteditable=true]'); first?.focus();
}

function closeModal() { modalRoot.innerHTML = ''; }

function openClassForm() {
  showModal('Add a class', 'Start with a class, then add its topics.', `<form id="class-form"><div class="form-field"><label for="class-name">Class name</label><input id="class-name" name="name" placeholder="e.g. Biology 101" maxlength="80" required /></div><div class="form-actions"><button type="button" class="button button-secondary" data-action="close-modal">Cancel</button><button class="button button-primary">Create class</button></div></form>`);
}

function openEditClassForm(course) {
  showModal('Edit class', 'Rename this class or remove it from your workspace.', `<form id="class-form" data-class-id="${course.id}"><div class="form-field"><label for="class-name">Class name</label><input id="class-name" name="name" value="${esc(course.name)}" maxlength="80" required /></div><div class="form-actions"><button type="button" class="danger-link" data-action="delete-class" data-id="${course.id}">Delete class</button><span style="flex:1"></span><button type="button" class="button button-secondary" data-action="close-modal">Cancel</button><button class="button button-primary">Save changes</button></div></form>`);
}

function openTopicForm(classId = '') {
  if (!state.classes.length) { toast('Add a class before creating a topic.', true); return; }
  const selectedClassId = classId || state.classes[0].id;
  const course = classById(selectedClassId);
  const terms = [...new Set([...(course?.termLabels || PRESET_TERMS), ...PRESET_TERMS])];
  showModal('Add a topic', 'Topics can optionally be grouped by an academic term.', `<form id="topic-form"><div class="form-grid"><div class="form-field full"><label for="topic-class">Class</label><select name="classId" id="topic-class">${state.classes.map((item) => `<option value="${item.id}" ${item.id === selectedClassId ? 'selected' : ''}>${esc(item.name)}</option>`).join('')}</select></div><div class="form-field full"><label for="topic-name">Topic name</label><input id="topic-name" name="name" placeholder="e.g. Cell structure" maxlength="80" required /></div><div class="form-field full"><label for="topic-term">Term (optional)</label><select id="topic-term" name="term"><option value="">No term</option>${terms.map((term) => `<option value="${esc(term)}">${esc(term)}</option>`).join('')}<option value="__custom">Add a custom term…</option></select></div><div class="form-field full" id="custom-term-field" hidden><label for="custom-term">Custom term label</label><input id="custom-term" name="customTerm" placeholder="e.g. Quarter 1" maxlength="40" /></div></div><div class="form-actions"><button type="button" class="button button-secondary" data-action="close-modal">Cancel</button><button class="button button-primary">Create topic</button></div></form>`);
  modalRoot.querySelector('#topic-class').addEventListener('change', (event) => {
    const selected = classById(event.target.value); const select = modalRoot.querySelector('#topic-term');
    const options = [...new Set([...(selected?.termLabels || PRESET_TERMS), ...PRESET_TERMS])];
    select.innerHTML = `<option value="">No term</option>${options.map((term) => `<option value="${esc(term)}">${esc(term)}</option>`).join('')}<option value="__custom">Add a custom term…</option>`;
  });
  modalRoot.querySelector('#topic-term').addEventListener('change', (event) => { modalRoot.querySelector('#custom-term-field').hidden = event.target.value !== '__custom'; });
}

function openEditTopicForm(topic) {
  const course = classById(topic.classId);
  const terms = [...new Set([...(course?.termLabels || PRESET_TERMS), ...PRESET_TERMS, ...(topic.term ? [topic.term] : [])])];
  showModal('Edit topic', 'Rename this topic or change its optional term.', `<form id="topic-form" data-topic-id="${topic.id}"><div class="form-grid"><div class="form-field full"><label>Class</label><input value="${esc(topic.className)}" disabled /></div><div class="form-field full"><label for="topic-name">Topic name</label><input id="topic-name" name="name" value="${esc(topic.name)}" maxlength="80" required /></div><div class="form-field full"><label for="topic-term">Term (optional)</label><select id="topic-term" name="term"><option value="">No term</option>${terms.map((term) => `<option value="${esc(term)}" ${term === topic.term ? 'selected' : ''}>${esc(term)}</option>`).join('')}<option value="__custom">Add a custom term…</option></select></div><div class="form-field full" id="custom-term-field" hidden><label for="custom-term">Custom term label</label><input id="custom-term" name="customTerm" maxlength="40" /></div></div><div class="form-actions"><button type="button" class="danger-link" data-action="delete-topic" data-topic-id="${topic.id}">Delete topic</button><span style="flex:1"></span><button type="button" class="button button-secondary" data-action="close-modal">Cancel</button><button class="button button-primary">Save changes</button></div></form>`);
  modalRoot.querySelector('#topic-term').addEventListener('change', (event) => { modalRoot.querySelector('#custom-term-field').hidden = event.target.value !== '__custom'; });
}

function openMaterialForm() {
  const hasTopics = allTopics().length > 0;
  showModal('Add material', 'Upload a file and add optional dates or topic labels.', `<form id="material-form"><div class="form-grid"><div class="form-field full"><label for="material-file">File</label><input id="material-file" name="file" type="file" accept=".pdf,.doc,.docx,.ppt,.pptx,.png,.jpg,.jpeg,.gif,.webp,image/*,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation" required /><span class="form-help">PDFs, Word documents, slides, and images. Files are saved in this browser.</span></div><div class="form-field"><label for="source-date">Source date (optional)</label><input id="source-date" type="date" name="sourceDate" /></div><div class="form-field"><label for="deadline">Deadline (optional)</label><input id="deadline" type="date" name="deadline" /></div><div class="form-field full"><label>Topics (optional; choose more than one if needed)</label>${topicChecklist()}</div></div><div class="form-actions"><button type="button" class="button button-secondary" data-action="close-modal">Cancel</button><button class="button button-primary">Save material</button></div></form>`, 'modal-wide');
}

function openNoteForm(note = null) {
  const editing = Boolean(note);
  showModal(editing ? 'Edit note' : 'New note', 'Write a note and optionally place it in a class topic.', `<form id="note-form"><div class="form-grid"><div class="form-field full"><label for="note-title">Title</label><input id="note-title" name="title" maxlength="120" placeholder="Give this note a title" value="${esc(note?.title || '')}" required /></div><div class="form-field full"><label for="note-topic">Class and topic (optional)</label>${topicSelect('topicId', note?.topicId || '')}</div><div class="form-field full"><label>Note</label><div class="toolbar" role="toolbar" aria-label="Note formatting"><button type="button" data-format="bold"><b>B</b></button><button type="button" data-format="italic"><i>I</i></button><button type="button" data-format="underline"><u>U</u></button><button type="button" data-format="formatBlock" data-value="H2">Heading</button><button type="button" data-format="insertUnorderedList">• List</button><button type="button" data-format="formatBlock" data-value="BLOCKQUOTE">Quote</button></div><div id="note-editor" class="rich-editor" contenteditable="true" role="textbox" aria-multiline="true" data-placeholder="Start writing…">${sanitizeHtml(note?.body || '')}</div><span class="form-help">Formatting is saved with your note.</span></div></div><div class="form-actions">${editing ? `<button type="button" class="danger-link" data-action="delete-note" data-id="${note.id}">Delete note</button>` : ''}<span style="flex:1"></span><button type="button" class="button button-secondary" data-action="close-modal">Cancel</button><button class="button button-primary">Save note</button></div></form>`, 'modal-wide');
  modalRoot.querySelectorAll('[data-format]').forEach((button) => button.addEventListener('click', () => {
    modalRoot.querySelector('#note-editor').focus();
    document.execCommand(button.dataset.format, false, button.dataset.value || null);
  }));
}

function openToolForm(tool = null) {
  if (!allTopics().length) { toast('Add a class and topic before creating a study set.', true); return; }
  const editing = Boolean(tool);
  const items = tool?.items?.length ? tool.items : [{ prompt: '', answer: '' }];
  showModal(editing ? 'Edit study set' : 'Create study set', 'Write your own flashcards or quiz questions, then organize the set by class and topic.', `<form id="tool-form"><div class="form-grid"><div class="form-field"><label for="tool-title">Set name</label><input id="tool-title" name="title" maxlength="120" value="${esc(tool?.title || '')}" placeholder="e.g. Cell structure review" required /></div><div class="form-field"><label for="tool-type">Set type</label><select name="type" id="tool-type"><option value="flashcards" ${tool?.type !== 'quiz' ? 'selected' : ''}>Flashcards</option><option value="quiz" ${tool?.type === 'quiz' ? 'selected' : ''}>Quiz questions</option></select></div><div class="form-field full"><label for="tool-topic">Class and topic</label>${topicSelect('topicId', tool?.topicId || '', true)}</div><div class="form-field full"><label id="items-label">${tool?.type === 'quiz' ? 'Questions and answers' : 'Fronts and backs'}</label><div id="tool-items">${items.map((item, index) => itemEditor(item, index, tool?.type === 'quiz')).join('')}</div><button type="button" class="button button-secondary" style="margin-top:9px" data-action="add-tool-item">＋ Add ${tool?.type === 'quiz' ? 'question' : 'flashcard'}</button></div></div><div class="form-actions">${editing ? `<button type="button" class="danger-link" data-action="delete-tool" data-id="${tool.id}">Delete set</button>` : ''}<span style="flex:1"></span><button type="button" class="button button-secondary" data-action="close-modal">Cancel</button><button class="button button-primary">Save set</button></div></form>`, 'modal-wide');
  modalRoot.querySelector('#tool-type').addEventListener('change', (event) => {
    const quiz = event.target.value === 'quiz'; modalRoot.querySelector('#items-label').textContent = quiz ? 'Questions and answers' : 'Fronts and backs';
    modalRoot.querySelectorAll('.tool-item').forEach((element, index) => { element.innerHTML = itemEditor({ prompt: element.querySelector('[data-field=prompt]').value, answer: element.querySelector('[data-field=answer]').value }, index, quiz); });
    modalRoot.querySelector('[data-action=add-tool-item]').textContent = `＋ Add ${quiz ? 'question' : 'flashcard'}`;
  });
}

function itemEditor(item, index, quiz) {
  return `<div class="tool-item content-card" style="padding:12px;margin-top:8px"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><span class="form-help">${quiz ? 'Question' : 'Card'} ${index + 1}</span>${index ? `<button type="button" class="danger-link" data-action="remove-tool-item">Remove</button>` : ''}</div><div class="form-grid"><div class="form-field"><label>${quiz ? 'Question' : 'Front'}</label><textarea data-field="prompt" rows="2" placeholder="${quiz ? 'Write a question' : 'Write the front of the card'}" required>${esc(item.prompt || '')}</textarea></div><div class="form-field"><label>${quiz ? 'Answer' : 'Back'}</label><textarea data-field="answer" rows="2" placeholder="${quiz ? 'Write the answer' : 'Write the back of the card'}" required>${esc(item.answer || '')}</textarea></div></div></div>`;
}

function openStudyMode(tool) {
  if (!tool.items?.length) { toast('This study set has no cards yet.', true); return; }
  let index = 0; let revealed = false;
  const quiz = tool.type === 'quiz';
  const draw = () => {
    const item = tool.items[index];
    showModal(tool.title, `${quiz ? 'Question' : 'Flashcard'} ${index + 1} of ${tool.items.length}`, `<div class="study-card"><div><div class="side-label">${revealed ? 'Answer' : quiz ? 'Question' : 'Front'}</div><div class="study-text">${esc(revealed ? item.answer : item.prompt)}</div></div></div><div class="study-controls"><button class="button button-secondary" data-action="study-prev" ${index === 0 ? 'disabled' : ''}>← Previous</button><span class="study-progress">${index + 1} / ${tool.items.length}</span><button class="button button-primary" data-action="study-reveal">${revealed ? 'Show prompt' : quiz ? 'Reveal answer' : 'Flip card'}</button><button class="button button-secondary" data-action="study-next" ${index === tool.items.length - 1 ? 'disabled' : ''}>Next →</button></div><div class="form-actions" style="justify-content:space-between"><button class="danger-link" data-action="edit-tool" data-id="${tool.id}">Edit set</button><button class="button button-quiet" data-action="close-modal">Done</button></div>`, 'modal-wide');
    modalRoot.querySelector('[data-action=study-reveal]').addEventListener('click', () => { revealed = !revealed; draw(); });
    modalRoot.querySelector('[data-action=study-next]').addEventListener('click', () => { index += 1; revealed = false; draw(); });
    modalRoot.querySelector('[data-action=study-prev]').addEventListener('click', () => { index -= 1; revealed = false; draw(); });
  };
  draw();
}

function openMaterial(item) {
  if (!item.blob) { toast('This file is missing. Restore it from a library backup.', true); return; }
  const url = URL.createObjectURL(item.blob);
  const type = item.blob.type || '';
  let content = '';
  if (type === 'application/pdf') content = `<iframe title="${esc(item.name)}" src="${url}"></iframe>`;
  else if (type.startsWith('image/')) content = `<img src="${url}" alt="${esc(item.name)}" />`;
  else content = `<div class="reader-fallback"><div class="empty-illustration">▧</div><strong>${esc(item.name)}</strong><p>This format may not preview in the browser.</p><a class="button button-primary" href="${url}" download="${esc(item.name)}">Download file</a></div>`;
  showModal(item.name, `${formatBytes(item.size)} · ${topicNames(item.topicIds) || 'Unassigned'}`, `<div class="reader-content">${content}</div><div class="form-actions"><a class="button button-secondary" href="${url}" download="${esc(item.name)}">Download</a><button class="button button-primary" data-action="close-modal">Done</button></div>`, 'modal-reader');
  modalRoot.querySelector('[data-action=close-modal]').addEventListener('click', () => URL.revokeObjectURL(url));
  modalRoot.querySelector('.close-button')?.addEventListener('click', () => URL.revokeObjectURL(url));
}

function sanitizeHtml(html) {
  const parsed = new DOMParser().parseFromString(String(html || ''), 'text/html');
  const allowed = new Set(['P', 'BR', 'STRONG', 'B', 'EM', 'I', 'U', 'H2', 'H3', 'UL', 'OL', 'LI', 'A', 'BLOCKQUOTE']);
  const cleanNode = (node) => {
    [...node.childNodes].forEach((child) => {
      if (child.nodeType === Node.ELEMENT_NODE) {
        if (!allowed.has(child.tagName)) {
          if (['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'SVG', 'MATH'].includes(child.tagName)) { child.remove(); return; }
          cleanNode(child); child.replaceWith(...child.childNodes); return;
        }
        const href = child.tagName === 'A' ? child.getAttribute('href') : null;
        [...child.attributes].forEach((attribute) => child.removeAttribute(attribute.name));
        if (child.tagName === 'A' && href && /^(https?:|mailto:)/i.test(href)) { child.setAttribute('href', href); child.setAttribute('rel', 'noopener noreferrer'); }
        cleanNode(child);
      } else if (child.nodeType !== Node.TEXT_NODE) child.remove();
    });
  };
  cleanNode(parsed.body); return parsed.body.innerHTML;
}

function fileToBase64(blob) {
  return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(',')[1]); reader.onerror = () => reject(reader.error); reader.readAsDataURL(blob); });
}

function base64ToBlob(base64, type = '') {
  const binary = atob(base64); const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new Blob([bytes], { type });
}

async function exportLibrary() {
  try {
    await pendingSave;
    const materials = await Promise.all(state.materials.map(async (item) => ({ ...item, blob: undefined, fileData: item.blob ? await fileToBase64(item.blob) : null, fileType: item.blob?.type || '' })));
    const backup = { format: 'study-organizer-backup', version: 1, exportedAt: new Date().toISOString(), data: { ...state, materials } };
    const blob = new Blob([JSON.stringify(backup)], { type: 'application/json' });
    const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `study-organizer-backup-${new Date().toISOString().slice(0, 10)}.json`; link.click(); URL.revokeObjectURL(link.href);
    toast('Full library backup downloaded.');
  } catch (error) { toast(`Backup could not be created: ${error.message}`, true); }
}

function importLibrary(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async () => {
    try {
      const backup = JSON.parse(reader.result);
      if (backup.format !== 'study-organizer-backup' || backup.version !== 1 || !backup.data) throw new Error('This is not a supported Study Organizer backup.');
      const data = backup.data;
      if (!Array.isArray(data.classes) || !Array.isArray(data.materials) || !Array.isArray(data.notes) || !Array.isArray(data.tools)) throw new Error('The backup is missing library data.');
      if (!confirm('Restoring this backup will replace the library currently saved in this browser. Continue?')) return;
      data.materials = await Promise.all(data.materials.map(async (item) => ({ ...item, blob: item.fileData ? base64ToBlob(item.fileData, item.fileType) : null, fileData: undefined, fileType: undefined })));
      state = data; await persist(); render(); toast('Library backup restored.');
    } catch (error) { toast(error.message || 'Could not read this backup.', true); }
  };
  reader.onerror = () => toast('Could not read that backup file.', true);
  reader.readAsText(file);
}

function handleSubmit(event) {
  const form = event.target;
  if (!(form instanceof HTMLFormElement)) return;
  event.preventDefault(); const values = new FormData(form);
  if (form.id === 'class-form') {
    const name = String(values.get('name')).trim();
    if (!name) return;
    const editId = form.dataset.classId;
    if (editId) { const course = classById(editId); if (course) course.name = name; }
    else state.classes.push({ id: id(), name, topics: [], termLabels: [...PRESET_TERMS] });
    closeModal(); persist(); navigate('classes'); toast(editId ? 'Class updated.' : 'Class created.');
  } else if (form.id === 'topic-form') {
    const editId = form.dataset.topicId; const existingTopic = editId ? topicById(editId) : null;
    const classId = String(values.get('classId') || existingTopic?.classId || ''); const course = classById(classId); const name = String(values.get('name')).trim();
    let term = String(values.get('term') || '');
    if (term === '__custom') term = String(values.get('customTerm') || '').trim();
    if (!course || !name) return;
    if (term && !course.termLabels.includes(term)) course.termLabels.push(term);
    if (editId) { const topic = topicById(editId); if (topic) Object.assign(topic, { name, term }); }
    else course.topics.push({ id: id(), name, term });
    closeModal(); persist(); render(); toast(editId ? 'Topic updated.' : 'Topic created.');
  } else if (form.id === 'material-form') {
    const file = form.querySelector('[name=file]').files?.[0]; if (!file) return;
    const topicIds = [...form.querySelectorAll('[name=topicIds]:checked')].map((input) => input.value);
    state.materials.push({ id: id(), name: file.name, mime: file.type, size: file.size, blob: file, addedAt: new Date().toISOString().slice(0, 10), sourceDate: values.get('sourceDate') || '', deadline: values.get('deadline') || '', topicIds });
    closeModal(); persist(); render(); toast('Material saved in this browser.');
  } else if (form.id === 'note-form') {
    const title = String(values.get('title')).trim(); const body = sanitizeHtml(modalRoot.querySelector('#note-editor').innerHTML); const topicId = String(values.get('topicId') || '');
    if (!title) return;
    const noteId = form.dataset.noteId;
    if (noteId) { const note = state.notes.find((item) => item.id === noteId); Object.assign(note, { title, body, topicId, updatedAt: new Date().toISOString() }); }
    else state.notes.push({ id: id(), title, body, topicId, addedAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    closeModal(); persist(); navigate('notes'); toast('Note saved.');
  } else if (form.id === 'tool-form') {
    const title = String(values.get('title')).trim(); const type = String(values.get('type')); const topicId = String(values.get('topicId'));
    const items = [...form.querySelectorAll('.tool-item')].map((element) => ({ prompt: element.querySelector('[data-field=prompt]').value.trim(), answer: element.querySelector('[data-field=answer]').value.trim() }));
    if (!title || !topicId || !items.length || items.some((item) => !item.prompt || !item.answer)) { toast('Add a topic and complete every prompt and answer.', true); return; }
    const toolId = form.dataset.toolId;
    if (toolId) { const tool = state.tools.find((item) => item.id === toolId); Object.assign(tool, { title, type, topicId, items, updatedAt: new Date().toISOString() }); }
    else state.tools.push({ id: id(), title, type, topicId, items, updatedAt: new Date().toISOString() });
    closeModal(); persist(); navigate('tools'); toast('Study set saved.');
  }
}

function editNote(note) { openNoteForm(note); modalRoot.querySelector('#note-form').dataset.noteId = note.id; }
function editTool(tool) { openToolForm(tool); modalRoot.querySelector('#tool-form').dataset.toolId = tool.id; }

document.addEventListener('click', (event) => {
  const nav = event.target.closest('[data-page]'); if (nav) { navigate(nav.dataset.page); return; }
  const action = event.target.closest('[data-action]');
  if (action) {
    const { action: name, id: itemId } = action.dataset;
    if (name === 'new-class') openClassForm();
    else if (name === 'add-topic') openTopicForm(action.dataset.classId);
    else if (name === 'new-material') openMaterialForm();
    else if (name === 'new-note') openNoteForm();
    else if (name === 'edit-note') { const note = state.notes.find((item) => item.id === itemId); if (note) editNote(note); }
    else if (name === 'edit-class') { const course = classById(itemId); if (course) openEditClassForm(course); }
    else if (name === 'edit-topic') { const topic = topicById(action.dataset.topicId); if (topic) openEditTopicForm(topic); }
    else if (name === 'new-tool') openToolForm();
    else if (name === 'study-tool') { const tool = state.tools.find((item) => item.id === itemId); if (tool) openStudyMode(tool); }
    else if (name === 'edit-tool') { const tool = state.tools.find((item) => item.id === itemId); if (tool) editTool(tool); }
    else if (name === 'open-material') { const item = state.materials.find((material) => material.id === itemId); if (item) openMaterial(item); }
    else if (name === 'close-modal') closeModal();
    else if (name === 'backdrop-close' && event.target === action) closeModal();
    else if (name === 'navigate-classes') navigate('classes');
    else if (name === 'navigate-materials') navigate('materials');
    else if (name === 'add-tool-item') {
      const container = modalRoot.querySelector('#tool-items'); const quiz = modalRoot.querySelector('#tool-type').value === 'quiz';
      container.insertAdjacentHTML('beforeend', itemEditor({ prompt: '', answer: '' }, container.children.length, quiz));
    } else if (name === 'remove-tool-item') { action.closest('.tool-item').remove(); [...modalRoot.querySelectorAll('.tool-item .form-help')].forEach((label, index) => { label.textContent = `${modalRoot.querySelector('#tool-type').value === 'quiz' ? 'Question' : 'Card'} ${index + 1}`; }); }
    else if (name === 'delete-note') { if (confirm('Delete this note?')) { state.notes = state.notes.filter((note) => note.id !== itemId); closeModal(); persist(); render(); toast('Note deleted.'); } }
    else if (name === 'delete-tool') { if (confirm('Delete this study set?')) { state.tools = state.tools.filter((tool) => tool.id !== itemId); closeModal(); persist(); render(); toast('Study set deleted.'); } }
    else if (name === 'filter-topic') { navigate('materials'); currentClassFilter = `topic:${action.dataset.topicId}`; render(); }
    else if (name === 'delete-class') {
      const course = classById(itemId);
      if (course && confirm(`Delete ${course.name}? Its materials, notes, and study sets will stay in your library without a class or topic.`)) {
        const topicIds = course.topics.map((topic) => topic.id);
        state.materials.forEach((material) => { material.topicIds = (material.topicIds || []).filter((topicId) => !topicIds.includes(topicId)); });
        state.notes.forEach((note) => { if (topicIds.includes(note.topicId)) note.topicId = ''; });
        state.tools.forEach((tool) => { if (topicIds.includes(tool.topicId)) tool.topicId = ''; });
        state.classes = state.classes.filter((item) => item.id !== itemId); closeModal(); persist(); navigate('classes'); toast('Class deleted.');
      }
    } else if (name === 'delete-topic') {
      const topicId = action.dataset.topicId; const topic = topicById(topicId);
      if (topic && confirm(`Delete “${topic.name}”? Linked materials, notes, and study sets will remain unassigned.`)) {
        state.classes.forEach((course) => { course.topics = course.topics.filter((item) => item.id !== topicId); });
        state.materials.forEach((material) => { material.topicIds = (material.topicIds || []).filter((item) => item !== topicId); });
        state.notes.forEach((note) => { if (note.topicId === topicId) note.topicId = ''; });
        state.tools.forEach((tool) => { if (tool.topicId === topicId) tool.topicId = ''; });
        closeModal(); persist(); navigate('classes'); toast('Topic deleted.');
      }
    } else if (name === 'delete-material') {
      if (confirm('Remove this material from your library?')) { state.materials = state.materials.filter((item) => item.id !== itemId); closeModal(); persist(); render(); toast('Material removed.'); }
    }
    return;
  }
  const classCard = event.target.closest('[data-open-class]');
  if (classCard) { navigate('materials'); currentClassFilter = `class:${classCard.dataset.openClass}`; render(); }
});

document.addEventListener('submit', handleSubmit);
document.addEventListener('input', (event) => {
  if (event.target.id === 'content-search') { currentSearch = event.target.value; const selection = event.target.selectionStart; render(); const replacement = document.getElementById('content-search'); replacement?.focus(); replacement?.setSelectionRange(selection, selection); }
});
document.addEventListener('change', (event) => {
  if (event.target.id === 'class-filter') { currentClassFilter = event.target.value; render(); }
  if (event.target.id === 'backup-file') { importLibrary(event.target.files?.[0]); event.target.value = ''; }
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && modalRoot.firstElementChild) closeModal();
  if ((event.key === 'Enter' || event.key === ' ') && event.target.matches('[data-open-class]')) { event.preventDefault(); event.target.click(); }
});
document.getElementById('export-library').addEventListener('click', exportLibrary);
document.getElementById('import-library').addEventListener('click', () => document.getElementById('backup-file').click());
document.getElementById('mobile-export-library').addEventListener('click', exportLibrary);
document.getElementById('mobile-import-library').addEventListener('click', () => document.getElementById('backup-file').click());
document.getElementById('top-add').addEventListener('click', openMaterialForm);

async function start() {
  try { db = await openDb(); state = await readLibrary(); render(); }
  catch (error) {
    pageContent.innerHTML = `<section class="panel">${blankState('Local storage is unavailable', `This browser could not open the saved library (${esc(error.message)}). Try opening the app in a modern browser with site storage enabled.`)}</section>`;
    document.getElementById('save-status').textContent = 'Storage unavailable';
  }
}

start();
