'use client';

import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Combobox } from '@/components/ui/combobox';

interface EndpointListProps {
  availableEndpoints: string[];
  currentEndpoint: string;
  onEndpointChange: (endpoint: string) => void;
  emailConfigured?: boolean;
}

export function EndpointList({
  availableEndpoints,
  currentEndpoint,
  onEndpointChange,
  emailConfigured = false
}: EndpointListProps) {
  return (
    <Card className="border-slate-200 shadow-sm hover:shadow-md transition-shadow duration-200">
      <CardHeader className="pb-4">
        <CardTitle className="text-xl font-semibold text-slate-700 flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
            <span className="text-sm font-bold text-blue-600">1</span>
          </div>
          Endpoint Configuration
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <Label htmlFor="endpoint-select" className="min-w-[100px]">Endpoint</Label>
          <Combobox
            options={availableEndpoints}
            value={currentEndpoint}
            onValueChange={onEndpointChange}
            placeholder="Select or enter vault endpoint..."
            emptyText="No endpoints found. Type to add custom endpoint."
            allowCustom={true}
            className="w-80"
          />
        </div>
        <div className="flex justify-start">
          <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium ${
            emailConfigured
              ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
              : 'border-rose-200 bg-rose-50 text-rose-700'
          }`}>
            <div className={`h-2 w-2 rounded-full ${emailConfigured ? 'bg-emerald-500' : 'bg-rose-500'}`}></div>
            SMTP {emailConfigured ? 'Configured' : 'Not Configured'}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
