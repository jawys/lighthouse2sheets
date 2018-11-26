import lighthouse from 'lighthouse';
import { launch } from 'chrome-launcher';

const optsDefault = {
	chromeFlags: ['--show-paint-rects'],
};

export default async function launchChromeAndRunLighthouse(url, opts = optsDefault, config = null) {
	try {
		const chrome = await launch({ chromeFlags: opts.chromeFlags });
		opts.port = chrome.port;
		const results = await lighthouse(url, opts, config);
		try {
			await chrome.kill();
		} catch (e) {
			console.log(e);
		}
		return JSON.parse(results.report);
	} catch (e) {
		throw e;
	}
}
