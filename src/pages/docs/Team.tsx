import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Users, Linkedin } from 'lucide-react';
import tiktokLogo from '@/assets/tiktok-logo.png';
import xLogo from '@/assets/x-logo.png';
import instagramLogo from '@/assets/instagram-logo.png';
import { useLanguage } from '@/contexts/LanguageContext';

const socialIcons = {
  LinkedIn: Linkedin,
};

export default function Team() {
  const { t } = useLanguage();

  const teamMembers = [{
    name: t('team.malName'),
    role: t('team.malRole'),
    bio: t('team.malBio'),
    experience: [t('team.malExp1'), t('team.malExp2'), t('team.malExp3'), t('team.malExp4')],
    socials: [{ platform: 'LinkedIn', url: 'https://uk.linkedin.com/in/malik-jan-turkistani-842b4b195' }, { platform: 'X', url: 'https://x.com/maldoteth' }],
    initials: 'MJ',
    photo: '/lovable-uploads/361bb373-38ee-4888-a4b1-ab8239941261.png'
  }, {
    name: t('team.mikeName'),
    role: t('team.mikeRole'),
    bio: t('team.mikeBio'),
    experience: [t('team.mikeExp1'), t('team.mikeExp2'), t('team.mikeExp3'), t('team.mikeExp4')],
    socials: [{ platform: 'TikTok', url: 'https://www.tiktok.com/@mikehalesmma?lang=en' }, { platform: 'X', url: 'https://x.com/Mikehalesmma' }, { platform: 'Instagram', url: 'https://www.instagram.com/mikehalesmma' }],
    initials: 'MH',
    photo: '/lovable-uploads/4cc7ad51-0d4d-49fd-9307-b932b6dc7246.png'
  }, {
    name: t('team.indiName'),
    role: t('team.indiRole'),
    bio: t('team.indiBio'),
    experience: [t('team.indiExp1'), t('team.indiExp2'), t('team.indiExp3')],
    socials: [{ platform: 'Instagram', url: 'https://www.instagram.com/indijayofficial/?hl=es' }, { platform: 'X', url: 'https://x.com/indijaycammish' }, { platform: 'TikTok', url: 'https://www.tiktok.com/@indijaycammish' }],
    initials: 'IC',
    photo: '/lovable-uploads/e06bb6aa-5093-4691-98a1-7bf09b02a71d.png'
  }, {
    name: t('team.baileyName'),
    role: t('team.baileyRole'),
    bio: t('team.baileyBio'),
    experience: [t('team.baileyExp1'), t('team.baileyExp2'), t('team.baileyExp3')],
    socials: [],
    initials: 'BY',
    photo: '/lovable-uploads/980e65e0-cae8-4ed4-86da-c11e3d42fa69.png'
  }];

  return (
    <div className="space-y-12 px-4 py-8">
      <div className="text-center space-y-6">
        <div className="flex items-center justify-center space-x-2">
          <Users className="w-8 h-8 text-primary" />
          <h1 className="text-4xl font-bold text-foreground">{t('team.title')}</h1>
        </div>
        <p className="text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">{t('team.subtitle')}</p>
      </div>

      <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-2 max-w-6xl mx-auto">
        {teamMembers.map((member, index) => (
          <Card key={index} className="hover:shadow-lg transition-shadow duration-300 h-full">
            <CardHeader className="text-center space-y-6 pb-6">
              <Avatar className="w-24 h-24 mx-auto">
                {member.photo ? <AvatarImage src={member.photo} alt={member.name} className="object-cover" /> : null}
                <AvatarFallback className="text-lg font-semibold bg-gradient-to-br from-blue-500 to-purple-600 text-white">
                  {member.initials}
                </AvatarFallback>
              </Avatar>
              <div className="space-y-2">
                <CardTitle className="text-2xl font-bold">{member.name}</CardTitle>
                <p className="text-primary font-semibold text-lg">{member.role}</p>
              </div>
            </CardHeader>
            
            <CardContent className="space-y-8 px-6 pb-6">
              <div className="space-y-3">
                <p className="text-muted-foreground leading-relaxed text-base">{member.bio}</p>
              </div>
              
              {member.experience && (
                <div className="space-y-4">
                  <h4 className="font-bold text-foreground text-lg border-b border-border pb-2">{t('team.experience')}</h4>
                  <ul className="space-y-4">
                    {member.experience.map((exp, idx) => (
                      <li key={idx} className="text-sm text-muted-foreground flex leading-relaxed">
                        <span className="text-primary mr-3 mt-1 text-base">•</span>
                        <span className="flex-1">{exp}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              
              {member.socials.length > 0 && (
                <div className="flex flex-wrap gap-3 pt-6 border-t border-border">
                  {member.socials.map((social, idx) => {
                    const SocialIcon = socialIcons[social.platform as keyof typeof socialIcons];
                    return (
                      <Button key={idx} variant="outline" size="sm" asChild className="flex-1 min-w-0" style={{ backgroundColor: '#FFFFFF', color: '#000000', borderColor: '#D3D3D3' }}>
                        <a href={social.url} className="flex items-center justify-center" target="_blank" rel="noopener noreferrer" aria-label={social.platform}>
                          {social.platform === 'TikTok' ? (
                            <img src={tiktokLogo} alt="TikTok" className="w-4 h-4" />
                          ) : social.platform === 'X' ? (
                            <img src={xLogo} alt="X" className="w-4 h-4" />
                          ) : social.platform === 'Instagram' ? (
                            <img src={instagramLogo} alt="Instagram" className="w-4 h-4" />
                          ) : SocialIcon ? (
                            <SocialIcon className="w-4 h-4" style={{ color: '#000000' }} />
                          ) : null}
                        </a>
                      </Button>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
