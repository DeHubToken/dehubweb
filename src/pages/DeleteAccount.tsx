import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { SEOHead } from "@/components/SEOHead";

const DeleteAccount = () => {
  return (
    <>
      <SEOHead
        title="Delete Account and Data — DeHub"
        description="Request deletion of your DeHub account and associated data. Learn what is deleted, what is retained, and how to submit a request."
        url="https://dehub.io/delete-account"
      />
    <div className="min-h-screen h-auto overflow-y-auto bg-black text-white fixed inset-0">
      <div className="container mx-auto px-4 py-4 max-w-4xl pb-8">
        <Button 
          asChild 
          variant="ghost" 
          size="sm" 
          className="mb-4 text-white/80 hover:text-white"
        >
          <Link to="/">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Home
          </Link>
        </Button>
        
        <h1 className="text-xl font-bold mb-2">Account and Data Deletion</h1>
        
        <p className="text-xs text-white/80 mb-2">
          This page explains how you can request deletion of your DeHub account and associated data, 
          or request deletion of specific data without deleting your account. You can use this URL 
          in app stores where a "Delete account URL" is required.
        </p>

        <section className="mb-3">
          <h2 className="text-base font-semibold mb-2">How to submit a deletion request</h2>
          <ol className="list-decimal list-inside space-y-1 text-xs text-white/80">
            <li>
              Send an email to <a href="mailto:dev@dehub.io" className="text-white hover:underline">dev@dehub.io</a> from
              the email address linked to your DeHub account. If your account is wallet-based, include your wallet address as shown in the app.
            </li>
            <li>
              Use one of the following subject lines so we can route your request quickly:
              <ul className="list-disc list-inside ml-6 mt-2">
                <li>Subject: Account deletion</li>
                <li>Subject: Data deletion</li>
              </ul>
            </li>
            <li>
              Include the following details in the email body:
              <ul className="list-disc list-inside ml-6 mt-2">
                <li>Your DeHub username (if set)</li>
                <li>The email address linked to your account</li>
                <li>Your primary wallet address used on DeHub</li>
                <li>The type of request: account deletion or data deletion</li>
                <li>Optional: brief reason for the request</li>
              </ul>
            </li>
          </ol>
        </section>

        <section className="mb-3">
          <h2 className="text-base font-semibold mb-2">What is deleted vs. retained</h2>
          
          <div className="mb-2">
            <h3 className="text-sm font-medium mb-1 text-white">Deleted</h3>
            <ul className="list-disc list-inside space-y-0.5 text-xs text-white/80">
              <li>Account profile (username, display name, bio, avatar, cover)</li>
              <li>Social links (e.g., X/Twitter, Discord, Instagram, etc.)</li>
              <li>Off‑chain app activity (comments, likes, follows, notifications)</li>
              <li>Uploaded content stored by DeHub (subject to takedown propagation)</li>
              <li>App-side associations to your wallet address</li>
            </ul>
          </div>

          <div>
            <h3 className="text-sm font-medium mb-1 text-red-400">Retained (not deletable)</h3>
            <ul className="list-disc list-inside space-y-0.5 text-xs text-white/80">
              <li>On‑chain records (transactions, mints, transfers) recorded on public blockchains. These are immutable and cannot be altered or deleted by DeHub.</li>
              <li>Security, fraud-prevention, and audit logs retained for up to 90 days, or longer if legally required.</li>
              <li>Minimal records necessary to comply with law, resolve disputes, or enforce our terms.</li>
            </ul>
          </div>
        </section>

        <section className="mb-3">
          <h2 className="text-base font-semibold mb-2">Data deletion without deleting your account</h2>
          <p className="text-xs text-white/80">
            Yes. You may request that certain data (for example, your profile information or off‑chain activity) 
            be deleted while keeping your account active. Use the subject line <strong>Data deletion</strong> and 
            specify the categories of data you want removed.
          </p>
        </section>

        <section className="mb-3">
          <h2 className="text-base font-semibold mb-2">Verification</h2>
          <p className="text-xs text-white/80">
            We will verify that the request is coming from the email linked to the account. If your email cannot 
            be verified, we may ask you to sign a verification message with the wallet address associated with your DeHub account.
          </p>
        </section>

        <section className="mb-3">
          <h2 className="text-base font-semibold mb-2">Processing time and retention</h2>
          <ul className="list-disc list-inside space-y-0.5 text-xs text-white/80">
            <li>We aim to acknowledge requests within 7 days and complete processing within 30 days.</li>
            <li>Backups and security logs may persist for up to 90 days before being automatically purged, unless a longer period is required by law.</li>
            <li>Once processed, deletion is irreversible.</li>
          </ul>
        </section>

        <section className="mb-3">
          <h2 className="text-base font-semibold mb-2">Sample email templates</h2>
          
          <div className="mb-2">
            <h3 className="text-sm font-medium mb-1">Account deletion</h3>
            <div className="bg-white/10 p-2 rounded-lg font-mono text-[10px] text-white/90">
              <p className="mb-2"><strong>To:</strong> dev@dehub.io</p>
              <p className="mb-4"><strong>Subject:</strong> Account deletion</p>
              <p className="mb-2">Hello DeHub team,</p>
              <p className="mb-4">Please delete my DeHub account and associated data.</p>
              <p className="mb-1">Username: &lt;your-username&gt;</p>
              <p className="mb-1">Email: &lt;email-linked-to-account&gt;</p>
              <p className="mb-1">Wallet address: &lt;0x...&gt;</p>
              <p className="mb-4">Reason (optional): &lt;reason&gt;</p>
              <p className="mb-4">I understand this is irreversible.</p>
              <p>Thank you,</p>
            </div>
          </div>

          <div>
            <h3 className="text-sm font-medium mb-1">Data deletion (keep account)</h3>
            <div className="bg-white/10 p-2 rounded-lg font-mono text-[10px] text-white/90">
              <p className="mb-2"><strong>To:</strong> dev@dehub.io</p>
              <p className="mb-4"><strong>Subject:</strong> Data deletion</p>
              <p className="mb-2">Hello DeHub team,</p>
              <p className="mb-4">Please delete the following data from my account while keeping my account active:</p>
              <p className="mb-1">- &lt;e.g., profile info&gt;</p>
              <p className="mb-4">- &lt;e.g., off-chain activity such as likes/comments&gt;</p>
              <p className="mb-1">Username: &lt;your-username&gt;</p>
              <p className="mb-1">Email: &lt;email-linked-to-account&gt;</p>
              <p className="mb-4">Wallet address: &lt;0x...&gt;</p>
              <p>Thank you,</p>
            </div>
          </div>
        </section>

        <section className="mb-3">
          <h2 className="text-base font-semibold mb-2">Contact</h2>
          <p className="text-xs text-white/80">
            Email: <a href="mailto:dev@dehub.io" className="text-white hover:underline">dev@dehub.io</a>
          </p>
        </section>

        <div className="border-t border-white/20 pt-2">
          <p className="text-[10px] text-white/70 italic">
            <strong>Note:</strong> DeHub operates with blockchain technology. On‑chain records are public and immutable. 
            While we can remove app-side references, we cannot alter or delete blockchain data.
          </p>
        </div>
      </div>
      </div>
    </>
  );
};

export default DeleteAccount;
