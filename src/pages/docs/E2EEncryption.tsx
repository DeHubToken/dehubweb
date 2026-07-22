import React from 'react';
import { Lock, Shield, Key, CheckCircle, XCircle, AlertTriangle, Zap, Clock, QrCode, Smartphone } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useLanguage } from '@/contexts/LanguageContext';

const E2EEncryption = () => {
  const { t } = useLanguage();

  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <h2 className="text-3xl font-bold text-foreground font-exo">{t('e2ee.title')}</h2>
        <p className="text-lg text-muted-foreground">{t('e2ee.subtitle')}</p>
      </div>

      {/* How DeHub's E2EE Works */}
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl flex items-center gap-3">
            <Lock className="w-7 h-7" />
            {t('e2ee.howWorksTitle')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="docs-glass p-6 rounded-xl">
            <h3 className="text-lg font-semibold text-foreground mb-3 flex items-center gap-2">
              <Shield className="w-5 h-5" />
              {t('e2ee.militaryGrade')}
            </h3>
            <p className="text-muted-foreground">{t('e2ee.militaryGradeDesc')}</p>
          </div>
        </CardContent>
      </Card>

      {/* What Makes Our E2EE Secure */}
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl flex items-center gap-3">
            <Shield className="w-7 h-7" />
            {t('e2ee.whatSecureTitle')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div>
            <h3 className="text-xl font-semibold text-foreground mb-3">{t('e2ee.zeroTrust')}</h3>
            <p className="text-muted-foreground mb-3">{t('e2ee.zeroTrustDesc')}</p>
            <ul className="space-y-2 ml-4">
              <li className="text-muted-foreground"><code className="bg-muted px-2 py-1 rounded text-sm">@noble/ciphers</code> - {t('e2ee.nobleCiphers')}</li>
              <li className="text-muted-foreground"><code className="bg-muted px-2 py-1 rounded text-sm">@noble/curves</code> - {t('e2ee.nobleCurves')}</li>
              <li className="text-muted-foreground"><code className="bg-muted px-2 py-1 rounded text-sm">@noble/hashes</code> - {t('e2ee.nobleHashes')}</li>
            </ul>
          </div>

          <div>
            <h3 className="text-xl font-semibold text-foreground mb-4">{t('e2ee.battleTested')}</h3>
            <div className="space-y-4">
              <div className="docs-glass p-5 rounded-xl">
                <h4 className="text-lg font-semibold text-foreground mb-2">{t('e2ee.xchachaTitle')}</h4>
                <ul className="text-muted-foreground space-y-1 ml-4 list-disc text-sm">
                  <li>{t('e2ee.xchacha1')}</li>
                  <li>{t('e2ee.xchacha2')}</li>
                  <li>{t('e2ee.xchacha3')}</li>
                </ul>
              </div>
              <div className="docs-glass p-5 rounded-xl">
                <h4 className="text-lg font-semibold text-foreground mb-2">{t('e2ee.x25519Title')}</h4>
                <ul className="text-muted-foreground space-y-1 ml-4 list-disc text-sm">
                  <li>{t('e2ee.x255191')}</li>
                  <li>{t('e2ee.x255192')}</li>
                  <li>{t('e2ee.x255193')}</li>
                </ul>
              </div>
              <div className="docs-glass p-5 rounded-xl">
                <h4 className="text-lg font-semibold text-foreground mb-2">{t('e2ee.hkdfTitle')}</h4>
                <ul className="text-muted-foreground space-y-1 ml-4 list-disc text-sm">
                  <li>{t('e2ee.hkdf1')}</li>
                  <li>{t('e2ee.hkdf2')}</li>
                  <li>{t('e2ee.hkdf3')}</li>
                </ul>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Complete Flow */}
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl flex items-center gap-3">
            <Key className="w-7 h-7" />
            {t('e2ee.completeFlowTitle')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-8">
          {/* Phase 1 */}
          <div>
            <h3 className="text-xl font-semibold text-foreground mb-4">{t('e2ee.phase1Title')}</h3>
            <p className="text-muted-foreground mb-4">{t('e2ee.phase1Desc')}</p>
            <div className="space-y-4">
              <div className="bg-muted/50 p-4 rounded-lg border">
                <h4 className="font-semibold text-foreground mb-2">{t('e2ee.walletSignature')}</h4>
                <ul className="text-muted-foreground space-y-1 ml-4 list-disc text-sm">
                  <li>{t('e2ee.walletSig1')}</li>
                  <li>{t('e2ee.walletSig2')}</li>
                  <li>{t('e2ee.walletSig3')}</li>
                </ul>
              </div>
              <div className="bg-muted/50 p-4 rounded-lg border">
                <h4 className="font-semibold text-foreground mb-2">{t('e2ee.privateKeyGen')}</h4>
                <pre className="bg-muted text-foreground p-4 rounded-lg text-xs overflow-x-auto font-mono">
                {`Your Wallet Signature
     ↓ [SHA-256 hash]
32-byte seed
     ↓ [HKDF derivation]
Your Private Key (32 bytes)`}
                </pre>
                <ul className="text-muted-foreground space-y-1 ml-4 list-disc text-sm mt-3">
                  <li>{t('e2ee.privateKey1')}</li>
                  <li>{t('e2ee.privateKey2')}</li>
                  <li>{t('e2ee.privateKey3')}</li>
                </ul>
              </div>
              <div className="bg-muted/50 p-4 rounded-lg border">
                <h4 className="font-semibold text-foreground mb-2">{t('e2ee.publicKeyCreation')}</h4>
                <pre className="bg-muted text-foreground p-4 rounded-lg text-xs overflow-x-auto font-mono">
                {`Private Key
     ↓ [X25519 operation]
Public Key (32 bytes)
     ↓ [Base64 encoding]
Uploaded to DeHub database`}
                </pre>
                <ul className="text-muted-foreground space-y-1 ml-4 list-disc text-sm mt-3">
                  <li>{t('e2ee.publicKey1')}</li>
                  <li>{t('e2ee.publicKey2')}</li>
                  <li>{t('e2ee.publicKey3')}</li>
                </ul>
              </div>
              <div className="docs-glass p-4 rounded-lg">
                <h4 className="font-semibold text-foreground mb-2">{t('e2ee.whatStored')}</h4>
                <ul className="text-muted-foreground space-y-1 ml-4 list-disc text-sm">
                  <li><strong>{t('e2ee.storedDevice')}</strong> {t('e2ee.storedDeviceDesc')}</li>
                  <li><strong>{t('e2ee.storedServer')}</strong> {t('e2ee.storedServerDesc')}</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Phase 2 */}
          <div>
            <h3 className="text-xl font-semibold text-foreground mb-4">{t('e2ee.phase2Title')}</h3>
            <p className="text-muted-foreground mb-4">{t('e2ee.phase2Desc')}</p>
            <pre className="bg-muted text-foreground p-4 rounded-lg text-sm overflow-x-auto font-mono">
            {`Your Private Key (from your device)
    +
Their Public Key (from DeHub database)
    ↓ [X25519 ECDH Magic]
Shared Secret (32 bytes)
    ↓ [HKDF with conversation context]
Session Key (32 bytes)`}
            </pre>
            <div className="docs-glass p-4 rounded-lg mt-4">
              <h4 className="font-semibold text-foreground mb-2">{t('e2ee.keyFeatures')}</h4>
              <ul className="text-muted-foreground space-y-1 ml-4 list-disc text-sm">
                <li><strong>{t('e2ee.pfs')}</strong> - {t('e2ee.pfsDesc')}</li>
                <li><strong>{t('e2ee.perfOpt')}</strong> - {t('e2ee.perfOptDesc')}</li>
                <li><strong>{t('e2ee.sameKey')}</strong> - {t('e2ee.sameKeyDesc')}</li>
              </ul>
            </div>
          </div>

          {/* Phase 3 */}
          <div>
            <h3 className="text-xl font-semibold text-foreground mb-4">{t('e2ee.phase3Title')}</h3>
            <p className="text-muted-foreground mb-4">{t('e2ee.phase3Desc')}</p>
            <div className="space-y-4">
              <div className="bg-muted/50 p-4 rounded-lg border">
                <h4 className="font-semibold text-foreground mb-2">{t('e2ee.msgPrep')}</h4>
                <pre className="bg-muted text-foreground p-4 rounded-lg text-xs overflow-x-auto font-mono">
                {`"Hello, world!"
    ↓ [UTF-8 encoding]
Plaintext bytes: [72, 101, 108, 108, 111, ...]`}
                </pre>
              </div>
              <div className="bg-muted/50 p-4 rounded-lg border">
                <h4 className="font-semibold text-foreground mb-2">{t('e2ee.encryption')}</h4>
                <pre className="bg-muted text-foreground p-4 rounded-lg text-xs overflow-x-auto font-mono">
                {`Plaintext bytes
    +
Session Key
    +
Random Nonce (24 bytes, freshly generated)
    ↓ [XChaCha20-Poly1305 encryption]
Ciphertext + Authentication Tag (16 bytes)
    ↓ [Base64 encoding]
Ready for DeHub servers`}
                </pre>
              </div>
              <div className="docs-glass p-4 rounded-lg">
                <h4 className="font-semibold text-foreground mb-2">{t('e2ee.storage')}</h4>
                <p className="text-muted-foreground mb-2 text-sm">{t('e2ee.storageDesc')}</p>
                <ul className="text-muted-foreground space-y-1 ml-4 text-sm">
                  <li className="flex items-center gap-2"><CheckCircle className="w-4 h-4" />{t('e2ee.storeSender')}</li>
                  <li className="flex items-center gap-2"><CheckCircle className="w-4 h-4" />{t('e2ee.storeRecipient')}</li>
                  <li className="flex items-center gap-2"><CheckCircle className="w-4 h-4" />{t('e2ee.storeTimestamp')}</li>
                  <li className="flex items-center gap-2"><CheckCircle className="w-4 h-4" />{t('e2ee.storeCiphertext')}</li>
                  <li className="flex items-center gap-2"><XCircle className="w-4 h-4" />{t('e2ee.storeUnreadable')}</li>
                </ul>
              </div>
              <div className="docs-glass p-4 rounded-lg">
                <AlertTriangle className="w-5 h-5 text-foreground mb-2" />
                <p className="text-foreground text-sm">
                  <strong>{t('e2ee.whatDehubSees')}</strong> {t('e2ee.whatDehubSeesDesc')}
                </p>
              </div>
            </div>
          </div>

          {/* Phase 4 */}
          <div>
            <h3 className="text-xl font-semibold text-foreground mb-4">{t('e2ee.phase4Title')}</h3>
            <p className="text-muted-foreground mb-4">{t('e2ee.phase4Desc')}</p>
            <div className="space-y-4">
              <div className="bg-muted/50 p-4 rounded-lg border">
                <h4 className="font-semibold text-foreground mb-2">{t('e2ee.fetchDb')}</h4>
                <p className="text-muted-foreground text-sm">{t('e2ee.fetchDbDesc')}</p>
              </div>
              <div className="bg-muted/50 p-4 rounded-lg border">
                <h4 className="font-semibold text-foreground mb-2">{t('e2ee.sessionKeyRetrieval')}</h4>
                <pre className="bg-muted text-foreground p-4 rounded-lg text-xs overflow-x-auto font-mono">
                {`Check cache → If found, use it
             ↓ If not found
Derive fresh session key using ECDH (same as Phase 2)`}
                </pre>
              </div>
              <div className="bg-muted/50 p-4 rounded-lg border">
                <h4 className="font-semibold text-foreground mb-2">{t('e2ee.decryption')}</h4>
                <pre className="bg-muted text-foreground p-4 rounded-lg text-xs overflow-x-auto font-mono">
                {`Ciphertext + Authentication Tag
    +
Nonce
    +
Session Key
    ↓ [XChaCha20-Poly1305 decryption]
Plaintext bytes (authentication verified!)
    ↓ [UTF-8 decoding]
"Hello, world!" appears on your screen`}
                </pre>
              </div>
              <div className="docs-glass p-4 rounded-lg">
                <h4 className="font-semibold text-foreground mb-2">{t('e2ee.securityVerification')}</h4>
                <ul className="text-muted-foreground space-y-1 ml-4 text-sm">
                  <li className="flex items-center gap-2"><CheckCircle className="w-4 h-4" /><strong>{t('e2ee.authVerified')}</strong> - {t('e2ee.authVerifiedDesc')}</li>
                  <li className="flex items-center gap-2"><CheckCircle className="w-4 h-4" /><strong>{t('e2ee.correctSender')}</strong> - {t('e2ee.correctSenderDesc')}</li>
                  <li className="flex items-center gap-2"><CheckCircle className="w-4 h-4" /><strong>{t('e2ee.replayProtection')}</strong> - {t('e2ee.replayProtectionDesc')}</li>
                </ul>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* What E2EE Protects */}
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">{t('e2ee.protectsTitle')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-2 gap-6">
            <div className="docs-glass p-6 rounded-xl">
              <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                <CheckCircle className="w-5 h-5" />
                {t('e2ee.fullyProtected')}
              </h3>
              <ul className="space-y-2">
                {[
                  [t('e2ee.msgContent'), t('e2ee.msgContentDesc')],
                  [t('e2ee.msgIntegrity'), t('e2ee.msgIntegrityDesc')],
                  [t('e2ee.privateKeys'), t('e2ee.privateKeysDesc')],
                  [t('e2ee.forwardSecrecy'), t('e2ee.forwardSecrecyDesc')],
                  [t('e2ee.authenticity'), t('e2ee.authenticityDesc')],
                ].map(([title, desc], i) => (
                  <li key={i} className="text-muted-foreground text-sm flex items-start gap-2">
                    <CheckCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                    <div><strong>{title}</strong> - {desc}</div>
                  </li>
                ))}
              </ul>
            </div>

            <div className="docs-glass p-6 rounded-xl">
              <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5" />
                {t('e2ee.metadataTitle')}
              </h3>
              <p className="text-muted-foreground text-sm mb-3">{t('e2ee.metadataDesc')}</p>
              <ul className="space-y-2">
                {[t('e2ee.metaWho'), t('e2ee.metaWhen'), t('e2ee.metaCount'), t('e2ee.metaType')].map((item, i) => (
                  <li key={i} className="text-muted-foreground text-sm flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                    <div>{item}</div>
                  </li>
                ))}
              </ul>
              <p className="text-foreground text-sm mt-3 italic">
                <strong>{t('e2ee.metaWhy')}</strong> {t('e2ee.metaWhyDesc')}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Current Status & Roadmap */}
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">{t('e2ee.statusTitle')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-2 gap-6">
            <div className="docs-glass p-6 rounded-xl">
              <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                <CheckCircle className="w-5 h-5" />
                {t('e2ee.liveNow')}
              </h3>
              <ul className="space-y-2">
                {[t('e2ee.live1'), t('e2ee.live2'), t('e2ee.live3'), t('e2ee.live4'), t('e2ee.live5'), t('e2ee.live6')].map((item, i) => (
                  <li key={i} className="text-muted-foreground text-sm flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 flex-shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            <div className="docs-glass p-6 rounded-xl">
              <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                <Clock className="w-5 h-5" />
                {t('e2ee.comingSoon')}
              </h3>
              <ul className="space-y-2">
                {[
                  [Clock, t('e2ee.coming1')],
                  [Smartphone, t('e2ee.coming2')],
                  [QrCode, t('e2ee.coming3')],
                  [Key, t('e2ee.coming4')],
                  [Zap, t('e2ee.coming5')],
                ].map(([Icon, text], i) => (
                  <li key={i} className="text-muted-foreground text-sm flex items-center gap-2">
                    {React.createElement(Icon as any, { className: "w-4 h-4 flex-shrink-0" })}
                    {text as string}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Why This Matters */}
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">{t('e2ee.whyMattersTitle')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="docs-glass p-6 rounded-xl mb-6">
            <h3 className="text-lg font-semibold text-foreground mb-3">{t('e2ee.dehubNever')}</h3>
            <ul className="space-y-2">
              {[t('e2ee.never1'), t('e2ee.never2'), t('e2ee.never3'), t('e2ee.never4')].map((item, i) => (
                <li key={i} className="text-muted-foreground text-sm flex items-center gap-2">
                  <XCircle className="w-4 h-4 flex-shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <div className="docs-glass p-6 rounded-xl">
            <h3 className="text-lg font-semibold text-foreground mb-3">{t('e2ee.evenIf')}</h3>
            <ul className="space-y-2">
              {[t('e2ee.evenIf1'), t('e2ee.evenIf2'), t('e2ee.evenIf3')].map((item, i) => (
                <li key={i} className="text-muted-foreground text-sm flex items-center gap-2">
                  <Shield className="w-4 h-4 flex-shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
            <p className="text-foreground mt-4 font-medium">{t('e2ee.evenIfConclusion')}</p>
          </div>
        </CardContent>
      </Card>

      {/* DeHub's Commitment */}
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">{t('e2ee.commitmentTitle')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="docs-glass p-6 rounded-xl">
            <p className="text-foreground leading-relaxed">{t('e2ee.commitmentDesc')}</p>
            <p className="text-foreground font-semibold mt-4 text-center text-lg">{t('e2ee.commitmentSlogan')}</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default E2EEncryption;
