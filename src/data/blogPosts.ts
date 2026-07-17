import { BlogPost } from '@/types/blog';
import { e2eePost } from './posts/e2eePost';
import { whatIsDehubPost } from './posts/whatIsDehubPost';
import { googlePlayStorePost } from './posts/googlePlayStorePost';
import { townHallFeb2026Post } from './posts/townHallFeb2026Post';
// SEO content cluster (Jul 2026): watch2earn / play2earn / decentralised social / UK / brand
import { dehubDisambiguationPost } from './posts/dehubDisambiguationPost';
import { buyDhbTokenUkPost } from './posts/buyDhbTokenUkPost';
import { whatIsWatchToEarnPost } from './posts/whatIsWatchToEarnPost';
import { bestWatchToEarnPlatformsPost } from './posts/bestWatchToEarnPlatformsPost';
import { isWatchToEarnLegitPost } from './posts/isWatchToEarnLegitPost';
import { watchToEarnComparisonPost } from './posts/watchToEarnComparisonPost';
import { tokenizedSubscriptionsPost } from './posts/tokenizedSubscriptionsPost';
import { leavingTiktokUkPost } from './posts/leavingTiktokUkPost';
import { freePlayToEarnNoInvestmentPost } from './posts/freePlayToEarnNoInvestmentPost';
import { lastChadStandingPost } from './posts/lastChadStandingPost';
import { xToEarnExplainerPost } from './posts/xToEarnExplainerPost';
import { decentralisedSocialMediaPost } from './posts/decentralisedSocialMediaPost';
import { bestDecentralisedSocialPlatformsPost } from './posts/bestDecentralisedSocialPlatformsPost';
import { web3LiveStreamingPost } from './posts/web3LiveStreamingPost';
import { playToEarnUkPost } from './posts/playToEarnUkPost';

// Placeholder images - using a few from the provided list and cycling through them
const unsplashBase = "https://images.unsplash.com/";
const placeholderImages = [
  "photo-1488590528505-98d2b5aba04b", // laptop
  "photo-1518770660439-4636190af475", // circuit board
  "photo-1461749280684-dccba630e2f6", // code on monitor
  "photo-1581091226825-a6a2a5aee158", // woman with laptop
  "photo-1526374965328-7f61d4dc18c5", // matrix code
  "photo-1487058792275-0ad4aaf24ca7", // colorful code
  "photo-1605810230434-7631ac76ec81", // video screens
  "photo-1519389950473-47ba0277781c", // people with laptops
  "photo-1498050108023-c5249f4df085"  // macbook with code
];
let imageIndex = 0;

const getNextImage = () => {
  const imageName = placeholderImages[imageIndex % placeholderImages.length];
  imageIndex++;
  return `${unsplashBase}${imageName}?ixlib=rb-4.0.3&fit=crop&w=1200&h=600&q=80`;
};

const generateSlug = (title: string) => {
  return title.toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]+/g, '');
};

const getCategory = (bullet: string): string => {
    const lowerBullet = bullet.toLowerCase();
    if (lowerBullet.includes('team') || lowerBullet.includes('members') || lowerBullet.includes('co-founders')) return 'team';
    if (lowerBullet.includes('token') || lowerBullet.includes('airdrop') || lowerBullet.includes('listed on') || lowerBullet.includes('liquidity') || lowerBullet.includes('delisting') || lowerBullet.includes('$') || lowerBullet.includes('price surge') || (lowerBullet.includes('v2') && (lowerBullet.includes('relaunch') || lowerBullet.includes('trading'))) || lowerBullet.includes('mainnet') || lowerBullet.includes('l2')) return 'finance';
    if (lowerBullet.includes('security') || lowerBullet.includes('vulnerabilities') || lowerBullet.includes('malfunctioned') || lowerBullet.includes('fraudulent') || lowerBullet.includes('challenges')) return 'challenge';
    if (lowerBullet.includes('community') || lowerBullet.includes('users') || lowerBullet.includes('testers') || lowerBullet.includes('adopters') || lowerBullet.includes('interviews') || lowerBullet.includes('gamers') || lowerBullet.includes('ambassadorship')) return 'community';
    if (lowerBullet.includes('award') || lowerBullet.includes('featured in') || lowerBullet.includes('event') || lowerBullet.includes('partnerships') || lowerBullet.includes('agency')) return 'recognition';
    if (lowerBullet.includes('rebranded') || lowerBullet.includes('decentralization') || lowerBullet.includes('policy') || lowerBullet.includes('vision') || lowerBullet.includes('principles') || lowerBullet.includes('framework')) return 'strategy';
    if (lowerBullet.includes('sec registration') || lowerBullet.includes('legal') || lowerBullet.includes('patent')) return 'legal';
    if (lowerBullet.includes('rebuild') || lowerBullet.includes('engine') || lowerBullet.includes('infrastructure') || lowerBullet.includes('cdn') || lowerBullet.includes('backend speed') || lowerBullet.includes('depin') || lowerBullet.includes('upgrade') || lowerBullet.includes('dhbscan.com')) return 'tech';
    // Default to product launch
    return 'product';
};

