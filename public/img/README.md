# Brand image assets

Drop these image files into this folder (`public/img/`) with these **exact filenames**.
The app references them directly; until they exist, the site shows graceful
fallbacks (a gold "GC" badge / the CEO's initials).

| Filename | What it is |
|---|---|
| `gc-icon.png` | Gold shield GC icon (used in topbar/login, on a white tile) |
| `logo-horizontal.png` | Primary horizontal logo (shield + "GOLDEN CREST FINANCE") |
| `ceo-marvin.jpg` | Photo of Marvin Dionaldo Trinidad (President/CEO) |

(A stacked logo isn't required — the About page shows the icon mark as the secondary.)

After adding them:
```
git add public/img/*.png public/img/*.jpg
git commit -m "Add brand image assets"
git push
```
Vercel and Render will redeploy and the real logos/photo will appear everywhere.

> Note: `.gitignore` does **not** exclude this folder, so committed images deploy normally.
