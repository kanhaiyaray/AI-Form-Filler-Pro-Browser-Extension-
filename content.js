/**
 * content.js — AI Form Filler Pro v2 Content Script
 *
 * 4-Layer Field Detection:
 *   Layer 1: Input type hints (type="email" → email instantly)
 *   Layer 2: Keyword/semantic map (fast, ~70% accuracy)
 *   Layer 3: Fuzzy normalized match (handles typos/variants)
 *   Layer 4: AI fallback (via background, for ambiguous fields)
 *
 * Features:
 *   - SCAN / FILL / HIGHLIGHT / PING / ABORT / SMART_APPLY
 *   - React/Vue/Angular synthetic event compatibility
 *   - Animated typing with variable speed
 *   - Radio, select, checkbox, textarea all handled
 *   - Correction learning storage per domain
 *   - Multi-step form next-button detection
 *   - Job page detection + custom question answering
 */

'use strict';

/* ── State ── */
let _fields    = [];
let _fillAbort = false;
const ATTR     = 'data-aiff-pro';
const delay    = ms => new Promise(r => setTimeout(r, ms));

/* ── Levenshtein distance (fuzzy matching) ── */
function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i-1] === b[j-1] ? dp[i-1][j-1]
        : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
  return dp[m][n];
}

/* ── Normalize text for matching ── */
function norm(text) {
  return (text || '').toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
}

/* ── Layer 1: Input type → field key ── */
const TYPE_MAP = {
  email: 'email',
  tel:   'phone',
  url:   'linkedin',
};

/* ── Layer 2: Semantic keyword map (imported via fieldMap.js) ── */
function keywordMatch(hintText) {
  if (!window.AIFF_FIELD_MAP) return { key: null, score: 0 };
  const h = norm(hintText);
  let best = null, bestScore = 0;
  for (const [key, keywords] of Object.entries(window.AIFF_FIELD_MAP)) {
    for (const kw of keywords) {
      const k = norm(kw);
      if (h === k) return { key, score: 1.0 }; // exact match → instant
      if (h.includes(k)) {
        const score = k.length / h.length;
        if (score > bestScore) { bestScore = score; best = key; }
      }
    }
  }
  return { key: best, score: bestScore };
}

/* ── Layer 3: Fuzzy match (Levenshtein) ── */
function fuzzyMatch(hintText) {
  if (!window.AIFF_FIELD_MAP) return { key: null, score: 0 };
  const h = norm(hintText);
  let best = null, bestDist = Infinity;
  for (const [key, keywords] of Object.entries(window.AIFF_FIELD_MAP)) {
    for (const kw of keywords) {
      const k = norm(kw);
      const dist = levenshtein(h.slice(0, k.length + 4), k);
      const maxLen = Math.max(h.length, k.length);
      if (dist < bestDist && dist / maxLen < 0.4) {
        bestDist = dist;
        best = key;
      }
    }
  }
  return { key: best, score: best ? 1 - bestDist / 20 : 0 };
}

/* ── Combined field key detection ── */
function detectFieldKey(el) {
  // Layer 1: type hint
  const typeKey = TYPE_MAP[el.type];
  if (typeKey) return { key: typeKey, confidence: 'high', layer: 1 };

  // Build hint string from all label sources
  const hints = [getLabel(el), el.placeholder || '', el.name || '', el.id || '',
    el.getAttribute('aria-label') || ''].join(' ');

  // Layer 2: keyword
  const kw = keywordMatch(hints);
  if (kw.key && kw.score > 0.35) return { key: kw.key, confidence: kw.score > 0.7 ? 'high' : 'medium', layer: 2 };

  // Layer 3: fuzzy
  const fz = fuzzyMatch(hints);
  if (fz.key && fz.score > 0.3) return { key: fz.key, confidence: 'low', layer: 3 };

  // Layer 4: AI fallback — mark for async AI call
  return { key: null, confidence: 'unknown', layer: 4, hints };
}