const generatePostContent = (category: string, title: string, quarter: string, bulletPoint: string): string => {
    let intro, body;

    switch (category) {
        case 'team':
            intro = `Every great journey begins with the right people. In ${quarter}, we laid one of the most crucial cornerstones of DeHub's future by bringing together our core team. This wasn't just about hiring talent; it was about uniting a group of passionate innovators with a shared vision for a decentralized world.`;
            body = `## Forging a Vision Together
The individuals who came together during this formative period brought a diverse range of expertise in blockchain, mobile development, and user experience design. More importantly, they brought a relentless drive to challenge the status quo. The energy was electric, with late-night brainstorming sessions and collaborative coding sprints becoming the norm. This team became the engine that would power DeHub through its initial launches and toughest challenges.

## The Foundation of Our Culture
This milestone was more than just a headcount; it was the genesis of DeHub's culture. We established our commitment to transparency, collaboration, and relentless execution. The bonds formed in ${quarter} have proven resilient, guiding us through market shifts and technological hurdles, and setting the standard for every new member who has joined us since.`;
            break;

        case 'finance':
            intro = `The economic foundation of a decentralized ecosystem is paramount. During ${quarter}, DeHub took a monumental step in strengthening our financial footing. This event was a catalyst, fundamentally shaping our market presence and the value proposition for our community.`;
            body = `## A New Chapter in Value
Whether it was launching a new token, securing a major exchange listing, or establishing critical liquidity, this was a moment of truth for DeHub's economic model. It represented months of strategic planning, rigorous security audits, and tireless negotiations to ensure we created a sustainable and fair system for all participants. This wasn't just about numbers on a screen; it was about creating real, tangible utility and empowering our holders.

## Market Impact and Community Trust
The successful execution of this financial milestone sent a strong signal to the market about DeHub's seriousness and long-term potential. It enhanced liquidity, broadened our investor base, and most importantly, solidified the trust our community placed in us. We demonstrated our ability to navigate the complex world of DeFi and create opportunities for our supporters, laying the groundwork for future economic growth and stability.`;
            break;
        
        case 'challenge':
             intro = `The path of innovation is never a straight line. In ${quarter}, we faced a significant hurdle head-on. While difficult, this moment became a defining one for DeHub, testing our resilience and reinforcing our commitment to transparency and security.`;
             body = `## Confronting the Issue
Discovering this issue was a sobering moment for the team. Our immediate priority was to be fully transparent with our community. We communicated openly about the nature of the problem, the potential impact, and the steps we were taking to address it. There was no room for ambiguity. Our team worked around the clock, collaborating with security experts to diagnose the root cause and develop a robust solution.

## Stronger Through Adversity
This experience, though challenging, ultimately made DeHub stronger. It forced us to scrutinize our processes, upgrade our security protocols, and implement more rigorous testing methodologies. We learned invaluable lessons about risk management and crisis communication. More importantly, we proved to our community that we would always act in their best interests, even when the news was tough. Emerging from this challenge, we did so with a more secure platform and a renewed sense of purpose.`;
             break;

        case 'community':
            intro = `DeHub is nothing without its community. In ${quarter}, we celebrated a massive achievement in our growth, a testament to the vibrant and engaged user base that forms the heart of our project. This milestone wasn't just a number; it was a reflection of the passionate supporters who believe in our vision.`;
            body = `## Building a Movement
From our earliest days, we knew that building a strong community was just as important as building great technology. This milestone was the result of consistent engagement, transparent communication, and a commitment to listening to our users. Through AMAs, social media discussions, and feedback channels, we fostered a space where everyone felt heard and valued.

## The Power of People
Reaching this point demonstrated the powerful network effect of a truly decentralized project. Our early adopters became our biggest advocates, spreading the word and helping newcomers navigate the ecosystem. This organic growth is the most powerful kind, and it's a testament to the real-world value DeHub provides. We are endlessly grateful for every single member of our community; you are the reason we build.`;
            break;

        case 'recognition':
            intro = `Hard work and innovation deserve to be recognized. We were incredibly honored in ${quarter} when DeHub achieved a significant external milestone. This acknowledgment from the wider industry was a proud moment for our entire team and community, validating our efforts and vision.`;
            body = `## A Testament to Our Vision
Receiving this recognition was validation for the unique path we've chosen. It confirmed that our dedication to pushing the boundaries of decentralized technology was not only being noticed but celebrated. This was an award not just for our team, but for every community member who believed in our vision and supported us along the way.

## Amplifying Our Message
This achievement provided us with a platform to share the DeHub story with a broader audience. It opened doors to new conversations, partnerships, and opportunities, further solidifying our position as a serious contender in the tech landscape. While we are proud of the accolade, we view it not as a final destination, but as fuel for our journey ahead, motivating us to continue innovating and delivering for our community.`;
            break;
            
        case 'strategy':
            intro = `Building a lasting project requires not just great code, but a clear and principled strategy. In ${quarter}, we made a pivotal strategic decision that would shape our path forward. This move was a deliberate choice, reflecting our core values and long-term vision for the DeHub ecosystem.`;
            body = `## The 'Why' Behind the Move
This decision was not made lightly. It came after extensive internal discussion and analysis of the market landscape. At its core, the choice was driven by our unwavering commitment to principles like decentralization, user ownership, and long-term sustainability. We believed that this path, while perhaps not the easiest, was the right one for the health and integrity of the project.

## Charting Our Own Course
This strategic shift was a declaration of our independence and our commitment to our principles. It demonstrated that we are not afraid to make bold moves to protect the interests of our community and the future of the platform. It has since guided our development roadmap and partnership decisions, ensuring that every step we take is aligned with our foundational mission.`;
            break;

        case 'legal':
            intro = `Navigating the complex regulatory landscape is a critical part of building a sustainable, global platform. In ${quarter}, DeHub achieved a crucial legal and compliance milestone. This was a significant step in legitimizing our operations and ensuring our long-term viability.`;
            body = `## Building on a Foundation of Trust
In an industry where trust is paramount, establishing a proper legal framework is non-negotiable. This achievement was the result of months of diligent work with legal experts to ensure our operations were compliant and above board. It provides a layer of security and legitimacy that protects not only the project but also our users and stakeholders.

## Paving the Way for Growth
With this legal milestone secured, DeHub is better positioned for mainstream adoption and institutional partnerships. It removes ambiguity and signals to the world that we are a serious, professional organization committed to doing things the right way. This foundation allows us to pursue more ambitious goals with confidence, knowing that we are built to last.`;
            break;

        case 'tech':
            intro = `At our core, DeHub is a technology company driven to solve complex problems. During ${quarter}, our engineering team achieved a significant technical breakthrough. This was a feat of engineering that has fundamentally improved the performance, scalability, and user experience of our platform.`;
            body = `## Under the Hood
This project involved a deep dive into our architecture, pushing the limits of our technology stack. Our engineers architected a new system, optimized algorithms, and refactored legacy code to achieve this leap forward. It required creative problem-solving and a relentless focus on efficiency and scalability.

## A Better Experience for All
The direct result of this technical achievement is a faster, more reliable, and more powerful platform for our users. Whether it's reduced latency, enhanced security, or the ability to support more concurrent activity, this infrastructure upgrade is a tide that lifts all boats. It's the kind of foundational work that enables the next generation of features and ensures DeHub can continue to scale for years to come.`;
            break;

        case 'product':
        default:
             intro = `Innovation is at the heart of DeHub. In ${quarter}, we were thrilled to bring a new experience to our users with a major product update. This was the culmination of countless hours of design, development, and community feedback, aimed at pushing the boundaries of what's possible in a decentralized ecosystem.`;
             body = `## From Concept to Reality
The idea for this feature was born from a simple question: How can we provide more value and utility to our users? The journey from that initial concept to a fully-fledged product was one of intense collaboration. Our product managers, designers, and engineers worked in lockstep, iterating through prototypes and incorporating feedback from our beta testers to ensure the final product was intuitive, powerful, and polished.

## Empowering Our Users
The release of this feature marked a significant enhancement to the DeHub platform. It unlocked new capabilities, created new ways for our community to engage, and solidified our position as a leader in the space. The enthusiastic adoption and positive feedback we received were a testament to the hard work of the entire team and the power of building with the user at the center of every decision. This milestone wasn't just an end-point; it was the beginning of a new chapter of innovation for DeHub.`;
            break;
    }

    return `
# ${title}

${intro}

${body}
    `.trim();
};

let postIdCounter = 0;
const createPost = (
  quarter: string, // e.g., "Q1 2021"
  year: number,
  quarterNum: number, // 1, 2, 3, 4
  itemIndexInQuarter: number, // 0-based
  bulletPoint: string,
  customTitle?: string,
  additionalContent?: string,
  customTags?: string[]
): BlogPost => {
  postIdCounter++;
  const baseTitle = customTitle || bulletPoint;
  const title = `${baseTitle} - A DeHub Milestone from ${quarter}`;
  const slug = generateSlug(title);
  const month = (quarterNum - 1) * 3 + 1; // Q1->Jan, Q2->Apr, etc.
  const day = itemIndexInQuarter + 1;
  const publishedAt = new Date(year, month - 1, day).toISOString();

  const excerpt = `A deep dive into a key ${quarter} milestone for DeHub. Learn how this development shaped our ecosystem and our journey forward.`;
  
  const category = getCategory(bulletPoint);
  const content = generatePostContent(category, title, quarter, bulletPoint);

  // SEO Optimizations
  const seoTitle = `${baseTitle} | DeHub ${year} Roadmap`;
  const shortBullet = bulletPoint.length > 80 ? bulletPoint.substring(0, 77) + '...' : bulletPoint;
  const seoDescription = `Official update on DeHub's ${quarter} progress: ${shortBullet}. Discover the impact of this ${category} milestone on our journey.`;
  const bannerImageAlt = `DeHub ${quarter} update: ${baseTitle}`;

  return {
    id: `dehub-milestone-${postIdCounter}-${slug.substring(0,20)}`,
    title,
    slug,
    excerpt: excerpt,
    content: content,
    bannerImage: getNextImage(),
    bannerImageAlt: bannerImageAlt,
    author: { name: 'DeHub Team' },
    publishedAt,
    tags: customTags || ['DeHub Journey', 'Roadmap', quarter.replace(' ', ''), year.toString(), 'Milestone'],
    readingTime: 4, // Estimated, increased for more content
    featured: false,
    status: 'published',
    seoTitle,
    seoDescription,
  };
};

