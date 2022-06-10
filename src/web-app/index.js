const {
  checkUrl,
  ISSUER_BASE_URL, // Auth0 Tenant Url
  CLIENT_ID, // Auth0 Web App Client
  CLIENT_SECRET, // Auth0 Web App CLient Secret
  RESPONSE_TYPE,
  AUDIENCE,
  SCOPE,
  SESSION_SECRET, // Cookie Encryption Key
  APP_PORT,
  PORT,
  APP_URL, // Public URL for this app
  API_URL, // URL for Expenses API
} = require("./env-config");

const express = require("express");
const session = require("express-session");
const createError = require("http-errors");
const cookieParser = require("cookie-parser");
const morgan = require("morgan");
const logger = require("./winston");
const path = require("path");
const { createServer } = require("http");
const { auth, requiresAuth } = require("express-openid-connect");
const axios = require("axios").default;

const app = express();
const responseTypesWithToken = ["code id_token", "code"];

app.use(checkUrl()); // Used to normalize URL
app.set("views", path.join(__dirname, "views"));
app.set("view engine", "pug");
app.use(morgan('":method :url :status :res[content-length] - :response-time ms"', { stream: logger.stream }));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "public")));

app.use(
  session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: true,
  })
);

// some configs can be obtained from env vars, but better make it explicit. Response_mode is left to always default to query
app.use(
  auth({
    secret: SESSION_SECRET,
    authRequired: false,
    auth0Logout: true,
    baseURL: APP_URL,
    issuerBaseURL: ISSUER_BASE_URL,
    clientID: CLIENT_ID,
    clientSecret: CLIENT_SECRET,
    authorizationParams: {
      response_type: RESPONSE_TYPE,
      audience: AUDIENCE,
      scope: SCOPE,
    },
  })
);

app.get("/", async (req, res, next) => {
    try {
       res.render("home", {
        user: req.oidc && req.oidc.user,
       });
    } catch (err) {
       next(err);
    }
});

app.get("/user", requiresAuth(), async (req, res) => {
  res.render("user", {
    user: req.oidc && req.oidc.user,
    id_token: req.oidc && req.oidc.idToken,
    access_token: req.oidc && req.oidc.accessToken,
    refresh_token: req.oidc && req.oidc.refreshToken,
  });
});

app.get("/prepare-transaction", requiresAuth(), async (req, res) => {
  let errorMessage;
  const error = req.query && req.query.error;
  if (error === 'access_denied') {
    // The AS said we are not allowed to do this transaction, tell the end-user!
    errorMessage = 'You are not authorized to make this transaction. Perhaps you can try with a smaller transaction amount?';
    delete req.session.pendingTransaction;
  }

  const transaction_amount = req.query && req.query.transaction_amount || 15;
  res.render("transaction", {
    user: req.oidc && req.oidc.user,
    id_token: req.oidc && req.oidc.idToken,
    access_token: req.oidc && req.oidc.accessToken,
    refresh_token: req.oidc && req.oidc.refreshToken,
    transaction_amount,
    errorMessage
  });
});

app.get("/resume-transaction", requiresAuth(), async (req, res, next) => {
  if (req.session.pendingTransaction) {
    try {
      const { transaction_amount, transaction_id, description } = req.session.pendingTransaction;
      // TODO: handle the error case here...
      await submitTransaction({ transaction_amount, transaction_id, description }, req);
      res.render("transaction-complete", {
        user: req.oidc && req.oidc.user,
      });
    } catch (err) {
      return next(err);
    }
  } else {
    const transaction_amount = req.query && req.query.transaction_amount || 15;
    res.render("transaction", {
      user: req.oidc && req.oidc.user,
      id_token: req.oidc && req.oidc.idToken,
      access_token: req.oidc && req.oidc.accessToken,
      refresh_token: req.oidc && req.oidc.refreshToken,
      transaction_amount
    });
  }
});

const submitTransaction = async (payload, req) => {
  let { token_type, access_token } = req.oidc.accessToken;
  logger.info(`Send request to API with token type: ${token_type}`);
  await axios.post(`${API_URL}/transaction`, payload, {
    headers: {
      Authorization: `${token_type} ${access_token}`,
    },
  });

  delete req.session.pendingTransaction;
};

app.post("/submit-transaction", requiresAuth(), async (req, res, next) => {
  const transaction_amount = Number(req.body.transaction_amount);
  const description = req.body.description
  try {
    if (responseTypesWithToken.includes(RESPONSE_TYPE)) {
      await submitTransaction({ transaction_amount }, req);
      res.render("transaction-complete", {
        user: req.oidc && req.oidc.user,
      });
    } else {
      next(createError(403, "Access token required to complete this operation. Please, use an OIDC flow that issues an access_token"));
    }
  } catch (err) {
    if (err.isAxiosError) {
      const statusCode = err.response.status;
      const code = err.response.data.code;
      if (statusCode === 403 && code === 'insufficient_authorization_details') {
        const transaction_id = err.response.data.transaction_id;
        const authorization_details = {
          type: 'payment_initiation',
          transaction_amount,
          transaction_currency: "USD",
          transaction_id,
          account: 'AB10458203746523457',
          description,
        };
        req.session.pendingTransaction = {
          transaction_amount,
          transaction_id,
          description,
        };
        res.oidc.login({
          returnTo: `/resume-transaction`,
          authorizationParams: {
            authorization_details: JSON.stringify(authorization_details),
            scope: SCOPE
          },
        });
        return;
      }
    }
    next(err);
  }
});


app.get("/balance", requiresAuth(), async (req, res, next) => {
    try {
      if (responseTypesWithToken.includes(RESPONSE_TYPE)) {
        let { token_type, access_token } = req.oidc.accessToken;
        logger.info(`Send request to API with token type: ${token_type}`);
        let balance = await axios.get(`${API_URL}/balance`, {
          headers: {
            Authorization: `${token_type} ${access_token}`,
          },
        });
        let transactionHistory = await axios.get(`${API_URL}/reports`, {
          headers: {
            Authorization: `${token_type} ${access_token}`,
          },
        });
        res.render("balance", {
          user: req.oidc && req.oidc.user,
          balance: balance.data.balance,
          purchases: transactionHistory.data,
        });
      } else {
        next(createError(403, "Access token required to complete this operation. Please, use an OIDC flow that issues an access_token"));
      }
    } catch (err) {
       next(err);
    }
});

// catch 404 and forward to error handler
app.use(function (req, res, next) {
  next(createError(404));
});

// error handler
app.use(function (err, req, res, next) {
  if (err.error === 'access_denied') {
    // Crude way of handling the unauthorized error from the authorization server.
    // We must redirect back to the /prepare-transaction page, but be sure to capture that the transaction was denied.
    res.redirect('/prepare-transaction?error=access_denied');
    return;
  }
  res.locals.message = err.message;
  res.locals.error = err;

  logger.error(`${err.message}`);

  // render the error page
  res.status(err.status || 500);
  res.render("error", {
    user: req.oidc && req.oidc.user,
  });
});

createServer(app).listen(PORT || APP_PORT, () => {
  logger.info(`WEB APP listening on port: ${APP_URL}`);
});
