/**
 * background.js — AI Form Filler Pro v2 Service Worker
 *
 * Handles:
 *  - AI API proxy (Groq / Anthropic / OpenAI)
 *  - Correction learning storage
 *  - Tab context caching
 *  - Layer-4 AI field detection
 */

'use strict';

const ENDPOINTS = {
  groq:      'https://api.groq.com/openai/v1/chat/completions',
  openai:    'https://api.openai.com/v1/chat/completions',
  anthropic: 'https://api.anthropic.com/v1/messages',
};

const MODELS = {
  groq:      'llama-3.3-70b-versatile',
  openai:    'gpt-4o-mini',
  anthropic: 'claude-haiku-4-5-20251001',
};

chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === 'install') {
    chrome.storage.local.set({
      aiff_v2_totalFills: 0,
      aiff_v2_corrections: {},
      aiff_v2_profiles: [],
      aiff_v2_history: [],
    });
  }
});

/* ── Generic AI call (OpenAI-compatible + Anthropic) ── */
async function callAI(provider, apiKey, systemPrompt, userMessage, maxTokens = 800) {
  const url   = ENDPOINTS[provider];
  const model = MODELS[provider];

  let body, headers;

  if (provider === 'anthropic') {
    headers = {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    };
    body = JSON.stringify({
      model, max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    });
  } else {
    headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` };
    body = JSON.stringify({
      model, max_tokens: maxTokens, temperature: 0.1,
      messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userMessage }],
    });
  }

  const res = await fetch(url, { method: 'POST', headers, body });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const msg = err?.error?.message || err?.error?.msg || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  const data = await res.json();

  const text = provider === 'anthropic'
    ? data.content?.[0]?.text || ''
    : data.choices?.[0]?.message?.content || '';

  return text.replace(/```json|```/g, '').trim();
}

/* ── Message handler ── */
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {

  if (msg.type === 'AI_FILL') {
    const { provider, apiKey, systemPrompt, userText, corrections } = msg;
    const sysWithCorrections = corrections && Object.keys(corrections).length > 0
      ? systemPrompt + `\n\nApply these learned corrections: ${JSON.stringify(corrections)}`
      : systemPrompt;

    callAI(provider, apiKey, sysWithCorrections, userText, 1000)
      .then(raw => {
        try {
          const json = JSON.parse(raw);
          sendResponse({ ok: true, values: json });
        } catch {
          const match = raw.match(/\{[\s\S]*\}/);
          if (match) {
            try { sendResponse({ ok: true, values: JSON.parse(match[0]) }); return; }
            catch {}
          }
          sendResponse({ ok: false, error: 'Could not parse AI response' });
        }
      })
      .catch(e => sendResponse({ ok: false, error: e.message }));
    return true;
  }

  if (msg.type === 'AI_ANSWERS') {
    const { provider, apiKey, questions, userData } = msg;
    const sysPrompt = `You generate professional answers to job application questions.
Use the user's profile data to write relevant, authentic responses.
Return ONLY valid JSON: {"<question_index>": "<answer>"}. No markdown. No extra text.
Answers should be 2-4 sentences. Sound human. Match the job role if detectable.`;
    const userMsg = `User Profile: ${JSON.stringify(userData)}\n\nQuestions:\n${JSON.stringify(questions)}`;

    callAI(provider, apiKey, sysPrompt, userMsg, 600)
      .then(raw => {
        try {
          sendResponse({ ok: true, answers: JSON.parse(raw) });
        } catch {
          sendResponse({ ok: false, error: 'Could not parse answers' });
        }
      })
      .catch(e => sendResponse({ ok: false, error: e.message }));
    return true;
  }

  if (msg.type === 'AI_DETECT_FIELDS') {
    // Layer-4: AI identifies ambiguous field hints
    const { provider, apiKey, fieldHints } = msg;
    const sysPrompt = `Map form field descriptions to profile keys. 
Allowed keys: first_name, last_name, full_name, email, phone, dob, gender, nationality,
address, city, state, country, zip, job_title, experience, company, employment_type,
skills, salary, current_salary, notice, summary, work_auth, remote, degree, field_study,
university, gpa, linkedin, github, portfolio, cover_letter, languages, certifications.
Return ONLY valid JSON: {"<hint>": "<key_or_null>"}`;
    const userMsg = `Map these hints: ${JSON.stringify(fieldHints)}`;

    callAI(provider, apiKey, sysPrompt, userMsg, 400)
      .then(raw => {
        try { sendResponse({ ok: true, mapping: JSON.parse(raw) }); }
        catch { sendResponse({ ok: false, error: 'Parse failed' }); }
      })
      .catch(e => sendResponse({ ok: false, error: e.message }));
    return true;
  }

  if (msg.type === 'SAVE_CORRECTION') {
    chrome.storage.local.get('aiff_v2_corrections', data => {
      const corr = data.aiff_v2_corrections || {};
      const key = `${msg.domain}::${msg.fieldKey}`;
      corr[key] = { original: msg.original, corrected: msg.corrected, times: (corr[key]?.times || 0) + 1 };
      chrome.storage.local.set({ aiff_v2_corrections: corr });
      sendResponse({ ok: true });
    });
    return true;
  }

  if (msg.type === 'GET_CORRECTIONS') {
    chrome.storage.local.get('aiff_v2_corrections', data => {
      const corr = data.aiff_v2_corrections || {};
      const domain = msg.domain;
      const filtered = {};
      for (const [k, v] of Object.entries(corr)) {
        if (k.startsWith(domain + '::')) {
          filtered[k.replace(domain + '::', '')] = v;
        }
      }
      sendResponse({ ok: true, corrections: filtered });
    });
    return true;
  }
});