export const blogPosts: BlogPost[] = [
  whatIsDehubPost,
  dehubDisambiguationPost,
  buyDhbTokenUkPost,
  whatIsWatchToEarnPost,
  bestWatchToEarnPlatformsPost,
  isWatchToEarnLegitPost,
  watchToEarnComparisonPost,
  tokenizedSubscriptionsPost,
  leavingTiktokUkPost,
  freePlayToEarnNoInvestmentPost,
  lastChadStandingPost,
  xToEarnExplainerPost,
  decentralisedSocialMediaPost,
  bestDecentralisedSocialPlatformsPost,
  web3LiveStreamingPost,
  playToEarnUkPost,
  townHallFeb2026Post,
  googlePlayStorePost,
  e2eePost,
  // 2021
  // Q1 2021
  createPost("Q1 2021", 2021, 1, 0, "Assembled core development team", "Building the Dream: DeHub's Core Team Assembled"),
  createPost("Q1 2021", 2021, 1, 1, "Launched first beta app on App Store with 500+ initial testers and 2,000 DAUs before token release", "Early Traction: DeHub's Beta App Hits 2,000 DAUs"),
  createPost("Q1 2021", 2021, 1, 2, "Conducted 50+ user interviews to validate product-market fit", "Listening to Our Users: 50+ Interviews Shape DeHub"),
  createPost("Q1 2021", 2021, 1, 3, "Established basic content moderation framework", "Safe Spaces: DeHub's Initial Content Moderation Framework"),
  // Q2 2021
  createPost("Q2 2021", 2021, 2, 0, "Launched v1 token", "The Genesis: DeHub's V1 Token Launch"),
  createPost("Q2 2021", 2021, 2, 1, "Community governed listing chain, price / market cap.", "Power to the People: Community Governed Listings"),
  createPost("Q2 2021", 2021, 2, 2, "Established first liquidity pools on Pancake Swap", "Diving In: First DeHub Liquidity Pools on Pancake Swap"),
  createPost("Q2 2021", 2021, 2, 3, "Built community of 2,000+ early adopters", "Growing Together: DeHub's Early Adopter Community Surpasses 2,000"),
  createPost("Q2 2021", 2021, 2, 4, "Implemented basic governance voting mechanism", "A Voice for All: DeHub's Basic Governance Voting Arrives"),
  createPost("Q2 2021", 2021, 2, 5, "Smart contract security issue discovered", "Navigating Challenges: Addressing a V1 Smart Contract Security Issue"),
  // Q3 2021
  createPost("Q3 2021", 2021, 3, 0, "Rebranded to DeHub", "A New Era: The Rebranding to DeHub"),
  createPost("Q3 2021", 2021, 3, 1, "Started full app rebuild using React Native for better cross-platform support", "Building for All: App Rebuild with React Native"),
  createPost("Q3 2021", 2021, 3, 2, "Airdropped all holders automatically", "Rewarding Loyalty: Automatic Airdrop for All Holders"),
  createPost("Q3 2021", 2021, 3, 3, "Addressed security vulnerabilities from v1 with full Certik Audit", "Fortifying Our Walls: V1 Security Hardened with Certik Audit"),
  createPost("Q3 2021", 2021, 3, 4, "Expanded team to 15 members across 3 time zones", "Global Reach: DeHub Team Grows to 15 Strong"),
  // Q4 2021
  createPost("Q4 2021", 2021, 4, 0, "Released prediction and raffle games", "Game On: DeHub Launches Prediction and Raffle Games"),
  createPost("Q4 2021", 2021, 4, 1, "Listed on Gate.io after a near 1000x price surge, with close to $10m in our LP", "To the Moon: Gate.io Listing and $10M LP Milestone"),
  createPost("Q4 2021", 2021, 4, 2, "Discovered listing agent was fraudulent, stole our fundraise and dumped our chart instead of airdropping Gate users, Gate investigated and apologised but could not identify the rogue employee as they lost the records, apparently.", "Trials and Tribulations: The Gate.io Listing Agent Incident"),
  createPost("Q4 2021", 2021, 4, 3, "Implemented game mechanics with provably fair randomization", "Fair Play: Provably Fair Randomization in DeHub Games"),
  createPost("Q4 2021", 2021, 4, 4, "Community grew to 8,000+ active members", "Strength in Numbers: DeHub Community Exceeds 8,000 Active Members"),

  // 2022
  // Q1 2022
  createPost("Q1 2022", 2022, 1, 0, "Released arcade with 5 initial games including Super Robin Hood and Tomb Runner and predictions", "Level Up: DeHub Arcade Launches with 5 Games & Predictions"),
  createPost("Q1 2022", 2022, 1, 1, "Achieved 5,000+ monthly active gamers", "High Score: DeHub Gaming Hits 5,000+ Monthly Active Users"),
  createPost("Q1 2022", 2022, 1, 2, "Implemented blockchain-based leaderboards and rewards", "On-Chain Glory: Blockchain Leaderboards and Rewards in DeHub Arcade"),
  createPost("Q1 2022", 2022, 1, 3, "Introduced social features allowing friend challenges", "Challenge Accepted: Social Features and Friend Challenges Arrive"),
  createPost("Q1 2022", 2022, 1, 4, "Built custom game engine optimized for mobile devices", "Powering Play: DeHub's Custom Mobile Game Engine"),
  // Q2 2022
  createPost("Q2 2022", 2022, 2, 0, "Released stream app supporting 4K content with 99.9% uptime", "Crystal Clear: DeHub Stream App with 4K Support & High Uptime"),
  createPost("Q2 2022", 2022, 2, 1, "Produced first tokenised documentary featuring Jorge Masvidal, Brad Pickett & more by Luke Barnatt", "Lights, Camera, Blockchain: DeHub's First Tokenized Documentary"),
  createPost("Q2 2022", 2022, 2, 2, "Genesis mint for Chads collection", "The Chads Arrive: Genesis Mint of the Chads NFT Collection"),
  createPost("Q2 2022", 2022, 2, 3, "Secured SEC registration with the Philippine Government for real estate, construction and brokerage services", "Building Bridges: Philippine SEC Registration Secured"),
  createPost("Q2 2022", 2022, 2, 4, "Implemented advanced video compression reducing bandwidth costs by 60%", "Efficient Streaming: Advanced Video Compression Reduces Costs"),
  createPost("Q2 2022", 2022, 2, 5, "Built NFT marketplace with royalty distribution system", "Empowering Creators: DeHub NFT Marketplace with Royalties"),
  // Q3 2022
  createPost("Q3 2022", 2022, 3, 0, "Incorporated DeLabs LTD with proper legal structure and compliance", "Official Standing: DeLabs LTD Incorporated"),
  createPost("Q3 2022", 2022, 3, 1, "Acquired $1,000,000 home for largest crypto raffle ever (15,000+ participants)", "Dream Big: The $1M Home Crypto Raffle by DeHub"),
  createPost("Q3 2022", 2022, 3, 2, "Secured power of attorney for multiple islands and sea front strip in Palawan worth over $15,000,000 in an attempt to tokenise sales but failed due to regulatory challenges from the Philippine SEC", "Ambitious Ventures: The Palawan Real Estate Tokenization Attempt"),
  createPost("Q3 2022", 2022, 3, 3, "Established partnerships with real estate and legal firms", "Strategic Alliances: Partnering with Real Estate and Legal Experts"),
  createPost("Q3 2022", 2022, 3, 4, "Created transparent raffle mechanics with on-chain verification", "Trust and Transparency: On-Chain Verified Raffle Mechanics"),
  // Q4 2022
  createPost("Q4 2022", 2022, 4, 0, "Contract tax triggers malfunctioned, freezing the token and our LP, forced to relaunch v2", "The Unforeseen: Navigating a Contract Malfunction and V2 Relaunch"),
  createPost("Q4 2022", 2022, 4, 1, "Migrated 25,000+ token holders to new improved contract", "Moving Forward: Successful Migration of 25,000+ Holders to V2"),
  createPost("Q4 2022", 2022, 4, 2, "Implemented standard ERC20 tokenomics to avoid future issues", "Stability First: Adopting Standard ERC20 Tokenomics"),

  // 2023
  // Q1 2023
  createPost("Q1 2023", 2023, 1, 0, "Alpha launch of complete d'app integrating all ecosystem components", "The Vision Unfolds: Alpha Launch of DeHub's Integrated D'App"),
  createPost("Q1 2023", 2023, 1, 1, "Released tokenised uploads with onchain ad revenue sharing (creators earning 90%)", "Creator Economy Reimagined: Tokenized Uploads & 90% Ad Revenue Share"),
  createPost("Q1 2023", 2023, 1, 2, "Commenced advanced analytics dashboard for creators", "Insights for Creators: Advanced Analytics Dashboard Development Begins"),
  createPost("Q1 2023", 2023, 1, 3, "Recommenced trading of DeHub v2 on Gate.io", "Back in Action: DeHub V2 Trading Resumes on Gate.io"),
  // Q2 2023
  createPost("Q2 2023", 2023, 2, 0, "Won most innovative company award at UK's Corporate Livewire, competing against 900+ companies in a vote based system backed by Sony, Samsung and other industry giants.", "Innovation Recognized: DeHub Wins Corporate Livewire Award"),
  createPost("Q2 2023", 2023, 2, 1, "Featured in major tech publications including TechCrunch and VentureBeat", "In the Spotlight: DeHub Featured in TechCrunch and VentureBeat"),
  createPost("Q2 2023", 2023, 2, 2, "Patent applications commenced for core streaming technology and watch2earn mechanics", "Protecting Innovation: Patent Applications for Streaming & Watch2Earn Tech"),
  // Q3 2023
  createPost("Q3 2023", 2023, 3, 0, "Announced partner airdrop for BJ (now fan.site), the adult fork of DeHub", "Expanding Horizons: Partner Airdrop for Fan.site (BJ Fork)"),
  createPost("Q3 2023", 2023, 3, 1, "Facilitated knowledge transfer and technical support to fork team", "Supporting Growth: Knowledge Transfer to Fan.site Team"),
  createPost("Q3 2023", 2023, 3, 2, "Demonstrated true decentralization principles in action", "Decentralization in Practice: The Fan.site Fork Story"),
  createPost("Q3 2023", 2023, 3, 3, "Established framework for future community-driven forks", "Paving the Way: Framework for Community-Driven Forks"),
  // Q4 2023
  createPost("Q4 2023", 2023, 4, 0, "Voluntary delisting from Gate.io to prioritize decentralization", "Prioritizing Principles: Voluntary Delisting from Gate.io for Decentralization"),
  createPost("Q4 2023", 2023, 4, 1, "Commitment to transparency with all DEX policy implementation", "Open and Clear: DEX Policy Implementation and Transparency Commitment"),
  createPost("Q4 2023", 2023, 4, 2, "Implemented automated liquidity provision strategies", "Smarter Liquidity: Automated Liquidity Provision on DEXs"),
  createPost("Q4 2023", 2023, 4, 3, "Published full transparency reports showing all protocol metrics", "Full Disclosure: DeHub's Comprehensive Transparency Reports"),

  // 2024
  // Q1 2024
  createPost("Q1 2024", 2024, 1, 0, "Listed DHB on Eth mainnet", "Expanding Reach: DHB Lists on Ethereum Mainnet"),
  createPost("Q1 2024", 2024, 1, 1, "Raised $1,000,000 for adult fork BJ (now fan.site) from VCs, Launchpads & Public Sales.", "Fueling Growth: $1M Raised for Fan.site (BJ Fork)"),
  {
    id: 'q1-overview-birds-eye-view',
    title: "Q1 Overview: A Bird's Eye View",
    slug: 'q1-overview-a-birds-eye-view',
    excerpt: 'A bird’s eye view of plans for the rest of this quarter.',
    content: `Given all that's going on with launches and listings, this Q1 overview is more of a marketing schedule we've put together to keep you all in the loop.

### Calendar
**February 5th:** Our partner launch, BJ, the adult fork of DeHub, was announced in Ferrum Network's "The Decentralised Incubator" (TDI) as the latest private sale open exclusively to their DAO and promoted across Ferrum ecosystems and KOLs.

**February 6th:** The Snapshot took place and TDI DAO members prepare for private sales to commence.

**February 7th:** All concluding on Ferrum Network exclusive to TDI DAO members, with one week being the usual turnaround time for tiered access, and $200,000 allocated.

*Already commenced in Ferrum DAO's decentralised incubator (TDI)*

**February 7th:** All bundle buyers airdropped prior to listing.

**February 8th — 10pm UTC:** DeHub's Uniswap listing & Layer Zero bridge release. We're putting up ~50k of DHB and 50k of USDT which keeps dilution low while still large enough for sizeable traders. We will also increase the LP from tax revenue in the following weeks, as well revenue generated from all partner launches as we will be buy back due to our tokenomics anyway. A Large network of paid promoters as well as trending services are being prepared with partner reveals and joint spaces continuing regularly.

**February 9th:** Announce second and final private sale for $BJ on DeHub's marketplace, exclusive for $DHB holders and stakers — This will be shared by a high tier KOL networks of over 1m+ followers combined and utilised by our incubators on all the top launches recently — Expected to sell out $100,000 and drive plenty of eyes to our new era on Ethereum. There will be a large promotional push for new holders to hold or stake at-least 300,000 $DHB to access the $BJ sale, with holders of over 1,000,000 receiving guaranteed allocations.

**February 14th:** $BJ private sale commences on DeHub's marketplace, holders must stake or hold 300,000 $DHB until they claim their first drop of $BJ, in order to buy the private sale. $100,000 of $BJ has been allocated exclusively to DeHub holders and stakers.

**February 14–28th:** Remaining Blocjerk IDOs and launchpads will conclude by end of February, expected to generate over $800,000 in total. Launch LP farm for DeHub with taxes generated and buy backs executed.

**Early March:** BJ listing & APK release (no stores as adult apps not permitted) — expected to generate similar figures to the sales and set BJ app to gain major traction.

**Late March:** DeHub App Store listings & APK release target date. Revenue share for stakers from tax revenue commences. Micro and Macro creator onboarding, focus on PPVs & Watch2earn with capital injection for adoption drive.

**Early April:** $BJ Partnership Airdrop after 1 month cliff, for DeHub stakers. Daily linear release for 48 months as per recently finalised tokenomics also found on the whitepaper.

**Late April:** The next DeHub partner launch first reveal, and mega airdrop for those staking DeHub & $BJ, with exclusive first access on our marketplace. This launch has already secured top launchpads and incubators with an even bigger reach than $BJ, as it's not adult themed so easier to promote. ETA for launch of the next partner project will be Q3–4 2024.

### Wrap Up
After an explosive start to the year, I trust you all share our excitement for how 2024 is shaping up so far as all unfolds. Partner airdrops for club members were always part of our utility and for reasons now becoming more evident. We're building an entire ecosystem here and all launches drive revenue back to DeHub, which has a 100% profit buy back system laid out in the whitepaper. Soon, we envision everyone will have a social token of some kind and we're already building the framework for this in how our uploads work today on dehub.io. Even the way we built the watch2earn / bounty upload system allows users to launch IVOs — initial video offerings. With the PPV feature for pre-sale functions and the bounty feature for the airdrop function. Although $BJ did isolate a sector of our holder base due to the nature of the project, the next one won't.`,
    bannerImage: '/lovable-uploads/ed0c4e36-5a13-4043-9c5f-725f4985cc91.png',
    bannerImageAlt: "Q1 Overview: A Bird's Eye View",
    author: { name: 'DeHub Team' },
    publishedAt: new Date('2024-02-06').toISOString(),
    tags: ['Q1 2024', 'Roadmap', 'Update', 'Marketing', 'Ecosystem'],
    readingTime: 4,
    featured: true,
    status: 'published',
    seoTitle: "DeHub Q1 2024 Overview: A Bird's Eye View",
    seoDescription: 'A bird’s eye view of plans for the rest of this quarter, including launches, listings, and marketing schedules for DeHub and its partners.'
  },
  // Q2 2024
  createPost("Q2 2024", 2024, 2, 0, "Listed SDHB on Base L2", "Layer 2 Expansion: SDHB Lists on Base"),
  createPost("Q2 2024", 2024, 2, 1, "Dubai event expanded Middle East presence", "Global Footprint: DeHub Expands Middle East Presence via Dubai Event"),
  createPost("Q2 2024", 2024, 2, 2, "Co-Founders Mike Hales & Indi Cammish Opened TikTok agency in partnership with TikTok execs directly after successful year topping UK stream charts earning 1k a day", "Entrepreneurial Spirit: Co-Founders Launch TikTok Agency"),
  createPost("Q2 2024", 2024, 2, 3, "Established creator partnerships in 15 countries", "Worldwide Creators: Partnerships Spanning 15 Countries"),
  // Q3 2024
  createPost("Q3 2024", 2024, 3, 0, "Completed major app upgrade with 95% positive user feedback", "Leveling Up: Major App Upgrade Earns 95% Positive Feedback"),
  createPost("Q3 2024", 2024, 3, 1, "Overhauled user interface & improved back end speed by 200%", "Faster and Sleeker: UI Overhaul and 200% Backend Speed Boost"),
  // Q4 2024
  createPost("Q4 2024", 2024, 4, 0, "Released onchain tradable subscriptions", "Revolutionizing Access: On-Chain Tradable Subscriptions Launch"),
  createPost("Q4 2024", 2024, 4, 1, "Released teaser for Last Chad Standing (first ever MMA battle royale) with 1M+ views", "The Hype is Real: Last Chad Standing Teaser Hits 1M+ Views"),
  createPost("Q4 2024", 2024, 4, 2, "Agency grew to UK #1 with 1,000 live streamers signed exclusively", "Leading the Way: DeHub Agency Becomes UK #1 with 1,000 Streamers"),
  createPost("Q4 2024", 2024, 4, 3, "Released DePIN Phase 1", "The Future of Infrastructure: DePIN Phase 1 Goes Live"),

  {
    id: 'developments-overview-sep-2024',
    title: 'Developments Overview',
    slug: 'developments-overview',
    excerpt: 'A summary of major upcoming enhancements, including a platform overhaul, BASE tax removal, new LP initiatives, and a major push in community and marketing efforts.',
    content: `### TLDR;
- 30 day countdown appearing on dehub.io imminently
- Taxes on BASE set to 0 tomorrow at midnight
- Join volume, LP and community/marketing initiatives

## The Major Upgrade
### Overview of Upcoming Enhancements

We are undergoing a complete front-end overhaul, with a modernized, sleek interface. The outdated blue and purple backgrounds will be replaced by a cleaner, minimalist design.
Users will have the option to switch between Dark Mode and Light Mode, providing a personalized experience with either a predominantly black or white interface.
Performance improvements across the platform will make everything faster and smoother, and we've begun integrating the Graph Protocol to further decentralize our backend operations.
The debut of our fiat gateway will mark the completion of full user account abstraction. Anyone will be able to create wallets, purchase tokens, utilize them in-app, and cash out — all without the need for manual wallet management or learning new skills.
We are launching on-chain subscriptions, which will grant access to exclusive creator content, including private group chats. Subscription options include 1, 3, 6-month passes, as well as annual and lifetime plans. Creators will have full control over pricing and availability, while holders will have the option to resell their passes.
Although we've faced challenges with the NFT Username Marketplace, we are close to finalizing the logic and are hopeful it will feature in the upcoming update, however no guarantees here. This is part of our wallet delegation system, allowing agencies and employees such as admins to access CRM tools via delegated wallet control.
Direct Messaging (both free and paid) and social feeds for text and photo uploads will be introduced, transforming us into a comprehensive content hub beyond just video.
Additional features are in the pipeline, which we will address once firm release dates are confirmed.

## Volume Initiative
### Base Taxes Removal & Incentives

Effective tomorrow at midnight (00:00 28/09/24), BASE taxes will be set to 0 until further notice, to drive trading volume.
We are introducing a claim form for traders, offering slippage rebates to those actively contributing to building volume.

## Liquidity Pool (LP) Initiative / Farming
### Enhancing Liquidity

We will be adding a V3 liquidity pool, funded by taxes accumulated and unsold since launch, to increase liquidity for buyers. All funds generated from this pool will be allocated towards buybacks from the existing V2 pools.
We invite all holders to also add V3 pools, which allow you to set your prices on-chain, almost like an invisible orderbook that improves our LP on chain and allows lower slippage entry for whales.
While we had planned to implement an LP farming solution, we are facing challenges due to our extensive development pipeline. A manual LP farm may be introduced as a temporary measure until a more automated solution can be built.

## Community and Marketing Initiative
### Engagement & Expansion

We are finalizing the recruitment of 10 full-time staff who will manage 24/7 voice chats, initiate community-driven activities, and provide dedicated support for app users. These staff members will be contracted for a minimum of six months.
Mike and I will also increase our social media presence significantly, tweeting potentially hundreds of times a day, which will need the community's full support to amplify our voices.
We are confident that, with our combined efforts, DeHub will gain visibility from millions of people on a monthly basis, now supported by our cutting-edge developments.

## Future Plans and Goals
### beyond the existing roadmap

- Launching app for TV and consoles
- Implementing AI-driven tools for thumbnail and description generation
- Integrating AI video generators to allow seamless video uploads
- Expanding partnerships across the entertainment and hospitality sectors`,
    bannerImage: '/lovable-uploads/0932e5d5-086f-4e27-aa97-7f5bdcfd31de.png',
    bannerImageAlt: 'DeHub Developments Overview',
    author: { name: 'DeHub Team' },
    publishedAt: new Date('2024-09-26').toISOString(),
    tags: ['Update', 'Roadmap', 'Development', 'Community', '2024'],
    readingTime: 3,
    featured: false,
    status: 'published',
    seoTitle: 'DeHub Developments Overview - September 2024',
    seoDescription: 'Get the latest on DeHub\'s major upcoming upgrades, including a new UI, fiat gateway, on-chain subscriptions, BASE tax removal, and community growth initiatives.'
  },

  {
    id: 'dehub-town-hall-ama-oct-2024',
    title: 'Town Hall & AMA',
    slug: 'town-hall-ama-october-2024',
    excerpt: 'A summary of our recent Town Hall & AMA session, covering roadmap updates, platform enhancements, and answers to your top questions.',
    content: `We're right on schedule to meet our target for the major overhaul of both the front and back ends. The front will have a sleeker, more streamlined design, while the back end will be significantly faster. We're now holding our own against top providers, but there's still plenty of room to grow as we continue to scale.

When the countdown hits zero, you'll experience a brand-new DeHub. But don't worry — your content and profile will remain untouched. Along with the launch, many of the new features we've talked about will go live, and we'll also unveil a detailed roadmap with clear target dates for the remaining updates. So, you're getting two big things at once: a fresh app and a clearer path forward.

With just over two weeks left until the major upgrade, we hosted a live Spaces session to answer your most pressing questions. Here's a summary of what was discussed:

### 1. Can we get a roadmap with exact release dates?
We regularly provide release dates for imminent updates, such as the countdown on dehub.io now. We'll provide a more detailed roadmap with specific dates for upcoming features with the release of the next upgrade but the core roadmap stays the same. We've kept it phased to allow flexibility since the nature of tech and crypto is always shifting.

### 2. What happened to the gold tick on X (Twitter)?
We lost the gold tick while switching account tiers on Twitter, which resulted in a double charge. We're currently awaiting a refund and customer support. Twitter doesn't allow tier changes without canceling and re-subscribing, which caused the issue. As a UK-registered company that meets all the gold tick criteria, we're determined to get it back. It's a small cost — less than £200 a month which we are spending on ads anyway as comes with ad credits too. We've also had a rough history with Twitter; our original account was permanently banned because I set the birth date to under 13 (reflecting our launch date: 04/20/2021). While we could make some noise, being suspended again would be a hassle. We're just happy to be able to promote on a the platform until our own user base is strong enough.

### 3. Will DeHub return to the BNB Chain?
If we redeploy on BNB, it'll be on opBNB, which is built specifically for scalable apps like ours. Redeployment would require bridging regardless, and opBNB is BNB's new scaling chain, so it makes no sense to return to the legacy BNB chain. In future updates, we'll also discontinue in-app support for old BNB to focus on cutting-edge technology. Of course, users are still free to deploy liquidity pools (LP) where they wish.

### 4. What's the latest on LCFC and the gaming arcade?
While we've shifted focus to the streaming app after our last game releases, the arcade is still available. We're also gearing up for the launch of our 3D hyperrealistic Battle Royale, Last Chad Standing (LCS). This game is a giant leap from the 2D arcade fun we've been having. Combined with our team reach across some of the biggest UFC fighters in the world, we're expecting major adoption of LCS, as a unique game never seen before on or off chain. The only other fighter/weaponless based Battle Royale, (Rumbleverse), discontinued and left a large player base yearning for its return.

### 5. Are Mike and Indi still involved?
Of course, we launched this together, so Mike and Indi are still very much involved. We're actually planning a new strategy to boost Twitter engagement. If anyone's been following either on socials you'll see regular mentions and insights into DeHub and the future. During the bear market, they built one of the most successful TikTok agencies worldwide and are now managing nearly 1,000 streamers, including big names like Beavo, bringing in tens of millions of views daily at their peak. All this expertise is feeding back into what we're building at DeHub, just as we've always envisioned.

### 6. What are the major upcoming releases, and when can we expect them?
Aside from the imminent major upgrade, we've already teased some key features. While we can't provide exact timelines for everything just yet, there are exciting developments underway. As always, we've got some surprises, but timing will depend on our progress. We're working daily to strengthen the protocol and hit significant milestones.

### 7. Can you tell us more about Malik's business background and the Guide Dogs fundraiser?
During my time as a fundraising manager at Guide Dogs, one of the world's largest charities supporting the visually impaired, my team raised over seven figures through events, street canvassing, and ongoing pledges. Before that, I worked in a trainee role while studying Biomedical Science at QA Hospital, with the goal of pursuing medicine, influenced by my family's background in healthcare. However, I realised it wasn't for me and eventually transitioned into business. A career highlight for me was becoming the top-billing agent at Blue Arrow, the UK's largest recruitment agency, outcompeting 70 other offices and 600 staff.

### 8. When is the live streaming feature expected?
We're aiming to launch the live streaming feature within this quarter, though it's a complex build that ties directly into our agency CRM system. We're replicating TikTok's tip-based economy model, which is incredibly intricate. We're hoping to have it ready by Christmas, but we can't guarantee exact dates just yet.

### 9. Do you care about the token price, or is it all about the tech?
We absolutely care about the token price, but we have to be cautious about how we discuss it publicly to avoid any legal risks. Protecting the business and the community is our top priority. That said, in crypto, everything inevitably circles back to the chart — whether we like it or not. We're determined to surpass all past achievements, and we won't stop until we do.

### 10. Will you list on centralized exchanges (CEXs) again?
We're only interested in listing on top-tier CEXs like Binance, Coinbase, and other leading platforms. For now, we're focused on growing organically through community engagement and on-chain volume. Once our volume and LP grow, the top CEXs will naturally want to list us, and we'll aim to do it on our terms. We've never struggled to hit highs without CEXs, and we've actually thrived without them.

### 11. Are there any expected delays after the countdown?
No delays are expected. The major overhaul is ready and will be rolled out at the end of the countdown. Any features not immediately live at launch will be released according to the updated roadmap, which will be shared alongside the upgrade.`,
    bannerImage: '/lovable-uploads/ea33e3a2-72d6-4be8-8648-07293e8b806f.png',
    bannerImageAlt: 'DeHub Town Hall & AMA banner',
    author: { name: 'DeHub Team' },
    publishedAt: new Date('2024-10-11').toISOString(),
    tags: ['Town Hall', 'AMA', 'Community', 'Update', 'Roadmap', '2024'],
    readingTime: 5,
    featured: false,
    status: 'published',
    seoTitle: 'DeHub Town Hall & AMA - October 2024 Update',
    seoDescription: 'Summary of the DeHub Town Hall & AMA from October 2024, covering roadmap updates, X (Twitter) status, BNB chain, new features, and more.'
  },

  {
    id: 'dehub-1m-raise-completed',
    title: '$1,000,000 raise completed',
    slug: '1-million-dollar-raise-completed',
    excerpt: 'DeHub\'s adult fork, Blocjerk (now fan.site) has completed a $1,000,000 raise backed by several notable VCs, influencers, and launchpads.',
    content: `# A New Chapter: $1,000,000 Raised for DeHub's Ecosystem Fork, Fan.site

We are thrilled to announce a monumental milestone in the DeHub journey: our strategic ecosystem fork, Fan.site (formerly Blocjerk), has successfully completed a **$1,000,000 funding round**. This achievement is not just a testament to the robust technology we've meticulously built, but also a powerful validation of our long-term vision for a truly decentralized creator economy.

This raise was backed by a formidable group of strategic investors, thought leaders, and partners who recognize the disruptive potential of our technology. We are proud to be supported by:

*   **Homeless Ventures**: Investors working closely with the likes of zkSync, ANKR & other leading projects.
*   **Brian D Evans**: Founder of BDE Ventures, Inc. 500 entrepreneur and Forbes 40 under 40.
*   **Jett**: President of Hourglass and partner at Apexblock Capital.
*   **The Gem Hunters**: A leading blockchain investment community led by Pandah & BiT_SHaMaN.
*   **Shiney D**: Respected investor & content creator.
*   **Dark Gandalf**: Influential investor & content creator.
*   **Ferrum's TDI**: The Decentralised Incubator.

The overwhelming demand was further demonstrated as several launchpads sold out completely, which was complemented by a highly successful public sale. This widespread belief from both institutional and retail participants underscores the market's appetite for our solution.

## The 'Why' Behind the Fork: A Strategy of Principle and Growth

For those who have been with us since the beginning, you'll know that airdrops and ecosystem expansion have been core to our utility since the first whitepaper was drafted in 2021. With the DeHub platform nearing its full-featured completion, the pace for new brands and applications building on our foundational technology is set to accelerate dramatically.

The decision to create Fan.site as a separate, yet connected, entity was a deliberate and strategic one, rooted in our core principles of scalability and market focus. A collection of large, long-term DeHub holders identified a significant opportunity in the vast adult entertainment market—an industry ripe for disruption. However, rather than integrating this content into the primary DeHub application, we firmly believe it is far better to **separate markets and communities**. This approach allows each platform to tailor its user experience, community guidelines, and marketing efforts to its specific target audience without compromise.

As our whitepaper outlines, adult content presents unique and complex challenges, especially regarding the protection of minors and respecting the diverse values of a global community. By creating a dedicated fork, we uphold our unwavering commitment to **permissionless innovation**—a cornerstone of the blockchain ethos—while simultaneously maintaining the integrity and focus of the main DeHub platform. We cannot and should not stop someone from forking our open-source app, but we can and will guide the process to ensure it benefits the entire ecosystem.

We want to be explicitly clear: if you are under 18 or uncomfortable with the adult market for any reason, we respect that completely. You can simply await the next DeHub ecosystem airdrop, which we are confident you will love.

## From Straight-to-Listing to a Strategic War Chest

Our original plan for this venture was a more conventional direct-to-listing model. However, the dynamic and often volatile nature of the crypto market presented a new, more powerful opportunity. We made the strategic pivot to pursue a significant fundraise, aiming to secure a substantial launch budget that would ensure Fan.site could achieve global recognition and withstand any market condition.

By securing a **$1,000,000 war chest**, we have provided the project with a multi-year runway. This capital injection is a game-changer. It enables us to execute a robust, multi-channel marketing strategy, accelerate development of cutting-edge features, and compete at the highest level from day one. To execute this vision, we've assembled a powerhouse team, including the marketing experts behind successful projects like $PAAL, a top-tier advisory board, and incubators with deep connections to all the top exchanges and launchpads.

## Fueling the DeHub Engine: A Virtuous Economic Cycle

This raise is a victory not just for Fan.site, but for every single member of the DeHub community. A crucial and non-negotiable component of this model is the direct value accrual back to DeHub and its most loyal supporters.

A remarkable **10% of all revenue generated by Fan.site will be used to systematically buy back $DHB on the open market and distribute it directly to all stakers.**

This mechanism creates a powerful, symbiotic, and self-sustaining economic relationship. The success of Fan.site directly translates into a stronger DeHub token through constant buy pressure, increased rewards for our stakers, and greater on-chain liquidity for the entire network. It's the ultimate testament to our vision of creating an interconnected ecosystem where every component's success contributes to the strength of the whole. Furthermore, my personal share and key interests from this venture will also be directed towards injecting capital back into DeHub and raising awareness for our core network.

## The Market Opportunity and DeHub's Unfair Advantage

The adult market, while massive, is notoriously plagued by systemic issues: discriminatory payment processors, exorbitant fees for creators, and rampant censorship. Blockchain technology, and specifically the DeHub tech stack, is uniquely positioned to solve these deep-rooted problems. Fan.site will leverage our robust infrastructure to offer creators and users a superior experience built on the principles of privacy, security, and fair, transparent compensation.

The business model is designed for high efficiency. The adult market often presents lower customer acquisition costs and higher potential returns on investment compared to more saturated sectors. This operational efficiency will maximize the revenue directed back to the DeHub ecosystem, creating a flywheel effect that accelerates the growth of the entire network.

## What's Next on the Roadmap?

With the fundraise successfully completed, we are moving full steam ahead. An aggressive marketing drive will commence shortly, with further details on vesting schedules, token values, and precise launch timings to be provided to the community in the coming weeks. The token generation event is on the horizon, and we want to remind everyone that the **snapshots for the airdrop are final**. We strongly encourage all our supporters to remain staked to ensure they receive their full allocation.

This is more than just a fundraise; it's the dawn of a new era for DeHub. We are not just building an app; we are building a decentralized powerhouse, and we are eternally grateful to our community for their unwavering trust and support on this journey.

We are together, forever.`,
    bannerImage: 'https://images.unsplash.com/photo-1487058792275-0ad4aaf24ca7?ixlib=rb-4.0.3&fit=crop&w=1200&h=600&q=80',
    bannerImageAlt: '$1,000,000 raise for fan.site',
    author: { name: 'DeHub Team' },
    publishedAt: new Date('2024-03-08').toISOString(),
    tags: ['Fundraising', 'Fan.site', 'Investment', '2024', 'Ecosystem'],
    readingTime: 6,
    featured: true,
    status: 'published',
    seoTitle: '$1,000,000 Raise Completed for DeHub\'s Fork, Fan.site',
    seoDescription: 'DeHub\'s adult fork, Blocjerk (now fan.site) has completed a $1,000,000 raise backed by several notable VCs, influencers, and launchpads, ensuring a multi-year runway.'
  },

  {
    id: 'dehub-1-year-review-gate-delist',
    title: '1 Year Review; A Quick Look Back',
    slug: '1-year-review-a-quick-look-back',
    excerpt: 'A year ago, we took a bold step and decided to delist from gate.io. This is a look back at that decision and our commitment to decentralization.',
    content: `A year ago, we took a bold step and decided to delist ourself from gate.io after they ended UK support. At this stage, our multi-million dollar liquidity pool (LP) was relentlessly drained by arb bots and questionable activity for years, so we had to make decisions to protect our network.

After almost a year of withdrawals, over 120,000,000 still remained on Gate, almost exactly as predicted in [this article last year](https://medium.com/@dehub.bsc/were-turning-back-time-2bfd4723fe86).

As we prepare to redeploy capital back to BNB and to protect our upcoming LP, all tokens left on gate.io have been burned again, barring ~1m for small left over withdrawals.

## Future Withdrawals

If you failed to withdraw in time, have been locked out of your account, or had your account closed, simply DM us, email tech@dehub.net or fill in this form for recovery assistance.

## Why did it take so long to redeploy to BNB?

After we announced our plans, Gate couldn't provide the wallet address data that would have allowed us to verify holders for airdrops during our migration. They informed us their systems don't allow this so the only way was to re-mint the tokens and open withdrawals. So until enough withdrawals and time passed, as it has now, deploying back on BNB was just a risk of further LP draining.

## Conclusion

This all fully affirms our decision to delist ourself, go all DEX and stay true to the values that make this industry so great.

While crypto is an unregulated cesspit of scammers, grifters and chancers, the lack of regulation is exactly what makes it so beautiful at the same time. Untamed innovation, true capitalism. For "every action has an equal an opposite reaction" — Newton's Third Law is one I've associated to most through out life and it couldn't be more true with crypto. It's also why we've never stopped building; for every setback, there is an equal and opposite opportunity.

Thank you for trusting and supporting us through these unprecedented actions, all to ensure the success of DeHub and protection of investors.`,
    bannerImage: '/lovable-uploads/ffb3a54c-cb66-4856-b9ff-491567ce3324.png',
    bannerImageAlt: 'A Look Back In Time',
    author: { name: 'DeHub' },
    publishedAt: new Date('2024-11-12').toISOString(),
    tags: ['Gate.io', 'Delisting', 'DEX', 'Transparency', 'Strategy', '2024'],
    readingTime: 2,
    featured: true,
    status: 'published',
    seoTitle: 'DeHub\'s Gate.io Delisting: A 1-Year Review',
    seoDescription: 'One year after delisting from Gate.io, DeHub reviews the decision and reaffirms its commitment to decentralization. Learn more about our journey.',
  },

  // 2025
  // Q1 2025
  createPost("Q1 2025", 2025, 1, 0, "Released onchain live streams with real-time tip animations", "Interactive Streaming: On-Chain Live Streams with Animated Tips"),
  createPost("Q1 2025", 2025, 1, 1, "Implemented Livepeer infrastructure supporting 50,000+ concurrent viewers with the ability of unlimited (in theory) on higher spend tiers.", "Scaling New Heights: Livepeer Integration for 50k+ Concurrent Viewers"),
  createPost("Q1 2025", 2025, 1, 2, "Built custom CDN reducing latency to sub-200ms globally", "Speed of Light: Custom CDN Achieves Sub-200ms Global Latency"),
  createPost("Q1 2025", 2025, 1, 3, "Achieved 99.99% uptime across all streaming services", "Reliability Perfected: 99.99% Uptime for DeHub Streaming"),
  createPost("Q1 2025", 2025, 1, 4, "Discontinue Ethereum Mainnet support", "Strategic Shift: Discontinuing Ethereum Mainnet Support for DHB"),
  createPost("Q1 2025", 2025, 1, 5, "Completed messaging system with paid or free DMs and unlockable chat content", "Connect and Converse: Advanced Messaging System with Paid/Free DMs"),
  createPost("Q1 2025", 2025, 1, 6, "Released full trailer for Last Chad Standing, picked up by major MMA promoters", "Main Event Ready: Last Chad Standing Full Trailer Gains MMA Promoter Attention"),
  // Q2 2025
  createPost("Q2 2025", 2025, 2, 0, "Launched UGC ambassadorship program with 50 vacancies", "Community Champions: UGC Ambassadorship Program Launched"),
  createPost("Q2 2025", 2025, 2, 1, "Implemented comprehensive creator education curriculum", "Empowering Talent: Comprehensive Creator Education Curriculum Rolls Out"),
  createPost("Q2 2025", 2025, 2, 2, "Released dhbscan.com for users to track activity across all DHB contracts", "Transparency Hub: dhbscan.com Launches for Contract Activity Tracking"),
  createPost("Q2 2025", 2025, 2, 3, "Revamped main app feed, revealed audio replies and live talk spaces", "Fresh Experience: Revamped App Feed with Audio Replies & Live Talk Spaces"),
  createPost("Q2 2025", 2025, 2, 4, "Final snapshot for Last Chad Standing game airdrop, for both holders and stakers", "Get Ready Players: Final Snapshot for Last Chad Standing Airdrop"),
];

