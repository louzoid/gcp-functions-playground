/**
 * Copyright 2016, Google, Inc.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

'use strict';

const braintree = require('braintree');
const PubSub = require('@google-cloud/pubsub');
const Buffer = require('safe-buffer').Buffer;
var config = require("./config-test.json");

//bit of fun
const Slack = require('node-slackr');

const gateway = braintree.connect({
    environment: braintree.Environment.Sandbox,
    merchantId: config.merchantId,
    publicKey: config.publicKey,
    privateKey: config.privateKey
});

//gcloud beta functions deploy helloGET --stage-bucket [YOUR_STAGING_BUCKET_NAME] --trigger-http
exports.braintreeToken = function braintreeToken(req, res) {

    res.set('Access-Control-Allow-Origin', "*");
    res.set('Access-Control-Allow-Methods', 'GET, POST');

    console.log("Getting a token from merchant id (test):" + config.merchantId);

    gateway.clientToken.generate({}, function (err, response) {
        if (err) {
            res.send(400, err);
        } else {
            res.set("Content-Type", "application/json");
            res.send(response);
        }
    });
};

exports.braintreeDonation = function braintreeDonation(req, res) {

    res.set('Access-Control-Allow-Origin', "*");
    res.set('Access-Control-Allow-Methods', 'GET, POST');

    var amount = req.body.amount;
    var fn = req.body.firstname;
    var ln = req.body.lastname;
    var email = req.body.email;
    //var contact = req.body.contactEmailOptIn;
    //var ga = req.body.giftAid;
    var nonce = req.body.payment_method_nonce;

    if (!amount || amount === "" || amount === 0) {
        amount = 10;
    }

    console.log("Submitting a donation to merchant id:" + config.merchantId);

    gateway.transaction.sale({
        amount: amount,
        //orderId: "ALZ00001",
        customer: {
            firstName: fn,
            lastName: ln,
            email: email
        },
        //customFields: {
        //    contactemailoptin: contact,
        //    giftaid: ga
        //},
        paymentMethodNonce: nonce,
        options: {
            submitForSettlement: true
        }
    }, function (err, result) {
        if (err) {
            console.log(err);
            res.send(400, "Payment gateway didn't like that :(");
        } else {
            //take a look at the actual result https://developers.braintreepayments.com/reference/general/result-objects/node
            if (result.success) {
                // Everything is ok
                console.log("Transaction created with id: " + result.transaction.id);
                var data = { transaction: result, headers: req.headers };
                publishDonationMessage(data);
                res.status(200).end();
            }
            else {
                //whats up?
                //var issues = result.errors.deepErrors();
                console.log(result.message);
                res.status(400).send(result.message);
            }
        }
    });
};

 //-- these subscriptions would go a seperate package in real life init

//Deplouy with pubsub as trigger gcloud alpha functions deploy subscribe --stage-bucket YOUR_BUCKET_NAME --trigger-topic YOUR_TOPIC_NAME
exports.donationSubscriber = function donationsSubscriber(event, callback) {
    const pubsubMessage = event.data;

    //throw new Error('Oops that didnt work');
    // We're just going to log the message to prove that it worked!
    console.log(Buffer.from(pubsubMessage.data, 'base64').toString());

    // Don't forget to call the callback!
    // But can't tell it it didn't work as GCP doesn't support this at the moment.  Looks like pull/own push endpoint is the way to go...
    // https://stackoverflow.com/questions/43941315/google-cloud-functions-to-only-ack-pub-sub-on-success
    //const error = new Error('no workie');
    //error.code = 405;
    //callback(error);
    callback();
};

exports.donationSubscriberSlackNotifier = function donationSubscriberSlackNotifier(event, callback) {
    const pubsubMessage = event.data;
    var st = Buffer.from(pubsubMessage.data, 'base64').toString();
    //console.log(st);

    var data = JSON.parse(st);
    var ms = "A new donation has happened but I could not get details from pubsub message";
    if (data.data.message && data.data.message.transaction) {
        var trans = data.data.message.transaction.transaction;
        ms = "A new donation of " + trans.amount + " has been made from " + trans.customer.email;
    }
    
    var messages = {
        text: ms,
        channel: config.slackChannel
    }

    var slack = new Slack(config.slackHookUrl);
    slack.notify(messages, function (err, result) {
        console.log(err, result);
        // Don't forget to call the callback!
        callback();
    });
    
};

// do before: gcloud beta pubsub topics create YOUR_TOPIC_NAME
function publishDonationMessage(messageBody) {
    const pubsub = PubSub();
    const topicName = "New-Donations-Topic";
    const topic = pubsub.topic(topicName);

    const message = {
        data: {
            message: messageBody
        }
    };

    return topic.publish(message)
        .then((results) => {
            const messageIds = results[0];
            console.log("Message " + messageIds[0] + " published.");
        });
}
