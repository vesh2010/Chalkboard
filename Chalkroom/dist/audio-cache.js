// Shared, bounded frontend audio cache. Kept outside the lesson controller so
// voice provider changes and interrupted playback do not retain stale URLs.
window.chalkAudioCache = (() => {
  const entries = new Map();
  const maxBytes = 16 * 1024 * 1024;
  let bytes = 0;
  function put(key, blob) {
    if (!(blob instanceof Blob) || blob.size > maxBytes) return blob;
    const old = entries.get(key);
    if (old) bytes -= old.size;
    entries.delete(key);
    entries.set(key, blob);
    bytes += blob.size;
    while (bytes > maxBytes) {
      const oldest = entries.keys().next().value;
      bytes -= entries.get(oldest).size;
      entries.delete(oldest);
    }
    return blob;
  }
  function get(key) {
    const blob = entries.get(key);
    if (blob) {
      entries.delete(key);
      entries.set(key, blob);
    }
    return blob;
  }
  async function getOrLoad(key, loader) {
    const cached = get(key);
    if (cached) return cached;
    const blob = await loader();
    return put(key, blob);
  }
  function clear() { entries.clear(); bytes = 0; }
  return {get, put, getOrLoad, clear};
})();