const gateDelistingSlug = 'prioritizing-principles-voluntary-delisting-from-gateio-for-decentralization-a-dehub-milestone-from-q4-2023';
const gateDelistingPost = blogPosts.find(p => p.slug === gateDelistingSlug);

if (gateDelistingPost) {
  gateDelistingPost.content = `### TLDR
- $DHB has delisted from Gate.io and all their tokens have been burnt
- Three-week recovery period for Gate.io token holders
- Conversion of entire tech stack and new token integration for all apps
- With all the above, audits and testing we will require time
- Target date for launch set to January 22nd-29th (Now confirmed at Feb 8th)

### In Detail
My initial fascination with crypto stemmed from its immutability, transparency, decentralization and permissionlessness.

Immutability means for the first time in history, humans can record data which can never be altered or removed.

Open-source code is the only thing in this world that cannot lie to you. Offering true transparency and arguably the only source of truth we will find in the new digital world.

Permissionless decentralized apps and services are the final cog to automating the world.

All of these factors are eliminated by centralized exchanges (CEX). Anyone who participated in our early town halls will recall my attitude towards all of them apart from Binance. However, that changed over time due to the demands of the community and past marketing team members. Unfortunately, it was a mistake, which we are now correcting.

CEXs are broken, encompassing everything blockchains strive not to be. They go against all core values instilled during the birth of this wonderful industry. These values are the reason I fell in love with this space and dedicated my life to it.

XT still owes us nearly six figures in unpaid tax revenue generated after our listing. We all know what happened on Gate as we approached 1000x ROI with millions in our LP. Thousands of BUSD are stuck on Gate with no retrieval assistance. Two of our founders and one of our admins have been locked out of their accounts for nearly a year. Gate is no longer servicing the UK, our corporate base of operations. Furthermore, all holders from newly restricted areas who do not remove their assets by January 2nd, 2024, automatically lose them! This is absurd! Even a conservative 20% fall off rate would equate to over 100,000,000 $DHB left on Gate.

So, this was never just a migration. We are going to de-list and burn all Gate tokens to protect holders from any malpractice. We did this previously with XT after delisting and only 25% of the user tokens have been claimed.

We will spend three weeks recovering $DHB for all Gate holders. After this time, all claims will be on a vest as we proceed with our DEX launch by January 29th. Additionally, during this period, we are migrating our entire tech stack, finalizing our app with new multichain tokens and testing everything for deployment. This is not a small job.

All Gate holders need to fill out this form for recovery.

Any claims after January 21 will be subject to vests and any unclaimed tokens will be burned after 12 months. Claims after this period can still have tokens re-minted if claims can be validated.

To protect user privacy, we have asked the Gate team to provide us with account user ID's and balances so we can reimburse holders swiftly. We are THE decentralized entertainment hub. We never needed a centralized exchange, and we never will again. Any exchange that wants to list $DHB may buy tokens off the open market like the rest of us and do with them as they please. Although they need to keep in mind the DAO could vote to burn their tokens if they pose a threat to our ecosystem.

Although a bold and surprising move, true supporters who believe in what we are building, will rejoice with us as they read this development. Anyone displeased may take comfort knowing this was best for the project, and one of my final acts as a solitary decision maker. Governance protocols will deploy soon.

![WHAT IF](/lovable-uploads/d7790305-e44d-4c36-9b9f-0e16fa02c245.png)`;
  gateDelistingPost.readingTime = 5;
}

