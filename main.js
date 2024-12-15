import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import expressWs from 'express-ws';
import { spawn } from 'node-pty';
import json from './secrets/config.json' with { type: 'json' };

const __dirname = path.dirname(fileURLToPath(import.meta.url)),
	PORT = process.env.PORT || 5164,
	app = express();

expressWs(app); // enable websockets for the app


// parse form data
app.use(express.urlencoded({ extended: true }));
app.use(express.json({ extended: true }));
app.use('/node_modules', express.static('node_modules'));


// shell interface
app.get('/', (req, res) => {
	res.sendFile('shell.html', { root: path.join(__dirname, 'HTML') });
});


// when a websocket is opened at /shell-ws, spawn a fish shell in a pty
app.ws('/shell-ws', (ws, req) => {
	// spawn a fish shell using node-pty with a pseudo-terminal
	const shell = spawn('su', ['-', 'ion606', '-s', '/usr/bin/fish'], {
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


app.get('*', (req, res) => res.end());


app.listen(PORT, '0.0.0.0', () => console.log('server listening on http://localhost:' + PORT));