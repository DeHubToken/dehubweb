import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Clock } from 'lucide-react';
import AnimatedBuildingBlocks from './AnimatedBuildingBlocks';
interface ComingSoonPageProps {
  title: string;
  description?: string;
  additionalNote?: React.ReactNode;
}
const ComingSoonPage = ({
  title,
  description,
  additionalNote
}: ComingSoonPageProps) => {
  return <div className="min-h-[60vh] flex items-center justify-center">
      <Card className="max-w-2xl w-full mx-4 border-gray-200 bg-gradient-to-br from-white to-gray-50">
        <CardContent className="p-8 text-center space-y-6">
          
          
          
          
          <AnimatedBuildingBlocks />
          
          <div className="space-y-3">
            <p className="text-gray-700 font-exo text-lg">
              {description || "This section is currently under construction."}
            </p>
            
            {additionalNote && <div className="pt-4 border-t border-gray-200">
                {additionalNote}
              </div>}
          </div>
          
          <div className="flex justify-center space-x-2 pt-4">
            <div className="w-2 h-2 bg-light-silver rounded-full animate-bounce" style={{
            animationDelay: '0s'
          }} />
            <div className="w-2 h-2 bg-medium-silver rounded-full animate-bounce" style={{
            animationDelay: '0.2s'
          }} />
            <div className="w-2 h-2 bg-jet-black rounded-full animate-bounce" style={{
            animationDelay: '0.4s'
          }} />
          </div>
        </CardContent>
      </Card>
    </div>;
};
export default ComingSoonPage;