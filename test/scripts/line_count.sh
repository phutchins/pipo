find ./* -type f -not \( -path "./node_modules/*" -prune \) -not \( -path "./public/css/*" -prune \) -not \( -path "./bower_components/*" -prune \) -not \( -path "./log/*" -prune \)  -not \( -path "./public/js/lib/*" -prune \) -not \( -path "./openpgp.*" -prune \) -type f -print
0 | xargs -0 wc -l
