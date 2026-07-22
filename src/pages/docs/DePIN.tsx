import React from 'react';
import { Network, Shield, Zap } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';

const DePIN = () => {
  const { t } = useLanguage();

  return (
    <div className="space-y-8">
      <div className="text-center space-y-4">
        <h1 className="text-4xl font-bold text-foreground">{t('depin.title')}</h1>
        <p className="text-lg text-muted-foreground max-w-2xl mx-auto">{t('depin.subtitle')}</p>
      </div>

      <div className="bg-card rounded-2xl border p-8">
        <div className="prose prose-slate dark:prose-invert max-w-none">
          <section className="mb-12">
            <h2 className="text-2xl font-bold text-foreground mb-4">{t('depin.abstract')}</h2>
            <p className="text-lg leading-relaxed text-muted-foreground">{t('depin.abstractText')}</p>
          </section>

          <section className="mb-12">
            <h2 className="text-2xl font-bold text-foreground mb-4">{t('depin.systemArchitecture')}</h2>
            <div className="bg-muted p-6 rounded-lg font-mono text-sm mb-6 overflow-x-auto">
              <pre className="whitespace-pre text-muted-foreground">
              {`----------------------        -----------------
|  DeHub Application |        |   End Users   |   - Start of data flow
----------------------        -----------------
         ⬇ ⬆                       ⬇ ⬆                                     
----------------------------------------------
|              DePIN Coordinator             |    - Tasking, encryption + decryption
----------------------------------------------
     ⬇                ⬇                ⬇                              
----------        -----------       -----------
| Mobile |        | PC/GC   |       | Server  |   - That provide computing power
| Miners |        | Miners  |       | Miners  |   - in exchange for DHB tokens
----------        -----------       -----------
    ⬇        ↙        ⬇       ↙↙ ↘     ⬇
-----------       -------------     ------------
| Hosting |       | Transcode |     | Deliver  |  - Content delivery network
-----------       -------------     ------------`}
              </pre>
            </div>
          </section>

          <section className="mb-12">
            <h2 className="text-2xl font-bold text-foreground mb-6">{t('depin.introduction')}</h2>
            <h3 className="text-xl font-semibold text-foreground/90 mb-3">{t('depin.challengesTitle')}</h3>
            <p className="text-lg leading-relaxed text-muted-foreground mb-6">{t('depin.challengesDesc')}</p>

            <div className="docs-glass p-6 rounded-xl mb-6">
              <div className="flex items-start space-x-3">
                <Network className="w-6 h-6 text-foreground mt-1 flex-shrink-0" />
                <div>
                  <h3 className="text-lg font-semibold text-foreground mb-2">{t('depin.solutionTitle')}</h3>
                  <p className="text-muted-foreground mb-3">{t('depin.solutionDesc')}</p>
                  <ul className="text-muted-foreground space-y-1 ml-4 list-disc">
                    <li><strong>{t('depin.costEfficiency')}</strong> {t('depin.costEfficiencyDesc')}</li>
                    <li><strong>{t('depin.scalability')}</strong> {t('depin.scalabilityDesc')}</li>
                    <li><strong>{t('depin.sustainability')}</strong> {t('depin.sustainabilityDesc')}</li>
                  </ul>
                </div>
              </div>
            </div>
          </section>

          <section className="mb-12">
            <h2 className="text-2xl font-bold text-foreground mb-6">{t('depin.coreComponents')}</h2>
            <div className="grid md:grid-cols-2 gap-6 mb-8">
              <div className="docs-glass p-6 rounded-xl">
                <h3 className="text-lg font-semibold text-foreground mb-2">{t('depin.contributors')}</h3>
                <p className="text-muted-foreground">{t('depin.contributorsDesc')}</p>
              </div>
              <div className="docs-glass p-6 rounded-xl">
                <h3 className="text-lg font-semibold text-foreground mb-2">{t('depin.coordinator')}</h3>
                <p className="text-muted-foreground">{t('depin.coordinatorDesc')}</p>
              </div>
              <div className="docs-glass p-6 rounded-xl">
                <h3 className="text-lg font-semibold text-foreground mb-2">{t('depin.dehubApp')}</h3>
                <p className="text-muted-foreground">{t('depin.dehubAppDesc')}</p>
              </div>
              <div className="docs-glass p-6 rounded-xl">
                <h3 className="text-lg font-semibold text-foreground mb-2">{t('depin.clients')}</h3>
                <p className="text-muted-foreground">{t('depin.clientsDesc')}</p>
              </div>
            </div>

            <h3 className="text-xl font-semibold text-foreground/90 mb-4">{t('depin.workflow')}</h3>
            <ol className="list-decimal ml-6 space-y-2 text-muted-foreground">
              <li><strong>{t('depin.workflow1')}</strong> {t('depin.workflow1Desc')}</li>
              <li><strong>{t('depin.workflow2')}</strong> {t('depin.workflow2Desc')}</li>
              <li><strong>{t('depin.workflow3')}</strong> {t('depin.workflow3Desc')}</li>
              <li><strong>{t('depin.workflow4')}</strong> {t('depin.workflow4Desc')}</li>
            </ol>
          </section>

          <section className="mb-12">
            <h2 className="text-2xl font-bold text-foreground mb-6">{t('depin.incentiveModel')}</h2>
            <div className="docs-glass p-6 rounded-xl mb-6">
              <h3 className="text-lg font-semibold text-foreground mb-3">{t('depin.revenuePool')}</h3>
              <p className="text-muted-foreground mb-3">{t('depin.revenuePoolDesc')}</p>
              <ul className="text-muted-foreground space-y-1 ml-4 list-disc">
                <li><strong>{t('depin.inAppRevenue')}</strong> {t('depin.inAppRevenueDesc')}</li>
                <li><strong>{t('depin.tokenFees')}</strong> {t('depin.tokenFeesDesc')}</li>
              </ul>
            </div>

            <h3 className="text-lg font-semibold text-foreground/90 mb-3">{t('depin.distributionMechanism')}</h3>
            <ul className="text-muted-foreground space-y-1 ml-4 list-disc mb-6">
              <li>{t('depin.distribution1')}</li>
              <li>{t('depin.distribution2')}</li>
            </ul>
          </section>

          <section className="mb-12">
            <h2 className="text-2xl font-bold text-foreground mb-6">{t('depin.participationRequirements')}</h2>
            <h3 className="text-lg font-semibold text-foreground/90 mb-4">{t('depin.minimumHardware')}</h3>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse border border-border mb-6">
                <thead>
                  <tr className="bg-muted">
                    <th className="border border-border px-4 py-2 text-left">{t('depin.deviceType')}</th>
                    <th className="border border-border px-4 py-2 text-left">{t('depin.minimumSpecs')}</th>
                    <th className="border border-border px-4 py-2 text-left">{t('depin.supportedTasks')}</th>
                    <th className="border border-border px-4 py-2 text-left">{t('depin.stakingAmount')}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="border border-border px-4 py-2">{t('depin.mobilePhones')}</td>
                    <td className="border border-border px-4 py-2">{t('depin.mobileSpecs')}</td>
                    <td className="border border-border px-4 py-2">{t('depin.mobileTasks')}</td>
                    <td className="border border-border px-4 py-2">{t('depin.mobileStake')}</td>
                  </tr>
                  <tr>
                    <td className="border border-border px-4 py-2">{t('depin.pcLaptops')}</td>
                    <td className="border border-border px-4 py-2">{t('depin.pcSpecs')}</td>
                    <td className="border border-border px-4 py-2">{t('depin.pcTasks')}</td>
                    <td className="border border-border px-4 py-2">{t('depin.pcStake')}</td>
                  </tr>
                  <tr>
                    <td className="border border-border px-4 py-2">{t('depin.dedicatedServers')}</td>
                    <td className="border border-border px-4 py-2">{t('depin.serverSpecs')}</td>
                    <td className="border border-border px-4 py-2">{t('depin.serverTasks')}</td>
                    <td className="border border-border px-4 py-2">{t('depin.serverStake')}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="docs-glass p-6 rounded-xl mb-6">
              <h3 className="text-lg font-semibold text-foreground mb-3">{t('depin.softwareSetup')}</h3>
              <p className="text-muted-foreground">{t('depin.softwareSetupDesc')}</p>
              <ul className="text-muted-foreground space-y-1 ml-4 list-disc mt-2">
                <li>{t('depin.softwareSetup1')}</li>
                <li>{t('depin.softwareSetup2')}</li>
                <li>{t('depin.softwareSetup3')}</li>
              </ul>
            </div>
          </section>

          <section className="mb-12">
            <h2 className="text-2xl font-bold text-foreground mb-6">{t('depin.scalabilityAndSecurity')}</h2>
            <div className="grid md:grid-cols-2 gap-6 mb-6">
              <div className="docs-glass p-6 rounded-xl">
                <div className="flex items-start space-x-3">
                  <Zap className="w-6 h-6 text-foreground mt-1 flex-shrink-0" />
                  <div>
                    <h3 className="text-lg font-semibold text-foreground mb-2">{t('depin.dynamicTaskAllocation')}</h3>
                    <p className="text-muted-foreground mb-2">{t('depin.dynamicTaskDesc')}</p>
                    <ul className="text-muted-foreground text-sm space-y-1 ml-4 list-disc">
                      <li>{t('depin.dynamicTask1')}</li>
                      <li>{t('depin.dynamicTask2')}</li>
                      <li>{t('depin.dynamicTask3')}</li>
                    </ul>
                  </div>
                </div>
              </div>
              <div className="docs-glass p-6 rounded-xl">
                <div className="flex items-start space-x-3">
                  <Shield className="w-6 h-6 text-foreground mt-1 flex-shrink-0" />
                  <div>
                    <h3 className="text-lg font-semibold text-foreground mb-2">{t('depin.proofOfComputation')}</h3>
                    <p className="text-muted-foreground">{t('depin.proofOfComputationDesc')}</p>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-foreground mb-4">{t('depin.conclusion')}</h2>
            <p className="text-lg leading-relaxed text-muted-foreground mb-4">{t('depin.conclusionText1')}</p>
            <p className="text-lg leading-relaxed text-muted-foreground mb-4">{t('depin.conclusionText2')}</p>
            <p className="text-sm text-muted-foreground italic">{t('depin.openSourceNote')}</p>
          </section>
        </div>
      </div>
    </div>
  );
};

export default DePIN;
