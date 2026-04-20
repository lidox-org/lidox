import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { restoreDocumentFromSnapshot } from './restore';

function setParagraph(doc: Y.Doc, text: string) {
  const fragment = doc.getXmlFragment('default');
  fragment.delete(0, fragment.length);

  const paragraph = new Y.XmlElement('p');
  paragraph.insert(0, [new Y.XmlText(text)]);
  fragment.insert(0, [paragraph]);
}

function getText(doc: Y.Doc): string {
  return doc.getXmlFragment('default').toString();
}

describe('restoreDocumentFromSnapshot', () => {
  it('replaces later edits with the restored snapshot', () => {
    const liveDoc = new Y.Doc();

    setParagraph(liveDoc, 'first version');
    const snapshotBase64 = btoa(
      String.fromCharCode(...Y.encodeStateAsUpdate(liveDoc)),
    );

    setParagraph(liveDoc, 'latest version');

    const restoredRoots = restoreDocumentFromSnapshot(liveDoc, snapshotBase64);

    expect(restoredRoots).toBe(1);
    expect(getText(liveDoc)).toContain('first version');
    expect(getText(liveDoc)).not.toContain('latest version');
  });
});
