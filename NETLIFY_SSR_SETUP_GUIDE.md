# 🚀 Netlify Edge Functions Setup Guide for DeHub SSR/SEO

यह guide आपको step-by-step बताएगी कि कैसे Netlify Edge Functions को setup करें DeHub के लिए dynamic SEO/SSR के साथ।

**Important:** आपका domain `dehub.io` Netlify पर hosted है, इसलिए हम Cloudflare Workers की जगह **Netlify Edge Functions** use करेंगे।

---

## 📋 Prerequisites

- Netlify account (आपके पास पहले से है)
- Domain `dehub.io` Netlify पर configured है ✅
- Supabase Edge Function `ssr-seo` deployed होना चाहिए

---

## 🔧 Step 1: Supabase Edge Function Deploy करें

पहले check करें कि SSR function deployed है या नहीं:

```bash
# Supabase में login करें
supabase login

# Function deploy करें
supabase functions deploy ssr-seo

# Verify करें
supabase functions list
```

---

## 📁 Step 2: Netlify Edge Function बनाएं

### 2.1 Project में Netlify Edge Functions Folder बनाएं

```bash
# Project root में
mkdir netlify
mkdir netlify/edge-functions
```

### 2.2 Edge Function File बनाएं

File: `netlify/edge-functions/seo-handler.js` बनाएं

---

## 🌐 Step 3: Netlify Configuration File बनाएं

File: `netlify.toml` (project root में)

---

## ✅ Step 4: Deploy करें

### 4.1 Git में Changes Commit करें

```bash
git add netlify/ netlify.toml
git commit -m "Add Netlify Edge Functions for SSR/SEO"
git push origin main
```

### 4.2 Netlify Auto-Deploy

Netlify automatically detect करेगा और deploy कर देगा।

---

## 🧪 Step 5: Testing और Verification

### 5.1 Bot User-Agent से Test करें

```bash
# Twitter bot simulate करें
curl -H "User-Agent: twitterbot" https://dehub.io/@testuser

# Facebook bot simulate करें
curl -H "User-Agent: facebookexternalhit" https://dehub.io/@testuser

# Telegram bot simulate करें
curl -H "User-Agent: TelegramBot" https://dehub.io/@testuser
```

### 5.2 Netlify Dashboard में Logs Check करें

1. [Netlify Dashboard](https://app.netlify.com/) पर जाएं
2. अपनी site (`dehubio-lovable`) select करें
3. **Functions** tab पर जाएं
4. **Edge Functions** section में `seo-handler` देखें
5. Logs check करें

---

## 🐛 Troubleshooting

### Issue 1: Edge Function काम नहीं कर रहा

**Solution:**
```bash
# Local testing के लिए Netlify CLI install करें
npm install -g netlify-cli

# Local dev server चलाएं
netlify dev

# Test करें
curl -H "User-Agent: twitterbot" http://localhost:8888/@testuser
```

### Issue 2: Meta Tags नहीं दिख रहे

**Check करें:**
1. Supabase function logs:
   ```bash
   supabase functions logs ssr-seo --tail
   ```

2. Netlify function logs:
   - Dashboard > Functions > Edge Functions > Logs

---

## 📊 Monitoring

### Netlify Analytics

1. Netlify Dashboard > Site > Analytics
2. Functions tab में Edge Function metrics देखें:
   - Invocations
   - Errors
   - Response time

---

## 🎯 Performance Tips

1. **Caching:**
   - Edge Function में cache headers add करें
   - Bot responses को 1 hour cache करें

2. **Rate Limiting:**
   - Netlify के built-in rate limiting use करें

---

## ✨ Success Checklist

- [ ] Supabase Edge Function deployed
- [ ] `netlify/edge-functions/seo-handler.js` created
- [ ] `netlify.toml` configured
- [ ] Changes committed और pushed
- [ ] Netlify auto-deploy successful
- [ ] Bot user-agent test passed
- [ ] Social media preview working

---

## 🆘 Need Help?

**Netlify Logs:**
```
Dashboard > Site > Functions > Edge Functions > seo-handler > Logs
```

**Supabase Logs:**
```bash
supabase functions logs ssr-seo --tail
```

**Test Command:**
```bash
curl -I -H "User-Agent: twitterbot" https://dehub.io/@testuser
```

---

## 🎉 Done!

अब आपका DeHub application Netlify Edge Functions के साथ properly configured है! 🚀
