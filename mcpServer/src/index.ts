import express from 'express';

const app = express();
const port = process.env.PORT ? Number(process.env.PORT) : 3000;

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.get('/', (req, res) => {
  res.send('MCP Server running');
});

app.listen(port, () => {
  console.log(`MCP Server listening on http://localhost:${port}`);
});
