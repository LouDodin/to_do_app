import type { SyncStatus } from '../types';
import { syncFailed, syncSucceeded } from '../alerts/state';
import { recordError } from './errorReport';

// Sync status indicator, shown permanently in the app shell per spec
// ("Indicateur de synchronisation"). The sync engine (db/sync.ts) is the
// only writer to this store; UI components only read it.
class SyncStore {
	status = $state<SyncStatus>('synced');
	pendingCount = $state(0);
	lastError = $state<string | null>(null);
	lastSyncedAt = $state<number | null>(null);

	setSyncing() {
		this.status = 'syncing';
		this.lastError = null;
	}
	/** `reachedServer`: false when nothing was actually exchanged (an empty queue), which says
	 *  nothing about whether the server can be reached. */
	setSynced(reachedServer = true) {
		this.status = this.pendingCount > 0 ? 'pending' : 'synced';
		this.lastSyncedAt = Date.now();
		if (reachedServer) syncSucceeded();
	}
	setOffline() {
		this.status = 'offline';
		syncFailed();
	}
	setError(message: string) {
		this.status = 'error';
		this.lastError = message;
		recordError('sync', message);
		syncFailed();
	}
	setPendingCount(n: number) {
		this.pendingCount = n;
		if (this.status !== 'syncing' && this.status !== 'offline' && this.status !== 'error') {
			this.status = n > 0 ? 'pending' : 'synced';
		}
	}
}

export const syncStore = new SyncStore();
