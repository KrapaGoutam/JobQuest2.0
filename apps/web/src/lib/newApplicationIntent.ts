/**
 * Cross-component "open the New Application form" intent (M3).
 * The shell raises it from the global `q` shortcut or its New Application action on any
 * route; ApplicationsView consumes it when it is mounted (or as soon as it mounts after
 * navigation). This replaces the M2 placeholder Quick Add modal, which did not persist.
 */
const EVENT = 'jobquest:new-application';
let pending = false;

export function requestNewApplication(): void {
  pending = true;
  window.dispatchEvent(new Event(EVENT));
}

export function consumeNewApplicationRequest(): boolean {
  const was = pending;
  pending = false;
  return was;
}

export function onNewApplicationRequest(cb: () => void): () => void {
  const handler = () => {
    if (consumeNewApplicationRequest()) cb();
  };
  window.addEventListener(EVENT, handler);
  return () => window.removeEventListener(EVENT, handler);
}
