#!/usr/bin/env node

// Set to true for console logging.
const debug = false;

const net = require('net');
const dns = require('dns');
const http = require('http');
const https = require('https');
const mqtt = require('mqtt');

// ON and OFF matches the specification for Home Assistant MQTT Binary Sensors.
const statusMsg = {
  'success': 'ON',
  'failure': 'OFF'
}

const mqttServer = {
  'url': 'mqtt://uno.home',
  'username': 'username',
  'password': 'password',
  'topicRoot': 'Network Monitor'
};

const services = [
  { 'name': 'SSH', 'host': '127.0.0.1', 'protocol': 'tcp', 'port': 22 },
  { 'name': 'Nginx', 'host': '127.0.0.1', 'protocol': 'http' },
  { 'name': 'Portainer', 'host': '127.0.0.1', 'protocol': 'http', 'port': 9000 },
  { 'name': 'DNS', 'host': 'localhost', 'protocol': 'dns' },
  { 'name': 'Router', 'host': '127.0.0.1', 'protocol': 'http' }
];

const timeout = 2500;

function publishStatus(serviceName, status) {
  if (debug) console.log(`Publishing to server: ${mqttServer.url}, topic: ${mqttServer.topicRoot}/${serviceName}, message: ${status}`);
  let mqttClient = mqtt.connect(mqttServer.url, { username: mqttServer.username, password: mqttServer.password });
  mqttClient.on('connect', () => {
    mqttClient.publish(`${mqttServer.topicRoot}/${serviceName}`, status);
    mqttClient.end();
  });
  mqttClient.on('error', (err) => {
    console.log(`Error connecting to ${mqttServer.url}:\n${err}`);
  });
}

services.forEach((serviceCheck) => {

  // Specific test for DNS resolution. Tries to resolve host using the local machine's DNS config.
  if (String(serviceCheck.protocol).includes('dns')) {
    dns.resolve(serviceCheck.host, 'A', (err, addresses) => {
      if (!err)
        publishStatus(serviceCheck.name, statusMsg.success);
      else
        publishStatus(serviceCheck.name, statusMsg.failure);
    });
  }

  // Unencrypted web site. Tries to connect to http://host:port/resource and reports OK on status below 400.
  // See https://en.wikipedia.org/wiki/List_of_HTTP_status_codes for more about HTTP status codes.
  else if (serviceCheck.protocol == 'http') {
    if (!serviceCheck.port) serviceCheck.port = 80;
    if (!serviceCheck.resource) serviceCheck.resource = '/';
    const httpRequest = http.get(`http://${serviceCheck.host}:${serviceCheck.port}${serviceCheck.resource}`, (result) => {
      if (result.statusCode < 400)
        publishStatus(serviceCheck.name, statusMsg.success);
      else
        publishStatus(serviceCheck.name, statusMsg.failure);
    });
    httpRequest.on('error', (err) => {
      publishStatus(serviceCheck.name, statusMsg.failure);
    });
  }

  // Encrypted web site. Similar to unencrypted, except... wait for it... encrypted.
  else if (serviceCheck.protocol == 'https') {
    if (!serviceCheck.port) serviceCheck.port = 443;
    if (!serviceCheck.resource) serviceCheck.resource = '/';
    const httpsRequest = https.get(`https://${serviceCheck.host}:${serviceCheck.port}${serviceCheck.resource}`, (result) => {
      if (result.statusCode < 400)
        publishStatus(serviceCheck.name, statusMsg.success);
      else
        publishStatus(serviceCheck.name, statusMsg.failure);
    });
    httpsRequest.on('error', (err) => {
      publishStatus(serviceCheck.name, statusMsg.failure);
    });
  }

  // Generic TCP check. Tries to make a connection and reports the result.
  else if (String(serviceCheck.protocol).includes('tcp')) {
    const tcpSocket = new net.Socket();
    tcpSocket.setTimeout(timeout);
    tcpSocket.on('connect', () => {
      publishStatus(serviceCheck.name, statusMsg.success);
      tcpSocket.destroy();
    });
    tcpSocket.on('timeout', (err) => {
      publishStatus(serviceCheck.name, statusMsg.failure);
    });
    tcpSocket.on('error', (err) => {
      publishStatus(serviceCheck.name, statusMsg.failure);
    });
    tcpSocket.connect(serviceCheck.port, serviceCheck.host);
  }
});
