import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { SEOHead } from "@/components/SEOHead";
import { FuturisticAlienHero } from "@/components/ui/futuristic-alien-hero";

const SKIP_LANDING_KEY = "dehub_skip_landing";

const Index = () => {
  const navigate = useNavigate();

  // Synchronous guard — skip rendering the hero at all for returning users
  const shouldSkip = typeof window !== 'undefined' && localStorage.getItem(SKIP_LANDING_KEY) === "true";

  useEffect(() => {
    if (shouldSkip) {
      navigate("/app", { replace: true });
    }
  }, [navigate, shouldSkip]);

  if (shouldSkip) return null;

  return (
    <>
      <SEOHead
        title="Open Source Social Media"
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
