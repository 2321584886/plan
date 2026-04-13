import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import db from './db/index.js';
import dictCategoriesRouter from './routes/dictCategories.js';
import accountsRouter from './routes/accounts.js';
import dailyRecordsRouter from './routes/dailyRecords.js';
import fundsRouter from './routes/funds.js';
import transactionTypesRouter from './routes/transactionTypes.js';
import usersRouter from './routes/users.js';
import paperGoldRouter, { startPaperGoldAutoSampler } from './routes/paperGold.js';

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

// Middleware: 通过请求头/查询参数切换当前用户，默认回退到 1
app.use((req, res, next) => {
  const rawUserId = req.headers['x-user-id'] ?? req.query.user_id;
  const parsedUserId = Number.parseInt(String(rawUserId || ''), 10);
  const candidateUserId = Number.isInteger(parsedUserId) && parsedUserId > 0 ? parsedUserId : 1;

  const exists = db.prepare('SELECT id FROM users WHERE id = ?').get(candidateUserId);
  req.userId = exists ? candidateUserId : 1;
  next();
});

// API Routes
app.use('/api/users', usersRouter);
app.use('/api/dict-categories', dictCategoriesRouter);
app.use('/api/accounts', accountsRouter);
app.use('/api/daily-records', dailyRecordsRouter);
app.use('/api/funds', fundsRouter);
app.use('/api/transaction-types', transactionTypesRouter);
app.use('/api/funds/paper-gold', paperGoldRouter);

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  startPaperGoldAutoSampler();
});