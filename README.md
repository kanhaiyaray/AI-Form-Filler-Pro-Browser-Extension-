#  AI Form Filler Pro — Browser Extension v2

> **Fill any web form in seconds using AI — works on job boards, college portals, visa sites, and any form on the web.**

![Version](https://img.shields.io/badge/version-2.0.0-blue)
![Manifest](https://img.shields.io/badge/Manifest-V3-green)
![Providers](https://img.shields.io/badge/AI-Groq%20%7C%20Anthropic%20%7C%20OpenAI-purple)
![License](https://img.shields.io/badge/license-MIT-lightgrey)
---

## Overview

**AI Form Filler Pro** is a Manifest V3 Chrome/Edge extension that uses large language models to read a natural-language description of the user (or a pasted résumé) and automatically fill form fields on any website — typing character by character with realistic animation, handling React/Vue/Angular synthetic events, and learning from manual corrections over time.

### Core Value Proposition

| Without the extension | With the extension |
|---|---|
| Copy-paste each field manually | Describe yourself once → AI fills everything |
| Re-enter the same data on every site | Save named profiles → one-click reuse |
| Struggle with custom "Why do you want this role?" questions | Smart Apply generates AI answers per question |
| Frustration with multi-step forms | Auto-detects Next/Submit buttons and navigates |
| AI makes wrong guesses repeatedly | Correction learning improves accuracy per domain |

---

## Feature Breakdown

### Fill Tab
- **Describe mode** — Write a natural-language blurb about yourself (any language supported)
- **Résumé mode** — Paste plain-text résumé for extraction
- **Fill speed control** — Normal (14ms/char), Fast (6ms/char), Slow (28ms/char)
- **Live status bar** — Shows scanning → AI thinking → filling phases with animated dot
- **Confidence bar** — Visual percentage of high-confidence fills post-fill
- **Results panel** — Per-field breakdown with confidence badge (high/medium/low)
- **Copy JSON** — Export all filled values as structured JSON

### Profile Tab
- **Create, edit, delete** named profiles (Job / Freelance / College / General)
- **One-click activate** — use a profile instead of the description textarea
- **Export / Import** — profiles serialize to JSON files for backup and sharing

### Smart Apply Tab (Job Mode)
- **Page Analyzer** — detects job role, company name, navigation type (single-page vs multi-step), and custom textarea questions
- **AI question answering** — sends detected custom questions and user profile to AI; populates answers in-UI before filling
- **Smart Fill** — combines AI form values + AI custom answers in a single fill pass
- **Next button clicker** — finds and clicks "Next"/"Continue" buttons for multi-step flows

### History Tab
- Last 50 fill sessions stored with domain, field count, and timestamp
- Clears with one button

### Learned Tab (Corrections)
- Shows all manual corrections the user made to AI-filled fields, grouped by `domain::fieldKey`
- Correction count per field
- Injected automatically into future AI prompts on the same domain

### Settings Panel
- **AI provider selector** — Groq (free), Anthropic (Claude Haiku), OpenAI (GPT-4o mini)
- **API key input** with show/hide toggle per provider
- **Active profile selector** — override the describe textarea globally
- **Usage stats** — total fills, correction count, saved profiles
- **Clear all data** — wipes chrome.storage.local

---

## Install

1. Unzip the folder
2. `chrome://extensions` → Developer mode → **Load unpacked** → select folder

## Setup

Settings (⚙) → pick a provider → paste your API key.

| Provider | Model | Cost |
|---|---|---|
| **Groq** (recommended) | LLaMA 3.3 70B | Free — [console.groq.com](https://console.groq.com) |
| Anthropic | Claude Haiku | Pay-per-use |
| OpenAI | GPT-4o mini | Pay-per-use |

---

## How to Use

**Fill tab** — describe yourself, click Fill (or `Ctrl+Enter`):
```
Sarah Chen, senior React engineer, 7 years, UC Berkeley, SF, sarah@dev.io, $160k remote
```
Or switch to **Résumé** mode and paste a plain-text CV.

**Apply tab** — on any job page, click Analyze → the extension detects the role, company, and custom questions → Generate AI answers → Fill. Click **Next →** for multi-step forms.

**Profile tab** — save named descriptions, activate with one click, export/import as JSON.

**Learned tab** — every field you manually correct gets remembered and injected into future prompts on that domain.

---

## 4-Layer Field Detection Engine

The engine runs in `content.js` and is the core innovation of the extension. Each field on a page goes through up to four detection layers, stopping at the first confident match.

### Layer 1 — Input Type Hints (instant, 100% accurate)
```
input[type="email"]  →  email
input[type="tel"]    →  phone
input[type="url"]    →  linkedin
```
These are browser-defined. No ambiguity. Returns immediately.

### Layer 2 — Semantic Keyword Map (~70% coverage)
`fieldMap.js` provides a dictionary of 50+ field keys, each with 5–15 multilingual synonyms. The label text, placeholder, `name`, `id`, and `aria-label` are all concatenated and normalized (lowercase, stripped punctuation) before matching.

- **Exact match** → score 1.0, returns instantly
- **Substring match** → score = keyword_length / hint_length; threshold 0.35

Supports English, Spanish, French, German, Hindi, Chinese label text natively via synonym arrays.

### Layer 3 — Levenshtein Fuzzy Match (typo/variant tolerance)
When Layer 2 fails (score < 0.35), Levenshtein edit distance is computed between the normalized hint and every keyword in the map. Accepts a match when `distance / max_length < 0.4`.

This handles:
- Typos (`"Emal"` → `email`)
- Abbreviations (`"mob no"` → `phone`)
- Unusual label formats (`"Your linkedin ID"` → `linkedin`)

### Layer 4 — AI Fallback (for truly ambiguous fields)
Fields that fail all three layers are collected and sent in a batch to the AI via `background.js → AI_DETECT_FIELDS`. The AI is given the raw hint strings and asked to map them to a canonical key from a fixed allowed-key list.

- Only fields with `needsAI: true` trigger this
- Results are merged back before the main fill prompt
- Adds ~1–2 seconds to fill time when invoked

### Label Extraction — 7 Strategies
For each field element, `getLabel()` tries these in order:

1. `<label for="id">` association
2. Parent `<label>` wrapping the input
3. `aria-label` attribute
4. `aria-labelledby` referenced element(s)
5. Previous sibling elements (up to 5 levels up)
6. Parent element's text content (after stripping inputs)
7. `placeholder` attribute → `name` attribute (camelCase converted)

---

### Workflow

1. Navigate to a job application page (e.g. Workday, Greenhouse, Lever, LinkedIn Easy Apply)
2. Open the extension → switch to the **Apply** tab
3. Click **Analyze this page →**
4. The extension will show:
   - **Role detected** — extracted from the page title
   - **Company** — extracted from "at CompanyName" patterns in the title
   - **Custom questions** — count of textarea fields detected (these are usually "Why do you want this job?" etc.)
   - **Navigation** — whether the form has a detectable "Next" button (multi-step) or a single submit
5. If custom questions are detected, click **Generate AI answers →**
   - Each question label is extracted and sent to the AI
   - AI generates 2–4 sentence professional answers
   - Answers appear in the panel for review
6. Click **Fill form with AI →** — fills both regular fields AND injects the AI answers into the textareas
7. For multi-step forms, click **Next →** to programmatically advance to the next page, then repeat

### Job Detection Logic

The extension scans the page body text and URL for keywords: `apply`, `application`, `job`, `career`, `position`, `role`, `vacancy`, `opening`. Any match flags it as a job page and activates the Apply tab indicators.

---

## Files

```
manifest.json   MV3 config and permissions
popup.js        UI logic, state, AI orchestration
content.js      Page scanner, fill engine, event dispatch
fieldMap.js     Semantic field dictionary (50+ keys)
background.js   Service worker — AI proxy, corrections storage
popup.html/css  Extension UI
icons/          16, 48, 128px
```

---

## Permissions & Privacy

`storage` `activeTab` `scripting` `tabs` — nothing unusual.  
API keys are stored locally and sent only to your chosen provider. No telemetry.

## Limitations

No CAPTCHAs, no file inputs, no iframes.

---
## License

MIT — see `LICENSE` file for details.

---

*Built with Manifest V3, vanilla JS, and a 4-layer field detection engine. No build tools, no frameworks, no tracking.*