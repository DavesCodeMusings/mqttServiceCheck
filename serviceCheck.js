#!/usr/bin/env node

const fs = require('fs');
const net = require('net');
const dns = require('dns');
const http = require('http');
const https = require('https');
const mqtt = require('mqtt');  // This one comes from NPM. Install with the command 'npm -i mqtt'.

var debug = false;
var configFile = 'config.json';
var config = { };
const timeout = 2500;

/*
* readCommandLine - process parameters passed when starting the program.
*/
function readCommandLine() {
  // argv[0] is 'node'. argv[1] is the name of this program. argv[2] is the start of options.
  if (process.argv.indexOf('-d') > 1)
    debug = true;

  if (process.argv.indexOf('-c') > 1)
    configFile = process.argv[process.argv.indexOf('-c') + 1];
}

/*
* readConfig - get the list of services to be checked from an external JSON configuration file.
*/
function readConfig() {
  if (debug)
    console.log(`Reading configuration from ${configFile}`);
  try {
    config = JSON.parse(fs.readFileSync(configFile));
  }
  catch (error) {
    console.error(`${error}.\nUsing config-default.json instead.`);
    config = JSON.parse(fs.readFileSync('config-default.json'));
  }
  if (debug) console.log(`Read the following configuration:\n${JSON.stringify(config, null, 2)}`);

  // Provide default values for the mundane details.
  if (!config.statusMsg) {
    config.statusMsg = {
      'success': 'ON',
      'failure': 'OFF'
    };
    if (debug) console.log(`After adding configuration defaults:\n${JSON.stringify(config, null, 2)}`);
  }
}


function publishStatus(serviceName, status) {
  if (debug) console.log(`Publishing to server: ${config.mqttConnect.url}, topic: ${config.mqttConnect.topicRoot}/${serviceName}, message: ${status}`);
  let mqttClient = mqtt.connect(config.mqttConnect.url, { username: config.mqttConnect.username, password: config.mqttConnect.password });
  mqttClient.on('connect', () => {
    mqttClient.publish(`${config.mqttConnect.topicRoot}/${serviceName}`, status);
    mqttClient.end();
  });
  mqttClient.on('error', (err) => {
    console.log(`Error connecting to ${config.mqttConnect.url}:\n${err}`);
  });
}

function dnsCheck(name, host) {
  dns.resolve(host, 'A', (err, addresses) => {
    if (debug)
      console.log(`DNS check for '${host}' returned: ${addresses}`);
    if (!err)
      publishStatus(name, config.statusMsg.success);
    else
      publishStatus(name, config.statusMsg.failure);
  });
}

function httpCheck(name, host, port, resource) {
    const httpRequest = http.get(`http://${host}:${port}${resource}`, (response) => {
      if (debug)
        console.log(`HTTP check for http://${host}:${port}${resource} returned: ${response.statusCode}`);
      if (response.statusCode < 400)
        publishStatus(name, config.statusMsg.success);
      else
        publishStatus(name, config.statusMsg.failure);
    });
    httpRequest.on('error', (err) => {
      publishStatus(name, config.statusMsg.failure);
    });

}

function httpsCheck(name, host, port, resource) {
  const httpsRequest = https.get(`https://${host}:${port}${resource}`, (response) => {
    if (debug)
      console.log(`HTTPS check for http://${host}:${port}${resource} returned: ${response.statusCode}`);
    if (response.statusCode < 400)
      publishStatus(name, config.statusMsg.success);
    else
      publishStatus(name, config.statusMsg.failure);
  });
  httpsRequest.on('error', (err) => {
    publishStatus(name, config.statusMsg.failure);
  });
}

function tcpCheck(name, host, port) {
  const tcpSocket = new net.Socket();
  tcpSocket.setTimeout(timeout);
  tcpSocket.on('connect', () => {
    tcpSocket.destroy();
    if (debug)
      console.log(`TCP check for ${host}:${port} connected.`);
    publishStatus(name, config.statusMsg.success);
  });
  tcpSocket.on('timeout', (err) => {
    if (debug)
      console.log(`TCP check for ${host}:${port} timed out.`);
    publishStatus(name, config.statusMsg.failure);
  });
  tcpSocket.on('error', (err) => {
    if (debug)
      console.log(`TCP check for ${host}:${port} could not connect.`);
    publishStatus(name, config.statusMsg.failure);
  });
  tcpSocket.connect(port, host);
}

readCommandLine();
readConfig();

config.services.forEach((serviceCheck) => {

  // Specific test for DNS resolution. Tries to resolve host using the local machine's DNS config.
  if (String(serviceCheck.protocol).includes('dns')) {
    dnsCheck(serviceCheck.name, serviceCheck.host);
  }

  // Unencrypted web site. Tries to connect to http://host:port/resource and reports OK on status below 400.
  // See https://en.wikipedia.org/wiki/List_of_HTTP_status_codes for more about HTTP status codes.
  else if (serviceCheck.protocol == 'http') {
    if (!serviceCheck.port) serviceCheck.port = 80;
    if (!serviceCheck.resource) serviceCheck.resource = '/';
    httpCheck(serviceCheck.name, serviceCheck.host, serviceCheck.port, serviceCheck.resource);
  }

  // Encrypted web site. Similar to unencrypted, except... wait for it... encrypted.
  else if (serviceCheck.protocol == 'https') {
    if (!serviceCheck.port) serviceCheck.port = 443;
    if (!serviceCheck.resource) serviceCheck.resource = '/';
    httpsCheck(serviceCheck.name, serviceCheck.host, serviceCheck.port, serviceCheck.resource);
  }

  // Generic TCP check. Tries to make a connection and reports the result.
  else if (String(serviceCheck.protocol).includes('tcp')) {
    tcpCheck(serviceCheck.name, serviceCheck.host, serviceCheck.port);
  }
});
