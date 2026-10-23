export class RequestBudgets {
  #entries = new Map<string, { reset: number; count: number }>();
  #sweepAt = Infinity;

  consume(key: string, now: number): 200 | 429 | 503 {
    if (now >= this.#sweepAt) {
      this.#sweepAt = Infinity;
      for (const [identity, budget] of this.#entries) {
        if (budget.reset <= now) this.#entries.delete(identity);
        else this.#sweepAt = Math.min(this.#sweepAt, budget.reset);
      }
    }
    let budget = this.#entries.get(key);
    if (!budget) {
      if (this.#entries.size >= 10000) return 503;
      budget = { reset: now + 60000, count: 0 };
      this.#entries.set(key, budget);
      this.#sweepAt = Math.min(this.#sweepAt, budget.reset);
    }
    return ++budget.count > 90 ? 429 : 200;
  }
}
