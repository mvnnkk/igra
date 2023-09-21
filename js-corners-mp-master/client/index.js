const fs = require('fs');
const http = require('http');
const process = require('process');

const SERVER_PORT = process.env.CORNERS_CLIENT_PORT ?? 9001;

const pageContent = fs.readFileSync(`${__dirname}/index.html`);
http.createServer((req, res) => {
    res.end(pageContent);
}).listen(SERVER_PORT);
console.log(`Server started on ${SERVER_PORT} port.`);
