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
    this.cortensorRouter = process.env.CORTENSOR_ROUTER || 'http://localhost:5010';
    this.apiKey = process.env.CORTENSOR_API_KEY || 'default-dev-token';
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
    this.currentSession = null;
    this.validatorScores = new Map(); // Store PoUW scores
    this.workMetrics = {
      totalInferences: 0,
      usefulInferences: 0,
      networkContributions: 0,
      validationWork: 0
    };
    this.alertChannels = {
      discord: {
        enabled: process.env.DISCORD_ENABLED === 'true',
        webhookUrl: process.env.DISCORD_WEBHOOK_URL,
        channelId: process.env.DISCORD_CHANNEL_ID
      },
      telegram: {
        enabled: process.env.TELEGRAM_ENABLED === 'true',
        botToken: process.env.TELEGRAM_BOT_TOKEN,
        chatId: process.env.TELEGRAM_CHAT_ID
      }
    };
  }

  // Start WebSocket server and monitoring
  async start() {
    await this.initializeSession();
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

  // Initialize Cortensor session
  async initializeSession() {
    try {
      const response = await axios.get(`${this.cortensorRouter}/api/v1/sessions`, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`
        }
      });
      
      // Use existing session or create new one
      if (response.data.sessions && response.data.sessions.length > 0) {
        this.currentSession = response.data.sessions[0].id;
        console.log(`📱 Using existing session: ${this.currentSession}`);
      } else {
        // For demo, we'll use session 0 (common in test environments)
        this.currentSession = 0;
        console.log(`📱 Using default session: ${this.currentSession}`);
      }
      
      return this.currentSession;
    } catch (error) {
      console.log('⚠️ Could not initialize session, using default:', error.message);
      this.currentSession = 0;
      return this.currentSession;
    }
  }

  // Collect network health metrics from real Cortensor API
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

  // Check router health and latency using real Cortensor API
  async checkRouterHealth() {
    const startTime = Date.now();
    try {
      const response = await axios.get(`${this.cortensorRouter}/api/v1/status`, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`
        },
        timeout: 5000
      });
      const latency = Date.now() - startTime;
      
      return {
        status: response.status === 200 ? 'healthy' : 'unhealthy',
        latency,
        responseTime: latency,
        uptime: response.data.uptime || 0,
        connectedNodes: response.data.connected_nodes || 0,
        activeSessions: response.data.active_sessions || 0
      };
    } catch (error) {
      const latency = Date.now() - startTime;
      return {
        status: 'unhealthy',
        latency,
        error: error.message,
        connectedNodes: 0,
        activeSessions: 0
      };
    }
  }

  // Check miner/validator health using real Cortensor API
  async checkMinerHealth() {
    try {
      const response = await axios.get(`${this.cortensorRouter}/api/v1/miners`, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`
        }
      });
      const miners = response.data.miners || [];
      
      const activeMiners = miners.filter(m => m.status === 'active');
      
      return {
        total: miners.length,
        active: activeMiners.length,
        healthRatio: miners.length > 0 ? activeMiners.length / miners.length : 0,
        models: miners.reduce((acc, m) => {
          acc[m.model] = (acc[m.model] || 0) + 1;
          return acc;
        }, {}),
        details: miners.map(m => ({
          id: m.id,
          status: m.status,
          model: m.model,
          uptime: m.uptime || 0
        }))
      };
    } catch (error) {
      return {
        total: 0,
        active: 0,
        healthRatio: 0,
        models: {},
        error: error.message
      };
    }
  }

  // Check validator health (derived from miners data)
  async checkValidatorHealth() {
    try {
      const miners = await this.checkMinerHealth();
      
      // Treat active miners as validators for this demo
      const totalValidators = miners.total;
      const healthyValidators = miners.active;
      const healthRatio = totalValidators > 0 ? healthyValidators / totalValidators : 0;
      
      return {
        total: totalValidators,
        healthy: healthyValidators,
        healthRatio,
        averageUptime: miners.details?.reduce((sum, m) => sum + (m.uptime || 0), 0) / totalValidators || 0,
        status: healthRatio >= this.alertThresholds.validatorUptime ? 'healthy' : 'warning'
      };
    } catch (error) {
      return {
        total: 0,
        healthy: 0,
        healthRatio: 0,
        averageUptime: 0,
        error: error.message
      };
    }
  }

  // Get network statistics using real Cortensor API
  async checkNetworkStats() {
    try {
      const response = await axios.get(`${this.cortensorRouter}/api/v1/info`, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`
        }
      });
      
      return {
        totalRequests: response.data.total_requests || 0,
        successRate: response.data.success_rate || 0.95,
        averageResponseTime: response.data.avg_response_time || 100,
        congestionLevel: response.data.congestion_level || 'low',
        networkVersion: response.data.version || 'unknown',
        uptime: response.data.uptime || 0
      };
    } catch (error) {
      return {
        totalRequests: 0,
        successRate: 0.95, // Default assumption
        averageResponseTime: 100,
        congestionLevel: 'unknown',
        error: error.message
      };
    }
  }

  // Analyze metrics using real Cortensor inference with PoI
  async analyzeWithCortensor(healthData) {
    if (!this.currentSession) {
      await this.initializeSession();
    }

    const analysisPrompt = `
      Analyze these Cortensor network health metrics for anomalies and security issues:
      
      ROUTER STATUS:
      - Status: ${healthData.router.status}
      - Latency: ${healthData.router.latency}ms
      - Connected Nodes: ${healthData.router.connectedNodes || 0}
      - Active Sessions: ${healthData.router.activeSessions || 0}
      
      VALIDATOR HEALTH:
      - Total Validators: ${healthData.validators.total}
      - Healthy: ${healthData.validators.healthy}
      - Health Ratio: ${(healthData.validators.healthRatio * 100).toFixed(1)}%
      
      MINER/INFERENCE NODES:
      - Total Miners: ${healthData.miners.total}
      - Active: ${healthData.miners.active}
      - Health Ratio: ${(healthData.miners.healthRatio * 100).toFixed(1)}%
      
      NETWORK PERFORMANCE:
      - Success Rate: ${(healthData.network.successRate * 100).toFixed(1)}%
      - Avg Response Time: ${healthData.network.averageResponseTime}ms
      - Congestion: ${healthData.network.congestionLevel}
      
      TASK:
      1. Identify any anomalies or performance issues
      2. Assess severity (low/medium/high/critical)
      3. Provide confidence score (0-1)
      4. List affected components
      5. Recommend specific actions
      
      Respond with JSON format:
      {
        "anomalyDetected": true/false,
        "severity": "low|medium|high|critical",
        "confidence": 0.0-1.0,
        "affectedComponents": ["router", "validators", "miners", "network"],
        "recommendations": ["action1", "action2"],
        "analysis": "brief explanation"
      }
    `;

    try {
      // Implement PoI - run inference multiple times for redundancy
      const validationRuns = 3; // k-redundant inference
      const inferenceResults = [];
      
      for (let i = 0; i < validationRuns; i++) {
        try {
          const response = await axios.post(`${this.cortensorRouter}/api/v1/completions/${this.currentSession}`, {
            prompt: analysisPrompt,
            stream: false,
            timeout: 30
          }, {
            headers: {
              'Authorization': `Bearer ${this.apiKey}`,
              'Content-Type': 'application/json'
            }
          });

          const result = {
            runId: i + 1,
            content: response.data.content || response.data.choices?.[0]?.message?.content || '{}',
            inferenceTime: response.data.inference_time || 0,
            model: response.data.model || 'unknown',
            timestamp: new Date().toISOString()
          };
          
          inferenceResults.push(result);
          console.log(`🔍 PoI Run ${i + 1}/${validationRuns} completed`);
          
          // Small delay between runs to avoid overwhelming the network
          if (i < validationRuns - 1) {
            await this.sleep(1000);
          }
          
        } catch (error) {
          console.log(`⚠️ PoI Run ${i + 1} failed:`, error.message);
          inferenceResults.push({
            runId: i + 1,
            error: error.message,
            timestamp: new Date().toISOString()
          });
        }
      }

      // Consensus mechanism - analyze multiple results
      const consensusResult = await this.analyzeConsensus(inferenceResults, healthData);
      
      return {
        ...consensusResult,
        cortensorSessionId: this.currentSession,
        validationRuns: inferenceResults.length,
        poiConsensus: {
          totalRuns: validationRuns,
          successfulRuns: inferenceResults.filter(r => !r.error).length,
          consensusScore: consensusResult.consensusScore,
          disagreementAnalysis: consensusResult.disagreementAnalysis
        },
        pouwScore: await this.calculatePoUWScore('guardian-agent', 'inference', consensusResult),
        inferenceResults: inferenceResults.map(r => ({
          runId: r.runId,
          success: !r.error,
          model: r.model,
          inferenceTime: r.inferenceTime
        }))
      };

    } catch (error) {
      console.log('⚠️ PoI analysis failed, using fallback:', error.message);
      return this.fallbackAnalysis(healthData);
    }
  }

  // Analyze consensus across multiple inference runs (PoI)
  async analyzeConsensus(inferenceResults, healthData) {
    const successfulRuns = inferenceResults.filter(r => !r.error);
    
    if (successfulRuns.length === 0) {
      return this.fallbackAnalysis(healthData);
    }

    if (successfulRuns.length === 1) {
      // Only one successful run, use it directly
      try {
        return JSON.parse(successfulRuns[0].content);
      } catch (e) {
        return this.fallbackAnalysis(healthData);
      }
    }

    // Multiple successful runs - perform consensus analysis
    const parsedResults = [];
    for (const run of successfulRuns) {
      try {
        parsedResults.push(JSON.parse(run.content));
      } catch (e) {
        console.log('⚠️ Failed to parse inference result:', e.message);
      }
    }

    if (parsedResults.length === 0) {
      return this.fallbackAnalysis(healthData);
    }

    // Calculate consensus scores
    const consensusAnalysis = {
      anomalyDetected: this.calculateConsensus(parsedResults, 'anomalyDetected'),
      severity: this.calculateConsensus(parsedResults, 'severity'),
      averageConfidence: parsedResults.reduce((sum, r) => sum + (r.confidence || 0), 0) / parsedResults.length,
      affectedComponents: this.calculateComponentConsensus(parsedResults),
      recommendations: this.calculateRecommendationConsensus(parsedResults)
    };

    // Calculate consensus score (0-1, higher is better)
    const consensusScore = this.calculateConsensusScore(parsedResults);
    
    return {
      ...consensusAnalysis,
      consensusScore,
      disagreementAnalysis: this.analyzeDisagreements(parsedResults)
    };
  }

  // Calculate consensus for boolean/enum values
  calculateConsensus(results, field) {
    const values = results.map(r => r[field]);
    const frequency = {};
    
    for (const value of values) {
      const key = String(value);
      frequency[key] = (frequency[key] || 0) + 1;
    }
    
    // Find the most common value
    let maxCount = 0;
    let consensusValue = values[0];
    
    for (const [key, count] of Object.entries(frequency)) {
      if (count > maxCount) {
        maxCount = count;
        consensusValue = key === 'true' ? true : key === 'false' ? false : key;
      }
    }
    
    return consensusValue;
  }

  // Calculate consensus for affected components
  calculateComponentConsensus(results) {
    const componentFrequency = {};
    
    for (const result of results) {
      const components = result.affectedComponents || [];
      for (const component of components) {
        componentFrequency[component] = (componentFrequency[component] || 0) + 1;
      }
    }
    
    // Return components that appear in majority of results
    const threshold = Math.ceil(results.length / 2);
    return Object.keys(componentFrequency)
      .filter(component => componentFrequency[component] >= threshold)
      .sort();
  }

  // Calculate consensus for recommendations
  calculateRecommendationConsensus(results) {
    const recommendationFrequency = {};
    
    for (const result of results) {
      const recommendations = result.recommendations || [];
      for (const rec of recommendations) {
        recommendationFrequency[rec] = (recommendationFrequency[rec] || 0) + 1;
      }
    }
    
    // Return top recommendations by frequency
    return Object.entries(recommendationFrequency)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5)
      .map(([rec]) => rec);
  }

  // Calculate overall consensus score
  calculateConsensusScore(results) {
    if (results.length <= 1) return 1.0;
    
    let totalAgreement = 0;
    let comparisons = 0;
    
    for (let i = 0; i < results.length; i++) {
      for (let j = i + 1; j < results.length; j++) {
        comparisons++;
        const agreement = this.calculateResultAgreement(results[i], results[j]);
        totalAgreement += agreement;
      }
    }
    
    return totalAgreement / comparisons;
  }

  // Calculate agreement between two results
  calculateResultAgreement(result1, result2) {
    let agreement = 0;
    let factors = 0;
    
    // Anomaly detection agreement
    factors++;
    if (result1.anomalyDetected === result2.anomalyDetected) agreement++;
    
    // Severity agreement (allowing one level difference)
    factors++;
    const severityLevels = ['low', 'medium', 'high', 'critical'];
    const diff = Math.abs(
      severityLevels.indexOf(result1.severity) - 
      severityLevels.indexOf(result2.severity)
    );
    if (diff <= 1) agreement++;
    
    // Confidence similarity (within 0.2)
    factors++;
    if (Math.abs((result1.confidence || 0) - (result2.confidence || 0)) <= 0.2) agreement++;
    
    return agreement / factors;
  }

  // Analyze disagreements between results
  analyzeDisagreements(results) {
    if (results.length <= 1) return { hasDisagreements: false };
    
    const anomalies = results.map(r => r.anomalyDetected);
    const severities = results.map(r => r.severity);
    const confidences = results.map(r => r.confidence || 0);
    
    return {
      hasDisagreements: new Set(anomalies).size > 1 || new Set(severities).size > 1,
      anomalyDisagreement: new Set(anomalies).size > 1,
      severityRange: {
        min: Math.min(...severities.map(s => ['low', 'medium', 'high', 'critical'].indexOf(s))),
        max: Math.max(...severities.map(s => ['low', 'medium', 'high', 'critical'].indexOf(s)))
      },
      confidenceVariance: this.calculateVariance(confidences),
      consensusStrength: this.calculateConsensusScore(results)
    };
  }

  // Calculate variance for confidence scores
  calculateVariance(values) {
    if (values.length === 0) return 0;
    
    const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
    const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
    return variance;
  }

  // PoUW (Proof of Useful Work) scoring system
  async calculatePoUWScore(validatorId, workType, workResult) {
    const currentScore = this.validatorScores.get(validatorId) || {
      baseScore: 100,
      workMultiplier: 1.0,
      reliabilityScore: 1.0,
      contributionScore: 0,
      lastUpdated: new Date().toISOString()
    };

    // Calculate work contribution based on type
    let contributionValue = 0;
    this.workMetrics.totalInferences++;

    switch (workType) {
      case 'inference':
        contributionValue = this.calculateInferenceWork(workResult);
        this.workMetrics.usefulInferences++;
        break;
      case 'validation':
        contributionValue = this.calculateValidationWork(workResult);
        this.workMetrics.validationWork++;
        break;
      case 'monitoring':
        contributionValue = this.calculateMonitoringWork(workResult);
        this.workMetrics.networkContributions++;
        break;
      case 'incident_response':
        contributionValue = this.calculateIncidentResponseWork(workResult);
        break;
      default:
        contributionValue = 1; // Base contribution
    }

    // Update scores
    currentScore.contributionScore += contributionValue;
    currentScore.workMultiplier = Math.min(2.0, 1.0 + (currentScore.contributionScore / 1000));
    currentScore.reliabilityScore = this.calculateReliabilityScore(validatorId, workResult);
    currentScore.lastUpdated = new Date().toISOString();

    // Calculate final PoUW score
    const finalScore = Math.round(
      currentScore.baseScore * 
      currentScore.workMultiplier * 
      currentScore.reliabilityScore + 
      currentScore.contributionScore
    );

    this.validatorScores.set(validatorId, { ...currentScore, finalScore });
    
    return {
      validatorId,
      workType,
      contributionValue,
      finalScore,
      workMultiplier: currentScore.workMultiplier,
      reliabilityScore: currentScore.reliabilityScore
    };
  }

  // Calculate inference work value
  calculateInferenceWork(workResult) {
    let baseValue = 10;
    
    // Quality factors
    if (workResult.consensusScore > 0.8) baseValue *= 1.5;
    if (workResult.confidence > 0.9) baseValue *= 1.2;
    if (workResult.inferenceTime < 2000) baseValue *= 1.1; // Fast inference
    
    // Complexity bonus
    if (workResult.severity === 'critical') baseValue *= 2.0;
    if (workResult.anomalyDetected) baseValue *= 1.3;
    
    return Math.round(baseValue);
  }

  // Calculate validation work value
  calculateValidationWork(workResult) {
    let baseValue = 15;
    
    // Validation quality
    if (workResult.validationRuns > 1) baseValue *= (1 + workResult.validationRuns * 0.2);
    if (workResult.poiConsensus?.successfulRuns === workResult.poiConsensus?.totalRuns) {
      baseValue *= 1.5;
    }
    
    return Math.round(baseValue);
  }

  // Calculate monitoring work value
  calculateMonitoringWork(workResult) {
    let baseValue = 5;
    
    // Monitoring effectiveness
    if (workResult.anomalyDetected) baseValue *= 2.0;
    if (workResult.responseTime < 1000) baseValue *= 1.2;
    
    return Math.round(baseValue);
  }

  // Calculate incident response work value
  calculateIncidentResponseWork(workResult) {
    let baseValue = 25;
    
    // Response effectiveness
    if (workResult.severity === 'critical') baseValue *= 2.0;
    if (workResult.recommendations?.length > 2) baseValue *= 1.3;
    if (workResult.confidence > 0.85) baseValue *= 1.2;
    
    return Math.round(baseValue);
  }

  // Calculate reliability score for validators
  calculateReliabilityScore(validatorId, workResult) {
    const history = this.getValidatorHistory(validatorId);
    if (history.length === 0) return 1.0;

    // Calculate success rate
    const successRate = history.filter(h => h.success).length / history.length;
    
    // Calculate consistency (variance in performance)
    const performanceVariance = this.calculateVariance(history.map(h => h.performance || 0));
    const consistencyScore = Math.max(0.5, 1.0 - (performanceVariance / 100));
    
    // Calculate availability
    const recentWork = history.filter(h => 
      new Date(h.timestamp) > new Date(Date.now() - 24 * 60 * 60 * 1000)
    ).length;
    const availabilityScore = Math.min(1.0, recentWork / 10); // Max 10 works per day
    
    return (successRate * 0.4 + consistencyScore * 0.3 + availabilityScore * 0.3);
  }

  // Get validator work history
  getValidatorHistory(validatorId) {
    // In production, this would query a database
    // For demo, return simulated history
    return [
      { success: true, performance: 85, timestamp: new Date(Date.now() - 1000 * 60 * 60).toISOString() },
      { success: true, performance: 92, timestamp: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString() },
      { success: true, performance: 78, timestamp: new Date(Date.now() - 1000 * 60 * 60 * 3).toISOString() }
    ];
  }

  // Get network-wide PoUW metrics
  getNetworkPoUWMetrics() {
    const totalValidators = this.validatorScores.size;
    const totalScore = Array.from(this.validatorScores.values())
      .reduce((sum, score) => sum + (score.finalScore || 0), 0);
    
    const averageScore = totalValidators > 0 ? totalScore / totalValidators : 0;
    
    return {
      totalValidators,
      totalScore,
      averageScore,
      workMetrics: this.workMetrics,
      topValidators: Array.from(this.validatorScores.entries())
        .sort(([,a], [,b]) => (b.finalScore || 0) - (a.finalScore || 0))
        .slice(0, 5)
        .map(([id, score]) => ({ validatorId: id, score: score.finalScore }))
    };
  }

  // Fallback analysis if Cortensor inference fails
  fallbackAnalysis(healthData) {
    const hasAnomaly = 
      healthData.router.latency > this.alertThresholds.latency ||
      healthData.validators.healthRatio < 0.9 ||
      healthData.miners.healthRatio < 0.8 ||
      healthData.network.successRate < 0.95;

    let severity = 'low';
    if (healthData.router.latency > 10000 || healthData.validators.healthRatio < 0.7) {
      severity = 'critical';
    } else if (healthData.router.latency > 7000 || healthData.validators.healthRatio < 0.8) {
      severity = 'high';
    } else if (hasAnomaly) {
      severity = 'medium';
    }

    return {
      anomalyDetected: hasAnomaly,
      severity,
      confidence: hasAnomaly ? 0.85 : 0.95,
      affectedComponents: this.identifyAffectedComponents(healthData),
      recommendations: this.generateRecommendations(healthData),
      analysis: 'Fallback rule-based analysis due to inference unavailability',
      cortensorSessionId: this.currentSession,
      validationRuns: 0,
      inferenceTime: 0,
      modelUsed: 'fallback-rules'
    };
  }

  // Calculate anomaly severity (moved to fallback)
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

  // Generate verifiable evidence bundle with ERC-8004 attestation
  async generateEvidenceBundle(healthData, analysis) {
    // Generate ERC-8004 attestation artifact
    const attestationArtifact = await this.generateERC8004Artifact(healthData, analysis);
    
    // Calculate PoUW metrics
    const pouwMetrics = this.getNetworkPoUWMetrics();
    
    return {
      metricsSnapshot: healthData,
      analysisResult: analysis,
      cortensorSessionId: analysis.cortensorSessionId,
      validationRuns: analysis.validationRuns,
      confidenceScore: analysis.confidence || analysis.averageConfidence,
      attestationHash: require('ethers').keccak256(
        Buffer.from(JSON.stringify({ healthData, analysis }))
      ),
      ipfsHash: `ipfs-hash-${Date.now()}`, // Would upload to IPFS
      erc8004Artifact: attestationArtifact,
      pouwMetrics: pouwMetrics,
      timestamp: new Date().toISOString(),
      version: '1.0.0'
    };
  }

  // Generate ERC-8004 attestation artifact
  async generateERC8004Artifact(healthData, analysis) {
    const artifact = {
      // ERC-8004 standard fields
      schemaVersion: 'erc8004-v1',
      artifactType: 'network-analysis-attestation',
      
      // Agent identity
      agent: {
        id: 'network-guardian-ai',
        version: '1.0.0',
        publicKey: '0x1234567890123456789012345678901234567890', // Demo key
        signature: await this.signArtifact(healthData, analysis)
      },
      
      // Validation metadata
      validation: {
        method: 'poi-consensus',
        runs: analysis.validationRuns || 1,
        consensusScore: analysis.poiConsensus?.consensusScore || 0,
        disagreementAnalysis: analysis.poiConsensus?.disagreementAnalysis || null,
        pouwScore: analysis.pouwScore?.finalScore || 0
      },
      
      // Evidence data
      evidence: {
        healthMetrics: healthData,
        analysisResult: analysis,
        timestamp: new Date().toISOString(),
        dataSource: 'cortensor-network-v1'
      },
      
      // Attestation metadata
      attestation: {
        authority: 'network-guardian-ai',
        trustLevel: this.calculateTrustLevel(analysis),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 hours
        chainId: 'cortensor-testnet',
        transactionHash: null // Would be set if on-chain
      },
      
      // Verification data
      verification: {
        merkleRoot: this.calculateMerkleRoot(healthData, analysis),
        proof: await this.generateVerificationProof(healthData, analysis),
        checksum: this.calculateChecksum(JSON.stringify({ healthData, analysis }))
      }
    };

    return artifact;
  }

  // Sign artifact for ERC-8004 compliance
  async signArtifact(healthData, analysis) {
    // In production, would use actual private key signing
    // For demo, return mock signature
    const data = JSON.stringify({ healthData, analysis });
    return `0x${Buffer.from(data).toString('hex').substring(0, 64)}`;
  }

  // Calculate trust level based on analysis quality
  calculateTrustLevel(analysis) {
    let trustScore = 50; // Base score
    
    // PoI consensus bonus
    if (analysis.poiConsensus?.consensusScore > 0.8) trustScore += 20;
    if (analysis.poiConsensus?.consensusScore > 0.9) trustScore += 10;
    
    // PoUW score bonus
    if (analysis.pouwScore?.finalScore > 150) trustScore += 15;
    
    // Validation runs bonus
    if (analysis.validationRuns >= 3) trustScore += 10;
    
    // Confidence bonus
    const confidence = analysis.confidence || analysis.averageConfidence || 0;
    if (confidence > 0.9) trustScore += 10;
    if (confidence > 0.95) trustScore += 5;
    
    // Determine trust level
    if (trustScore >= 90) return 'critical';
    if (trustScore >= 80) return 'high';
    if (trustScore >= 70) return 'medium';
    if (trustScore >= 60) return 'low';
    return 'minimal';
  }

  // Calculate Merkle root for evidence verification
  calculateMerkleRoot(healthData, analysis) {
    // Simplified Merkle root calculation
    const data = JSON.stringify({ healthData, analysis });
    const hash = require('ethers').keccak256(Buffer.from(data));
    return hash;
  }

  // Generate verification proof
  async generateVerificationProof(healthData, analysis) {
    return {
      type: 'cortensor-poi-pouw',
      algorithm: 'keccak256',
      inputs: [
        'healthMetrics',
        'analysisResult',
        'consensusScore',
        'pouwScore'
      ],
      proof: {
        a: '0x1234...',
        b: '0x5678...',
        c: '0x9abc...'
      }
    };
  }

  // Calculate checksum for data integrity
  calculateChecksum(data) {
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  // Send alerts to community channels (Discord/Telegram)
  async sendAlerts(incidentReport) {
    const alertMessage = this.formatAlertMessage(incidentReport);
    
    // Send to Discord
    if (this.alertChannels.discord.enabled && this.alertChannels.discord.webhookUrl) {
      await this.sendDiscordAlert(alertMessage, incidentReport);
    }
    
    // Send to Telegram
    if (this.alertChannels.telegram.enabled && this.alertChannels.telegram.botToken) {
      await this.sendTelegramAlert(alertMessage, incidentReport);
    }
    
    // Log to console
    console.log('📢 ALERT SENT TO COMMUNITY:');
    console.log(alertMessage);
  }

  // Format alert message for different platforms
  formatAlertMessage(incidentReport) {
    const severityEmoji = {
      'low': '🟡',
      'medium': '🟠', 
      'high': '🔴',
      'critical': '🚨'
    };

    const emoji = severityEmoji[incidentReport.severity] || '⚠️';
    
    return `
${emoji} **Network Guardian Alert** ${emoji}

**Incident**: ${incidentReport.incidentId}
**Severity**: ${incidentReport.severity.toUpperCase()}
**Confidence**: ${(incidentReport.confidence * 100).toFixed(1)}%
**Trust Level**: ${incidentReport.evidenceBundle?.erc8004Artifact?.attestation?.trustLevel?.toUpperCase() || 'UNKNOWN'}
**Affected**: ${incidentReport.affectedComponents.join(', ')}

**Evidence**: ${incidentReport.evidenceBundle?.attestationHash || 'N/A'}
**ERC-8004**: Available ✅
**PoUW Score**: ${incidentReport.evidenceBundle?.pouwMetrics?.averageScore?.toFixed(1) || 'N/A'}

**Recommendations**:
${incidentReport.recommendations.map(r => `• ${r}`).join('\n')}

---
*Network Guardian AI - Cortensor Infrastructure Sentinel*
    `.trim();
  }

  // Send alert to Discord
  async sendDiscordAlert(message, incidentReport) {
    try {
      const payload = {
        content: message,
        username: 'Network Guardian AI',
        avatar_url: 'https://i.imgur.com/4M34hi2.png', // Network monitoring icon
        embeds: [{
          title: `Incident ${incidentReport.incidentId}`,
          color: this.getSeverityColor(incidentReport.severity),
          fields: [
            {
              name: 'Severity',
              value: incidentReport.severity.toUpperCase(),
              inline: true
            },
            {
              name: 'Confidence',
              value: `${(incidentReport.confidence * 100).toFixed(1)}%`,
              inline: true
            },
            {
              name: 'Trust Level',
              value: incidentReport.evidenceBundle?.erc8004Artifact?.attestation?.trustLevel?.toUpperCase() || 'UNKNOWN',
              inline: true
            },
            {
              name: 'Affected Components',
              value: incidentReport.affectedComponents.join(', '),
              inline: false
            },
            {
              name: 'Evidence Hash',
              value: `\`${incidentReport.evidenceBundle?.attestationHash || 'N/A'}\``,
              inline: false
            }
          ],
          timestamp: new Date().toISOString(),
          footer: {
            text: 'Network Guardian AI • Cortensor Network'
          }
        }]
      };

      const response = await axios.post(this.alertChannels.discord.webhookUrl, payload, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 5000
      });

      console.log('✅ Discord alert sent successfully');
      return response.data;

    } catch (error) {
      console.log('❌ Failed to send Discord alert:', error.message);
    }
  }

  // Send alert to Telegram
  async sendTelegramAlert(message, incidentReport) {
    try {
      const telegramMessage = `
🚨 *Network Guardian Alert* 🚨

*Incident*: ${incidentReport.incidentId}
*Severity*: ${incidentReport.severity.toUpperCase()}
*Confidence*: ${(incidentReport.confidence * 100).toFixed(1)}%
*Trust Level*: ${incidentReport.evidenceBundle?.erc8004Artifact?.attestation?.trustLevel?.toUpperCase() || 'UNKNOWN'}
*Affected*: ${incidentReport.affectedComponents.join(', ')}

*Evidence*: \`${incidentReport.evidenceBundle?.attestationHash || 'N/A'}\`
*ERC-8004*: ✅ Available
*PoUW Score*: ${incidentReport.evidenceBundle?.pouwMetrics?.averageScore?.toFixed(1) || 'N/A'}

*Recommendations*:
${incidentReport.recommendations.map(r => `• ${r}`).join('\n')}

---
_Network Guardian AI - Cortensor Infrastructure Sentinel_
      `.trim();

      const url = `https://api.telegram.org/bot${this.alertChannels.telegram.botToken}/sendMessage`;
      
      const payload = {
        chat_id: this.alertChannels.telegram.chatId,
        text: telegramMessage,
        parse_mode: 'Markdown',
        disable_web_page_preview: true
      };

      const response = await axios.post(url, payload, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 5000
      });

      console.log('✅ Telegram alert sent successfully');
      return response.data;

    } catch (error) {
      console.log('❌ Failed to send Telegram alert:', error.message);
    }
  }

  // Get Discord color code for severity
  getSeverityColor(severity) {
    const colors = {
      'low': 16776960,    // Yellow
      'medium': 16763955, // Orange
      'high': 16711680,   // Red
      'critical': 13369344 // Dark Red
    };
    return colors[severity] || 8421504; // Gray default
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
