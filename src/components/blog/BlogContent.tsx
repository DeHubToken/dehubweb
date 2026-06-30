
import React from 'react';
import { ContentRenderer } from './content/ContentRenderer';
import { TeamSection } from './content/TeamSection';
import { PostSpecificSections } from './content/PostSpecificSections';

interface BlogContentProps {
  content: string;
}

const BlogContent: React.FC<BlogContentProps> = ({ content }) => {
  const renderContent = () => {
    if (content.includes('[TEAM_SECTION_START]')) {
      const parts = content.split('[TEAM_SECTION_START]');
      const before = <ContentRenderer key="before" text={parts[0]} />;
      const teamAndAfter = parts[1].split('[TEAM_SECTION_END]');
      const teamContent = teamAndAfter[0];
      const after = teamAndAfter.length > 1 ? <ContentRenderer key="after" text={teamAndAfter[1]} /> : [];
      const renderedTeam = <TeamSection key="team-section" content={teamContent} />;
      
      return [before, renderedTeam, after];
    }
    return <ContentRenderer text={content} />;
  };

  return (
    <div className="prose prose-lg max-w-none">
      {renderContent()}
      <PostSpecificSections content={content} />
    </div>
  );
};

export default BlogContent;
