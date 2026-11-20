import { describe, it, expect } from 'vitest';
import { installHelp } from './installHelp';

const UA = {
	ffAndroid: 'Mozilla/5.0 (Android 14; Mobile; rv:131.0) Gecko/131.0 Firefox/131.0',
	chromeAndroid: 'Mozilla/5.0 (Linux; Android 14; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
	samsung: 'Mozilla/5.0 (Linux; Android 14; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36',
	whatsapp: 'Mozilla/5.0 (Linux; Android 14; K; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0.0.0 Mobile Safari/537.36',
	iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
	iphoneChrome: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0 Mobile/15E148 Safari/604.1',
	ipad: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
	ffDesktop: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:131.0) Gecko/20100101 Firefox/131.0',
	edge: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0',
	safariMac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15'
};

describe('installHelp', () => {
	it('gives steps for each phone browser', () => {
		expect(installHelp(UA.ffAndroid).where).toBe('Firefox on Android');
		expect(installHelp(UA.ffAndroid).steps[0]).toMatch(/⋮/);
		expect(installHelp(UA.chromeAndroid).where).toBe('Chrome on Android');
		expect(installHelp(UA.samsung).where).toBe('Samsung Internet');
		expect(installHelp(UA.iphone).where).toMatch(/Safari on iPhone/);
		expect(installHelp(UA.iphone).steps.join(' ')).toMatch(/Add to Home Screen/);
		expect(installHelp(UA.iphoneChrome).where).toBe('Chrome on iPhone');
	});
	it('spots a link opened inside WhatsApp', () => {
		const h = installHelp(UA.whatsapp);
		expect(h.where).toMatch(/inside another app/);
		expect(h.steps[0]).toMatch(/Open in Chrome/);
	});
	it('an iPad that says Macintosh is still an iPad', () => {
		expect(installHelp(UA.ipad, 5).where).toMatch(/iPhone \/ iPad/);
		expect(installHelp(UA.safariMac, 0).where).toBe('Safari on a Mac');
	});
	it('computers', () => {
		expect(installHelp(UA.ffDesktop).steps).toEqual([]);
		expect(installHelp(UA.ffDesktop).note).toMatch(/cannot install/);
		expect(installHelp(UA.edge).where).toBe('Edge');
	});
});
