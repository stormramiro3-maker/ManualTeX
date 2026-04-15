const express = require('express');
const cors = require('cors');

const app = express();

app.use(cors({
  origin: process.env.FRONTEND_URL || '*'
}));

app.use(express.json());

// 🔥 health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'manualtex-backend',
    timestamp: new Date().toISOString()
  });
});

// puerto
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Backend corriendo en puerto ${PORT}`);
});
