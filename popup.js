/**
 * popup.js — AI Form Filler Pro v2
 *
 * Features:
 *  1. Multi-provider AI (Groq / Anthropic / OpenAI)
 *  2. 4-layer field detection + Layer-4 AI fallback
 *  3. Profile manager (save/load/export/import)
 *  4. Smart Job Apply — AI answers for custom questions
 *  5. Correction learning per domain
 *  6. Confidence scoring UI
 *  7. Multi-step form navigator (Next button click)
 *  8. Speed control
 *  9. Settings panel with stats
 * 10. Full history + JSON export
 */

'use strict';

/* ══════════════════════════════════════════════════════════
   CONSTANTS
   ══════════════════════════════════════════════════════════ */

const SK = {
  groqKey:       'aiff_v2_groq_key',
  anthropicKey:  'aiff_v2_anthropic_key',
  openaiKey:     'aiff_v2_openai_key',
  provider:      'aiff_v2_provider',
  mode:          'aiff_v2_mode',
  describe:      'aiff_v2_describe',
  resume:        'aiff_v2_resume',
  profiles:      'aiff_v2_profiles',
  history:       'aiff_v2_history',
  corrections:   'aiff_v2_corrections',
  totalFills:    'aiff_v2_totalFills',
  speed:         'aiff_v2_speed',
  activeProfile: 'aiff_v2_active_profile',
};

const PROVIDER_LABELS = {
  groq:      'LLaMA 3.3 · Groq',
  anthropic: 'Claude Haiku · Anthropic',
  openai:    'GPT-4o mini · OpenAI',
};

const PROFILE_ICONS = { job:'💼', freelance:'🧑‍💻', college:'🎓', general:'👤' };

const EXAMPLES = {
  developer: `Sarah Chen, senior frontend engineer, 7 years React/TypeScript. CS from UC Berkeley 2017. San Francisco. sarah@dev.io. +1 415-555-0182. Full-time remote, $160k, 2 weeks notice.`,
  designer:  `Alex Rivera, UX/product designer, 5 years at Figma and Airbnb. BFA Parsons 2019. New York. alex@design.io. +1 212-555-0193. Hybrid roles, $120k, immediately available.`,
  manager:   `James O'Brien, Senior Product Manager, 9 years, ex-Google ex-Stripe. MBA Wharton 2016. NYC. james@pm.io. VP-level role, $220k, start immediately.`,
  student:   `Priya Patel, final-year CS student at IIT Bombay. GPA 8.9/10. Python, React, ML. priya.patel@iitb.ac.in. +91 9876543210. Mumbai. Seeking software engineering internship.`,
};

/* ══════════════════════════════════════════════════════════
   STATE
   ══════════════════════════════════════════════════════════ */

let S = {
  phase:           'idle',
  provider:        'groq',
  groqKey:         '',
  anthropicKey:    '',
  openaiKey:       '',
  mode:            'describe',
  describe:        '',
  resume:          '',
  speed:           14,
  tab:             null,
  tabUrl:          '',
  tabFavicon:      '',
  scannedFields:   [],
  lastValues:      {},
  lastResults:     [],
  profiles:        [],
  activeProfile:   '',
  history:         [],
  corrections:     {},
  totalFills:      0,
  activeTab:       'fill',
  jobContext:      null,
  customAnswers:   {},
  statusMsg:       'Describe yourself and fill any form',
};

/* ══════════════════════════════════════════════════════════
   STORAGE
   ══════════════════════════════════════════════════════════ */

async function loadStorage() {
  const data = await chrome.storage.local.get(Object.values(SK));
  S.groqKey       = data[SK.groqKey]       || '';
  S.anthropicKey  = data[SK.anthropicKey]  || '';
  S.openaiKey     = data[SK.openaiKey]     || '';
  S.provider      = data[SK.provider]      || 'groq';
  S.mode          = data[SK.mode]          || 'describe';
  S.describe      = data[SK.describe]      || '';
  S.resume        = data[SK.resume]        || '';
  S.profiles      = data[SK.profiles]      || [];
  S.history       = data[SK.history]       || [];
  S.corrections   = data[SK.corrections]   || {};
  S.totalFills    = data[SK.totalFills]     || 0;
  S.speed         = data[SK.speed]          || 14;
  S.activeProfile = data[SK.activeProfile]  || '';
}

const save = (key, val) => chrome.storage.local.set({ [key]: val });

/* ══════════════════════════════════════════════════════════
   DOM HELPERS
   ══════════════════════════════════════════════════════════ */

