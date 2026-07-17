import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Mail, MessageCircle, Send, Users } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';

const Contact = () => {
  const { t } = useLanguage();

  const contactOptions = [
    { title: t('contact.telegram'), description: t('contact.telegramDesc'), link: 'https://t.me/dehub_dhb', icon: Send, color: 'from-sky-blue to-middle-blue' },
    { title: t('contact.discord'), description: t('contact.discordDesc'), link: 'https://discord.gg/dehub', iconImage: '/lovable-uploads/71547e53-6be8-428a-b088-3c07a9c9a1ff.png', color: 'from-middle-blue to-royal-blue' },
    { title: t('contact.directMessage'), description: t('contact.directMessageDesc'), link: 'https://dehub.io/d', icon: MessageCircle, color: 'from-royal-blue to-sky-blue' },
  ];

  const communityChannels = [
    { title: t('contact.turkish'), description: t('contact.turkishDesc'), link: 'https://t.me/Dehub_Turkish' },
    { title: t('contact.arabic'), description: t('contact.arabicDesc'), link: 'https://t.me/Dehub_Arabic' },
    { title: t('contact.hindi'), description: t('contact.hindiDesc'), link: 'https://t.me/dehub_hindi' },
    { title: t('contact.china'), description: t('contact.chinaDesc'), link: 'https://t.me/dehub_china' },
    { title: t('contact.indonesia'), description: t('contact.indonesiaDesc'), link: 'https://t.me/dehub_indonesia' },
    { title: t('contact.germany'), description: t('contact.germanyDesc'), link: 'https://t.me/dehub_dach' },
    { title: t('contact.vietnam'), description: t('contact.vietnamDesc'), link: 'https://t.me/dehub_vietnam' },
    { title: t('contact.philippines'), description: t('contact.philippinesDesc'), link: 'https://t.me/DeHub_Philippines' },
  ];

  const gatedChannels = [
    { title: t('contact.holders'), description: t('contact.holdersDesc'), link: 'https://t.me/c/2488788799/1/10563', icon: Users },
    { title: t('contact.whales'), description: t('contact.whalesDesc'), link: 'https://t.me/c/2488788799/1/10563', icon: Users },
  ];

  const emailContacts = [
    { title: t('contact.techSupport'), email: 'tech@dehub.net', description: t('contact.techSupportDesc') },
    { title: t('contact.marketing'), email: 'marketing@dehub.net', description: t('contact.marketingDesc') },
    { title: t('contact.hr'), email: 'hr@dehub.net', description: t('contact.hrDesc') },
  ];

  const colors = ['from-sky-blue to-middle-blue', 'from-middle-blue to-royal-blue', 'from-royal-blue to-sky-blue', 'from-sky-blue to-royal-blue'];

  return (
    <div className="space-y-8">
      <div className="text-center space-y-4">
        <h1 className="text-4xl font-bold text-foreground font-exo">{t('contact.title')}</h1>
        <p className="text-xl text-muted-foreground max-w-2xl mx-auto font-exo">{t('contact.subtitle')}</p>
      </div>

      <div className="space-y-6">
        <h2 className="text-2xl font-bold text-foreground font-exo">{t('contact.quickContact')}</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {contactOptions.map((option) => (
            <a key={option.title} href={option.link} target="_blank" rel="noopener noreferrer" className="group block">
              <Card className="hover:border-primary/40 transition-all duration-200 hover:shadow-lg">
                <CardContent className="p-6 text-center">
                  <div className={`w-16 h-16 bg-gradient-to-r ${option.color} rounded-2xl flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform duration-200`}>
                    {option.iconImage ? (
                      <img src={option.iconImage} alt={option.title} className="w-8 h-8 filter brightness-0" />
                    ) : option.icon ? (
                      <option.icon className="w-8 h-8 text-plain-white" />
                    ) : null}
                  </div>
                  <h3 className="text-lg font-semibold text-foreground mb-2 font-exo">{option.title}</h3>
                  <p className="text-muted-foreground text-sm font-exo">{option.description}</p>
                </CardContent>
              </Card>
            </a>
          ))}
        </div>
      </div>

      <div className="space-y-6">
        <h2 className="text-2xl font-bold text-foreground font-exo">{t('contact.communityChannels')}</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {communityChannels.map((channel, i) => (
            <a key={channel.title} href={channel.link} target="_blank" rel="noopener noreferrer" className="group block">
              <Card className="hover:border-primary/40 transition-all duration-200 hover:shadow-lg">
                <CardContent className="p-6 text-center">
                  <div className={`w-16 h-16 bg-gradient-to-r ${colors[i % colors.length]} rounded-2xl flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform duration-200`}>
                    <Send className="w-8 h-8 text-plain-white" />
                  </div>
                  <h3 className="text-lg font-semibold text-foreground mb-2 font-exo">{channel.title}</h3>
                  <p className="text-muted-foreground text-sm font-exo">{channel.description}</p>
                </CardContent>
              </Card>
            </a>
          ))}
        </div>
      </div>

      <div className="space-y-6">
        <h2 className="text-2xl font-bold text-foreground font-exo">{t('contact.gatedChannels')}</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {gatedChannels.map((channel, i) => (
            <a key={channel.title} href={channel.link} target="_blank" rel="noopener noreferrer" className="group block">
              <Card className="hover:border-primary/40 transition-all duration-200 hover:shadow-lg">
                <CardContent className="p-6 text-center">
                  <div className={`w-16 h-16 bg-gradient-to-r ${i % 2 === 0 ? 'from-royal-blue to-sky-blue' : 'from-sky-blue to-royal-blue'} rounded-2xl flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform duration-200`}>
                    <channel.icon className="w-8 h-8 text-plain-white" />
                  </div>
                  <h3 className="text-lg font-semibold text-foreground mb-2 font-exo">{channel.title}</h3>
                  <p className="text-muted-foreground text-sm font-exo">{channel.description}</p>
                </CardContent>
              </Card>
            </a>
          ))}
        </div>
      </div>

      <div className="space-y-6">
        <h2 className="text-2xl font-bold text-foreground font-exo">{t('contact.emailContacts')}</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {emailContacts.map((contact) => (
            <Card key={contact.email}>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg font-semibold text-foreground font-exo flex items-center">
                  <Mail className="w-5 h-5 mr-2 text-primary" />
                  {contact.title}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <a href={`mailto:${contact.email}`} className="text-primary hover:text-primary/80 font-medium font-exo block mb-2">
                  {contact.email}
                </a>
                <p className="text-muted-foreground text-sm font-exo">{contact.description}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <Card className="bg-gradient-to-r from-royal-blue to-middle-blue border-0">
        <CardContent className="p-8 text-center">
          <h3 className="text-2xl font-bold text-plain-white mb-4 font-exo">{t('contact.needHelp')}</h3>
          <p className="text-plain-white mb-6 font-exo">{t('contact.needHelpDesc')}</p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a href="https://t.me/dehub_dhb" target="_blank" rel="noopener noreferrer" className="inline-flex items-center px-6 py-3 bg-plain-white text-royal-blue font-semibold rounded-lg hover:bg-sky-blue/10 transition-all duration-200 font-exo">
              <Send className="w-4 h-4 mr-2" />
              {t('contact.joinTelegram')}
            </a>
            <a href="https://discord.gg/dehub" target="_blank" rel="noopener noreferrer" className="inline-flex items-center px-6 py-3 border border-plain-white text-plain-white font-semibold rounded-lg hover:bg-plain-white/10 transition-all duration-200 font-exo">
              <Users className="w-4 h-4 mr-2" />
              {t('contact.joinDiscord')}
            </a>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Contact;
