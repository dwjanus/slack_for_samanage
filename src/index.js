
'use strict';

const express = require('express');
const proxy = require('express-http-proxy');
const bodyParser = require('body-parser');
const _ = require('lodash');
const https = require('https');
const config = require('./config');
const commands = require('./commands');
const helpCommand = require('./commands/help');
const util = require('util');
const request = require('request');
var path_to_access_token = "https://slack.com/api/oauth.access?client_id=" +
  process.env.CLIENT_ID + "&client_secret=" + process.env.CLIENT_SECRET +
  "&code="; //Slack URL to call to receive accessToken
var client = require('redis').createClient(process.env.REDIS_URL);

let bot = require('./bot');
let app = express();

if (config('PROXY_URI')) {
  app.use(proxy(config('PROXY_URI'), {
    forwardPath: (req, res) => { return require('url').parse(req.url).path }
  }));
}

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.get('/', (req, res) => {
  res.send('<a href="https://slack.com/oauth/authorize?scope=incoming-webhook,'
    + 'commands,bot&client_id=64177576980.78861190246"><img alt="Add to Slack" '
    + 'height="40" width="139" src="https://platform.slack-edge.com/img/add_to_slack.png" '
    + 'srcset="https://platform.slack-edge.com/img/add_to_slack.png 1x,'
    + 'https://platform.slack-edge.com/img/add_to_slack@2x.png 2x" /></a>');
});

app.get('/auth', (req, res) => {
  var url = req.url;
  var codePos = url.indexOf("code="); //index where code starts in the url
  var codeStart = codePos + 5; //we dont want the 'code=' part
  var codeEnd = url.indexOf("&"); //we dont need anything else
  var accessCode = url.substring(codeStart, codeEnd).toString(); //put it all together

  // Verify user accepted auth request
  if (codePos > -1) {
    var completePath = path_to_access_token + accessCode; //Slack API call
    request(completePath, (err, response, body) => {
      if (!err && response.statusCode == 200) {
        var teamInfo = JSON.parse(body);
        // save the ACCESS_CODE
        console.log(util.inspect(teamInfo) + '\n');
        client.set("SLACK_TOKEN", teamInfo.access_token);
        client.set("WEBHOOK_URL", teamInfo.incoming_webhook.url);
        client.set("SAMANAGE_COMMAND_TOKEN", teamInfo.command.token);
      } else {
        // Error
      }
    });
  } else {
    // Reroute user back to install page, they denied auth
  }
});

app.post('/commands/samanage', (req, res) => {
  let payload = req.body;

  if (!payload || payload.token !== (config('SAMANAGE_COMMAND_TOKEN') || client.get('SAMANAGE_COMMAND_TOKEN'))) {
    let err = '✋  Dowhatnow? An invalid slash token was provided\n' +
              '   Is your Slack slash token correctly configured?';
    console.log(err);
    res.status(401).end(err);
    return;
  }

  let cmd = _.reduce(commands, (a, cmd) => {
    return payload.text.match(cmd.pattern) ? cmd : a
  }, helpCommand);

  cmd.handler(payload, res);
});

app.post('/action', (req, res) => {
  let payload = req.body;
  console.log(util.inspect(payload) + '\n');
  res.set('Content-Type', 'application/json');
  res.status(200).json('Button Clicked!');
});

app.listen(config('PORT'), (err) => {
  if (err) throw err;

  console.log(`\n🚀 Samanagebot LIVES on PORT ${config('PORT')} 🚀`);

  if (config('SLACK_TOKEN')) {
    console.log(`🤖  beep boop: @samanage is real-time\n`);
    bot.listen({ token: config('SLACK_TOKEN') });
  }
});