const $  = id => document.getElementById(id);
const show = id => $(id)?.classList.remove('hidden');
const hide = id => $(id)?.classList.add('hidden');
const esc  = s  => (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

/* ══════════════════════════════════════════════════════════
   PHASE / STATUS
   ══════════════════════════════════════════════════════════ */

function setPhase(phase, msg) {
  S.phase = phase;
  if (msg) S.statusMsg = msg;
  const dot  = $('status-dot');
  const text = $('status-text');
  const btn  = $('btn-fill');
  const lbl  = $('fill-label');
  if (dot)  dot.className  = `dot-${phase}`;
  if (text) text.textContent = S.statusMsg;
  if (!btn) return;
  btn.disabled = (phase === 'scanning' || phase === 'ai_calling');
  btn.className = phase === 'running' ? 'running' : phase === 'error' ? 'error' : '';
  if (phase === 'running')    lbl.textContent = 'Stop';
  else if (phase === 'scanning' || phase === 'ai_calling') lbl.textContent = phase === 'scanning' ? 'Scanning…' : 'Thinking…';
  else                        lbl.textContent = 'Fill page with AI →';
}

/* ══════════════════════════════════════════════════════════
   ACTIVE TAB MESSAGING
   ══════════════════════════════════════════════════════════ */

async function sendToTab(msg, timeout = 5000) {
  if (!S.tab) throw new Error('No active tab');
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('Content script timeout')), timeout);
    chrome.tabs.sendMessage(S.tab.id, msg, res => {
      clearTimeout(t);
      chrome.runtime.lastError ? reject(new Error(chrome.runtime.lastError.message)) : resolve(res);
    });
  });
}

async function ensureScript() {
  try { await sendToTab({ type: 'PING' }, 2000); return true; }
  catch {
    try {
      await chrome.scripting.executeScript({ target: { tabId: S.tab.id }, files: ['fieldMap.js'] });
      await chrome.scripting.executeScript({ target: { tabId: S.tab.id }, files: ['content.js'] });
      await new Promise(r => setTimeout(r, 250));
      await sendToTab({ type: 'PING' }, 2000);
      return true;
    } catch { return false; }
  }
}

/* ══════════════════════════════════════════════════════════
   BUILD SYSTEM PROMPT
   ══════════════════════════════════════════════════════════ */

function buildSystemPrompt(fields) {
  const fieldLines = fields.map((f, i) => {
    let line = `[${i}] "${f.label}" — type:${f.type}`;
    if (f.detectedKey) line += ` (detected:${f.detectedKey},conf:${f.confidence})`;
    if (f.options?.length) line += `, options:[${f.options.slice(0,10).map(o=>`"${o}"`).join(',')}]`;
    if (f.currentValue) line += `, current:"${f.currentValue}"`;
    return line;
  }).join('\n');

  return `You are an expert AI form-filling assistant. A web form has these fields:
${fieldLines}

RULES — follow all of them precisely:
- Return ONLY valid JSON. No markdown, no explanations, no extra text.
- Keys are field indices as strings ("0","1","2",…).
- For select/radio: use EXACT option text from the options list.
- For checkboxes: return "yes" if the field should be checked.
- For textarea: write a professional 2-4 sentence response matching the context.
- Omit fields you cannot confidently fill — do NOT include null values.
- Format: email→valid email, phone→+1 xxx-xxx-xxxx or local format, salary→include currency symbol.
- If detected key is given with high confidence, use it to improve accuracy.

Example: {"0":"Jane Smith","1":"jane@email.com","2":"+1 555-0100","5":"Full-time"}`;
}

/* ══════════════════════════════════════════════════════════
   ACTIVE KEY + CORRECTIONS
   ══════════════════════════════════════════════════════════ */

function getActiveKey() {
  if (S.provider === 'anthropic') return S.anthropicKey;
  if (S.provider === 'openai')    return S.openaiKey;
  return S.groqKey;
}

function getDomainCorrections() {
  if (!S.tabUrl) return {};
  try {
    const host = new URL(S.tabUrl).hostname;
    const out = {};
    for (const [k, v] of Object.entries(S.corrections)) {
      if (k.startsWith(host + '::')) out[k.replace(host + '::', '')] = v;
    }
    return out;
  } catch { return {}; }
}

/* ══════════════════════════════════════════════════════════
   MAIN FILL FLOW
   ══════════════════════════════════════════════════════════ */

let _filling = false;

