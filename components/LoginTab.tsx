'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { EmailRecipientsField } from '@/components/EmailRecipientsField';

import { Eye, EyeOff, CheckCircle, XCircle } from 'lucide-react';
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';

interface AuthenticationCredentials {
  authMethod: 'approle';
  accessId: string;
  endpoint: string;
  k8sNamespace: string;
  k8sSecretName: string;
  secretKey: string;
}

interface LoginTabProps {
  credentials: AuthenticationCredentials;
  availableNamespaces: string[];
  onCredentialChange: (field: keyof AuthenticationCredentials, value: string) => void;
  onLogin: () => void;
  onLookup: () => void;
  onLogout: () => void;
  loading: { login?: boolean; lookup?: boolean; logout?: boolean };
  token: string;
}

export function LoginTab({
  credentials,
  availableNamespaces,
  onCredentialChange,
  onLogin,
  onLookup,
  onLogout,
  loading,
  token
}: LoginTabProps) {
  const [showRoleId, setShowRoleId] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [genLoading, setGenLoading] = useState(false);
  const [genResult, setGenResult] = useState<string | null>(null);
  const [accessorsDialogOpen, setAccessorsDialogOpen] = useState(false);
  const [accessorsLoading, setAccessorsLoading] = useState(false);
  const [accessorsResult, setAccessorsResult] = useState<string | null>(null);
  const [accessors, setAccessors] = useState<string[]>([]);
  const [accessorsRoleName, setAccessorsRoleName] = useState<string | null>(null);

  const isGenerateError =
    genResult?.startsWith('Failed to send') ||
    genResult?.startsWith('Request failed') ||
    genResult?.startsWith('Unable to send') ||
    false;

  const exportAccessors = () => {
    const rows = [
      ['app_role', 'role_id', 'accessor'],
      ...accessors.map((accessor) => [accessorsRoleName || '', credentials.accessId || '', accessor]),
    ];
    const csv = rows
      .map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${accessorsRoleName || 'approle'}-secret-id-accessors.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Label htmlFor="auth-type" className="min-w-[140px]">Authentication Type</Label>
        <Select
          value={credentials.authMethod}
          onValueChange={(value) => onCredentialChange('authMethod', value)}
        >
          <SelectTrigger id="auth-type" className="w-64">
            <SelectValue placeholder="Select authentication method" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="approle">AppRole</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center justify-between">
        <Label htmlFor="access-id" className="min-w-[140px]">Role ID</Label>
        <div className="relative">
          <Input
            id="access-id"
            type="text"
            placeholder="your-role-id"
            value={credentials.accessId}
            onChange={(e) => onCredentialChange('accessId', e.target.value)}
            className="w-80 pr-10"
            style={{
              fontFamily: showRoleId ? 'inherit' : 'monospace',
              // eslint-disable-next-line @typescript-eslint/ban-ts-comment
              // @ts-ignore
              WebkitTextSecurity: showRoleId ? 'none' : 'disc'
            } as React.CSSProperties}
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="absolute right-1 top-1/2 h-8 w-8 -translate-y-1/2 p-0 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
            onClick={() => setShowRoleId(!showRoleId)}
          >
            {showRoleId ? (
              <EyeOff className="h-4 w-4" />
            ) : (
              <Eye className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>

      <div className="space-y-3">
        <Label className="text-sm font-medium text-gray-700">Secret Key Reference</Label>
        <div className="flex gap-4">
          <div className="flex items-center gap-2 flex-1">
            <Label htmlFor="k8s-namespace" className="min-w-[80px] text-sm">Namespace</Label>
            <Select
              value={credentials.k8sNamespace}
              onValueChange={(value) => onCredentialChange('k8sNamespace', value)}
            >
              <SelectTrigger className="flex-1">
                <SelectValue placeholder="Select namespace" />
              </SelectTrigger>
              <SelectContent>
                {availableNamespaces.map((namespace) => (
                  <SelectItem key={namespace} value={namespace}>
                    {namespace}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2 flex-1">
            <Label htmlFor="k8s-secret-name" className="min-w-[80px] text-sm">Secret Name</Label>
            <Input
              id="k8s-secret-name"
              type="text"
              placeholder="vault-secrets"
              value={credentials.k8sSecretName}
              onChange={(e) => onCredentialChange('k8sSecretName', e.target.value)}
              className="flex-1"
            />
          </div>

          <div className="flex items-center gap-2 flex-1">
            <Label htmlFor="secret-key" className="min-w-[80px] text-sm">Key of Secret</Label>
            <Input
              id="secret-key"
              type="text"
              placeholder="secret-id"
              value={credentials.secretKey}
              onChange={(e) => onCredentialChange('secretKey', e.target.value)}
              className="flex-1"
            />
          </div>
        </div>
      </div>

      <div className="flex justify-between items-center pt-4">
        <div className="flex items-center">
          {token ? (
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5">
              <CheckCircle className="h-4 w-4 text-emerald-600" />
              <span className="text-sm font-medium text-emerald-700">Token Active</span>
            </div>
          ) : (
            <div className="inline-flex items-center gap-2 rounded-full border border-rose-200 bg-rose-50 px-3 py-1.5">
              <XCircle className="h-4 w-4 text-rose-500" />
              <span className="text-sm font-medium text-rose-600">No Token</span>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            onClick={onLogin}
            disabled={
              loading.login ||
              !credentials.k8sNamespace ||
              !credentials.k8sSecretName ||
              !credentials.secretKey
            }
            className="min-w-[92px] bg-slate-900 text-white hover:bg-slate-800"
          >
            {loading.login && <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-2"></div>}
            Login
          </Button>

          <Button
            onClick={onLookup}
            disabled={loading.lookup || !token}
            variant="outline"
            className="min-w-[92px] border-slate-300 text-slate-700 hover:bg-slate-50"
          >
            {loading.lookup && <div className="animate-spin w-4 h-4 border-2 border-slate-500 border-t-transparent rounded-full mr-2"></div>}
            Lookup
          </Button>

          {token && (
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button
                  variant="outline"
                  className="min-w-[152px] border-slate-300 text-slate-700 hover:bg-slate-50"
                  type="button"
                  onClick={() => {
                    setGenResult(null);
                  }}
                >
                  Generate Secret ID
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Generate Secret ID</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-2">
                  <EmailRecipientsField
                    id="gen-email"
                    label="Recipient Emails"
                    value={email}
                    onChange={setEmail}
                    disabled={genLoading}
                  />
                  {genResult && (
                    <div className={`rounded-md border px-3 py-2 text-sm ${isGenerateError ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>{genResult}</div>
                  )}
                </div>
                <DialogFooter>
                  <Button
                    onClick={async () => {
                      setGenLoading(true);
                      setGenResult(null);
                      try {
                        const res = await fetch('/api/vault/auth/approle/generate-secret-id', {
                          method: 'POST',
                          headers: {
                            'Content-Type': 'application/json',
                            ...(token ? { 'x-vault-token': token } : {})
                          },
                          body: JSON.stringify({
                            email,
                            endpoint: credentials.endpoint,
                            roleId: credentials.accessId
                          })
                        });
                        if (res.ok) {
                          setGenResult('Secret ID sent successfully.');
                        } else {
                          const data = await res.json();
                          setGenResult('Failed to send: ' + (data.error || 'Unknown error'));
                        }
                      } catch (error: unknown) {
                        const message = error instanceof Error ? error.message : 'Unknown error';
                        setGenResult('Request failed: ' + message);
                      } finally {
                        setGenLoading(false);
                      }
                    }}
                    disabled={genLoading || !email}
                    className="bg-slate-900 text-white hover:bg-slate-800"
                  >
                    {genLoading ? 'Sending...' : 'Send Secret ID'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}

          {token && (
            <Dialog open={accessorsDialogOpen} onOpenChange={setAccessorsDialogOpen}>
              <DialogTrigger asChild>
                <Button
                  variant="outline"
                  className="min-w-[152px] border-slate-300 text-slate-700 hover:bg-slate-50"
                  type="button"
                  onClick={() => {
                    setAccessorsResult(null);
                    setAccessors([]);
                    setAccessorsRoleName(null);
                  }}
                >
                  List Secret IDs
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader className="pr-10">
                  <DialogTitle>Secret ID Accessors</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-2">
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1">
                      <p className="text-sm text-slate-600">
                        List all Secret ID accessors for the current AppRole.
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      className="border-slate-300 text-slate-700 hover:bg-slate-50"
                      onClick={exportAccessors}
                      disabled={accessors.length === 0}
                    >
                      Export
                    </Button>
                  </div>
                  <div className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 md:grid-cols-2">
                    <div className="space-y-1">
                      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">AppRole</div>
                      <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700">
                        {accessorsRoleName || 'Not loaded yet'}
                      </div>
                    </div>
                    <div className="space-y-1">
                      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Role ID</div>
                      <div className="rounded-md border border-slate-200 bg-white px-3 py-2 font-mono text-sm text-slate-700">
                        {credentials.accessId || 'Not provided'}
                      </div>
                    </div>
                  </div>
                  {accessorsResult && (
                    <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                      {accessorsResult}
                    </div>
                  )}
                  {!accessorsResult && accessors.length > 0 && (
                    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                      <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-3">
                        <div className="text-sm font-medium text-slate-700">Secret ID Accessors</div>
                        <div className="text-xs text-slate-500">{accessors.length} total</div>
                      </div>
                      <div className="max-h-72 overflow-auto">
                        <table className="w-full border-collapse text-sm">
                          <thead className="sticky top-0 bg-white">
                            <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                              <th className="w-16 px-4 py-3 font-medium">#</th>
                              <th className="px-4 py-3 font-medium">Accessor</th>
                            </tr>
                          </thead>
                          <tbody>
                            {accessors.map((accessor, index) => (
                              <tr key={accessor} className="border-b border-slate-100 last:border-b-0">
                                <td className="px-4 py-3 align-top text-slate-500">{index + 1}</td>
                                <td className="px-4 py-3 font-mono text-slate-700">{accessor}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                  {!accessorsResult && !accessorsLoading && accessors.length === 0 && (
                    <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500">
                      No accessors loaded yet.
                    </div>
                  )}
                </div>
                <DialogFooter>
                  <Button
                    onClick={async () => {
                      setAccessorsLoading(true);
                      setAccessorsResult(null);
                      setAccessors([]);
                      setAccessorsRoleName(null);
                      try {
                        const res = await fetch('/api/vault/auth/approle/list-secret-id-accessors', {
                          method: 'POST',
                          headers: {
                            'Content-Type': 'application/json',
                            ...(token ? { 'x-vault-token': token } : {})
                          },
                          body: JSON.stringify({ endpoint: credentials.endpoint })
                        });
                        const data = await res.json();
                        if (res.ok) {
                          setAccessors(Array.isArray(data.accessors) ? data.accessors : []);
                          setAccessorsRoleName(data.roleName || null);
                        } else {
                          setAccessorsResult(data.error || 'Unknown error');
                        }
                      } catch (error: unknown) {
                        const message = error instanceof Error ? error.message : 'Unknown error';
                        setAccessorsResult(`Request failed: ${message}`);
                      } finally {
                        setAccessorsLoading(false);
                      }
                    }}
                    disabled={accessorsLoading}
                    className="bg-slate-900 text-white hover:bg-slate-800"
                  >
                    {accessorsLoading ? 'Loading...' : 'Load Accessors'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}

          <Button
            onClick={onLogout}
            disabled={loading.logout || !token}
            className="min-w-[92px] bg-rose-600 text-white hover:bg-rose-700"
            variant="destructive"
          >
            {loading.logout && <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-2"></div>}
            Logout
          </Button>
        </div>
      </div>
    </div>
  );
}
