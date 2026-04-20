import test from 'node:test';
import assert from 'node:assert/strict';
import * as Y from 'yjs';
import { restoreDocumentFromSnapshot } from './restore';

function appendParagraph(fragment: Y.XmlFragment, text: string) {
  const paragraph = new Y.XmlElement('p');
  const content = new Y.XmlText();
  content.insert(0, text);
  fragment.push([paragraph]);
  paragraph.push([content]);
}

test('restoreDocumentFromSnapshot replaces later edits with the restored snapshot', () => {
  const originalDoc = new Y.Doc();
  appendParagraph(originalDoc.getXmlFragment('default'), 'Original draft');
  const snapshotBase64 = Buffer.from(
    Y.encodeStateAsUpdate(originalDoc),
  ).toString('base64');

  const liveDoc = new Y.Doc();
  const liveFragment = liveDoc.getXmlFragment('default');
  appendParagraph(liveFragment, 'Original draft');
  appendParagraph(liveFragment, 'Later edit that should disappear');

  restoreDocumentFromSnapshot(liveDoc, snapshotBase64);

  assert.equal(liveFragment.toString(), '<p>Original draft</p>');
});
