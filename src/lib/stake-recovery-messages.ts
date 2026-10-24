import { translateCopy as _translateCopy } from '@/i18n/copy';

/** Recovery copy shared by the staking notice outcomes. Hand-written where a language has one; every other language goes through the shared copy key. */
const messages: Record<string, string> = {
  en: "This deposit is no longer pending on the network. Tracking cleared; check your wallet activity before depositing again.",
  ar: "لم يعد هذا الإيداع معلقًا على الشبكة. تم مسح التتبع؛ تحقق من نشاط محفظتك قبل الإيداع مرة أخرى.",
  es: "Este depósito ya no está pendiente en la red. Se ha borrado el seguimiento; revisa la actividad de tu cartera antes de volver a depositar.",
  fr: "Ce dépôt n’est plus en attente sur le réseau. Le suivi a été effacé ; vérifiez l’activité de votre portefeuille avant de déposer à nouveau.",
  nl: "Deze storting staat niet meer in behandeling op het netwerk. De tracking is gewist; controleer je walletactiviteit voordat je opnieuw stort.",
  tr: "Bu yatırma işlemi artık ağda beklemiyor. Takip temizlendi; tekrar yatırmadan önce cüzdan hareketlerinizi kontrol edin.",
};

export function retiredStakeMessage(language: string): string {
  return messages[language.toLowerCase().split(/[-_]/)[0]]
    ?? _translateCopy('copy.78930530fc52', { defaultValue: messages.en });
}
