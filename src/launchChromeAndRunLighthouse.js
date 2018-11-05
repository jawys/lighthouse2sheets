import lighthouse from 'lighthouse';
import { launch } from 'chrome-launcher';

const optsDefault = {
	chromeFlags: ['--show-paint-rects'],
};

export default async function launchChromeAndRunLighthouse(url, opts = optsDefault, config = null) {
	const chrome = await launch({ chromeFlags: opts.chromeFlags });
	opts.port = chrome.port;
	const results = await lighthouse(url, opts, config);
	await chrome.kill();
	return results.lhr;
}
