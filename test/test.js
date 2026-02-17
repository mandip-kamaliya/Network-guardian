const NetworkGuardian = require('../guardian');

async function runTests() {
  console.log('🧪 Running Network Guardian Tests...\n');
  
  const guardian = new NetworkGuardian();
  
  // Test 1: Health Check Collection
  console.log('Test 1: Health Metrics Collection');
  try {
    const metrics = await guardian.collectHealthMetrics();
    console.log('✅ Health metrics collected successfully');
    console.log('   Router status:', metrics.router.status);
    console.log('   Validator health:', `${(metrics.validators.healthRatio * 100).toFixed(1)}%`);
  } catch (error) {
    console.log('❌ Health collection failed:', error.message);
  }
  
  // Test 2: Cortensor Analysis
  console.log('\nTest 2: Cortensor Analysis Integration');
  try {
    const mockHealthData = {
      timestamp: new Date().toISOString(),
      router: { status: 'healthy', latency: 150 },
      validators: { healthRatio: 0.95 },
      miners: { active: 10 },
      network: { successRate: 0.98 }
    };
    
    const analysis = await guardian.analyzeWithCortensor(mockHealthData);
    console.log('✅ Cortensor analysis completed');
    console.log('   Anomaly detected:', analysis.anomalyDetected);
    console.log('   Confidence:', `${(analysis.confidence * 100).toFixed(1)}%`);
    console.log('   Session ID:', analysis.cortensorSessionId);
  } catch (error) {
    console.log('❌ Cortensor analysis failed:', error.message);
  }
  
  // Test 3: Evidence Bundle Generation
  console.log('\nTest 3: Evidence Bundle Generation');
  try {
    const mockHealthData = {
      timestamp: new Date().toISOString(),
      router: { status: 'unhealthy', latency: 8000 },
      validators: { healthRatio: 0.85 },
      miners: { active: 8 },
      network: { successRate: 0.92 }
    };
    
    const mockAnalysis = {
      anomalyDetected: true,
      confidence: 0.91,
      severity: 'high',
      cortensorSessionId: 'test-session-123'
    };
    
    const evidenceBundle = await guardian.generateEvidenceBundle(mockHealthData, mockAnalysis);
    console.log('✅ Evidence bundle generated');
    console.log('   Attestation hash:', evidenceBundle.attestationHash.substring(0, 20) + '...');
    console.log('   Validation runs:', evidenceBundle.validationRuns);
  } catch (error) {
    console.log('❌ Evidence bundle generation failed:', error.message);
  }
  
  // Test 4: Alert Generation
  console.log('\nTest 4: Alert System');
  try {
    const mockIncident = {
      incidentId: 'TEST-001',
      severity: 'medium',
      confidence: 0.87,
      affectedComponents: ['router', 'validators'],
      recommendations: ['Check router load', 'Alert validators'],
      evidenceBundle: { attestationHash: '0x123...' }
    };
    
    await guardian.sendAlerts(mockIncident);
    console.log('✅ Alert system working');
    console.log('   Incident ID:', mockIncident.incidentId);
    console.log('   Severity:', mockIncident.severity);
  } catch (error) {
    console.log('❌ Alert system failed:', error.message);
  }
  
  console.log('\n🎉 Test suite completed!');
  process.exit(0);
}

runTests().catch(console.error);
