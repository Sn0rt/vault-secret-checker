'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

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

  const isGenerateError =
    genResult?.startsWith('Failed to send') ||
    genResult?.startsWith('Request failed') ||
    genResult?.startsWith('Unable to send') ||
    false;

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
            className="absolute right-1 top-1/2 transform -translate-y-1/2 h-8 w-8 p-0 hover:bg-gray-100"
            onClick={() => setShowRoleId(!showRoleId)}
          >
            {showRoleId ? (
              <EyeOff className="h-4 w-4 text-gray-500" />
            ) : (
              <Eye className="h-4 w-4 text-gray-500" />
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

      {token && (
        <div className="flex justify-end mb-2">
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button
                variant="outline"
                className="border-blue-500 text-blue-600 hover:bg-blue-50"
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
                <Label htmlFor="gen-email">Recipient Email</Label>
                <Input
                  id="gen-email"
                  type="email"
                  placeholder="your@email.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  disabled={genLoading}
                />
                {genResult && (
                  <div className={isGenerateError ? 'text-red-600 text-sm' : 'text-green-600 text-sm'}>{genResult}</div>
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
                        body: JSON.stringify({ email, endpoint: credentials.endpoint })
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
                  className="bg-blue-600 text-white hover:bg-blue-700"
                >
                  {genLoading ? 'Sending...' : 'Send Secret ID'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      )}

      <div className="flex justify-between items-center pt-4">
        <div className="flex items-center gap-2">
          {token ? (
            <>
              <CheckCircle className="h-4 w-4 text-green-600" />
              <span className="text-sm text-green-700">Token Active</span>
            </>
          ) : (
            <>
              <XCircle className="h-4 w-4 text-red-500" />
              <span className="text-sm text-red-500">No Token</span>
            </>
          )}
        </div>

        <div className="flex gap-2">
          <Button
            onClick={onLogin}
            disabled={
              loading.login ||
              !credentials.k8sNamespace ||
              !credentials.k8sSecretName ||
              !credentials.secretKey
            }
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            {loading.login && <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-2"></div>}
            Login
          </Button>

          <Button
            onClick={onLookup}
            disabled={loading.lookup || !token}
            className="bg-blue-500 hover:bg-blue-600 text-white border-blue-500"
            variant="outline"
          >
            {loading.lookup && <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-2"></div>}
            Lookup
          </Button>

          <Button
            onClick={onLogout}
            disabled={loading.logout || !token}
            className="bg-red-600 hover:bg-red-700 text-white"
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
