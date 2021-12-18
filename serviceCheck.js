#!/usr/bin/env node

/**
 * Periodic status check of network services with results published to an MQTT server.
 * @author David Horton - https://github.com/DavesCodeMusings/
 */
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

/**
 * Process command-line parameters for debugging and alternate config file options.
 */
function readCommandLine() {
  // argv[0] is 'node'. argv[1] is the name of this program. argv[2] is the start of options.
  if (process.argv.indexOf('-d') > 1)
    debug = true;

  if (process.argv.indexOf('-c') > 1)
    configFile = process.argv[process.argv.indexOf('-c') + 1];
}

/**
 * Get the list of services to be checked from an external JSON configuration file.
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
  if (!config.payload) {
    config.payload = {
      'success': 'ON',
      'failure': 'OFF'
    };
    if (debug) console.log(`After adding configuration defaults:\n${JSON.stringify(config, null, 2)}`);
  }
}

/**
 * Send mmessages to Home Assistant's auto-discovery topic.
 */
function publishDiscovery() {
  let mqttClient = mqtt.connect(config.mqttConnect.url, { username: config.mqttConnect.username, password: config.mqttConnect.password });
  mqttClient.on('connect', () => {
    config.services.forEach((serviceCheck) => {
      let discoveryTopic = `${config.mqttConnect.discoveryPrefix}/${config.mqttConnect.statePrefix}/${serviceCheck.name}/config`;
      let discoveryPayload = {
        "name": serviceCheck.name,
        "device_class": "running",
        "state_topic": `${config.mqttConnect.statePrefix}/${serviceCheck.name}`
      };
      if (debug) console.log(`Publishing discovery topic: ${discoveryTopic}\n${JSON.stringify(discoveryPayload, null, 2)}`);
      mqttClient.publish(discoveryTopic, JSON.stringify(discoveryPayload), { retain: true });
    });
    mqttClient.end();
  });
  mqttClient.on('error', (err) => {
    console.log(`Error connecting to ${config.mqttConnect.url}:\n${err}`);
  });
}

/**
 * Send a message about a service state to an MQTT topic.
 *
 * @param {string} serviceName  Part of the MQTT topic indicating the service being reported.
 * @param {string} state       The MQTT message descibing the state of the service.
 */
function publishState(serviceName, state) {
  if (debug) console.log(`Publishing to server: ${config.mqttConnect.url}, topic: ${config.mqttConnect.statePrefix}/${serviceName}, message: ${state}`);
  let mqttClient = mqtt.connect(config.mqttConnect.url, { username: config.mqttConnect.username, password: config.mqttConnect.password });
  mqttClient.on('connect', () => {
    mqttClient.publish(`${config.mqttConnect.statePrefix}/${serviceName}`, state);
    mqttClient.end();
  });
  mqttClient.on('error', (err) => {
    console.log(`Error connecting to ${config.mqttConnect.url}:\n${err}`);
  });
}

/**
 * Perform a DNS lookup and report the result.
 * @param {string} name  A friendly name given to the service check. Used when reporting to MQTT.
 * @param {string} host  The hostname to lookup (or IP address for checking reverse lookups.)
 */
function dnsCheck(name, host) {
  dns.resolve(host, 'A', (err, addresses) => {
    if (debug)
      console.log(`DNS check for '${host}' returned: ${addresses}`);
    if (!err)
      publishState(name, config.payload.success);
    else
      publishState(name, config.payload.failure);
  });
}

/**
 * Connect to an HTTP server and report the result.
 * @param {string} name  A friendly name given to the service check.
 * @param {string} host  The server's hostname or IP address.
 * @param {number} port  The TCP port number the server listens on.
 * @param {string} path  The directory and file name portion of the URL (e.g. /index.html)
 */
function httpCheck(name, host, port, path) {
  const httpRequest = http.get(`http://${host}:${port}${path}`, (response) => {
    if (debug)
      console.log(`HTTP check for http://${host}:${port}${path} returned: ${response.statusCode}`);
    if (response.statusCode < 400)
      publishState(name, config.payload.success);
    else
      publishState(name, config.payload.failure);
  });
  httpRequest.on('data', (chunk) => {
    let data = chunk;  // Read and throw away.
  });
  httpRequest.on('close', () => {
    httpRequest.end();
  });
  httpRequest.on('error', (err) => {
    publishState(name, config.payload.failure);
    httpRequest.end();
  });
}

/**
 * Connect to an SSL enabled HTTP server and report the result.
 * @param {string} name  A friendly name given to the service check.
 * @param {string} host  The server's hostname or IP address.
 * @param {number} port  The TCP port number the server listens on.
 * @param {string} path  The directory and file name portion of the URL (e.g. /index.html)
 */
