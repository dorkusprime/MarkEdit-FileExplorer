#!/bin/zsh
# Creates test-fixture/: a small tree exercising sorting, compact folders,
# excludes, dimmed files and text bundles. Open it with:
#   bin/markedit-explorer open-folder test-fixture
set -euo pipefail
cd "$(dirname "$0")/.."
F=test-fixture
rm -rf $F
mkdir -p $F/docs/guides $F/src/vs/base/common $F/notes "$F/Empty Folder" $F/.git $F/Book.textbundle
print "# Readme" > $F/README.md
print '{}' > $F/package.json
touch $F/.DS_Store $F/.env $F/image.png $F/diagram.mmd $F/paper.tex $F/todo.txt \
  $F/notes/todo.md $F/notes/Ideas.md $F/notes/idea10.md $F/notes/idea2.md \
  $F/docs/guides/setup.md $F/docs/intro.md $F/src/vs/base/common/strings.ts $F/src/index.ts \
  $F/Book.textbundle/text.md $F/Book.textbundle/info.json
echo "Created $F/"