/* ── Label extraction (7 strategies) ── */
function getLabel(el) {
  if (el.id) {
    const lbl = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
    if (lbl) return cleanText(lbl.textContent);
  }
  const wrap = el.closest('label');
  if (wrap) {
    const c = wrap.cloneNode(true);
    c.querySelectorAll('input,select,textarea').forEach(e => e.remove());
    const t = cleanText(c.textContent);
    if (t) return t;
  }
  const aria = el.getAttribute('aria-label');
  if (aria?.trim()) return cleanText(aria);
  const lblBy = el.getAttribute('aria-labelledby');
  if (lblBy) {
    const parts = lblBy.trim().split(/\s+/).map(id => document.getElementById(id)?.textContent?.trim()).filter(Boolean);
    if (parts.length) return cleanText(parts.join(' '));
  }
  let sib = el.previousElementSibling, depth = 0;
  while (sib && depth < 5) {
    if (!['INPUT','SELECT','TEXTAREA','BUTTON'].includes(sib.tagName)) {
      const t = cleanText(sib.textContent);
      if (t && t.length < 80) return t;
    }
    sib = sib.previousElementSibling; depth++;
  }
  const parent = el.parentElement;
  if (parent) {
    const c = parent.cloneNode(true);
    c.querySelectorAll('input,select,textarea,button').forEach(e => e.remove());
    const t = cleanText(c.textContent);
    if (t && t.length < 60) return t;
  }
  if (el.placeholder?.trim()) return cleanText(el.placeholder);
  if (el.name) return el.name.replace(/[_\-.]+/g,' ').replace(/([a-z])([A-Z])/g,'$1 $2').trim();
  return 'Field';
}

function cleanText(t) {
  return (t||'').replace(/\s+/g,' ').replace(/[*:]+\s*$/,'').replace(/^\s*[\d.]+\s+/,'').trim().slice(0,70);
}

function isVisible(el) {
  if (el.offsetParent === null && el.type !== 'radio') return false;
  const s = window.getComputedStyle(el);
  return s.display !== 'none' && s.visibility !== 'hidden' && s.opacity !== '0' && el.type !== 'hidden';
}

/* ── Job page detection ── */
function detectPageContext() {
  const body = document.body.innerText.toLowerCase();
  const url  = location.href.toLowerCase();
  const isJob = ['apply','application','job','career','position','role','vacancy','opening']
    .some(w => body.includes(w) || url.includes(w));
  const hasCustomQ = !!document.querySelector('textarea');
  const title = document.title;
  // Extract job role from page
  const roleMatch = title.match(/(engineer|developer|designer|manager|analyst|scientist|consultant|director)/i);
  const companyMatch = title.match(/at\s+([A-Z][a-zA-Z\s]+)/);
  return {
    isJobPage: isJob,
    hasCustomQuestions: hasCustomQ,
    detectedRole: roleMatch?.[1] || null,
    detectedCompany: companyMatch?.[1]?.trim() || null,
    title,
    url: location.href,
  };
}

/* ── Submit/Next button detection ── */
function findActionButtons() {
  const btns = Array.from(document.querySelectorAll('button,input[type=submit],input[type=button],[role=button]'));
  const patterns = {
    submit: ['submit','apply','send application','complete','finish','done','confirm','hire me'],
    next:   ['next','continue','proceed','forward','step','advance'],
    prev:   ['back','previous','prev'],
  };
  const result = {};
  for (const [action, words] of Object.entries(patterns)) {
    result[action] = btns.find(b => {
      const t = (b.innerText || b.value || b.getAttribute('aria-label') || '').toLowerCase();
      return words.some(w => t.includes(w));
    }) || null;
  }
  return result;
}

