/**
 * Edit Listing Drawer
 * ====================
 * Drawer for editing an existing store listing.
 */

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Loader2, ImagePlus, X } from 'lucide-react';
import { useUpdateListing } from '@/hooks/use-stores';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const CATEGORIES = [
  { value: 'digital', labelKey: 'stores.catDigital' },
  { value: 'merch', labelKey: 'stores.catMerch' },
  { value: 'art', labelKey: 'stores.catArt' },
  { value: 'service', labelKey: 'stores.catService' },
  { value: 'other', labelKey: 'stores.catOther' },
];

interface Props {
  open: boolean;
  onClose: () => void;
  listing: any;
}

export function EditListingDrawer({ open, onClose, listing }: Props) {
  const { t } = useTranslation();
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

  const updateListing = useUpdateListing();

  useEffect(() => {
    if (listing && open) {
      setTitle(listing.title || '');
      setDescription(listing.description || '');
      setPrice(String(listing.price || ''));
      setCategory(listing.category || 'other');
      setCondition(listing.condition || 'new');
      setIsDigital(listing.is_digital || false);
      setShippingInfo(listing.shipping_info || '');
      setStockQty(listing.stock_quantity != null ? String(listing.stock_quantity) : '');
      setImages((listing.images as string[]) || []);
    }
  }, [listing, open]);

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
      toast.error(t('stores.uploadFailedWith', { message: err.message }));
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = () => {
    if (!title.trim() || !price) {
      toast.error(t('stores.titlePriceRequired'));
      return;
    }
    updateListing.mutate({
      id: listing.id,
      title: title.trim(),
      description: description.trim(),
      price: Number(price),
      category,
      images,
      stock_quantity: stockQty ? Number(stockQty) : null,
      is_digital: isDigital,
      condition,
      shipping_info: shippingInfo.trim() || null,
    }, {
      onSuccess: () => {
        toast.success(t('stores.listingUpdated'));
        onClose();
      },
    });
  };

  return (
    <Drawer open={open} onOpenChange={v => !v && onClose()}>
      <DrawerContent column glass className="border-t border-white/10">
        <DrawerHeader>
          <DrawerTitle className="text-white">{t('stores.editListing')}</DrawerTitle>
        </DrawerHeader>
        <div className="px-4 pb-6 space-y-4 max-h-[70vh] overflow-y-auto">
          <div>
            <Label className="text-zinc-300">{t('stores.titleLabel')}</Label>
            <Input value={title} onChange={e => setTitle(e.target.value)} placeholder={t('stores.titlePlaceholder')} className="bg-white/5 border-white/10 text-white placeholder:text-zinc-500" />
          </div>
          <div>
            <Label className="text-zinc-300">{t('stores.descriptionLabel')}</Label>
            <Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder={t('stores.describePlaceholder')} className="bg-white/5 border-white/10 text-white placeholder:text-zinc-500 min-h-[80px]" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-zinc-300">{t('stores.priceLabel')}</Label>
              <Input type="number" value={price} onChange={e => setPrice(e.target.value)} placeholder={t('stores.pricePlaceholder')} className="bg-white/5 border-white/10 text-white placeholder:text-zinc-500" />
            </div>
            <div>
              <Label className="text-zinc-300">{t('stores.stockLabel')}</Label>
              <Input type="number" value={stockQty} onChange={e => setStockQty(e.target.value)} placeholder={t('stores.stockPlaceholder')} className="bg-white/5 border-white/10 text-white placeholder:text-zinc-500" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-zinc-300">{t('stores.categoryLabel')}</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="bg-white/5 border-white/10 text-white"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-zinc-900 border-white/10">
                  {CATEGORIES.map(c => <SelectItem key={c.value} value={c.value} className="text-white hover:bg-white/10">{t(c.labelKey)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-zinc-300">{t('stores.conditionLabel')}</Label>
              <Select value={condition} onValueChange={setCondition}>
                <SelectTrigger className="bg-white/5 border-white/10 text-white"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-zinc-900 border-white/10">
                  <SelectItem value="new" className="text-white hover:bg-white/10">{t('stores.condNew')}</SelectItem>
                  <SelectItem value="like_new" className="text-white hover:bg-white/10">{t('stores.condLikeNew')}</SelectItem>
                  <SelectItem value="used" className="text-white hover:bg-white/10">{t('stores.condUsed')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <label className="flex items-center gap-3 cursor-pointer">
            <Switch checked={isDigital} onCheckedChange={setIsDigital} />
            <Label className="text-zinc-300 cursor-pointer">{t('stores.digitalItem')}</Label>
          </label>
          {!isDigital && (
            <div>
              <Label className="text-zinc-300">{t('stores.shippingInfo')}</Label>
              <Input value={shippingInfo} onChange={e => setShippingInfo(e.target.value)} placeholder={t('stores.shippingInfoPlaceholder')} className="bg-white/5 border-white/10 text-white placeholder:text-zinc-500" />
            </div>
          )}

          <div>
            <Label className="text-zinc-300">{t('stores.imagesLabel')}</Label>
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

          <Button onClick={handleSubmit} disabled={updateListing.isPending} className="w-full bg-white/10 hover:bg-white/20 text-white border border-white/10">
            {updateListing.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            {t('stores.saveListing')}
          </Button>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
