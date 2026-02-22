import { lazy, Suspense, useEffect } from "react";
import { useNavigate } from "react-router-dom";

const FuturisticAlienHero = lazy(() =>
  import("@/components/ui/futuristic-alien-hero").then((m) => ({
    default: m.FuturisticAlienHero,
  }))
);

const SKIP_LANDING_KEY = "dehub_skip_landing";

const Index = () => {
  const navigate = useNavigate();

  useEffect(() => {
    if (localStorage.getItem(SKIP_LANDING_KEY) === "true") {
      navigate("/app", { replace: true });
    }
  }, [navigate]);

  return (
    <Suspense fallback={<div className="min-h-screen bg-black" />}>
      <FuturisticAlienHero />
    </Suspense>
  );
};

export default Index;
