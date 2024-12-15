import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import session from 'express-session';
import expressWs from 'express-ws';
import { spawn } from 'node-pty';
import json from './secrets/config.json' with { type: 'json' };

// TODO: add web portal mirroring integration

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
expressWs(app); // enable websockets for the app

const PORT = 3000;

// configure session
app.use(session({
	secret: json.secretkey,
	resave: false,
	saveUninitialized: false
}));

// parse form data
app.use(express.urlencoded({ extended: true }));
app.use(express.json({ extended: true }));
app.use('/node_modules', express.static('node_modules'));


// authentication middleware
function requireAuth(req, res, next) {
	if (req.session && req.session.authenticated) {
		return next();
	} else {
		res.redirect('/login');
	}
}

// serve login page
app.get('/login', (req, res) => {
	res.sendFile('login.html', { root: path.join(__dirname, 'HTML') });
});

// process login
app.post('/login', (req, res) => {
	try {
		const username = req.body.username;
		const password = req.body.password;

		if (!username) return res.sendStatus(404);
		else if (!password) return res.sendStatus(401);

		const shell = spawn('su', [`${username}`], {
			cwd: process.env.HOME,
			env: process.env
		});

		req.on('end', () => shell.kill());

		shell.onData((data) => {
			if (data?.toLowerCase().trim() === 'password:') shell.write(password + '\n');
			else if (data.includes('does not exist')) res.sendStatus(404);
			else if (data.includes('Authentication failure')) res.sendStatus(401);
			else if (data.includes('Welcome to fish')) {
				req.session.authenticated = true;
				res.redirect('/shell');
				shell.kill();
			}
			else console.error(`unknown terminal output:\n${data}`);
		});
	}
	catch (err) {
		console.error(err);
	}
});

// shell interface
app.get('/shell', requireAuth, (req, res) => {
	res.sendFile('shell.html', { root: path.join(__dirname, 'HTML') });
});

// logout route
app.get('/logout', (req, res) => {
	req.session.destroy(() => {
		res.redirect('/login');
	});
});

// when a websocket is opened at /shell-ws, spawn a fish shell in a pty
app.ws('/shell-ws', (ws, req) => {
	// spawn a fish shell using node-pty with a pseudo-terminal
	const shell = spawn('fish', [], {
		cols: 80,
		rows: 24,
		cwd: process.env.HOME,
		env: process.env
	});

	// send any data from the shell to the client
	shell.onData((data) => {
		ws.send(JSON.stringify({ data }));
	});

	shell.onExit((e) => ws.send(JSON.stringify({ event: 'exit', code: e })));

	// when the client sends data, write it to the shell's stdin
	ws.on('message', (msg) => shell.write(msg));

	// when the websocket closes, kill the shell
	ws.on('close', () => shell.kill());
});

app.listen(PORT, () => console.log('server listening on http://localhost:' + PORT));