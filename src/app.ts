import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { auth } from 'express-openid-connect';
import { config } from './config';
import { logger, pinoHttp } from './logger';
import authRoutes from './routes/auth';
import usersRoutes from './routes/users';
import roomsRoutes from './routes/rooms';
import { errorHandler } from './middleware/error.middleware';


export const app = express();


app.use(helmet());
app.use(cors({ origin: config.appUrl, credentials: true }));
app.use(express.json({ limit: '5mb' }));
app.use(pinoHttp({ logger }));


// Auth0 middleware (sessionless / stateless example using cookies)
app.use(
auth({
authRequired: false,
auth0Logout: true,
issuerBaseURL: config.auth0.issuerBaseUrl,
baseURL: config.auth0.baseUrl,
clientID: config.auth0.clientId,
secret: config.jwtSecret,
clientSecret: config.auth0.clientSecret,
})
);


// routes
app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/rooms', roomsRoutes);


// health
app.get('/health', (req, res) => res.json({ ok: true }));


// error handler
app.use(errorHandler);