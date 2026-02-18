import React, { useState, useEffect } from 'react';
import { Activity, AlertTriangle, CheckCircle, Server, Users, Network, Clock } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';
import io from 'socket.io-client';
import './Dashboard.css';

interface DashboardData {
  timestamp: string;
  networkStatus: 'healthy' | 'warning';
  routerLatency: number;
  validatorHealth: string;
  networkSuccess: string;
  activeMiners: number;
  lastIncident: string | null;
  confidence: number;
  severity: string;
}

interface Incident {
  incidentId: string;
  timestamp: string;
  severity: string;
  confidence: number;
  affectedComponents: string[];
  recommendations: string[];
  evidenceBundle: any;
}

const Dashboard: React.FC = () => {
  const [socket, setSocket] = useState<any>(null);
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [historicalData, setHistoricalData] = useState<any[]>([]);

  useEffect(() => {
    // Connect to WebSocket server
    const newSocket = io('http://localhost:3001');
    setSocket(newSocket);

    newSocket.on('connect', () => {
      setIsConnected(true);
      console.log('Connected to Network Guardian server');
    });

    newSocket.on('disconnect', () => {
      setIsConnected(false);
      console.log('Disconnected from Network Guardian server');
    });

    newSocket.on('dashboardUpdate', (data: DashboardData) => {
      setDashboardData(data);
      setHistoricalData(prev => [...prev.slice(-19), {
        time: new Date(data.timestamp).toLocaleTimeString(),
        latency: data.routerLatency,
        success: parseFloat(data.networkSuccess)
      }]);
    });

    newSocket.on('newIncident', (incident: Incident) => {
      setIncidents(prev => [incident, ...prev.slice(0, 9)]);
    });

    newSocket.on('status', (status: any) => {
      if (status.incidentHistory) {
        setIncidents(status.incidentHistory);
      }
    });

    return () => {
      newSocket.close();
    };
  }, []);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'healthy': return '#10b981';
      case 'warning': return '#f59e0b';
      case 'critical': return '#ef4444';
      default: return '#6b7280';
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'low': return '#10b981';
      case 'medium': return '#f59e0b';
      case 'high': return '#ef4444';
      case 'critical': return '#dc2626';
      default: return '#6b7280';
    }
  };

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <div className="header-content">
          <div className="logo">
            <Activity className="logo-icon" />
            <h1>Network Guardian AI</h1>
          </div>
          <div className="status-indicator">
            <div className={`connection-status ${isConnected ? 'connected' : 'disconnected'}`}>
              {isConnected ? <CheckCircle size={20} /> : <AlertTriangle size={20} />}
              <span>{isConnected ? 'Connected' : 'Disconnected'}</span>
            </div>
          </div>
        </div>
      </header>

      <main className="dashboard-main">
        {/* Key Metrics */}
        <section className="metrics-grid">
          <div className="metric-card">
            <div className="metric-header">
              <Network className="metric-icon" />
              <span>Network Status</span>
            </div>
            <div className="metric-value" style={{ color: dashboardData ? getStatusColor(dashboardData.networkStatus) : '#6b7280' }}>
              {dashboardData ? dashboardData.networkStatus.toUpperCase() : 'LOADING...'}
            </div>
          </div>

          <div className="metric-card">
            <div className="metric-header">
              <Server className="metric-icon" />
              <span>Router Latency</span>
            </div>
            <div className="metric-value">
              {dashboardData ? `${dashboardData.routerLatency}ms` : '---'}
            </div>
          </div>

          <div className="metric-card">
            <div className="metric-header">
              <Users className="metric-icon" />
              <span>Validator Health</span>
            </div>
            <div className="metric-value">
              {dashboardData ? dashboardData.validatorHealth : '---'}
            </div>
          </div>

          <div className="metric-card">
            <div className="metric-header">
              <Activity className="metric-icon" />
              <span>Success Rate</span>
            </div>
            <div className="metric-value">
              {dashboardData ? dashboardData.networkSuccess : '---'}
            </div>
          </div>
        </section>

        {/* Charts */}
        <section className="charts-section">
          <div className="chart-container">
            <h3>Router Latency (ms)</h3>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={historicalData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis dataKey="time" stroke="#9ca3af" />
                <YAxis stroke="#9ca3af" />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151' }}
                  labelStyle={{ color: '#f3f4f6' }}
                />
                <Area 
                  type="monotone" 
                  dataKey="latency" 
                  stroke="#8b5cf6" 
                  fill="#8b5cf6" 
                  fillOpacity={0.3}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="chart-container">
            <h3>Network Success Rate (%)</h3>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={historicalData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis dataKey="time" stroke="#9ca3af" />
                <YAxis stroke="#9ca3af" domain={[90, 100]} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151' }}
                  labelStyle={{ color: '#f3f4f6' }}
                />
                <Line 
                  type="monotone" 
                  dataKey="success" 
                  stroke="#10b981" 
                  strokeWidth={2}
                  dot={{ fill: '#10b981', r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>

        {/* Incidents Feed */}
        <section className="incidents-section">
          <div className="section-header">
            <AlertTriangle className="section-icon" />
            <h2>Recent Incidents</h2>
          </div>
          <div className="incidents-list">
            {incidents.length === 0 ? (
              <div className="no-incidents">
                <CheckCircle className="no-incidents-icon" />
                <p>No incidents detected. Network is operating normally.</p>
              </div>
            ) : (
              incidents.map((incident, index) => (
                <div key={incident.incidentId} className="incident-card">
                  <div className="incident-header">
                    <span className="incident-id">{incident.incidentId}</span>
                    <span 
                      className="incident-severity" 
                      style={{ color: getSeverityColor(incident.severity) }}
                    >
                      {incident.severity.toUpperCase()}
                    </span>
                  </div>
                  <div className="incident-details">
                    <div className="incident-time">
                      <Clock size={14} />
                      {new Date(incident.timestamp).toLocaleString()}
                    </div>
                    <div className="incident-confidence">
                      Confidence: {(incident.confidence * 100).toFixed(1)}%
                    </div>
                  </div>
                  {incident.affectedComponents.length > 0 && (
                    <div className="affected-components">
                      <strong>Affected:</strong> {incident.affectedComponents.join(', ')}
                    </div>
                  )}
                  {incident.recommendations.length > 0 && (
                    <div className="recommendations">
                      <strong>Recommendations:</strong>
                      <ul>
                        {incident.recommendations.map((rec, idx) => (
                          <li key={idx}>{rec}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </section>
      </main>
    </div>
  );
};

export default Dashboard;