async function handleFill() {
  if (_filling || S.phase === 'running') { await stopFill(); return; }

  const text = S.activeProfile
    ? (S.profiles.find(p => p.id === S.activeProfile)?.desc || '')
    : (S.mode === 'describe' ? $('inp-describe').value.trim() : $('inp-resume').value.trim());

  if (!text) { setPhase('error', S.activeProfile ? 'Active profile has no text' : 'Enter a description first'); return; }
  if (!getActiveKey().trim()) { setPhase('error', 'API key required — open Settings'); return; }
  if (!S.tab) { setPhase('error', 'No active tab'); return; }

  _filling = true;
  hide('sec-results');
  hide('confidence-bar');

  setPhase('scanning', 'Accessing page…');
  if (!(await ensureScript())) {
    setPhase('error', "Can't access this page — navigate to a website");
    _filling = false; return;
  }

  setPhase('scanning', 'Scanning form fields…');
  let scanResult;
  try { scanResult = await sendToTab({ type: 'SCAN' }, 5000); }
  catch { setPhase('error', 'Could not scan — reload the page'); _filling = false; return; }

  if (!scanResult?.fields?.length) {
    setPhase('error', 'No form fields found on this page'); _filling = false; return;
  }

  S.scannedFields = scanResult.fields;
  updateFieldBadge(S.scannedFields.length);

  // Check if any fields need Layer-4 AI detection
  const layer4 = S.scannedFields.filter(f => f.needsAI);
  let layer4Mapping = {};
  if (layer4.length > 0) {
    try {
      const hints = layer4.map(f => f.hints || f.label);
      const res = await chrome.runtime.sendMessage({
        type: 'AI_DETECT_FIELDS',
        provider: S.provider,
        apiKey: getActiveKey(),
        fieldHints: hints,
      });
      if (res.ok) layer4Mapping = res.mapping || {};
    } catch {}
  }

  // Merge AI-detected keys back into fields
  layer4.forEach((f, i) => {
    if (layer4Mapping[f.hints || f.label]) {
      f.detectedKey  = layer4Mapping[f.hints || f.label];
      f.confidence   = 'medium';
    }
  });

  setPhase('ai_calling', `Found ${S.scannedFields.length} fields — asking AI…`);

  const corrHint = getDomainCorrections();
  const sysPmt = buildSystemPrompt(S.scannedFields);

  const aiRes = await new Promise(resolve => {
    chrome.runtime.sendMessage({
      type: 'AI_FILL',
      provider: S.provider,
      apiKey: getActiveKey(),
      systemPrompt: sysPmt,
      userText: text,
      corrections: corrHint,
    }, resolve);
  });

  if (!aiRes?.ok) {
    setPhase('error', aiRes?.error || 'AI call failed');
    _filling = false; return;
  }

  S.lastValues = aiRes.values;
  const filledCount = Object.keys(aiRes.values).length;
  setPhase('running', `Filling ${filledCount} fields…`);

  try {
    await sendToTab({ type: 'FILL', values: aiRes.values, speed: S.speed }, 10000);
  } catch {
    setPhase('error', 'Fill failed — reload the page');
    _filling = false; return;
  }

  setTimeout(() => { if (_filling) { _filling = false; setPhase('done', `${filledCount} field${filledCount!==1?'s':''} filled ✓`); }}, 10000);
}

async function stopFill() {
  if (S.tab) try { await sendToTab({ type: 'ABORT' }, 1000); } catch {}
  _filling = false;
  setPhase('idle', 'Stopped');
}

async function handleScan() {
  if (!S.tab) return;
  if (!(await ensureScript())) { setPhase('error', "Can't access this page"); return; }
  setPhase('scanning', 'Highlighting fields…');
  try {
    const r = await sendToTab({ type: 'HIGHLIGHT' }, 3000);
    const cnt = r?.count || 0;
    updateFieldBadge(cnt);
    if (r?.context?.isJobPage) updatePageTypeBadge('Job page');
    setPhase('idle', cnt > 0 ? `Found ${cnt} field${cnt!==1?'s':''} — highlighted 3s` : 'No fields found');
  } catch { setPhase('error', 'Scan failed — reload the page'); }
}

/* ══════════════════════════════════════════════════════════
   SMART APPLY
   ══════════════════════════════════════════════════════════ */

