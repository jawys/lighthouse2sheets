import lighthouse from 'lighthouse';
import { launch } from 'chrome-launcher';

function launchChromeAndRunLighthouse(url, opts, config = null) {
	return launch({ chromeFlags: opts.chromeFlags }).then(chrome => {
		opts.port = chrome.port;
		return lighthouse(url, opts, config).then(results => chrome.kill().then(() => results.lhr));
	});
}

const opts = {
	chromeFlags: ['--show-paint-rects']
};

// Usage:
launchChromeAndRunLighthouse('https://example.com', opts).then(results => {
	console.log({ results });
});
