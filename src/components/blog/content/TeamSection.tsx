
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

interface TeamMember {
  name: string;
  role: string;
  photo: string;
  bio: string;
  experience: string[];
  initials: string;
}

const parseTeamMembers = (content: string): TeamMember[] => {
  const members: TeamMember[] = [];
  const memberBlocks = content.trim().split('### ').filter(b => b.trim() !== '');
  
  for (const block of memberBlocks) {
    const lines = block.trim().split('\n').filter(l => l.trim() !== '');
    if (lines.length < 2) continue;
    
    const header = lines.shift()!.split(' - ');
    const name = header[0]?.trim() ?? 'N/A';
    const role = header[1]?.trim() ?? 'N/A';
    
    const imageLine = lines.shift()!;
    const imageUrlMatch = imageLine.match(/\((.*?)\)/);
    const imageUrl = imageUrlMatch ? imageUrlMatch[1] : '';
    
    const bioLines: string[] = [];
    const experience: string[] = [];
    let readingBio = true;
    
    for (const line of lines) {
      if (line.startsWith('**Key Experience:**')) {
        readingBio = false;
        continue;
      }
      if (readingBio) {
        bioLines.push(line);
      } else if (line.startsWith('- ')) {
        experience.push(line.substring(2));
      }
    }
    
    members.push({
      name,
      role,
      photo: imageUrl,
      bio: bioLines.join(' '),
      experience,
      initials: name.split(' ').map(n => n[0]).join('')
    });
  }
  
  return members;
};

interface TeamSectionProps {
  content: string;
}

export const TeamSection: React.FC<TeamSectionProps> = ({ content }) => {
  const teamMembers = parseTeamMembers(content);
  
  return (
    <div className="not-prose grid gap-8 md:grid-cols-2 my-8">
      {teamMembers.map((member, index) => (
        <Card key={index} className="hover:shadow-lg transition-shadow duration-300 h-full flex flex-col bg-white border-sky-blue/20">
          <CardHeader className="text-center space-y-4 pb-4">
            <Avatar className="w-24 h-24 mx-auto">
              <AvatarImage src={member.photo} alt={member.name} className="object-cover" />
              <AvatarFallback className="text-lg font-semibold bg-gradient-to-br from-blue-500 to-purple-600 text-white">
                {member.initials}
              </AvatarFallback>
            </Avatar>
            <div className="space-y-1">
              <CardTitle className="text-xl font-bold text-royal-blue">{member.name}</CardTitle>
              <p className="text-middle-blue font-semibold">{member.role}</p>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 px-6 pb-6 flex-grow flex flex-col">
            <p className="text-royal-blue/80 text-sm leading-relaxed">{member.bio}</p>
            {member.experience.length > 0 && (
              <div className="space-y-3 pt-4 border-t border-sky-blue/20 mt-auto">
                <h4 className="font-bold text-royal-blue text-base">Key Experience</h4>
                <ul className="space-y-2">
                  {member.experience.map((exp, idx) => (
                    <li key={idx} className="text-sm text-royal-blue/70 flex leading-relaxed">
                      <span className="text-middle-blue mr-2 mt-1 text-sm">•</span>
                      <span className="flex-1">{exp}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
};
