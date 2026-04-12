import { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useSavedAddresses, useSaveAddress, useDeleteAddress, type SavedAddress } from '@/hooks/use-saved-addresses';
import { BookmarkPlus, Trash2, Loader2 } from 'lucide-react';

interface AddressFields {
  full_name: string;
  address_line1: string;
  address_line2: string;
  city: string;
  state: string;
  postal_code: string;
  country: string;
}

const EMPTY: AddressFields = { full_name: '', address_line1: '', address_line2: '', city: '', state: '', postal_code: '', country: '' };

interface Props {
  onChange: (formatted: string) => void;
}

export function ShippingAddressForm({ onChange }: Props) {
  const { data: saved = [], isLoading } = useSavedAddresses();
  const saveAddress = useSaveAddress();
  const deleteAddress = useDeleteAddress();

  const [fields, setFields] = useState<AddressFields>(EMPTY);
  const [selectedId, setSelectedId] = useState<string>('new');
  const [saveLabel, setSaveLabel] = useState('Home');
  const [wantSave, setWantSave] = useState(false);
  const [setDefault, setSetDefault] = useState(false);

  // Auto-select default address on load
  useEffect(() => {
    if (saved.length > 0 && selectedId === 'new') {
      const def = saved.find(a => a.is_default) || saved[0];
      selectSaved(def);
    }
  }, [saved]);

  // Emit formatted address on change
  useEffect(() => {
    const parts = [fields.full_name, fields.address_line1, fields.address_line2, fields.city, fields.state, fields.postal_code, fields.country].filter(Boolean);
    onChange(parts.join(', '));
  }, [fields]);

  const selectSaved = (addr: SavedAddress) => {
    setSelectedId(addr.id);
    setFields({
      full_name: addr.full_name,
      address_line1: addr.address_line1,
      address_line2: addr.address_line2 || '',
      city: addr.city,
      state: addr.state,
      postal_code: addr.postal_code,
      country: addr.country,
    });
    setWantSave(false);
  };

  const handleSelectChange = (val: string) => {
    if (val === 'new') {
      setSelectedId('new');
      setFields(EMPTY);
      setWantSave(false);
    } else {
      const addr = saved.find(a => a.id === val);
      if (addr) selectSaved(addr);
    }
  };

  const update = (key: keyof AddressFields, value: string) => {
    setFields(f => ({ ...f, [key]: value }));
    // If editing a saved address, switch to "new" mode
    if (selectedId !== 'new') setSelectedId('new');
  };

  const handleSave = () => {
    if (!fields.full_name || !fields.address_line1 || !fields.city || !fields.postal_code || !fields.country) {
      return;
    }
    saveAddress.mutate({
      label: saveLabel,
      full_name: fields.full_name,
      address_line1: fields.address_line1,
      address_line2: fields.address_line2 || null,
      city: fields.city,
      state: fields.state,
      postal_code: fields.postal_code,
      country: fields.country,
      is_default: setDefault,
    });
  };

  const inputClass = "bg-white/5 border-white/10 text-primary-foreground";

  return (
    <div className="space-y-3">
      {/* Saved address selector */}
      {saved.length > 0 && (
        <div className="flex items-center gap-2">
          <div className="flex-1">
            <Label className="text-primary-foreground">Saved Addresses</Label>
            <Select value={selectedId} onValueChange={handleSelectChange}>
              <SelectTrigger className={inputClass}>
                <SelectValue placeholder="Select an address..." />
              </SelectTrigger>
              <SelectContent>
                {saved.map(a => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.label} — {a.full_name}, {a.city}{a.is_default ? ' ★' : ''}
                  </SelectItem>
                ))}
                <SelectItem value="new">+ New Address</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {selectedId !== 'new' && (
            <Button
              variant="ghost"
              size="icon"
              className="mt-5 text-red-400 hover:text-red-300"
              onClick={() => { deleteAddress.mutate(selectedId); setSelectedId('new'); setFields(EMPTY); }}
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          )}
        </div>
      )}

      {/* Structured fields */}
      <div>
        <Label className="text-primary-foreground">Full Name</Label>
        <Input value={fields.full_name} onChange={e => update('full_name', e.target.value)} placeholder="John Doe" className={inputClass} />
      </div>
      <div>
        <Label className="text-primary-foreground">Street Address</Label>
        <Input value={fields.address_line1} onChange={e => update('address_line1', e.target.value)} placeholder="123 Main St" className={inputClass} />
      </div>
      <div>
        <Label className="text-primary-foreground">Apt / Suite / Unit (optional)</Label>
        <Input value={fields.address_line2} onChange={e => update('address_line2', e.target.value)} placeholder="Apt 4B" className={inputClass} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-primary-foreground">City</Label>
          <Input value={fields.city} onChange={e => update('city', e.target.value)} placeholder="New York" className={inputClass} />
        </div>
        <div>
          <Label className="text-primary-foreground">State / Province</Label>
          <Input value={fields.state} onChange={e => update('state', e.target.value)} placeholder="NY" className={inputClass} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-primary-foreground">Postal Code</Label>
          <Input value={fields.postal_code} onChange={e => update('postal_code', e.target.value)} placeholder="10001" className={inputClass} />
        </div>
        <div>
          <Label className="text-primary-foreground">Country</Label>
          <Input value={fields.country} onChange={e => update('country', e.target.value)} placeholder="United States" className={inputClass} />
        </div>
      </div>

      {/* Save address option */}
      {selectedId === 'new' && (
        <div className="space-y-2 pt-1">
          <div className="flex items-center gap-2">
            <Checkbox id="save-addr" checked={wantSave} onCheckedChange={v => setWantSave(!!v)} />
            <label htmlFor="save-addr" className="text-sm text-primary-foreground cursor-pointer">Save this address for next time</label>
          </div>
          {wantSave && (
            <div className="flex items-center gap-2">
              <Input value={saveLabel} onChange={e => setSaveLabel(e.target.value)} placeholder="Label (e.g. Home, Work)" className={`${inputClass} flex-1`} />
              <div className="flex items-center gap-1.5">
                <Checkbox id="set-default" checked={setDefault} onCheckedChange={v => setSetDefault(!!v)} />
                <label htmlFor="set-default" className="text-xs text-primary-foreground whitespace-nowrap cursor-pointer">Default</label>
              </div>
              <Button size="sm" onClick={handleSave} disabled={saveAddress.isPending}>
                {saveAddress.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <BookmarkPlus className="w-3.5 h-3.5 mr-1" />}
                Save
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
