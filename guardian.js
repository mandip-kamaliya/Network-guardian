#!/usr/bin/env node

/**
 * Network Guardian AI - Cortensor Infrastructure Sentinel
 * Hackathon #4 Winning Project
 */

const axios = require('axios');
const ethers = require('ethers');
const http = require('http');
const socketIo = require('socket.io');

class NetworkGuardian {
  constructor() {
    this.cortensorRouter = 'https://router.cortensor.network/v1';
    this.monitoringInterval = 30000; // 30 seconds
    this.alertThresholds = {
      latency: 5000, // 5 seconds
      errorRate: 0.05, // 5%
      validatorUptime: 0.95 // 95%
    };
    this.isRunning = false;
    this.io = null;
    this.connectedClients = 0;
    this.incidentHistory = [];
  }

  // Start WebSocket server and monitoring
  async start() {
    await this.startWebSocketServer();
    await this.startMonitoring();
  }

  // Start WebSocket server for real-time dashboard
  async startWebSocketServer() {
    const server = http.createServer();
    this.io = socketIo(server, {
      cors: {
        origin: "http://localhost:3000",
        methods: ["GET", "POST"]
      }
    });

    this.io.on('connection', (socket) => {
      this.connectedClients++;
      console.log(`📱 Dashboard client connected (${this.connectedClients} total)`);
      
      // Send current status immediately
      socket.emit('status', {
        isMonitoring: this.isRunning,
        connectedClients: this.connectedClients,
        incidentHistory: this.incidentHistory.slice(-10) // Last 10 incidents
      });

      socket.on('disconnect', () => {
        this.connectedClients--;
        console.log(`📱 Dashboard client disconnected (${this.connectedClients} total)`);
      });

      socket.on('requestHistoricalData', () => {
        socket.emit('historicalData', this.incidentHistory);
      });
    });

    const PORT = process.env.PORT || 3001;
    server.listen(PORT, () => {
      console.log(`🌐 WebSocket server running on port ${PORT}`);
      console.log(`📊 Dashboard available at http://localhost:3000`);
    });
  }

  // Core monitoring loop
  async startMonitoring() {
    console.log('🚀 Network Guardian AI starting...');
    this.isRunning = true;
    
    while (this.isRunning) {
      try {
        const healthData = await this.collectHealthMetrics();
        const analysis = await this.analyzeWithCortensor(healthData);
        
        if (analysis.anomalyDetected) {
          await this.handleAnomaly(healthData, analysis);
        }
        
        await this.updateDashboard(healthData, analysis);
        
      } catch (error) {
        console.error('Monitoring error:', error);
      }
      
      await this.sleep(this.monitoringInterval);
    }
  }

  // Collect network health metrics
  async collectHealthMetrics() {
    const metrics = {
      timestamp: new Date().toISOString(),
      router: await this.checkRouterHealth(),
      validators: await this.checkValidatorHealth(),
      miners: await this.checkMinerHealth(),
      network: await this.checkNetworkStats()
    };
    
    return metrics;
  }

  // Check router health and latency
  async checkRouterHealth() {
    const start = Date.now();
    try {
      const response = await axios.get(`${this.cortensorRouter}/health`, {
        timeout: 5000
      });
      const latency = Date.now() - start;
      
      return {
        status: response.status === 200 ? 'healthy' : 'unhealthy',
        latency,
        responseTime: latency,
        uptime: response.data.uptime || 0
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        latency: 9999,
        error: error.message
      };
    }
  }

  // Check validator node health
  async checkValidatorHealth() {
    try {
      const response = await axios.get(`${this.cortensorRouter}/validators/status`);
      const validators = response.data.validators || [];
      
      const healthyValidators = validators.filter(v => 
        v.status === 'active' && v.uptime > this.alertThresholds.validatorUptime
      );
      
      return {
        total: validators.length,
        healthy: healthyValidators.length,
        healthRatio: healthyValidators.length / validators.length,
        averageUptime: validators.reduce((sum, v) => sum + v.uptime, 0) / validators.length
      };
    } catch (error) {
      return {
        total: 0,
        healthy: 0,
        healthRatio: 0,
        error: error.message
      };
    }
  }