const airdropPostTitle = `Expanding Horizons: Partner Airdrop for Fan.site (BJ Fork) - A DeHub Milestone from Q3 2023`;
const airdropPostSlug = generateSlug(airdropPostTitle);
const airdropPost = blogPosts.find(p => p.slug === airdropPostSlug);

if (airdropPost) {
  airdropPost.publishedAt = new Date('2023-11-21').toISOString();
  airdropPost.readingTime = 3;
  airdropPost.content = `All the ins and outs for the second airdrop revealed this month!

For those unaware, airdrops have been part of our utility since the first whitepaper in 2021. Expect the pace for new airdrops to accelerate as more brands build on top of the DeHub platform that's now nearing completion.

Our third airdrop this quarter will be announced next month so be sure you remain staked!

A collection of large and long term DeHub holders made the decision to fork the DeHub app and target the vast adult market. All interested DeHub stakers can claim a portion of the token supply through the upcoming airdrop.

Rather than having adult content on the DeHub app, it's far better to separate markets and communities. People of all opinions and faiths will agree this is the best strategy for obvious reasons.

As per the whitepaper, adult content presents complex challenges for properly protecting children, the vulnerable and people of all religious faiths. Given the mature nature of the content, we are intentionally minimizing communications between communities and there will be no cross promoting. We also do not want to risk our X account being marked as sensitive.

With open-source technology and blockchain industry culture, permissionless innovation is paramount to the advancement of humanity. As individuals, we may not always agree with every industry, but we cannot stop someone from forking our app and airdropping our holders.

If you are under 18 or uncomfortable with the adult market for any reason, just close this page and wait for the next airdrop. We are confident it will be something you love.

## Key Points / Changes

Original plans were a straight to listing model. However, several factors, including the markets, presented a new opportunity. Recently we secured the team behind a number of instant sell outs and they are confident we can raise $600,000, providing an exceptional launch budget. This ensures the world will know about us.

Naturally, my share and key interests will go towards injecting capital to DeHub and raising awareness for our network.

We have secured the marketing team working with $PAAL, a solid advisory board, and incubators connected to all the top exchanges and launchpads. We have also confirmed agreements with some of the biggest KOLs and influencers in the cryptosphere, who will be supporting this launch.

The new token generation event is scheduled to take place before Christmas, as you know we're finalising the app. Your snapshots are final, so just remain staked or re-stake until your airdrops are complete.

Marketing drives will fully commence next week, with further details on vest, values, and timings being provided prior to launch.

The adult market comes with lower customer acquisition cost, lower brand royalties, and higher return on investment. This should efficiently drive increased capital to the network.

If you want to get involved, follow the steps below.`;
  airdropPost.seoTitle = "DeHub's Partner Airdrop for Fan.site Fork | November Update";
  airdropPost.seoDescription = "All the details on the partner airdrop for Fan.site, the adult fork of DeHub. Learn about the airdrop, strategy, and key updates for DeHub stakers.";
}

