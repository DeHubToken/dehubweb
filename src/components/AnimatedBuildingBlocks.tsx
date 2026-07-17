
import React from 'react';
import { Building, Blocks } from 'lucide-react';

const AnimatedBuildingBlocks = () => {
  return (
    <div className="relative w-full h-64 flex items-center justify-center overflow-hidden">
      {/* Background blocks */}
      <div className="absolute inset-0 opacity-10">
        {[...Array(12)].map((_, i) => (
          <div
            key={i}
            className="absolute w-8 h-8 bg-gray-200 rounded animate-pulse"
            style={{
              left: `${Math.random() * 90}%`,
              top: `${Math.random() * 90}%`,
              animationDelay: `${Math.random() * 2}s`,
              animationDuration: `${2 + Math.random() * 2}s`
            }}
          />
        ))}
      </div>
      
      {/* Main building blocks */}
      <div className="relative z-10 flex space-x-8">
        <div className="animate-bounce" style={{ animationDelay: '0s' }}>
          <Blocks className="w-16 h-16 text-light-silver" />
        </div>
        <div className="animate-bounce" style={{ animationDelay: '0.2s' }}>
          <Building className="w-16 h-16 text-medium-silver" />
        </div>
        <div className="animate-bounce" style={{ animationDelay: '0.4s' }}>
          <Blocks className="w-16 h-16 text-jet-black" />
        </div>
      </div>
      
      {/* Floating elements */}
      <div className="absolute top-4 left-4 w-4 h-4 bg-light-silver rounded-full animate-ping" style={{ animationDelay: '1s' }} />
      <div className="absolute top-8 right-8 w-3 h-3 bg-medium-silver rounded-full animate-ping" style={{ animationDelay: '1.5s' }} />
      <div className="absolute bottom-6 left-1/3 w-5 h-5 bg-gray-400 rounded animate-pulse" style={{ animationDelay: '0.8s' }} />
      <div className="absolute bottom-4 right-1/4 w-6 h-6 bg-gray-200 rounded animate-pulse" style={{ animationDelay: '2s' }} />
    </div>
  );
};

export default AnimatedBuildingBlocks;
