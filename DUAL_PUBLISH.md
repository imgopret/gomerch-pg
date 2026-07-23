# Dual Publish Guide - NPM & GitHub Packages

Package `gomerch-pg` dapat di-publish ke dua registry sekaligus:
1. **NPM** - https://www.npmjs.com/package/gomerch-pg
2. **GitHub Packages** - https://github.com/imgopret/gomerch-pg/packages

---

## Option 1: Automatic Publish (via GitHub Actions)

### Setup Sekali Saja:

#### 1. Create NPM Access Token
1. Login ke https://www.npmjs.com/
2. Go to: https://www.npmjs.com/settings/imgopret/tokens
3. Click "Generate New Token" → "Classic Token"
4. Choose "Automation" (can bypass 2FA for CI/CD)
5. Copy token

#### 2. Add NPM Token ke GitHub Secrets
1. Go to: https://github.com/imgopret/gomerch-pg/settings/secrets/actions
2. Click "New repository secret"
3. Name: `NPM_TOKEN`
4. Value: Paste your NPM token
5. Click "Add secret"

### Cara Publish:

Setiap kali create release di GitHub, package otomatis di-publish ke NPM dan GitHub Packages!

```bash
# 1. Update version di package.json
npm version patch  # atau minor, major

# 2. Commit & push
git add package.json package-lock.json
git commit -m "chore: bump version to vX.X.X"
git push origin main

# 3. Create release via GitHub CLI
gh release create vX.X.X --title "vX.X.X - Release Title" --notes "Release notes here"

# DONE! GitHub Actions akan otomatis:
# - Run tests
# - Build package
# - Publish ke NPM
# - Publish ke GitHub Packages
```

---

## Option 2: Manual Publish

### Publish ke NPM

```bash
# 1. Build
npm run build

# 2. Test
npm test

# 3. Publish (requires 2FA OTP)
npm publish --otp=123456
# Replace 123456 with OTP from authenticator app
```

**Result:**
- NPM: https://www.npmjs.com/package/gomerch-pg
- Install: `npm install gomerch-pg`

---

### Publish ke GitHub Packages

#### Setup (Sekali Saja):

1. **Create GitHub Personal Access Token:**
   - Go to: https://github.com/settings/tokens/new
   - Name: "Publish to GitHub Packages"
   - Expiration: No expiration (or custom)
   - Scopes: Check `write:packages` + `read:packages`
   - Click "Generate token"
   - Copy token

2. **Login to GitHub Packages:**
   ```bash
   npm login --scope=@imgopret --registry=https://npm.pkg.github.com
   # Username: imgopret
   # Password: YOUR_GITHUB_TOKEN (paste the token above)
   # Email: your@email.com
   ```

#### Publish:

```bash
# 1. Build
npm run build

# 2. Publish to GitHub Packages
npm publish --registry=https://npm.pkg.github.com
```

**Result:**
- GitHub Packages: https://github.com/imgopret/gomerch-pg/packages
- Install: See below

---

## How Users Install

### From NPM (Public, No Auth Required):
```bash
npm install gomerch-pg
```

### From GitHub Packages (Requires GitHub Auth):

#### 1. Create GitHub PAT:
- Go to: https://github.com/settings/tokens/new
- Scopes: `read:packages`
- Generate token

#### 2. Setup `.npmrc` in project:
```bash
# Add to ~/.npmrc or project/.npmrc
@imgopret:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=YOUR_GITHUB_TOKEN
```

#### 3. Install:
```bash
npm install gomerch-pg
```

---

## Comparison

| Aspect | NPM | GitHub Packages |
|--------|-----|-----------------|
| **Public Install** | ✅ No auth needed | ❌ Requires GitHub token |
| **Discoverability** | ✅ npmjs.com search | ❌ Limited |
| **Download Stats** | ✅ Weekly stats | ✅ In GitHub repo |
| **Private Packages** | ❌ Paid ($7/month) | ✅ Free unlimited |
| **Integration** | ✅ All tools | ⚠️ Some tools |
| **Setup Users** | ✅ Zero config | ❌ Need .npmrc + token |

---

## Recommendation

**For Public Packages (like gomerch-pg):**
- ✅ **NPM** - Primary (easier for users)
- ✅ **GitHub Packages** - Secondary (backup + GitHub integration)

**For Private Packages:**
- ✅ **GitHub Packages** - Primary (free unlimited)
- ❌ **NPM** - Expensive ($7/month)

---

## Current Setup

This repo is configured for dual publish:

### Files:
- ✅ `.github/workflows/publish.yml` - Auto-publish on release
- ✅ `.npmrc` - GitHub Packages registry config
- ✅ `package.json` - Correct metadata

### Secrets Needed:
- ⏳ `NPM_TOKEN` - For NPM publish (add to GitHub Secrets)
- ✅ `GITHUB_TOKEN` - Auto-provided by GitHub Actions

---

## Quick Publish Now (Manual)

### 1. NPM (Requires 2FA):
```bash
npm publish --otp=123456
```

### 2. GitHub Packages (Requires GitHub Token):
```bash
# First time: login
npm login --scope=@imgopret --registry=https://npm.pkg.github.com

# Then publish
npm publish --registry=https://npm.pkg.github.com
```

---

## Troubleshooting

### Error: "403 Forbidden - Two-factor authentication required"
**Solution:** Use `npm publish --otp=YOUR_OTP`

### Error: "Package already published"
**Solution:** Bump version in package.json and try again

### Error: "401 Unauthorized" (GitHub Packages)
**Solution:** Check your GitHub token has `write:packages` scope

### Error: "Cannot publish over existing version"
**Solution:** Increment version: `npm version patch`

---

## Next Steps

1. ✅ GitHub Actions workflow created
2. ⏳ Add NPM_TOKEN to GitHub Secrets
3. ⏳ Create GitHub Release (will auto-publish)
4. OR: Manual publish to both registries

**Need help? Check:** https://github.com/imgopret/gomerch-pg/issues
