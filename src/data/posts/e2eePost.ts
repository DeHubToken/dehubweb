import { BlogPost } from '@/types/blog';

export const e2eePost: BlogPost = {
  id: 'privacy-first-e2ee-dehub',
  title: 'Privacy First: Open Source End To End Encryption (E2EE) on DeHub',
  slug: 'privacy-first-open-source-e2ee-dehub',
  excerpt: 'Military-grade End-to-End Encryption ensures your conversations remain completely private. Learn how DeHub protects your messages with battle-tested cryptography.',
  content: `How DeHub's End-to-End Encryption Works

🔒 Military-Grade Privacy Protection

At DeHub, we've implemented military-grade End-to-End Encryption (E2EE) to ensure your conversations remain completely private. When you send a message, only you and your recipient can read it—not even DeHub's servers have access to your decrypted messages.

🛡️ What Makes Our E2EE Secure?

Zero-Trust Architecture

We use audited, zero-dependency cryptographic libraries from the @noble suite—the same cryptographic foundation trusted by security experts worldwide:

• @noble/ciphers - For authenticated encryption
• @noble/curves - For elliptic curve cryptography
• @noble/hashes - For cryptographic hashing

Battle-Tested Encryption Algorithms

XChaCha20-Poly1305 - Message Encryption

• Modern authenticated encryption used by Signal, WhatsApp, and secure messaging apps
• Provides both confidentiality (messages can't be read) and authenticity (messages can't be tampered with)
• Lightning-fast performance even on mobile devices

X25519 ECDH - Key Exchange

• Elliptic Curve Diffie-Hellman for secure key agreement
• Provides Perfect Forward Secrecy—each conversation uses unique session keys
• Based on Curve25519, offering 128-bit security level

HKDF-SHA256 - Key Derivation

• Industry-standard key derivation from shared secrets
• Ensures cryptographic separation between different conversations
• Deterministic yet secure key generation

🔐 How It Works: The Complete Flow

Phase 1: One-Time Setup (Enable E2EE)

When you enable E2EE in DeHub, here's what happens:

1. Wallet Signature Request
   • You're asked to sign a message: "Enable E2EE for Holder Chat"
   • Your wallet produces a unique cryptographic signature
   • This signature never leaves your device

2. Private Key Generation
   Your Wallet Signature → [SHA-256 hash] → 32-byte seed → [HKDF derivation] → Your Private Key (32 bytes)
   • Your private key is derived from your wallet signature
   • Never transmitted to DeHub servers
   • Never stored anywhere except your device

3. Public Key Creation
   Private Key → [X25519 operation] → Public Key (32 bytes) → [Base64 encoding] → Uploaded to DeHub database
   • Your public key is mathematically linked to your private key
   • Safe to share publicly—it's used by others to encrypt messages for you
   • Stored in DeHub's database so others can find it

What Gets Stored:
• On Your Device (IndexedDB): Private key, session keys (24-hour cache)
• On DeHub Servers: Public key, E2EE enabled status, key creation timestamp

Phase 2: Starting a Conversation

When you chat with someone who also has E2EE enabled:

Your Private Key (from your device) + Their Public Key (from DeHub database) → [X25519 ECDH Magic] → Shared Secret (32 bytes) → [HKDF with conversation context] → Session Key (32 bytes)

Key Features:
• Perfect Forward Secrecy - Each conversation has a unique session key
• Performance Optimization - Session keys are cached for 24 hours
• Both Parties Get the Same Key - Even though derived independently!

Phase 3: Sending a Message

When you type and send "Hello, world!":

1. Message Preparation
   "Hello, world!" → [UTF-8 encoding] → Plaintext bytes: [72, 101, 108, 108, 111, ...]

2. Encryption
   Plaintext bytes + Session Key + Random Nonce (24 bytes, freshly generated) → [XChaCha20-Poly1305 encryption] → Ciphertext + Authentication Tag (16 bytes) → [Base64 encoding] → Ready for DeHub servers

3. Storage - DeHub's database stores:
   ✅ Who sent it (your address)
   ✅ Who receives it (recipient's address)
   ✅ When it was sent (timestamp)
   ✅ Encrypted gibberish (the ciphertext)
   ❌ What it says (completely unreadable)

What DeHub Sees: We can see metadata (who, when, message count) but never the actual content—it's just encrypted gibberish to us!

Phase 4: Receiving a Message

When someone sends you an encrypted message:

1. Fetch from Database
   DeHub retrieves: encrypted_content + nonce + version

2. Session Key Retrieval
   Check cache → If found, use it
                ↓ If not found
   Derive fresh session key using ECDH (same as Phase 2)

3. Decryption
   Ciphertext + Authentication Tag + Nonce + Session Key → [XChaCha20-Poly1305 decryption] → Plaintext bytes (authentication verified!) → [UTF-8 decoding] → "Hello, world!" appears on your screen

Security Verification:
✅ Authenticity Verified - The authentication tag proves the message wasn't tampered with
✅ Correct Sender - Only someone with the sender's private key could create this ciphertext
✅ Replay Protection - Unique nonce prevents old messages from being replayed

🛡️ What E2EE Protects vs. What It Doesn't

✅ Fully Protected

• Message Content - Completely encrypted before leaving your device
• Message Integrity - Cannot be altered without detection
• Private Keys - Never leave your device, never transmitted
• Forward Secrecy - Unique keys per conversation
• Authenticity - Guaranteed sender identity

⚠️ Metadata (Visible to DeHub)

Like all E2EE systems (Signal, WhatsApp, etc.), some metadata must be visible for the app to function:

• Who you're messaging (sender/recipient addresses)
• When messages are sent (timestamps)
• How many messages exchanged (message count)
• Message type (text/image/voice—but not the content)

Why? This metadata is necessary for message routing and delivery. Without it, we couldn't deliver your messages!

🚀 Current Status & Roadmap

✅ Live Now

✅ Wallet-based key generation (no passwords!)
✅ Automatic DM encryption/decryption
✅ Session key caching
✅ Perfect forward secrecy
✅ E2EE status badges
✅ Backward compatibility with unencrypted messages

🚧 Coming Soon

🔜 Group message encryption - Encrypted group chats
🔜 Media encryption - Images, GIFs, voice messages
🔜 Key verification - Verify your contact's identity with QR codes
🔜 Key backup & recovery - Safely backup your encryption keys
🔜 Multi-device sync - Use E2EE across devices

💡 Why This Matters

DeHub can never:

❌ Read your messages
❌ Access your private keys
❌ Decrypt your conversations
❌ Share your message content with anyone

Even if:

🚨 DeHub's servers are hacked
🚨 We're served a government warrant
🚨 A rogue employee tries to access data

Your messages remain encrypted and unreadable. That's the power of true end-to-end encryption.

🎯 DeHub's Commitment to Privacy

At DeHub, we believe privacy is a fundamental right. Our E2EE implementation ensures that your conversations are truly private—protected by mathematics, not just policies. We've chosen industry-leading cryptographic libraries and algorithms to give you the same level of security used by Signal, WhatsApp, and other privacy-focused messaging platforms.

Your messages. Your privacy. Always.`,
  bannerImage: '/lovable-uploads/e2ee-banner.png',
  bannerImageAlt: 'DeHub End-to-End Encryption Banner - Privacy First Technology',
  author: {
    name: 'DeHub Team',
  },
  publishedAt: '2025-10-22T00:00:00Z',
  tags: ['Privacy', 'Security', 'Encryption', 'Technology', 'E2EE'],
  readingTime: 14,
  featured: true,
  status: 'published',
  seoTitle: 'Privacy First: Open Source End-to-End Encryption on DeHub | E2EE Explained',
  seoDescription: 'Learn how DeHub protects your privacy with military-grade E2EE using XChaCha20-Poly1305, X25519 ECDH, and battle-tested cryptography. Your messages, truly private.',
};
