const fs = require('node:fs');
const path = require('node:path');

const { validateStacks } = require('../helpers/config');
const { plural } = require('../helpers/format');

const root = path.resolve(__dirname, '..');
const files =
  process.argv.length > 2
    ? process.argv.slice(2)
    : fs
        .readdirSync(path.join(root, 'stacks'))
        .filter((name) => name.endsWith('.js'))
        .map((name) => path.join('stacks', name));

let failed = false;

files.forEach((file) => {
  let errors;
  let stacks;
  try {
    stacks = require(path.resolve(root, file));
    errors = validateStacks(stacks);
  } catch (err) {
    errors = [`could not be loaded: ${err.message}`];
  }

  if (errors.length > 0) {
    failed = true;
    console.error(`${file}:\n${errors.map((error) => `  - ${error}`).join('\n')}`);
  } else {
    console.log(`${file}: no problems found in ${plural(stacks.length, 'stack')}`);
  }
});

process.exitCode = failed ? 1 : 0;
