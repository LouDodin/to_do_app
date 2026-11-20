// The Inbox box of the reviews (Tomorrow, Weekly review), 14 Nov 2026: it ticks itself when the
// Inbox is empty, and can be ticked or unticked by hand. A hand tick wins until the app is
// reloaded (kept in memory only, so it survives going to the Inbox and back).
export const inboxTick = $state<{ manual: Record<string, boolean | undefined> }>({ manual: {} });

export const inboxTicked = (page: string, empty: boolean) => inboxTick.manual[page] ?? empty;

export function toggleInboxTick(page: string, empty: boolean) {
	inboxTick.manual[page] = !inboxTicked(page, empty);
}