/* ── Field scanner ── */
function scanFields() {
  const seen = new Set();
  const radioGroups = new Map();
  const results = [];

  const candidates = Array.from(document.querySelectorAll(
    'input:not([type=hidden]):not([type=submit]):not([type=button]):not([type=reset]):not([type=image]):not([type=file]),' +
    'select, textarea'
  )).filter(isVisible);

  for (const el of candidates) {
    if (seen.has(el)) continue;
    seen.add(el);

    const type = (el.type || el.tagName.toLowerCase()).toLowerCase();

    if (type === 'radio') {
      const name = el.name || getLabel(el);
      if (!radioGroups.has(name)) {
        radioGroups.set(name, { label: getLabel(el), options: [], els: [] });
      }
      const g = radioGroups.get(name);
      const optLabel = getLabel(el);
      if (!g.options.includes(optLabel)) g.options.push(optLabel);
      g.els.push(el);
      continue;
    }

    if (type === 'checkbox') {
      results.push({ el, label: getLabel(el), type: 'checkbox', options: [], currentValue: el.checked ? 'yes' : '' });
      continue;
    }

    if (el.tagName.toLowerCase() === 'select') {
      const opts = Array.from(el.options).map(o => o.text.trim()).filter(o => o && !/^[-—]+$/.test(o) && o.length < 60);
      const det = detectFieldKey(el);
      results.push({ el, label: getLabel(el), type: 'select', options: opts, currentValue: el.value, detectedKey: det.key, confidence: det.confidence });
      continue;
    }

    const det = detectFieldKey(el);
    results.push({ el, label: getLabel(el), type: type || 'text', options: [], currentValue: el.value, detectedKey: det.key, confidence: det.confidence, layer: det.layer, hints: det.hints });
  }

  for (const [, g] of radioGroups) {
    const det = detectFieldKey(g.els[0]);
    results.push({ el: g.els, label: g.label, type: 'radio', options: g.options, currentValue: '', detectedKey: det.key, confidence: det.confidence });
  }

  return results;
}

/* ── Native value setter (React/Vue/Angular safe) ── */
function setNative(el, value) {
  const proto = Object.getPrototypeOf(el);
  const desc = Object.getOwnPropertyDescriptor(proto, 'value')
    || Object.getOwnPropertyDescriptor(Object.getPrototypeOf(proto), 'value');
  desc?.set ? desc.set.call(el, value) : (el.value = value);
}

/* ── Typing animation ── */
async function animateType(el, value, speed = 14) {
  el.focus();
  setNative(el, '');
  el.dispatchEvent(new Event('input', { bubbles: true }));
  for (let i = 1; i <= value.length; i++) {
    if (_fillAbort) return false;
    setNative(el, value.slice(0, i));
    el.dispatchEvent(new InputEvent('input', { bubbles: true, data: value[i-1], inputType: 'insertText' }));
    // Variable speed: faster for long values, slower for short ones
    const spd = value.length > 40 ? Math.max(5, speed - 6) : speed;
    await delay(spd);
  }
  el.dispatchEvent(new Event('change', { bubbles: true }));
  el.dispatchEvent(new Event('blur',   { bubbles: true }));
  return true;
}

/* ── Select fill (fuzzy) ── */
function fillSelect(el, value) {
  const v = value.toLowerCase().trim();
  const opts = Array.from(el.options);
  const match =
    opts.find(o => o.text.trim().toLowerCase() === v) ||
    opts.find(o => o.value.toLowerCase() === v) ||
    opts.find(o => o.text.trim().toLowerCase().startsWith(v.slice(0,5))) ||
    opts.find(o => o.text.trim().toLowerCase().includes(v)) ||
    opts.find(o => v.includes(o.text.trim().toLowerCase()));
  if (match) {
    el.value = match.value;
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }
  return false;
}

/* ── Radio fill ── */
function fillRadio(els, value) {
  const v = value.toLowerCase().trim();
  for (const el of els) {
    const lbl = getLabel(el).toLowerCase();
    if (lbl === v || el.value.toLowerCase() === v || lbl.includes(v) || v.includes(lbl)) {
      el.checked = true;
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }
  }
  return false;
}

/* ── Checkbox fill ── */
function fillCheckbox(el, value) {
  const v = value.toLowerCase().trim();
  const should = ['yes','true','1','check','on','agree','accept','authorized'].includes(v);
  if (el.checked !== should) {
    el.checked = should;
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }
  return true;
}

/* ── Flash highlight ── */
function flash(el, color = '#00ff88') {
  const target = Array.isArray(el) ? el[0] : el;
  if (!target?.style) return;
  const prev = target.style.outline;
  target.style.outline = `2px solid ${color}`;
  target.style.transition = 'outline 0.15s ease';
  setTimeout(() => { target.style.outline = prev; }, 1000);
}

