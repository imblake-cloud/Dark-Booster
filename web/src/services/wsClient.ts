export type WsMessage =
  | { type: "status"; data: unknown[] }
  | { type: "guards"; data: unknown[] };

export interface WsClientOptions {
  onMessage:    (msg: WsMessage) => void;
  onConnect?:    () => void;
  onDisconnect?: () => void;
}

export function createWsClient(
  optsOrCallback: WsClientOptions | ((msg: WsMessage) => void),
): () => void {
  const opts: WsClientOptions =
    typeof optsOrCallback === "function"
      ? { onMessage: optsOrCallback }
      : optsOrCallback;

  let ws: WebSocket | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let destroyed = false;

  const connect = () => {
    if (destroyed) return;

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const url = `${protocol}//${window.location.host}/ws`;

    ws = new WebSocket(url);

    ws.onopen = () => {
      if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
      opts.onConnect?.();
    };

    ws.onmessage = (event: MessageEvent) => {
      try {
        const msg = JSON.parse(event.data as string) as WsMessage;
        opts.onMessage(msg);
      } catch {
        // ignore malformed messages
      }
    };

    ws.onclose = () => {
      opts.onDisconnect?.();
      if (destroyed) return;
      retryTimer = setTimeout(connect, 3000);
    };

    ws.onerror = () => {
      ws?.close();
    };
  };

  connect();

  return () => {
    destroyed = true;
    if (retryTimer) clearTimeout(retryTimer);
    ws?.close();
  };
}
