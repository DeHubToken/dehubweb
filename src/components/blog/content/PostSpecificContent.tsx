import { useTranslation as _useCopy } from 'react-i18next';
import React from 'react';

export const PostSpecificContent: React.FC = () => {
  const { t: _copy } = _useCopy();
  return (
    <>
      {/* Add messaging system specific content */}
      {window.location.pathname.includes('connect-and-converse-advanced-messaging-system') && (
        <>
          <div className="mt-8 p-6 bg-gradient-to-r from-blue-50 to-purple-50 rounded-lg border border-sky-blue/20">
            <h3 className="text-xl font-bold text-royal-blue mb-4 font-exo">{_copy("copy.6fa13ff61869", { defaultValue: "Revolutionary Messaging Architecture" })}</h3>
            
            <p className="text-royal-blue/80 mb-4 leading-relaxed font-exo">{_copy("copy.feab98be249d", { defaultValue: "DeHub's advanced messaging system represents a paradigm shift in social media communication, introducing " })}<strong>{_copy("copy.cf08185f7e3a", { defaultValue: "tokenized interactions" })}</strong>{_copy("copy.8f65a56c5050", { defaultValue: " that create real economic value for content creators while maintaining the seamless user experience that modern platforms demand. Our three-tier messaging architecture—free DMs, paid DMs, and premium group chats—transforms every conversation into a potential revenue stream." })}</p>

            <p className="text-royal-blue/80 mb-4 leading-relaxed font-exo">{_copy("copy.36efe06b5bd3", { defaultValue: "Unlike traditional social platforms where messaging is purely transactional, DeHub's system recognizes that a creator's time and attention have inherent value. By implementing smart pricing mechanisms and blockchain-powered microtransactions, we've created the first messaging system where quality conversations are financially rewarded, spam is economically disincentivized, and creators maintain complete control over their accessibility." })}</p>

            <div className="mt-8 mb-8">
              <img 
                src="/media/0b942277-3ce4-450a-95cc-116ccdb1aa7b.png" 
                alt={_copy("copy.986fef7c1d5a", { defaultValue: "DeHub advanced messaging interface showing user conversations and paid content sharing" })} 
                className="w-full rounded-lg shadow-lg border border-sky-blue/20"
              />
              <p className="text-center text-sm text-royal-blue/60 mt-2 font-exo italic">{_copy("copy.361bf2c330ea", { defaultValue: "DeHub's advanced messaging interface demonstrating seamless integration of free and paid messaging features" })}</p>
            </div>
          </div>

          <div className="mt-8 p-6 bg-gradient-to-r from-green-50 to-blue-50 rounded-lg border border-sky-blue/20">
            <h3 className="text-xl font-bold text-royal-blue mb-4 font-exo">{_copy("copy.01d517df6c25", { defaultValue: "Free Direct Messages: Building Community Foundations" })}</h3>
            
            <p className="text-royal-blue/80 mb-4 leading-relaxed font-exo">{_copy("copy.dc422dc5fbac", { defaultValue: "Our free DM system serves as the entry point for community building, allowing creators to maintain open communication channels with their audience while preserving the option to monetize premium interactions. Free messages enable:" })}</p>

            <div className="space-y-3 mb-6">
              <div className="bg-white/50 p-4 rounded-lg">
                <h5 className="font-semibold text-royal-blue mb-2 font-exo">{_copy("copy.2f3d19ddf7fe", { defaultValue: "Community Engagement" })}</h5>
                <p className="text-royal-blue/70 text-sm font-exo">{_copy("copy.5e29997ad906", { defaultValue: "Creators can engage with their broader community without barriers, fostering relationships that may evolve into premium interactions or long-term support." })}</p>
              </div>
              
              <div className="bg-white/50 p-4 rounded-lg">
                <h5 className="font-semibold text-royal-blue mb-2 font-exo">{_copy("copy.0b78d6a43fb5", { defaultValue: "Discoverability & Growth" })}</h5>
                <p className="text-royal-blue/70 text-sm font-exo">{_copy("copy.c344cde88eb4", { defaultValue: "New followers can introduce themselves and establish connections, creating pathways for audience growth and community expansion." })}</p>
              </div>
              
              <div className="bg-white/50 p-4 rounded-lg">
                <h5 className="font-semibold text-royal-blue mb-2 font-exo">{_copy("copy.05b65078e9b8", { defaultValue: "Creator Accessibility" })}</h5>
                <p className="text-royal-blue/70 text-sm font-exo">{_copy("copy.02798ba0dd97", { defaultValue: "Maintains the approachable nature of social media while providing tools to upgrade interactions when appropriate." })}</p>
              </div>
            </div>

            <p className="text-royal-blue/80 mb-4 leading-relaxed font-exo">{_copy("copy.3de642274692", { defaultValue: "The free messaging tier includes robust spam protection, message filtering options, and the ability for creators to seamlessly transition conversations to paid tiers when deeper engagement is requested. This creates a natural funnel from casual interaction to monetized communication." })}</p>
          </div>

          <div className="mt-6 p-6 bg-gradient-to-r from-purple-50 to-pink-50 rounded-lg border border-sky-blue/20">
            <h3 className="text-xl font-bold text-royal-blue mb-4 font-exo">{_copy("copy.10595803d652", { defaultValue: "Paid Direct Messages: Monetizing Attention" })}</h3>
            
            <p className="text-royal-blue/80 mb-4 leading-relaxed font-exo">{_copy("copy.5db6928314b6", { defaultValue: "The paid DM system revolutionizes creator-fan interactions by introducing " })}<strong>{_copy("copy.72c8f0c2e764", { defaultValue: "economic incentives" })}</strong>{_copy("copy.50e51fb1432f", { defaultValue: " that benefit both parties. Creators set their own message pricing, typically ranging from $1-50 per message, creating a sustainable revenue stream while ensuring that only serious, valuable conversations reach their attention." })}</p>

            <h4 className="text-lg font-bold text-royal-blue mb-3 mt-6 font-exo">{_copy("copy.ebe83e96d575", { defaultValue: "Dynamic Pricing & Creator Control" })}</h4>
            
            <div className="grid md:grid-cols-2 gap-4 mb-6">
              <div className="bg-white/50 p-4 rounded-lg">
                <h5 className="font-semibold text-royal-blue mb-2 font-exo">{_copy("copy.7b57efac49ff", { defaultValue: "Flexible Pricing Models" })}</h5>
                <ul className="text-royal-blue/70 text-sm font-exo space-y-1">
                  <li>{_copy("copy.4bda90694a58", { defaultValue: "• Fixed per-message rates" })}</li>
                  <li>{_copy("copy.af8577a7ceb2", { defaultValue: "• Time-based pricing (peak hours premium)" })}</li>
                  <li>{_copy("copy.c83985dc7be5", { defaultValue: "• Relationship-based discounts" })}</li>
                  <li>{_copy("copy.4e107b22ed03", { defaultValue: "• Bulk message packages" })}</li>
                </ul>
              </div>
              
              <div className="bg-white/50 p-4 rounded-lg">
                <h5 className="font-semibold text-royal-blue mb-2 font-exo">{_copy("copy.02a31a7146b4", { defaultValue: "Advanced Controls" })}</h5>
                <ul className="text-royal-blue/70 text-sm font-exo space-y-1">
                  <li>{_copy("copy.a060e9c286e0", { defaultValue: "• Whitelist/blacklist management" })}</li>
                  <li>{_copy("copy.f9e3cfc3dab6", { defaultValue: "• Auto-responses for common queries" })}</li>
                  <li>{_copy("copy.358e2eab51a4", { defaultValue: "• Message queue prioritization" })}</li>
                  <li>{_copy("copy.4460a74e31f1", { defaultValue: "• Response time guarantees" })}</li>
                </ul>
              </div>
            </div>

            <h4 className="text-lg font-bold text-royal-blue mb-3 mt-6 font-exo">{_copy("copy.40b25b6ac6ff", { defaultValue: "Revenue Optimization Features" })}</h4>
            
            <div className="space-y-3 mb-6">
              <div className="bg-white/50 p-4 rounded-lg">
                <h5 className="font-semibold text-royal-blue mb-2 font-exo">{_copy("copy.e27cdd73a46c", { defaultValue: "Smart Analytics Dashboard" })}</h5>
                <p className="text-royal-blue/70 text-sm font-exo">{_copy("copy.daef0d31e0df", { defaultValue: "Real-time insights into message volume, revenue per conversation, peak engagement times, and subscriber conversion rates enable data-driven pricing optimization." })}</p>
              </div>
              
              <div className="bg-white/50 p-4 rounded-lg">
                <h5 className="font-semibold text-royal-blue mb-2 font-exo">{_copy("copy.abbc5c5595f4", { defaultValue: "Automated Revenue Streams" })}</h5>
                <p className="text-royal-blue/70 text-sm font-exo">{_copy("copy.d39e1505ec4a", { defaultValue: "Integration with subscription models allows paid DM access as a premium tier benefit, creating recurring revenue alongside per-message payments." })}</p>
              </div>
            </div>

            <p className="text-royal-blue/80 mb-4 leading-relaxed font-exo">{_copy("copy.759ea647c1f5", { defaultValue: "The system includes built-in escrow functionality, ensuring secure transactions, automatic creator payouts, and comprehensive financial reporting for tax purposes. Creators retain 85% of paid message revenue, with 10% supporting platform development and 5% distributed to DHB token holders as network rewards." })}</p>
          </div>

          <div className="mt-6 p-6 bg-gradient-to-r from-indigo-50 to-cyan-50 rounded-lg border border-sky-blue/20">
            <h3 className="text-xl font-bold text-royal-blue mb-4 font-exo">{_copy("copy.b40607b57d38", { defaultValue: "Premium Group Chats: Exclusive Community Building" })}</h3>
            
            <p className="text-royal-blue/80 mb-4 leading-relaxed font-exo">{_copy("copy.92c578f99135", { defaultValue: "DeHub's tokenized group chat system creates " })}<strong>{_copy("copy.25f1ee9823fb", { defaultValue: "exclusive communities" })}</strong>{_copy("copy.14b2f5993285", { defaultValue: " where access is gated by DHB token holdings, subscription status, or direct payment. This creates high-value environments where creators can build intimate relationships with their most dedicated supporters while generating significant recurring revenue." })}</p>

            <h4 className="text-lg font-bold text-royal-blue mb-3 mt-6 font-exo">{_copy("copy.00a28efe6bb7", { defaultValue: "Multi-Tier Access Control" })}</h4>
            
            <div className="grid md:grid-cols-3 gap-4 mb-6">
              <div className="bg-white/50 p-4 rounded-lg">
                <h5 className="font-semibold text-royal-blue mb-2 font-exo">{_copy("copy.ed4cd2d02970", { defaultValue: "Token-Gated Access" })}</h5>
                <p className="text-royal-blue/70 text-sm font-exo">{_copy("copy.2c1cd7028aad", { defaultValue: "Require minimum DHB holdings (e.g., 1,000 DHB) for entry, creating natural scarcity and token utility while rewarding long-term supporters." })}</p>
              </div>
              
              <div className="bg-white/50 p-4 rounded-lg">
                <h5 className="font-semibold text-royal-blue mb-2 font-exo">{_copy("copy.27d7868a5ae9", { defaultValue: "Subscription Tiers" })}</h5>
                <p className="text-royal-blue/70 text-sm font-exo">{_copy("copy.11c13afc806c", { defaultValue: "Monthly recurring payments ($10-200) provide predictable revenue while offering different levels of creator access and exclusive content." })}</p>
              </div>
              
              <div className="bg-white/50 p-4 rounded-lg">
                <h5 className="font-semibold text-royal-blue mb-2 font-exo">{_copy("copy.0579f6d0a725", { defaultValue: "Pay-Per-Access" })}</h5>
                <p className="text-royal-blue/70 text-sm font-exo">{_copy("copy.2746ef7bf8ce", { defaultValue: "One-time payments for special events, workshops, or limited-time group discussions create high-value, exclusive experiences." })}</p>
              </div>
            </div>

            <h4 className="text-lg font-bold text-royal-blue mb-3 mt-6 font-exo">{_copy("copy.ef4bf6f0b0e9", { defaultValue: "Advanced Group Features" })}</h4>
            
            <div className="space-y-3 mb-6">
              <div className="bg-white/50 p-4 rounded-lg">
                <h5 className="font-semibold text-royal-blue mb-2 font-exo">{_copy("copy.4d35897a437a", { defaultValue: "Creator Moderation Tools" })}</h5>
                <p className="text-royal-blue/70 text-sm font-exo">{_copy("copy.ea2a5f83244c", { defaultValue: "Advanced admin controls including message approval queues, automated moderation, member role management, and detailed engagement analytics." })}</p>
              </div>
              
              <div className="bg-white/50 p-4 rounded-lg">
                <h5 className="font-semibold text-royal-blue mb-2 font-exo">{_copy("copy.dafb968ac681", { defaultValue: "Exclusive Content Integration" })}</h5>
                <p className="text-royal-blue/70 text-sm font-exo">{_copy("copy.b3e25af706b4", { defaultValue: "Seamless sharing of premium photos, videos, documents, and live streams directly within group chats, creating comprehensive premium experiences." })}</p>
              </div>
              
              <div className="bg-white/50 p-4 rounded-lg">
                <h5 className="font-semibold text-royal-blue mb-2 font-exo">{_copy("copy.be4b2acccf71", { defaultValue: "Member Recognition Systems" })}</h5>
                <p className="text-royal-blue/70 text-sm font-exo">{_copy("copy.e80358314a96", { defaultValue: "Special badges, member hierarchies, and recognition features that reward active participation and create social incentives for continued engagement." })}</p>
              </div>
            </div>

            <p className="text-royal-blue/80 mb-4 leading-relaxed font-exo">{_copy("copy.e6dd51250849", { defaultValue: "Group chats support up to 500 members per room with real-time messaging, file sharing, voice notes, and integrated tipping functionality. Creators can run multiple concurrent groups at different price points, creating a diverse revenue portfolio that adapts to their audience's varying engagement levels and financial capabilities." })}</p>
          </div>

          <div className="mt-6 p-6 bg-gradient-to-r from-royal-blue/10 to-middle-blue/10 rounded-lg border border-royal-blue/20">
            <h3 className="text-xl font-bold text-royal-blue mb-4 font-exo">{_copy("copy.26b01b951d4a", { defaultValue: "Technical Excellence & User Experience" })}</h3>
            
            <p className="text-royal-blue/80 mb-4 leading-relaxed font-exo">{_copy("copy.f8797457ac41", { defaultValue: "Behind DeHub's messaging system lies cutting-edge technology that ensures " })}<strong>{_copy("copy.6ac059d90728", { defaultValue: "real-time performance" })}</strong>{_copy("copy.7b869339df60", { defaultValue: ", end-to-end encryption, and seamless blockchain integration. Our infrastructure handles millions of messages daily while maintaining the responsiveness users expect from modern messaging platforms." })}</p>

            <h4 className="text-lg font-bold text-royal-blue mb-3 mt-6 font-exo">{_copy("copy.3740ef336d2b", { defaultValue: "Performance & Security" })}</h4>
            
            <div className="grid md:grid-cols-2 gap-4 mb-6">
              <div className="bg-white/50 p-4 rounded-lg">
                <h5 className="font-semibold text-royal-blue mb-2 font-exo">{_copy("copy.29e91f33dccc", { defaultValue: "Real-Time Infrastructure" })}</h5>
                <ul className="text-royal-blue/70 text-sm font-exo space-y-1">
                  <li>{_copy("copy.ca99afdccaad", { defaultValue: "• Sub-100ms message delivery" })}</li>
                  <li>{_copy("copy.0463214fa8f0", { defaultValue: "• WebSocket-based real-time updates" })}</li>
                  <li>{_copy("copy.8971880b5e51", { defaultValue: "• Offline message synchronization" })}</li>
                  <li>{_copy("copy.1ec01fc5da93", { defaultValue: "• Multi-device message syncing" })}</li>
                </ul>
              </div>
              
              <div className="bg-white/50 p-4 rounded-lg">
                <h5 className="font-semibold text-royal-blue mb-2 font-exo">{_copy("copy.121fa1521e95", { defaultValue: "Security & Privacy" })}</h5>
                <ul className="text-royal-blue/70 text-sm font-exo space-y-1">
                  <li>{_copy("copy.c1f92fdb9446", { defaultValue: "• End-to-end encryption for all messages" })}</li>
                  <li>{_copy("copy.6b8cf48d3e2e", { defaultValue: "• Zero-knowledge payment processing" })}</li>
                  <li>{_copy("copy.ade6159d47a1", { defaultValue: "• GDPR-compliant data handling" })}</li>
                  <li>{_copy("copy.57552fc64eb9", { defaultValue: "• Blockchain-verified transactions" })}</li>
                </ul>
              </div>
            </div>

            <p className="text-royal-blue/80 mb-4 leading-relaxed font-exo">{_copy("copy.32ba83b61325", { defaultValue: "The system includes sophisticated anti-spam measures, automated content moderation, and AI-powered conversation insights that help creators optimize their messaging strategies without compromising user privacy or security." })}</p>

            <div className="pt-4 border-t border-royal-blue/30">
              <p className="text-royal-blue/80 font-exo text-sm italic">{_copy("copy.e0a51ac5dd2a", { defaultValue: "DeHub's messaging system isn't just communication—it's the foundation of a new creator economy where every interaction has the potential to generate value, build community, and strengthen the bonds between creators and their most dedicated supporters." })}</p>
            </div>
          </div>
        </>
      )}

      {/* Add Livepeer-specific content */}
      {window.location.pathname.includes('livepeer') && (
        <>
          <div className="mt-8 p-6 bg-gradient-to-r from-green-50 to-blue-50 rounded-lg border border-sky-blue/20">
            <h3 className="text-xl font-bold text-royal-blue mb-4 font-exo">{_copy("copy.42f856c3714e", { defaultValue: "The Power of Decentralized Video Infrastructure" })}</h3>
            
            <p className="text-royal-blue/80 mb-4 leading-relaxed font-exo">{_copy("copy.4f23aee862b1", { defaultValue: "In today's digital landscape, video streaming has become the backbone of online communication, entertainment, and business operations. However, traditional centralized streaming infrastructure comes with significant limitations: high costs, single points of failure, geographic restrictions, and lack of transparency. This is where " })}<strong>{_copy("copy.6cd06db20425", { defaultValue: "Livepeer" })}</strong>{_copy("copy.4808531af1f2", { defaultValue: " revolutionizes the industry through decentralized video infrastructure." })}</p>

            <p className="text-royal-blue/80 mb-4 leading-relaxed font-exo">{_copy("copy.7466e7b05bf5", { defaultValue: "Livepeer operates as a decentralized network of video transcoding nodes, distributed globally and maintained by a community of operators. This approach delivers several critical advantages over centralized alternatives like traditional CDNs or proprietary streaming services." })}</p>

            <h4 className="text-lg font-bold text-royal-blue mb-3 mt-6 font-exo">{_copy("copy.acade3d927e8", { defaultValue: "Why Decentralized Infrastructure Matters" })}</h4>
            
            <div className="space-y-4 mb-6">
              <div className="bg-white/50 p-4 rounded-lg">
                <h5 className="font-semibold text-royal-blue mb-2 font-exo">{_copy("copy.9e866c3a1794", { defaultValue: "Cost Efficiency at Scale" })}</h5>
                <p className="text-royal-blue/70 text-sm font-exo">{_copy("copy.2aa0f965f7e3", { defaultValue: "Decentralized networks eliminate the need for expensive data centers and reduce operational overhead. By distributing processing across numerous nodes, costs decrease significantly while maintaining high-quality service delivery." })}</p>
              </div>
              
              <div className="bg-white/50 p-4 rounded-lg">
                <h5 className="font-semibold text-royal-blue mb-2 font-exo">{_copy("copy.7449f03f3779", { defaultValue: "Global Redundancy & Reliability" })}</h5>
                <p className="text-royal-blue/70 text-sm font-exo">{_copy("copy.183d0bb66b4d", { defaultValue: "Unlike centralized systems with single points of failure, decentralized infrastructure ensures continuous operation even if individual nodes go offline. This distributed approach provides unmatched reliability for critical streaming applications." })}</p>
              </div>
              
              <div className="bg-white/50 p-4 rounded-lg">
                <h5 className="font-semibold text-royal-blue mb-2 font-exo">{_copy("copy.236f3aafc904", { defaultValue: "Censorship Resistance" })}</h5>
                <p className="text-royal-blue/70 text-sm font-exo">{_copy("copy.6c6e0378b972", { defaultValue: "Decentralized networks cannot be easily shut down or censored by single authorities, ensuring content creators maintain control over their distribution channels and audience access." })}</p>
              </div>
              
              <div className="bg-white/50 p-4 rounded-lg">
                <h5 className="font-semibold text-royal-blue mb-2 font-exo">{_copy("copy.93893dd58246", { defaultValue: "Transparent & Open Ecosystem" })}</h5>
                <p className="text-royal-blue/70 text-sm font-exo">{_copy("copy.5959c11ff2dc", { defaultValue: "All network operations, pricing, and performance metrics are transparent and verifiable on-chain, creating trust and accountability that centralized platforms cannot match." })}</p>
              </div>
            </div>

            <p className="text-royal-blue/80 mb-4 leading-relaxed font-exo">{_copy("copy.48ba4a71ba17", { defaultValue: "For DeHub, integrating with Livepeer represents a strategic alignment with our core principles of decentralization while providing immediate access to proven, scalable video infrastructure. This partnership enables us to support " })}<strong>{_copy("copy.7e05b8dcc423", { defaultValue: "50,000+ concurrent viewers initially" })}</strong>{_copy("copy.f1d810cf6def", { defaultValue: ", with unlimited scaling potential as our user base grows." })}</p>
          </div>

          <div className="mt-6 p-6 bg-gradient-to-r from-blue-50 to-purple-50 rounded-lg border border-sky-blue/20">
            <h3 className="text-xl font-bold text-royal-blue mb-4 font-exo">{_copy("copy.ea5df28683cd", { defaultValue: "Strategic Vision: From Partnership to DePIN Leadership" })}</h3>
            
            <p className="text-royal-blue/80 mb-4 leading-relaxed font-exo">{_copy("copy.e7bab0d695d7", { defaultValue: "While our integration with Livepeer provides immediate technical capabilities and proven decentralized infrastructure, our long-term vision extends far beyond this partnership. DeHub is actively developing our own " })}<strong>{_copy("copy.b594f0976b98", { defaultValue: "Decentralized Physical Infrastructure Network (DePIN)" })}</strong>{_copy("copy.6e15542bd0f7", { defaultValue: " that will eventually encompass video streaming, data storage, computational resources, and networking capabilities." })}</p>

            <h4 className="text-lg font-bold text-royal-blue mb-3 mt-6 font-exo">{_copy("copy.8a82a97963dc", { defaultValue: "The Future of DeHub DePIN" })}</h4>
            
            <p className="text-royal-blue/80 mb-4 leading-relaxed font-exo">{_copy("copy.2a53ce116102", { defaultValue: "Our proprietary DePIN infrastructure is designed to create a comprehensive ecosystem where community members can contribute computational resources, storage capacity, and bandwidth in exchange for DHB token rewards. This approach will enable:" })}</p>

            <ul className="list-disc list-inside space-y-2 text-royal-blue/80 font-exo mb-6">
              <li><strong>{_copy("copy.99ff086b8496", { defaultValue: "Community Ownership:" })}</strong>{_copy("copy.b4d622b56d7f", { defaultValue: " Users become stakeholders in the infrastructure they use daily" })}</li>
              <li><strong>{_copy("copy.0e80d5c8ba9b", { defaultValue: "Token Utility:" })}</strong>{_copy("copy.047a1e41cdb0", { defaultValue: " DHB tokens power all network operations and reward contribution" })}</li>
              <li><strong>{_copy("copy.34fafd7fe44b", { defaultValue: "Vertical Integration:" })}</strong>{_copy("copy.72669c0b9b58", { defaultValue: " Complete control over our technology stack and user experience" })}</li>
              <li><strong>{_copy("copy.f67c22123448", { defaultValue: "Cost Optimization:" })}</strong>{_copy("copy.beef9de838e5", { defaultValue: " Direct community participation eliminates intermediary costs" })}</li>
              <li><strong>{_copy("copy.e83be65bd1e3", { defaultValue: "Innovation Freedom:" })}</strong>{_copy("copy.d091f529e1d8", { defaultValue: " Ability to implement cutting-edge features without third-party limitations" })}</li>
            </ul>

            <div className="p-4 bg-white/30 rounded-lg border-l-4 border-royal-blue mb-6">
              <p className="text-royal-blue/90 font-exo text-sm">
                <strong>{_copy("copy.ff09e578b9e1", { defaultValue: "Strategic Flexibility:" })}</strong>{_copy("copy.5f2b616a4212", { defaultValue: " Even as we develop our own DePIN infrastructure, we maintain an open approach to partnerships. If Livepeer continues to provide exceptional cost efficiency and performance, we may choose to maintain this integration alongside our proprietary solutions, creating a hybrid model that maximizes both performance and decentralization." })}</p>
            </div>

            <p className="text-royal-blue/80 mb-4 leading-relaxed font-exo">{_copy("copy.ead4e137db43", { defaultValue: "This measured approach allows us to leverage proven technologies today while building the infrastructure of tomorrow. Our users benefit from immediate access to high-quality streaming capabilities, while our development team focuses on creating the next generation of decentralized infrastructure that will power the future of social media and content creation." })}</p>
          </div>

          <div className="mt-6 p-6 bg-gradient-to-r from-royal-blue/10 to-middle-blue/10 rounded-lg border border-royal-blue/20">
            <h3 className="text-xl font-bold text-royal-blue mb-4 font-exo">{_copy("copy.750c5f2aed19", { defaultValue: "Technical Excellence Meets Decentralized Values" })}</h3>
            
            <p className="text-royal-blue/80 mb-4 leading-relaxed font-exo">{_copy("copy.40cd6ff6a869", { defaultValue: "The integration with Livepeer showcases how DeHub consistently chooses solutions that align with our commitment to decentralization, community empowerment, and technical excellence. Rather than relying on centralized cloud providers that concentrate power and profits in the hands of tech giants, we partner with protocols that distribute both." })}</p>

            <p className="text-royal-blue/80 mb-4 leading-relaxed font-exo">{_copy("copy.c0b9bbd915f3", { defaultValue: "This decision reflects our broader philosophy: every technical choice should advance the cause of decentralization while delivering superior user experiences. As we continue building DeHub into the premier decentralized social platform, partnerships like this demonstrate our commitment to walking the walk, not just talking about decentralization." })}</p>

            <div className="pt-4 border-t border-royal-blue/30">
              <p className="text-royal-blue/80 font-exo text-sm italic">{_copy("copy.eb840931ec0c", { defaultValue: "Join us as we scale new heights in decentralized infrastructure, bringing the future of social media to life through innovative partnerships and our own cutting-edge DePIN development." })}</p>
            </div>
          </div>
        </>
      )}
    </>
  );
};
