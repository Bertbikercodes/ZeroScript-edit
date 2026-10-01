// SPDX-License-Identifier: GPL-3.0-or-later
// providers/copilot.js - Microsoft Copilot web provider.
// Copilot's UI changes frequently, so selectors intentionally use semantic
// attributes and fallbacks instead of hashed CSS classes.
// eslint-disable-next-line no-unused-vars
const ZSProvider = (() => {
  "use strict";
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let diag = () => {};

  const S = {
    editor: 'textarea[placeholder*="Ask" i], textarea[placeholder*="Copilot" i], textarea[aria-label*="message" i], textarea',
    item: '[data-content="ai-message"], [data-content="response"], .group\\/ai-message-item, .b_sydConvCont, .response-text, .text-response',
    busy: '[aria-busy="true"], [data-is-typing="true"], [data-activity="typing"], [data-testid="typing-indicator"], .typing-indicator, .is-typing',
    error: '[role="alert"], [data-testid*="error" i], [class*="error" i]',
  };
  const timings = {
    GEN_IDLE_MS: 1800, REASON_IDLE_MS: 12000, WARMUP_MS: 45000,
    REASON_NOREPLY_MS: 90000, STABLE_MS: 7000, RESPONSE_TIMEOUT_MS: 300000,
  };
  const text = (el) => (el ? (el.innerText || el.textContent || "") : "").trim();
  const getEditor = () => {
    for (const e of document.querySelectorAll(S.editor)) {
      if (!e.closest("#zs-root") && e.offsetParent !== null) return e;
    }
    return null;
  };
  const editorText = () => { const e = getEditor(); return e ? e.value || e.textContent || "" : ""; };
  const allItems = () => [...document.querySelectorAll(S.item)].filter((e, i, a) => a.indexOf(e) === i);
  const assistantItems = allItems;
  const lastAssistant = () => { const a = assistantItems(); return a[a.length - 1] || null; };
  const itemKey = (item) => item && (item.getAttribute("data-message-id") || item.id || null);
  const lastAssistantId = () => itemKey(lastAssistant());
  const assistantCount = () => assistantItems().length;
  const userCount = () => document.querySelectorAll('textarea ~ *, [data-content="user-message"], [data-author="user"]').length;
  const isAssistantItem = () => true;
  const isUserItem = () => false;
  const itemText = text;
  const classifyText = (item) => text(item);
  const chatIsEmpty = () => allItems().length === 0;
  const isFreshChat = () => chatIsEmpty() && !!getEditor();
  const composerFrame = () => { const e = getEditor(); return e && (e.closest("form") || e.parentElement); };
  const barMount = () => { const f = composerFrame(); return f && f.parentElement ? { parent: f.parentElement, before: f } : null; };

  const sendButton = () => {
    const e = getEditor();
    const root = e && (e.closest("form") || e.parentElement);
    if (!root) return null;
    return [...root.querySelectorAll("button")].find((b) => b.offsetParent !== null && !b.disabled &&
      (/send|submit|ask|enter/i.test(b.getAttribute("aria-label") || "") || /send|submit/i.test(b.dataset.testid || ""))) ||
      document.querySelector('button[type="submit"]:not([disabled])');
  };
  const stopButton = () => document.querySelector('button[aria-label*="stop" i], button[data-testid*="stop" i]');
  const isGenerating = () => !!document.querySelector(S.busy) || !!stopButton();
  const isBusyNow = isGenerating;
  const isHardGenerating = isGenerating;
  const turnHalted = () => false;
  const snapshot = () => { const i = lastAssistant(); return { th: 0, rp: text(i).length }; };
  const streamLen = () => text(lastAssistant()).length;
  const readAssistant = () => { const i = lastAssistant(); return { present: !!i, reply: text(i), thinking: "", item: i }; };
  const waitFor = async (pred, timeout) => { const t = Date.now(); while (Date.now() - t < timeout) { if (pred()) return true; await sleep(120); } return false; };

  function setValue(el, value) {
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set;
    setter.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }
  async function typeAndSend(value) {
    const e = getEditor();
    if (!e) throw new Error("Copilot input box not found");
    if (e instanceof HTMLTextAreaElement) setValue(e, value);
    else { e.focus(); document.execCommand("selectAll"); document.execCommand("insertText", false, value); }
    await waitFor(() => !!sendButton(), 2000);
    const b = sendButton();
    if (b) b.click();
    else e.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", keyCode: 13, bubbles: true }));
  }
  const stopGeneration = () => { const b = stopButton(); if (b) try { b.click(); } catch {} };
  const enforceComposer = () => ({ ready: true });
  async function ensureComposerReady(reason) { diag("mode_ready", { reason, provider: "copilot" }); return { ready: !!getEditor() }; }
  function installSendHooks(handlers) {
    document.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" || e.shiftKey || e.isComposing || !getEditor() || e.target !== getEditor()) return;
      if (!editorText().trim() || handlers.isBlocked()) return;
      if (!handlers.isStarted()) { if (chatIsEmpty()) handlers.onBlockedAttempt(); return; }
      handlers.onUserMessage(assistantCount());
    }, true);
    document.addEventListener("click", (e) => {
      if (!getEditor() || handlers.isBlocked()) return;
      const b = e.target && e.target.closest && e.target.closest("button");
      if (!b || b === stopButton()) return;
      if (b === sendButton() || /send|submit|ask/i.test(b.getAttribute("aria-label") || "")) {
        if (!handlers.isStarted()) { if (chatIsEmpty()) handlers.onBlockedAttempt(); return; }
        handlers.onUserMessage(assistantCount());
      }
    }, true);
  }
  function findToolBlockSpot(item) {
    if (!item) return null;
    const re = /"(?:command|tool)"\s*:\s*"|###\s*(?:lua|mcp_tool)###/i;
    for (const el of item.querySelectorAll("pre, code, [data-content], p")) {
      if (re.test(text(el))) { el.classList.add("zs-tool-hide"); return { parent: el.parentElement, ref: el }; }
    }
    return null;
  }
  const scanError = () => { for (const e of document.querySelectorAll(S.error)) { const t = text(e); if (t && t.length < 500) return t; } return getEditor() ? null : "The Copilot input box disappeared."; };
  const isTooLongMsg = (s) => /too long|limit|context/i.test(s || "");
  const isBusyMsg = (s) => /try again|error|unavailable/i.test(s || "");
  const attachImages = async () => false;
  const clearAttachments = () => {};
  const openNewChat = async () => false;
  const conversationKey = () => location.pathname + location.search;

  return { id: "copilot", displayName: "Copilot", timings, supportsVision: false,
    reliableCounts: false, chipAtItemLevel: true, init({ diag: d } = {}) { if (d) diag = d; },
    allItems, isUserItem, isAssistantItem, itemText, classifyText, assistantCount, userCount,
    lastAssistant, lastAssistantId, itemKey, readAssistant, streamLen, snapshot,
    getEditor, editorText, chatIsEmpty, isFreshChat, composerFrame, barMount,
    setInputLock(on) { const e = getEditor(); if (e) e.readOnly = !!on; }, typeAndSend, stopGeneration,
    isGenerating, isBusyNow, isHardGenerating, enforceComposer, ensureComposerReady, turnHalted,
    findContinueBtn: () => null, clickContinueBtn: () => false, scanError, isTooLongMsg, isBusyMsg,
    attachImages, clearAttachments, openNewChat, conversationKey, installSendHooks, findToolBlockSpot,
  };
})();
