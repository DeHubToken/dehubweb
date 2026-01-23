import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { FuturisticAlienHero } from "@/components/ui/futuristic-alien-hero";

const SKIP_LANDING_KEY = "dehub_skip_landing";

const Index = () => {
  const navigate = useNavigate();

  useEffect(() => {
    // Check if user has previously closed the hero - skip to app
    if (localStorage.getItem(SKIP_LANDING_KEY) === "true") {
      navigate("/app", { replace: true });
    }
  }, [navigate]);

  return <FuturisticAlienHero />;
};

export default Index;
