# Proteinpaint

a genomics visualization tool for exploring a cohort's genotype and phenotype data


## Usage

Follow the [example project setup](https://github.com/stjude/pp-dist).


## Develop

Clone this repository

```bash
git clone git@github.com:stjude/proteinpaint.git
cd proteinpaint
npm run sethooks
```

As needed, follow the [installation instructions](https://docs.google.com/document/d/1tkEHG_vYtT-OifPV-tlPeWQUMsEd3aWAKf5ExOT8G34/edit)

`npm run dev` rebundles backend and frontend code

`npm start` restarts the proteinpaint server

`npm test` tests both frontend and backend code

`npm run test-browser` bundles the front-end spec files for use at localhost:[port]/testrun.html

`./scripts/deploy.sh [env]` builds and deploys the bundled code to internal SJ hosts

`./build/target.sh dev` builds a Docker image and runs a containerized server, but using the public/bin bundles from `npm run dev`


## Build

Follow the [build instructions](https://docs.google.com/document/d/13gUdU9UrHFkdspcQgc6ToRZJsrdFM4LCwCg7g1SQc4Q/edit#heading=h.yadk67y2jbx4).