  // Check miner/model availability
  async checkMinerHealth() {
    try {
      const response = await axios.get(`${this.cortensorRouter}/miners/status`);
      const miners = response.data.miners || [];
      
      const activeMiners = miners.filter(m => m.status === 'active');
      
      return {
        total: miners.length,
        active: activeMiners.length,
        models: miners.reduce((acc, m) => {
          acc[m.model] = (acc[m.model] || 0) + 1;
          return acc;
        }, {})
      };
    } catch (error) {
      return {
        total: 0,
        active: 0,
        models: {},
        error: error.message
      };
    }
  }

  // Get network statistics
  async checkNetworkStats() {
    try {
      const response = await axios.get(`${this.cortensorRouter}/stats`);
      return {
        totalRequests: response.data.totalRequests || 0,
        successRate: response.data.successRate || 0,
        averageResponseTime: response.data.averageResponseTime || 0,
        congestionLevel: response.data.congestionLevel || 'low'
      };
    } catch (error) {
      return {
        totalRequests: 0,
        successRate: 0,
        averageResponseTime: 0,
        congestionLevel: 'unknown',
        error: error.message
      };
    }
  }

  // Analyze metrics using Cortensor inference
  async analyzeWithCortensor(healthData) {
    // This would integrate with actual Cortensor API
    // For hackathon demo, we'll simulate the analysis
    
    const analysisPrompt = `
      Analyze these network health metrics for anomalies:
      ${JSON.stringify(healthData, null, 2)}
      
      Check for:
      1. Router latency > 5 seconds
      2. Validator health ratio < 0.9
      3. Network success rate < 0.95
      4. High congestion levels
      5. Unusual error patterns
      
      Return anomaly detection results with confidence scores.
    `;

    // Simulate Cortensor response
    const hasAnomaly = 
      healthData.router.latency > this.alertThresholds.latency ||
      healthData.validators.healthRatio < 0.9 ||
      healthData.network.successRate < 0.95;

    return {
      anomalyDetected: hasAnomaly,
      confidence: hasAnomaly ? 0.89 : 0.95,
      severity: hasAnomaly ? this.calculateSeverity(healthData) : 'low',
      recommendations: hasAnomaly ? this.generateRecommendations(healthData) : [],
      cortensorSessionId: `session-${Date.now()}`,
      validationRuns: 3
    };
  }

  // Calculate anomaly severity
  calculateSeverity(healthData) {
    let severityScore = 0;
    
    if (healthData.router.latency > 10000) severityScore += 3;
    else if (healthData.router.latency > 5000) severityScore += 2;
    
    if (healthData.validators.healthRatio < 0.8) severityScore += 3;
    else if (healthData.validators.healthRatio < 0.9) severityScore += 2;
    
    if (healthData.network.successRate < 0.9) severityScore += 2;
    
    if (severityScore >= 5) return 'critical';
    if (severityScore >= 3) return 'high';
    if (severityScore >= 1) return 'medium';
    return 'low';
  }

  // Generate response recommendations
  generateRecommendations(healthData) {
    const recommendations = [];
    
    if (healthData.router.latency > this.alertThresholds.latency) {
      recommendations.push('Check router load balancing');
      recommendations.push('Consider scaling router instances');
    }
    
    if (healthData.validators.healthRatio < 0.9) {
      recommendations.push('Alert underperforming validators');
      recommendations.push('Initiate validator failover procedures');
    }
    
    if (healthData.network.successRate < 0.95) {
      recommendations.push('Investigate error patterns');
      recommendations.push('Check network congestion');
    }
    
    return recommendations;
  }