function httpsCheck(name, host, port, path) {
  const httpsRequest = https.get(`https://${host}:${port}${path}`, (response) => {
    if (debug)
      console.log(`HTTPS check for http://${host}:${port}${path} returned: ${response.statusCode}`);
    if (response.statusCode < 400)
      publishState(name, config.payload.success);
    else
      publishState(name, config.payload.failure);
  });
  httpsRequest.on('data', (chunk) => {
    let data = chunk;  // Read and throw away.
  });
  httpsRequest.on('close', () => {
    httpsRequest.end();
  });
  httpsRequest.on('error', (err) => {
    publishState(name, config.payload.failure);
    httpsRequest.end();
  });
}

/**
 * Connect to a generic TCP port and report if the attempt was successful.
 * @param {string} name      A friendly name given to the service check.
 * @param {string} host      The server's hostname or IP address.
 * @param {number} port      The TCP port number the server listens on.
*/
function tcpCheck(name, host, port) {
  const tcpSocket = new net.Socket();
  tcpSocket.setTimeout(timeout);
  tcpSocket.on('connect', () => {
    tcpSocket.destroy();
    if (debug)
      console.log(`TCP check for ${host}:${port} connected successfully.`);
    publishState(name, config.payload.success);
  });
  tcpSocket.on('timeout', (err) => {
    if (debug)
      console.log(`TCP check for ${host}:${port} timed out.`);
    publishState(name, config.payload.failure);
  });
  tcpSocket.on('error', (err) => {
    if (debug)
      console.log(`TCP check for ${host}:${port} could not connect.`);
    publishState(name, config.payload.failure);
  });
  tcpSocket.connect(port, host);
}

readCommandLine();
readConfig();
if (config.mqttConnect.discoveryPrefix) {
  console.log(`Publishing discovery topics to: ${config.mqttConnect.discoveryPrefix}`);
  publishDiscovery();
}

console.log(`Publishing state topics to: ${config.mqttConnect.statePrefix}`);
config.services.forEach((serviceCheck) => {
  if (!serviceCheck.interval) serviceCheck.interval = 300;  // in seconds

  // Specific test for DNS resolution. Tries to resolve host using the local machine's DNS config.
  if (String(serviceCheck.protocol).includes('dns')) {
    console.log(`Scheduling DNS check for ${serviceCheck.host} every ${serviceCheck.interval} seconds as MQTT topic ${config.mqttConnect.statePrefix}/${serviceCheck.name}.`);
    setInterval(dnsCheck, serviceCheck.interval * 1000, serviceCheck.name, serviceCheck.host);
  }

  // Unencrypted web site. Tries to connect to http://host:port/path and reports OK on status below 400.
  // See https://en.wikipedia.org/wiki/List_of_HTTP_status_codes for more about HTTP status codes.
  else if (serviceCheck.protocol == 'http') {
    if (!serviceCheck.port) serviceCheck.port = 80;
    if (!serviceCheck.path) serviceCheck.path = '/';
    console.log(`Scheduling HTTP check for ${serviceCheck.host}:${serviceCheck.port}${serviceCheck.path} every ${serviceCheck.interval} seconds as MQTT topic ${config.mqttConnect.statePrefix}/${serviceCheck.name}.`);
    setInterval(httpCheck, serviceCheck.interval * 1000, serviceCheck.name, serviceCheck.host, serviceCheck.port, serviceCheck.path);
  }

  // Encrypted web site. Similar to unencrypted, except... wait for it... encrypted.
  else if (serviceCheck.protocol == 'https') {
    if (!serviceCheck.port) serviceCheck.port = 443;
    if (!serviceCheck.path) serviceCheck.path = '/';
    console.log(`Scheduling HTTPS check for ${serviceCheck.host}:${serviceCheck.port}${serviceCheck.path} every ${serviceCheck.interval} seconds as MQTT topic ${config.mqttConnect.statePrefix}/${serviceCheck.name}.`);
    setInterval(httpsCheck, serviceCheck.interval * 1000, serviceCheck.name, serviceCheck.host, serviceCheck.port, serviceCheck.path);
  }

  // Generic TCP check. Tries to make a connection and reports the result.
  else if (String(serviceCheck.protocol).includes('tcp')) {
    console.log(`Scheduling TCP check for ${serviceCheck.host}:${serviceCheck.port} every ${serviceCheck.interval} seconds as MQTT topic ${config.mqttConnect.statePrefix}/${serviceCheck.name}.`);
    setInterval(tcpCheck, serviceCheck.interval * 1000, serviceCheck.name, serviceCheck.host, serviceCheck.port);
  }
});
