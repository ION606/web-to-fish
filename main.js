import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import session from 'express-session';
import expressWs from 'express-ws';
import { spawn } from 'node-pty';
import json from './secrets/config.json' with { type: 'json' };

const __dirname = path.dirname(fileURLToPath(import.meta.url)),
	PORT = process.env.PORT || 5164,
	app = express();

expressWs(app); // enable websockets for the app


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


app.post('/login', async (req, res) => {
	try {
		const username = req.body.username;
		const password = req.body.password;

		// validate input
		if (!username) return res.status(400).send('Username is required');
		if (!password) return res.status(400).send('Password is required');

		const { uname, upass } = json;

		if (username !== uname) return res.sendStatus(404);
		else if (password !== upass) return res.sendStatus(401);

		req.session.authenticated = true;
		req.session.username = username;

		return res.redirect('/shell');
	} catch (err) {
		console.error(err);
		res.status(500).send('Internal server error');
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


app.get('/', (req, res) => res.end());


app.listen(PORT, '0.0.0.0', () => console.log('server listening on http://localhost:' + PORT));