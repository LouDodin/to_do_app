import { getApiUrl, setApiUrl, setToken, clearAuth } from './config';
import { sessionSettled } from '../alerts/state';

interface LoginResponse {
	token: string;
}

// Login is a raw fetch (not the `api` wrapper) because at this point we
// don't have a token yet — the wrapper's 401-redirect logic would be
// meaningless and premature here.
// Thrown when the account has two-factor authentication on and no (or a wrong) code was given.
export class TotpRequiredError extends Error {
	constructor(message = 'Enter the 6-digit code from your authenticator app.') {
		super(message);
	}
}

export async function login(apiUrl: string, username: string, password: string, totp?: string): Promise<void> {
	setApiUrl(apiUrl);
	const base = apiUrl.replace(/\/+$/, '');
	let res: Response;
	try {
		res = await fetch(`${base}/api/v1/login`, {
			method: 'POST',
			credentials: 'include', // lets the browser keep Vikunja's refresh-token cookie
			headers: { 'Content-Type': 'application/json' },
			// long_token: the session lasts 30 days without contact with the server instead of 3, so a
			// device survives the server PC being asleep or off for a few days (Oct 2026: 3.5 days
			// of a sleeping PC signed every device out).
			body: JSON.stringify({ username, password, long_token: true, ...(totp ? { totp_passcode: totp.replace(/\s/g, '') } : {}) })
		});
	} catch {
		throw new Error('The server cannot be reached. Check the address, and that the server (PC) is on.');
	}
	if (!res.ok) {
		let code = 0;
		let message = '';
		try {
			const body = await res.json();
			code = body.code ?? 0;
			message = body.message ?? '';
		} catch {
			/* not JSON */
		}
		if (code === 1017) throw new TotpRequiredError(totp ? 'That code is not valid (or was already used): wait for the next one.' : undefined);
		if (res.status === 429) throw new Error('Too many attempts: wait a minute and try again.');
		if (res.status === 401 || res.status === 403 || code === 1011) throw new Error('Incorrect username or password');
		throw new Error(message || res.statusText || `Error ${res.status}`);
	}
	const data: LoginResponse = await res.json();
	setToken(data.token);
	sessionSettled();
}

export function logout() {
	clearAuth();
	sessionSettled(); // signed out on purpose: no alert
}

export function isLoggedIn(): boolean {
	return !!getApiUrl();
}
