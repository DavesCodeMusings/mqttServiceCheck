# mqttServiceMonitor
Publish network service status to MQTT for monitoring by home automation software.

## What is it?

MQTT Service Check checks the availability of network services and publishes its findings in [MQTT](https://en.wikipedia.org/wiki/MQTT).

## Why would anybody do that?

The goal of MQTT Service Check is to allow basic monitoring of home network services through a standard integration with a home automation system like Home Assistant. There are other programs that do this already. I was happily using Statping for a while. I created this for better integration with Home Assistant.

## How does it work?

The Node.js program called serviceCheck.js attempts to verify all the services listed in its config.json. It publishes the status of each service as an MQTT topic. By default the message in each topic is either ON or OFF. That's it. It's up to the home automation software to periodically read the MQTT topics and make decisions based on their state.

The simplest scenario is to create a dashboard that shows the status of various devices on the network.

## Show me an example, already.

The default configuration, config-default.json, is set up to monitor SSH, Web, and DNS services on the localhost, as well as one external web site. You'll probably need to change the MQTT credentials, but otherwise the basic service checks should work as-is.

To install:
1. Copy serviceCheck.js and config-default.json to your server.
2. Using config-default.json as a guide, create a customized config.json to monitor your network devices.
3. Change permissions on serviceCheck.js to make it executable with the command `chmod +x serviceCheck.js`

To test:
1. Start in debug mode with the command `./serviceCheck.js -d`
2. Use another program to listen to the MQTT topics.
3. After verifying everything is working as expected, exit serviceCheck.js with CTRL+C.

To monitor services:
1. Run as a background process with the command `nohup ./serviceCheck.js &`
2. Use `cat nohup.out` to check the startup messages.

To shut it down:
1. Find the process ID using `ps -eo pid,cmd | grep serviceCheck.js  | grep -v grep`
2. Kill the process using `kill PID`; where PID is the process ID returned in the previous step.

