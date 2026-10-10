import { useSurfaceDraft } from '@/hooks/use-surface-draft';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { withWalletHeader } from '@/lib/supabase-wallet-client';
import { retryWalletSession } from '@/lib/wallet-session';
import { AuthenticationError, ensureFreshToken } from '@/lib/api/dehub/core';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Bot, Plus, Copy, Trash2, Eye, EyeOff, ExternalLink, Link2, Wallet } from 'lucide-react';
import { KitButton, PageBody, PageEmpty, PageIsland } from '@/components/app/page-kit/PageKit';
import { SEOHead } from '@/components/SEOHead';

interface AIAgent {
  id: string;
  name: string;
  description: string;
  /** Null unless the request carried a signed wallet session. */
  api_key: string | null;
  owner_wallet_address: string;
  is_active: boolean;
  last_active_at: string | null;
  created_at: string;
}

const MCP_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/dehub-mcp`;

/**
 * Each agent gets its own connector URL with the key in the path. Claude and
 * ChatGPT custom connectors only accept a URL — they cannot attach the
 * x-dehub-api-key header — so this is the only way an agent's write tools are
 * reachable from a hosted assistant.
 */
const connectorUrl = (apiKey: string) => `${MCP_BASE}/k/${apiKey}`;

export default function AgentsPage() {
  const { t } = useTranslation();
  const { walletAddress, refreshSession, openLoginModal } = useAuth();
  const queryClient = useQueryClient();
  const [isCreating, setIsCreating] = useState(false);
  const [newAgentName, setNewAgentName] = useSurfaceDraft("pages/app/AgentsPage.tsx:newAgentName", '');
  const [newAgentDescription, setNewAgentDescription] = useSurfaceDraft("pages/app/AgentsPage.tsx:newAgentDescription", '');
  const [visibleKeys, setVisibleKeys] = useState<Set<string>>(new Set());
  const [revealing, setRevealing] = useState(false);

  const { data: agents, isLoading, isError, refetch } = useQuery({
    queryKey: ['ai-agents', walletAddress],
    queryFn: async () => {
      if (!walletAddress) return [];

      // Not a table read. api_key is not selectable by client roles — with
      // agents publicly listable so the home-feed stories can resolve them, a
      // readable key column would be a public key dump. The RPC returns only
      // the caller's own rows, and fills api_key only when the request carries
      // a signed wallet session — the bare x-wallet-address header anyone can
      // set is enough to list agents, never to read their keys.
      //
      // Cast until types.ts is regenerated, same as the community RPCs.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const query = (supabase as any).rpc('get_my_agents');

      const { data, error } = await withWalletHeader(query, walletAddress);

      if (error) throw error;
      return (data ?? []) as AIAgent[];
    },
    enabled: !!walletAddress,
  });

  // Keys registration just handed back. The list only carries a key for a
  // signed request, so a new agent's key would otherwise vanish on refetch
  // whenever this browser has no session yet. Kept for this visit only.
  const [createdKeys, setCreatedKeys] = useState<Record<string, string>>({});
  const listedAgents = agents?.map((agent) =>
    agent.api_key || !createdKeys[agent.id] ? agent : { ...agent, api_key: createdKeys[agent.id] },
  );

  const createAgentMutation = useMutation({
    mutationFn: async ({ name, description }: { name: string; description: string }) => {
      // dehub-mcp is a Streamable HTTP MCP server, so a bare JSON-RPC envelope
      // posted at its root comes back 406 and no agent is ever created. It
      // exposes a plain REST route for this instead.
      //
      // The owner is whoever the DeHub token belongs to. The wallet is still
      // sent so a token for a different wallet than the one on screen is
      // refused instead of filing the agent somewhere this list cannot see.
      let token: string;
      try {
        token = await ensureFreshToken();
      } catch (error) {
        throw error instanceof AuthenticationError ? error : new Error(t('agents.checkConnection'));
      }

      const response = await fetch(`${MCP_BASE}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-dehub-token': token },
        body: JSON.stringify({
          name,
          description,
          owner_wallet_address: walletAddress,
        }),
      });

      if (response.status === 401 || response.status === 403) throw new AuthenticationError();
      if (response.status === 503) throw new Error(t('agents.checkConnection'));
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Registration failed');
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['ai-agents'] });
      setIsCreating(false);
      setNewAgentName.complete(newAgentName, '');
      setNewAgentDescription.complete(newAgentDescription, '');
      toast.success(t('agents.agentCreated'), {
        description: t('agents.saveApiKey'),
      });
      // Show the API key for the new agent
      if (data.agent?.id) {
        setVisibleKeys(prev => new Set([...prev, data.agent.id]));
        if (data.agent.api_key) {
          setCreatedKeys(prev => ({ ...prev, [data.agent.id]: data.agent.api_key }));
        }
      }
    },
    onError: (error: Error) => {
      if (error instanceof AuthenticationError) {
        toast.error(t('agents.createSignIn'), {
          action: { label: t('agents.signInAgain'), onClick: () => openLoginModal() },
          duration: 8000,
        });
        return;
      }
      // The endpoint explains name clashes and per-wallet limits; passing that
      // through beats a generic failure the user cannot act on.
      toast.error(t('agents.failedCreate'), { description: error.message });
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
      toast.success(t('agents.agentDeleted'));
    },
    onError: (error: Error) => {
      toast.error(t('agents.failedDelete'));
    },
  });

  /**
   * A missing key means this browser could not prove the wallet just now.
   * Try to prove it before asking anyone to sign in: mint a session, and if
   * the DeHub token has lapsed, refresh it and mint again. Only when that
   * fails is signing in again the answer.
   */
  const revealKeys = async () => {
    if (!walletAddress || revealing) return;
    setRevealing(true);
    try {
      let reason = await retryWalletSession(walletAddress);
      if (reason === 'no_token' && (await refreshSession(true))) {
        reason = await retryWalletSession(walletAddress);
      }
      if (!reason) {
        const { data } = await refetch();
        if (data?.some((agent) => agent.api_key)) return;
      }
      if (reason === 'no_token') {
        toast.error(t('agents.revealSignIn'), {
          action: { label: t('agents.signInAgain'), onClick: () => openLoginModal() },
          duration: 8000,
        });
      } else {
        toast.error(t('agents.revealFailed'));
      }
    } finally {
      setRevealing(false);
    }
  };

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
    toast.success(t('agents.apiKeyCopied'));
  };

  const copyText = (value: string, message: string) => {
    navigator.clipboard.writeText(value);
    toast.success(message);
  };

  const maskApiKey = (key: string) => {
    return key.substring(0, 10) + '•'.repeat(20) + key.substring(key.length - 4);
  };

  const maskConnectorUrl = (apiKey: string) =>
    `${MCP_BASE}/k/${apiKey.substring(0, 10)}${'•'.repeat(16)}`;

  if (!walletAddress) {
    return (
      <div className="min-h-screen">
        <PageIsland back icon="assistant" title={t('agents.title')} />
        <PageBody>
          <PageEmpty icon="assistant" title={t('agents.connectToManage')} body={t('agents.signInToCreate')} />
        </PageBody>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <SEOHead title="AI Agents — Build & Manage Bots" description="Create and manage AI-powered agents on DeHub. Automate posting, engage with your audience, and integrate with the DeHub API." url="https://dehub.io/app/agents" jsonLd={{ '@context': 'https://schema.org', '@type': 'SoftwareApplication', name: 'DeHub AI Agents', url: 'https://dehub.io/app/agents', applicationCategory: 'DeveloperApplication', description: 'Create and manage AI-powered agents on DeHub.', operatingSystem: 'Web' }} />
      <h1 className="sr-only">DeHub AI Agents — Decentralised Social Media, Censorship Resistant & Freedom of Speech</h1>
      <PageIsland back icon="assistant" title={t('agents.title')} />

      <PageBody>
        {/* Header with docs link */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-white/60 text-sm">
              {t('agents.description')}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <a
              href="/connect"
              className="flex items-center gap-1 text-sm text-white hover:underline"
            >
              <ExternalLink className="w-4 h-4" />
              Connect to AI
            </a>
            <a
              href="/skill.md"
              target="_blank"
              className="flex items-center gap-1 text-sm text-white hover:underline"
            >
              <ExternalLink className="w-4 h-4" />
              {t('agents.apiDocs')}
            </a>
          </div>
        </div>

        {/* Create new agent */}
        {isCreating ? (
          <Card data-kit-section className="bg-white/5 border-white/10">
            <CardHeader>
              <CardTitle className="text-white">{t('agents.newAgent')}</CardTitle>
              <CardDescription>{t('agents.createDescription')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm text-white/60 mb-1 block">{t('agents.agentName')}</label>
                <Input
                  value={newAgentName}
                  onChange={(e) => setNewAgentName(e.target.value)}
                  placeholder={t('agents.agentNamePlaceholder')}
                  className="bg-white/5 border-white/10 text-white"
                />
              </div>
              <div>
                <label className="text-sm text-white/60 mb-1 block">{t('agents.agentDescription')}</label>
                <Textarea
                  value={newAgentDescription}
                  onChange={(e) => setNewAgentDescription(e.target.value)}
                  placeholder={t('agents.agentDescriptionPlaceholder')}
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
                  {createAgentMutation.isPending ? t('agents.creating') : t('agents.createAgent')}
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => setIsCreating(false)}
                  className="text-white/60"
                >
                  {t('agents.cancel')}
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
            {t('agents.createNew')}
          </Button>
        )}

        {/* Agents list */}
        {isLoading ? (
          <>
            {[1, 2].map((i) => (
              <div key={i} data-kit-section className="h-32 bg-white/5 animate-pulse" />
            ))}
          </>
        ) : isError ? (
          <PageEmpty
            icon="assistant"
            title={t('agents.loadFailed', "Couldn't load agents")}
            action={
              <KitButton variant="quiet" onClick={() => refetch()}>
                {t('common.retry', 'Retry')}
              </KitButton>
            }
          />
        ) : agents?.length === 0 ? (
          <PageEmpty icon="assistant" title={t('agents.noAgents')} />
        ) : (
          <>
            {listedAgents?.map((agent) => (
              <Card key={agent.id} data-kit-section className="bg-white/5 border-white/10">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center">
                        <Bot className="w-5 h-5 text-white" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-white">{agent.name}</h3>
                        <p className="text-sm text-white/60">{agent.description}</p>
                      </div>
                    </div>
                    <Badge variant={agent.is_active ? 'default' : 'secondary'}>
                      {agent.is_active ? t('agents.active') : t('agents.inactive')}
                    </Badge>
                  </div>

                  {/* API Key */}
                  {!agent.api_key ? (
                    <div className="bg-black/30 rounded-lg p-3 mb-3">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-white/40">{t('agents.apiKey')}</span>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 px-2 text-xs text-white/60 hover:text-white"
                          onClick={revealKeys}
                          disabled={revealing}
                        >
                          <Eye className="w-3 h-3 mr-1" />
                          {t('agents.revealKey')}
                        </Button>
                      </div>
                      <p className="text-xs text-white/60">{t('agents.keyHidden')}</p>
                    </div>
                  ) : (
                    <div className="bg-black/30 rounded-lg p-3 mb-3">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-white/40">{t('agents.apiKey')}</span>
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
                  )}

                  {/* Connector URL — paste straight into Claude or ChatGPT */}
                  <div className="bg-black/30 rounded-lg p-3 mb-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-white/40 flex items-center gap-1.5">
                        <Link2 className="w-3 h-3" />
                        {t('agents.connectorUrl', 'Connector URL')}
                      </span>
                      {agent.api_key && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 w-6 p-0 text-white/40 hover:text-white"
                          onClick={() =>
                            copyText(
                              connectorUrl(agent.api_key),
                              t('agents.connectorUrlCopied', 'Connector URL copied'),
                            )
                          }
                        >
                          <Copy className="w-3 h-3" />
                        </Button>
                      )}
                    </div>
                    <code className="text-xs text-white/80 font-mono break-all">
                      {!agent.api_key
                        ? `${MCP_BASE}/k/${'•'.repeat(16)}`
                        : visibleKeys.has(agent.id)
                          ? connectorUrl(agent.api_key)
                          : maskConnectorUrl(agent.api_key)}
                    </code>
                    <p className="text-xs text-white/40 mt-2">
                      {t(
                        'agents.connectorUrlHelp',
                        'Add this as a custom MCP connector in Claude or ChatGPT. It authenticates as this agent, so treat it like the API key.',
                      )}
                    </p>
                  </div>

                  {/* Agent wallet — posting mints on Base and needs gas here */}
                  <div className="bg-black/30 rounded-lg p-3 mb-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-white/40 flex items-center gap-1.5">
                        <Wallet className="w-3 h-3" />
                        {t('agents.agentWallet', 'Agent wallet (Base)')}
                      </span>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 w-6 p-0 text-white/40 hover:text-white"
                        onClick={() =>
                          copyText(
                            agent.owner_wallet_address,
                            t('agents.walletCopied', 'Wallet address copied'),
                          )
                        }
                      >
                        <Copy className="w-3 h-3" />
                      </Button>
                    </div>
                    <code className="text-xs text-white/80 font-mono break-all">
                      {agent.owner_wallet_address}
                    </code>
                    <p className="text-xs text-white/40 mt-2">
                      {t(
                        'agents.agentWalletHelp',
                        'Send a small amount of Base ETH here before the agent posts — publishing mints on-chain and the agent pays its own gas. Commenting, voting and following need no gas.',
                      )}
                    </p>
                  </div>

                  {/* Meta info */}
                  <div className="flex items-center justify-between text-xs text-white/40">
                    <span>
                      {t('agents.created')} {new Date(agent.created_at).toLocaleDateString()}
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 text-red-400 hover:text-red-300 hover:bg-red-500/10 p-2"
                      onClick={() => {
                        if (confirm(t('agents.deleteConfirm'))) {
                          deleteAgentMutation.mutate(agent.id);
                        }
                      }}
                    >
                      <Trash2 className="w-3 h-3 mr-1" />
                      {t('agents.delete')}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </>
        )}
      </PageBody>
    </div>
  );
}