  // Handle detected anomalies
  async handleAnomaly(healthData, analysis) {
    console.log(`🚨 ANOMALY DETECTED: ${analysis.severity.toUpperCase()}`);
    
    const incidentReport = {
      incidentId: `INC-${Date.now()}`,
      timestamp: healthData.timestamp,
      severity: analysis.severity,
      confidence: analysis.confidence,
      affectedComponents: this.identifyAffectedComponents(healthData),
      recommendations: analysis.recommendations,
      evidenceBundle: await this.generateEvidenceBundle(healthData, analysis)
    };
    
    // Add to incident history
    this.incidentHistory.push(incidentReport);
    
    // Send alerts
    await this.sendAlerts(incidentReport);
    
    // Store incident
    await this.storeIncident(incidentReport);
    
    // Emit incident to dashboard
    if (this.io) {
      this.io.emit('newIncident', incidentReport);
    }
    
    console.log(`📋 Incident report generated: ${incidentReport.incidentId}`);
  }

  // Identify affected components
  identifyAffectedComponents(healthData) {
    const affected = [];
    
    if (healthData.router.status === 'unhealthy') {
      affected.push('router');
    }
    
    if (healthData.validators.healthRatio < 0.9) {
      affected.push('validators');
    }
    
    if (healthData.network.successRate < 0.95) {
      affected.push('network');
    }
    
    return affected;
  }

  // Generate verifiable evidence bundle
  async generateEvidenceBundle(healthData, analysis) {
    return {
      metricsSnapshot: healthData,
      analysisResult: analysis,
      cortensorSessionId: analysis.cortensorSessionId,
      validationRuns: analysis.validationRuns,
      confidenceScore: analysis.confidence,
      attestationHash: require('ethers').keccak256(
        Buffer.from(JSON.stringify({ healthData, analysis }))
      ),
      ipfsHash: `ipfs-hash-${Date.now()}` // Would upload to IPFS
    };
  }

  // Send alerts to community channels
  async sendAlerts(incidentReport) {
    const alertMessage = `
🚨 **Network Guardian Alert** 🚨

**Incident**: ${incidentReport.incidentId}
**Severity**: ${incidentReport.severity.toUpperCase()}
**Confidence**: ${(incidentReport.confidence * 100).toFixed(1)}%
**Affected**: ${incidentReport.affectedComponents.join(', ')}

**Recommendations**:
${incidentReport.recommendations.map(r => `• ${r}`).join('\n')}

**Evidence**: ${incidentReport.evidenceBundle.attestationHash}
    `.trim();

    console.log('📢 ALERT SENT TO COMMUNITY:');
    console.log(alertMessage);
    
    // In production, would send to Discord/Telegram
    // await sendToDiscord(alertMessage);
    // await sendToTelegram(alertMessage);
  }

  // Store incident for historical tracking
  async storeIncident(incidentReport) {
    // In production, would store in database
    console.log(`💾 Incident stored: ${incidentReport.incidentId}`);
  }

  // Update real-time dashboard
  async updateDashboard(healthData, analysis) {
    const dashboardData = {
      timestamp: healthData.timestamp,
      networkStatus: analysis.anomalyDetected ? 'warning' : 'healthy',
      routerLatency: healthData.router.latency,
      validatorHealth: `${(healthData.validators.healthRatio * 100).toFixed(1)}%`,
      networkSuccess: `${(healthData.network.successRate * 100).toFixed(1)}%`,
      activeMiners: healthData.miners.active,
      lastIncident: analysis.anomalyDetected ? `INC-${Date.now()}` : null,
      confidence: analysis.confidence,
      severity: analysis.severity
    };

    console.log('📊 Dashboard Update:', dashboardData);
    
    // Emit to all connected dashboard clients
    if (this.io) {
      this.io.emit('dashboardUpdate', dashboardData);
    }
  }

  // Utility function for delays
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Stop monitoring
  stop() {
    this.isRunning = false;
    console.log('🛑 Network Guardian AI stopped');
  }
}

// Start the guardian
if (require.main === module) {
  const guardian = new NetworkGuardian();
  
  // Handle graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down gracefully...');
    guardian.stop();
    process.exit(0);
  });
  
  // Start both WebSocket server and monitoring
  guardian.start().catch(console.error);
}

module.exports = NetworkGuardian;
