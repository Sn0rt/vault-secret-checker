'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ChevronDown, ChevronRight } from 'lucide-react';

interface UnwrapCredentials {
  wrappedToken: string;
  notificationEmail?: string;
}

interface WrappingTabProps {
  credentials: UnwrapCredentials;
  onCredentialChange: (field: keyof UnwrapCredentials, value: string) => void;
  onUnwrap: () => void;
  loading: { unwrap?: boolean };
  emailConfigured?: boolean;
}

export function WrappingTab({
  credentials,
  onCredentialChange,
  onUnwrap,
  loading,
  emailConfigured = false
}: WrappingTabProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <Card className="border-slate-200 shadow-sm hover:shadow-md transition-shadow duration-200">
      <CardHeader className="pb-4">
        <button
          type="button"
          className="flex w-full items-center justify-between text-left"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
        >
          <div className="space-y-1">
            <CardTitle className="text-lg font-semibold text-slate-700">
              Secret ID Unwrap
            </CardTitle>
            <p className="text-sm text-slate-500">
              Small utility for unwrapping a wrapped Secret ID token when needed.
            </p>
          </div>
          {expanded ? (
            <ChevronDown className="h-5 w-5 text-slate-500" />
          ) : (
            <ChevronRight className="h-5 w-5 text-slate-500" />
          )}
        </button>
      </CardHeader>
      {expanded && (
      <CardContent>
        <div className="space-y-6">
          <div className="flex items-start justify-between">
            <Label htmlFor="wrapped-token" className="min-w-[140px] mt-2">Wrapped Token</Label>
            <Textarea
              id="wrapped-token"
              placeholder="hvs.CAESIJlWh..."
              value={credentials.wrappedToken}
              onChange={(e) => onCredentialChange('wrappedToken', e.target.value)}
              className="w-80 min-h-[100px] font-mono text-sm"
              rows={4}
            />
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="notification-email" className="min-w-[140px]">
              Notification CC (Email)
              <span className="text-xs text-gray-500 ml-1">(optional)</span>
            </Label>
            <Input
              id="notification-email"
              type="email"
              placeholder="user1@example.com, user2@example.com"
              value={credentials.notificationEmail || ''}
              onChange={(e) => onCredentialChange('notificationEmail', e.target.value)}
              className="w-80"
              disabled={!emailConfigured}
            />
          </div>

          <div className="flex justify-between items-center pt-4">
            <div className="flex items-center">
              <div className={`w-2 h-2 rounded-full mr-1 ${emailConfigured ? 'bg-green-500' : 'bg-red-500'}`}></div>
              <span className={`text-xs ${emailConfigured ? 'text-green-600' : 'text-red-600'}`}>
                SMTP {emailConfigured ? 'Configured' : 'Not Configured'}
              </span>
            </div>

            <Button
              onClick={onUnwrap}
              disabled={loading.unwrap || !credentials.wrappedToken}
              className="bg-amber-600 hover:bg-amber-700 text-white"
            >
              {loading.unwrap && <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-2"></div>}
              Unwrap
            </Button>
          </div>
        </div>
      </CardContent>
      )}
    </Card>
  );
}
