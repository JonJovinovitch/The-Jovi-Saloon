/** WebSocket client: JSON in, JSON out, with reconnect and a resume key. */

import type { ClientMessage, ServerMessage } from '@shared/protocol.ts';

type Handler = (msg: ServerMessage) => void;

export class Net {
  private ws: WebSocket | null = null;
  private queue: ClientMessage[] = [];
  private retry = 0;
  private closed = false;
  private pingTimer = 0;

  constructor(
    private url: string,
    private hello: () => ClientMessage,
    private onMessage: Handler,
    private onStatus: (connected: boolean) => void,
  ) {}

  connect(): void {
    this.closed = false;
    const ws = new WebSocket(this.url);
    this.ws = ws;

    ws.onopen = () => {
      this.retry = 0;
      this.onStatus(true);
      ws.send(JSON.stringify(this.hello()));
      for (const m of this.queue.splice(0)) ws.send(JSON.stringify(m));
      this.pingTimer = window.setInterval(() => this.send({ t: 'ping' }), 25_000);
    };

    ws.onmessage = (ev) => {
      try {
        this.onMessage(JSON.parse(ev.data as string) as ServerMessage);
      } catch {
        /* ignore malformed frames */
      }
    };

    ws.onclose = () => {
      window.clearInterval(this.pingTimer);
      this.onStatus(false);
      if (this.closed) return;
      // Back off, but never so far that a friend waiting on you times out.
      const wait = Math.min(8000, 400 * 2 ** this.retry++);
      setTimeout(() => this.connect(), wait);
    };

    ws.onerror = () => ws.close();
  }

  send(msg: ClientMessage): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
    else if (msg.t !== 'ping') this.queue.push(msg);
  }

  close(): void {
    this.closed = true;
    window.clearInterval(this.pingTimer);
    this.ws?.close();
  }
}