async function handleAnalyzePage() {
  if (!S.tab) return;
  $('btn-analyze').disabled = true;
  $('btn-analyze').textContent = 'Analyzing…';
  try {
    if (!(await ensureScript())) throw new Error("Can't access page");
    const r = await sendToTab({ type: 'GET_CONTEXT' }, 3000);
    S.jobContext = r?.context || null;
    if (S.jobContext) {
      show('job-context-card');
      hide('apply-not-job');
      $('ctx-role').textContent    = S.jobContext.detectedRole    || '—';
      $('ctx-company').textContent = S.jobContext.detectedCompany || '—';
      $('ctx-nav').textContent     = r.buttons?.hasNext ? 'Multi-step (Next found)' : r.buttons?.hasSubmit ? 'Single-page' : 'Unknown';
      show('apply-actions');
      // Extract custom questions
      const qRes = await sendToTab({ type: 'EXTRACT_QUESTIONS' }, 3000);
      const questions = qRes?.questions || [];
      $('ctx-questions').textContent = questions.length > 0 ? `${questions.length} detected` : 'None';
      if (questions.length > 0) {
        renderQuestions(questions);
        show('questions-list');
      } else {
        hide('questions-list');
      }
    }
  } catch (e) {
    $('apply-status').textContent = 'Error: ' + e.message;
    show('apply-status');
  }
  $('btn-analyze').disabled = false;
  $('btn-analyze').textContent = 'Analyze this page →';
}

function renderQuestions(questions) {
  const list = $('q-items');
  list.innerHTML = '';
  questions.forEach(q => {
    const div = document.createElement('div');
    div.className = 'q-item';
    div.dataset.index = q.index;
    div.innerHTML = `<div class="q-label">${esc(q.label.slice(0,80))}</div><div class="q-answer" id="qa-${q.index}">—</div>`;
    list.appendChild(div);
  });
}

async function handleGenerateAnswers() {
  if (!getActiveKey()) { $('apply-status').textContent = 'API key required'; show('apply-status'); return; }
  const items  = document.querySelectorAll('#q-items .q-item');
  const questions = Array.from(items).map(el => ({ index: parseInt(el.dataset.index), label: el.querySelector('.q-label').textContent }));
  if (!questions.length) return;

  const text = S.mode === 'describe' ? $('inp-describe').value.trim() : $('inp-resume').value.trim();
  $('btn-gen-answers').disabled = true;
  $('btn-gen-answers').textContent = 'Generating…';

  const res = await new Promise(resolve => {
    chrome.runtime.sendMessage({ type: 'AI_ANSWERS', provider: S.provider, apiKey: getActiveKey(), questions, userData: { description: text } }, resolve);
  });

  $('btn-gen-answers').disabled = false;
  $('btn-gen-answers').textContent = 'Generate AI answers →';

  if (!res?.ok) { $('apply-status').textContent = 'Error: ' + res?.error; show('apply-status'); return; }

  S.customAnswers = res.answers || {};
  for (const [idx, answer] of Object.entries(S.customAnswers)) {
    const el = $(`qa-${idx}`);
    if (el) el.textContent = answer;
  }
  hide('apply-status');
}

async function handleSmartFill() {
  const text = S.mode === 'describe' ? $('inp-describe').value.trim() : $('inp-resume').value.trim();
  if (!text) { $('apply-status').textContent = 'Enter description first'; show('apply-status'); return; }
  if (!getActiveKey()) { $('apply-status').textContent = 'API key required'; show('apply-status'); return; }

  $('btn-smart-fill').disabled = true;
  if (!(await ensureScript())) { $('apply-status').textContent = "Can't access page"; show('apply-status'); $('btn-smart-fill').disabled = false; return; }

  const scanR = await sendToTab({ type: 'SCAN' }, 5000);
  if (!scanR?.fields?.length) { $('apply-status').textContent = 'No fields found'; show('apply-status'); $('btn-smart-fill').disabled = false; return; }
  S.scannedFields = scanR.fields;

  const sysPmt = buildSystemPrompt(S.scannedFields);
  const aiRes = await new Promise(resolve => {
    chrome.runtime.sendMessage({ type: 'AI_FILL', provider: S.provider, apiKey: getActiveKey(), systemPrompt: sysPmt, userText: text, corrections: getDomainCorrections() }, resolve);
  });

  if (!aiRes?.ok) { $('apply-status').textContent = 'AI error: ' + aiRes?.error; show('apply-status'); $('btn-smart-fill').disabled = false; return; }

  await sendToTab({ type: 'FILL', values: aiRes.values, answers: S.customAnswers, speed: S.speed }, 10000);
  $('apply-status').textContent = `✓ Filling ${Object.keys(aiRes.values).length} fields…`;
  show('apply-status');
  $('btn-smart-fill').disabled = false;
}

