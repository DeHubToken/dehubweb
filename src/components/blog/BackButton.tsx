
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

const BackButton: React.FC = () => {
  const navigate = useNavigate();

  const handleBack = () => {
    // Navigate back to blog - scroll position will be restored by Blog component
    navigate('/docs/blog');
  };

  return (
    <Button
      variant="ghost"
      onClick={handleBack}
      className="mb-6 text-jet-black hover:text-gray-600 hover:bg-gray-100 transition-colors duration-200 font-exo"
    >
      <ArrowLeft className="w-4 h-4 mr-2" />
      Back to Blog
    </Button>
  );
};

export default BackButton;
