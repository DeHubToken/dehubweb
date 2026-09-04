import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Target, DollarSign, Users, Eye, Handshake, Rocket, TrendingUp, MapPin, Globe } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { badgeTiers } from './utils/badgeTiers';
import { fill } from './utils/fill';

/** Campaign-type values are what the ads manager expects — only the label moves. */
const CAMPAIGN_TYPES = ['awareness', 'traffic', 'conversion', 'engagement'];

const PARTNERSHIP_BENEFITS = ['earlyAccess', 'featuredPlacement', 'jointPress', 'holderBase'];

const PARTNERSHIP_REASONS = ['firstMover', 'brandAssociation', 'mutualGrowth'];

const CampaignCreator = () => {
  const { t } = useLanguage();
  const [selectedTiers, setSelectedTiers] = useState<string[]>([]);
  const [campaignType, setCampaignType] = useState('');
  const [budget, setBudget] = useState('');
  const [selectedCountries, setSelectedCountries] = useState<string[]>([]);
  const [geoTargetingType, setGeoTargetingType] = useState('worldwide');

  // Badge tier data with images for UI display
  const badgeImages: Record<string, string> = {
    'No Badge': '',
    'Crab': '/media/60bc125c-8efd-4058-9e12-7ca393df4fce.png',
    'Lobster': '/media/2c7200c2-681e-4499-863b-ea24fdbdb70c.png',
    'Piranha': '/media/38387f75-fd38-4380-9588-1f19f68d8435.png',
    'Tortoise': '/media/fc47a759-390a-4f41-ba96-5bc0066e82b9.png',
    'Cobra': '/media/b3306c99-31b8-4bfc-bc25-f73abc68fc38.png',
    'Octopus': '/media/8fcbb3f6-223d-4e2f-9d82-30082a175491.png',
    'Crocodite': '/media/c84eee0a-97c7-4938-9b9c-c991c802593e.png',
    'Dolphin': '/media/4558c158-75d9-40fc-adfa-41125344a48e.png',
    'Tiger Shark': '/media/6be493f1-51b4-481b-9ca1-340c030b2ef8.png',
    'Killer Whale': '/media/fcc288eb-67d7-49a0-b561-94bb5d1b8896.png',
    'Great White Shark': '/media/dfcc3420-f654-486b-bc94-f84f0209ba5c.png',
    'Blue Whale': '/media/fb9dfd31-d278-49fa-8ec8-1eee9ab74aef.png',
    'Meglodon': '/media/9282e1c6-fa68-4b7c-b3cd-22d860df35af.png'
  };

  // Country names are the selected values, not display copy — they stay in English.
  const countries = ['Afghanistan', 'Albania', 'Algeria', 'Andorra', 'Angola', 'Argentina', 'Armenia', 'Australia', 'Austria', 'Azerbaijan', 'Bahamas', 'Bahrain', 'Bangladesh', 'Barbados', 'Belarus', 'Belgium', 'Belize', 'Benin', 'Bhutan', 'Bolivia', 'Bosnia and Herzegovina', 'Botswana', 'Brazil', 'Brunei', 'Bulgaria', 'Burkina Faso', 'Burundi', 'Cambodia', 'Cameroon', 'Canada', 'Cape Verde', 'Central African Republic', 'Chad', 'Chile', 'China', 'Colombia', 'Comoros', 'Congo', 'Costa Rica', 'Croatia', 'Cuba', 'Cyprus', 'Czech Republic', 'Democratic Republic of the Congo', 'Denmark', 'Djibouti', 'Dominica', 'Dominican Republic', 'East Timor', 'Ecuador', 'Egypt', 'El Salvador', 'Equatorial Guinea', 'Eritrea', 'Estonia', 'Eswatini', 'Ethiopia', 'Fiji', 'Finland', 'France', 'Gabon', 'Gambia', 'Georgia', 'Germany', 'Ghana', 'Greece', 'Grenada', 'Guatemala', 'Guinea', 'Guinea-Bissau', 'Guyana', 'Haiti', 'Honduras', 'Hungary', 'Iceland', 'India', 'Indonesia', 'Iran', 'Iraq', 'Ireland', 'Israel', 'Italy', 'Ivory Coast', 'Jamaica', 'Japan', 'Jordan', 'Kazakhstan', 'Kenya', 'Kiribati', 'Kuwait', 'Kyrgyzstan', 'Laos', 'Latvia', 'Lebanon', 'Lesotho', 'Liberia', 'Libya', 'Liechtenstein', 'Lithuania', 'Luxembourg', 'Madagascar', 'Malawi', 'Malaysia', 'Maldives', 'Mali', 'Malta', 'Marshall Islands', 'Mauritania', 'Mauritius', 'Mexico', 'Micronesia', 'Moldova', 'Monaco', 'Mongolia', 'Montenegro', 'Morocco', 'Mozambique', 'Myanmar', 'Namibia', 'Nauru', 'Nepal', 'Netherlands', 'New Zealand', 'Nicaragua', 'Niger', 'Nigeria', 'North Korea', 'North Macedonia', 'Norway', 'Oman', 'Pakistan', 'Palau', 'Palestine', 'Panama', 'Papua New Guinea', 'Paraguay', 'Peru', 'Philippines', 'Poland', 'Portugal', 'Qatar', 'Romania', 'Russia', 'Rwanda', 'Saint Kitts and Nevis', 'Saint Lucia', 'Saint Vincent and the Grenadines', 'Samoa', 'San Marino', 'Sao Tome and Principe', 'Saudi Arabia', 'Senegal', 'Serbia', 'Seychelles', 'Sierra Leone', 'Singapore', 'Slovakia', 'Slovenia', 'Solomon Islands', 'Somalia', 'South Africa', 'South Korea', 'South Sudan', 'Spain', 'Sri Lanka', 'Sudan', 'Suriname', 'Sweden', 'Switzerland', 'Syria', 'Taiwan', 'Tajikistan', 'Tanzania', 'Thailand', 'Togo', 'Tonga', 'Trinidad and Tobago', 'Tunisia', 'Turkey', 'Turkmenistan', 'Tuvalu', 'Uganda', 'Ukraine', 'United Arab Emirates', 'United Kingdom', 'United States', 'Uruguay', 'Uzbekistan', 'Vanuatu', 'Vatican City', 'Venezuela', 'Vietnam', 'Yemen', 'Zambia', 'Zimbabwe'];
  const handleCountrySelect = (country: string) => {
    if (!selectedCountries.includes(country)) {
      setSelectedCountries(prev => [...prev, country]);
    }
  };
  const handleCountryRemove = (country: string) => {
    setSelectedCountries(prev => prev.filter(c => c !== country));
  };
  const handleTierToggle = (tierName: string) => {
    setSelectedTiers(prev => prev.includes(tierName) ? prev.filter(name => name !== tierName) : [...prev, tierName]);
  };
  const calculateEstimatedReach = () => {
    const baseReach = 10000;
    return selectedTiers.length * baseReach * (selectedTiers.length * 0.5 + 1);
  };
  const calculateEstimatedCost = () => {
    if (!budget) return 0;
    const selectedTierData = badgeTiers.filter(tier => selectedTiers.includes(tier.name));
    const avgCpm = selectedTierData.reduce((sum, tier) => sum + tier.cpm, 0) / selectedTierData.length || 0;
    const budgetNum = parseFloat(budget);
    return (budgetNum / avgCpm * 1000).toFixed(0);
  };
  return <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="w-5 h-5 text-foreground" />
            {t('adTools.createNewCampaign')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4 w-full">
              <div>
                <Label htmlFor="campaign-name">{t('adTools.campaignName')}</Label>
                <Input id="campaign-name" placeholder={t('adTools.campaignNamePlaceholder')} />
              </div>

              <div>
                <Label htmlFor="campaign-type">{t('adTools.campaignType')}</Label>
                <Select value={campaignType} onValueChange={setCampaignType}>
                  <SelectTrigger>
                    <SelectValue placeholder={t('adTools.campaignTypePlaceholder')} />
                  </SelectTrigger>
                  <SelectContent>
                    {CAMPAIGN_TYPES.map(type => (
                      <SelectItem key={type} value={type}>{t(`adTools.campaignType_${type}`)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="budget">{t('adTools.dailyBudget')}</Label>
                <Input id="budget" type="number" placeholder={t('adTools.dailyBudgetPlaceholder')} value={budget} onChange={e => setBudget(e.target.value)} />
              </div>

              <div>
                <Label htmlFor="description">{t('adTools.campaignDescription')}</Label>
                <Textarea id="description" placeholder={t('adTools.campaignDescriptionPlaceholder')} />
              </div>
            </div>

            <div className="space-y-4 w-full">
              <div className="p-4 border rounded-lg bg-white/5 w-full">
                <h3 className="font-semibold mb-2 flex items-center gap-2">
                  <Eye className="w-4 h-4" />
                  {t('adTools.estimatedPerformance')}
                </h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span>{t('adTools.estimatedReachRow')}</span>
                    <span className="font-semibold">{calculateEstimatedReach().toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>{t('adTools.estimatedImpressionsRow')}</span>
                    <span className="font-semibold">{calculateEstimatedCost()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>{t('adTools.countriesRow')}</span>
                    <span className="font-semibold">
                      {geoTargetingType === 'worldwide' ? t('adTools.worldwide') : selectedCountries.length}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>{t('adTools.selectedTiersRow')}</span>
                    <span className="font-semibold">{selectedTiers.length}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapPin className="w-5 h-5 text-foreground" />
            {t('adTools.geographicTargeting')}
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            {t('adTools.geographicTargetingDesc')}
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-4">
            <div>
              <Label>{t('adTools.targetingType')}</Label>
              <Select value={geoTargetingType} onValueChange={setGeoTargetingType}>
                <SelectTrigger>
                  <SelectValue placeholder={t('adTools.targetingTypePlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="worldwide">
                    <div className="flex items-center gap-2">
                      <Globe className="w-4 h-4" />
                      {t('adTools.worldwide')}
                    </div>
                  </SelectItem>
                  <SelectItem value="specific">
                    <div className="flex items-center gap-2">
                      <MapPin className="w-4 h-4" />
                      {t('adTools.specificCountries')}
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {geoTargetingType === 'specific' && <div className="space-y-4">
                <Label>{t('adTools.selectCountries')}</Label>
                <Select onValueChange={handleCountrySelect}>
                  <SelectTrigger>
                    <SelectValue placeholder={t('adTools.chooseCountries')} />
                  </SelectTrigger>
                  <SelectContent className="max-h-60">
                    {countries.filter(country => !selectedCountries.includes(country)).map(country => <SelectItem key={country} value={country}>
                        {country}
                      </SelectItem>)}
                  </SelectContent>
                </Select>

                {selectedCountries.length > 0 && <div className="space-y-2">
                    <Label className="text-sm">{fill(t('adTools.selectedCountries'), { count: selectedCountries.length })}</Label>
                    <div className="flex flex-wrap gap-2 p-3 border rounded-lg bg-white/5 max-h-32 overflow-y-auto">
                      {selectedCountries.map(country => <Badge key={country} variant="outline" className="flex items-center gap-1 bg-foreground/5 border-foreground/10 text-foreground">
                          {country}
                          <button onClick={() => handleCountryRemove(country)} className="ml-1 hover:bg-destructive/20 rounded-full w-4 h-4 flex items-center justify-center">
                            ×
                          </button>
                        </Badge>)}
                    </div>
                  </div>}
              </div>}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="w-5 h-5 text-foreground" />
            {t('adTools.povrAudienceTargeting')}
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            {t('adTools.povrAudienceTargetingDesc')}
          </p>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-6">
            <div className="w-full">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {badgeTiers.map(tier => <div key={tier.name} className={`border rounded-lg p-4 cursor-pointer transition-all hover:shadow-md ${selectedTiers.includes(tier.name) ? 'border-white bg-white/5' : 'border-white/10'}`} onClick={() => handleTierToggle(tier.name)}>
                    <div className="flex items-center space-x-2 mb-3">
                      <Checkbox checked={selectedTiers.includes(tier.name)} onChange={() => handleTierToggle(tier.name)} />
                      {badgeImages[tier.name] ? <img src={badgeImages[tier.name]} alt={tier.name} className="w-6 h-6 object-contain dark:invert" /> : <div className="w-6 h-6 rounded-full bg-zinc-300"></div>}
                      <span className="font-medium text-sm">
                        {tier.name === 'No Badge' ? t('adTools.noBadge') : fill(t('adTools.tierBadge'), { tier: tier.name })}
                      </span>
                    </div>
                    <div className="space-y-1 text-xs text-muted-foreground">
                      <div className="flex justify-between">
                        <span>{t('adTools.holdingsRow')}</span>
                        <span>{tier.holdings} $DHB</span>
                      </div>
                      <div className="flex justify-between">
                        <span>{t('adTools.cpmRow')}</span>
                        <Badge variant="outline" className="text-xs">${tier.cpm.toFixed(2)}</Badge>
                      </div>
                    </div>
                  </div>)}
              </div>
            </div>

            <div className="lg:self-end">
              <div className="flex flex-col lg:flex-row space-y-2 lg:space-y-0 lg:space-x-4">
                {/* The real self-serve portal — this docs widget is a preview */}
                <Button
                  className="bg-black/5 dark:bg-white/10 text-foreground hover:bg-black/10 dark:hover:bg-white/20 rounded-2xl"
                  onClick={() => { window.location.href = '/app/ads'; }}
                >
                  {t('adTools.launchInAdsManager')}
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>


      {/* Partnership Promotional Section */}
      <Card className="border-2 border-foreground/10 bg-gradient-to-br from-white/5 via-background to-white/5">
        <CardHeader className="text-center px-4 py-6">
          <CardTitle className="text-xl md:text-2xl flex items-center justify-center gap-2">
            <Handshake className="hidden md:block w-5 h-5 md:w-6 md:h-6 text-foreground" />
            {t('adTools.partnerTitle')}
          </CardTitle>
          <p className="text-base md:text-lg text-muted-foreground px-2">
            {t('adTools.partnerSubtitle')}
          </p>
        </CardHeader>
        <CardContent className="space-y-6 px-4 pb-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-4">
              <h3 className="font-semibold text-base md:text-lg flex items-center gap-2">
                <TrendingUp className="w-4 h-4 md:w-5 md:h-5 text-foreground" />
                {t('adTools.partnershipBenefits')}
              </h3>
              <div className="space-y-3">
                {PARTNERSHIP_BENEFITS.map(key => (
                  <div key={key} className="p-3 md:p-4 rounded-lg bg-foreground/5 border border-foreground/10">
                    <span className="text-sm md:text-base">{t(`adTools.benefit_${key}`)}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="space-y-4">
              <h3 className="font-semibold text-base md:text-lg flex items-center gap-2">
                <Rocket className="w-4 h-4 md:w-5 md:h-5 text-foreground" />
                {t('adTools.whyPartnerNow')}
              </h3>
              <div className="space-y-3">
                {PARTNERSHIP_REASONS.map(key => (
                  <div key={key} className="p-3 md:p-4 rounded-lg bg-foreground/5 border border-foreground/10">
                    <h4 className="font-medium mb-2 text-sm md:text-base">{t(`adTools.reason_${key}`)}</h4>
                    <p className="text-xs md:text-sm text-muted-foreground">
                      {t(`adTools.reason_${key}Desc`)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="text-center pt-4">
            <div className="md:hidden flex justify-center mb-4">
              <Handshake className="w-8 h-8 text-foreground" />
            </div>
            <Button size="lg" className="bg-black/5 dark:bg-foreground/5 backdrop-blur-md border border-black/20 dark:border-foreground/10 text-foreground hover:bg-black/10 dark:hover:bg-foreground/10 px-6 py-3 md:px-8 w-full md:w-auto text-sm md:text-base" onClick={() => window.open('https://forms.gle/y413DekZR1X9oL4g6', '_blank')}>
              <Handshake className="hidden md:block w-4 h-4 md:w-5 md:h-5 mr-2" />
              {t('adTools.becomeLaunchPartner')}
            </Button>
            <p className="text-xs md:text-sm text-muted-foreground mt-2 px-2">
              {t('adTools.limitedSlots')}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>;
};
export default CampaignCreator;
