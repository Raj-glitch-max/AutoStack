import React, { useState, useEffect } from 'react';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { Shield, Key, Download, AlertCircle, CheckCircle } from 'lucide-react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

export function MFASettings() {
  const [mfaEnabled, setMfaEnabled] = useState(false);
  const [qrCode, setQrCode] = useState(null);
  const [secret, setSecret] = useState(null);
  const [verificationCode, setVerificationCode] = useState('');
  const [backupCodes, setBackupCodes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [orgRequiresMFA, setOrgRequiresMFA] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    loadMFAStatus();
  }, []);

  const loadMFAStatus = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Check if user has MFA enabled
      const { data: factors } = await supabase.auth.mfa.listFactors();
      setMfaEnabled(factors && factors.totp && factors.totp.length > 0);

      // Check org MFA requirement
      const { data: org } = await supabase
        .from('organizations')
        .select('require_mfa')
        .eq('id', user.user_metadata.org_id)
        .single();
      
      if (org) {
        setOrgRequiresMFA(org.require_mfa);
      }

      // Check if user is admin
      const { data: member } = await supabase
        .from('org_members')
        .select('role')
        .eq('user_id', user.id)
        .single();
      
      setIsAdmin(member && ['owner', 'admin'].includes(member.role));
    } catch (err) {
      console.error('Failed to load MFA status:', err);
    }
  };

  const enrollMFA = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: 'AutoStack MFA'
      });

      if (error) throw error;

      setQrCode(data.totp.qr_code);
      setSecret(data.totp.secret);
      setSuccess('Scan the QR code with your authenticator app');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const verifyMFA = async () => {
    if (!verificationCode || verificationCode.length !== 6) {
      setError('Please enter a 6-digit code');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { data: factors } = await supabase.auth.mfa.listFactors();
      const factor = factors.totp[0];

      const { error } = await supabase.auth.mfa.challengeAndVerify({
        factorId: factor.id,
        code: verificationCode
      });

      if (error) throw error;

      // Generate backup codes
      const codes = Array.from({ length: 10 }, () => 
        Math.random().toString(36).substring(2, 10).toUpperCase()
      );
      setBackupCodes(codes);

      // Update MFA config in database
      const { data: { user } } = await supabase.auth.getUser();
      await supabase.from('user_mfa_config').upsert({
        user_id: user.id,
        totp_enabled: true,
        backup_codes_generated: true,
        last_verified_at: new Date().toISOString()
      });

      setMfaEnabled(true);
      setQrCode(null);
      setSecret(null);
      setVerificationCode('');
      setSuccess('MFA enabled successfully! Save your backup codes.');
    } catch (err) {
      setError(err.message || 'Verification failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const disableMFA = async () => {
    if (!confirm('Are you sure you want to disable MFA? This will make your account less secure.')) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { data: factors } = await supabase.auth.mfa.listFactors();
      const factor = factors.totp[0];

      const { error } = await supabase.auth.mfa.unenroll({
        factorId: factor.id
      });

      if (error) throw error;

      // Update database
      const { data: { user } } = await supabase.auth.getUser();
      await supabase.from('user_mfa_config').update({
        totp_enabled: false,
        last_verified_at: new Date().toISOString()
      }).eq('user_id', user.id);

      setMfaEnabled(false);
      setBackupCodes([]);
      setSuccess('MFA disabled');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const toggleOrgMFARequirement = async () => {
    if (!isAdmin) {
      setError('Only admins can change org-wide MFA settings');
      return;
    }

    const newValue = !orgRequiresMFA;
    
    if (newValue && !confirm('Require MFA for all users in your organization? Users without MFA will be prompted to set it up on next login.')) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase
        .from('organizations')
        .update({ require_mfa: newValue })
        .eq('id', user.user_metadata.org_id);

      if (error) throw error;

      setOrgRequiresMFA(newValue);
      setSuccess(`Organization MFA requirement ${newValue ? 'enabled' : 'disabled'}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const downloadBackupCodes = () => {
    const text = backupCodes.join('\n');
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'autostack-backup-codes.txt';
    a.click();
  };

  return (
    <div className="space-y-6">
      {/* Status Banner */}
      {orgRequiresMFA && !mfaEnabled && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
          <div>
            <div className="font-medium text-yellow-900">MFA Required</div>
            <div className="text-sm text-yellow-700 mt-1">
              Your organization requires multi-factor authentication. Please enable MFA below.
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-red-700">{error}</div>
        </div>
      )}

      {success && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-start gap-3">
          <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-green-700">{success}</div>
        </div>
      )}

      {/* MFA Status */}
      <Card className="p-6">
        <div className="flex items-start gap-4">
          <div className="p-3 bg-blue-100 rounded-lg">
            <Shield className="w-8 h-8 text-blue-600" />
          </div>
          <div className="flex-1">
            <h2 className="text-xl font-semibold mb-2">Multi-Factor Authentication</h2>
            <p className="text-sm text-gray-600 mb-4">
              Add an extra layer of security to your account by requiring a verification code in addition to your password.
            </p>
            
            <div className="flex items-center gap-3">
              <div className={`px-3 py-1 rounded-full text-sm font-medium ${
                mfaEnabled 
                  ? 'bg-green-100 text-green-700' 
                  : 'bg-gray-100 text-gray-700'
              }`}>
                {mfaEnabled ? 'Enabled' : 'Disabled'}
              </div>
              
              {!mfaEnabled && !qrCode && (
                <Button onClick={enrollMFA} disabled={loading} variant="primary">
                  <Key className="w-4 h-4 mr-2" />
                  Enable MFA
                </Button>
              )}
              
              {mfaEnabled && (
                <Button onClick={disableMFA} disabled={loading} variant="secondary">
                  Disable MFA
                </Button>
              )}
            </div>
          </div>
        </div>
      </Card>

      {/* QR Code Enrollment */}
      {qrCode && (
        <Card className="p-6">
          <h3 className="text-lg font-semibold mb-4">Set Up Authenticator App</h3>
          
          <div className="space-y-4">
            <div>
              <p className="text-sm text-gray-600 mb-3">
                Scan this QR code with your authenticator app (Google Authenticator, Authy, 1Password, etc.)
              </p>
              <div className="bg-white p-4 rounded-lg border inline-block">
                <img src={qrCode} alt="MFA QR Code" className="w-48 h-48" />
              </div>
            </div>

            <div>
              <p className="text-sm text-gray-600 mb-2">Or enter this code manually:</p>
              <code className="bg-gray-100 px-3 py-2 rounded text-sm font-mono">{secret}</code>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">
                Enter the 6-digit code from your app
              </label>
              <div className="flex gap-3">
                <input
                  type="text"
                  value={verificationCode}
                  onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="000000"
                  className="border rounded-lg px-4 py-2 w-32 text-center text-lg font-mono"
                  maxLength={6}
                />
                <Button 
                  onClick={verifyMFA} 
                  disabled={loading || verificationCode.length !== 6}
                  variant="primary"
                >
                  Verify & Enable
                </Button>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Backup Codes */}
      {backupCodes.length > 0 && (
        <Card className="p-6">
          <h3 className="text-lg font-semibold mb-2">Backup Codes</h3>
          <p className="text-sm text-gray-600 mb-4">
            Save these codes in a secure location. Each code can be used once if you lose access to your authenticator app.
          </p>
          
          <div className="bg-gray-50 rounded-lg p-4 mb-4">
            <div className="grid grid-cols-2 gap-2 font-mono text-sm">
              {backupCodes.map((code, i) => (
                <div key={i}>{code}</div>
              ))}
            </div>
          </div>

          <Button onClick={downloadBackupCodes} variant="secondary" size="sm">
            <Download className="w-4 h-4 mr-2" />
            Download Codes
          </Button>
        </Card>
      )}

      {/* Organization Settings */}
      {isAdmin && (
        <Card className="p-6">
          <h3 className="text-lg font-semibold mb-2">Organization Settings</h3>
          <p className="text-sm text-gray-600 mb-4">
            Require all members of your organization to enable MFA.
          </p>
          
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={orgRequiresMFA}
                onChange={toggleOrgMFARequirement}
                disabled={loading}
                className="w-4 h-4 rounded border-gray-300"
              />
              <span className="text-sm font-medium">Require MFA for all users</span>
            </label>
          </div>

          {orgRequiresMFA && (
            <div className="mt-3 text-sm text-gray-600">
              Users without MFA will be prompted to set it up on their next login.
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
