import * as Y from 'yjs';

function decodeBase64(base64: string): Uint8Array {
  if (typeof globalThis.atob !== 'function') {
    throw new Error('Base64 decoding is not available in this environment.');
  }

  const binary = globalThis.atob(base64);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function cloneXmlContent(
  fragment: Y.XmlFragment,
): Array<Y.XmlElement | Y.XmlText> {
  return fragment
    .toArray()
    .flatMap((node) =>
      node instanceof Y.XmlElement || node instanceof Y.XmlText
        ? [node.clone()]
        : [],
    );
}

export function restoreDocumentFromSnapshot(
  liveDoc: Y.Doc,
  snapshotBase64: string,
): number {
  const snapshotDoc = new Y.Doc();
  Y.applyUpdate(snapshotDoc, decodeBase64(snapshotBase64));

  const rootKeys = Array.from(
    new Set([...liveDoc.share.keys(), ...snapshotDoc.share.keys()]),
  );

  liveDoc.transact(() => {
    for (const key of rootKeys) {
      const liveFragment = liveDoc.getXmlFragment(key);
      const snapshotFragment = snapshotDoc.getXmlFragment(key);

      liveFragment.delete(0, liveFragment.length);

      const restoredNodes = cloneXmlContent(snapshotFragment);
      if (restoredNodes.length > 0) {
        liveFragment.insert(0, restoredNodes);
      }
    }
  }, 'version-restore');

  return rootKeys.length;
}
