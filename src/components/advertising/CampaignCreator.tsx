import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Target, DollarSign, Users, Eye, Handshake, Rocket, Star, TrendingUp, MapPin, Globe } from 'lucide-react';
import { badgeTiers } from './utils/badgeTiers';
const CampaignCreator = () => {
  const [selectedTiers, setSelectedTiers] = useState<string[]>([]);
  const [campaignType, setCampaignType] = useState('');
  const [budget, setBudget] = useState('');
  const [selectedCountries, setSelectedCountries] = useState<string[]>([]);
  const [geoTargetingType, setGeoTargetingType] = useState('worldwide');

  // Badge tier data with images for UI display
  const badgeImages: Record<string, string> = {
    'No Badge': '',
    'Crab': '/lovable-uploads/60bc125c-8efd-4058-9e12-7ca393df4fce.png',
    'Lobster': '/lovable-uploads/2c7200c2-681e-4499-863b-ea24fdbdb70c.png',
    'Piranha': '/lovable-uploads/38387f75-fd38-4380-9588-1f19f68d8435.png',
    'Tortoise': '/lovable-uploads/fc47a759-390a-4f41-ba96-5bc0066e82b9.png',
    'Cobra': '/lovable-uploads/b3306c99-31b8-4bfc-bc25-f73abc68fc38.png',
    'Octopus': '/lovable-uploads/8fcbb3f6-223d-4e2f-9d82-30082a175491.png',
    'Crocodile': '/lovable-uploads/c84eee0a-97c7-4938-9b9c-c991c802593e.png',
    'Dolphin': '/lovable-uploads/4558c158-75d9-40fc-adfa-41125344a48e.png',
    'Tiger Shark': '/lovable-uploads/6be493f1-51b4-481b-9ca1-340c030b2ef8.png',
    'Killer Whale': '/lovable-uploads/fcc288eb-67d7-49a0-b561-94bb5d1b8896.png',
    'Great White': '/lovable-uploads/dfcc3420-f654-486b-bc94-f84f0209ba5c.png',
    'Blue Whale': '/lovable-uploads/fb9dfd31-d278-49fa-8ec8-1eee9ab74aef.png',
    'Megalodon': '/lovable-uploads/9282e1c6-fa68-4b7c-b3cd-22d860df35af.png'
  };

  // All world countries for targeting
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
            <Target className="w-5 h-5 text-middle-blue" />
            Create New Campaign
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4 w-full">
              <div>
                <Label htmlFor="campaign-name">Campaign Name</Label>
                <Input id="campaign-name" placeholder="Enter campaign name" />
              </div>
              
              <div>
                <Label htmlFor="campaign-type">Campaign Type</Label>
                <Select value={campaignType} onValueChange={setCampaignType}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select campaign type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="awareness">Brand Awareness</SelectItem>
                    <SelectItem value="traffic">Website Traffic</SelectItem>
                    <SelectItem value="conversion">Conversions</SelectItem>
                    <SelectItem value="engagement">Engagement</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="budget">Daily Budget ($)</Label>
                <Input id="budget" type="number" placeholder="Enter daily budget" value={budget} onChange={e => setBudget(e.target.value)} />
              </div>

              <div>
                <Label htmlFor="description">Campaign Description</Label>
                <Textarea id="description" placeholder="Describe your campaign objectives" />
              </div>
            </div>

            <div className="space-y-4 w-full">
              <div className="p-4 border rounded-lg bg-muted/20 w-full">
                <h3 className="font-semibold mb-2 flex items-center gap-2">
                  <Eye className="w-4 h-4" />
                  Estimated Performance
                </h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span>Estimated Reach:</span>
                    <span className="font-semibold">{calculateEstimatedReach().toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Estimated Impressions:</span>
                    <span className="font-semibold">{calculateEstimatedCost()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Countries:</span>
                    <span className="font-semibold">
                      {geoTargetingType === 'worldwide' ? 'Worldwide' : selectedCountries.length}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Selected Tiers:</span>
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
            <MapPin className="w-5 h-5 text-middle-blue" />
            Geographic Targeting
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Select regions and countries to target your campaign audience
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-4">
            <div>
              <Label>Targeting Type</Label>
              <Select value={geoTargetingType} onValueChange={setGeoTargetingType}>
                <SelectTrigger>
                  <SelectValue placeholder="Select targeting type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="worldwide">
                    <div className="flex items-center gap-2">
                      <Globe className="w-4 h-4" />
                      Worldwide
                    </div>
                  </SelectItem>
                  <SelectItem value="specific">
                    <div className="flex items-center gap-2">
                      <MapPin className="w-4 h-4" />
                      Specific Countries
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {geoTargetingType === 'specific' && <div className="space-y-4">
                <Label>Select Countries</Label>
                <Select onValueChange={handleCountrySelect}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose countries to target" />
                  </SelectTrigger>
                  <SelectContent className="max-h-60">
                    {countries.filter(country => !selectedCountries.includes(country)).map(country => <SelectItem key={country} value={country}>
                        {country}
                      </SelectItem>)}
                  </SelectContent>
                </Select>
                
                {selectedCountries.length > 0 && <div className="space-y-2">
                    <Label className="text-sm">Selected Countries ({selectedCountries.length})</Label>
                    <div className="flex flex-wrap gap-2 p-3 border rounded-lg bg-muted/20 max-h-32 overflow-y-auto">
                      {selectedCountries.map(country => <Badge key={country} variant="secondary" className="flex items-center gap-1">
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
            <Users className="w-5 h-5 text-middle-blue" />
            POVR Audience Targeting
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Select badge tiers to target users with verified financial capacity
          </p>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-6">
            <div className="w-full">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {badgeTiers.map(tier => <div key={tier.name} className={`border rounded-lg p-4 cursor-pointer transition-all hover:shadow-md ${selectedTiers.includes(tier.name) ? 'border-middle-blue bg-middle-blue/5' : 'border-gray-200'}`} onClick={() => handleTierToggle(tier.name)}>
                    <div className="flex items-center space-x-2 mb-3">
                      <Checkbox checked={selectedTiers.includes(tier.name)} onChange={() => handleTierToggle(tier.name)} />
                      {badgeImages[tier.name] ? <img src={badgeImages[tier.name]} alt={tier.name} className="w-6 h-6 object-contain dark:invert" /> : <div className="w-6 h-6 rounded-full bg-gray-300"></div>}
                      <span className="font-medium text-sm">{tier.name === 'No Badge' ? 'No Badge' : `${tier.name} Badge`}</span>
                    </div>
                    <div className="space-y-1 text-xs text-muted-foreground">
                      <div className="flex justify-between">
                        <span>Holdings:</span>
                        <span>{tier.holdings} $DHB</span>
                      </div>
                      <div className="flex justify-between">
                        <span>CPM:</span>
                        <Badge variant="outline" className="text-xs">${tier.cpm.toFixed(2)}</Badge>
                      </div>
                    </div>
                  </div>)}
              </div>
            </div>
            
            <div className="lg:self-end">
              <div className="flex flex-col lg:flex-row space-y-2 lg:space-y-0 lg:space-x-4">
                <Button variant="outline">Save as Draft</Button>
                <Button className="bg-middle-blue hover:bg-middle-blue/90 text-white">
                  Launch Campaign
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>


      {/* Partnership Promotional Section */}
      <Card className="border-2 border-primary/20 bg-gradient-to-br from-primary/5 via-background to-secondary/5">
        <CardHeader className="text-center px-4 py-6">
          <div className="flex justify-center mb-4">
            <Badge className="bg-primary text-primary-foreground text-sm md:text-lg px-3 py-1 md:px-4 md:py-2">
              <Star className="w-3 h-3 md:w-4 md:h-4 mr-2" />
              Launch Partnership
            </Badge>
          </div>
          <CardTitle className="text-xl md:text-2xl flex items-center justify-center gap-2">
            <Handshake className="hidden md:block w-5 h-5 md:w-6 md:h-6 text-primary" />
            Partner with DeHub for Our App Launch
          </CardTitle>
          <p className="text-base md:text-lg text-muted-foreground px-2">
            Promote your brand on the DeHub app for our heavily funded launch campaigns
          </p>
        </CardHeader>
        <CardContent className="space-y-6 px-4 pb-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-4">
              <h3 className="font-semibold text-base md:text-lg flex items-center gap-2">
                <TrendingUp className="w-4 h-4 md:w-5 md:h-5 text-primary" />
                Partnership Benefits
              </h3>
              <div className="space-y-3">
                <div className="p-3 md:p-4 rounded-lg bg-primary/10 border border-primary/20">
                  <span className="text-sm md:text-base">Early access to revolutionary POVR targeting technology</span>
                </div>
                <div className="p-3 md:p-4 rounded-lg bg-secondary/10 border border-secondary/20">
                  <span className="text-sm md:text-base">Featured placement as exclusive launch partner</span>
                </div>
                <div className="p-3 md:p-4 rounded-lg bg-accent/10 border border-accent/20">
                  <span className="text-sm md:text-base">Joint press releases and co-marketing campaigns</span>
                </div>
                
                
                <div className="p-3 md:p-4 rounded-lg bg-secondary/10 border border-secondary/20">
                  <span className="text-sm md:text-base">Promote to a holder base which saw a peak all time high of over $500,000,000 FDV</span>
                </div>
              </div>
            </div>
            <div className="space-y-4">
              <h3 className="font-semibold text-base md:text-lg flex items-center gap-2">
                <Rocket className="w-4 h-4 md:w-5 md:h-5 text-primary" />
                Why Partner Now?
              </h3>
              <div className="space-y-3">
                <div className="p-3 md:p-4 rounded-lg bg-primary/10 border border-primary/20">
                  <h4 className="font-medium mb-2 text-sm md:text-base">First-Mover Advantage</h4>
                  <p className="text-xs md:text-sm text-muted-foreground">
                    Be among the first brands to leverage blockchain-verified audience targeting
                  </p>
                </div>
                <div className="p-3 md:p-4 rounded-lg bg-secondary/10 border border-secondary/20">
                  <h4 className="font-medium mb-2 text-sm md:text-base">Brand Association</h4>
                  <p className="text-xs md:text-sm text-muted-foreground">
                    Align your brand with cutting-edge Web3 innovation and technology
                  </p>
                </div>
                <div className="p-3 md:p-4 rounded-lg bg-accent/10 border border-accent/20">
                  <h4 className="font-medium mb-2 text-sm md:text-base">Mutual Growth</h4>
                  <p className="text-xs md:text-sm text-muted-foreground">
                    Grow together through cross-promotion and shared audiences
                  </p>
                </div>
              </div>
            </div>
          </div>
          <div className="text-center pt-4">
            <div className="md:hidden flex justify-center mb-4">
              <Handshake className="w-8 h-8 text-primary" />
            </div>
            <Button size="lg" className="bg-primary hover:bg-primary/90 text-primary-foreground px-6 py-3 md:px-8 w-full md:w-auto text-sm md:text-base" onClick={() => window.open('https://forms.gle/y413DekZR1X9oL4g6', '_blank')}>
              <Handshake className="hidden md:block w-4 h-4 md:w-5 md:h-5 mr-2" />
              Become a Launch Partner
            </Button>
            <p className="text-xs md:text-sm text-muted-foreground mt-2 px-2">
              Limited partnership slots available for our official launch
            </p>
          </div>
        </CardContent>
      </Card>
    </div>;
};
export default CampaignCreator;