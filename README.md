# mqttServiceMonitor
Publish network service status to MQTT for monitoring by home automation software.

## What is it?

MQTT Service Check checks the availability of network services and publishes its findings in [MQTT](https://en.wikipedia.org/wiki/MQTT).

## Why would anybody do that?

The goal of MQTT Service Check is to allow basic monitoring of home network services through a standard integration with a home automation system like Home Assistant. There are other programs that do this already. I was happily using Statping for a while. I create this for better integration with Home Assistant.

## How does it work?

The Node.js program called serviceCheck.js attempts to verify all the services listed in its config.json. It publishes the status of each service as an MQTT topic. By default the message in each topic is either ON or OFF. That's it. It's up to the home automation software to periodically read the MQTT topics and make decisions based on their state.

The simplest scenario is to create a dashboard that shows the status of various devices on the network.

## Show me an example, already.

The default configuration, config-default.json, is set up to monitor SSH, Web, and DNS services on the localhost. It also connects to the MQTT server on localhost with the supplied credentials. You'll probably need to change the credential, but the service checks should work as-is.
