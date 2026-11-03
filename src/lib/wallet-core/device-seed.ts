// The words of a wallet made silently at sign-up, kept on this browser until
// the person secures it.
//
// A brand-new account no longer stops at "Secure account": the backend only
// creates an account from a wallet signature, so sign-up makes the wallet
// itself and goes straight in (see AuthProvider.proceedToWalletPhase). Its
// user_wallets row has no password wrap yet (payload null, as for a
// biometrics-only wallet), so these words are the only copy. They are held
// here under an unexportable AES-GCM key in IndexedDB, the same scheme as
// key-vault.ts, and are what "Secure your wallet" wraps with a password or
// biometrics at the first wallet action (see lib/wallet-secure-flow.ts). Once
// secured, the record is deleted.
//
// Keyed by Supabase user id, so another account on this browser can neither
// read nor clear it. Unlike the key vault it survives logout: until secured,
// signing back in on this browser is the only way back to the wallet.
//
// Every entry point fails soft. saveDeviceSeed resolving false means sign-up
// must fall back to the visible setup step instead of minting a wallet nothing
// could reopen.
import { openDB, type IDBPDatabase } from "idb";

const DB_NAME = "dehub-wallet-device-seed";
const DB_VERSION = 1;
const STORE = "seeds";

export interface DeviceSeed {
  secret: string;
  /** EOA the words derive to. */
  address: string;
}

interface DeviceSeedRecord {
  wrapKey: CryptoKey;
  iv: Uint8Array;
  ciphertext: ArrayBuffer;
  address: string;
}

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDb(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      },
    }).catch((e) => {
      dbPromise = null;
      throw e;
    });
  }
  return dbPromise;
}

function usable(): boolean {
  return (
    typeof indexedDB !== "undefined" &&
    typeof crypto !== "undefined" &&
    typeof crypto.subtle !== "undefined"
  );
}

export async function saveDeviceSeed(userId: string, secret: string, address: string): Promise<boolean> {
  if (!usable() || !userId) return false;
  try {
    const wrapKey = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, wrapKey, new TextEncoder().encode(secret));
    const db = await getDb();
    const record: DeviceSeedRecord = { wrapKey, iv, ciphertext, address: address.toLowerCase() };
    await db.put(STORE, record, userId);
    // Read it back: a browser that accepts the write but cannot clone a
    // CryptoKey would otherwise leave a wallet with no way back to it.
    const check = await readDeviceSeed(userId);
    return check?.secret === secret;
  } catch (e) {
    console.warn("[DeviceSeed] Could not store the wallet on this browser:", e);
    return false;
  }
}

export async function readDeviceSeed(userId: string): Promise<DeviceSeed | null> {
  if (!usable() || !userId) return null;
  try {
    const db = await getDb();
    const record = (await db.get(STORE, userId)) as DeviceSeedRecord | undefined;
    if (!record?.wrapKey || !record.ciphertext) return null;
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: record.iv as BufferSource }, record.wrapKey, record.ciphertext);
    return { secret: new TextDecoder().decode(plain), address: record.address };
  } catch (e) {
    console.warn("[DeviceSeed] Could not read the stored wallet:", e);
    return null;
  }
}

export async function clearDeviceSeed(userId: string): Promise<void> {
  if (!usable() || !userId) return;
  try {
    const db = await getDb();
    await db.delete(STORE, userId);
  } catch (e) {
    console.warn("[DeviceSeed] Could not clear the stored wallet:", e);
  }
}