async function handleClickNext() {
  try {
    const r = await sendToTab({ type: 'CLICK_NEXT' }, 3000);
    $('apply-status').textContent = r.ok ? `✓ Clicked: "${r.clicked}"` : '✗ ' + r.error;
    show('apply-status');
  } catch { $('apply-status').textContent = 'Could not click next button'; show('apply-status'); }
}

/* ══════════════════════════════════════════════════════════
   PROFILES
   ══════════════════════════════════════════════════════════ */

let _editingProfileId = null;

function renderProfiles() {
  const list = $('profile-list');
  if (!list) return;
  if (!S.profiles.length) {
    list.innerHTML = '<p style="font-size:11px;color:var(--text3);text-align:center;padding:16px 0">No profiles yet — click + New</p>';
    return;
  }
  list.innerHTML = S.profiles.map(p => `
    <div class="profile-card ${S.activeProfile===p.id?'active-prof':''}" data-id="${p.id}">
      <span class="prof-icon">${PROFILE_ICONS[p.type]||'👤'}</span>
      <div class="prof-info">
        <div class="prof-name">${esc(p.name)}</div>
        <div class="prof-meta">${esc(p.desc.slice(0,55))}…</div>
      </div>
      <div class="prof-btns">
        <button class="prof-btn" data-action="use" data-id="${p.id}" title="Use this profile">Use</button>
        <button class="prof-btn" data-action="edit" data-id="${p.id}" title="Edit">✎</button>
        <button class="prof-btn danger" data-action="delete" data-id="${p.id}" title="Delete">×</button>
      </div>
    </div>`).join('');

  list.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const id = btn.dataset.id;
      if (btn.dataset.action === 'use')    setActiveProfile(id);
      if (btn.dataset.action === 'edit')   openEditor(id);
      if (btn.dataset.action === 'delete') deleteProfile(id);
    });
  });

  // Update active profile select in settings
  const sel = $('sel-active-profile');
  if (sel) {
    const cur = sel.value;
    sel.innerHTML = '<option value="">— Use description tab —</option>' +
      S.profiles.map(p => `<option value="${p.id}" ${p.id===S.activeProfile?'selected':''}>${esc(p.name)}</option>`).join('');
    sel.value = cur;
  }
}

function setActiveProfile(id) {
  S.activeProfile = S.activeProfile === id ? '' : id;
  save(SK.activeProfile, S.activeProfile);
  renderProfiles();
  updateModelBadge();
}

function openEditor(id = null) {
  _editingProfileId = id;
  const p = id ? S.profiles.find(x => x.id === id) : null;
  $('editor-title').textContent = p ? 'Edit profile' : 'New profile';
  $('prof-name').value = p?.name || '';
  $('prof-desc').value = p?.desc || '';
  $('prof-type').value = p?.type || 'job';
  show('profile-editor');
}

function closeEditor() { hide('profile-editor'); _editingProfileId = null; }

function saveProfile() {
  const name = $('prof-name').value.trim();
  const desc = $('prof-desc').value.trim();
  const type = $('prof-type').value;
  if (!name || !desc) { alert('Name and description required'); return; }
  if (_editingProfileId) {
    const p = S.profiles.find(x => x.id === _editingProfileId);
    if (p) { p.name = name; p.desc = desc; p.type = type; }
  } else {
    S.profiles.push({ id: Date.now().toString(), name, desc, type });
  }
  save(SK.profiles, S.profiles);
  renderProfiles();
  closeEditor();
}

function deleteProfile(id) {
  if (!confirm('Delete this profile?')) return;
  S.profiles = S.profiles.filter(p => p.id !== id);
  if (S.activeProfile === id) { S.activeProfile = ''; save(SK.activeProfile, ''); }
  save(SK.profiles, S.profiles);
  renderProfiles();
}

