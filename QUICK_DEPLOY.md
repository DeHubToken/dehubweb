# 🚀 DeHub SSR/SEO - Quick Deployment Guide

## ✅ Files Created

1. **`netlify/edge-functions/seo-handler.js`** - Edge function for bot detection and SSR
2. **`netlify.toml`** - Netlify configuration
3. **`NETLIFY_SSR_SETUP_GUIDE.md`** - Detailed setup guide

---

## 🎯 Quick Deploy Steps

### 1️⃣ Verify Supabase Function

```bash
# Check if ssr-seo function is deployed
supabase functions list

# If not deployed, deploy it:
supabase functions deploy ssr-seo
```

### 2️⃣ Commit and Push

```bash
# Add new files
git add netlify/ netlify.toml

# Commit
git commit -m "Add Netlify Edge Functions for SSR/SEO"

# Push to main branch
git push origin main
```

### 3️⃣ Netlify Auto-Deploy

Netlify will automatically:
- Detect the new `netlify.toml` file
- Deploy the edge function
- Apply the configuration

**Monitor deployment:**
1. Go to [Netlify Dashboard](https://app.netlify.com/)
2. Select your site: `dehubio-lovable`
3. Check **Deploys** tab for status

---

## 🧪 Testing

### Test with Bot User-Agent

```bash
# Test profile page
curl -H "User-Agent: twitterbot" https://dehub.io/@testuser

# Test post page
curl -H "User-Agent: facebookexternalhit" https://dehub.io/post/123
```

**Expected:** HTML with proper `<meta>` tags

### Test with Normal User-Agent

```bash
curl -H "User-Agent: Mozilla/5.0" https://dehub.io/@testuser
```

**Expected:** Normal React app HTML

---

## 📊 Check Logs

### Netlify Edge Function Logs

1. [Netlify Dashboard](https://app.netlify.com/)
2. Your site → **Functions** tab
3. **Edge Functions** → `seo-handler`
4. View **Logs**

### Supabase Function Logs

```bash
# Real-time logs
supabase functions logs ssr-seo --tail

# Last hour
supabase functions logs ssr-seo --since 1h
```

---

## 🔍 Verify Social Media Previews

Test your URLs on these platforms:

1. **[Social Share Preview](https://socialsharepreview.com/)**
   - Enter: `https://dehub.io/@yourusername`

2. **[OpenGraph.xyz](https://www.opengraph.xyz)**
   - Test meta tags

3. **[Twitter Card Validator](https://cards-dev.twitter.com/validator)**
   - Check Twitter preview

4. **[Facebook Debugger](https://developers.facebook.com/tools/debug/)**
   - Check Facebook preview

---

## 🐛 Common Issues

### Issue: Edge function not working

**Check:**
```bash
# Verify netlify.toml is in project root
ls netlify.toml

# Verify edge function file exists
ls netlify/edge-functions/seo-handler.js
```

### Issue: Meta tags not showing

**Debug:**
1. Check Supabase function is responding:
   ```bash
   curl "https://aigxuutjaqsywioxjefr.supabase.co/functions/v1/ssr-seo?path=/@testuser"
   ```

2. Check edge function logs in Netlify Dashboard

### Issue: Deployment failed

**Fix:**
1. Check Netlify deploy logs
2. Verify `netlify.toml` syntax
3. Ensure all files are committed

---

## 📝 Configuration Details

### Current Setup

- **Domain:** `dehub.io` (Netlify DNS)
- **Main Site:** `dehubio-lovable.netlify.app`
- **Edge Function:** `seo-handler.js`
- **Supabase Function:** `ssr-seo`

### Bot Detection

Detects these user agents:
- Twitter (twitterbot)
- Facebook (facebookexternalhit)
- Telegram (TelegramBot)
- LinkedIn (linkedinbot)
- WhatsApp
- Discord
- Google (googlebot)
- Bing (bingbot)

### Paths Handled

- **Profiles:** `/@username`
- **Posts:** `/post/:id`
- **Videos:** `/video/:id`

---

## ✨ Success Indicators

✅ Netlify deployment successful  
✅ Edge function appears in Netlify Dashboard  
✅ Bot requests return HTML with meta tags  
✅ Normal requests return React app  
✅ Social media previews working  

---

## 🎉 Next Steps

1. **Test on actual social media:**
   - Share a profile link on Twitter
   - Share a post link on Telegram
   - Verify rich previews appear

2. **Monitor performance:**
   - Check Netlify Analytics
   - Monitor edge function invocations
   - Watch for errors

3. **Optimize:**
   - Adjust cache duration if needed
   - Add more bot user agents if required
   - Fine-tune meta tag content

---

## 📞 Support

**Netlify Support:**
- [Netlify Docs](https://docs.netlify.com/)
- [Edge Functions Guide](https://docs.netlify.com/edge-functions/overview/)

**Supabase Support:**
- [Edge Functions Docs](https://supabase.com/docs/guides/functions)

---

**Last Updated:** February 10, 2026  
**Version:** 1.0
