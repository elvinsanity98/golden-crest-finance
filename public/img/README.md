# Brand image assets

Drop these image files into this folder (`public/img/`) with these **exact filenames**.
The app references them directly; until they exist, the site shows graceful
fallbacks (a gold "GC" badge / the CEO's initials).

| Filename | What it is | Recommended |
|---|---|---|
| `gc-icon.png` | Gold shield GC icon only (transparent background) | square, 256×256+ PNG |
| `logo-horizontal.png` | Primary horizontal logo (shield + "GOLDEN CREST FINANCE") | transparent PNG, ~1000px wide |
| `logo-stacked.png` | Secondary stacked logo | transparent PNG |
| `ceo-marvin.jpg` | Photo of Marvin Dionaldo Trinidad (President/CEO) | square-ish JPG, 600×600+ |

After adding them:
```
git add public/img/*.png public/img/*.jpg
git commit -m "Add brand image assets"
git push
```
Vercel and Render will redeploy and the real logos/photo will appear everywhere.

> Note: `.gitignore` does **not** exclude this folder, so committed images deploy normally.
