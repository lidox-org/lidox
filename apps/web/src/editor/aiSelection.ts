import type { Editor } from '@tiptap/react';
import { DOMSerializer } from '@tiptap/pm/model';
import * as Y from 'yjs';

export interface SerializedSelectionRange {
  from: number;
  to: number;
  text: string;
  html: string;
}

export interface HtmlSentenceSlice {
  text: string;
  html: string;
}

interface NormalizeAiReplacementInput {
  originalHtml: string;
  proposedText: string;
  proposedHtml?: string;
}

export function serializeCurrentSelection(
  editor: Editor,
): SerializedSelectionRange | null {
  const { from, to, empty } = editor.state.selection;
  if (empty) {
    return null;
  }

  return serializeRange(editor, from, to);
}

export function serializeRange(
  editor: Editor,
  from: number,
  to: number,
): SerializedSelectionRange | null {
  if (from >= to) {
    return null;
  }

  const maxPos = editor.state.doc.content.size;
  if (from < 0 || to > maxPos) {
    return null;
  }

  const fragment = editor.state.doc.slice(from, to).content;
  const documentFragment = DOMSerializer.fromSchema(
    editor.state.schema,
  ).serializeFragment(fragment);
  const temporaryDocument = document.implementation.createHTMLDocument();
  const container = temporaryDocument.createElement('div');

  container.appendChild(documentFragment);

  return {
    from,
    to,
    text: editor.state.doc.textBetween(from, to, ' '),
    html: container.innerHTML,
  };
}

export function htmlToText(html: string): string {
  if (!html.trim()) {
    return '';
  }

  const parser = new DOMParser();
  const parsed = parser.parseFromString(html, 'text/html');
  return parsed.body.textContent?.replace(/\s+/g, ' ').trim() ?? '';
}

export function normalizeAiReplacementHtml(
  input: NormalizeAiReplacementInput,
): string {
  const fallbackText = normalizeText(input.proposedText);
  const parsedCandidate = parseGeneratedHtmlCandidate(input.proposedHtml);

  if (!parsedCandidate) {
    return escapeHtml(fallbackText);
  }

  if (isInlineHtmlFragment(input.originalHtml)) {
    unwrapSingleBlockWrapper(parsedCandidate);

    if (containsBlockElements(parsedCandidate)) {
      return escapeHtml(normalizeText(parsedCandidate.textContent ?? fallbackText));
    }
  }

  const normalizedHtml = parsedCandidate.innerHTML.trim();
  if (!normalizedHtml) {
    return escapeHtml(fallbackText);
  }

  return normalizedHtml;
}

export function splitHtmlFragmentIntoSentences(
  html: string,
): HtmlSentenceSlice[] {
  if (!html.trim()) {
    return [];
  }

  const temporaryDocument = document.implementation.createHTMLDocument();
  const container = temporaryDocument.createElement('div');
  container.innerHTML = html;

  const textNodes = collectTextNodes(container);
  if (textNodes.length === 0) {
    return [];
  }

  const rawText = container.textContent ?? '';
  const ranges = splitTextIntoSentenceRanges(rawText);

  return ranges.map((range) => ({
    text: normalizeText(rawText.slice(range.start, range.end)),
    html: cloneHtmlRange(container, textNodes, range.start, range.end),
  }));
}

export function encodeStateVector(doc: Y.Doc | null): string | undefined {
  if (!doc) {
    return undefined;
  }

  return bytesToBase64(Y.encodeStateVector(doc));
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;

  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
}

function splitTextIntoSentenceRanges(
  text: string,
): Array<{ start: number; end: number }> {
  const ranges: Array<{ start: number; end: number }> = [];
  const sentencePattern = /[^.!?]+[.!?]?\s*/g;

  for (const match of text.matchAll(sentencePattern)) {
    const value = match[0];
    const index = match.index ?? 0;

    if (!normalizeText(value)) {
      continue;
    }

    ranges.push({
      start: index,
      end: index + value.length,
    });
  }

  if (ranges.length === 0 && normalizeText(text)) {
    return [{ start: 0, end: text.length }];
  }

  return ranges;
}

function normalizeText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function escapeHtml(text: string): string {
  const container = document.createElement('div');
  container.textContent = text;
  return container.innerHTML;
}

