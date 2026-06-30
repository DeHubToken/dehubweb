import React from 'react';
import { createSanitizedHtml, processLineForHtml } from './contentUtils';

interface BlockRendererProps {
  block: string;
  index: number;
}

export const BlockRenderer: React.FC<BlockRendererProps> = ({ block, index }) => {
  block = block.trim();
  if (!block) return null;
  
  // Check for Strategic Shift blog post FIRST - before any other processing
  if (window.location.pathname.includes('strategic-shift-discontinuing-ethereum-mainnet-support-for-dhb')) {
    // For the strategic shift post, render the new comprehensive content ONLY ONCE
    // Skip all other processing to avoid duplication
    if (index === 0) {
      return (
        <div key={index} className="space-y-8">
          <div className="p-8 bg-gradient-to-r from-blue-50 to-cyan-50 rounded-xl border border-sky-blue/30 shadow-lg">
            <h2 className="text-2xl font-bold text-royal-blue mb-6 font-exo flex items-center">
              🚀 Why we're pivoting from Ethereum L1
            </h2>
            <p className="text-royal-blue/80 mb-6 leading-relaxed font-exo text-lg">
              Ethereum thought leaders—including the Ethereum Foundation and Vitalik Buterin—have been clear: scaling must happen via Layer 2, not by bloating the base chain. Vitalik has emphasized that modern rollups now scale Ethereum by ~17× while slashing fees by a similar margin, and that "layer‑2‑centric ecosystems" are essential for a pluralistic, decentralized future.
            </p>
            <p className="text-royal-blue/80 mb-6 leading-relaxed font-exo text-lg">
              His 2025 roadmap reinforces that continued investment in L2 is crucial, both technically and socially.
            </p>
            <p className="text-royal-blue/80 leading-relaxed font-exo text-lg">
              From an app development POV, this is a green light: focus on fastest, cheapest, most vibrant networks—especially Coinbase's Base, the dominant L2 that processes ~40% of all Ethereum Layer 2 activity.
            </p>
          </div>

          <div className="p-8 bg-gradient-to-r from-green-50 to-emerald-50 rounded-xl border border-emerald-200 shadow-lg">
            <h2 className="text-2xl font-bold text-royal-blue mb-6 font-exo flex items-center">
              🎯 DHB's consumer-first approach: Why Base makes sense
            </h2>
            <p className="text-royal-blue/80 mb-6 leading-relaxed font-exo text-lg">
              As a consumer-facing product, DHB must run where users already are—where transactions are near-instant, gas fees are negligible, and wallet friction is minimal. Base checks all these boxes:
            </p>
            
            <div className="space-y-4">
              <div className="bg-white/60 p-6 rounded-lg">
                <h4 className="font-semibold text-royal-blue mb-3 font-exo">⚡ Speed & Cost</h4>
                <p className="text-royal-blue/70 text-sm font-exo">
                  Upgrades targeting 200ms confirmations and sub-$0.01 fees
                </p>
              </div>
              
              <div className="bg-white/60 p-6 rounded-lg">
                <h4 className="font-semibold text-royal-blue mb-3 font-exo">📈 Mass Adoption</h4>
                <p className="text-royal-blue/70 text-sm font-exo">
                  ~4.6 million weekly active addresses—{'>'}50% of overall L2 usage
                </p>
              </div>
              
              <div className="bg-white/60 p-6 rounded-lg">
                <h4 className="font-semibold text-royal-blue mb-3 font-exo">🔗 Coinbase Ecosystem</h4>
                <p className="text-royal-blue/70 text-sm font-exo">
                  Users see Base and its tokens directly in their Coinbase wallets and can onboard instantly
                </p>
              </div>
            </div>
            
            <p className="text-royal-blue/80 mt-6 leading-relaxed font-exo text-lg italic">
              This natural ecosystem synergy makes Base the logical primary chain for DHB.
            </p>
          </div>

          <div className="p-8 bg-gradient-to-r from-purple-50 to-indigo-50 rounded-xl border border-purple-200 shadow-lg">
            <h2 className="text-2xl font-bold text-royal-blue mb-6 font-exo flex items-center">
              🌊 Solana: next on our radar
            </h2>
            <p className="text-royal-blue/80 leading-relaxed font-exo text-lg">
              Although Base is our initial focus, we're keeping Solana squarely on the roadmap. Its high-throughput, low-latency design complements Base's strengths, and a recent listing on Coinbase opens more seamless integration paths. Solana's vibrant DeFi and NFT ecosystems—combined with Coinbase's support—make it a powerful second leg for DHB's multi-chain ambitions.
            </p>
          </div>

          <div className="p-8 bg-gradient-to-r from-yellow-50 to-amber-50 rounded-xl border border-amber-200 shadow-lg">
            <h2 className="text-2xl font-bold text-royal-blue mb-6 font-exo flex items-center">
              💸 Fueling growth: more LP, investment & campaigns ahead
            </h2>
            <p className="text-royal-blue/80 mb-6 leading-relaxed font-exo text-lg">
              With a realigned chain strategy, we're doubling down on:
            </p>
            
            <div className="grid md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div className="bg-white/60 p-6 rounded-lg">
                  <h4 className="font-semibold text-royal-blue mb-3 font-exo">💧 Liquidity provisioning</h4>
                  <p className="text-royal-blue/70 text-sm font-exo">
                    Partnering with leading AMMs on Base (e.g. Uniswap v4, Sushi) to bootstrap organic depth.
                  </p>
                </div>
                
                <div className="bg-white/60 p-6 rounded-lg">
                  <h4 className="font-semibold text-royal-blue mb-3 font-exo">💰 Capital injection</h4>
                  <p className="text-royal-blue/70 text-sm font-exo">
                    Deploying treasury funds and leveraging Coinbase Ventures to support incentives and token unlocks.
                  </p>
                </div>
              </div>
              
              <div className="space-y-4">
                <div className="bg-white/60 p-6 rounded-lg">
                  <h4 className="font-semibold text-royal-blue mb-3 font-exo">👥 User acquisition</h4>
                  <p className="text-royal-blue/70 text-sm font-exo">
                    Launching targeted campaigns—DEX onboarding rewards, wallet connection bonuses, cross-chain bridge credits—to boost both DAU and volume.
                  </p>
                </div>
                
                <div className="bg-white/60 p-6 rounded-lg">
                  <h4 className="font-semibold text-royal-blue mb-3 font-exo">🛠️ Developer engagement</h4>
                  <p className="text-royal-blue/70 text-sm font-exo">
                    Hackathons, grants, and tool integrations to build on Base (and later Solana) via DHB-native SDKs.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="p-8 bg-gradient-to-r from-royal-blue/10 to-middle-blue/10 rounded-xl border border-royal-blue/20 shadow-lg">
            <h2 className="text-2xl font-bold text-royal-blue mb-6 font-exo flex items-center">
              🔭 Looking forward
            </h2>
            <p className="text-royal-blue/80 mb-6 leading-relaxed font-exo text-lg">
              By discontinuing Ethereum Mainnet support, we're enabling DHB to:
            </p>
            
            <div className="space-y-4 mb-6">
              <div className="bg-white/40 p-6 rounded-lg">
                <h4 className="font-semibold text-royal-blue mb-2 font-exo">⚡ Focus on performance</h4>
                <p className="text-royal-blue/70 text-sm font-exo">
                  Fastest and cheapest network with zero L1 baggage
                </p>
              </div>
              
              <div className="bg-white/40 p-6 rounded-lg">
                <h4 className="font-semibold text-royal-blue mb-2 font-exo">🌊 Ride the L2 wave</h4>
                <p className="text-royal-blue/70 text-sm font-exo">
                  Following the ecosystem's leader (Base) and trusted roadmap pushed by Vitalik and others
                </p>
              </div>
              
              <div className="bg-white/40 p-6 rounded-lg">
                <h4 className="font-semibold text-royal-blue mb-2 font-exo">🔄 Stay flexible</h4>
                <p className="text-royal-blue/70 text-sm font-exo">
                  Ready to add Solana and beyond where user value is proven
                </p>
              </div>
            </div>
            
            <div className="pt-6 border-t border-royal-blue/30">
              <p className="text-royal-blue/80 font-exo text-lg leading-relaxed">
                This is more than a technical shift—it's a strategic step to align DHB with the future of consumer crypto. We're excited to scale smarter, faster, and more cost‑effectively. <strong>The next chapter starts on Base… stay tuned.</strong>
              </p>
            </div>
          </div>
        </div>
      );
    }
    // Return null for all other blocks to prevent duplication
    return null;
  }

  const lines = block.split('\n');
  const firstLine = lines[0].trim();

  // Headers
  if (firstLine.startsWith('# ')) {
    return null;
  }
  if (firstLine.startsWith('## ')) {
    return null;
  }
  if (firstLine.startsWith('#### ')) {
    const heading = <h4 key={`${index}-h`} className="text-lg font-bold text-royal-blue mb-2 mt-6 font-exo">{firstLine.slice(5)}</h4>;
    const remainingLines = lines.slice(1).join('\n').trim();
    if (remainingLines) {
      const processedContent = processLineForHtml(remainingLines.replace(/\n/g, ' '));
      const paragraph = <p key={`${index}-p`} className="text-royal-blue/80 mb-4 leading-relaxed font-exo" dangerouslySetInnerHTML={createSanitizedHtml(processedContent)} />;
      return [heading, paragraph];
    }
    return heading;
  }
  if (firstLine.startsWith('### ')) {
    const heading = <h3 key={`${index}-h`} className="text-xl font-bold text-royal-blue mb-3 mt-8 font-exo">{firstLine.slice(4)}</h3>;
    const remainingLines = lines.slice(1).join('\n').trim();
    if (remainingLines) {
      const processedContent = processLineForHtml(remainingLines.replace(/\n/g, ' '));
      const paragraph = <p key={`${index}-p`} className="text-royal-blue/80 mb-4 leading-relaxed font-exo" dangerouslySetInnerHTML={createSanitizedHtml(processedContent)} />;
      return [heading, paragraph];
    }
    return heading;
  }

  // Image tag
  if (firstLine.startsWith('![')) {
    const match = firstLine.match(/!\[(.*?)\]\((.*?)\)/);
    if (match) {
      const altAndStyle = match[1];
      const src = match[2];
      const parts = altAndStyle.split('|');
      const alt = parts[0].trim();
      const style = parts.length > 1 ? parts[1].trim() : 'default';
      if (style === 'avatar') {
        return <img key={index} src={src} alt={alt} className="w-24 h-24 rounded-full object-cover my-6 mx-auto block shadow-md" />;
      }
      return null;
    }
  }

  // Unordered List
  if (lines.every(line => line.trim().startsWith('- ') || line.trim().startsWith('• '))) {
    return (
      <ul key={index} className="list-disc list-outside space-y-2 mb-4 font-exo text-royal-blue/80 pl-6">
        {lines.map((item, i) => {
          const content = item.trim().slice(2);
          const processedContent = processLineForHtml(content);
          return <li key={i} dangerouslySetInnerHTML={createSanitizedHtml(processedContent)} />;
        })}
      </ul>
    );
  }

  // Ordered List
  if (lines.every(line => /^\d+\./.test(line.trim()))) {
    return (
      <ol key={index} className="list-decimal list-outside space-y-2 mb-4 font-exo text-royal-blue/80 pl-6">
        {lines.map((item, i) => {
          const content = item.trim().replace(/^\d+\.\s/, '');
          const processedContent = processLineForHtml(content);
          return <li key={i} dangerouslySetInnerHTML={createSanitizedHtml(processedContent)} />;
        })}
      </ol>
    );
  }

  // Check if this is the live streaming blog post and add specific content
  if (window.location.pathname.includes('interactive-streaming-on-chain-live-streams-with-animated-tips')) {
    // If this is an empty paragraph, populate it with live streaming content
    if (block.trim() === '' || block.trim().length < 50) {
      return (
        <div key={index} className="space-y-6">
          <div className="p-6 bg-gradient-to-r from-purple-50 to-blue-50 rounded-lg border border-sky-blue/20">
            <h3 className="text-xl font-bold text-royal-blue mb-4 font-exo">Revolutionary Live Streaming Experience</h3>
            <p className="text-royal-blue/80 mb-4 leading-relaxed font-exo">
              DeHub's live streaming platform transforms traditional broadcasting into an <strong>interactive, monetized experience</strong> where creators and audiences engage through real-time tipping, animated reactions, and blockchain-powered rewards. Our streaming infrastructure supports unlimited concurrent viewers while maintaining the personal connection that makes live content special.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            <div className="p-6 bg-gradient-to-r from-green-50 to-cyan-50 rounded-lg border border-sky-blue/20">
              <h4 className="text-lg font-bold text-royal-blue mb-3 font-exo">🎬 Professional Streaming Tools</h4>
              <ul className="text-royal-blue/80 text-sm font-exo space-y-2">
                <li>• 4K streaming support with adaptive bitrate</li>
                <li>• Multi-camera angle switching</li>
                <li>• Screen sharing and presentation mode</li>
                <li>• Real-time chat moderation tools</li>
                <li>• Stream recording and highlights</li>
              </ul>
            </div>

            <div className="p-6 bg-gradient-to-r from-pink-50 to-purple-50 rounded-lg border border-sky-blue/20">
              <h4 className="text-lg font-bold text-royal-blue mb-3 font-exo">💰 Monetization Features</h4>
              <ul className="text-royal-blue/80 text-sm font-exo space-y-2">
                <li>• Real-time DHB token tipping</li>
                <li>• Animated tip notifications</li>
                <li>• Subscriber-only streams</li>
                <li>• Pay-per-view premium content</li>
                <li>• Revenue sharing with moderators</li>
              </ul>
            </div>
          </div>

          <div className="p-6 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg border border-sky-blue/20">
            <h3 className="text-xl font-bold text-royal-blue mb-4 font-exo">Interactive Engagement System</h3>
            <p className="text-royal-blue/80 mb-4 leading-relaxed font-exo">
              Our streaming platform features <strong>animated tip reactions</strong> that appear in real-time during broadcasts. When viewers send DHB tips, custom animations overlay the stream, creating visual excitement and encouraging further engagement. Tip amounts trigger different animation styles - from subtle sparkles for small tips to dramatic fireworks for large donations.
            </p>
            
            <div className="space-y-3">
              <div className="bg-white/50 p-4 rounded-lg">
                <h5 className="font-semibold text-royal-blue mb-2 font-exo">Smart Tip Animations</h5>
                <p className="text-royal-blue/70 text-sm font-exo">
                  Dynamic visual effects scale with tip amounts: 1-10 DHB triggers particle effects, 11-50 DHB creates screen-wide animations, 50+ DHB launches spectacular celebrations that dominate the stream.
                </p>
              </div>
              
              <div className="bg-white/50 p-4 rounded-lg">
                <h5 className="font-semibold text-royal-blue mb-2 font-exo">Custom Emote Integration</h5>
                <p className="text-royal-blue/70 text-sm font-exo">
                  Creators can upload custom emotes and animations that activate with specific tip amounts, creating personalized experiences that strengthen community bonds and brand identity.
                </p>
              </div>
            </div>
          </div>

          <div className="p-6 bg-gradient-to-r from-yellow-50 to-orange-50 rounded-lg border border-sky-blue/20">
            <h3 className="text-xl font-bold text-royal-blue mb-4 font-exo">Decentralized Infrastructure Benefits</h3>
            <p className="text-royal-blue/80 mb-4 leading-relaxed font-exo">
              Built on decentralized video infrastructure, our streaming platform offers <strong>unprecedented reliability and cost efficiency</strong>. Unlike centralized platforms that can experience downtime or impose arbitrary restrictions, DeHub's distributed network ensures your stream stays live and your content remains accessible globally.
            </p>
            
            <div className="grid md:grid-cols-2 gap-4">
              <div className="bg-white/50 p-4 rounded-lg">
                <h5 className="font-semibold text-royal-blue mb-2 font-exo">Global CDN Distribution</h5>
                <p className="text-royal-blue/70 text-sm font-exo">
                  Streams automatically route through the nearest decentralized nodes, ensuring minimal latency and maximum quality for viewers worldwide.
                </p>
              </div>
              
              <div className="bg-white/50 p-4 rounded-lg">
                <h5 className="font-semibold text-royal-blue mb-2 font-exo">Censorship Resistance</h5>
                <p className="text-royal-blue/70 text-sm font-exo">
                  Decentralized infrastructure means no single authority can shut down your stream, protecting creator freedom and audience access.
                </p>
              </div>
            </div>
          </div>

          <div className="p-6 bg-gradient-to-r from-royal-blue/10 to-middle-blue/10 rounded-xl border border-royal-blue/20">
            <h3 className="text-xl font-bold text-royal-blue mb-4 font-exo">Advanced Analytics & Community Building</h3>
            <p className="text-royal-blue/80 mb-4 leading-relaxed font-exo">
              Every stream generates detailed analytics about viewer engagement, tip patterns, peak viewing times, and audience demographics. This data helps creators optimize their content strategy while our community tools facilitate deeper connections between streamers and their most dedicated supporters.
            </p>
            
            <div className="pt-4 border-t border-royal-blue/30">
              <p className="text-royal-blue/80 font-exo text-sm italic">
                Experience the future of live streaming where every moment is interactive, every tip is celebrated, and every creator has the tools to build a thriving community around their passion.
              </p>
            </div>
          </div>
        </div>
      );
    }
  }

  // Check if this is the DeHub Card blog post and add silver card image after Card Variants
  if (window.location.pathname.includes('off-ramp-service-revealed-dehub-card-coming-soon')) {
    // Add silver card image after "💳 Each card is designed with crypto users in mind" paragraph
    if (block.includes('💳 Each card is designed with crypto users in mind')) {
      const processedContent = processLineForHtml(block.replace(/\n/g, ' '));
      return [
        <p key={index} className="text-royal-blue/80 mb-4 leading-relaxed font-exo" dangerouslySetInnerHTML={createSanitizedHtml(processedContent)} />,
        <div key={`${index}-card-image`} className="my-8 rounded-xl overflow-hidden">
          <img 
            src="/lovable-uploads/82928389-9659-4117-8bbe-351a68241694.png" 
            alt="DeHub Card in premium silver finish showcasing modern crypto payment solution" 
            className="w-full h-auto object-cover"
          />
        </div>
      ];
    }

    // Add new card image near the end of the blog post (2 paragraphs from bottom)
    if (block.includes('This is just the beginning of our comprehensive financial services ecosystem')) {
      const processedContent = processLineForHtml(block.replace(/\n/g, ' '));
      return [
        <p key={index} className="text-royal-blue/80 mb-4 leading-relaxed font-exo" dangerouslySetInnerHTML={createSanitizedHtml(processedContent)} />,
        <div key={`${index}-card-stack-image`} className="my-8 rounded-xl overflow-hidden">
          <img 
            src="/lovable-uploads/dd33f339-f2d6-46ac-9e87-98b96f3060ca.png" 
            alt="Stack of DeHub Cards showing multiple card variants in elegant presentation" 
            className="w-full h-auto object-cover"
          />
        </div>
      ];
    }
  }

  // Check for flagship game blog post and add airdrop calculator
  if (window.location.pathname.includes('dehub-flagship-game-launch-partner-airdrop')) {
    // If this is the paragraph containing the calculator link
    if (block.includes('Check your allocations here: https://lastchadstanding.com/docs#airdrop-calculator')) {
      return [
        <div key={`${index}-airdrop-calculator`} className="my-8 rounded-xl overflow-hidden">
          <img 
            src="/lovable-uploads/79082851-6427-4cc2-847b-a7780deb8f44.png" 
            alt="DeHub Airdrop Calculator interface showing allocation calculations" 
            className="w-full h-auto object-cover"
          />
        </div>,
        <p key={`${index}-calculator-text`} className="text-royal-blue/80 mb-4 leading-relaxed font-exo">
          Check your allocations here: <a href="https://lastchadstanding.com/docs#airdrop-calculator" target="_blank" rel="noopener noreferrer" className="text-middle-blue hover:text-royal-blue transition-colors underline">https://lastchadstanding.com/docs#airdrop-calculator</a>
        </p>
      ];
    }
    // If this is the paragraph containing "The last Chad always stands tall"
    if (block.includes('The last Chad always stands tall')) {
      const processedContent = processLineForHtml(block.replace(/\n/g, ' '));
      return [
        <p key={index} className="text-royal-blue/80 mb-4 leading-relaxed font-exo" dangerouslySetInnerHTML={createSanitizedHtml(processedContent)} />,
        <div key={`${index}-airdrop-calculator`} className="my-8 rounded-xl overflow-hidden">
          <img 
            src="/lovable-uploads/d306700c-5d81-4ec5-8010-864d72d705a2.png" 
            alt="DeHub Airdrop Calculator interface showing allocation calculations" 
            className="w-full h-auto object-cover"
          />
        </div>,
        <p key={`${index}-calculator-text`} className="text-royal-blue/80 mb-4 leading-relaxed font-exo">
          Check your allocations here: <a href="https://lastchadstanding.com/docs#airdrop-calculator" target="_blank" rel="noopener noreferrer" className="text-middle-blue hover:text-royal-blue transition-colors underline">https://lastchadstanding.com/docs#airdrop-calculator</a>
        </p>
      ];
    }
  }

  // Default to paragraph
  const processedContent = processLineForHtml(block.replace(/\n/g, ' '));
  return <p key={index} className="text-royal-blue/80 mb-4 leading-relaxed font-exo" dangerouslySetInnerHTML={createSanitizedHtml(processedContent)} />;
};
