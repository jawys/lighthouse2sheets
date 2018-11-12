import { readFile, writeFile } from 'fs';
import { google } from 'googleapis';
import { createInterface } from 'readline';
import launchChromeAndRunLighthouse from './launchChromeAndRunLighthouse';
import categorieFilter from './util/categories';

// If modifying these scopes, delete token.json.
const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];
const TOKEN_PATH = 'token.json';

/**
 * Print error message + error number and finally die.
 * @param {Error} error The Error.
 */
function harakiri(error) {
	const { errno, message } = error;
	console.error(message);
	process.exit(errno);
}

/**
 * Reads code from `stdin` after printing a prompt to the user.
 * @param {string} prompt The prompt to show to the user.
 * @returns The code entered by the user as `Promise<string>`.
 */
async function readInput(prompt) {
	const readline = createInterface(process.stdin, process.stdout);
	return new Promise((resolve) => {
		readline.question(prompt, (answer) => {
			readline.close();
			resolve(answer);
		});
	});
}

async function readTokens(path = TOKEN_PATH) {
	return new Promise((resolve, reject) => {
		readFile(path, (err, buffer) => (err ? reject(err) : resolve(JSON.parse(buffer))));
	});
}

async function readCredentials(path = 'credentials.json') {
	return new Promise((resolve, reject) => {
		readFile(path, (err, buffer) => (err ? reject(err) : resolve(JSON.parse(buffer))));
	});
}

/**
 * Stores the given token credentials on disk in path specified by `TOKEN_PATH`.
 * @param {Object} tokens
 */
async function storeTokens(tokens) {
	return new Promise((resolve, reject) => {
		writeFile(TOKEN_PATH, JSON.stringify(tokens), (err) => {
			if (err) {
				reject(err);
			} else {
				console.log('Tokens stored to', TOKEN_PATH);
				resolve();
			}
		});
	});
}

function prependErrMsg(error, message) {
	error.message = `${message}:\n${error.message}`;
}

/**
 * Get and store new tokens after prompting for user authorization,
 * and then return the authorized OAuth2 client.
 * @param {google.auth.OAuth2} oAuth2Client The OAuth2 client to get tokens for.
 * @returns {object} The new tokens object.
 */
async function getNewTokens(oAuth2Client) {
	const authUrl = oAuth2Client.generateAuthUrl({
		access_type: 'offline',
		scope: SCOPES,
	});
	console.log('Authorize me by visiting this url:', authUrl);
	const code = await readInput('Enter the retrieved code here: ');
	try {
		const { tokens } = await oAuth2Client.getToken(code);
		// Store the tokens to disk for later program executions
		try {
			await storeTokens(tokens);
		} catch (error) {
			prependErrMsg(error, 'Error while trying to write tokens to disk');
			throw error;
		}
		return tokens;
	} catch (error) {
		prependErrMsg(error, 'Error while trying to retrieve access tokens');
		throw error;
	}
}

/**
 * Create an OAuth2 client with the given credentials,
 * and then return the authorized OAuth2 client.
 * @param {Object} credentials The authorization client credentials.
 * @returns {google.auth.OAuth2} The authorized OAuth2 client.
 */
async function authorize(credentials) {
	const { client_secret, client_id, redirect_uris } = credentials.installed; // eslint-disable-line
	const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

	// Check if we have previously stored a token.
	let tokens = null;
	try {
		tokens = await readTokens();
	} catch (error) {
		console.info('Could not read tokens from disk – trying to get new tokens…');
		try {
			tokens = await getNewTokens(oAuth2Client);
		} catch (error2) {
			prependErrMsg(error2, 'Error while trying to get new tokens');
			throw error2;
		}
	}
	oAuth2Client.setCredentials(tokens);
	return oAuth2Client;
}

/**
 * Update sheet with given values
 * @param {google.auth.OAuth2} auth The authenticated Google OAuth client.
 */
async function updateSheet(auth, spreadsheetId, range, values) {
	const sheets = google.sheets({ version: 'v4', auth });
	return sheets.spreadsheets.values.update({
		spreadsheetId,
		range,
		resource: {
			values,
		},
		valueInputOption: 'RAW',
	});
}

/**
 * Read rows of sheet
 * @param {google.auth.OAuth2} auth The authenticated Google OAuth client.
 * @param {google.auth.OAuth2} auth The authenticated Google OAuth client.
 */
async function readSheet(auth, spreadsheetId, range) {
	const sheets = google.sheets({ version: 'v4', auth });
	return sheets.spreadsheets.values.get({ spreadsheetId, range });
}

async function getLighthouseResults(rows) {
	// Process rows in sequence
	return rows.reduce(
		async (p, row, i, a) => {
			// Wait for previous Promise to finish
			await p;
			// Check columns A and B, which correspond to indices 0 and 1.
			const [url, result] = row;
			if (!result) {
				console.log(`found nothing for "${url}" – getting lighthouse result…`);
				const report = await launchChromeAndRunLighthouse(url);
				row[1] = report;
			} else {
				console.log(`${url} has already a result.`);
			}
			// console.log({ row, i, a });
			return a;
		},
		Promise.resolve() // Start with initial Promise
	);
}

async function filterRows(rows) {
	return rows.map((row) => {
		const results = row.pop();
		if (typeof results === 'object') {
			const { audits, categories } = results;
			Object.keys(categories)
				// filter wanted categories
				.filter((key) => categorieFilter.indexOf(key) > -1)
				// push results to row array
				.forEach((category) => {
					categories[category].auditRefs.forEach((auditRef) => {
						const item = {
							id: auditRef.id,
							title: audits[auditRef.id].title,
							score: audits[auditRef.id].score,
							rawValue: audits[auditRef.id].rawValue,
							displayValue: audits[auditRef.id].displayValue,
						};
						row.push(JSON.stringify(item));
					});
				});
		}
		return row;
	});
}

async function generateHeader(rows) {
	const headlines = [['']];
	if (rows) {
		const row = rows[0];
		row.forEach((value, i) => {
			if (i > 0) {
				headlines[0].push(JSON.parse(value).title);
			}
		});
	}

	return headlines;
}

export default async function main() {
	try {
		const credentials = await readCredentials();

		// Authorize a client with credentials, then call the Google Sheets API.
		const oAuth2Client = await authorize(credentials);

		const [spreadsheetId, defaultRange] = ['1608q3JwkMDaWndb9cBTJ_ACcgt5DvxS7oy6LDNu1fhg', 'A2:ZZ101'];
		// Use range given by user or use default
		const range = (await readInput(`Specify values range of spreadsheets [${defaultRange}]: `)) || defaultRange;

		// Edit sheet via API with authorized client
		const readResult = await readSheet(oAuth2Client, spreadsheetId, range);
		let { values: rows } = readResult.data;
		if (!(rows && rows.length)) {
			return console.log('No data found.');
		}
		rows = await getLighthouseResults(rows);

		// Filter results
		rows = await filterRows(rows);

		const headlines = await generateHeader(rows);
		await updateSheet(oAuth2Client, spreadsheetId, 'A1:ZZ1', headlines);
		// eslint-disable-next-line
		const { data } = await updateSheet(oAuth2Client, spreadsheetId, range, rows);
		// Print update result
		console.log('Update results:');
		// eslint-disable-next-line no-restricted-syntax
		for (const key of Object.keys(data)) {
			console.log('\t', key, ' '.repeat(16).slice(key.length), data[key]);
		}
	} catch (error) {
		harakiri(error);
	}
	return 0;
}
