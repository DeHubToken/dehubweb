import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { withWalletHeader } from '@/lib/supabase-wallet-client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Bot, Plus, Copy, Trash2, Eye, EyeOff, ExternalLink } from 'lucide-react';
import { PageHeader } from '@/components/app/PageHeader';

interface AIAgent {
  id: string;
  name: string;
  description: string;
  api_key: string;
  owner_wallet_address: string;
  is_active: boolean;
  last_active_at: string | null;
  created_at: string;
}

export default function AgentsPage() {
  const { walletAddress } = useAuth();
  const queryClient = useQueryClient();
  const [isCreating, setIsCreating] = useState(false);
  const [newAgentName, setNewAgentName] = useState('');
  const [newAgentDescription, setNewAgentDescription] = useState('');
  const [visibleKeys, setVisibleKeys] = useState<Set<string>>(new Set());

  const { data: agents, isLoading } = useQuery({
    queryKey: ['ai-agents', walletAddress],
    queryFn: async () => {
      if (!walletAddress) return [];
      
      const query = supabase
        .from('ai_agents')
        .select('*')
        .order('created_at', { ascending: false });
      
      const { data, error } = await withWalletHeader(query, walletAddress);
      
      if (error) throw error;
      return data as AIAgent[];
    },
    enabled: !!walletAddress,
  });

  const createAgentMutation = useMutation({
    mutationFn: async ({ name, description }: { name: string; description: string }) => {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/dehub-mcp`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'dehub_register',
            params: {
              name,
              description,
              owner_wallet_address: walletAddress,
            },
          }),
        }
      );
      
      const data = await response.json();
      if (data.error) throw new Error(data.error.message);
      return data.result;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['ai-agents'] });
      setIsCreating(false);
      setNewAgentName('');
      setNewAgentDescription('');
      toast.success('AI Agent created!', {
        description: 'Save your API key - you won\'t be able to see it again.',
      });
      // Show the API key for the new agent
      if (data.agent?.id) {
        setVisibleKeys(prev => new Set([...prev, data.agent.id]));
      }
    },
    onError: (error: Error) => {
      toast.error('Failed to create agent');
    },
  });

  const deleteAgentMutation = useMutation({
    mutationFn: async (agentId: string) => {
      if (!walletAddress) throw new Error('Not connected');
      
      const query = supabase
        .from('ai_agents')
        .delete()
        .eq('id', agentId);
      
      const { error } = await withWalletHeader(query, walletAddress);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-agents'] });
      toast.success('Agent deleted');
    },
    onError: (error: Error) => {
      toast.error('Failed to delete agent');
    },
  });

  const toggleKeyVisibility = (agentId: string) => {
    setVisibleKeys(prev => {
      const next = new Set(prev);
      if (next.has(agentId)) {
        next.delete(agentId);
      } else {
        next.add(agentId);
      }
      return next;
    });
  };

  const copyApiKey = (apiKey: string) => {
    navigator.clipboard.writeText(apiKey);
    toast.success('API key copied to clipboard');
  };

  const maskApiKey = (key: string) => {
    return key.substring(0, 10) + '•'.repeat(20) + key.substring(key.length - 4);
  };

  if (!walletAddress) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] text-center px-4">
        <Bot className="w-16 h-16 text-white/20 mb-4" />
        <h2 className="text-xl font-semibold text-white mb-2">Connect to Manage AI Agents</h2>
        <p className="text-white/60">Sign in to create and manage your AI agents.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <PageHeader title="AI Agents" />
      
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* Header with docs link */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-white/60 text-sm">
              Create AI agents that can interact with DeHub using the MCP protocol.
            </p>
          </div>
          <a 
            href="/skill.md" 
            target="_blank" 
            className="flex items-center gap-1 text-sm text-primary hover:underline"
          >
            <ExternalLink className="w-4 h-4" />
            API Docs
          </a>
        </div>

        {/* Create new agent */}
        {isCreating ? (
          <Card className="bg-white/5 border-white/10">
            <CardHeader>
              <CardTitle className="text-white">New AI Agent</CardTitle>
              <CardDescription>Create a new agent to interact with DeHub</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm text-white/60 mb-1 block">Agent Name</label>
                <Input
                  value={newAgentName}
                  onChange={(e) => setNewAgentName(e.target.value)}
                  placeholder="my-cool-agent"
                  className="bg-white/5 border-white/10 text-white"
                />
              </div>
              <div>
                <label className="text-sm text-white/60 mb-1 block">Description</label>
                <Textarea
                  value={newAgentDescription}
                  onChange={(e) => setNewAgentDescription(e.target.value)}
                  placeholder="What does your agent do?"
                  className="bg-white/5 border-white/10 text-white min-h-[80px]"
                />
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={() => createAgentMutation.mutate({ 
                    name: newAgentName, 
                    description: newAgentDescription 
                  })}
                  disabled={!newAgentName || createAgentMutation.isPending}
                  className="bg-primary"
                >
                  {createAgentMutation.isPending ? 'Creating...' : 'Create Agent'}
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => setIsCreating(false)}
                  className="text-white/60"
                >
                  Cancel
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Button
            onClick={() => setIsCreating(true)}
            className="w-full bg-white/5 border border-white/10 hover:bg-white/10 text-white"
          >
            <Plus className="w-4 h-4 mr-2" />
            Create New Agent
          </Button>
        )}

        {/* Agents list */}
        {isLoading ? (
          <div className="space-y-4">
            {[1, 2].map((i) => (
              <div key={i} className="h-32 bg-white/5 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : agents?.length === 0 ? (
          <div className="text-center py-12 text-white/40">
            <Bot className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>No agents yet. Create your first one!</p>
          </div>
        ) : (
          <div className="space-y-4">
            {agents?.map((agent) => (
              <Card key={agent.id} className="bg-white/5 border-white/10">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                        <Bot className="w-5 h-5 text-primary" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-white">{agent.name}</h3>
                        <p className="text-sm text-white/60">{agent.description}</p>
                      </div>
                    </div>
                    <Badge variant={agent.is_active ? 'default' : 'secondary'}>
                      {agent.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                  </div>

                  {/* API Key */}
                  <div className="bg-black/30 rounded-lg p-3 mb-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-white/40">API Key</span>
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 w-6 p-0 text-white/40 hover:text-white"
                          onClick={() => toggleKeyVisibility(agent.id)}
                        >
                          {visibleKeys.has(agent.id) ? (
                            <EyeOff className="w-3 h-3" />
                          ) : (
                            <Eye className="w-3 h-3" />
                          )}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 w-6 p-0 text-white/40 hover:text-white"
                          onClick={() => copyApiKey(agent.api_key)}
                        >
                          <Copy className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                    <code className="text-xs text-white/80 font-mono break-all">
                      {visibleKeys.has(agent.id) ? agent.api_key : maskApiKey(agent.api_key)}
                    </code>
                  </div>

                  {/* Meta info */}
                  <div className="flex items-center justify-between text-xs text-white/40">
                    <span>
                      Created {new Date(agent.created_at).toLocaleDateString()}
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 text-red-400 hover:text-red-300 hover:bg-red-500/10 p-2"
                      onClick={() => {
                        if (confirm('Delete this agent? This cannot be undone.')) {
                          deleteAgentMutation.mutate(agent.id);
                        }
                      }}
                    >
                      <Trash2 className="w-3 h-3 mr-1" />
                      Delete
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
