import { useState, useEffect, useCallback } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useSavedAddresses, useSaveAddress, useDeleteAddress, type SavedAddress } from '@/hooks/use-saved-addresses';
import { BookmarkPlus, Trash2, Loader2, Check, MapPin } from 'lucide-react';
import { toast } from 'sonner';

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
  const [isDefault, setIsDefault] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [initialized, setInitialized] = useState(false);

  // Auto-select default address on first load
  useEffect(() => {
    if (!initialized && saved.length > 0) {
      const def = saved.find(a => a.is_default) || saved[0];
      selectSaved(def);
      setInitialized(true);
    }
  }, [saved, initialized]);

  // Emit formatted address on change
  useEffect(() => {
    const parts = [fields.full_name, fields.address_line1, fields.address_line2, fields.city, fields.state, fields.postal_code, fields.country].filter(Boolean);
    onChange(parts.join(', '));
  }, [fields]);

  // After save succeeds, auto-select the newly saved address
  useEffect(() => {
    if (justSaved && saved.length > 0) {
      const newest = saved[saved.length - 1];
      // Find the one matching our current fields
      const match = saved.find(a =>
        a.full_name === fields.full_name &&
        a.address_line1 === fields.address_line1 &&
        a.city === fields.city
      );
      if (match) {
        setSelectedId(match.id);
        setWantSave(false);
        setJustSaved(false);
      }
    }
  }, [saved, justSaved]);

  const selectSaved = useCallback((addr: SavedAddress) => {
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
  }, []);

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
    if (selectedId !== 'new') setSelectedId('new');
  };

  const handleSave = () => {
    if (!fields.full_name || !fields.address_line1 || !fields.city || !fields.postal_code || !fields.country) {
      toast.error('Please fill in all required fields');
      return;
    }
    setJustSaved(true);
    saveAddress.mutate({
      label: saveLabel || 'Home',
      full_name: fields.full_name,
      address_line1: fields.address_line1,
      address_line2: fields.address_line2 || null,
      city: fields.city,
      state: fields.state,
      postal_code: fields.postal_code,
      country: fields.country,
      is_default: isDefault,
    });
  };

  const handleDelete = (id: string) => {
    deleteAddress.mutate(id);
    setSelectedId('new');
    setFields(EMPTY);
  };

  const inputClass = "bg-white/5 border-white/10 text-primary-foreground placeholder:text-primary-foreground/50";
  const checkboxClass = "border-white/30 data-[state=checked]:bg-white data-[state=checked]:text-black focus-visible:ring-0 focus-visible:ring-offset-0";

  return (
    <div className="space-y-3">
      <Label className="text-primary-foreground font-semibold">Shipping Address</Label>

      {saved.length > 0 && (
        <div className="flex items-center gap-2">
          <div className="flex-1">
            <Select value={selectedId} onValueChange={handleSelectChange}>
              <SelectTrigger className={`${inputClass} [&>svg]:text-primary-foreground [&>span]:text-primary-foreground`}>
                <SelectValue placeholder="Select a saved address..." />
              </SelectTrigger>
              <SelectContent className="text-primary-foreground">
                {saved.map(a => (
                  <SelectItem key={a.id} value={a.id} className="text-primary-foreground focus:bg-white/10 focus:text-primary-foreground">
                    <span className="flex items-center gap-1.5 text-primary-foreground">
                      {a.is_default && <MapPin className="w-3.5 h-3.5 text-primary-foreground shrink-0" />}
                      <span className="font-medium text-primary-foreground">{a.label}</span>
                      <span className="text-primary-foreground/70">— {a.full_name}, {a.address_line1}, {a.city}</span>
                    </span>
                  </SelectItem>
                ))}
                <SelectItem value="new" className="text-primary-foreground focus:bg-white/10 focus:text-primary-foreground">
                  <span className="text-primary-foreground">+ Enter new address</span>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          {selectedId !== 'new' && (
            <Button
              variant="ghost"
              size="icon"
              className="text-destructive hover:text-destructive/80"
              onClick={() => handleDelete(selectedId)}
              disabled={deleteAddress.isPending}
            >
              {deleteAddress.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
            </Button>
          )}
        </div>
      )}

      {/* Structured fields */}
      <div>
        <Label className="text-primary-foreground text-xs">Full Name *</Label>
        <Input value={fields.full_name} onChange={e => update('full_name', e.target.value)} placeholder="John Doe" className={inputClass} />
      </div>
      <div>
        <Label className="text-primary-foreground text-xs">Street Address *</Label>
        <Input value={fields.address_line1} onChange={e => update('address_line1', e.target.value)} placeholder="123 Main St" className={inputClass} />
      </div>
      <div>
        <Label className="text-primary-foreground text-xs">Apt / Suite / Unit</Label>
        <Input value={fields.address_line2} onChange={e => update('address_line2', e.target.value)} placeholder="Apt 4B" className={inputClass} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-primary-foreground text-xs">City *</Label>
          <Input value={fields.city} onChange={e => update('city', e.target.value)} placeholder="New York" className={inputClass} />
        </div>
        <div>
          <Label className="text-primary-foreground text-xs">State / Province</Label>
          <Input value={fields.state} onChange={e => update('state', e.target.value)} placeholder="NY" className={inputClass} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-primary-foreground text-xs">Postal Code *</Label>
          <Input value={fields.postal_code} onChange={e => update('postal_code', e.target.value)} placeholder="10001" className={inputClass} />
        </div>
        <div>
          <Label className="text-primary-foreground text-xs">Country *</Label>
          <Input value={fields.country} onChange={e => update('country', e.target.value)} placeholder="United States" className={inputClass} />
        </div>
      </div>

      {/* Save address — only for new/edited addresses */}
      {selectedId === 'new' && (
        <div className="rounded-lg border border-white/10 bg-white/5 p-3 space-y-2">
          <div className="flex items-center gap-2">
            <Checkbox id="save-addr" className={checkboxClass} checked={wantSave} onCheckedChange={v => setWantSave(!!v)} />
            <label htmlFor="save-addr" className="text-sm text-primary-foreground cursor-pointer">Save this address for next time</label>
          </div>
          {wantSave && (
            <div className="space-y-2 animate-in fade-in slide-in-from-top-1 duration-200">
              <div className="flex items-center gap-2">
                <Input
                  value={saveLabel}
                  onChange={e => setSaveLabel(e.target.value)}
                  placeholder="Label (e.g. Home, Work)"
                  className={`${inputClass} flex-1 h-8 text-sm`}
                />
                <div className="flex items-center gap-1.5">
                  <Checkbox id="set-default" className={checkboxClass} checked={isDefault} onCheckedChange={v => setIsDefault(!!v)} />
                  <label htmlFor="set-default" className="text-xs text-primary-foreground whitespace-nowrap cursor-pointer">Default</label>
                </div>
              </div>
              <Button
                size="sm"
                onClick={handleSave}
                disabled={saveAddress.isPending || saveAddress.isSuccess}
                className="w-full"
              >
                {saveAddress.isPending ? (
                  <><Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> Saving...</>
                ) : saveAddress.isSuccess && justSaved ? (
                  <><Check className="w-3.5 h-3.5 mr-1.5" /> Saved!</>
                ) : (
                  <><BookmarkPlus className="w-3.5 h-3.5 mr-1.5" /> Save Address</>
                )}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
