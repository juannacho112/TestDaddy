// lib/cache.ts

type CacheEntry<T> = {
  value: T;
  expiry: number; // Unix timestamp in milliseconds
};

class SimpleCache {
  private cache: Map<string, CacheEntry<any>> = new Map();

  /**
   * Sets a value in the cache with a specified TTL.
   * @param key - The cache key.
   * @param value - The value to cache.
   * @param ttl - Time-to-live in milliseconds.
   */
  set<T>(key: string, value: T, ttl: number) {
    const expiry = Date.now() + ttl;
    this.cache.set(key, { value, expiry });
  }

  /**
   * Retrieves a value from the cache if it hasn't expired.
   * @param key - The cache key.
   * @returns The cached value or null if not found/expired.
   */
  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiry) {
      this.cache.delete(key);
      return null;
    }
    return entry.value;
  }

  /**
   * Clears the entire cache.
   */
  clear() {
    this.cache.clear();
  }
}

export const cache = new SimpleCache();
