echo -e "\nCreating the server bundle\n"
npx webpack --config=server/webpack.config.js

echo -e "\nBundling the client browser bin ...\n"
rm -rf ../public/bin
npx webpack --config=client/webpack.config.js --env url="__PP_URL__"
echo -e "\nPacking the client module main ...\n"
rm -rf dist
npx rollup -c ./client/rollup.config.js

cd rust
npm pack
RUSTPKGVER="$(grep version package.json | sed 's/.*"version": "\(.*\)".*/\1/')"

cd ../server
echo -e "\nInstalling @stjude/proteinpaint-rust ...\n"
npm install rust/stjude-proteinpaint-rust-$RUSTPKGVER.tgz
cd ..

mv package.json package.json.bak
./build/full/editpkgjson.js > package.json
npm pack 
rm package.json
mv package.json.bak package.json
mv stjude-proteinpaint-*.tgz stjude-proteinpaint.tgz
