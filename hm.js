
module.exports = function(RED) {
	var xmlrpc = require('homematic-xmlrpc');
	var ip = require('ip');
	var killable = require('killable');
	var crypto = require('crypto');

    function homematicBridge(config) {
        RED.nodes.createNode(this,config);
        var node = this;

        node.on('close', function(done) {

		    clearInterval(keepAliveInterval);
		    
		    initRemoteService();
		    rpcServer.httpServer.kill(function() {  
		        node.log("RPC server stopped...");
		        done();
		    }); 
		});
        
                
        if (config.localIpAddress === undefined || config.localIpAddress === '') {
        	node.rpcListenIp = ip.address();
        	node.log("Auto detected IP address: " + node.rpcListenIp);
        }
        else {
        	node.rpcListenIp = config.localIpAddress;
        	node.log("Config IP address: " + node.rpcListenIp);
        }
        
		node.rpcListenPort = config.localRpcPort;
		node.remoteHostIp = config.hostName;
		node.remoteHostPort = config.hostPort;

		var clientToken = crypto.randomBytes(8).toString('hex');
		var rpcClient;
		var rpcServer;
		var lastTouch = 0;
		var methods = {
			event: function (err, params) {
				//node.log('RPC call -hm_event- ');

				var topic = "hm_event";
				var payload = {};
				payload.ccuId = params[0];
				payload.deviceId = params[1];
				payload.measurement = params[2];
				payload.value = params[3];

				var result = {};
				result.topic = topic;
				result.payload = payload;
				node.send(result);
				return '';
			},
			newDevices: function (err, params) {
				//node.log('RPC call -newDevices- recvieved');
				
				var result = {};
				result.topic = "hm_newDevices";
				result.payload = params;

				node.send(result);
				return '';
			}
		};


		function initRemoteService(listenerPrefix, reinit) {

			if (listenerPrefix === undefined) {
		        
		        listenerId = "";
		    }
		    else {
		    	if (reinit === undefined) {
		    		node.status({fill:"yellow",shape:"ring",text:"send init() to " + node.remoteHostIp});
		    	}
		    	else {
		    		node.status({fill:"blue",shape:"ring",text:"reinit() at " + node.remoteHostIp});
		    	}
		    	listenerId = listenerPrefix + "-" + clientToken;
		    } 

			
			getRpcClient().methodCall('init', ['http://' + node.rpcListenIp + ':' + node.rpcListenPort, listenerId], function (err, data) { 
					
					if (err) {
						node.warn("1. " + err);
						node.status({fill:"red",shape:"dot",text:"init() failed at " + node.remoteHostIp});
					}
					else {
						node.status({fill:"green",shape:"ring",text:"Listening for HM events"});
					}
				});
			node.log('RPC >>> ' + node.remoteHostIp + ':' + node.remoteHostPort + ' init ' + JSON.stringify(['http://' + node.rpcListenIp + ':' + node.rpcListenPort, listenerId]));
		}
		
		
		function initRpcServer() {
			rpcServerStarted =  true;
			rpcServer = xmlrpc.createServer({ host: node.rpcListenIp, port: node.rpcListenPort });

			killable(rpcServer.httpServer);
			node.log( '>>> XML-RPC server listens on ' + node.rpcListenIp + ':' + (node.rpcListenPort) );
	  
			rpcServer.on('system.multicall', function(method, params, callback) {
				var response = [];
				for (var i = 0; i < params[0].length; i++) {
					if (methods[params[0][i].methodName]) {
						response.push(methods[params[0][i].methodName](null, params[0][i].params));
					} else {
						response.push('');
					}
				}
				callback(null, response);
			});

			rpcServer.on('event', function(err, params, callback) {
				
				callback(null, methods.event(err, params));
			});

			rpcServer.on('newDevices', function(err, params, callback) {
				callback(null, methods.newDevices(err, params));
			});

		}


		function getRpcClient() {

			var NewRpcClient = xmlrpc.createClient({host: node.remoteHostIp, port: node.remoteHostPort, path: '/'});
			return NewRpcClient;
		}


		function rpcPing() {
			
			getRpcClient().methodCall('ping', [listenerId], function (err, data) { 
					if (err) {
						node.warn("HM Ping failed: " + err);
						//node.warn("2. " + err.res && err.res.statusCode);
						node.status({fill:"red",shape:"dot",text:"Ping failed at " + node.remoteHostIp});
					}
					else {
						node.log("PING successfull: " + data);
					}
				});
		}


    	function keepAlive() {
    		rpcPing();
    		node.log( (new Date()).getTime() );
    	}


    	function initModule() {
    		initRpcServer();
			initRemoteService("hmm");
			keepAliveInterval = setInterval(keepAlive, 60000);
    	}
		
    	/*** init ***/
		initModule();
    }

    RED.nodes.registerType( "hm", homematicBridge );
}