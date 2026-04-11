/**
 * Create Listing Drawer
 * =====================
 * Drawer for creating a new store listing with image uploads.
 */

import { useState } from 'react';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Loader2, ImagePlus, X } from 'lucide-react';
import { useCreateListing } from '@/hooks/use-stores';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { GLASS_STYLES } from '@/constants/app.constants';

const CATEGORIES = [
  { value: 'digital', label: 'Digital' },
  { value: 'merch', label: 'Merch' },
  { value: 'art', label: 'Art' },
  { value: 'service', label: 'Service' },
  { value: 'other', label: 'Other' },
];

interface Props {
  open: boolean;
  onClose: () => void;
  storeId: string;
}

export function CreateListingDrawer({ open, onClose, storeId }: Props) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [category, setCategory] = useState('other');
  const [condition, setCondition] = useState('new');
  const [isDigital, setIsDigital] = useState(false);
  const [shippingInfo, setShippingInfo] = useState('');
  const [stockQty, setStockQty] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);

  const createListing = useCreateListing();

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || images.length >= 5) return;
    setUploading(true);
    try {
      for (const file of Array.from(files).slice(0, 5 - images.length)) {
        const ext = file.name.split('.').pop();
        const path = `listings/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
        const { error } = await supabase.storage.from('store-media').upload(path, file);
        if (error) throw error;
        const { data: urlData } = supabase.storage.from('store-media').getPublicUrl(path);
        setImages(prev => [...prev, urlData.publicUrl]);
      }
    } catch (err: any) {
      toast.error('Upload failed: ' + err.message);
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = () => {
    if (!title.trim() || !price) {
      toast.error('Title and price are required');
      return;
    }
    createListing.mutate({
      store_id: storeId,
      title: title.trim(),
      description: description.trim(),
      price: Number(price),
      category,
      images,
      stock_quantity: stockQty ? Number(stockQty) : null,
      is_digital: isDigital,
      condition,
      shipping_info: shippingInfo.trim() || undefined,
      status: 'active',
    }, {
      onSuccess: () => {
        onClose();
        setTitle(''); setDescription(''); setPrice(''); setImages([]);
        setCategory('other'); setCondition('new'); setIsDigital(false);
        setShippingInfo(''); setStockQty('');
      },
    });
  };

  return (
    <Drawer open={open} onOpenChange={v => !v && onClose()}>
      <DrawerContent glass className="border-t border-white/10">
        <DrawerHeader>
          <DrawerTitle className="text-white">Create Listing</DrawerTitle>
        </DrawerHeader>
        <div className="px-4 pb-6 space-y-4 max-h-[70vh] overflow-y-auto">
          <div>
            <Label className="text-zinc-300">Title *</Label>
            <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Item name" className="bg-white/5 border-white/10 text-white placeholder:text-zinc-500" />
          </div>
          <div>
            <Label className="text-zinc-300">Description</Label>
            <Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Describe your item..." className="bg-white/5 border-white/10 text-white placeholder:text-zinc-500 min-h-[80px]" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-zinc-300">Price (USD) *</Label>
              <Input type="number" value={price} onChange={e => setPrice(e.target.value)} placeholder="0.00" className="bg-white/5 border-white/10 text-white placeholder:text-zinc-500" />
            </div>
            <div>
              <Label className="text-zinc-300">Stock Qty</Label>
              <Input type="number" value={stockQty} onChange={e => setStockQty(e.target.value)} placeholder="Unlimited" className="bg-white/5 border-white/10 text-white placeholder:text-zinc-500" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-zinc-300">Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="bg-white/5 border-white/10 text-white"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-zinc-900 border-white/10">
                  {CATEGORIES.map(c => <SelectItem key={c.value} value={c.value} className="text-white hover:bg-white/10">{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-zinc-300">Condition</Label>
              <Select value={condition} onValueChange={setCondition}>
                <SelectTrigger className="bg-white/5 border-white/10 text-white"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-zinc-900 border-white/10">
                  <SelectItem value="new" className="text-white hover:bg-white/10">New</SelectItem>
                  <SelectItem value="like_new" className="text-white hover:bg-white/10">Like New</SelectItem>
                  <SelectItem value="used" className="text-white hover:bg-white/10">Used</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Switch checked={isDigital} onCheckedChange={setIsDigital} />
            <Label className="text-zinc-300">Digital Item</Label>
          </div>
          {!isDigital && (
            <div>
              <Label className="text-zinc-300">Shipping Info</Label>
              <Input value={shippingInfo} onChange={e => setShippingInfo(e.target.value)} placeholder="e.g. Free worldwide shipping" className="bg-white/5 border-white/10 text-white placeholder:text-zinc-500" />
            </div>
          )}

          {/* Images */}
          <div>
            <Label className="text-zinc-300">Images (up to 5)</Label>
            <div className="flex flex-wrap gap-2 mt-1">
              {images.map((url, i) => (
                <div key={i} className="relative w-16 h-16 rounded-lg overflow-hidden border border-white/10">
                  <img src={url} className="w-full h-full object-cover" alt="" />
                  <button onClick={() => setImages(prev => prev.filter((_, j) => j !== i))} className="absolute top-0 right-0 bg-black/60 p-0.5 rounded-bl">
                    <X className="w-3 h-3 text-white" />
                  </button>
                </div>
              ))}
              {images.length < 5 && (
                <label className="w-16 h-16 rounded-lg border border-dashed border-white/20 flex items-center justify-center cursor-pointer hover:border-white/40 transition-colors">
                  {uploading ? <Loader2 className="w-4 h-4 animate-spin text-white" /> : <ImagePlus className="w-4 h-4 text-zinc-400" />}
                  <input type="file" accept="image/*" multiple className="hidden" onChange={handleImageUpload} disabled={uploading} />
                </label>
              )}
            </div>
          </div>

          <Button onClick={handleSubmit} disabled={createListing.isPending} className="w-full bg-white/10 hover:bg-white/20 text-white border border-white/10">
            {createListing.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            Publish Listing
          </Button>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
