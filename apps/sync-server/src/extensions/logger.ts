import {
  Extension,
  onConnectPayload,
  onDisconnectPayload,
  onLoadDocumentPayload,
  onStoreDocumentPayload,
} from '@hocuspocus/server';

/**
 * Simple logging extension that records connections, disconnections,
 * document loads, document stores, and errors.
 */
export class LoggerExtension implements Extension {
  private prefix = '[sync-server]';

  private timestamp(): string {
    return new Date().toISOString();
  }

  async onConnect(data: onConnectPayload): Promise<void> {
    console.log(
      `${this.timestamp()} ${this.prefix} connection opened – doc="${data.documentName}" request=${data.request?.url ?? 'n/a'}`,
    );
  }

  async onDisconnect(data: onDisconnectPayload): Promise<void> {
    console.log(
      `${this.timestamp()} ${this.prefix} connection closed – doc="${data.documentName}" context=${JSON.stringify(data.context ?? {})}`,
    );
  }

  async onLoadDocument(data: onLoadDocumentPayload): Promise<void> {
    console.log(
      `${this.timestamp()} ${this.prefix} loading document – doc="${data.documentName}"`,
    );
  }

  async onStoreDocument(data: onStoreDocumentPayload): Promise<void> {
    console.log(
      `${this.timestamp()} ${this.prefix} stored document – doc="${data.documentName}"`,
    );
  }

  async onDestroy(): Promise<any> {
    console.log(`${this.timestamp()} ${this.prefix} server shutting down`);
  }
}
