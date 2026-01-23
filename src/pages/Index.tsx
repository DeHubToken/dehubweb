import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FuturisticAlienHero } from "@/components/ui/futuristic-alien-hero";
import { SKIP_LANDING_PAGE_KEY } from '@/constants/app.constants';

const Index = () => {
  const navigate = useNavigate();

  useEffect(() => {
    const skipLanding = localStorage.getItem(SKIP_LANDING_PAGE_KEY);
    if (skipLanding === 'true') {
      navigate('/app', { replace: true });
    }
  }, [navigate]);

  return <FuturisticAlienHero />;
};

export default Index;