function exportProfile() {
  const id = _editingProfileId;
  const p = id ? S.profiles.find(x => x.id === id) : null;
  if (!p) return;
  const blob = new Blob([JSON.stringify(p, null, 2)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${p.name.replace(/\s+/g,'_')}.json`; a.click();
}

function importProfile(file) {
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const p = JSON.parse(e.target.result);
      if (!p.name || !p.desc) throw new Error('Invalid profile');
      p.id = Date.now().toString();
      S.profiles.push(p);
      save(SK.profiles, S.profiles);
      renderProfiles();
    } catch { alert('Invalid profile file'); }
  };
  reader.readAsText(file);
}

/* ══════════════════════════════════════════════════════════
   HISTORY
   ══════════════════════════════════════════════════════════ */

function renderHistory() {
  const list = $('history-list');
  if (!list) return;
  if (!S.history.length) {
    list.innerHTML = '<p style="font-size:11px;color:var(--text3);text-align:center;padding:16px 0">No history yet</p>';
    return;
  }
  list.innerHTML = [...S.history].reverse().slice(0,25).map(h => `
    <div class="history-row">
      <span class="hist-site">${esc(h.host)}</span>
      <span class="hist-time">${esc(h.time)}</span>
      <span class="hist-count">${h.count} fields</span>
    </div>`).join('');
}

/* ══════════════════════════════════════════════════════════
   CORRECTIONS
   ══════════════════════════════════════════════════════════ */

function renderCorrections() {
  const list = $('corrections-list');
  if (!list) return;
  const keys = Object.keys(S.corrections);
  if (!keys.length) {
    list.innerHTML = '<p class="info-text" style="padding:8px 0">No corrections yet.<br>Fill forms and edit fields to teach the AI.</p>';
    return;
  }
  list.innerHTML = keys.map(k => {
    const [domain, field] = k.split('::');
    const c = S.corrections[k];
    return `<div class="correction-row">
      <div class="corr-field">${esc(field)} <span style="color:var(--text3);font-size:10px">· ${esc(domain)}</span></div>
      <div class="corr-vals">
        <span class="corr-orig">${esc(c.original)}</span>
        <span class="corr-arrow">→</span>
        <span class="corr-new">${esc(c.corrected)}</span>
      </div>
      <div class="corr-meta">Learned ${c.times}× · improves future fills on ${esc(domain)}</div>
    </div>`;
  }).join('');
}

/* ══════════════════════════════════════════════════════════
   RESULTS + CONFIDENCE
   ══════════════════════════════════════════════════════════ */

function renderResults(results) {
  if (!results?.length) return;
  show('sec-results');
  show('confidence-bar');
  $('results-count').textContent = `${results.length} filled`;

  const highConf = results.filter(r => r.confidence === 'high').length;
  const pct = Math.round((highConf / results.length) * 100);
  $('confidence-fill').style.width = pct + '%';
  $('confidence-label').textContent = `${pct}% high confidence`;

  // Score badge in header
  const scoreBadge = $('score-badge');
  scoreBadge.textContent = `${pct}%`;
  scoreBadge.className = pct >= 80 ? 'score-high' : pct >= 50 ? 'score-mid' : 'score-low';
  show('score-badge');

  $('results-list').innerHTML = results.map(r => {
    const conf = r.confidence || 'low';
    return `<div class="result-row">
      <span class="result-check ${conf}">✓</span>
      <span class="result-label" title="${esc(r.label)}">${esc(r.label.slice(0,16))}</span>
      <span class="result-value" title="${esc(r.value)}">${esc(r.value.slice(0,28))}</span>
      <span class="result-conf conf-${conf}">${conf}</span>
    </div>`;
  }).join('');
}

function copyJSON() {
  const data = {};
  S.lastResults.forEach(r => { data[r.label] = r.value; });
  navigator.clipboard?.writeText(JSON.stringify(data, null, 2));
  $('btn-copy-json').textContent = 'Copied!';
  setTimeout(() => { $('btn-copy-json').textContent = 'Copy JSON'; }, 1500);
}

/* ══════════════════════════════════════════════════════════
   PAGE BAR / BADGES
   ══════════════════════════════════════════════════════════ */

function updatePageBar() {
  const fav = $('page-favicon');
  if (S.tabFavicon) { fav.src = S.tabFavicon; fav.style.display = 'block'; } else { fav.style.display = 'none'; }
  try {
    const host = S.tabUrl ? new URL(S.tabUrl).hostname.replace('www.','') : '—';
    $('page-title').textContent = host;
  } catch { $('page-title').textContent = '—'; }
}

function updateFieldBadge(n) {
  if (n > 0) { $('field-count-badge').textContent = `${n} fields`; show('field-count-badge'); }
  else hide('field-count-badge');
}

function updatePageTypeBadge(label) {
  if (label) { $('page-type-badge').textContent = label; show('page-type-badge'); }
  else hide('page-type-badge');
}

function updateModelBadge() {
  $('model-badge').textContent = PROVIDER_LABELS[S.provider] || '—';
}

function updateFooter() {
  $('ftr-right').textContent = S.totalFills > 0 ? `${S.totalFills} fills` : '';
}

function updateStats() {
  $('stat-total-fills').textContent = S.totalFills;
  $('stat-corrections').textContent = Object.keys(S.corrections).length;
  $('stat-profiles').textContent    = S.profiles.length;
}

/* ══════════════════════════════════════════════════════════
   TAB SWITCHING
   ══════════════════════════════════════════════════════════ */

function switchTab(tabId) {
  S.activeTab = tabId;
  document.querySelectorAll('.main-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tabId));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('hidden', p.id !== `tab-${tabId}`));
  if (tabId === 'history')     renderHistory();
  if (tabId === 'learn')       renderCorrections();
  if (tabId === 'profile')     renderProfiles();
}

/* ══════════════════════════════════════════════════════════
   SETTINGS PANEL
   ══════════════════════════════════════════════════════════ */

function openSettings() { hide('settings-panel'); show('settings-panel'); updateStats(); }
function closeSettings() { hide('settings-panel'); }

function updateProviderRows() {
  $('row-groq-key').classList.toggle('hidden',      S.provider !== 'groq');
  $('row-anthropic-key').classList.toggle('hidden', S.provider !== 'anthropic');
  $('row-openai-key').classList.toggle('hidden',    S.provider !== 'openai');
}

function makeToggle(btnId, inputId) {
  const btn = $(btnId), inp = $(inputId);
  if (!btn || !inp) return;
  btn.addEventListener('click', () => {
    const show = inp.type === 'password';
    inp.type = show ? 'text' : 'password';
    btn.textContent = show ? 'Hide' : 'Show';
  });
}

/* ══════════════════════════════════════════════════════════
   EVENT WIRING
   ══════════════════════════════════════════════════════════ */

function attachEvents() {
  /* Main fill */
  $('btn-fill').addEventListener('click', handleFill);
  $('btn-scan').addEventListener('click', handleScan);

  /* Main tabs */
  document.querySelectorAll('.main-tab').forEach(b =>
    b.addEventListener('click', () => switchTab(b.dataset.tab)));

  /* Mode tabs */
  document.querySelectorAll('.mode-tab').forEach(b => b.addEventListener('click', () => {
    S.mode = b.dataset.mode;
    save(SK.mode, S.mode);
    document.querySelectorAll('.mode-tab').forEach(x => x.classList.toggle('active', x === b));
    $('sec-describe').classList.toggle('hidden', S.mode !== 'describe');
    $('sec-resume').classList.toggle('hidden',   S.mode !== 'resume');
  }));

  /* Describe textarea */
  const dt = $('inp-describe');
  dt.addEventListener('input', () => { S.describe = dt.value; clearTimeout(dt._t); dt._t = setTimeout(() => save(SK.describe, S.describe), 900); });
  dt.addEventListener('keydown', e => { if ((e.ctrlKey||e.metaKey)&&e.key==='Enter'){ e.preventDefault(); handleFill(); }});

  /* Resume textarea */
  const rt = $('inp-resume');
  rt.addEventListener('input', () => { S.resume = rt.value; clearTimeout(rt._t); rt._t = setTimeout(() => save(SK.resume, S.resume), 900); });
  rt.addEventListener('keydown', e => { if ((e.ctrlKey||e.metaKey)&&e.key==='Enter'){ e.preventDefault(); handleFill(); }});

  /* Example chips */
  document.querySelectorAll('.chip[data-example]').forEach(c => c.addEventListener('click', () => {
    $('inp-describe').value = EXAMPLES[c.dataset.example] || '';
    S.describe = $('inp-describe').value;
    save(SK.describe, S.describe);
  }));

  /* Speed buttons */
  document.querySelectorAll('.speed-btn').forEach(b => b.addEventListener('click', () => {
    S.speed = parseInt(b.dataset.speed);
    save(SK.speed, S.speed);
    document.querySelectorAll('.speed-btn').forEach(x => x.classList.toggle('active', x === b));
  }));

  /* Copy JSON */
  $('btn-copy-json')?.addEventListener('click', copyJSON);

  /* Settings open/close */
  $('btn-settings').addEventListener('click', openSettings);
  $('btn-close-settings').addEventListener('click', closeSettings);

  /* Provider select */
  $('sel-provider').addEventListener('change', e => {
    S.provider = e.target.value;
    save(SK.provider, S.provider);
    updateProviderRows();
    updateModelBadge();
  });

  /* API key inputs */
  $('inp-groq-key').addEventListener('input', e => { S.groqKey = e.target.value; save(SK.groqKey, S.groqKey); });
  $('inp-anthropic-key').addEventListener('input', e => { S.anthropicKey = e.target.value; save(SK.anthropicKey, S.anthropicKey); });
  $('inp-openai-key').addEventListener('input', e => { S.openaiKey = e.target.value; save(SK.openaiKey, S.openaiKey); });

  makeToggle('btn-toggle-groq', 'inp-groq-key');
  makeToggle('btn-toggle-anthropic', 'inp-anthropic-key');
  makeToggle('btn-toggle-openai', 'inp-openai-key');

  /* Active profile in settings */
  $('sel-active-profile').addEventListener('change', e => {
    S.activeProfile = e.target.value;
    save(SK.activeProfile, S.activeProfile);
    renderProfiles();
  });

  /* Clear all */
  $('btn-clear-all').addEventListener('click', async () => {
    if (!confirm('Clear ALL stored data? This cannot be undone.')) return;
    await chrome.storage.local.clear();
    location.reload();
  });

  /* Profile tab */
  $('btn-add-profile').addEventListener('click', () => openEditor());
  $('btn-close-editor').addEventListener('click', closeEditor);
  $('btn-save-profile').addEventListener('click', saveProfile);
  $('btn-export-profile').addEventListener('click', exportProfile);
  $('btn-import-profile').addEventListener('click', () => $('inp-import').click());
  $('inp-import').addEventListener('change', e => { if (e.target.files[0]) importProfile(e.target.files[0]); });

  /* History + corrections clear */
  $('btn-clear-history').addEventListener('click', async () => {
    S.history = []; await save(SK.history, []); renderHistory();
  });
  $('btn-clear-corrections').addEventListener('click', async () => {
    S.corrections = {}; await save(SK.corrections, {}); renderCorrections(); updateStats();
  });

  /* Smart Apply tab */
  $('btn-analyze').addEventListener('click', handleAnalyzePage);
  $('btn-gen-answers').addEventListener('click', handleGenerateAnswers);
  $('btn-smart-fill').addEventListener('click', handleSmartFill);
  $('btn-click-next').addEventListener('click', handleClickNext);

  /* FILL_DONE from content script */
  chrome.runtime.onMessage.addListener(msg => {
    if (msg.type !== 'FILL_DONE') return;
    _filling = false;
    S.lastResults    = msg.results || [];
    const count = msg.filledCount || 0;
    setPhase('done', `${count} field${count!==1?'s':''} filled ✓`);
    renderResults(S.lastResults);

    // Save history
    const host = S.tabUrl ? (new URL(S.tabUrl).hostname.replace('www.','')) : 'unknown';
    S.history = [{ host, count, time: new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}), date: new Date().toLocaleDateString() }, ...S.history].slice(0,50);
    save(SK.history, S.history);
    S.totalFills += count;
    save(SK.totalFills, S.totalFills);
    updateFooter();
    updateStats();
  });
}

/* ══════════════════════════════════════════════════════════
   INIT
   ══════════════════════════════════════════════════════════ */

async function init() {
  await loadStorage();

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    S.tab = tab; S.tabUrl = tab?.url || ''; S.tabFavicon = tab?.favIconUrl || '';
  } catch { S.tab = null; }

  // Hydrate form
  $('inp-describe').value = S.describe;
  $('inp-resume').value   = S.resume;
  $('inp-groq-key').value      = S.groqKey;
  $('inp-anthropic-key').value = S.anthropicKey;
  $('inp-openai-key').value    = S.openaiKey;
  $('sel-provider').value      = S.provider;

  // Mode
  if (S.mode === 'resume') {
    document.querySelector('[data-mode="resume"]')?.classList.add('active');
    document.querySelector('[data-mode="describe"]')?.classList.remove('active');
    show('sec-resume'); hide('sec-describe');
  }

  // Speed
  document.querySelectorAll('.speed-btn').forEach(b =>
    b.classList.toggle('active', parseInt(b.dataset.speed) === S.speed));

  updatePageBar();
  updateModelBadge();
  updateProviderRows();
  updateFooter();
  renderProfiles();

  if (S.tabUrl?.startsWith('chrome://') || S.tabUrl?.startsWith('edge://') || S.tabUrl?.startsWith('about:')) {
    setPhase('error', "Can't access browser pages — navigate to a website");
  }

  attachEvents();
}

document.addEventListener('DOMContentLoaded', init);
