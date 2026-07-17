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

            <div className="bg-green-50 dark:bg-green-900/20 p-6 rounded-xl border border-green-200 dark:border-green-800 mb-6">
              <div className="flex items-start space-x-3">
                <Network className="w-6 h-6 text-green-600 dark:text-green-400 mt-1 flex-shrink-0" />
                <div>
                  <h3 className="text-lg font-semibold text-green-800 dark:text-green-200 mb-2">{t('depin.solutionTitle')}</h3>
                  <p className="text-green-700 dark:text-green-300 mb-3">{t('depin.solutionDesc')}</p>
                  <ul className="text-green-700 dark:text-green-300 space-y-1 ml-4 list-disc">
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
              <div className="bg-blue-50 dark:bg-blue-900/20 p-6 rounded-xl border border-blue-200 dark:border-blue-800">
                <h3 className="text-lg font-semibold text-blue-800 dark:text-blue-200 mb-2">{t('depin.contributors')}</h3>
                <p className="text-blue-700 dark:text-blue-300">{t('depin.contributorsDesc')}</p>
              </div>
              <div className="bg-purple-50 dark:bg-purple-900/20 p-6 rounded-xl border border-purple-200 dark:border-purple-800">
                <h3 className="text-lg font-semibold text-purple-800 dark:text-purple-200 mb-2">{t('depin.coordinator')}</h3>
                <p className="text-purple-700 dark:text-purple-300">{t('depin.coordinatorDesc')}</p>
              </div>
              <div className="bg-cyan-50 dark:bg-cyan-900/20 p-6 rounded-xl border border-cyan-200 dark:border-cyan-800">
                <h3 className="text-lg font-semibold text-cyan-800 dark:text-cyan-200 mb-2">{t('depin.dehubApp')}</h3>
                <p className="text-cyan-700 dark:text-cyan-300">{t('depin.dehubAppDesc')}</p>
              </div>
              <div className="bg-amber-50 dark:bg-amber-900/20 p-6 rounded-xl border border-amber-200 dark:border-amber-800">
                <h3 className="text-lg font-semibold text-amber-800 dark:text-amber-200 mb-2">{t('depin.clients')}</h3>
                <p className="text-amber-700 dark:text-amber-300">{t('depin.clientsDesc')}</p>
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
            <div className="bg-green-50 dark:bg-green-900/20 p-6 rounded-xl border border-green-200 dark:border-green-800 mb-6">
              <h3 className="text-lg font-semibold text-green-800 dark:text-green-200 mb-3">{t('depin.revenuePool')}</h3>
              <p className="text-green-700 dark:text-green-300 mb-3">{t('depin.revenuePoolDesc')}</p>
              <ul className="text-green-700 dark:text-green-300 space-y-1 ml-4 list-disc">
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

            <div className="bg-blue-50 dark:bg-blue-900/20 p-6 rounded-xl border border-blue-200 dark:border-blue-800 mb-6">
              <h3 className="text-lg font-semibold text-blue-800 dark:text-blue-200 mb-3">{t('depin.softwareSetup')}</h3>
              <p className="text-blue-700 dark:text-blue-300">{t('depin.softwareSetupDesc')}</p>
              <ul className="text-blue-700 dark:text-blue-300 space-y-1 ml-4 list-disc mt-2">
                <li>{t('depin.softwareSetup1')}</li>
                <li>{t('depin.softwareSetup2')}</li>
                <li>{t('depin.softwareSetup3')}</li>
              </ul>
            </div>
          </section>

          <section className="mb-12">
            <h2 className="text-2xl font-bold text-foreground mb-6">{t('depin.scalabilityAndSecurity')}</h2>
            <div className="grid md:grid-cols-2 gap-6 mb-6">
              <div className="bg-blue-50 dark:bg-blue-900/20 p-6 rounded-xl border border-blue-200 dark:border-blue-800">
                <div className="flex items-start space-x-3">
                  <Zap className="w-6 h-6 text-blue-600 dark:text-blue-400 mt-1 flex-shrink-0" />
                  <div>
                    <h3 className="text-lg font-semibold text-blue-800 dark:text-blue-200 mb-2">{t('depin.dynamicTaskAllocation')}</h3>
                    <p className="text-blue-700 dark:text-blue-300 mb-2">{t('depin.dynamicTaskDesc')}</p>
                    <ul className="text-blue-700 dark:text-blue-300 text-sm space-y-1 ml-4 list-disc">
                      <li>{t('depin.dynamicTask1')}</li>
                      <li>{t('depin.dynamicTask2')}</li>
                      <li>{t('depin.dynamicTask3')}</li>
                    </ul>
                  </div>
                </div>
              </div>
              <div className="bg-green-50 dark:bg-green-900/20 p-6 rounded-xl border border-green-200 dark:border-green-800">
                <div className="flex items-start space-x-3">
                  <Shield className="w-6 h-6 text-green-600 dark:text-green-400 mt-1 flex-shrink-0" />
                  <div>
                    <h3 className="text-lg font-semibold text-green-800 dark:text-green-200 mb-2">{t('depin.proofOfComputation')}</h3>
                    <p className="text-green-700 dark:text-green-300">{t('depin.proofOfComputationDesc')}</p>
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
