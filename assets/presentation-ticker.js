export function createPresentationTicker({
  onTick,
  intervalMs = 250,
  now = () => Date.now(),
  setIntervalImpl = setInterval,
  clearIntervalImpl = clearInterval
}) {
  let timer = null;

  function stop() {
    if (timer != null) clearIntervalImpl(timer);
    timer = null;
  }

  function sync(active) {
    if (!active) {
      stop();
      return;
    }
    if (timer != null) return;
    timer = setIntervalImpl(() => onTick?.(now()), intervalMs);
  }

  return {
    sync,
    stop,
    isRunning: () => timer != null
  };
}
