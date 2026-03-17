'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface EmailRecipientsFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  optional?: boolean;
}

export function EmailRecipientsField({
  id,
  label,
  value,
  onChange,
  disabled = false,
  optional = false
}: EmailRecipientsFieldProps) {
  return (
    <div className="flex items-center justify-between">
      <Label htmlFor={id} className="min-w-[140px]">
        {label}
        {optional && <span className="ml-1 text-xs text-gray-500">(optional)</span>}
      </Label>
      <div className="w-80 space-y-2">
        <Input
          id={id}
          type="text"
          placeholder="user1@example.com, user2@example.com"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-11"
          disabled={disabled}
        />
        <p className="text-xs text-slate-500">
          Separate multiple email addresses with commas or spaces.
        </p>
      </div>
    </div>
  );
}
