const express = require('express');
const cors = require('cors');

const app = express();

app.use(cors({ origin: true }));
app.use(express.json());

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'manualtex-backend',
    timestamp: new Date().toISOString()
  });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Backend corriendo en puerto ${PORT}`);
});
