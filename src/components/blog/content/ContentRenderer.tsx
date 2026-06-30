
import React from 'react';
import { BlockRenderer } from './BlockRenderer';
import { PostSpecificContent } from './PostSpecificContent';

interface ContentRendererProps {
  text: string;
}

export const ContentRenderer: React.FC<ContentRendererProps> = ({ text }) => {
  const blocks = text.split('\n\n');
  
  return (
    <>
      {blocks.map((block, index) => (
        <BlockRenderer key={index} block={block} index={index} />
      ))}
      
      <PostSpecificContent />
    </>
  );
};
