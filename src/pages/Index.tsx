import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
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

  return <FuturisticAlienHero />;
};

export default Index;
