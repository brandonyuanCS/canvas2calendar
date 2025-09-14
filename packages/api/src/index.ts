import cors from 'cors';
import { config } from 'dotenv';
import express, { json } from 'express';

config();
const app = express();
const PORT = process.env.PORT || '3001';

app.use(cors());
app.use(json());

// dummy endpoint
app.get('/helloworld', (req, res) => {
  res.json({ status: 'hello world! API is running' });
});

app.listen(PORT, () => {
  console.log('server is running on port', PORT);
});
