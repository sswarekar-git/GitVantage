import { getVsCodeApi } from './vscodeApi';

type WithType = { type: string };
type WithRequestId = { requestId: string };
type MaybeErrorMessage = { type: string; payload?: { message?: string } };

export interface MessageBus<In extends WithType, Out extends WithType> {
  init(): void;
  onMessage(handler: (msg: In) => void): () => void;
  send(message: Out): void;
  request<T extends In>(message: Extract<Out, WithRequestId>): Promise<T>;
}

export function createMessageBus<In extends WithType, Out extends WithType>(): MessageBus<In, Out> {
  const pending = new Map<string, { resolve: (msg: In) => void; reject: (err: Error) => void }>();
  const subscribers = new Set<(msg: In) => void>();

  return {
    init() {
      window.addEventListener('message', (event: MessageEvent<In>) => {
        const msg = event.data;
        if ('requestId' in msg && typeof msg.requestId === 'string' && pending.has(msg.requestId)) {
          const { resolve, reject } = pending.get(msg.requestId)!;
          pending.delete(msg.requestId);
          // A host-side failure while a request is in flight arrives as an
          // 'error' message carrying the same requestId, not as the expected
          // reply shape — reject so callers can catch it instead of crashing
          // on `reply.payload.<field>` being undefined.
          if ((msg as MaybeErrorMessage).type === 'error') {
            reject(new Error((msg as MaybeErrorMessage).payload?.message ?? 'Unknown error'));
          } else {
            resolve(msg);
          }
          return;
        }
        for (const sub of subscribers) sub(msg);
      });
    },
    onMessage(handler) {
      subscribers.add(handler);
      return () => subscribers.delete(handler);
    },
    send(message) {
      getVsCodeApi().postMessage(message);
    },
    request<T extends In>(message: Extract<Out, WithRequestId>): Promise<T> {
      return new Promise((resolve, reject) => {
        pending.set(message.requestId, { resolve: resolve as (msg: In) => void, reject });
        getVsCodeApi().postMessage(message);
      });
    },
  };
}
