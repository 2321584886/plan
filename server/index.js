import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import dictCategoriesRouter from './routes/dictCategories.js';
import accountsRouter from './routes/accounts.js';
import dailyRecordsRouter from './routes/dailyRecords.js';
import fundsRouter from './routes/funds.js';
import transactionTypesRouter from './routes/transactionTypes.js';

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

// Middlewares for faking user auth (hardcoded user_id = 1)
app.use((req, res, next) => {
  req.userId = 1;
  next();
});

// API Routes
app.use('/api/dict-categories', dictCategoriesRouter);
app.use('/api/accounts', accountsRouter);
app.use('/api/daily-records', dailyRecordsRouter);
app.use('/api/funds', fundsRouter);
app.use('/api/transaction-types', transactionTypesRouter);

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});