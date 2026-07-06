import { SEOHead } from "@/components/SEOHead";
import { FuturisticAlienHero } from "@/components/ui/futuristic-alien-hero";

const Index = () => {
  return (
    <>
      <SEOHead
        title="DeHub — Open Source Social Media"
        description="DeHub is open source, user owned and censorship resistant media. Join the decentralized future of social."
        url="https://dehub.io"
        jsonLd={{
          '@context': 'https://schema.org',
          '@graph': [
            {
              '@type': 'WebSite',
              name: 'DeHub',
              url: 'https://dehub.io',
              description: 'Open source, user owned and censorship resistant media.',
              potentialAction: {
                '@type': 'SearchAction',
                target: 'https://dehub.io/app/explore?q={search_term_string}',
                'query-input': 'required name=search_term_string',
              },
            },
            {
              '@type': 'Organization',
              name: 'DeHub',
              url: 'https://dehub.io',
              logo: 'https://aigxuutjaqsywioxjefr.supabase.co/storage/v1/object/public/logo/default-icon.png',
              sameAs: ['https://x.com/DeHubApp'],
              description: 'Open source, user owned and censorship resistant social media platform.',
            },
          ],
        }}
      />
      <FuturisticAlienHero />
    </>
  );
};

export default Index;
