const path = require('path');
const express = require('express');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const mongoSanitize = require('express-mongo-sanitize');
const hpp = require('hpp');
const env = require('./config/env');
const api = require('./routes');
const { pages, notFoundPage, clientDir } = require('./routes/pages');
const { errorHandler } = require('./middleware/errorHandler');
const sanitizeInput = require('./middleware/sanitize');
const maintenanceGate = require('./middleware/maintenance');

const app = express();

app.disable('x-powered-by');
app.set('trust proxy', 1);

app.use(helmet({
  crossOriginEmbedderPolicy: false,
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", 'https://js.paystack.co'],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:', 'https://images.unsplash.com', 'https://res.cloudinary.com'],
      connectSrc: ["'self'", 'https://api.paystack.co'],
      frameSrc: ["'self'", 'https://checkout.paystack.com', 'https://js.paystack.co'],
      formAction: ["'self'"],
    },
  },
}));
app.use(compression());
app.use(cors({ origin: env.clientUrl, credentials: true }));
app.use(cookieParser());
app.use(express.json({
  limit: '1mb',
  verify: (req, _res, buffer) => {
    req.rawBody = buffer;
  },
}));
app.use(express.urlencoded({ extended: false }));
app.use(mongoSanitize());
app.use(hpp());
app.use(sanitizeInput);

if (env.nodeEnv !== 'test') {
  app.use(morgan(env.isProduction ? 'combined' : 'dev'));
}

app.use(maintenanceGate);
app.use('/api', api);
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));
app.use(pages);
app.use(express.static(clientDir, { extensions: ['html'] }));
app.use('/favicon.ico', (_req, res) => {
  res.sendFile(path.join(clientDir, 'favicon.svg'));
});
app.use(notFoundPage);
app.use(errorHandler);

module.exports = app;
