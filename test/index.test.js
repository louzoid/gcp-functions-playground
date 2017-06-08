//for our unit tests.

'use strict';

const Buffer = require('safe-buffer').Buffer;
const proxyquire = require(`proxyquire`).noCallThru();
const sinon = require(`sinon`);
const test = require(`ava`);
const tools = require(`@google-cloud/nodejs-repo-tools`);

//going to need to mock the Braintree gateway
//how about pubsub?  More research needed on this...

test.todo('braintreeToken');
test.todo('braintreeDonation');

//will be nice to do some integration tests too.