function parseGeneratedHtmlCandidate(
  html: string | undefined,
): HTMLDivElement | null {
  const raw = stripMarkdownFences(html ?? '').trim();
  if (!raw) {
    return null;
  }

  for (const candidate of [raw, decodeHtmlEntities(raw)]) {
    if (!looksLikeHtml(candidate)) {
      continue;
    }

    const temporaryDocument = document.implementation.createHTMLDocument();
    const container = temporaryDocument.createElement('div');
    container.innerHTML = candidate;

    if (container.querySelector('*')) {
      return container;
    }
  }

  return null;
}

function stripMarkdownFences(value: string): string {
  const match = value.match(/^```(?:html)?\s*([\s\S]*?)\s*```$/i);
  return match ? match[1] : value;
}

function decodeHtmlEntities(value: string): string {
  const temporaryDocument = document.implementation.createHTMLDocument();
  const container = temporaryDocument.createElement('textarea');
  container.innerHTML = value;
  return container.value;
}

function looksLikeHtml(value: string): boolean {
  return /<\/?[a-z][\w:-]*\b[^>]*>/i.test(value);
}

function isInlineHtmlFragment(html: string): boolean {
  const temporaryDocument = document.implementation.createHTMLDocument();
  const container = temporaryDocument.createElement('div');
  container.innerHTML = html;

  return !containsBlockElements(container);
}

function unwrapSingleBlockWrapper(container: HTMLElement): void {
  let wrapper = container.firstElementChild;

  while (
    wrapper &&
    container.childElementCount === 1 &&
    (container.textContent?.trim() ?? '').length > 0 &&
    isBlockElement(wrapper.tagName)
  ) {
    container.innerHTML = wrapper.innerHTML;
    wrapper = container.firstElementChild;
  }
}

function containsBlockElements(container: ParentNode): boolean {
  return container.querySelector(BLOCK_ELEMENT_SELECTOR) !== null;
}

function isBlockElement(tagName: string): boolean {
  return BLOCK_ELEMENT_TAGS.has(tagName.toLowerCase());
}

const BLOCK_ELEMENT_TAGS = new Set([
  'address',
  'article',
  'aside',
  'blockquote',
  'details',
  'dialog',
  'div',
  'dl',
  'fieldset',
  'figcaption',
  'figure',
  'footer',
  'form',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'header',
  'hr',
  'li',
  'main',
  'nav',
  'ol',
  'p',
  'pre',
  'section',
  'table',
  'tbody',
  'td',
  'tfoot',
  'th',
  'thead',
  'tr',
  'ul',
]);

const BLOCK_ELEMENT_SELECTOR = Array.from(BLOCK_ELEMENT_TAGS).join(',');

function collectTextNodes(
  container: HTMLElement,
): Array<{ node: Text; start: number; end: number }> {
  const walker = container.ownerDocument.createTreeWalker(
    container,
    NodeFilter.SHOW_TEXT,
  );
  const textNodes: Array<{ node: Text; start: number; end: number }> = [];
  let offset = 0;

  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    const value = node.textContent ?? '';
    const length = value.length;

    textNodes.push({
      node,
      start: offset,
      end: offset + length,
    });

    offset += length;
  }

  return textNodes;
}

function cloneHtmlRange(
  container: HTMLElement,
  textNodes: Array<{ node: Text; start: number; end: number }>,
  start: number,
  end: number,
): string {
  const range = container.ownerDocument.createRange();
  const startPosition = resolveTextPosition(textNodes, start);
  const endPosition = resolveTextPosition(textNodes, end);
  const fragmentContainer = container.ownerDocument.createElement('div');

  range.setStart(startPosition.node, startPosition.offset);
  range.setEnd(endPosition.node, endPosition.offset);
  fragmentContainer.appendChild(range.cloneContents());

  return fragmentContainer.innerHTML;
}

function resolveTextPosition(
  textNodes: Array<{ node: Text; start: number; end: number }>,
  globalOffset: number,
): { node: Text; offset: number } {
  const fallback = textNodes[textNodes.length - 1];

  for (const entry of textNodes) {
    if (globalOffset <= entry.end) {
      return {
        node: entry.node,
        offset: Math.max(0, Math.min(globalOffset - entry.start, entry.end - entry.start)),
      };
    }
  }

  return {
    node: fallback.node,
    offset: fallback.end - fallback.start,
  };
}
