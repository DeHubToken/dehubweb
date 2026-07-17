
import React from 'react';

const ModerationFlowchart = () => {
  return (
    <div className="my-8 p-8 bg-gradient-to-br from-slate-50 to-blue-50 rounded-xl border border-slate-200">
      <div className="flex flex-col items-center space-y-6 max-w-4xl mx-auto">
        
        {/* Creator uploads video */}
        <div className="bg-royal-blue text-white px-8 py-4 rounded-xl text-center font-medium shadow-lg">
          Creator uploads video
        </div>
        
        {/* Vertical line */}
        <div className="w-px h-8 bg-slate-400"></div>
        
        {/* Viewer clicks to vote */}
        <div className="bg-royal-blue text-white px-8 py-4 rounded-xl text-center font-medium shadow-lg">
          Viewer clicks to vote
        </div>
        
        {/* Vertical line */}
        <div className="w-px h-8 bg-slate-400"></div>
        
        {/* Moderator? decision point with side branches */}
        <div className="relative w-full flex justify-center">
          {/* Left branch - Video removed */}
          <div className="absolute left-8 top-0 flex items-center">
            <div className="bg-red-500 text-white px-6 py-3 rounded-xl text-center font-medium shadow-lg">
              Video removed
            </div>
            <div className="w-16 h-px bg-slate-400 ml-4"></div>
            <span className="text-sm font-medium text-slate-700 ml-2">Yes</span>
          </div>
          
          {/* Center - Moderator? */}
          <div className="bg-sky-blue text-slate-800 px-8 py-4 rounded-xl text-center font-medium shadow-lg">
            Moderator?
          </div>
        </div>
        
        {/* No branch down */}
        <div className="flex flex-col items-center">
          <span className="text-sm font-medium text-slate-700 mb-2">No</span>
          <div className="w-px h-6 bg-slate-400"></div>
        </div>
        
        {/* Staking DeHub? decision point with side branches */}
        <div className="relative w-full flex justify-center">
          {/* Left branch - Vote unavailable */}
          <div className="absolute left-8 top-0 flex items-center">
            <div className="bg-purple-500 text-white px-6 py-3 rounded-xl text-center font-medium shadow-lg">
              Vote unavailable
            </div>
            <div className="w-16 h-px bg-slate-400 ml-4"></div>
            <span className="text-sm font-medium text-slate-700 ml-2">No</span>
          </div>
          
          {/* Center - Staking DeHub? */}
          <div className="bg-sky-blue text-slate-800 px-8 py-4 rounded-xl text-center font-medium shadow-lg">
            Staking DeHub?
          </div>
        </div>
        
        {/* Yes branch down */}
        <div className="flex flex-col items-center">
          <span className="text-sm font-medium text-slate-700 mb-2">Yes</span>
          <div className="w-px h-6 bg-slate-400"></div>
        </div>
        
        {/* Over 50m? decision point with side branches */}
        <div className="relative w-full flex justify-center">
          {/* Left branch - Video removed */}
          <div className="absolute left-8 top-0 flex items-center">
            <div className="bg-red-500 text-white px-6 py-3 rounded-xl text-center font-medium shadow-lg">
              Video removed
            </div>
            <div className="w-16 h-px bg-slate-400 ml-4"></div>
            <span className="text-sm font-medium text-slate-700 ml-2">Yes</span>
          </div>
          
          {/* Center - Over 50m? */}
          <div className="bg-sky-blue text-slate-800 px-8 py-4 rounded-xl text-center font-medium shadow-lg">
            Over 50m?
          </div>
        </div>
        
        {/* No branch down */}
        <div className="flex flex-col items-center">
          <span className="text-sm font-medium text-slate-700 mb-2">No</span>
          <div className="w-px h-6 bg-slate-400"></div>
        </div>
        
        {/* Staking weight calculator */}
        <div className="bg-royal-blue text-white px-8 py-4 rounded-xl text-center font-medium shadow-lg">
          Staking weight<br />calculator
        </div>
        
        {/* Vertical line */}
        <div className="w-px h-8 bg-slate-400"></div>
        
        {/* Vote Registered */}
        <div className="bg-royal-blue text-white px-8 py-4 rounded-xl text-center font-medium shadow-lg">
          Vote Registered
        </div>
        
        {/* Vertical line */}
        <div className="w-px h-8 bg-slate-400"></div>
        
        {/* 90% cancel rate decision point with side branch */}
        <div className="relative w-full flex justify-center">
          {/* Left branch - Bounty and Ad revenue shared */}
          <div className="absolute left-0 top-0 flex items-center">
            <div className="bg-royal-blue text-white px-6 py-3 rounded-xl text-center font-medium shadow-lg max-w-48">
              Bounty and Ad revenue shared between all voting wallets
            </div>
            <div className="w-16 h-px bg-slate-400 ml-4"></div>
          </div>
          
          {/* Center - 90% cancel rate after 1000 views? */}
          <div className="bg-sky-blue text-slate-800 px-8 py-4 rounded-xl text-center font-medium shadow-lg">
            90% cancel rate after<br />1000 views?
          </div>
        </div>
        
        {/* No branch down */}
        <div className="flex flex-col items-center">
          <span className="text-sm font-medium text-slate-700 mb-2">No</span>
          <div className="w-px h-6 bg-slate-400"></div>
        </div>
        
        {/* Video remains live */}
        <div className="bg-royal-blue text-white px-8 py-4 rounded-xl text-center font-medium shadow-lg">
          Video remains live
        </div>
        
        {/* Connecting line from bounty box down and across to Video removed */}
        <div className="relative w-full mt-8">
          <div className="flex justify-center">
            <div className="bg-red-500 text-white px-8 py-4 rounded-xl text-center font-medium shadow-lg">
              Video removed
            </div>
          </div>
          
          {/* L-shaped connector from bounty box to final video removed */}
          <div className="absolute left-24 -top-32">
            <div className="w-px h-24 bg-slate-400"></div>
            <div className="w-80 h-px bg-slate-400"></div>
            <div className="absolute left-80 top-0">
              <div className="w-px h-32 bg-slate-400"></div>
            </div>
          </div>
        </div>
      </div>
      
      <div className="text-center text-slate-500 text-sm mt-8 italic">
        Decentralised moderation mining and revenue share model
      </div>
    </div>
  );
};

export default ModerationFlowchart;
