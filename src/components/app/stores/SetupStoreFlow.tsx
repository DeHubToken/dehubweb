/**
 * Setup Store Flow
 * ================
 * One-time store creation form.
 */

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Store, Loader2 } from 'lucide-react';
import { useCreateStore } from '@/hooks/use-stores';

export function SetupStoreFlow() {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const createStore = useCreateStore();

  const handleCreate = () => {
    if (!name.trim()) return;
    createStore.mutate({ name: name.trim(), description: description.trim() });
  };

  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 max-w-md mx-auto space-y-6">
      <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
        <Store className="w-8 h-8 text-primary" />
      </div>
      <div className="text-center space-y-2">
        <h2 className="text-xl font-bold text-foreground">Set up your Store</h2>
        <p className="text-sm text-muted-foreground">Create your store to start selling items. You can list physical goods, digital items, art, and services.</p>
      </div>
      <div className="w-full space-y-3">
        <div>
          <Label>Store Name *</Label>
          <Input value={name} onChange={e => setName(e.target.value)} placeholder="My Store" className="bg-white/5 border-white/10" />
        </div>
        <div>
          <Label>Description</Label>
          <Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="What do you sell?" className="bg-white/5 border-white/10" />
        </div>
        <Button onClick={handleCreate} disabled={!name.trim() || createStore.isPending} className="w-full">
          {createStore.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
          Create Store
        </Button>
      </div>
    </div>
  );
}
