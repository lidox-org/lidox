import type { Editor } from '@tiptap/react';
import { DOMSerializer } from '@tiptap/pm/model';
import * as Y from 'yjs';

export interface SerializedSelectionRange {
  from: number;
  to: number;
  text: string;
  html: string;
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
