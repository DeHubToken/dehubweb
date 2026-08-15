import React from 'react';
import { createSanitizedHtml, processLineForHtml } from './contentUtils';

interface BlockRendererProps {
  block: string;
  index: number;
}

export const BlockRenderer: React.FC<BlockRendererProps> = ({ block, index }) => {
  block = block.trim();
  if (!block) return null;
  
  // The strategic-shift post used to be rendered here as a slab of hardcoded
  // JSX keyed off window.location.pathname: block 0 returned the markup below
  // and every other block returned null, so the post's own markdown was
  // discarded in the SPA while the SEO worker served the real thing from
  // blog-content/. Bot and browser therefore showed different articles.
  //
  // The content that lived here — the L2-centric scaling argument, Base's fee
  // and adoption numbers, Solana on the roadmap, and where the freed capacity
  // goes — is now in the post's markdown (src/data/milestones/2025.ts), so the
  // two agree and the copy is editable without touching a component.

  const lines = block.split('\n');
  const firstLine = lines[0].trim();

  // Headers
  //
  // `# ` stays suppressed deliberately: BlogPostHeader already renders the post
  // title, and the old milestone template emitted `# ${title}` as its first
  // block, so honouring it would print the title twice.
  //
  // `## ` returning null was NOT deliberate. 37 published posts write their
  // section headings as `## ` — the SEO guides among them — and every one was
  // dropped here, together with any body text sharing the block. The crawler
  // pipeline does not drop them: generate-blog-manifest.mjs renders `## ` to
  // <h3>, so Googlebot received a structured article while a reader got one
  // undifferentiated wall of text. 165 headings were invisible to humans only.
  if (firstLine.startsWith('# ')) {
    return null;
  }
  if (firstLine.startsWith('## ')) {
    const heading = <h2 key={`${index}-h`} className="text-2xl font-bold text-royal-blue mb-4 mt-10 font-exo">{firstLine.slice(3)}</h2>;
    const remainingLines = lines.slice(1).join('\n').trim();
    if (remainingLines) {
      const processedContent = processLineForHtml(remainingLines.replace(/\n/g, ' '));
      const paragraph = <p key={`${index}-p`} className="text-royal-blue/80 mb-4 leading-relaxed font-exo" dangerouslySetInnerHTML={createSanitizedHtml(processedContent)} />;
      return [heading, paragraph];
    }
    return heading;
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
      // Default: full-width in-body figure. This used to return null, which
      // silently deleted every non-avatar image from a post's markdown. Six
      // shipped posts carry fourteen such images (the alpha-launch milestone
      // alone has nine screenshots); all fourteen were authored deliberately,
      // verified to exist under public/lovable-uploads/ (one Unsplash
      // hotlink), and they come back with this branch.
      return (
        <img
          key={index}
          src={src}
          alt={alt}
          loading="lazy"
          className="w-full h-auto rounded-2xl my-8 shadow-md"
        />
      );
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
