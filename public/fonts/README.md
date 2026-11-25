# Fonts

`material-symbols-outlined-subset.woff2` is Google's Material Symbols Outlined variable font (all four axes kept: FILL, GRAD, opsz, wght), cut down to the icon names the app's source mentions (about 360 of 4,300). The full font is 4 MB; this one is about 330 KB.

When a new icon name is added to the code, rebuild the file: list the icon names the code uses, then request the font from Google Fonts with `&icon_names=<sorted, comma-separated names>` added to the usual `css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200` address, and save the woff2 file that CSS points to. The test `src/lib/icon-font-subset.test.ts` fails when the code uses an icon name the file does not contain.
