import React, { useState, useEffect } from 'react';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { Shield, Download, FileText, CheckCircle, AlertCircle, Clock } from 'lucide-react';

export function ComplianceTab() {
  const [controlStatus, setControlStatus] = useState([]);
  const [summary, setSummary] = useState({ passing: 0, total: 52 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadComplianceData();
  }, []);

  const loadComplianceData = async () => {
    setLoading(true);
    try {
      // In production, this would fetch from compliance_log and control_test_results
      // For now, mock data
      const mockControls = [
        { id: 'CC6.1', description: 'MFA enforced for admins', status: 'passed', lastVerified: '2026-03-14', evidence: 'View' },
        { id: 'CC7.1', description: 'Dependency scan passing', status: 'passed', lastVerified: '2026-03-14', evidence: 'View' },
        { id: 'CC8.1', description: 'All deploys via PR', status: 'passed', lastVerified: '2026-03-14', evidence: 'View' },
        { id: 'CC6.2', description: 'Access review complete', status: 'due', lastVerified: '2026-01-14', evidence: 'Start' },
        { id: 'CC7.4', description: 'Incident response active', status: 'passed', lastVerified: '2026-03-14', evidence: 'View' },
        { id: 'CC9.1', description: 'Fraud monitoring active', status: 'passed', lastVerified: '2026-03-14', evidence: 'View' },
      ];

      setControlStatus(mockControls);
      setSummary({
        passing: mockControls.filter(c => c.status === 'passed').length,
        total: 52
      });
    } catch (error) {
      console.error('Failed to load compliance data:', error);
    } finally {
      setLoading(false);
    }
  };

  const exportAuditLog = async () => {
    // Export audit log for date range
    const startDate = prompt('Start date (YYYY-MM-DD):');
    const endDate = prompt('End date (YYYY-MM-DD):');
    
    if (!startDate || !endDate) return;

    try {
      // In production, call Edge Function to export audit log
      alert(`Exporting audit log from ${startDate} to ${endDate}...`);
      // const response = await fetch('/functions/v1/export-audit-log', { ... });
      // Download CSV/JSON
    } catch (error) {
      console.error('Export failed:', error);
    }
  };

  const downloadSOC2Report = () => {
    // Download SOC2 readiness report
    alert('Downloading SOC2 Type II Readiness Report...');
    // In production, generate PDF report
  };

  const downloadDPA = () => {
    // Download Data Processing Agreement
    window.open('/legal/dpa.pdf', '_blank');
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'passed':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'failed':
        return <AlertCircle className="w-5 h-5 text-red-500" />;
      case 'due':
        return <Clock className="w-5 h-5 text-yellow-500" />;
      default:
        return <Clock className="w-5 h-5 text-gray-400" />;
    }
  };

  const getStatusText = (status) => {
    switch (status) {
      case 'passed':
        return <span className="text-green-600 font-medium">Pass</span>;
      case 'failed':
        return <span className="text-red-600 font-medium">Fail</span>;
      case 'due':
        return <span className="text-yellow-600 font-medium">Due</span>;
      default:
        return <span className="text-gray-600">N/A</span>;
    }
  };

  const percentage = Math.round((summary.passing / summary.total) * 100);

  return (
    <div className="space-y-6">
      {/* SOC2 Status Overview */}
      <Card className="p-6">
        <div className="flex items-start gap-4">
          <div className="p-3 bg-blue-100 rounded-lg">
            <Shield className="w-8 h-8 text-blue-600" />
          </div>
          <div className="flex-1">
            <h2 className="text-xl font-semibold mb-2">SOC2 Type II Readiness</h2>
            
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-600">Controls passing: {summary.passing}/{summary.total}</span>
                <span className="text-sm font-medium text-gray-900">{percentage}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-3">
                <div 
                  className="bg-blue-600 h-3 rounded-full transition-all duration-300"
                  style={{ width: `${percentage}%` }}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-gray-600">Last assessment:</span>
                <span className="ml-2 font-medium">2026-03-01</span>
              </div>
              <div>
                <span className="text-gray-600">Next audit:</span>
                <span className="ml-2 font-medium">2026-09-01 (estimated)</span>
              </div>
            </div>

            <div className="flex gap-3 mt-4">
              <Button onClick={downloadSOC2Report} variant="primary" size="sm">
                <Download className="w-4 h-4 mr-2" />
                Download SOC2 Report
              </Button>
              <Button onClick={exportAuditLog} variant="secondary" size="sm">
                <FileText className="w-4 h-4 mr-2" />
                Export Evidence
              </Button>
            </div>
          </div>
        </div>
      </Card>

      {/* Control Matrix */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">Control Matrix</h3>
        
        {loading ? (
          <div className="text-center py-8 text-gray-500">Loading controls...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Control ID</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Description</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Status</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Last Verified</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Evidence</th>
                </tr>
              </thead>
              <tbody>
                {controlStatus.map((control) => (
                  <tr key={control.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-3 px-4 text-sm font-mono">{control.id}</td>
                    <td className="py-3 px-4 text-sm">{control.description}</td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        {getStatusIcon(control.status)}
                        {getStatusText(control.status)}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-600">{control.lastVerified}</td>
                    <td className="py-3 px-4">
                      <button className="text-sm text-blue-600 hover:text-blue-700">
                        {control.evidence}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Audit Log Export */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">Audit Log Export</h3>
        <p className="text-sm text-gray-600 mb-4">
          Export audit logs for a specific date range. Required for auditors to review access patterns and security events.
        </p>
        <Button onClick={exportAuditLog} variant="secondary">
          <Download className="w-4 h-4 mr-2" />
          Export Audit Log
        </Button>
      </Card>

      {/* Penetration Test Results */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">Penetration Test Results</h3>
        <div className="space-y-4">
          <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
            <div>
              <div className="font-medium">Q1 2026 Penetration Test</div>
              <div className="text-sm text-gray-600">Vendor: SecureTest Inc. | Date: 2026-02-15</div>
              <div className="text-sm text-gray-600 mt-1">
                Critical: 0 | High: 0 | Medium: 2 | Low: 5
              </div>
            </div>
            <Button variant="secondary" size="sm">
              <FileText className="w-4 h-4 mr-2" />
              View Report
            </Button>
          </div>
          
          <div className="text-sm text-gray-600">
            All critical and high findings have been remediated. Evidence of fixes available in GitHub PRs.
          </div>
        </div>
      </Card>

      {/* Data Processing Agreement */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">Data Processing Agreement</h3>
        <p className="text-sm text-gray-600 mb-4">
          Download the standard AutoStack Data Processing Agreement (DPA). Required for GDPR compliance alongside SOC2.
        </p>
        <Button onClick={downloadDPA} variant="secondary">
          <Download className="w-4 h-4 mr-2" />
          Download DPA
        </Button>
      </Card>

      {/* Automated Control Testing */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">Automated Control Testing</h3>
        <p className="text-sm text-gray-600 mb-4">
          Automated tests run monthly to verify controls are functioning correctly. Results are logged to the compliance_log table.
        </p>
        <div className="flex items-center gap-4">
          <div className="text-sm">
            <span className="text-gray-600">Last run:</span>
            <span className="ml-2 font-medium">2026-03-01 03:00 UTC</span>
          </div>
          <div className="text-sm">
            <span className="text-gray-600">Next run:</span>
            <span className="ml-2 font-medium">2026-04-01 03:00 UTC</span>
          </div>
        </div>
      </Card>
    </div>
  );
}
