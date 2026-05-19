/** Sliding-window event counter for spike detection. */
export class EventWindow {
  private hits = new Map<string, number[]>();

  record(key: string, windowMs: number): number {
    const now = Date.now();
    const arr = (this.hits.get(key) ?? []).filter((t) => now - t < windowMs);
    arr.push(now);
    this.hits.set(key, arr);
    return arr.length;
  }

  count(key: string, windowMs: number): number {
    const now = Date.now();
    const arr = (this.hits.get(key) ?? []).filter((t) => now - t < windowMs);
    this.hits.set(key, arr);
    return arr.length;
  }
}
