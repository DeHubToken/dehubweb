// Persist an UNLOCKED wallet key across page loads without ever writing the key
// somewhere a script can read back.
//
// How it works: a wrap key is generated with `extractable: false` and stored as
// a live CryptoKey object in IndexedDB. The browser will structured-clone a
// non-extractable key into IDB, but there is no exportKey/wrapKey path off it —
// so the bytes cannot be read out by page script, by an extension content
// script, or by anything that walks off with a copy of the browser profile. The
// private key itself is stored only as AES-GCM ciphertext under that handle.
//
// What this deliberately does NOT defend against: script running ON this origin
// can still ask the browser to decrypt with the handle. Persisting the unlock
// therefore widens the window in which an XSS could sign as the user from "one
// page session" to "until logout". That is the trade the product chose so the
// wallet stops asking for a password after every refresh; the countermeasure is
// that the wrap key is unexportable and that lockWallet()/logout destroys the
// record. See src/lib/smart-wallet.ts for the callers.
//
// Every entry point fails soft: private mode, a blocked IDB, or a browser with
// no structured-clone support for CryptoKey all degrade to the previous
// memory-only behaviour (an unlock that lasts until the page unloads) rather
// than breaking the wallet.
import { openDB, type IDBPDatabase } from "idb";

const DB_NAME = "dehub-wallet-vault";
const DB_VERSION = 1;
const STORE = "vault";
const RECORD_KEY = "session";

export interface VaultSession {
  privKeyHex: string;
  /** EOA address the key belongs to — checked on read so a stale record from a
   *  previous account on this device can never unlock the current one. */
  address: string;
  /** ms timestamp of the unlock this record represents. */
  unlockedAt: number;
}

interface VaultRecord {
  wrapKey: CryptoKey;
  iv: Uint8Array;
  ciphertext: ArrayBuffer;
  address: string;
  unlockedAt: number;
}

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDb(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      },
    }).catch((e) => {
      // Reset so a later call can retry — a first failure is often a transient
      // "database is blocked by another tab upgrading" rather than a permanent
      // lack of IDB.
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

/**
 * Encrypt `privKeyHex` under a fresh unexportable key and store both in IDB.
 * Replaces any existing record. Resolves false if the vault is unavailable, in
 * which case the caller keeps its in-memory-only session.
 */
export async function saveVaultSession(
  privKeyHex: string,
  address: string,
  unlockedAt: number,
): Promise<boolean> {
  if (!usable()) return false;
  try {
    const wrapKey = await crypto.subtle.generateKey(
      { name: "AES-GCM", length: 256 },
      false, // unexportable — the whole point
      ["encrypt", "decrypt"],
    );
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      wrapKey,
      new TextEncoder().encode(privKeyHex),
    );

    const db = await getDb();
    const record: VaultRecord = { wrapKey, iv, ciphertext, address, unlockedAt };
    await db.put(STORE, record, RECORD_KEY);
    return true;
  } catch (e) {
    // A browser that refuses to structured-clone a CryptoKey lands here. Not
    // worth a user-visible error: the wallet still works, it just relocks on
    // refresh like it did before.
    console.warn("[KeyVault] Could not persist unlock — staying memory-only:", e);
    return false;
  }
}

/**
 * Read back the stored key. Returns null when there is no record, when the
 * vault is unavailable, or when the record belongs to a different address than
 * `expectedAddress` (which is then also cleared, since it can never be used).
 */
export async function readVaultSession(expectedAddress?: string): Promise<VaultSession | null> {
  if (!usable()) return null;
  try {
    const db = await getDb();
    const record = (await db.get(STORE, RECORD_KEY)) as VaultRecord | undefined;
    if (!record?.wrapKey || !record.ciphertext) return null;

    if (
      expectedAddress &&
      record.address?.toLowerCase() !== expectedAddress.toLowerCase()
    ) {
      await clearVaultSession();
      return null;
    }

    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: record.iv as BufferSource },
      record.wrapKey,
      record.ciphertext,
    );
    return {
      privKeyHex: new TextDecoder().decode(plain),
      address: record.address,
      unlockedAt: record.unlockedAt,
    };
  } catch (e) {
    console.warn("[KeyVault] Could not read persisted unlock:", e);
    return null;
  }
}

/** Destroy the stored key. Called on lock and on logout. */
export async function clearVaultSession(): Promise<void> {
  if (!usable()) return;
  try {
    const db = await getDb();
    await db.delete(STORE, RECORD_KEY);
  } catch (e) {
    console.warn("[KeyVault] Could not clear persisted unlock:", e);
  }
}