/* ── Message Handler ── */
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {

  if (msg.type === 'PING') {
    sendResponse({ ok: true, version: '2.0' });
    return true;
  }

  if (msg.type === 'SCAN') {
    _fields = scanFields();
    _fillAbort = false;
    const context = detectPageContext();
    const buttons = findActionButtons();
    const serialized = _fields.map((f, i) => ({
      index:       i,
      label:       f.label,
      type:        f.type,
      options:     f.options,
      currentValue:Array.isArray(f.el) ? '' : (f.el.value || ''),
      detectedKey: f.detectedKey || null,
      confidence:  f.confidence || 'unknown',
      layer:       f.layer || null,
      needsAI:     f.layer === 4,
    }));
    sendResponse({ ok: true, fields: serialized, context, buttons: { hasNext: !!buttons.next, hasSubmit: !!buttons.submit } });
    return true;
  }

  if (msg.type === 'FILL') {
    _fillAbort = false;
    const values  = msg.values  || {};
    const answers = msg.answers || {}; // AI-generated custom answers keyed by index
    const speed   = msg.speed   || 14;

    (async () => {
      let filledCount = 0;
      const results = [];

      for (const [idxStr, value] of Object.entries({ ...values, ...answers })) {
        if (_fillAbort) break;
        if (value == null || String(value).trim() === '') continue;

        const idx   = parseInt(idxStr, 10);
        const field = _fields[idx];
        if (!field) continue;

        const strVal = String(value).trim();
        let ok = false;

        try {
          if (field.type === 'select') {
            ok = fillSelect(field.el, strVal);
            if (ok) { flash(field.el); await delay(100); }
          } else if (field.type === 'radio') {
            ok = fillRadio(field.el, strVal);
            if (ok) { flash(field.el); await delay(100); }
          } else if (field.type === 'checkbox') {
            ok = fillCheckbox(field.el, strVal);
            if (ok) { flash(field.el); await delay(80); }
          } else {
            ok = await animateType(field.el, strVal, speed);
            if (ok) flash(field.el, '#00ff88');
          }
        } catch {}

        if (ok) { filledCount++; results.push({ index: idx, label: field.label, value: strVal, confidence: field.confidence }); }
        await delay(55);
      }

      chrome.runtime.sendMessage({ type: 'FILL_DONE', filledCount, results }).catch(() => {});
    })();

    sendResponse({ ok: true, started: true });
    return true;
  }

  if (msg.type === 'ABORT') {
    _fillAbort = true;
    sendResponse({ ok: true });
    return true;
  }

  if (msg.type === 'HIGHLIGHT') {
    _fields = scanFields();
    const ctx = detectPageContext();
    _fields.forEach(f => {
      const els = Array.isArray(f.el) ? f.el : [f.el];
      els.forEach(el => {
        el.setAttribute(ATTR, f.detectedKey || '?');
        el.style.outline = '2px dashed #00ff88';
        el.style.outlineOffset = '2px';
        // Tooltip
        el.title = `[AIFF] ${f.label} → ${f.detectedKey || 'unknown'} (${f.confidence || '?'})`;
      });
    });
    setTimeout(() => {
      document.querySelectorAll(`[${ATTR}]`).forEach(el => {
        el.style.outline = ''; el.style.outlineOffset = '';
        el.removeAttribute(ATTR);
      });
    }, 3000);
    sendResponse({ ok: true, count: _fields.length, context: ctx });
    return true;
  }

  if (msg.type === 'CLICK_NEXT') {
    const btns = findActionButtons();
    const btn = btns.next || btns.submit;
    if (btn) {
      btn.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setTimeout(() => btn.click(), 400);
      sendResponse({ ok: true, clicked: btn.innerText || btn.value });
    } else {
      sendResponse({ ok: false, error: 'No next/submit button found' });
    }
    return true;
  }

  if (msg.type === 'GET_CONTEXT') {
    sendResponse({ ok: true, context: detectPageContext(), buttons: findActionButtons() });
    return true;
  }

  if (msg.type === 'EXTRACT_QUESTIONS') {
    // Get all textarea labels — likely custom questions
    _fields = scanFields();
    const questions = _fields
      .filter(f => f.type === 'textarea')
      .map((f, i) => ({ index: _fields.indexOf(f), label: f.label, currentValue: Array.isArray(f.el) ? '' : f.el.value }));
    sendResponse({ ok: true, questions });
    return true;
  }
});
