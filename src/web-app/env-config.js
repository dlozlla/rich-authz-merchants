const path = require('path');
require("dotenv").config({
  path: path.join(__dirname, '../../.env')
});
const {
  ISSUER_BASE_URL,
  CLIENT_ID,
  CLIENT_SECRET,
  RESPONSE_TYPE,
  AUDIENCE,
  SCOPE,
  SESSION_SECRET,
  PORT,
  APP_PORT,
  API_URL,
} = process.env;
let {
  APP_URL,
} = process.env;

if (!APP_URL) {
  APP_URL = `http://localhost:${PORT || APP_PORT}`;
}

function checkUrl() {
  return (req, res, next) => {
    let host = req.headers.host;
    if (!APP_URL.includes(host)) {
      return res.status(301).redirect(APP_URL);
    }
    return next();
  };
}

function removeTrailingSlashFromUrl(url) {
  if (!url || !url.endsWith("/")) return url;

  return url.substring(0, url.length - 1);
}

console.log("\n----------------------------------");
console.log("Environment Settings:");
console.log(`ISSUER_BASE_URL: ${ISSUER_BASE_URL}`);
console.log(`CLIENT_ID: ${CLIENT_ID}`);
if (CLIENT_SECRET) console.log(`CLIENT_SECRET: Has Value`);
else console.log(`CLIENT_SECRET: Not Set`);
console.log(`RESPONSE_TYPE: ${RESPONSE_TYPE}`);
console.log(`AUDIENCE: ${AUDIENCE}`);
console.log(`SCOPE: ${SCOPE}`);
if (SESSION_SECRET) console.log(`SESSION_SECRET: ${SESSION_SECRET}`);
else console.log(`SESSION_SECRET: Not Set`);
console.log(`PORT: ${PORT}`);
console.log(`APP_PORT: ${APP_PORT}`);
console.log(`APP_URL: ${APP_URL}`);
console.log(`API_URL: ${API_URL}`);

console.log("----------------------------------\n");

module.exports = {
  checkUrl,
  ISSUER_BASE_URL: removeTrailingSlashFromUrl(ISSUER_BASE_URL),
  CLIENT_ID: CLIENT_ID,
  CLIENT_SECRET: CLIENT_SECRET,
  AUDIENCE: AUDIENCE,
  RESPONSE_TYPE: RESPONSE_TYPE,
  SCOPE: SCOPE,
  SESSION_SECRET: SESSION_SECRET,
  PORT: PORT,
  APP_PORT: APP_PORT,
  APP_URL: APP_URL,
  API_URL: removeTrailingSlashFromUrl(API_URL),
};
