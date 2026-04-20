import test from 'node:test';
import assert from 'node:assert/strict';
import * as Y from 'yjs';
import { buildVersionPreview } from './database';

function appendParagraph(fragment: Y.XmlFragment, text: string) {
  const paragraph = new Y.XmlElement('p');
  const content = new Y.XmlText();
  content.insert(0, text);
  fragment.push([paragraph]);
  paragraph.push([content]);
}

test('buildVersionPreview keeps the first few logical lines in reading order', () => {
  const doc = new Y.Doc();
  const fragment = doc.getXmlFragment('default');

  appendParagraph(fragment, 'First line');
  appendParagraph(fragment, 'Second line');
  appendParagraph(fragment, 'Third line');
  appendParagraph(fragment, 'Fourth line should not be shown');

  assert.equal(
    buildVersionPreview(doc),
    'First line\nSecond line\nThird line',
  );
});

test('buildVersionPreview works from a reconstructed Yjs snapshot', () => {
  const doc = new Y.Doc();
  const fragment = doc.getXmlFragment('default');

  appendParagraph(fragment, 'Version one');
  appendParagraph(fragment, 'Version two');

  const restoredDoc = new Y.Doc();
  Y.applyUpdate(restoredDoc, Y.encodeStateAsUpdate(doc));

  assert.equal(
    buildVersionPreview(restoredDoc),
    'Version one\nVersion two',
  );
});

test('buildVersionPreview returns null for an empty document', () => {
  const doc = new Y.Doc();
  assert.equal(buildVersionPreview(doc), null);
});
