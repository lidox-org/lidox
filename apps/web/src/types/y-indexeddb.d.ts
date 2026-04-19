declare module 'y-indexeddb' {
  import type * as Y from 'yjs';

  export class IndexeddbPersistence {
    constructor(name: string, doc: Y.Doc);
    on(event: 'synced', callback: () => void): void;
    destroy(): Promise<void>;
    clearData(): Promise<void>;
  }
}
