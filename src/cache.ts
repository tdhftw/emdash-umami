/** Small read-through cache on plugin KV. KV has no TTL, so entries carry their own timestamp. */

export interface CacheKV {
	get<T>(key: string): Promise<T | null | undefined>;
	set(key: string, value: unknown): Promise<void>;
}

interface Entry<T> {
	at: number;
	value: T;
}

export interface Cached<T> {
	value: T;
	/** The fresh fetch failed and this is an older copy. */
	stale: boolean;
}

/**
 * Returns a cached value younger than `maxAgeMs`, otherwise loads a fresh one. If loading fails and
 * any cached copy exists, that copy is returned as stale instead of failing the request.
 */
export async function cached<T>(
	kv: CacheKV,
	key: string,
	maxAgeMs: number,
	load: () => Promise<T>,
	now = Date.now(),
): Promise<Cached<T>> {
	const entry = await kv.get<Entry<T>>(key);
	if (entry && now - entry.at < maxAgeMs) return { value: entry.value, stale: false };
	try {
		const value = await load();
		await kv.set(key, { at: now, value } satisfies Entry<T>);
		return { value, stale: false };
	} catch (error) {
		if (entry) return { value: entry.value, stale: true };
		throw error;
	}
}
