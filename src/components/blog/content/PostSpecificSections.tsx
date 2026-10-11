import { useTranslation as _useCopy } from 'react-i18next';

import React from 'react';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { ExternalLink } from 'lucide-react';

interface PostSpecificSectionsProps {
  content: string;
}

export const PostSpecificSections: React.FC<PostSpecificSectionsProps> = ({ content }) => {
  const { t: _copy } = _useCopy();
  const isCoinbasePost = content.includes('buy $DHB on Coinbase') || content.includes('Coinbase team');
  const isDhbscanPost = content.includes('dhbscan.com') || window.location.pathname.includes('transparency-hub-dhbscancom');
  
  return (
    <>
      {isDhbscanPost && (
        <div className="mt-6 p-6 bg-gradient-to-r from-blue-50 to-purple-50 rounded-lg border border-sky-blue/20">
          <div className="mb-6">
            <p className="text-royal-blue/80 font-exo leading-relaxed mb-4">{_copy("copy.fcaf45b5efef", { defaultValue: "We're excited to announce the launch of dhbscan.com, our comprehensive transparency hub that provides real-time insights into DHB token metrics across multiple blockchain networks." })}</p>
          </div>

          <h4 className="text-lg font-bold text-royal-blue mb-4 font-exo">{_copy("copy.0b4b4a2f7fca", { defaultValue: "Key Features:" })}</h4>
          <div className="space-y-4 mb-6">
            <div className="bg-white/50 p-4 rounded-lg">
              <h5 className="font-semibold text-royal-blue mb-2 font-exo">{_copy("copy.affa48d577d8", { defaultValue: "1) Shows supply figures across both chains" })}</h5>
              <p className="text-royal-blue/70 text-sm font-exo">{_copy("copy.8e695e61550c", { defaultValue: "Get accurate, real-time data on DHB token supply distribution across different blockchain networks" })}</p>
            </div>
            
            <div className="bg-white/50 p-4 rounded-lg">
              <h5 className="font-semibold text-royal-blue mb-2 font-exo">{_copy("copy.93e5133c8e87", { defaultValue: "2) Shows chart, price history & milestones" })}</h5>
              <p className="text-royal-blue/70 text-sm font-exo">{_copy("copy.e3c6b436e789", { defaultValue: "Track DHB's performance over time with detailed charts and important milestone markers. Soon to show full chart across FTV & DHB to paint the full story" })}</p>
            </div>
            
            <div className="bg-white/50 p-4 rounded-lg">
              <h5 className="font-semibold text-royal-blue mb-2 font-exo">{_copy("copy.391de8078f03", { defaultValue: "3) Shows latest transfers & top holders" })}</h5>
              <p className="text-royal-blue/70 text-sm font-exo">{_copy("copy.3ac7953768cd", { defaultValue: "Monitor the most recent token movements and identify the largest DHB holders in the ecosystem" })}</p>
            </div>
          </div>

          <div className="mb-6">
            <p className="text-royal-blue/80 font-exo leading-relaxed mb-4">{_copy("copy.c4d28b37d9dd", { defaultValue: "In the rapidly evolving world of decentralized finance, transparency isn't just a buzzword—it's a fundamental requirement for building trust and fostering community growth. dhbscan.com represents our commitment to providing the DeHub community with complete visibility into token economics and network activity." })}</p>
          </div>

          <h4 className="text-lg font-bold text-royal-blue mb-4 font-exo">{_copy("copy.db832651856c", { defaultValue: "Platform Highlights:" })}</h4>
          <ul className="list-disc list-inside space-y-2 text-royal-blue/80 font-exo mb-6">
            <li><strong>{_copy("copy.47f136396836", { defaultValue: "Real-time Data:" })}</strong>{_copy("copy.b40dfdd90653", { defaultValue: " Live updates on token metrics and network activity" })}</li>
            <li><strong>{_copy("copy.874c4620ba58", { defaultValue: "Multi-chain Support:" })}</strong>{_copy("copy.a3e17418687c", { defaultValue: " Comprehensive coverage across all supported blockchain networks" })}</li>
            <li><strong>{_copy("copy.f31b2b482d5c", { defaultValue: "User-friendly Interface:" })}</strong>{_copy("copy.67e6c5aafd14", { defaultValue: " Clean, intuitive design that makes complex data accessible" })}</li>
            <li><strong>{_copy("copy.82d0983e06e9", { defaultValue: "Mobile Responsive:" })}</strong>{_copy("copy.82f5c1c4251a", { defaultValue: " Full functionality across all devices" })}</li>
          </ul>

          <div className="mb-6 p-4 bg-white/30 rounded-lg border-l-4 border-royal-blue">
            <p className="text-royal-blue/90 font-exo italic text-sm">{_copy("copy.8bd791281158", { defaultValue: "This transparency initiative is part of our ongoing commitment to building trust and providing value to the DeHub community." })}</p>
          </div>

          <div className="pt-4 border-t border-sky-blue/30">
            <p className="text-royal-blue/80 font-exo mb-3">{_copy("copy.2e35d933f07c", { defaultValue: "Visit dhbscan.com today to explore the transparency hub and gain deeper insights into the DHB ecosystem." })}</p>
            <a 
              href="https://dhbscan.com" 
              target="_blank" 
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-middle-blue hover:text-royal-blue transition-colors duration-200 underline font-semibold"
            >{_copy("copy.9fb89dda2206", { defaultValue: "Visit dhbscan.com" })}<ExternalLink className="w-4 h-4" />
            </a>
          </div>
        </div>
      )}
      {isCoinbasePost && (
        <div className="mt-8 pt-4 border-t border-sky-blue/20">
          <HoverCard>
            <HoverCardTrigger asChild>
              <button className="inline-flex items-center gap-2 text-middle-blue hover:text-royal-blue transition-colors duration-200 underline">{_copy("copy.e6ed89729cf1", { defaultValue: "Reference Link" })}<ExternalLink className="w-4 h-4" />
              </button>
            </HoverCardTrigger>
            <HoverCardContent className="w-80">
              <div className="space-y-2">
                <h4 className="text-sm font-semibold">{_copy("copy.c930dcc7438a", { defaultValue: "Coinbase Official Announcement" })}</h4>
                <p className="text-sm text-muted-foreground">{_copy("copy.4068235b7ac5", { defaultValue: "Official tweet from Coinbase about Base DEX integration" })}</p>
                <a 
                  href="https://x.com/coinbase/status/1933274988041080859" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-sm text-blue-500 hover:underline"
                >{_copy("copy.598172b2e7cb", { defaultValue: "View on X (Twitter) →" })}</a>
              </div>
            </HoverCardContent>
          </HoverCard>
        </div>
      )}
    </>
  );
};
