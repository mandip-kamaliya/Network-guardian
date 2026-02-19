const express = require('express');
const cors = require('cors');
const app = express();

// Enable CORS for our dashboard
app.use(cors());
app.use(express.json());

// Mock Cortensor API endpoints
app.get('/api/v1/status', (req, res) => {
  res.json({
    status: 'healthy',
    uptime: Math.floor(Math.random() * 86400), // Random uptime in seconds
    connected_nodes: Math.floor(Math.random() * 10) + 3, // 3-12 nodes
    active_sessions: Math.floor(Math.random() * 5) + 1, // 1-5 sessions
    version: '0.0.1-demo',
    timestamp: new Date().toISOString()
  });
});

app.get('/api/v1/miners', (req, res) => {
  const miners = [];
  const numMiners = Math.floor(Math.random() * 8) + 5; // 5-12 miners
  
  for (let i = 0; i < numMiners; i++) {
    miners.push({
      id: `miner-${i + 1}`,
      status: Math.random() > 0.2 ? 'active' : 'inactive',
      model: ['llama-2-7b', 'mistral-7b', 'phi-2-7b'][Math.floor(Math.random() * 3)],
      uptime: Math.floor(Math.random() * 100), // 0-100% uptime
      inference_count: Math.floor(Math.random() * 1000) + 100,
      last_seen: new Date(Date.now() - Math.random() * 300000).toISOString()
    });
  }
  
  res.json({ miners });
});

app.get('/api/v1/info', (req, res) => {
  res.json({
    total_requests: Math.floor(Math.random() * 10000) + 5000,
    success_rate: 0.85 + Math.random() * 0.14, // 85-99%
    avg_response_time: Math.floor(Math.random() * 200) + 50, // 50-250ms
    congestion_level: ['low', 'medium', 'high'][Math.floor(Math.random() * 3)],
    version: 'demo-v1.0',
    uptime: Math.floor(Math.random() * 86400),
    network_id: 'testnet-demo'
  });
});

app.get('/api/v1/sessions', (req, res) => {
  res.json({
    sessions: [
      {
        id: 0,
        status: 'active',
        created_at: new Date().toISOString(),
        model: 'demo-model'
      }
    ]
  });
});

// Mock inference endpoint
app.post('/api/v1/completions/0', (req, res) => {
  const { prompt } = req.body;
  
  // Simple mock analysis based on prompt content
  const hasAnomaly = prompt.includes('anomaly') || prompt.includes('critical') || Math.random() > 0.7;
  const severity = hasAnomaly ? 
    ['low', 'medium', 'high', 'critical'][Math.floor(Math.random() * 4)] : 'low';
  
  const mockResponse = {
    content: JSON.stringify({
      anomalyDetected: hasAnomaly,
      severity,
      confidence: hasAnomaly ? 0.85 + Math.random() * 0.14 : 0.95,
      affectedComponents: hasAnomaly ? ['router', 'validators'] : [],
      recommendations: hasAnomaly ? [
        'Investigate network latency',
        'Check validator health',
        'Monitor miner performance'
      ] : ['Continue normal monitoring'],
      analysis: hasAnomaly ? 
        'Potential network issues detected requiring immediate attention' : 
        'Network operating within normal parameters'
    }),
    inference_time: Math.floor(Math.random() * 1000) + 500, // 500-1500ms
    model: 'demo-analysis-model',
    timestamp: new Date().toISOString()
  };
  
  res.json(mockResponse);
});

const PORT = 5010;
app.listen(PORT, () => {
  console.log(`🚀 Mock Cortensor Server running on port ${PORT}`);
  console.log(`📊 API endpoints available:`);
  console.log(`   GET  http://localhost:${PORT}/api/v1/status`);
  console.log(`   GET  http://localhost:${PORT}/api/v1/miners`);
  console.log(`   GET  http://localhost:${PORT}/api/v1/info`);
  console.log(`   POST http://localhost:${PORT}/api/v1/completions/0`);
  console.log(`\n🎯 Network Guardian AI can now connect to real data!`);
});