const transparencyPostSlug = 'full-disclosure-dehubs-comprehensive-transparency-reports---a-dehub-milestone-from-q4-2023';
const transparencyPost = blogPosts.find(p => p.slug === transparencyPostSlug);

if (transparencyPost) {
  transparencyPost.title = "What's in store for the end of the year?";
  transparencyPost.excerpt = "A quick overview of exciting updates coming before the end of 2023, including Streaming, Arcade, Shop, and more.";
  transparencyPost.bannerImage = '/lovable-uploads/131924d4-97f2-468e-9b52-cbf384e718ea.png';
  transparencyPost.bannerImageAlt = "Bird's Eye Overview";
  transparencyPost.content = `### What's in store for the end of the year?

2023 has quickly flashed before our eyes, but we still have many exciting updates coming before yearend.

Curious? Here is a quick overview:

### Streaming
All features are scheduled to be complete and launched on stores by yearend.

As you likely know, our team are already successful streamers with over 500,000 followers combined as well as a leading social media agency.

Given our expertise and proven track record off-chain, there is no doubt users and creators are coming, and we continue to ensure the framework is in place to support them.

### Arcade
The new user interface will be complete along with the addition of at least two more custom mini games for some festive activities.

Our latest release, Street Slayer, will have some overpowered combos nerfed before we live stream competitive tournaments, of which you should expect many! So get slaying.

The trailer for the cinematic release of "Last Chad Standing" is set for December 18th. The world's first MMA inspired battle royale will be a hyper-realistic, gory, and gritty fighting experience unlike anything seen before.

### Shop
Landing soon is our fiat on/off ramp to purchase items and bundles. Along with the wallet generation and confirmation automation, buying tokens to store or use on the DeHub app will feel native to any internet user.

A refund is coming for all house raffle purchases, as sales did not hit the required minimum. However, the minted NFT still holds value and will be incorporated into our app. Smaller raffles for toys, memberships or holidays could make for some festive fun as we approach the season of giving.

### General Operations
The highly anticipated partner airdrop reveal is coming on November 21st. If you staked before a deadline, you must remain staked until you've received your allocated airdrop. Anyone who un-stakes before the airdrop is complete, but was staked during the deadline, must also re-stake to qualify. Drops like these cater to club members. Those staking for the entire duration need not do a thing.

The recent events you saw unfold with inter-community rivalries is important and rest assured it is just beginning. We will be going after Rumble, Kick, YouTube, Twitch, and any other competitors the same way they go after each other today. It is the natural order for competing businesses.

Remember "Stream Wars"… controversial, headline grabbing, internet breaking publicity stunts. As we grow, we will leverage these as tools to promote DeHub and get it in front of people's faces.

We are building the solution many are realizing is necessary. The evidence is visible with the rise of Rumble and the worldwide outcry against censorship, demonetization, and archaic moderation.`;
  transparencyPost.seoTitle = "DeHub: What's in store for the end of 2023?";
  transparencyPost.seoDescription = "A quick overview of exciting updates coming before the end of 2023, including Streaming, Arcade, Shop, and general operations for DeHub.";
  transparencyPost.readingTime = 3;
}
