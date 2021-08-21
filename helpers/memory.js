const memory = {};

const addToMemory = (key, value) => {
  memory[key] = value;
};

const existsInMemory = (key) => typeof memory[key] !== 'undefined';

const removeFromMemory = (key) => {
  delete memory[key];
};

module.exports = { addToMemory, existsInMemory, removeFromMemory };
