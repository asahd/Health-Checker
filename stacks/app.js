const appCheck = {
  method: 'POST',
  path: '/data',
  body: [],
  timeoutSecs: 2,
  slowSecs: 1,
};

const stacks = [
  // +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
  // +           US East (N. Virginia) [us-east-1]           +
  // +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
  //                                  _          __
  //                                 | |        /  |
  //   _   _ ___ ______ ___  __ _ ___| |_ ______`| |
  //  | | | / __|______/ _ \/ _` / __| __|______|| |
  //  | |_| \__ \     |  __/ (_| \__ \ |_       _| |_
  //   \__,_|___/      \___|\__,_|___/\__|      \___/
  //
  //
  {
    ...appCheck,
    stackId: 'stack-one',
    baseURL: 'stack-one.example.org',
    authorizationEnv: 'STACK_ONE_AUTHORIZATION',
  },
  {
    ...appCheck,
    stackId: 'stack-two',
    baseURL: 'stack-two.example.org',
  },
];

module.exports = stacks;
